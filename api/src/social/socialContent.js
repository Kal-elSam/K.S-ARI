const { pool } = require('../core/db');
const { callAI } = require('../groq');
const { getBusinessConfig } = require('../businessConfig');
const {
  VALID_IMAGE_SOURCES,
  SOCIAL_PLACEHOLDER_IMAGE_URL,
  UNSPLASH_TECH_BUSINESS_COLLECTION_IDS,
} = require('./socialConstants');
const { formatHashtags, doesTopicMatch } = require('./socialHelpers');

/**
 * Consultas fijas más alineadas al tema (evita resultados genéricos tipo banca).
 */
function unsplashQueryFromTopicKeywords(safeTopic) {
  const t = String(safeTopic || '').toLowerCase();
  if (/software|tecnolog(í|i)a|digital|automatizaci(ó|o)n|whatsapp/.test(t)) {
    return 'technology business laptop workspace';
  }
  if (/servicios|planes|precio/.test(t)) {
    return 'business meeting professional';
  }
  return null;
}

/**
 * El modelo a menudo inserta saltos de línea reales dentro de "content", lo que rompe JSON.parse.
 * Escapa \\n solo dentro de strings (entre comillas no escapadas).
 */
function escapeNewlinesInsideJsonStrings(jsonStr) {
  const s = typeof jsonStr === 'string' ? jsonStr : '';
  let out = '';
  let inString = false;
  let escapeNext = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escapeNext) {
      out += ch;
      escapeNext = false;
      continue;
    }
    if (ch === '\\') {
      out += ch;
      escapeNext = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }
    if (inString && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && s[i + 1] === '\n') {
        i++;
      }
      out += '\\n';
      continue;
    }
    out += ch;
  }
  return out;
}

function stripMarkdownJsonFence(text) {
  let s = String(text || '').trim();
  s = s.replace(/^```(?:json)?\s*/i, '');
  s = s.replace(/\s*```$/i, '');
  return s.trim();
}

function extractJsonObject(text) {
  const s = stripMarkdownJsonFence(text);
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return s.slice(start, end + 1);
}

function parseSocialJsonFromAi(aiRaw) {
  const block = extractJsonObject(aiRaw);
  if (!block) {
    return null;
  }
  try {
    return JSON.parse(block);
  } catch {
    try {
      return JSON.parse(escapeNewlinesInsideJsonStrings(block));
    } catch {
      return null;
    }
  }
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
CRÍTICO: el JSON debe ser parseable. Dentro de "content" NO escribas saltos de línea reales; usa el escape \\n (barra invertida + n) para separar párrafos.
Reglas:
- content máximo 150 palabras
- el texto debe tener párrafos cortos separados por \\n; máximo 3 párrafos; cada párrafo máximo 2 oraciones
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

    const parsed =
      parseSocialJsonFromAi(aiRaw) || {
        content: 'No se pudo generar contenido.',
        hashtags: ['#ari', '#negocio', '#mexico', '#marketing', '#social'],
      };
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
        let queryEN = safeTopic || 'modern business teamwork';
        const keywordQuery = unsplashQueryFromTopicKeywords(safeTopic);
        if (keywordQuery) {
          queryEN = keywordQuery;
        } else {
          try {
            const userPrompt = `Translate this topic to a 2-3 word English search query for stock photos. Respond with ONLY the translation, nothing else: ${safeTopic}`;
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
              queryEN = cleaned;
            }
          } catch (translateError) {
            console.error('[ERROR SOCIAL] Traducción Unsplash omitida:', translateError.message);
          }
        }

        console.log(`[UNSPLASH] Buscando imagen para topic: "${safeTopic}" → query en inglés: "${queryEN}"`);

        const url = new URL('https://api.unsplash.com/search/photos');
        url.searchParams.set('query', queryEN);
        url.searchParams.set('orientation', 'landscape');
        url.searchParams.set('content_filter', 'high');
        url.searchParams.set('per_page', '10');
        url.searchParams.set('page', String(Math.floor(Math.random() * 3) + 1));
        if (UNSPLASH_TECH_BUSINESS_COLLECTION_IDS) {
          url.searchParams.set('collections', UNSPLASH_TECH_BUSINESS_COLLECTION_IDS);
        }

        const response = await fetch(url.toString(), {
          headers: {
            Authorization: `Client-ID ${unsplashKey}`,
          },
        });
        const data = await response.json();
        const results = Array.isArray(data.results) ? data.results : [];

        if (response.ok && results.length > 0) {
          const randomIndex = Math.floor(Math.random() * Math.min(results.length, 5));
          const pick = results[randomIndex];
          const width = typeof pick?.width === 'number' ? pick.width : 1080;
          if (width < 400) {
            return SOCIAL_PLACEHOLDER_IMAGE_URL;
          }
          const imageUrl = String(pick?.urls?.regular || '').trim();
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
