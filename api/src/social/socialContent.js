const { pool } = require('../db');
const { callAI } = require('../groq');
const { getBusinessConfig } = require('../businessConfig');
const { VALID_IMAGE_SOURCES, SOCIAL_PLACEHOLDER_IMAGE_URL } = require('./socialConstants');
const { formatHashtags, doesTopicMatch } = require('./socialHelpers');

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

module.exports = {
  generatePostContent,
  getImageForPost,
};
