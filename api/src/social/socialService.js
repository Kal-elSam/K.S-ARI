const cron = require('node-cron');
const { pool } = require('../db');
const { TIMEZONE } = require('../constants');
const { callAI } = require('../groq');
const { getBusinessConfig } = require('../businessConfig');


const GRAPH_API_BASE = 'https://graph.facebook.com/v18.0';
const SOCIAL_PLACEHOLDER_IMAGE_URL =
  'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=1080';
const scheduledSocialTimeouts = new Map();
const activeSocialJobsByBusiness = new Map();
const topicRotationByBusiness = new Map();
const VALID_SOCIAL_FREQUENCIES = new Set(['daily', '3x_week', '5x_week']);
const VALID_IMAGE_SOURCES = new Set(['own', 'unsplash', 'auto']);

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

async function generatePostContent(businessId, topic, tone) {
  try {
    const safeBusinessId = String(businessId || 'demo').trim() || 'demo';
    const safeTopic = String(topic || '').trim();
    const safeTone = String(tone || 'Profesional').trim();

    if (!safeTopic) {
      throw new Error('El tema del post es obligatorio.');
    }

    const config = await getBusinessConfig(safeBusinessId);

    const systemPrompt = `Eres estratega senior de redes sociales para negocios en México.
Genera copy para Instagram y Facebook en español mexicano.
Debes responder SOLO JSON válido con esta forma exacta:
{"content":"...","hashtags":["#uno","#dos","#tres","#cuatro","#cinco"]}
Reglas:
- content máximo 150 palabras
- incluir emojis adecuados al tono solicitado
- hashtags exactamente 5, relevantes y en español cuando aplique
- no agregues texto fuera del JSON`;

    const userPrompt = `Negocio: ${config.name}
Tipo: ${config.type}
Slogan: ${config.slogan || 'Sin slogan'}
Servicios: ${Array.isArray(config.services) ? JSON.stringify(config.services) : '[]'}
Anuncio activo: ${config.active_announcement || 'Sin anuncio'}
Tema del post: ${safeTopic}
Tono: ${safeTone}
`;

    const aiRaw = await callAI(systemPrompt, userPrompt);
    const cleaned = String(aiRaw || '').trim();

    const extractedJson =
      cleaned.match(/\{[\s\S]*\}/)?.[0] ||
      '{"content":"No se pudo generar contenido.","hashtags":["#ari","#negocio","#mexico","#marketing","#social"]}';

    const parsed = JSON.parse(extractedJson);
    const content = String(parsed.content || '').trim();
    const hashtags = formatHashtags(parsed.hashtags);

    if (!content) {
      throw new Error('La IA no devolvió contenido válido.');
    }

    return { content, hashtags };
  } catch (error) {
    console.error('[ERROR SOCIAL] generatePostContent:', error.message);
    throw error;
  }
}

async function publishToInstagram(content, imageUrl) {
  try {
    const pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN;
    if (!pageAccessToken) {
      throw new Error('META_PAGE_ACCESS_TOKEN no está configurado en .env');
    }
    const igAccountId = process.env.META_IG_ACCOUNT_ID;

    if (!igAccountId) {
      throw new Error('META_IG_ACCOUNT_ID no está configurado en .env');
    }

    const safeImageUrl = String(imageUrl || '').trim() || SOCIAL_PLACEHOLDER_IMAGE_URL;
    const caption = buildSocialCaption(content, '');
    const mediaUrl = `${GRAPH_API_BASE}/${igAccountId}/media`;
    const publishUrl = `${GRAPH_API_BASE}/${igAccountId}/media_publish`;

    const createResponse = await fetch(mediaUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${pageAccessToken}`,
      },
      body: new URLSearchParams({
        image_url: safeImageUrl,
        caption,
      }),
    });

    const createData = await createResponse.json();
    if (!createResponse.ok || !createData.id) {
      throw new Error(createData.error?.message || 'No se pudo crear el contenedor de Instagram.');
    }

    // Instagram procesa el contenedor de forma asíncrona; sin espera suele fallar "Media ID is not available".
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const publishResponse = await fetch(publishUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${pageAccessToken}`,
      },
      body: new URLSearchParams({
        creation_id: createData.id,
      }),
    });

    const publishData = await publishResponse.json();
    if (!publishResponse.ok || !publishData.id) {
      throw new Error(publishData.error?.message || 'No se pudo publicar en Instagram.');
    }

    return publishData.id;
  } catch (error) {
    console.error('[ERROR SOCIAL] publishToInstagram:', error.message);
    throw error;
  }
}

