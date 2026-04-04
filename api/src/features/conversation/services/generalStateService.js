const { updateConversationState, updateConversationContext } = require('../../../whatsapp/conversation');
const { buildSystemPrompt } = require('../../../businessConfig');
const { callAIWithTools } = require('../../../infrastructure/groqClient');
const { sendWhatsAppMessage } = require('../../../whatsapp/whatsapp');
const { trimHistory } = require('../../../shared/ai/chatHistory');
const { pool } = require('../../../core/db');

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

/**
 * Estados generales (NEW_LEAD, QUALIFYING, BOOKED, etc.) con historial en contexto.
 */
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

    const nombreMatch = aiResponse.match(/\[NOMBRE:([^\]]+)\]/);
    if (nombreMatch) {
      const clientName = nombreMatch[1].trim();
      if (clientName) {
        await updateConversationContext(convId, { clientName });
        await pool.query(
          'UPDATE conversations SET client_name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [clientName, convId]
        );
      }
      aiResponse = aiResponse.replace(/\[NOMBRE:[^\]]+\]/, '').trim();
    }

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

module.exports = { handleGeneralState, isNewBusinessQuestion };
