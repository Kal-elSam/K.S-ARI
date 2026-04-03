const { updateConversationState, updateConversationContext } = require('./conversation');
const { buildSystemPrompt, buildServiciosTextoParaPrompt } = require('../businessConfig');
const { callAIWithTools } = require('../groq');
const { sendWhatsAppMessage } = require('./whatsapp');
const {
  getAvailableSlots,
  findNextAvailableDay,
  createCalendarEvent,
  confirmCalendarEvent,
} = require('../booking/googleCalendar');
const {
  buildISOWithOffset,
  formatDateDDMMYYYY,
  getTodayInTimezone,
  parseISODateToUTCNoon,
} = require('../booking/bookingHelpers');

const BOOKING_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'check_availability',
      description: 'Consulta los horarios disponibles en el calendario para una fecha específica',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Fecha en formato YYYY-MM-DD',
          },
        },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'book_appointment',
      description: 'Agenda una cita en el calendario cuando el cliente confirmó fecha y hora',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Fecha en formato YYYY-MM-DD',
          },
          time: {
            type: 'string',
            description: 'Hora en formato HH:MM',
          },
          service: {
            type: 'string',
            description: 'Nombre del servicio que el cliente quiere',
          },
        },
        required: ['date', 'time', 'service'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_message',
      description: 'Envía un mensaje al cliente',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'El mensaje a enviar',
          },
        },
        required: ['message'],
      },
    },
  },
];

