const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Pool } = require('pg');

const GRAPH_API_BASE = 'https://graph.facebook.com/v18.0';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const PLACEHOLDER_IMAGE_URL =
  'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=1080';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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

async function callGroq(systemPrompt, userPrompt) {
  try {
    if (!process.env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY no está configurado.');
    }

    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || 'Error al consultar Groq.');
    }

    return data.choices?.[0]?.message?.content || '';
  } catch (error) {
    console.error('[ERROR TEST SOCIAL] callGroq:', error.message);
    throw error;
  }
}

async function getBusinessConfig(businessId) {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM business_config WHERE business_id = $1 LIMIT 1',
      [businessId]
    );
    if (rows.length === 0) {
      return {
        name: 'Negocio ARI',
        type: 'general',
        slogan: '',
        services: [],
        active_announcement: '',
      };
    }

    const config = rows[0];
    return {
      ...config,
      services: Array.isArray(config.services) ? config.services : [],
    };
  } catch (error) {
    console.error('[ERROR TEST SOCIAL] getBusinessConfig:', error.message);
    throw error;
  }
}

async function generatePostContent(businessId, topic, tone) {
  try {
    const config = await getBusinessConfig(businessId);

    const systemPrompt = `Eres estratega senior de redes sociales para negocios en México.
Responde SOLO JSON válido con esta forma:
{"content":"...","hashtags":["#uno","#dos","#tres","#cuatro","#cinco"]}
Reglas:
- content máximo 150 palabras
- usar emojis acorde al tono
- exactamente 5 hashtags`;

    const userPrompt = `Negocio: ${config.name}
Tipo: ${config.type}
Slogan: ${config.slogan || 'Sin slogan'}
Servicios: ${JSON.stringify(config.services || [])}
Anuncio activo: ${config.active_announcement || 'Sin anuncio'}
Tema: ${topic}
Tono: ${tone}`;

    const raw = await callGroq(systemPrompt, userPrompt);
    const extracted = String(raw).match(/\{[\s\S]*\}/)?.[0];
    if (!extracted) {
      throw new Error('La IA no devolvió JSON válido.');
    }

    const parsed = JSON.parse(extracted);
    const content = String(parsed.content || '').trim();
    const hashtags = formatHashtags(parsed.hashtags);

    if (!content) {
      throw new Error('No se recibió contenido para el post.');
    }

    return { content, hashtags };
  } catch (error) {
    console.error('[ERROR TEST SOCIAL] generatePostContent:', error.message);
    throw error;
  }
}

async function publishToFacebook(content, imageUrl) {
  try {
    if (!process.env.META_SOCIAL_TOKEN || !process.env.META_PAGE_ID) {
      throw new Error('Faltan META_SOCIAL_TOKEN o META_PAGE_ID.');
    }

    const payload = new URLSearchParams({
      message: content,
      access_token: process.env.META_SOCIAL_TOKEN,
    });

    if (imageUrl) {
      payload.set('link', imageUrl);
    }

    const response = await fetch(`${GRAPH_API_BASE}/${process.env.META_PAGE_ID}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload,
    });

    const data = await response.json();
    if (!response.ok || !data.id) {
      throw new Error(data.error?.message || 'No se pudo publicar en Facebook.');
    }

    return data.id;
  } catch (error) {
    console.error('[ERROR TEST SOCIAL] publishToFacebook:', error.message);
    throw error;
  }
}

async function publishToInstagram(content, imageUrl) {
  try {
    if (!process.env.META_SOCIAL_TOKEN || !process.env.META_IG_ACCOUNT_ID) {
      throw new Error('Faltan META_SOCIAL_TOKEN o META_IG_ACCOUNT_ID.');
    }

    const createResponse = await fetch(
      `${GRAPH_API_BASE}/${process.env.META_IG_ACCOUNT_ID}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          image_url: imageUrl || PLACEHOLDER_IMAGE_URL,
          caption: content,
          access_token: process.env.META_SOCIAL_TOKEN,
        }),
      }
    );

    const createData = await createResponse.json();
    if (!createResponse.ok || !createData.id) {
      throw new Error(createData.error?.message || 'No se pudo crear el contenedor de Instagram.');
    }

    const publishResponse = await fetch(
      `${GRAPH_API_BASE}/${process.env.META_IG_ACCOUNT_ID}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          creation_id: createData.id,
          access_token: process.env.META_SOCIAL_TOKEN,
        }),
      }
    );

    const publishData = await publishResponse.json();
    if (!publishResponse.ok || !publishData.id) {
      throw new Error(publishData.error?.message || 'No se pudo publicar en Instagram.');
    }

    return publishData.id;
  } catch (error) {
    console.error('[ERROR TEST SOCIAL] publishToInstagram:', error.message);
    throw error;
  }
}

async function run() {
  let contentForTests = '';
  let hashtagsForTests = '';

  console.log('\n════════════════════════════════════════════════════');
  console.log(' ARI — Pruebas módulo social');
  console.log('════════════════════════════════════════════════════\n');

  // 1) generatePostContent()
  try {
    console.log('1) Probando generatePostContent("demo", "corte de cabello", "Casual")...');
    const generated = await generatePostContent('demo', 'corte de cabello', 'Casual');
    contentForTests = generated.content;
    hashtagsForTests = generated.hashtags;
    console.log('   ✅ Contenido generado correctamente.');
    console.log(`   📝 Content: ${contentForTests}`);
    console.log(`   🏷️ Hashtags: ${hashtagsForTests}`);
  } catch (error) {
    console.log(`   ❌ Falló generatePostContent: ${error.message}`);
  }

  // 2) publishToFacebook()
  try {
    console.log('\n2) Probando publishToFacebook() con contenido de prueba...');
    const fbContent =
      contentForTests ||
      'Hoy es un gran día para renovar tu estilo. Agenda tu cita y luce increíble. #barberia #estilo #ari #mexico #cortedecabello';
    const fbPostId = await publishToFacebook(fbContent);
    console.log('   ✅ Publicado en Facebook correctamente.');
    console.log(`   🆔 fb_post_id: ${fbPostId}`);
  } catch (error) {
    console.log(`   ❌ Falló publishToFacebook: ${error.message}`);
  }

  // 3) publishToInstagram() con imagen placeholder
  try {
    console.log('\n3) Probando publishToInstagram() con imagen placeholder...');
    const igContent =
      contentForTests ||
      'Un buen corte de cabello cambia tu día. Agenda hoy mismo. #barberia #estilo #ari #mexico #cortedecabello';
    const igPostId = await publishToInstagram(igContent, PLACEHOLDER_IMAGE_URL);
    console.log('   ✅ Publicado en Instagram correctamente.');
    console.log(`   🆔 ig_post_id: ${igPostId}`);
  } catch (error) {
    console.log(`   ❌ Falló publishToInstagram: ${error.message}`);
  }

  console.log('\n════════════════════════════════════════════════════');
  console.log(' Fin de pruebas de módulo social');
  console.log('════════════════════════════════════════════════════\n');
}

run()
  .catch((error) => {
    console.error('[ERROR TEST SOCIAL] Fallo no controlado:', error.message);
  })
  .finally(async () => {
    await pool.end();
  });
