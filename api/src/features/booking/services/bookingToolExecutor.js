const { updateConversationState, updateConversationContext } = require('../../../whatsapp/conversation');
const { sendWhatsAppMessage } = require('../../../whatsapp/whatsapp');
const {
  getAvailableSlots,
  findNextAvailableDay,
  createCalendarEvent,
  confirmCalendarEvent,
} = require('../../../booking/googleCalendar');
const { buildISOWithOffset, parseISODateToUTCNoon } = require('../../../booking/bookingHelpers');

function isValidISODate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function isValidHHMM(time) {
  return typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

function buildToolMessage(content, toolCallId) {
  return {
    role: 'tool',
    tool_call_id: toolCallId,
    content,
  };
}

/**
 * Ejecuta una tool del flujo de agendamiento y devuelve texto para el rol `tool`.
 */
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

module.exports = {
  isValidISODate,
  isValidHHMM,
  buildToolMessage,
  executeBookingTool,
};
