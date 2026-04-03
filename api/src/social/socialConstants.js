const GRAPH_API_BASE = 'https://graph.facebook.com/v18.0';
const SOCIAL_PLACEHOLDER_IMAGE_URL =
  'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=1080';

const VALID_SOCIAL_FREQUENCIES = new Set(['daily', '3x_week', '5x_week']);
const VALID_IMAGE_SOURCES = new Set(['own', 'unsplash', 'auto']);

/** Colecciones públicas Unsplash (tech + trabajo/negocio). Sobrescribir con UNSPLASH_COLLECTION_IDS si hace falta. */
const UNSPLASH_TECH_BUSINESS_COLLECTION_IDS =
  String(process.env.UNSPLASH_COLLECTION_IDS || '162213,2519663').trim() || '162213,2519663';

module.exports = {
  GRAPH_API_BASE,
  SOCIAL_PLACEHOLDER_IMAGE_URL,
  VALID_SOCIAL_FREQUENCIES,
  VALID_IMAGE_SOURCES,
  UNSPLASH_TECH_BUSINESS_COLLECTION_IDS,
};
