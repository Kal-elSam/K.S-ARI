const { getOrCreateConversation } = require('../whatsapp/conversation');
const { sendWhatsAppMessage } = require('../whatsapp/whatsapp');
const {
  handleReadyToBook,
  handleSlotSelection,
  handleGeneralState,
} = require('../whatsapp/webhookHandlers');

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
            const { id: convId, state: currentState, context, business_id: businessId } = conversation;
            console.log(`⚙️  Estado actual: ${currentState}`);

            if (currentState === 'READY_TO_BOOK' && !context?.slotsOfrecidos) {
              await handleReadyToBook(convId, from, businessId, context);
              continue;
            }

            if (currentState === 'READY_TO_BOOK' && context?.slotsOfrecidos) {
              await handleSlotSelection(convId, from, businessId, context, userMessage);
              continue;
            }

            await handleGeneralState(convId, from, businessId, currentState, userMessage);
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
