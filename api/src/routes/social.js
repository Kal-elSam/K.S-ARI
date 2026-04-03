const { pool } = require('../core/db');
const social = require('../social/socialService');

/**
 * @param {import('express').Express} app
 */
function registerSocialRoutes(app) {
  app.post('/api/social/generate', async (req, res) => {
    try {
      const { topic, tone, businessId } = req.body;

      if (!topic || typeof topic !== 'string') {
        return res.status(400).json({ error: 'El campo topic es obligatorio.' });
      }

      const generated = await social.generatePostContent(businessId || 'demo', topic, tone || 'Profesional');
      const preview = social.buildSocialCaption(generated.content, generated.hashtags);

      return res.status(200).json({
        content: generated.content,
        hashtags: generated.hashtags,
        preview,
      });
    } catch (error) {
      console.error('[ERROR API] /api/social/generate:', error.message);
      return res.status(500).json({ error: 'No se pudo generar el contenido social.' });
    }
  });

  app.post('/api/social/schedule/config', async (req, res) => {
    try {
      const {
        businessId,
        frequency,
        post_times,
        topics,
        platforms,
        tone,
        image_source,
      } = req.body;

      const safeBusinessId = String(businessId || '').trim();
      if (!safeBusinessId) {
        return res.status(400).json({ error: 'businessId es obligatorio.' });
      }
      if (post_times !== undefined && !Array.isArray(post_times)) {
        return res.status(400).json({ error: 'post_times debe ser un arreglo JSON.' });
      }
      if (topics !== undefined && !Array.isArray(topics)) {
        return res.status(400).json({ error: 'topics debe ser un arreglo JSON.' });
      }
      if (platforms !== undefined && !Array.isArray(platforms)) {
        return res.status(400).json({ error: 'platforms debe ser un arreglo JSON.' });
      }

      const safeFrequency = social.VALID_SOCIAL_FREQUENCIES.has(frequency) ? frequency : 'daily';
      const safePostTimes = social.normalizePostTimes(post_times);
      const safeTopics = social.normalizeStringArray(topics);
      const safePlatforms = social.normalizePlatformsArray(platforms);
      const safeTone = String(tone || 'Profesional').trim() || 'Profesional';
      const safeImageSource = social.VALID_IMAGE_SOURCES.has(image_source) ? image_source : 'auto';

      const result = await pool.query(
        `INSERT INTO social_schedules (
        business_id,
        frequency,
        post_times,
        topics,
        platforms,
        tone,
        image_source
      )
      VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7)
      ON CONFLICT (business_id) DO UPDATE
      SET
        frequency = EXCLUDED.frequency,
        post_times = EXCLUDED.post_times,
        topics = EXCLUDED.topics,
        platforms = EXCLUDED.platforms,
        tone = EXCLUDED.tone,
        image_source = EXCLUDED.image_source,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *`,
        [
          safeBusinessId,
          safeFrequency,
          JSON.stringify(safePostTimes.length > 0 ? safePostTimes : ['10:00', '18:00']),
          JSON.stringify(safeTopics),
          JSON.stringify(safePlatforms.length > 0 ? safePlatforms : ['instagram', 'facebook']),
          safeTone,
          safeImageSource,
        ]
      );

      return res.status(200).json(result.rows[0]);
    } catch (error) {
      console.error('[ERROR API] /api/social/schedule/config:', error.message);
      return res.status(500).json({ error: 'No se pudo guardar la configuración de automatización.' });
    }
  });

  app.get('/api/social/schedule/config/:businessId', async (req, res) => {
    try {
      const { businessId } = req.params;
      const config = await social.getSocialScheduleConfig(businessId);
      return res.status(200).json(config);
    } catch (error) {
      console.error('[ERROR API] /api/social/schedule/config/:businessId:', error.message);
      return res.status(500).json({ error: 'No se pudo leer la configuración de automatización.' });
    }
  });

  app.post('/api/social/schedule/toggle', async (req, res) => {
    try {
      const { businessId, active } = req.body;
      const safeBusinessId = String(businessId || '').trim();
      if (!safeBusinessId) {
        return res.status(400).json({ error: 'businessId es obligatorio.' });
      }
      if (typeof active !== 'boolean') {
        return res.status(400).json({ error: 'El campo active debe ser booleano.' });
      }

      await pool.query(
        `INSERT INTO social_schedules (business_id, is_active)
       VALUES ($1, $2)
       ON CONFLICT (business_id) DO UPDATE
       SET is_active = EXCLUDED.is_active, updated_at = CURRENT_TIMESTAMP`,
        [safeBusinessId, active]
      );

      let nextPost = null;
      if (active) {
        const result = await social.startAutoPublisher(safeBusinessId);
        nextPost = result.nextPost;
      } else {
        await social.stopAutoPublisher(safeBusinessId);
      }

      return res.status(200).json({ success: true, is_active: active, nextPost });
    } catch (error) {
      console.error('[ERROR API] /api/social/schedule/toggle:', error.message);
      return res.status(500).json({ error: 'No se pudo actualizar el estado de automatización.' });
    }
  });

  app.post('/api/social/images', async (req, res) => {
    try {
      const { businessId, url, topic_tags } = req.body;
      const safeBusinessId = String(businessId || '').trim();
      const safeUrl = String(url || '').trim();
      const safeTopicTags = social.normalizeStringArray(topic_tags);

      if (!safeBusinessId) {
        return res.status(400).json({ error: 'businessId es obligatorio.' });
      }
      if (!safeUrl || !social.isValidHttpUrl(safeUrl)) {
        return res.status(400).json({ error: 'url debe ser una URL válida.' });
      }
      if (topic_tags !== undefined && !Array.isArray(topic_tags)) {
        return res.status(400).json({ error: 'topic_tags debe ser un arreglo JSON.' });
      }

      const result = await pool.query(
        `INSERT INTO social_images (business_id, url, topic_tags, source)
       VALUES ($1, $2, $3::jsonb, 'own')
       RETURNING *`,
        [safeBusinessId, safeUrl, JSON.stringify(safeTopicTags)]
      );

      return res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('[ERROR API] /api/social/images:', error.message);
      return res.status(500).json({ error: 'No se pudo guardar la imagen.' });
    }
  });

  app.get('/api/social/images/:businessId', async (req, res) => {
    try {
      const { businessId } = req.params;
      const safeBusinessId = String(businessId || '').trim();
      if (!safeBusinessId) {
        return res.status(400).json({ error: 'businessId es obligatorio.' });
      }

      const { rows } = await pool.query(
        `SELECT id, business_id, url, topic_tags, source, created_at
       FROM social_images
       WHERE business_id = $1
       ORDER BY created_at DESC`,
        [safeBusinessId]
      );

      return res.status(200).json(rows);
    } catch (error) {
      console.error('[ERROR API] /api/social/images/:businessId:', error.message);
      return res.status(500).json({ error: 'No se pudo obtener el banco de imágenes.' });
    }
  });

  app.delete('/api/social/images/:imageId', async (req, res) => {
    try {
      const { imageId } = req.params;
      const result = await pool.query('DELETE FROM social_images WHERE id = $1 RETURNING id', [imageId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Imagen no encontrada.' });
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('[ERROR API] /api/social/images/:imageId:', error.message);
      return res.status(500).json({ error: 'No se pudo eliminar la imagen.' });
    }
  });

  app.post('/api/social/publish/now', async (req, res) => {
    try {
      const { businessId, topic, platforms, tone, content, hashtags, imageUrl } = req.body;
      const safeBusinessId = String(businessId || 'demo').trim() || 'demo';
      if (platforms !== undefined && !Array.isArray(platforms)) {
        return res.status(400).json({ error: 'platforms debe ser un arreglo JSON.' });
      }
      const schedule = await social.getSocialScheduleConfig(safeBusinessId);

      const safeTopic = String(topic || '').trim() || social.getNextTopicForBusiness(safeBusinessId, schedule.topics);
      const safeTone = String(tone || '').trim() || schedule.tone || 'Profesional';
      const requestedPlatforms = social.normalizePlatformsArray(platforms);
      const safePlatforms = requestedPlatforms.length > 0 ? requestedPlatforms : schedule.platforms;

      const preContent = typeof content === 'string' ? content.trim() : '';
      const publishOptions =
        preContent || (typeof imageUrl === 'string' && imageUrl.trim())
          ? {
              content: preContent || undefined,
              hashtags,
              imageUrl: typeof imageUrl === 'string' ? imageUrl.trim() : '',
            }
          : undefined;

      const publication = await social.autoGenerateAndPublish(
        safeBusinessId,
        safeTopic,
        safePlatforms,
        safeTone,
        schedule.image_source,
        publishOptions
      );

      return res.status(200).json({
        success: true,
        topic: safeTopic,
        platforms: safePlatforms,
        ...publication,
      });
    } catch (error) {
      console.error('[ERROR API] /api/social/publish/now:', error.message);
      return res.status(500).json({ error: 'No se pudo publicar ahora.' });
    }
  });

  app.post('/api/social/publish', async (req, res) => {
    try {
      const { content, hashtags, platform, imageUrl, businessId, topic, tone } = req.body;
      const normalizedPlatform = social.validateSocialPlatform(platform);

      if (!normalizedPlatform) {
        return res.status(400).json({ error: 'Plataforma inválida. Usa instagram, facebook o both.' });
      }

      let safeContent = typeof content === 'string' ? content.trim() : '';
      let safeHashtags = social.formatHashtags(hashtags);

      if (!safeContent) {
        const safeTopic = typeof topic === 'string' ? topic.trim() : '';
        if (!safeTopic) {
          return res.status(400).json({ error: 'Debes enviar content o topic para publicar.' });
        }
        const safeBusinessId = String(businessId || 'demo').trim() || 'demo';
        const safeTone = String(tone || 'Profesional').trim() || 'Profesional';
        const generated = await social.generatePostContent(safeBusinessId, safeTopic, safeTone);
        safeContent = generated.content;
        safeHashtags = generated.hashtags;
      }

      const publication = await social.publishByPlatform(normalizedPlatform, safeContent, safeHashtags, imageUrl);

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
          String(businessId || 'demo').trim() || 'demo',
          normalizedPlatform,
          safeContent,
          String(imageUrl || '').trim() || null,
          safeHashtags || null,
          publication.ig_post_id,
          publication.fb_post_id,
        ]
      );

      return res.status(200).json({
        success: true,
        ig_post_id: publication.ig_post_id,
        fb_post_id: publication.fb_post_id,
      });
    } catch (error) {
      console.error('[ERROR API] /api/social/publish:', error.message);
      return res.status(500).json({ error: 'No se pudo publicar el contenido social.' });
    }
  });

  app.post('/api/social/schedule', async (req, res) => {
    try {
      const { content, hashtags, platform, imageUrl, scheduledAt, businessId } = req.body;
      if (!content || typeof content !== 'string') {
        return res.status(400).json({ error: 'El campo content es obligatorio.' });
      }
      if (!scheduledAt || typeof scheduledAt !== 'string') {
        return res.status(400).json({ error: 'El campo scheduledAt es obligatorio.' });
      }

      const post = await social.schedulePost(
        businessId || 'demo',
        platform,
        content,
        hashtags,
        scheduledAt,
        imageUrl
      );

      return res.status(200).json({
        success: true,
        post_id: post.id,
        scheduledAt: post.scheduled_at,
      });
    } catch (error) {
      console.error('[ERROR API] /api/social/schedule:', error.message);
      return res.status(500).json({ error: 'No se pudo programar la publicación.' });
    }
  });

  app.get('/api/social/posts', async (req, res) => {
    try {
      const businessId = String(req.query.businessId || 'demo').trim() || 'demo';
      const status = String(req.query.status || 'all').trim().toLowerCase();

      let query = `
      SELECT id, business_id, platform, content, image_url, hashtags, scheduled_at,
             published_at, status, ig_post_id, fb_post_id, created_at, updated_at
      FROM social_posts
      WHERE business_id = $1
    `;
      const values = [businessId];

      if (status !== 'all') {
        query += ' AND status = $2';
        values.push(status);
      }

      query += ' ORDER BY created_at DESC';

      const { rows } = await pool.query(query, values);
      return res.status(200).json(rows);
    } catch (error) {
      console.error('[ERROR API] /api/social/posts:', error.message);
      return res.status(500).json({ error: 'No se pudo obtener el historial de publicaciones.' });
    }
  });

  app.delete('/api/social/posts/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { rows } = await pool.query('SELECT id, status FROM social_posts WHERE id = $1 LIMIT 1', [id]);

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Publicación no encontrada.' });
      }

      const post = rows[0];
      if (post.status === 'published') {
        return res.status(400).json({ error: 'No se puede eliminar una publicación ya publicada.' });
      }

      const timeoutId = social.scheduledSocialTimeouts.get(post.id);
      if (timeoutId) {
        clearTimeout(timeoutId);
        social.scheduledSocialTimeouts.delete(post.id);
      }

      await pool.query('DELETE FROM social_posts WHERE id = $1', [id]);
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('[ERROR API] /api/social/posts/:id (DELETE):', error.message);
      return res.status(500).json({ error: 'No se pudo eliminar la publicación.' });
    }
  });
}

module.exports = { registerSocialRoutes };
