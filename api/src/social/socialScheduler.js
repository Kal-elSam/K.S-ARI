const cron = require('node-cron');
const { pool } = require('../core/db');
const { TIMEZONE } = require('../core/constants');
const { VALID_SOCIAL_FREQUENCIES, VALID_IMAGE_SOURCES } = require('./socialConstants');
const {
  scheduledSocialTimeouts,
  activeSocialJobsByBusiness,
  topicRotationByBusiness,
} = require('./socialState');
const {
  normalizeStringArray,
  normalizePlatformsArray,
  normalizePostTimes,
  validateSocialPlatform,
  formatHashtags,
  buildCronExpression,
  getNextPostDate,
  getNextTopicForBusiness,
} = require('./socialHelpers');
const { getSocialScheduleConfig } = require('./socialScheduleConfig');
const { publishByPlatform } = require('./socialGraphApi');
const { autoGenerateAndPublish } = require('./socialAutoPublish');

async function stopAutoPublisher(businessId) {
  try {
    const safeBusinessId = String(businessId || 'demo').trim() || 'demo';
    const jobs = activeSocialJobsByBusiness.get(safeBusinessId) || [];
    for (const job of jobs) {
      job.stop();
    }
    activeSocialJobsByBusiness.delete(safeBusinessId);
    topicRotationByBusiness.delete(safeBusinessId);
  } catch (error) {
    console.error('[ERROR SOCIAL] stopAutoPublisher:', error.message);
  }
}

async function startAutoPublisher(businessId) {
  try {
    const safeBusinessId = String(businessId || 'demo').trim() || 'demo';
    const schedule = await getSocialScheduleConfig(safeBusinessId);

    await stopAutoPublisher(safeBusinessId);

    if (!schedule.is_active) {
      return { started: false, nextPost: null };
    }

    const safeTopics = normalizeStringArray(schedule.topics);
    const topics = safeTopics.length > 0 ? safeTopics : ['servicios', 'promociones', 'tips'];
    const safePlatforms = normalizePlatformsArray(schedule.platforms);
    const platforms = safePlatforms.length > 0 ? safePlatforms : ['instagram', 'facebook'];
    const safeTimes = normalizePostTimes(schedule.post_times);
    const postTimes = safeTimes.length > 0 ? safeTimes : ['10:00'];
    const frequency = VALID_SOCIAL_FREQUENCIES.has(schedule.frequency) ? schedule.frequency : 'daily';
    const tone = String(schedule.tone || 'Profesional').trim() || 'Profesional';
    const imageSource = VALID_IMAGE_SOURCES.has(schedule.image_source) ? schedule.image_source : 'auto';
    const jobs = [];

    for (const time of postTimes) {
      const expression = buildCronExpression(time, frequency);
      const job = cron.schedule(
        expression,
        async () => {
          const topic = getNextTopicForBusiness(safeBusinessId, topics);
          console.log(`[CRON] Disparando publicación para ${safeBusinessId} - topic: ${topic}`);
          try {
            const result = await autoGenerateAndPublish(
              safeBusinessId,
              topic,
              platforms,
              tone,
              imageSource
            );
            console.log(`[CRON] ✅ Publicación exitosa:`, result);
          } catch (err) {
            console.error(`[CRON] ❌ Error al publicar:`, err.message);
          }
        },
        { timezone: TIMEZONE }
      );
      jobs.push(job);
    }

    activeSocialJobsByBusiness.set(safeBusinessId, jobs);
    return {
      started: jobs.length > 0,
      nextPost: getNextPostDate({
        frequency,
        post_times: postTimes,
      }),
    };
  } catch (error) {
    console.error('[ERROR SOCIAL] startAutoPublisher:', error.message);
    throw error;
  }
}

async function initActiveSchedules() {
  try {
    const { rows } = await pool.query(
      `SELECT business_id
       FROM social_schedules
       WHERE is_active = true`
    );

    for (const row of rows) {
      await startAutoPublisher(row.business_id);
    }

    console.log(`[CRON] Schedules activos inicializados: ${rows.length}`);
  } catch (error) {
    console.error('[ERROR SOCIAL] initActiveSchedules:', error.message);
    throw error;
  }
}

async function executeScheduledPost(postId) {
  try {
    const { rows } = await pool.query('SELECT * FROM social_posts WHERE id = $1 LIMIT 1', [postId]);
    if (rows.length === 0) {
      return;
    }

    const post = rows[0];
    if (post.status !== 'scheduled') {
      return;
    }

    const publication = await publishByPlatform(
      post.platform,
      post.content,
      post.hashtags || '',
      post.image_url || ''
    );

    await pool.query(
      `UPDATE social_posts
       SET status = 'published',
           ig_post_id = $1,
           fb_post_id = $2,
           published_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [publication.ig_post_id, publication.fb_post_id, post.id]
    );
  } catch (error) {
    console.error('[ERROR SOCIAL] executeScheduledPost:', error.message);
    await pool.query(
      `UPDATE social_posts
       SET status = 'failed', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [postId]
    );
  } finally {
    scheduledSocialTimeouts.delete(postId);
  }
}

async function schedulePost(businessId, platform, content, hashtags, scheduledAt, imageUrl) {
  try {
    const safeBusinessId = String(businessId || 'demo').trim() || 'demo';
    const normalizedPlatform = validateSocialPlatform(platform);
    if (!normalizedPlatform) {
      throw new Error('Plataforma inválida. Usa instagram, facebook o both.');
    }

    const safeContent = String(content || '').trim();
    if (!safeContent) {
      throw new Error('El contenido es obligatorio para programar.');
    }

    const safeScheduledAt = new Date(scheduledAt);
    if (Number.isNaN(safeScheduledAt.getTime())) {
      throw new Error('scheduledAt no tiene un formato de fecha válido.');
    }

    const safeHashtags = formatHashtags(hashtags);
    const safeImageUrl = String(imageUrl || '').trim();

    const insertResult = await pool.query(
      `INSERT INTO social_posts (
        business_id,
        platform,
        content,
        image_url,
        hashtags,
        scheduled_at,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'scheduled')
      RETURNING *`,
      [
        safeBusinessId,
        normalizedPlatform,
        safeContent,
        safeImageUrl || null,
        safeHashtags || null,
        safeScheduledAt.toISOString(),
      ]
    );

    const post = insertResult.rows[0];
    const delay = safeScheduledAt.getTime() - Date.now();

    const timeoutId = setTimeout(() => {
      void executeScheduledPost(post.id);
    }, Math.max(delay, 0));

    scheduledSocialTimeouts.set(post.id, timeoutId);

    return post;
  } catch (error) {
    console.error('[ERROR SOCIAL] schedulePost:', error.message);
    throw error;
  }
}

module.exports = {
  stopAutoPublisher,
  startAutoPublisher,
  initActiveSchedules,
  executeScheduledPost,
  schedulePost,
};