async function publishToFacebook(content, imageUrl) {
  try {
    const pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN;
    if (!pageAccessToken) {
      throw new Error('META_PAGE_ACCESS_TOKEN no está configurado en .env');
    }
    const pageId = process.env.META_PAGE_ID;
    if (!pageId) {
      throw new Error('META_PAGE_ID no está configurado en .env');
    }

    const url = `${GRAPH_API_BASE}/${pageId}/feed`;
    const caption = buildSocialCaption(content, []);

    // Token en el body (Graph API /feed): Facebook Pages suele comportarse mejor así que con Bearer.
    const payload = new URLSearchParams({
      message: caption,
      access_token: pageAccessToken,
    });

    const safeImageUrl = String(imageUrl || '').trim();
    if (safeImageUrl) {
      payload.set('link', safeImageUrl);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload,
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || 'Error Facebook');
    }
    if (!data.id) {
      throw new Error(data.error?.message || 'No se pudo publicar en Facebook.');
    }

    console.log(`[SOCIAL] Facebook post publicado: ${data.id}`);
    return data.id;
  } catch (error) {
    console.error('[ERROR SOCIAL] publishToFacebook:', error.message);
    throw error;
  }
}

async function publishByPlatform(platform, content, hashtags, imageUrl) {
  try {
    const normalizedPlatform = validateSocialPlatform(platform);
    if (!normalizedPlatform) {
      throw new Error('Plataforma inválida. Usa instagram, facebook o both.');
    }

    const caption = buildSocialCaption(content, hashtags);
    const result = { ig_post_id: null, fb_post_id: null };

    if (normalizedPlatform === 'instagram' || normalizedPlatform === 'both') {
      result.ig_post_id = await publishToInstagram(caption, imageUrl);
    }

    if (normalizedPlatform === 'facebook' || normalizedPlatform === 'both') {
      result.fb_post_id = await publishToFacebook(caption, imageUrl);
    }

    return result;
  } catch (error) {
    console.error('[ERROR SOCIAL] publishByPlatform:', error.message);
    throw error;
  }
}

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

function doesTopicMatch(topic, tags) {
  const safeTopic = String(topic || '').trim().toLowerCase();
  const safeTags = normalizeStringArray(tags).map((tag) => tag.toLowerCase());
  if (!safeTopic || safeTags.length === 0) {
    return false;
  }

  return safeTags.some((tag) => safeTopic.includes(tag) || tag.includes(safeTopic));
}

