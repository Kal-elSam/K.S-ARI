/**
 * Calcula "mañana" como Date en timezone Mexico City.
 * Respeta el cambio de horario de verano (DST).
 */
function getTomorrowInMexico() {
  const ahora = new Date();
  return new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
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
  buildISOWithOffset,
  formatSlotForUser,
};
