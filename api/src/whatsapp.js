/**
 * Envía un mensaje de texto por WhatsApp con la API de Meta.
 */
async function sendWhatsAppMessage(to, text) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;

  if (!token || !phoneId) {
    console.error('[ERROR] Faltan variables WHATSAPP en .env');
    return;
  }

  const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: false, body: text },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[ERROR WA] Fallo enviando mensaje Meta:', JSON.stringify(data, null, 2));
    } else {
      console.log(`[EXITO WA] Enviado a ${to}. MSG_ID: ${data.messages[0].id}`);
    }
  } catch (error) {
    console.error('[ERROR WA] Excepción de red:', error.message);
  }
}

module.exports = { sendWhatsAppMessage };
