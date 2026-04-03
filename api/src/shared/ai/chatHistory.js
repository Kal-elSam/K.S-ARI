/**
 * Normalización y recorte del historial para Groq (roles user / assistant / tool).
 */

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

/** Mantiene como máximo los últimos 10 mensajes válidos para la API. */
function trimHistory(messages) {
  return messages
    .map(normalizeHistoryMessage)
    .filter(Boolean)
    .slice(-10);
}

module.exports = {
  toPlainToolCall,
  normalizeHistoryMessage,
  trimHistory,
};
