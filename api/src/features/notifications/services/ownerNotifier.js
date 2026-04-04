const { getBusinessConfig } = require('../../../businessConfig');
const { sendWhatsAppMessage } = require('../../../whatsapp/whatsapp');

async function notifyOwner(businessId, message) {
  try {
    const config = await getBusinessConfig(businessId);
    if (!config.owner_phone) {
      return;
    }
    await sendWhatsAppMessage(String(config.owner_phone), message);
  } catch (error) {
    console.error('[ERROR] notifyOwner:', error.message);
  }
}

module.exports = { notifyOwner };
