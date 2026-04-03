const { pool } = require('../core/db');
const { TIMEZONE } = require('../core/constants');
const { sendWhatsAppMessage } = require('../whatsapp/whatsapp');
const { addCalendarDays, formatDateISOYYYYMMDD, parseISODateToUTCNoon } = require('./bookingHelpers');

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

/**
 * Obtiene un access_token válido para el negocio indicado.
 * Si el token actual expiró (o no existe), lo refresca con el refresh_token.
 * Actualiza el registro en DB con el nuevo token y su fecha de expiración.
 *
 * @param {string} businessId - Identificador del negocio en business_calendars
 * @returns {Promise<string>} - Access token listo para usar en la Google Calendar API
 */
async function getValidAccessToken(businessId) {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM business_calendars WHERE business_id = $1 LIMIT 1',
      [businessId]
    );

    if (rows.length === 0) {
      throw new Error(`[CALENDAR] No se encontró calendario para business_id="${businessId}". Haz el flujo OAuth primero.`);
    }

    const registro = rows[0];
    const ahora = new Date();

    const tieneTokenValido =
      registro.google_access_token &&
      registro.token_expiry &&
      new Date(registro.token_expiry) > new Date(ahora.getTime() + 60_000);

    if (tieneTokenValido) {
      return registro.google_access_token;
    }

    console.log(`[CALENDAR] Refrescando access_token para business_id="${businessId}"...`);

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: registro.google_refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[ERROR CALENDAR] Fallo al refrescar token:', JSON.stringify(data));
      throw new Error(data.error_description || 'No se pudo refrescar el token de Google');
    }

    const nuevaExpiracion = new Date(ahora.getTime() + data.expires_in * 1000);

    await pool.query(
      `UPDATE business_calendars
       SET google_access_token = $1, token_expiry = $2, updated_at = CURRENT_TIMESTAMP
       WHERE business_id = $3`,
      [data.access_token, nuevaExpiracion.toISOString(), businessId]
    );

    console.log(`[CALENDAR] Token refrescado exitosamente. Expira: ${nuevaExpiracion.toISOString()}`);
    return data.access_token;
  } catch (error) {
    console.error('[ERROR CALENDAR] getValidAccessToken:', error.message);
    throw error;
  }
}

/**
 * Devuelve los slots de hora disponibles para el día dado.
 * Horario de trabajo: 9am–6pm CST, slots de 1 hora.
 * Excluye slots que choquen con eventos existentes en Google Calendar.
 */
