const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware para parsear el body en formato JSON
app.use(express.json());

/**
 * Función para enviar un mensaje de texto utilizando la API de WhatsApp Business de Meta.
 * Hace uso de fetch nativo (disponible en Node.js 18+).
 *
 * @param {string} to - Número de teléfono del destinatario (con código de país, ej. 521XXXXXXXXXX)
 * @param {string} text - Contenido del mensaje a enviar
 */
async function sendWhatsAppMessage(to, text) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;

  if (!token || !phoneId) {
    console.error('Error: Faltan las variables WHATSAPP_TOKEN y WHATSAPP_PHONE_ID en .env');
    return;
  }

  // URL de la API Graph de Meta
  const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`;

  // Payload requerido por Meta para envío de texto
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'text',
    text: {
      preview_url: false,
      body: text,
    },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Meta API Error - Detalles:', JSON.stringify(data, null, 2));
    } else {
      console.log(`[EXITO] Mensaje enviado a ${to}. ID del mensaje: ${data.messages[0].id}`);
    }
  } catch (error) {
    console.error('[ERROR] Excepción de red al enviar el mensaje por WhatsApp:', error.message);
  }
}

// ----------------------------------------------------------------------------
// ENDPOINTS DE LA API
// ----------------------------------------------------------------------------

// Endpoint GET /health: Para verificar que la API está viva
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'ARI API funcionando correctamente' });
});

// Endpoint GET /webhook: Para la verificación del token de Meta
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const expectedToken = process.env.WEBHOOK_VERIFY_TOKEN;

  if (mode && token) {
    // Si el modo y el token son correctos
    if (mode === 'subscribe' && token === expectedToken) {
      console.log('Webhook verificado exitosamente por Meta.');
      return res.status(200).send(challenge);
    } else {
      console.error('Fallo en la verificación: Verify token no coincide.');
      return res.status(403).json({ error: 'Token inválido' });
    }
  }

  return res.status(400).json({ error: 'Faltan parámetros de verificación' });
});

// Endpoint POST /webhook: Para recibir mensajes y eventos de Meta
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    // Confirmamos que el evento provenga de la cuenta de WhatsApp Business
    if (body.object === 'whatsapp_business_account') {

      // Pueden llegar varios "entries" en la misma petición (lotes)
      for (const entry of body.entry) {
        // Cada entry tiene una lista de "changes"
        for (const change of entry.changes) {
          const value = change.value;

          // Verificamos si en el cambio vienen mensajes de un usuario
          if (value && value.messages && value.messages.length > 0) {
            const message = value.messages[0];

            // 1. Extraer correctamente from, text, message_id y timestamp
            const from = message.from;              // Número emisor
            const messageId = message.id;           // ID único del mensaje recibido
            const timestamp = message.timestamp;    // Timestamp en formato UNIX (segundos)

            console.log('\n--- NUEVO MENSAJE RECIBIDO ---');
            console.log(`De: ${from}`);
            console.log(`ID: ${messageId}`);
            console.log(`Fecha/Hora: ${new Date(timestamp * 1000).toISOString()}`);

            // Validar si es mensaje de texto o de otro tipo (audio, imagen, documento)
            if (message.type === 'text') {
              const textContent = message.text.body; // Texto real recibido
              console.log(`Contenido textual: "${textContent}"`);

              // 3. Responder al usuario con un mensaje hardcodeado
              const replyText = "Hola, soy ARI 👋 ¿En qué te puedo ayudar?";

              // Evitamos bloquear el hilo, pero usamos await si queremos garantizar el rastro de log 
              // antes de mandar la respuesta final del POST
              await sendWhatsAppMessage(from, replyText);

            } else {
              // 4. Ignorar por ahora el contenido que no sea texto y loguear
              console.log(`[INFO] Mensaje tipo '${message.type}' recibido. Contenido multimedia ignorado por ahora.`);
            }
          }
          // Opcional: Manejar si hay actualizaciones del estado de nuestros mensajes (Leído, Entregado, etc)
          else if (value && value.statuses) {
            const status = value.statuses[0];
            console.log(`[ESTADO] El mensaje ${status.id} cambió a estado: ${status.status}`);
          }
        }
      }

      // Meta requiere que el webhook responda SIEMPRE con 200 OK lo antes posible
      // para evitar que reintente los eventos asumiendo que el servidor falló.
      res.sendStatus(200);
    } else {
      // Evento no reconocido u otro producto diferente a whatsapp_business
      res.sendStatus(404);
    }
  } catch (error) {
    console.error('[CRÍTICO] Error al procesar el webhook de WhatsApp:', error);
    // Para que Meta no intente reenviar en caso de errores en nuestro backend temporales, 
    // algunos desarrolladores devuelven 200, pero un 500 es semánticamente correcto
    // para un Internal Server Error.
    res.sendStatus(500);
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Servidor ARI iniciado y escuchando en el puerto ${PORT}`);
  console.log(`GET  /health  - Para verificar estado de salud`);
  console.log(`GET  /webhook - Para verificación inicial de WhatsApp Meta API`);
  console.log(`POST /webhook - Para recibir eventos y mensajes de WhatsApp Meta API\n`);
});
