const { VALID_SOCIAL_FREQUENCIES } = require('./socialConstants');
const { topicRotationByBusiness } = require('./socialState');

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function normalizePlatformsArray(platforms) {
  const values = normalizeStringArray(platforms)
    .map((item) => item.toLowerCase())
    .filter((item) => item === 'instagram' || item === 'facebook');

  return Array.from(new Set(values));
}

function normalizePostTimes(postTimes) {
  const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
  return normalizeStringArray(postTimes).filter((time) => regex.test(time));
}

function isValidHttpUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl || '').trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function getCronDayOfWeek(frequency) {
  if (frequency === '3x_week') {
    return '1,3,5';
  }
  if (frequency === '5x_week') {
    return '1-5';
  }
  return '*';
}

function buildCronExpression(time, frequency) {
  const [hour, minute] = String(time).split(':');
  const safeHour = Number.parseInt(hour, 10);
  const safeMinute = Number.parseInt(minute, 10);
  const dayOfWeek = getCronDayOfWeek(frequency);
  return `${safeMinute} ${safeHour} * * ${dayOfWeek}`;
}

function getDefaultSocialSchedule(businessId) {
  return {
    business_id: String(businessId || 'demo').trim() || 'demo',
    is_active: false,
    frequency: 'daily',
    post_times: ['10:00', '18:00'],
    topics: [],
    platforms: ['instagram', 'facebook'],
    tone: 'Profesional',
    image_source: 'auto',
  };
}

function getNextTopicForBusiness(businessId, topics) {
  const safeTopics = normalizeStringArray(topics);
  if (safeTopics.length === 0) {
    return 'servicios';
  }

  const currentIndex = topicRotationByBusiness.get(businessId) || 0;
  const normalizedIndex = currentIndex % safeTopics.length;
  const selectedTopic = safeTopics[normalizedIndex];
  topicRotationByBusiness.set(businessId, normalizedIndex + 1);
  return selectedTopic;
}

function validateSocialPlatform(platform) {
  const safePlatform = String(platform || '').toLowerCase();
  return safePlatform === 'instagram' || safePlatform === 'facebook' || safePlatform === 'both'
    ? safePlatform
    : null;
}

function formatHashtags(rawHashtags) {
  if (Array.isArray(rawHashtags)) {
    return rawHashtags
      .map((tag) => String(tag || '').trim())
      .filter(Boolean)
      .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`))
      .slice(0, 5)
      .join(' ');
  }

  if (typeof rawHashtags === 'string') {
    return rawHashtags
      .split(/\s+/)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .map((tag) => (tag.startsWith('#') ? tag : `#${tag}`))
      .slice(0, 5)
      .join(' ');
  }

  return '';
}

function buildSocialCaption(content, hashtags) {
  const safeContent = String(content || '').trim();
  const safeHashtags = String(hashtags || '').trim();
  if (!safeHashtags) {
    return safeContent;
  }
  return `${safeContent}\n\n${safeHashtags}`;
}

function doesTopicMatch(topic, tags) {
  const safeTopic = String(topic || '').trim().toLowerCase();
  const safeTags = normalizeStringArray(tags).map((tag) => tag.toLowerCase());
  if (!safeTopic || safeTags.length === 0) {
    return false;
  }

  return safeTags.some((tag) => safeTopic.includes(tag) || tag.includes(safeTopic));
}

function matchesFrequencyDate(date, frequency) {
  const day = date.getDay();
  if (frequency === '3x_week') {
    return day === 1 || day === 3 || day === 5;
  }
  if (frequency === '5x_week') {
    return day >= 1 && day <= 5;
  }
  return true;
}

function getNextPostDate(schedule) {
  const safeTimes = normalizePostTimes(schedule.post_times);
  const times = safeTimes.length > 0 ? safeTimes : ['10:00'];
  const frequency = VALID_SOCIAL_FREQUENCIES.has(schedule.frequency) ? schedule.frequency : 'daily';
  const now = new Date();

  for (let offsetDays = 0; offsetDays <= 14; offsetDays++) {
    const candidateDate = new Date(now);
    candidateDate.setDate(now.getDate() + offsetDays);

    if (!matchesFrequencyDate(candidateDate, frequency)) {
      continue;
    }

    for (const time of times) {
      const [hour, minute] = time.split(':').map((part) => Number.parseInt(part, 10));
      const candidate = new Date(candidateDate);
      candidate.setHours(hour, minute, 0, 0);
      if (candidate > now) {
        return candidate.toISOString();
      }
    }
  }

  return null;
}

module.exports = {
  normalizeStringArray,
  normalizePlatformsArray,
  normalizePostTimes,
  isValidHttpUrl,
  getCronDayOfWeek,
  buildCronExpression,
  getDefaultSocialSchedule,
  getNextTopicForBusiness,
  validateSocialPlatform,
  formatHashtags,
  buildSocialCaption,
  doesTopicMatch,
  matchesFrequencyDate,
  getNextPostDate,
};
