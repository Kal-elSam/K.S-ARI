const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('[ERROR DB] Error inesperado en el pool de PostgreSQL:', err);
});

/**
 * Intenta conectarse a PostgreSQL con reintentos.
 * @param {number} maxRetries - Número máximo de intentos (default: 3)
 * @param {number} delayMs    - Milisegundos de espera entre intentos (default: 2000)
 */
async function connectWithRetry(maxRetries = 3, delayMs = 2000) {
  for (let intento = 1; intento <= maxRetries; intento++) {
    try {
      const client = await pool.connect();
      client.release();
      console.log(`✅ PostgreSQL conectado correctamente (intento ${intento}/${maxRetries}).`);
      return;
    } catch (error) {
      console.error(`[DB] Intento ${intento}/${maxRetries} fallido: ${error.message}`);
      if (intento === maxRetries) {
        throw new Error(`[DB] No se pudo conectar a PostgreSQL tras ${maxRetries} intentos.`);
      }
      console.log(`   ⏳ Reintentando en ${delayMs / 1000} segundos...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

module.exports = { pool, connectWithRetry };
