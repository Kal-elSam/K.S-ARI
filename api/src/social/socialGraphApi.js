const { GRAPH_API_BASE, SOCIAL_PLACEHOLDER_IMAGE_URL } = require('./socialConstants');
const { buildSocialCaption, validateSocialPlatform } = require('./socialHelpers');

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

module.exports = {
  publishToInstagram,
  publishToFacebook,
  publishByPlatform,
};
