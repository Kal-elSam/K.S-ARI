const { updateConversationContext } = require('../../../whatsapp/conversation');
const { sendWhatsAppMessage } = require('../../../whatsapp/whatsapp');
const { callAIWithTools } = require('../../../groq');
const { trimHistory, normalizeHistoryMessage, toPlainToolCall } = require('../../../shared/ai/chatHistory');
const { BOOKING_TOOLS } = require('./bookingTools');
const { buildBookingSystemPrompt } = require('./bookingPrompt');
const { buildToolMessage, executeBookingTool } = require('./bookingToolExecutor');

const MAX_TOOL_ROUNDS = 5;

/**
 * Flujo READY_TO_BOOK: IA + tools (disponibilidad, reserva, mensaje).
 */
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

    for (let step = 0; step < MAX_TOOL_ROUNDS; step += 1) {
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
          workingMessages.push(
            buildToolMessage('Error: argumentos inválidos para la herramienta (JSON no parseable).', toolCall.id)
          );
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

module.exports = { handleBookingFlow };
