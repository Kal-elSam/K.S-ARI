const { TIMEZONE } = require('../core/constants');

function getDatePartsInTimezone(date, timezone = TIMEZONE) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);
  return { year, month, day };
}

function buildDateAtNoonUTC(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

/**
 * Calcula "mañana" como Date en timezone Mexico City.
 * Respeta el cambio de horario de verano (DST).
 */
function getTomorrowInMexico() {
  const hoy = getTodayInTimezone();
  return addCalendarDays(hoy, 1);
}

function getTodayInTimezone(timezone = TIMEZONE) {
  const { year, month, day } = getDatePartsInTimezone(new Date(), timezone);
  return buildDateAtNoonUTC(year, month, day);
}

function formatDateDDMMYYYY(date, timezone = TIMEZONE) {
  const { year, month, day } = getDatePartsInTimezone(date, timezone);
  const dayStr = String(day).padStart(2, '0');
  const monthStr = String(month).padStart(2, '0');
  return `${dayStr}/${monthStr}/${year}`;
}

function formatDateISOYYYYMMDD(date, timezone = TIMEZONE) {
  const { year, month, day } = getDatePartsInTimezone(date, timezone);
  const dayStr = String(day).padStart(2, '0');
  const monthStr = String(month).padStart(2, '0');
  return `${year}-${monthStr}-${dayStr}`;
}

function parseISODateToUTCNoon(isoDate) {
  const [yearStr, monthStr, dayStr] = isoDate.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  return buildDateAtNoonUTC(year, month, day);
}

function addCalendarDays(date, daysToAdd) {
  const nextDate = new Date(date.getTime());
  nextDate.setUTCDate(nextDate.getUTCDate() + daysToAdd);
  return nextDate;
}

function formatFechaTextoUsuario(isoDate, timezone = TIMEZONE) {
  const date = parseISODateToUTCNoon(isoDate);
  const formatter = new Intl.DateTimeFormat('es-MX', {
    timeZone: timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return `el ${formatter.format(date).toLowerCase()}`;
}

/**
 * Convierte un slot { start: "HH:MM", end: "HH:MM" } a ISO con offset CST para una fecha.
 *
 * @param {string} fechaISO - Fecha en formato "YYYY-MM-DD" (hora local Mexico)
 * @param {string} horaHHMM - Hora en formato "HH:MM"
 * @returns {string} ISO 8601 con offset, e.g. "2025-03-26T10:00:00-06:00"
 */
function buildISOWithOffset(fechaISO, horaHHMM) {
  return `${fechaISO}T${horaHHMM}:00-06:00`;
}

/**
 * Formatea un slot de hora para mostrarlo en un mensaje de WhatsApp.
 * e.g., "10:00" → "10:00am"
 */
function formatSlotForUser(horaHHMM) {
  const [hStr] = horaHHMM.split(':');
  const hora = parseInt(hStr, 10);
  const sufijo = hora < 12 ? 'am' : 'pm';
  const hora12 = hora <= 12 ? hora : hora - 12;
  return `${hora12}:00${sufijo}`;
}

module.exports = {
  getTomorrowInMexico,
  getTodayInTimezone,
  formatDateDDMMYYYY,
  formatDateISOYYYYMMDD,
  parseISODateToUTCNoon,
  addCalendarDays,
  formatFechaTextoUsuario,
  buildISOWithOffset,
  formatSlotForUser,
};
