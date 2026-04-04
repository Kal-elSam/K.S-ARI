const { pool } = require('../../../core/db');
const { sendWhatsAppMessage } = require('../../../whatsapp/whatsapp');
const {
  blockDayCalendar,
  deleteCalendarEvent,
  getAppointmentsByDate,
  getDateISOOffset,
  getEventById,
  rescheduleCalendarEvent,
} = require('../../appointments/services/appointmentCalendarService');

function isValidISODate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function isValidHHMM(time) {
  return typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
}

function getDisplayName(name, phone) {
  const safeName = String(name || '').trim();
  return safeName || phone || 'cliente';
}

async function activateRebookingFlowByPhone(phone) {
  try {
    await pool.query(
      `UPDATE conversations
       SET state = 'READY_TO_BOOK',
           context = context || '{"owner_cancellation_offer": true}'::jsonb,
           updated_at = CURRENT_TIMESTAMP
       WHERE phone = $1`,
      [phone]
    );
  } catch (error) {
    console.error('[OWNER TOOL] No se pudo activar flujo de reagenda:', error.message);
  }
}

async function handleGetAppointments(args, businessId) {
  const date = isValidISODate(args?.date) ? args.date : getDateISOOffset(0);
  const appointments = await getAppointmentsByDate(businessId, date);
  if (appointments.length === 0) {
    return `No tienes citas el ${date}.`;
  }

  const lines = appointments.map((appointment, index) => {
    const name = appointment.clientName || appointment.phone || 'Sin nombre';
    return `${index + 1}. ${appointment.time} - ${name} - ${appointment.service || 'Servicio'}`;
  });

  return `Tienes ${appointments.length} citas el ${date}:\n${lines.join('\n')}`;
}

async function handleCancelAppointment(args, businessId) {
  const eventId = String(args?.event_id || '').trim();
  const clientPhone = String(args?.client_phone || '').trim();
  const clientName = getDisplayName(args?.client_name, clientPhone);
  const reason = String(args?.reason || '').trim();

  if (!eventId || !clientPhone) {
    return 'Error: event_id y client_phone son obligatorios.';
  }

  let eventDate = '';
  let eventTime = '';
  try {
    const event = await getEventById(businessId, eventId);
    eventDate = new Intl.DateTimeFormat('es-MX', {
      timeZone: 'America/Mexico_City',
      dateStyle: 'long',
    }).format(new Date(event.start?.dateTime || event.start?.date));
    eventTime = new Intl.DateTimeFormat('es-MX', {
      timeZone: 'America/Mexico_City',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(event.start?.dateTime || event.start?.date));
  } catch (error) {
    console.error('[OWNER TOOL] No se pudo leer el evento antes de cancelar:', error.message);
  }

  await deleteCalendarEvent(businessId, eventId);

  const cancelMessage = [
    `Hola ${clientName} 👋 Tu cita del ${eventDate || 'día programado'} a las ${eventTime || 'hora acordada'} fue cancelada.`,
    reason ? `Motivo: ${reason}` : 'Disculpa los inconvenientes 🙏',
    '¿Te gustaría agendar para otro día?',
  ].join('\n');
  await sendWhatsAppMessage(clientPhone, cancelMessage);
  await activateRebookingFlowByPhone(clientPhone);

  return `Listo. Cita ${eventId} cancelada y cliente notificado.`;
}

async function handleRescheduleAppointment(args, businessId) {
  const eventId = String(args?.event_id || '').trim();
  const clientPhone = String(args?.client_phone || '').trim();
  const clientName = getDisplayName(args?.client_name, clientPhone);
  const newDate = String(args?.new_date || '').trim();
  const newTime = String(args?.new_time || '').trim();

  if (!eventId || !clientPhone || !isValidISODate(newDate) || !isValidHHMM(newTime)) {
    return 'Error: faltan parámetros válidos para reagendar.';
  }

  const result = await rescheduleCalendarEvent(businessId, eventId, newDate, newTime);
  if (!result.moved) {
    return `No pude reagendar: el horario ${newTime} del ${newDate} no está disponible.`;
  }

  const message = [
    `Hola ${clientName} 👋 Tu cita fue reagendada:`,
    `📅 Nueva fecha: ${newDate}`,
    `⏰ Nueva hora: ${newTime}`,
    '¿Confirmas el cambio?',
    '1️⃣ Sí, confirmo',
    '2️⃣ No, prefiero cancelar',
  ].join('\n');
  await sendWhatsAppMessage(clientPhone, message);

  await pool.query(
    `UPDATE conversations
     SET context = context || $1::jsonb, updated_at = CURRENT_TIMESTAMP
     WHERE phone = $2`,
    [JSON.stringify({ owner_reschedule_confirmation: { eventId, newDate, newTime } }), clientPhone]
  );

  return `Listo. Evento reagendado y cliente notificado para confirmar.`;
}

async function handleBlockDay(args, businessId) {
  const date = String(args?.date || '').trim();
  const reason = String(args?.reason || '').trim();
  if (!isValidISODate(date)) {
    return 'Error: date debe tener formato YYYY-MM-DD.';
  }

  await blockDayCalendar(businessId, date, reason);
  return `Listo, bloqueé el ${date}.`;
}

async function handleBroadcastMessage(args, businessId) {
  const date = String(args?.date || '').trim();
  const message = String(args?.message || '').trim();
  if (!isValidISODate(date) || !message) {
    return 'Error: date y message son obligatorios.';
  }

  const appointments = await getAppointmentsByDate(businessId, date);
  let sent = 0;
  for (const appointment of appointments) {
    if (!appointment.phone) continue;
    await sendWhatsAppMessage(appointment.phone, message);
    sent += 1;
  }

  return `Mensaje enviado a ${sent} cliente(s) con cita el ${date}.`;
}

async function executeOwnerTool(toolCall, args, businessId) {
  const toolName = toolCall.function?.name;
  if (toolName === 'get_appointments') {
    return handleGetAppointments(args, businessId);
  }
  if (toolName === 'cancel_appointment') {
    return handleCancelAppointment(args, businessId);
  }
  if (toolName === 'reschedule_appointment') {
    return handleRescheduleAppointment(args, businessId);
  }
  if (toolName === 'block_day') {
    return handleBlockDay(args, businessId);
  }
  if (toolName === 'broadcast_message') {
    return handleBroadcastMessage(args, businessId);
  }
  return `Error: herramienta "${toolName}" no soportada.`;
}

module.exports = {
  executeOwnerTool,
};
