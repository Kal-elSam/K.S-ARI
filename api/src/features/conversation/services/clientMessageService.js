const { sendWhatsAppMessage } = require('../../../whatsapp/whatsapp');
const { updateConversationContext, updateConversationState } = require('../../../whatsapp/conversation');
const { handleGeneralState } = require('./generalStateService');
const { handleBookingFlow } = require('../../booking/services/bookingFlowService');
const { notifyOwner } = require('../../notifications/services/ownerNotifier');
const { deleteCalendarEvent } = require('../../appointments/services/appointmentCalendarService');

function normalizeText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function parseReminderAction(userMessage) {
  const normalized = normalizeText(userMessage);
  if (normalized === '1' || normalized.includes('confirmar') || normalized.includes('ahi estare') || normalized === 'si') {
    return 'SLOT_CONFIRM';
  }
  if (normalized === '2' || normalized.includes('cancelar') || normalized.includes('no podre') || normalized.includes('no puedo')) {
    return 'SLOT_CANCEL';
  }
  if (normalized === '3' || normalized.includes('reagendar') || normalized.includes('otro dia')) {
    return 'SLOT_RESCHEDULE';
  }
  return null;
}

function parseYesNoAction(userMessage) {
  const normalized = normalizeText(userMessage);
  if (normalized === '1' || normalized.includes('si')) return 'YES';
  if (normalized === '2' || normalized.includes('no')) return 'NO';
  return null;
}

async function processOwnerCancellationOffer(convId, from, context, userMessage) {
  const action = parseYesNoAction(userMessage);
  if (!action) {
    await sendWhatsAppMessage(from, 'Por favor responde:\n1️⃣ Sí, reagendar\n2️⃣ No, gracias');
    return true;
  }

  if (action === 'YES') {
    await updateConversationState(convId, 'READY_TO_BOOK');
    await updateConversationContext(convId, { owner_cancellation_offer: false });
    await sendWhatsAppMessage(from, 'Perfecto 👌 ¿Qué día te gustaría agendar?');
    return true;
  }

  await updateConversationContext(convId, { owner_cancellation_offer: false });
  await sendWhatsAppMessage(from, 'Entendido. Si luego deseas reagendar, aquí estaré para ayudarte.');
  return true;
}

async function processOwnerRescheduleConfirmation(convId, from, context, userMessage, businessId) {
  const action = parseYesNoAction(userMessage);
  if (!action) {
    await sendWhatsAppMessage(from, 'Responde por favor:\n1️⃣ Sí, confirmo\n2️⃣ No, prefiero cancelar');
    return true;
  }

  const confirmation = context.owner_reschedule_confirmation || {};
  if (action === 'YES') {
    await updateConversationContext(convId, { owner_reschedule_confirmation: null });
    await sendWhatsAppMessage(from, '✅ ¡Perfecto! Tu cambio quedó confirmado.');
    await notifyOwner(
      businessId,
      `✅ ${context.clientName || from} confirmó el cambio a ${confirmation.new_date || '-'} ${confirmation.new_time || '-'}.`
    );
    return true;
  }

  if (confirmation.eventId) {
    await deleteCalendarEvent(businessId, confirmation.eventId);
  }
  await updateConversationContext(convId, { owner_reschedule_confirmation: null, owner_cancellation_offer: true });
  await sendWhatsAppMessage(
    from,
    'Entendido, cancelamos esa cita 🙏 ¿Te gustaría agendar para otro día?\n1️⃣ Sí, reagendar\n2️⃣ No, gracias'
  );
  await notifyOwner(businessId, `❌ ${context.clientName || from} rechazó la reagenda y se canceló la cita.`);
  return true;
}

async function processReminderResponse(convId, from, businessId, context, userMessage) {
  const action = parseReminderAction(userMessage);
  if (!action) {
    await sendWhatsAppMessage(
      from,
      'Para tu recordatorio responde con una opción:\n1️⃣ Confirmar\n2️⃣ Cancelar\n3️⃣ Reagendar'
    );
    return true;
  }

  const clientName = context.clientName || context.reminder_client_name || from;
  const hour = context.reminder_hour || 'tu horario';
  const eventId = context.reminder_event_id;

  if (action === 'SLOT_CONFIRM') {
    await sendWhatsAppMessage(from, `✅ ¡Perfecto ${clientName}! Te esperamos mañana a las ${hour} 😊`);
    await notifyOwner(businessId, `✅ ${clientName} confirmó su cita de las ${hour}.`);
    await updateConversationContext(convId, { reminder_sent: false });
    return true;
  }

  if (action === 'SLOT_CANCEL') {
    if (eventId) {
      try {
        await deleteCalendarEvent(businessId, eventId);
      } catch (error) {
        console.error('[REMINDER] Error al cancelar evento por respuesta cliente:', error.message);
      }
    }
    await sendWhatsAppMessage(
      from,
      `Entendido ${clientName}, cancelamos tu cita 🙏\n¿Te gustaría agendar para otro día?\n1️⃣ Sí, reagendar\n2️⃣ No, gracias`
    );
    await notifyOwner(businessId, `❌ ${clientName} canceló su cita de las ${hour}. Slot liberado.`);
    await updateConversationContext(convId, {
      reminder_sent: false,
      owner_cancellation_offer: true,
    });
    return true;
  }

  await notifyOwner(
    businessId,
    `⚠️ ${clientName} quiere reagendar su cita:\n📅 Cita actual: ${context.reminder_date || 'mañana'} a las ${hour}\n\n¿Apruebas que reagende?\n1️⃣ Sí, que elija nueva fecha\n2️⃣ No, mantener cita`
  );
  await sendWhatsAppMessage(from, 'Perfecto, voy a consultarlo con el negocio y te confirmo enseguida.');
  await updateConversationContext(convId, {
    pending_owner_reschedule_approval: true,
    reminder_sent: false,
    reminder_client_name: clientName,
  });
  return true;
}

async function handleClientMessage(conversation, from, businessId, userMessage, config) {
  const { id: convId, state: currentState, context = {} } = conversation;

  if (context.owner_cancellation_offer) {
    const handled = await processOwnerCancellationOffer(convId, from, context, userMessage);
    if (handled) return;
  }

  if (context.owner_reschedule_confirmation) {
    const handled = await processOwnerRescheduleConfirmation(convId, from, context, userMessage, businessId);
    if (handled) return;
  }

  if (context.reminder_sent) {
    const handled = await processReminderResponse(convId, from, businessId, context, userMessage);
    if (handled) return;
  }

  if (currentState === 'READY_TO_BOOK') {
    await handleBookingFlow(convId, from, businessId, context, userMessage, config);
    return;
  }

  await handleGeneralState(convId, from, businessId, currentState, context, userMessage);
}

module.exports = {
  handleClientMessage,
  parseReminderAction,
};
