const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const Sentry = require('@sentry/node');

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment:
      process.env.SENTRY_ENVIRONMENT ||
      process.env.RAILWAY_ENVIRONMENT ||
      process.env.NODE_ENV ||
      'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 0,
    integrations: [Sentry.expressIntegration()],
  });
}

const { ENV_VARS_REQUERIDAS } = require('./constants');
const { createApp } = require('./createApp');
const { connectWithRetry } = require('./db');
const { initActiveSchedules } = require('./social/socialService');

console.log('\n📋 Verificación de variables de entorno:');
const envFaltantes = [];
for (const varName of ENV_VARS_REQUERIDAS) {
  const presente = !!process.env[varName];
  const icono = presente ? '✅' : '❌';
  console.log(`   ${icono} ${varName}: ${presente ? 'presente' : 'FALTANTE'}`);
  if (!presente) envFaltantes.push(varName);
}

if (envFaltantes.length > 0) {
  console.warn(`\n⚠️  Variables faltantes: ${envFaltantes.join(', ')}. El servidor puede fallar.\n`);
} else {
  console.log('\n✅ Todas las variables de entorno están configuradas.\n');
}

const PORT = process.env.PORT || 3000;
const app = createApp();

if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

connectWithRetry()
  .then(async () => {
    await initActiveSchedules().catch((err) =>
      console.error('[CRON] Error al iniciar schedules:', err.message)
    );
    app.listen(PORT, () => {
      console.log(`\n🚀 Servidor ARI listo en el puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('\n💥 Servidor ARI no pudo iniciar:', err.message);
    process.exit(1);
  });
