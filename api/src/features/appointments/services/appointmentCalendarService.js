const { pool } = require('../../../core/db');
const { TIMEZONE } = require('../../../core/constants');
const {
  GOOGLE_CALENDAR_BASE,
  getValidAccessToken,
  getAvailableSlots,
} = require('../../../booking/googleCalendar');

function sanitizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizePhoneVariants(phone) {
  const base = sanitizePhone(phone);
  if (!base) return [];
  const set = new Set([base]);
  if (base.startsWith('521')) set.add(`52${base.slice(3)}`);
  if (base.startsWith('52')) set.add(base.slice(2));
  if (!base.startsWith('52')) set.add(`52${base}`);
  return [...set];
}

function parseEventSummary(summary) {
  const rawSummary = String(summary || '').trim();
  const parts = rawSummary.split(' - ');
  const maybePhone = parts[parts.length - 1] || '';
  const phone = /^\d{10,15}$/.test(maybePhone.trim()) ? maybePhone.trim() : '';
  const service = parts.length >= 2 ? parts[1].replace('PENDING_', '').trim() : rawSummary;
  return { phone, service };
}

function formatTimeLabel(dateValue) {
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(dateValue));
}

function formatDateISO(dateValue) {
  return new Intl.DateTimeFormat('sv', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(dateValue));
}

function buildUtcDateWindow(dateISO) {
  return {
    timeMin: `${dateISO}T00:00:00-06:00`,
    timeMax: `${dateISO}T23:59:59-06:00`,
  };
}

function addDaysISO(dateISO, daysToAdd) {
  const [year, month, day] = dateISO.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  date.setUTCDate(date.getUTCDate() + daysToAdd);
  return new Intl.DateTimeFormat('sv', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

async function fetchEventsByRange(businessId, timeMin, timeMax) {
  const accessToken = await getValidAccessToken(businessId);
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
    throw new Error(data.error?.message || 'Error al consultar eventos en Google Calendar');
  }

  return Array.isArray(data.items) ? data.items : [];
}

async function enrichEventsWithClientName(events) {
  const phones = [...new Set(events.map((event) => parseEventSummary(event.summary).phone).filter(Boolean))];
  if (phones.length === 0) {
    return events.map((event) => ({ event, client_name: null }));
  }

  const variants = phones.flatMap((phone) => normalizePhoneVariants(phone));
  const { rows } = await pool.query(
    `SELECT phone, client_name
     FROM conversations
     WHERE phone = ANY($1::text[])`,
    [variants]
  );

  const nameByPhone = new Map();
  for (const row of rows) {
    if (row.client_name) {
      nameByPhone.set(String(row.phone), String(row.client_name));
    }
  }

  return events.map((event) => {
    const { phone } = parseEventSummary(event.summary);
    const candidates = normalizePhoneVariants(phone);
    const foundName = candidates.find((candidate) => nameByPhone.has(candidate));
    return {
      event,
      client_name: foundName ? nameByPhone.get(foundName) : null,
    };
  });
}

async function getAppointmentsByDate(businessId, dateISO) {
  const { timeMin, timeMax } = buildUtcDateWindow(dateISO);
  const events = await fetchEventsByRange(businessId, timeMin, timeMax);
  const withNames = await enrichEventsWithClientName(events);

  return withNames.map(({ event, client_name: clientName }) => {
    const { phone, service } = parseEventSummary(event.summary);
    return {
      eventId: event.id,
      phone,
      clientName,
      service,
      date: formatDateISO(event.start?.dateTime || event.start?.date),
      time: formatTimeLabel(event.start?.dateTime || event.start?.date),
      start: event.start?.dateTime || event.start?.date || null,
      end: event.end?.dateTime || event.end?.date || null,
    };
  });
}

function getDateISOOffset(daysOffset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return new Intl.DateTimeFormat('sv', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

async function getAppointmentsForToday(businessId) {
  return getAppointmentsByDate(businessId, getDateISOOffset(0));
}

async function getAppointmentsForTomorrow(businessId) {
  return getAppointmentsByDate(businessId, getDateISOOffset(1));
}

async function deleteCalendarEvent(businessId, eventId) {
  const accessToken = await getValidAccessToken(businessId);
  const response = await fetch(`${GOOGLE_CALENDAR_BASE}/calendars/primary/events/${eventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok && response.status !== 410 && response.status !== 404) {
    const data = await response.json();
    throw new Error(data.error?.message || 'No se pudo eliminar el evento');
  }
}

async function getEventById(businessId, eventId) {
  const accessToken = await getValidAccessToken(businessId);
  const response = await fetch(`${GOOGLE_CALENDAR_BASE}/calendars/primary/events/${eventId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || 'No se pudo leer el evento');
  }

  return data;
}

async function rescheduleCalendarEvent(businessId, eventId, newDate, newTime) {
  const slots = await getAvailableSlots(businessId, new Date(`${newDate}T12:00:00Z`));
  const slotAvailable = slots.some((slot) => slot.start === newTime);
  if (!slotAvailable) {
    return { moved: false, reason: 'slot_unavailable' };
  }

  const [hour, minute] = newTime.split(':').map(Number);
  const endHour = (hour + 1) % 24;
  const startIso = `${newDate}T${newTime}:00-06:00`;
  const endIso = `${newDate}T${String(endHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-06:00`;

  const accessToken = await getValidAccessToken(businessId);
  const response = await fetch(`${GOOGLE_CALENDAR_BASE}/calendars/primary/events/${eventId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      start: { dateTime: startIso, timeZone: TIMEZONE },
      end: { dateTime: endIso, timeZone: TIMEZONE },
    }),
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || 'No se pudo reagendar el evento');
  }

  return { moved: true, event: data };
}

async function blockDayCalendar(businessId, dateISO, reason) {
  const accessToken = await getValidAccessToken(businessId);
  const startDate = dateISO;
  const endDate = addDaysISO(dateISO, 1);
  const response = await fetch(`${GOOGLE_CALENDAR_BASE}/calendars/primary/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: `🚫 No disponible - ${reason || 'Bloqueo manual'}`,
      start: { date: startDate },
      end: { date: endDate },
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || 'No se pudo bloquear el día');
  }
  return data;
}

module.exports = {
  normalizePhoneVariants,
  parseEventSummary,
  getDateISOOffset,
  getAppointmentsByDate,
  getAppointmentsForToday,
  getAppointmentsForTomorrow,
  deleteCalendarEvent,
  getEventById,
  rescheduleCalendarEvent,
  blockDayCalendar,
};
