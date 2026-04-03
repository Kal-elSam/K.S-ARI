const { pool } = require('../core/db');
const { callAI } = require('../infrastructure/groqClient');
const { getBusinessConfig } = require('../businessConfig');
const {
  VALID_IMAGE_SOURCES,
  SOCIAL_PLACEHOLDER_IMAGE_URL,
  UNSPLASH_OPTIONAL_COLLECTION_IDS,
} = require('./socialConstants');
const { formatHashtags, doesTopicMatch } = require('./socialHelpers');

function pickOwnImageForTopic(rows, topic) {
  const safeTopic = String(topic || '').trim().toLowerCase();
  if (!safeTopic || rows.length === 0) {
    return rows[0];
  }
  const exact = rows.find((image) => doesTopicMatch(topic, image.topic_tags));
  if (exact) {
    return exact;
  }
  let best = rows[0];
  let bestScore = 0;
  for (const image of rows) {
    const tags = Array.isArray(image.topic_tags) ? image.topic_tags : [];
    let score = 0;
    for (const tag of tags) {
      const g = String(tag || '').trim().toLowerCase();
      if (!g) {
        continue;
      }
      if (safeTopic.includes(g) || g.includes(safeTopic)) {
        score += 2;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = image;
    }
  }
  return best;
}

function summarizeServicesForImageContext(services) {
  if (!Array.isArray(services) || services.length === 0) {
    return 'none';
  }
  const names = services
    .slice(0, 6)
    .map((s) => (s && typeof s === 'object' && s.name ? String(s.name).trim() : ''))
    .filter(Boolean);
  return names.length ? names.join(', ') : 'none';
}

function buildStockPhotoTopicUserPrompt(topic) {
  const t = String(topic || '').trim() || 'business promotion';
  return `Convert this topic to a 2-4 word English search query 
optimized for stock photo search. Focus on visual concepts, 
not abstract ideas. Examples:
- 'ARI agente de reservas' → 'business appointment booking'
- 'automatización WhatsApp' → 'smartphone business chat'
- 'servicios Kairo Systems' → 'technology office workspace'
- 'corte de cabello' → 'barbershop haircut style'
- 'tips salud bucal' → 'dental care teeth'

Topic: ${t}
Respond with ONLY the search query, nothing else.`;
}

/**
 * Frase en inglés para Unsplash: contexto de negocio + tema con enfoque visual (stock).
 */
async function buildContextualUnsplashQuery(businessId, topic) {
  const safeId = String(businessId || 'demo').trim() || 'demo';
  const safeTopic = String(topic || '').trim();
  const config = await getBusinessConfig(safeId);
  const serviceHint = summarizeServicesForImageContext(config.services);

  const systemPrompt =
    'You follow the user instructions exactly. Output a single line: the English search phrase only. No quotes, no explanation.';

  try {
    const userPrompt = `Use this business context only if it helps pick a concrete visual scene (do not invent brand names):
Business name: ${config.name}
Business type: ${config.type}
Slogan: ${config.slogan || 'none'}
Services hint: ${serviceHint}

${buildStockPhotoTopicUserPrompt(safeTopic || 'promotion or tip for customers')}`;

    const raw = await callAI(systemPrompt, userPrompt);
    const cleaned = String(raw || '')
      .trim()
      .replace(/^["'`]|["'`]$/g, '')
      .split('\n')[0]
      .trim();
    if (cleaned.length >= 3) {
      return { query: cleaned, businessLabel: config.name };
    }
  } catch (err) {
    console.error('[ERROR SOCIAL] Consulta Unsplash (IA contextual):', err.message);
  }

  let fallback = `${safeTopic} ${config.type}`.replace(/\s+/g, ' ').trim();
  if (fallback.length >= 3) {
    try {
      const userPrompt = buildStockPhotoTopicUserPrompt(fallback);
      const translated = await callAI(systemPrompt, userPrompt);
      const t = String(translated || '')
        .trim()
        .replace(/^["']|["']$/g, '')
        .split('\n')[0]
        .trim();
      if (t.length >= 3) {
        fallback = t;
      }
    } catch {
      /* keep fallback as Spanish/type mix */
    }
  }

  return {
    query: fallback.slice(0, 120).trim() || 'professional small business service',
    businessLabel: config.name,
  };
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
        const selected = pickOwnImageForTopic(ownImagesResult.rows, safeTopic);
        const selectedUrl = String(selected.url || '').trim();
        if (selectedUrl) {
          return selectedUrl;
        }
      }
    }

    if (safeImageSource === 'unsplash' || safeImageSource === 'auto') {
      const unsplashKey = String(process.env.UNSPLASH_ACCESS_KEY || '').trim();
      if (unsplashKey) {
        const { query: queryEN, businessLabel } = await buildContextualUnsplashQuery(
          safeBusinessId,
          safeTopic
        );

        console.log(
          `[UNSPLASH] Negocio: "${businessLabel}" | topic: "${safeTopic}" → query: "${queryEN}"`
        );

        const url = new URL('https://api.unsplash.com/search/photos');
        url.searchParams.set('query', queryEN);
        url.searchParams.set('orientation', 'landscape');
        url.searchParams.set('content_filter', 'high');
        url.searchParams.set('per_page', '12');
        url.searchParams.set('page', '1');
        if (UNSPLASH_OPTIONAL_COLLECTION_IDS) {
          url.searchParams.set('collections', UNSPLASH_OPTIONAL_COLLECTION_IDS);
        }

        const response = await fetch(url.toString(), {
          headers: {
            Authorization: `Client-ID ${unsplashKey}`,
          },
        });
        const data = await response.json();
        const results = Array.isArray(data.results) ? data.results : [];

        if (response.ok && results.length > 0) {
          const limit = Math.min(results.length, 10);
          for (let i = 0; i < limit; i++) {
            const pick = results[i];
            const width = typeof pick?.width === 'number' ? pick.width : 1080;
            const imageUrl = String(pick?.urls?.regular || '').trim();
            if (width >= 400 && imageUrl) {
              return imageUrl;
            }
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
