/**
 * Normaliza el body de POST /api/config para alinearlo con los límites VARCHAR
 * de `business_config` y evitar `undefined` en parámetros de node-pg (provoca 500).
 */

/**
 * @param {unknown} value
 * @param {number} maxLen
 * @returns {string}
 */
function sliceStr(value, maxLen) {
  if (value == null) {
    return '';
  }
  return String(value).slice(0, maxLen);
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function clampHour(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return 9;
  }
  return Math.max(0, Math.min(23, Math.round(n)));
}

/**
 * @param {import('express').Request['body']} body
 * @param {string} businessIdParam
 */
function normalizeBusinessConfigPayload(body, businessIdParam) {
  const businessId = sliceStr(businessIdParam, 100);
  const name = sliceStr(body?.name, 150) || 'Sin nombre';
  const slogan = sliceStr(body?.slogan, 200);
  const owner_phone = sliceStr(body?.owner_phone, 20);
  const type = sliceStr(body?.type, 80) || 'consultorio';
  const start_hour = clampHour(body?.start_hour);
  const end_hour = clampHour(body?.end_hour);
  const tone = sliceStr(body?.tone, 80) || 'amigable';
  const welcome_message = body?.welcome_message == null ? '' : String(body.welcome_message);
  const active_announcement =
    body?.active_announcement == null || body.active_announcement === ''
      ? ''
      : String(body.active_announcement);
  const services = Array.isArray(body?.services) ? body.services : [];

  return {
    businessId,
    name,
    slogan,
    owner_phone,
    type,
    start_hour,
    end_hour,
    tone,
    welcome_message,
    active_announcement,
    services,
  };
}

module.exports = { normalizeBusinessConfigPayload };
