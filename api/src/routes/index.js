const { registerDashboardRoutes } = require('./dashboard');
const { registerSocialRoutes } = require('./social');
const { registerOauthRoutes } = require('./oauth');
const { registerWebhookRoutes } = require('./webhook');

/**
 * Registra todas las rutas HTTP en orden estable.
 * @param {import('express').Express} app
 */
function registerRoutes(app) {
  registerDashboardRoutes(app);
  registerSocialRoutes(app);
  registerOauthRoutes(app);
  registerWebhookRoutes(app);
}

module.exports = { registerRoutes };