async function getAvailableSlots(businessId, date) {
  try {
    const accessToken = await getValidAccessToken(businessId);

    const formatter = new Intl.DateTimeFormat('sv', {
      timeZone: TIMEZONE,
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const fechaLocal = formatter.format(date);

    const timeMin = `${fechaLocal}T09:00:00-06:00`;
    const timeMax = `${fechaLocal}T18:00:00-06:00`;

    const HORAS_INICIO = [9, 10, 11, 12, 13, 14, 15, 16, 17];
    const todosLosSlots = HORAS_INICIO.map((hora) => ({
      start: `${String(hora).padStart(2, '0')}:00`,
      end: `${String(hora + 1).padStart(2, '0')}:00`,
    }));

    const url = new URL(`${GOOGLE_CALENDAR_BASE}/calendars/primary/events`);
    url.searchParams.set('timeMin', timeMin);
    url.searchParams.set('timeMax', timeMax);
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[ERROR CALENDAR] Fallo al obtener eventos:', JSON.stringify(data));
      throw new Error(data.error?.message || 'Error al leer Google Calendar');
    }

    const eventos = data.items || [];
    console.log(`[CALENDAR] ${eventos.length} eventos encontrados el ${fechaLocal}`);

    const slotsDisponibles = todosLosSlots.filter(({ start, end }) => {
      const slotStart = new Date(`${fechaLocal}T${start}:00-06:00`);
      const slotEnd = new Date(`${fechaLocal}T${end}:00-06:00`);

      const choca = eventos.some((evento) => {
        const evStart = new Date(evento.start?.dateTime || evento.start?.date);
        const evEnd = new Date(evento.end?.dateTime || evento.end?.date);
        return evStart < slotEnd && evEnd > slotStart;
      });

      return !choca;
    });

    return slotsDisponibles;
  } catch (error) {
    console.error('[ERROR CALENDAR] getAvailableSlots:', error.message);
    throw error;
  }
}

/**
 * Busca el siguiente día con disponibilidad en un rango máximo de 14 días.
 * Empieza desde el día siguiente a `fromISODate`.
 */
async function findNextAvailableDay(businessId, fromISODate) {
  const baseDate = parseISODateToUTCNoon(fromISODate);
  if (Number.isNaN(baseDate.getTime())) {
    throw new Error('Fecha inválida para buscar disponibilidad.');
  }

  for (let dayOffset = 1; dayOffset <= 14; dayOffset += 1) {
    const candidateDate = addCalendarDays(baseDate, dayOffset);
    const slots = await getAvailableSlots(businessId, candidateDate);
    if (slots.length > 0) {
      return {
        fecha: formatDateISOYYYYMMDD(candidateDate),
        slots,
      };
    }
  }

  return null;
}

/**
 * Crea un evento en Google Calendar.
 */
async function createCalendarEvent(businessId, clientPhone, serviceName, startTime, endTime) {
  try {
    const accessToken = await getValidAccessToken(businessId);

    const lockExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const eventBody = {
      summary: `PENDING_${serviceName} - ${clientPhone}`,
      description: `Cita agendada por ARI.\nCliente: ${clientPhone}\nServicio: ${serviceName}\nLock expira: ${lockExpiry}`,
      start: {
        dateTime: startTime,
        timeZone: TIMEZONE,
      },
      end: {
        dateTime: endTime,
        timeZone: TIMEZONE,
      },
    };

    const response = await fetch(`${GOOGLE_CALENDAR_BASE}/calendars/primary/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventBody),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[ERROR CALENDAR] Fallo al crear evento:', JSON.stringify(data));
      throw new Error(data.error?.message || 'Error al crear evento en Google Calendar');
    }

    console.log(`[CALENDAR] Evento creado: ${data.id} | ${data.summary}`);
    return data.id;
  } catch (error) {
    console.error('[ERROR CALENDAR] createCalendarEvent:', error.message);
    throw error;
  }
}

/**
 * Confirma un evento eliminando el prefijo PENDING_ del título.
 */
async function confirmCalendarEvent(businessId, eventId, serviceName, clientPhone) {
  try {
    const accessToken = await getValidAccessToken(businessId);

    const response = await fetch(`${GOOGLE_CALENDAR_BASE}/calendars/primary/events/${eventId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: `Cita - ${serviceName} - ${clientPhone}`,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      console.error('[ERROR CALENDAR] Fallo al confirmar evento:', JSON.stringify(data));
    } else {
      console.log(`[CALENDAR] Evento ${eventId} confirmado (PENDING_ removido).`);
    }
  } catch (error) {
    console.error('[ERROR CALENDAR] confirmCalendarEvent:', error.message);
  }
}

/**
 * Envía recordatorios de WhatsApp para citas del día siguiente.
 */
async function sendReminder(businessId) {
  try {
    const accessToken = await getValidAccessToken(businessId);

    const manana = new Date();
    manana.setDate(manana.getDate() + 1);

    const formatter = new Intl.DateTimeFormat('sv', {
      timeZone: TIMEZONE,
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const fechaManana = formatter.format(manana);

    const timeMin = `${fechaManana}T00:00:00-06:00`;
    const timeMax = `${fechaManana}T23:59:59-06:00`;

    const url = new URL(`${GOOGLE_CALENDAR_BASE}/calendars/primary/events`);
    url.searchParams.set('timeMin', timeMin);
    url.searchParams.set('timeMax', timeMax);
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[ERROR REMINDER] Fallo al obtener eventos:', JSON.stringify(data));
      return;
    }

    const eventos = data.items || [];
    console.log(`[REMINDER] ${eventos.length} citas encontradas para mañana (${fechaManana}).`);

    for (const evento of eventos) {
      const partes = (evento.summary || '').split(' - ');
      if (partes.length < 3) continue;

      const clientPhone = partes[partes.length - 1].trim();
      const horaEvento = new Intl.DateTimeFormat('es-MX', {
        timeZone: TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(new Date(evento.start?.dateTime || evento.start?.date));

      const mensaje = `🔔 *Recordatorio de tu cita*\nHola, te recordamos que mañana tienes una cita a las *${horaEvento}*. ¡Te esperamos!`;

      await sendWhatsAppMessage(clientPhone, mensaje);
      console.log(`[REMINDER] Recordatorio enviado a ${clientPhone} para las ${horaEvento}.`);
    }
  } catch (error) {
    console.error('[ERROR REMINDER] sendReminder:', error.message);
  }
}

module.exports = {
  GOOGLE_TOKEN_URL,
  GOOGLE_CALENDAR_BASE,
  getValidAccessToken,
  getAvailableSlots,
  findNextAvailableDay,
  createCalendarEvent,
  confirmCalendarEvent,
  sendReminder,
};
