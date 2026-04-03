/**
 * Cliente HTTP para la API de Groq (chat completions + tools).
 * Capa de infraestructura: no contiene lógica de negocio.
 */

async function requestGroq(payload, apiKey) {
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('[ERROR GROQ] Fallo explícito de la API:', JSON.stringify(data, null, 2));
    throw new Error(data.error?.message || 'Error desconocido de Groq');
  }

  const message = data?.choices?.[0]?.message;
  if (!message) {
    throw new Error('La respuesta de Groq no contiene message en choices[0].');
  }

  return message;
}

/**
 * Llama a la API de Groq con el sistema de prompts dinámico.
 */
async function callAI(systemPrompt, userMessage, options = {}) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error('Llave de Groq (GROQ_API_KEY) no configurada en .env');
  }

  const payload = {
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: typeof options.temperature === 'number' ? options.temperature : 0.7,
  };

  try {
    const message = await requestGroq(payload, apiKey);
    return typeof message.content === 'string' ? message.content : '';
  } catch (error) {
    console.error('[ERROR GROQ] Excepción general:', error.message);
    throw error;
  }
}

/**
 * Llama a Groq con soporte de tools/function-calling.
 */
async function callAIWithTools(systemPrompt, messages, tools = [], options = {}) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error('Llave de Groq (GROQ_API_KEY) no configurada en .env');
  }

  const payload = {
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
    temperature: typeof options.temperature === 'number' ? options.temperature : 0.3,
  };

  if (Array.isArray(tools) && tools.length > 0) {
    payload.tools = tools;
    payload.tool_choice = 'auto';
  }

  try {
    return await requestGroq(payload, apiKey);
  } catch (error) {
    console.error('[ERROR GROQ] Excepción general:', error.message);
    throw error;
  }
}

module.exports = { callAI, callAIWithTools };
