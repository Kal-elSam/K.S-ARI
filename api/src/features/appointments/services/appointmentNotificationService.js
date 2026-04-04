const { pool } = require('../../../core/db');
const { sendWhatsAppMessage } = require('../../../whatsapp/whatsapp');
const { getBusinessConfig } = require('../../../businessConfig');
const {
  getAppointmentsForToday,
  getAppointmentsForTomorrow,
  normalizePhoneVariants,
} = require('./appointmentCalendarService');

function sanitizeReminderPhone(phone) {
  const variants = normalizePhoneVariants(phone);
  return variants.length > 0 ? variants[0] : String(phone || '').trim();
}

async function markReminderSentByPhone(phone, payload) {
  const variants = normalizePhoneVariants(phone);
  if (variants.length === 0) {
    return;
  }
  await pool.query(
    `UPDATE conversations
     SET context = context || $1::jsonb, updated_at = CURRENT_TIMESTAMP
     WHERE phone = ANY($2::text[])`,
    [JSON.stringify(payload), variants]
  );
}

async function sendTomorrowRemindersForBusiness(businessId) {
  try {
    const appointments = await getAppointmentsForTomorrow(businessId);
    for (const appointment of appointments) {
      if (!appointment.phone) continue;
      const clientName = appointment.clientName || appointment.phone;
      const reminderMessage = [
        `Hola ${clientName} 👋 Te recordamos tu cita mañana:`,
        '',
        `📅 ${appointment.date}`,
        `⏰ ${appointment.time}`,
        `🛠 ${appointment.service || 'Servicio'}`,
        '',
        '¿Todo bien?',
        '1️⃣ Confirmar — ahí estaré ✅',
        '2️⃣ Cancelar — no podré ir ❌',
        '3️⃣ Reagendar — necesito otro día 📅',
      ].join('\n');

      const clientPhone = sanitizeReminderPhone(appointment.phone);
      await sendWhatsAppMessage(clientPhone, reminderMessage);

      await markReminderSentByPhone(clientPhone, {
        reminder_sent: true,
        reminder_event_id: appointment.eventId,
        reminder_date: appointment.date,
        reminder_hour: appointment.time,
        reminder_service: appointment.service || 'Servicio',
        reminder_client_name: appointment.clientName || null,
      });
    }
  } catch (error) {
    console.error('[REMINDER] Error enviando recordatorios 24h:', error.message);
  }
}

async function sendDailySummaryToOwner(businessId) {
  try {
    const config = await getBusinessConfig(businessId);
    if (!config.owner_phone) return;

    const appointments = await getAppointmentsForToday(businessId);
    if (appointments.length === 0) return;

    const lines = appointments.map((appointment, index) => {
      const name = appointment.clientName || appointment.phone || 'Cliente';
      return `${index + 1}. ${appointment.time} — ${name} — ${appointment.service || 'Servicio'}`;
    });

    const message = [
      '☀️ *Buenos días! Tus citas de hoy:*',
      '',
      ...lines,
      '',
      `Total: ${appointments.length} citas 💪`,
      '',
      'Escríbeme si necesitas cancelar o reagendar alguna.',
    ].join('\n');

    await sendWhatsAppMessage(String(config.owner_phone), message);
  } catch (error) {
    console.error('[SUMMARY] Error enviando resumen diario:', error.message);
  }
}

module.exports = {
  sendTomorrowRemindersForBusiness,
  sendDailySummaryToOwner,
};
