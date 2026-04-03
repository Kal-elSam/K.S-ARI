const { pool } = require('../db');
const { VALID_SOCIAL_FREQUENCIES, VALID_IMAGE_SOURCES } = require('./socialConstants');
const {
  normalizeStringArray,
  normalizePlatformsArray,
  normalizePostTimes,
  getDefaultSocialSchedule,
} = require('./socialHelpers');

async function getSocialScheduleConfig(businessId) {
  try {
    const safeBusinessId = String(businessId || 'demo').trim() || 'demo';
    const { rows } = await pool.query(
      'SELECT * FROM social_schedules WHERE business_id = $1 LIMIT 1',
      [safeBusinessId]
    );

    if (rows.length === 0) {
      return getDefaultSocialSchedule(safeBusinessId);
    }

    const schedule = rows[0];
    return {
      business_id: schedule.business_id,
      is_active: Boolean(schedule.is_active),
      frequency: VALID_SOCIAL_FREQUENCIES.has(schedule.frequency) ? schedule.frequency : 'daily',
      post_times: normalizePostTimes(schedule.post_times),
      topics: normalizeStringArray(schedule.topics),
      platforms: normalizePlatformsArray(schedule.platforms),
      tone: String(schedule.tone || 'Profesional').trim() || 'Profesional',
      image_source: VALID_IMAGE_SOURCES.has(schedule.image_source) ? schedule.image_source : 'auto',
    };
  } catch (error) {
    console.error('[ERROR SOCIAL] getSocialScheduleConfig:', error.message);
    return getDefaultSocialSchedule(businessId);
  }
}

module.exports = { getSocialScheduleConfig };
