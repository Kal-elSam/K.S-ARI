/** Timeouts de posts programados por id de fila en social_posts */
const scheduledSocialTimeouts = new Map();
/** Jobs node-cron activos por business_id */
const activeSocialJobsByBusiness = new Map();
/** Índice de rotación de temas por business_id */
const topicRotationByBusiness = new Map();

module.exports = {
  scheduledSocialTimeouts,
  activeSocialJobsByBusiness,
  topicRotationByBusiness,
};