function normalizeSpanishText(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isNewBusinessQuestion(userMessage) {
  if (!userMessage) return false;
  if (userMessage.includes('?') || userMessage.includes('¿')) return true;

  const normalizedMessage = normalizeSpanishText(userMessage);
  const questionKeywords = ['que', 'cuanto', 'como', 'cual', 'tienen', 'ofrecen', 'precio', 'costo', 'informacion'];
  return questionKeywords.some((keyword) => new RegExp(`\\b${keyword}\\b`, 'i').test(normalizedMessage));
}

function toPlainToolCall(toolCall) {
  return {
    id: toolCall.id,
    type: toolCall.type,
    function: {
      name: toolCall.function?.name || '',
      arguments: toolCall.function?.arguments || '{}',
    },
  };
}

function normalizeHistoryMessage(message) {
  if (!message || typeof message !== 'object') return null;
  if (message.role === 'user') {
    return {
      role: 'user',
      content: typeof message.content === 'string' ? message.content : '',
    };
  }
  if (message.role === 'assistant') {
    const normalized = {
      role: 'assistant',
      content: typeof message.content === 'string' ? message.content : '',
    };
    if (Array.isArray(message.tool_calls) && message.tool_calls.length > 0) {
      normalized.tool_calls = message.tool_calls.map(toPlainToolCall);
    }
    return normalized;
  }
  if (message.role === 'tool') {
    return {
      role: 'tool',
      tool_call_id: typeof message.tool_call_id === 'string' ? message.tool_call_id : '',
      content: typeof message.content === 'string' ? message.content : '',
    };
  }
  return null;
}

function trimHistory(messages) {
  return messages
    .map(normalizeHistoryMessage)
    .filter(Boolean)
    .slice(-10);
}

function isValidISODate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function isValidHHMM(time) {
  return typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

function buildBookingSystemPrompt(config) {
  const serviciosTexto = buildServiciosTextoParaPrompt(config.services);
  return `Eres ARI, asistente de ${config.name}.
Ayudas a agendar citas de manera natural y conversacional.
Hoy es ${formatDateDDMMYYYY(getTodayInTimezone())}.

SERVICIOS:
${serviciosTexto}
HORARIO: ${config.start_hour}:00 a ${config.end_hour}:00 hrs

INSTRUCCIONES:
- Cuando el cliente quiera agendar, pregunta qué día le queda mejor
- Usa check_availability para ver horarios reales antes de ofrecerlos
- Cuando el cliente confirme fecha y hora, usa book_appointment
- Si no hay disponibilidad un día, ofrece el siguiente disponible
- Sé natural y conversacional, no uses listas numeradas innecesariamente
- Si el cliente cambia de día, vuelve a consultar disponibilidad
- Confirma la cita con fecha y hora exacta antes de agendar
- Responde siempre en español
- Nunca inventes horarios o servicios`;
}

function buildToolMessage(content, toolCallId) {
  return {
    role: 'tool',
    tool_call_id: toolCallId,
    content,
  };
}

async function executeBookingTool(toolCall, toolArgs, executionContext) {
  const { convId, from, businessId } = executionContext;
  const toolName = toolCall.function?.name;

  if (toolName === 'check_availability') {
    if (!isValidISODate(toolArgs.date)) {
      return 'Error: la fecha debe estar en formato YYYY-MM-DD.';
    }

    const targetDate = parseISODateToUTCNoon(toolArgs.date);
    const slots = await getAvailableSlots(businessId, targetDate);
    if (slots.length > 0) {
      return `Slots disponibles el ${toolArgs.date}: ${slots.slice(0, 5).map((slot) => slot.start).join(', ')}`;
    }

    const nextDay = await findNextAvailableDay(businessId, toolArgs.date);
    if (!nextDay) {
      return 'Sin disponibilidad en los próximos 14 días.';
    }

    return `Sin disponibilidad el ${toolArgs.date}. Siguiente día disponible: ${nextDay.fecha} con slots: ${nextDay.slots.slice(0, 5).map((slot) => slot.start).join(', ')}`;
  }

  if (toolName === 'book_appointment') {
    const { date, time, service } = toolArgs;
    if (!isValidISODate(date)) {
      return 'Error: la fecha debe estar en formato YYYY-MM-DD.';
    }
    if (!isValidHHMM(time)) {
      return 'Error: la hora debe estar en formato HH:MM.';
    }
    if (!service || typeof service !== 'string') {
      return 'Error: el servicio es obligatorio para agendar.';
    }

    const dayDate = parseISODateToUTCNoon(date);
    const slots = await getAvailableSlots(businessId, dayDate);
    const timeAvailable = slots.some((slot) => slot.start === time);
    if (!timeAvailable) {
      return `Error: el horario ${time} ya no está disponible para el ${date}.`;
    }

    const [hourPart, minutePart] = time.split(':').map(Number);
    const endHour = (hourPart + 1) % 24;
    const endTime = `${String(endHour).padStart(2, '0')}:${String(minutePart).padStart(2, '0')}`;
    const startISO = buildISOWithOffset(date, time);
    const endISO = buildISOWithOffset(date, endTime);

    try {
      const eventId = await createCalendarEvent(businessId, from, service, startISO, endISO);
      await confirmCalendarEvent(businessId, eventId, service, from);

      await updateConversationState(convId, 'BOOKED');
      await updateConversationContext(convId, {
        eventId,
        horarioConfirmado: time,
        fechaReserva: date,
        esperandoDia: false,
        slotsOfrecidos: [],
        fechaTexto: '',
        chatHistory: [],
      });

      executionContext.appointmentBooked = true;
      return `Cita agendada exitosamente. EventId: ${eventId}`;
    } catch (error) {
      return `Error al agendar: ${error.message}`;
    }
  }

  if (toolName === 'send_message') {
    const message = typeof toolArgs.message === 'string' ? toolArgs.message.trim() : '';
    if (!message) {
      return 'Error: message es obligatorio para send_message.';
    }
    await sendWhatsAppMessage(from, message);
    executionContext.sentViaTool = true;
    executionContext.lastToolMessage = message;
    return 'Mensaje enviado al cliente.';
  }

  return `Error: herramienta "${toolName}" no soportada.`;
}

async function handleBookingFlow(convId, from, businessId, context, userMessage, config) {
  try {
    const history = trimHistory(Array.isArray(context.chatHistory) ? context.chatHistory : []);
    const baseMessages = [...history, { role: 'user', content: userMessage }];
    const systemPrompt = buildBookingSystemPrompt(config);
    const executionContext = {
      convId,
      from,
      businessId,
      sentViaTool: false,
      lastToolMessage: '',
      appointmentBooked: false,
    };

    let workingMessages = [...baseMessages];
    let finalAssistantMessage = null;

    for (let step = 0; step < 5; step += 1) {
      const aiMessage = await callAIWithTools(systemPrompt, workingMessages, BOOKING_TOOLS, { temperature: 0.3 });
      const hasToolCalls = Array.isArray(aiMessage.tool_calls) && aiMessage.tool_calls.length > 0;

      if (!hasToolCalls) {
        finalAssistantMessage = normalizeHistoryMessage({
          role: 'assistant',
          content: typeof aiMessage.content === 'string' ? aiMessage.content : '',
        });
        if (finalAssistantMessage) {
          workingMessages.push(finalAssistantMessage);
        }
        break;
      }

      const assistantWithTools = normalizeHistoryMessage({
        role: 'assistant',
        content: typeof aiMessage.content === 'string' ? aiMessage.content : '',
        tool_calls: aiMessage.tool_calls.map(toPlainToolCall),
      });
      if (assistantWithTools) {
        workingMessages.push(assistantWithTools);
      }

      for (const toolCall of aiMessage.tool_calls) {
        let args = {};
        try {
          args = JSON.parse(toolCall.function?.arguments || '{}');
        } catch {
          const invalidArgsMessage = buildToolMessage(
            'Error: argumentos inválidos para la herramienta (JSON no parseable).',
            toolCall.id
          );
          workingMessages.push(invalidArgsMessage);
          continue;
        }

        let toolResult = '';
        try {
          toolResult = await executeBookingTool(toolCall, args, executionContext);
        } catch (error) {
          toolResult = `Error interno ejecutando herramienta: ${error.message}`;
        }

        workingMessages.push(buildToolMessage(toolResult, toolCall.id));
      }
    }

    const finalText = finalAssistantMessage?.content || '';
    if (!executionContext.sentViaTool && finalText.trim()) {
      await sendWhatsAppMessage(from, finalText);
    }

    if (!executionContext.appointmentBooked) {
      await updateConversationContext(convId, {
        chatHistory: trimHistory(workingMessages),
      });
    }
  } catch (error) {
    console.error('[BOOKING FLOW] Error:', error.message);
    await sendWhatsAppMessage(from, 'En este momento no pude procesar tu solicitud de agenda. Intenta nuevamente en un momento.');
  }
}

async function handleGeneralState(convId, from, businessId, currentState, context, userMessage) {
  try {
    const promptState = currentState === 'BOOKED' && isNewBusinessQuestion(userMessage)
      ? 'QUALIFYING'
      : currentState;
    const systemPrompt = await buildSystemPrompt(businessId, promptState);
    const history = trimHistory(Array.isArray(context.chatHistory) ? context.chatHistory : []);
    const messages = [...history, { role: 'user', content: userMessage }];

    console.log('🧠 Consultando a Groq llama-3.3-70b-versatile...');
    const aiMessage = await callAIWithTools(systemPrompt, messages, [], { temperature: 0.7 });
    let aiResponse = typeof aiMessage.content === 'string' ? aiMessage.content : '';

    if (currentState === 'NEW_LEAD') {
      console.log('🔄 Estado avanza: NEW_LEAD → QUALIFYING');
      await updateConversationState(convId, 'QUALIFYING');
    } else if (currentState === 'QUALIFYING' && aiResponse.includes('READY_TO_BOOK')) {
      console.log('🔄 Estado avanza: QUALIFYING → READY_TO_BOOK');
      aiResponse = aiResponse.replace('READY_TO_BOOK', '').trim();
      await updateConversationState(convId, 'READY_TO_BOOK');
    }

    const finalResponse = aiResponse || 'Claro, cuéntame un poco más para ayudarte mejor.';
    const nextHistory = trimHistory([
      ...messages,
      { role: 'assistant', content: finalResponse },
    ]);
    await updateConversationContext(convId, { chatHistory: nextHistory });

    console.log(`🤖 A: "${finalResponse}"`);
    await sendWhatsAppMessage(from, finalResponse);
  } catch (error) {
    console.error('[GENERAL FLOW] Error:', error.message);
    await sendWhatsAppMessage(from, 'En este momento no puedo procesar tu mensaje, intenta en unos minutos.');
  }
}

module.exports = {
  handleBookingFlow,
  handleGeneralState,
};
