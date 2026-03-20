const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Pool } = require('pg');

// ----------------------------------------------------------------------------
// SCRIPT DE PRUEBA AISLADO — Sin levantar Express ni WhatsApp
// Ejecutar con: node api/test.js (desde la raíz del proyecto "ari")
// ----------------------------------------------------------------------------

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// --- Copia de la función de DB (necesaria porque server.js usa app.listen) ---

/**
 * Busca una conversación activa por teléfono o crea una nueva en estado NEW_LEAD
 */
async function getOrCreateConversation(phone) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      'SELECT * FROM conversations WHERE phone = $1 LIMIT 1',
      [phone]
    );

    if (rows.length > 0) {
      return rows[0];
    }

    const insertQuery = `
      INSERT INTO conversations (phone, state, business_id, context)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const result = await client.query(insertQuery, [
      phone,
      'NEW_LEAD',
      'demo',
      JSON.stringify({})
    ]);
    return result.rows[0];
  } finally {
    client.release();
  }
}

// --- Copia de la función de OpenAI (fetch nativo, sin SDK) ---

/**
 * Llama a OpenAI GPT-4o mini con un system prompt y un mensaje de usuario
 */
async function callAI(systemPrompt, userMessage) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error('GROQ_API_KEY no configurada en .env');
  }

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.7
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || 'Error desconocido de OpenAI');
  }

  return data.choices[0].message.content;
}

// ----------------------------------------------------------------------------
// BLOQUE PRINCIPAL DE PRUEBAS
// ----------------------------------------------------------------------------
async function runTests() {
  console.log('\n🔬 Iniciando pruebas de integración...\n');
  let allPassed = true;

  // --- TEST 1: Conexión y lógica de DB ---
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 1: PostgreSQL — getOrCreateConversation()');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  const TEST_PHONE = '5214427471950';

  try {
    const conversation = await getOrCreateConversation(TEST_PHONE);
    console.log('✅ PASÓ — Conversación obtenida/creada correctamente:');
    console.log(`   → ID:         ${conversation.id}`);
    console.log(`   → Teléfono:   ${conversation.phone}`);
    console.log(`   → Estado:     ${conversation.state}`);
    console.log(`   → Negocio:    ${conversation.business_id}`);
    console.log(`   → Creada en:  ${conversation.created_at?.toISOString()}\n`);
  } catch (error) {
    allPassed = false;
    console.error('❌ FALLÓ — Error en DB:', error.message, '\n');
  }

  // --- TEST 2: Llamada a OpenAI ---
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('TEST 2: OpenAI — callOpenAI()');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  try {
    const systemPrompt = 'Eres ARI, asistente virtual amable. Responde en máximo 2 oraciones.';
    const userMessage  = 'Hola, quiero una cita';

    console.log(`   → Prompt:   "${systemPrompt}"`);
    console.log(`   → Mensaje:  "${userMessage}"\n`);

    const aiResponse = await callAI(systemPrompt, userMessage);
    console.log('✅ PASÓ — Respuesta de OpenAI:');
    console.log(`   → "${aiResponse}"\n`);
  } catch (error) {
    allPassed = false;
    console.error('❌ FALLÓ — Error en OpenAI:', error.message, '\n');
  }

  // --- Resumen final ---
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (allPassed) {
    console.log('🎉 Todos los tests pasaron. El stack está listo.');
  } else {
    console.log('⚠️  Algún test falló. Revisa los errores arriba.');
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  await pool.end();
}

runTests().catch((err) => {
  console.error('[CRÍTICO] Fallo catastrófico en el script de prueba:', err);
  pool.end();
  process.exit(1);
});
