/**
 * Llama a la API de Groq con el sistema de prompts dinámico.
 */
async function callAI(systemPrompt, userMessage, options = {}) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error('Llave de Groq (GROQ_API_KEY) no configurada en .env');
  }

  const url = 'https://api.groq.com/openai/v1/chat/completions';

  const payload = {
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    temperature: typeof options.temperature === 'number' ? options.temperature : 0.7,
  };

  try {
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

    return data.choices[0].message.content;
  } catch (error) {
    console.error('[ERROR GROQ] Excepción general:', error.message);
    throw error;
  }
}

module.exports = { callAI };