async function getImageForPost(businessId, topic, imageSource) {
  try {
    const safeBusinessId = String(businessId || 'demo').trim() || 'demo';
    const safeTopic = String(topic || '').trim();
    const safeImageSource = VALID_IMAGE_SOURCES.has(imageSource) ? imageSource : 'auto';

    if (safeImageSource === 'own' || safeImageSource === 'auto') {
      const ownImagesResult = await pool.query(
        `SELECT id, url, topic_tags
         FROM social_images
         WHERE business_id = $1 AND source = 'own'
         ORDER BY created_at DESC`,
        [safeBusinessId]
      );

      if (ownImagesResult.rows.length > 0) {
        const exactMatch = ownImagesResult.rows.find((image) => doesTopicMatch(safeTopic, image.topic_tags));
        const selected = exactMatch || ownImagesResult.rows[0];
        const selectedUrl = String(selected.url || '').trim();
        if (selectedUrl) {
          return selectedUrl;
        }
      }
    }

    if (safeImageSource === 'unsplash' || safeImageSource === 'auto') {
      const unsplashKey = String(process.env.UNSPLASH_ACCESS_KEY || '').trim();
      if (unsplashKey) {
        // Unsplash rinde mejor con queries en inglés; traducimos el tema con la misma IA.
        let query = safeTopic || 'negocios mexico';
        try {
          const userPrompt = `Translate this topic to English in 2-3 words for an image search query, respond only with the translation: ${safeTopic}`;
          const translated = await callAI(
            'You only output the translation requested by the user, nothing else.',
            userPrompt
          );
          const cleaned = String(translated || '')
            .trim()
            .replace(/^["']|["']$/g, '')
            .split('\n')[0]
            .trim();
          if (cleaned) {
            query = cleaned;
          }
        } catch (translateError) {
          console.error('[ERROR SOCIAL] Traducción Unsplash omitida:', translateError.message);
        }

        const url = new URL('https://api.unsplash.com/search/photos');
        url.searchParams.set('query', query);
        url.searchParams.set('orientation', 'landscape');
        url.searchParams.set('per_page', '1');
        url.searchParams.set('page', Math.floor(Math.random() * 5) + 1);

        const response = await fetch(url.toString(), {
          headers: {
            Authorization: `Client-ID ${unsplashKey}`,
          },
        });
        const data = await response.json();

        if (response.ok && Array.isArray(data.results) && data.results.length > 0) {
          const imageUrl = String(data.results[0]?.urls?.regular || '').trim();
          if (imageUrl) {
            return imageUrl;
          }
        }
      }
    }

    return SOCIAL_PLACEHOLDER_IMAGE_URL;
  } catch (error) {
    console.error('[ERROR SOCIAL] getImageForPost:', error.message);
    return SOCIAL_PLACEHOLDER_IMAGE_URL;
  }
}

async function autoGenerateAndPublish(businessId, topic, platforms, tone, imageSource = 'auto') {
  try {
    const safeBusinessId = String(businessId || 'demo').trim() || 'demo';
    const topicForPost = String(topic ?? '').trim();
    const safeTone = String(tone || 'Profesional').trim() || 'Profesional';
    const safePlatforms = normalizePlatformsArray(platforms);

    if (!topicForPost) {
      throw new Error('El tema del post es obligatorio para autopublicar.');
    }
    if (safePlatforms.length === 0) {
      throw new Error('Debes indicar al menos una plataforma para autopublicar.');
    }

    const generated = await generatePostContent(safeBusinessId, topicForPost, safeTone);
    const imageUrl = await getImageForPost(safeBusinessId, topicForPost, imageSource);
    const caption = buildSocialCaption(generated.content, generated.hashtags);

    let igPostId = null;
    let fbPostId = null;

    for (const platform of safePlatforms) {
      if (platform === 'instagram') {
        igPostId = await publishToInstagram(caption, imageUrl);
      }
      if (platform === 'facebook') {
        fbPostId = await publishToFacebook(caption, imageUrl);
      }
    }

    const platformForDb =
      safePlatforms.length === 2
        ? 'both'
        : safePlatforms[0];

    await pool.query(
      `INSERT INTO social_posts (
        business_id,
        platform,
        content,
        image_url,
        hashtags,
        status,
        published_at,
        ig_post_id,
        fb_post_id
      )
      VALUES ($1, $2, $3, $4, $5, 'published', CURRENT_TIMESTAMP, $6, $7)`,
      [
        safeBusinessId,
        platformForDb,
        generated.content,
        imageUrl,
        generated.hashtags,
        igPostId,
        fbPostId,
      ]
    );

    return {
      ig_post_id: igPostId,
      fb_post_id: fbPostId,
      content: generated.content,
      imageUrl,
    };
  } catch (error) {
    console.error('[ERROR SOCIAL] autoGenerateAndPublish:', error.message);
    throw error;
  }
}

function matchesFrequencyDate(date, frequency) {
  const day = date.getDay(); // 0=domingo, 1=lunes, ... 6=sábado
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
          try {
            const topic = getNextTopicForBusiness(safeBusinessId, topics);
            const publication = await autoGenerateAndPublish(
              safeBusinessId,
              topic,
              platforms,
              tone,
              imageSource
            );
            console.log(
              `[CRON] Publicación automática completada para ${safeBusinessId} (${new Date().toISOString()}) | topic="${topic}" | ig=${publication.ig_post_id || '-'} | fb=${publication.fb_post_id || '-'}`
            );
          } catch (error) {
            console.error('[CRON] Error en publicación automática:', error.message);
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
  VALID_SOCIAL_FREQUENCIES,
  VALID_IMAGE_SOURCES,
  normalizeStringArray,
  normalizePlatformsArray,
  normalizePostTimes,
  isValidHttpUrl,
  validateSocialPlatform,
  formatHashtags,
  buildSocialCaption,
  generatePostContent,
  publishByPlatform,
  getSocialScheduleConfig,
  getNextTopicForBusiness,
  autoGenerateAndPublish,
  startAutoPublisher,
  stopAutoPublisher,
  initActiveSchedules,
  schedulePost,
  scheduledSocialTimeouts,
};
