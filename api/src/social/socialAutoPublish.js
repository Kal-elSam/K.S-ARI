const { pool } = require('../core/db');
const { generatePostContent, getImageForPost } = require('./socialContent');
const { publishToInstagram, publishToFacebook } = require('./socialGraphApi');
const { buildSocialCaption, formatHashtags, normalizePlatformsArray } = require('./socialHelpers');

/**
 * @param {string} businessId
 * @param {string} topic
 * @param {string[]} platforms
 * @param {string} tone
 * @param {string} [imageSource]
 * @param {{ content?: string; hashtags?: unknown; imageUrl?: string }} [publishOptions]
 */
async function autoGenerateAndPublish(businessId, topic, platforms, tone, imageSource = 'auto', publishOptions) {
  try {
    const safeBusinessId = String(businessId || 'demo').trim() || 'demo';
    const safeImageTopic = String(topic || 'business technology').trim();
    const safeTone = String(tone || 'Profesional').trim() || 'Profesional';
    const safePlatforms = normalizePlatformsArray(platforms);
    const opts = publishOptions && typeof publishOptions === 'object' ? publishOptions : {};
    const preContent = String(opts.content || '').trim();
    const preImageUrl = String(opts.imageUrl || '').trim();

    if (safePlatforms.length === 0) {
      throw new Error('Debes indicar al menos una plataforma para autopublicar.');
    }

    let postContent;
    let postHashtags;
    if (preContent) {
      postContent = preContent;
      postHashtags = formatHashtags(opts.hashtags);
    } else {
      const generated = await generatePostContent(safeBusinessId, safeImageTopic, safeTone);
      postContent = generated.content;
      postHashtags = generated.hashtags;
    }

    const imageUrl = preImageUrl || (await getImageForPost(safeBusinessId, safeImageTopic, imageSource));
    const caption = buildSocialCaption(postContent, postHashtags);

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
        postContent,
        imageUrl,
        postHashtags,
        igPostId,
        fbPostId,
      ]
    );

    return {
      ig_post_id: igPostId,
      fb_post_id: fbPostId,
      content: postContent,
      imageUrl,
    };
  } catch (error) {
    console.error('[ERROR SOCIAL] autoGenerateAndPublish:', error.message);
    throw error;
  }
}

module.exports = { autoGenerateAndPublish };
