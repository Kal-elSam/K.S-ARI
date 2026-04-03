const { pool } = require('../core/db');
const { GOOGLE_TOKEN_URL } = require('../booking/googleCalendar');

/**
 * @param {import('express').Express} app
 */
function registerOauthRoutes(app) {
  app.get('/auth/google', (req, res) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !redirectUri) {
      return res.status(500).json({ error: 'Variables de Google no configuradas en .env' });
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/calendar',
      access_type: 'offline',
      prompt: 'consent',
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    console.log('[OAUTH] Redirigiendo a Google Authorization URL...');
    res.redirect(authUrl);
  });

  app.get('/auth/google/callback', async (req, res) => {
    const { code, error } = req.query;

    if (error) {
      console.error('[OAUTH] El usuario rechazó el acceso:', error);
      return res.status(400).send(`Error de autorización: ${error}`);
    }

    if (!code) {
      return res.status(400).send('Código de autorización no recibido.');
    }

    try {
      const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          redirect_uri: process.env.GOOGLE_REDIRECT_URI,
          code,
          grant_type: 'authorization_code',
        }),
      });

      const tokens = await tokenResponse.json();

      if (!tokenResponse.ok) {
        console.error('[OAUTH] Fallo al intercambiar código:', JSON.stringify(tokens));
        return res.status(500).send('Error al intercambiar el código de autorización con Google.');
      }

      if (!tokens.refresh_token) {
        console.warn('[OAUTH] ⚠️ Google no devolvió refresh_token. ¿Ya autorizaste antes?');
        return res.status(400).send(
          'Google no devolvió un refresh_token. Revoca el acceso en myaccount.google.com/permissions y vuelve a intentarlo.'
        );
      }

      const expiracion = new Date(Date.now() + tokens.expires_in * 1000);

      await pool.query(
        `INSERT INTO business_calendars
         (business_id, google_refresh_token, google_access_token, token_expiry)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (business_id) DO UPDATE
         SET google_refresh_token = EXCLUDED.google_refresh_token,
             google_access_token  = EXCLUDED.google_access_token,
             token_expiry         = EXCLUDED.token_expiry,
             updated_at           = CURRENT_TIMESTAMP`,
        ['demo', tokens.refresh_token, tokens.access_token, expiracion.toISOString()]
      );

      console.log('[OAUTH] ✅ Calendario conectado y tokens guardados para business_id="demo".');
      res.send('✅ Calendario conectado exitosamente. ARI ya puede agendar citas.');
    } catch (err) {
      console.error('[ERROR OAUTH] Excepción en callback:', err.message);
      res.status(500).send('Error interno al procesar la autorización de Google.');
    }
  });
}

module.exports = { registerOauthRoutes };
