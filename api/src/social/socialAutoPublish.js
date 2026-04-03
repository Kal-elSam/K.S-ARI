const { pool } = require('../core/db');
const { generatePostContent, getImageForPost } = require('./socialContent');
const { publishToInstagram, publishToFacebook } = require('./socialGraphApi');
const { buildSocialCaption, normalizePlatformsArray } = require('./socialHelpers');

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

module.exports = { autoGenerateAndPublish };
