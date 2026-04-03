const express = require('express');
const cors = require('cors');
const { registerRoutes } = require('../routes');

/**
 * Crea la aplicación Express con middleware y rutas (sin listen).
 * @returns {import('express').Express}
 */
function createApp() {
  const app = express();

  app.use(express.json());
  app.use(
    cors({
      origin: [
        'http://localhost:3001',
        'https://k-s-ari.vercel.app',
        'https://kairosystems.dev',
        'https://www.kairosystems.dev',
      ],
    })
  );

  registerRoutes(app);

  return app;
}

module.exports = { createApp };
