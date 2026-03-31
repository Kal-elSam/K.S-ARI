/**
 * test-endpoints.js
 * Prueba los endpoints REST nuevos del dashboard ARI usando fetch nativo.
 *
 * Uso:
 *   node api/test-endpoints.js
 *
 * Requisito:
 *   El servidor debe estar corriendo en http://localhost:3000
 */

const API_BASE_URL = 'http://localhost:3000';

async function requestAndLog(name, path, options = {}) {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, options);
    const text = await response.text();
    let body = text;

    try {
      body = JSON.parse(text);
    } catch {
      // Si no es JSON, dejamos el texto sin parsear.
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Endpoint: ${name}`);
    console.log(`URL: ${path}`);
    console.log(`Status: ${response.status}`);
    console.log('Body:');
    console.log(body);

    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`Endpoint: ${name}`);
    console.log(`URL: ${path}`);
    console.log('Status: ERROR DE RED');
    console.log(`Detalle: ${error.message}`);
    return { ok: false, status: 0, body: null };
  }
}

async function run() {
  try {
    console.log('🚀 Iniciando pruebas de endpoints REST de ARI...');

    const metrics = await requestAndLog('GET /api/metrics', '/api/metrics');
    const conversations = await requestAndLog('GET /api/conversations', '/api/conversations');

    // Usamos el primer teléfono real si existe; si no, usamos uno dummy.
    const firstPhone = Array.isArray(conversations.body) && conversations.body.length > 0
      ? conversations.body[0].phone
      : '5215511111111';
    await requestAndLog(
      'GET /api/conversations/:phone/messages',
      `/api/conversations/${firstPhone}/messages`
    );

    await requestAndLog('GET /api/appointments', '/api/appointments');
    await requestAndLog('GET /api/config/demo', '/api/config/demo');

    const postPayload = {
      name: 'Clínica ARI Demo',
      type: 'consultorio',
      start_hour: 9,
      end_hour: 18,
      tone: 'amigable',
      welcome_message: 'Hola, soy ARI. Te ayudo a agendar tu cita.',
      active_announcement: 'Promoción de limpieza dental esta semana.',
      services: [
        { name: 'Limpieza dental', duration: 60, price: 700 },
        { name: 'Valoración general', duration: 45, price: 500 },
      ],
    };

    await requestAndLog('POST /api/config/demo', '/api/config/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(postPayload),
    });

    const passedCount = [metrics, conversations].filter((result) => result.ok).length;
    console.log('\n✅ Pruebas finalizadas.');
    console.log(`Checks base correctos: ${passedCount}/2 (metrics + conversations).`);
  } catch (error) {
    console.error('\n❌ Fallo crítico en test-endpoints:', error.message);
    process.exit(1);
  }
}

run();
