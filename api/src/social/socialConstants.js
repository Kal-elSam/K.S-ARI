const GRAPH_API_BASE = 'https://graph.facebook.com/v18.0';
const SOCIAL_PLACEHOLDER_IMAGE_URL =
  'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=1080';

const VALID_SOCIAL_FREQUENCIES = new Set(['daily', '3x_week', '5x_week']);
const VALID_IMAGE_SOURCES = new Set(['own', 'unsplash', 'auto']);

module.exports = {
  GRAPH_API_BASE,
  SOCIAL_PLACEHOLDER_IMAGE_URL,
  VALID_SOCIAL_FREQUENCIES,
  VALID_IMAGE_SOURCES,
};
