const { getOrCreateConversation } = require('../whatsapp/conversation');
const { sendWhatsAppMessage } = require('../whatsapp/whatsapp');
const { getBusinessConfig } = require('../businessConfig');
const { handleClientMessage, handleOwnerMessage } = require('../whatsapp/webhookHandlers');

/**
 * @param {import('express').Express} app
 */
function registerWebhookRoutes(app) {
  app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const expectedToken = process.env.WEBHOOK_VERIFY_TOKEN;

    if (mode && token) {
      if (mode === 'subscribe' && token === expectedToken) {
        return res.status(200).send(challenge);
      }
      return res.status(403).json({ error: 'Token inválido' });
    }
    return res.status(400).json({ error: 'Faltan parámetros' });
  });

  app.post('/webhook', async (req, res) => {
    try {
      const body = req.body;

      if (body.object !== 'whatsapp_business_account') {
        return res.sendStatus(404);
      }

      for (const entry of body.entry) {
        for (const change of entry.changes) {
          const value = change.value;

          if (!value?.messages?.length) continue;

          const message = value.messages[0];
          let from = message.from;

          if (from.startsWith('521') && from.length === 13) {
            from = '52' + from.substring(3);
          }

          console.log(`\n--- NUEVO MSG DE ${from} ---`);

          if (message.type !== 'text') {
            console.log(`Ignorando mensaje tipo '${message.type}'.`);
            continue;
          }

          const userMessage = message.text.body.trim();
          console.log(`💬 C: "${userMessage}"`);

          try {
            const conversation = await getOrCreateConversation(from);
            const { state: currentState, business_id: businessId } = conversation;
            console.log(`⚙️  Estado actual: ${currentState}`);

            const config = await getBusinessConfig(businessId);
            const isOwner = config.owner_phone
              && (
                String(config.owner_phone) === from
                || String(config.owner_phone) === `52${from}`
                || from === `52${String(config.owner_phone)}`
              );

            if (isOwner) {
              await handleOwnerMessage(from, businessId, userMessage, config);
              continue;
            }

            await handleClientMessage(conversation, from, businessId, userMessage, config);
          } catch (internalError) {
            console.error('[CRÍTICO INTERNO] Fallo en procesamiento:', internalError.message);
            await sendWhatsAppMessage(from, 'En este momento no puedo procesar tu mensaje, intenta en unos minutos.');
          }
        }
      }

      res.sendStatus(200);
    } catch (error) {
      console.error('[ERROR GENERAL] Caída en el Webhook:', error);
      res.sendStatus(500);
    }
  });
}

module.exports = { registerWebhookRoutes };
