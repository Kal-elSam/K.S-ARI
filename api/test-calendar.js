/**
 * test-calendar.js
 * Script de pruebas aisladas para el Booking Engine de ARI.
 *
 * Uso:
 *   cd api && node test-calendar.js
 *
 * Prerrequisitos:
 *   1. Haber completado el flujo OAuth en http://localhost:3000/auth/google
 *   2. Que el .env tenga DATABASE_URL, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Pool } = require('pg');

const GOOGLE_TOKEN_URL  = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';
const TIMEZONE = 'America/Mexico_City';
const BUSINESS_ID = 'demo';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ─────────────────────────────────────────────────────────────────────────────
// Copia de las funciones del servidor (sin dependencias de Express)
// ─────────────────────────────────────────────────────────────────────────────

async function getValidAccessToken(businessId) {
  const { rows } = await pool.query(
    'SELECT * FROM business_calendars WHERE business_id = $1 LIMIT 1',
    [businessId]
  );

  if (rows.length === 0) {
    throw new Error(`No se encontraron tokens para business_id="${businessId}". Completa el OAuth primero.`);
  }

  const registro = rows[0];
  const ahora = new Date();
  const tieneTokenValido =
    registro.google_access_token &&
    registro.token_expiry &&
    new Date(registro.token_expiry) > new Date(ahora.getTime() + 60_000);

  if (tieneTokenValido) {
    console.log('  ℹ️  Access token vigente, no necesita refrescarse.');
    return registro.google_access_token;
  }

  console.log('  🔄 Refrescando access_token...');
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: registro.google_refresh_token,
      grant_type:    'refresh_token',
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || 'Error refrescando token');

  const nuevaExpiracion = new Date(ahora.getTime() + data.expires_in * 1000);
  await pool.query(
    `UPDATE business_calendars
     SET google_access_token = $1, token_expiry = $2, updated_at = CURRENT_TIMESTAMP
     WHERE business_id = $3`,
    [data.access_token, nuevaExpiracion.toISOString(), businessId]
  );

  return data.access_token;
}

async function getAvailableSlots(businessId, date) {
  const accessToken = await getValidAccessToken(businessId);

  const formatter = new Intl.DateTimeFormat('sv', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const fechaLocal = formatter.format(date);

  const timeMin = `${fechaLocal}T09:00:00-06:00`;
  const timeMax = `${fechaLocal}T18:00:00-06:00`;

  const HORAS_INICIO = [9, 10, 11, 12, 13, 14, 15, 16, 17];
  const todosLosSlots = HORAS_INICIO.map((h) => ({
    start: `${String(h).padStart(2, '0')}:00`,
    end:   `${String(h + 1).padStart(2, '0')}:00`,
  }));

  const url = new URL(`${GOOGLE_CALENDAR_BASE}/calendars/primary/events`);
  url.searchParams.set('timeMin', timeMin);
  url.searchParams.set('timeMax', timeMax);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Error leyendo Calendar');

  const eventos = data.items || [];
  return todosLosSlots.filter(({ start, end }) => {
    const slotStart = new Date(`${fechaLocal}T${start}:00-06:00`);
    const slotEnd   = new Date(`${fechaLocal}T${end}:00-06:00`);
    return !eventos.some((ev) => {
      const evStart = new Date(ev.start?.dateTime || ev.start?.date);
      const evEnd   = new Date(ev.end?.dateTime   || ev.end?.date);
      return evStart < slotEnd && evEnd > slotStart;
    });
  });
}

async function createCalendarEvent(businessId, clientPhone, serviceName, startTime, endTime) {
  const accessToken = await getValidAccessToken(businessId);
  const lockExpiry  = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const response = await fetch(`${GOOGLE_CALENDAR_BASE}/calendars/primary/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: `PENDING_${serviceName} - ${clientPhone}`,
      description: `Prueba de test-calendar.js.\nLock expira: ${lockExpiry}`,
      start: { dateTime: startTime, timeZone: TIMEZONE },
      end:   { dateTime: endTime,   timeZone: TIMEZONE },
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Error creando evento');
  return data.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE DE PRUEBAS
// ─────────────────────────────────────────────────────────────────────────────

async function runTests() {
  let passed = 0;
  let failed = 0;

  function ok(label) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  }

  function fail(label, error) {
    console.error(`  ❌ FAIL: ${label}`);
    console.error(`         ${error.message || error}`);
    failed++;
  }

  console.log('\n══════════════════════════════════════════════════');
  console.log('  ARI — Test Suite: Google Calendar Booking Engine');
  console.log('══════════════════════════════════════════════════\n');

  // ── Test 1: Tokens en DB ──────────────────────────────────────────────────
  console.log('📦 TEST 1 — Verificar tokens en base de datos');
  try {
    const { rows } = await pool.query(
      'SELECT * FROM business_calendars WHERE business_id = $1 LIMIT 1',
      [BUSINESS_ID]
    );

    if (rows.length === 0) throw new Error('No hay fila en business_calendars para business_id="demo".');

    const reg = rows[0];
    if (!reg.google_refresh_token) throw new Error('refresh_token está vacío.');
    if (!reg.google_access_token)  throw new Error('access_token está vacío.');
    if (!reg.token_expiry)         throw new Error('token_expiry está vacío.');

    console.log(`  business_id    : ${reg.business_id}`);
    console.log(`  token_expiry   : ${reg.token_expiry}`);
    console.log(`  refresh_token  : ${reg.google_refresh_token.substring(0, 20)}...`);
    ok('Tokens encontrados correctamente en DB');
  } catch (error) {
    fail('Tokens en DB', error);
  }

  // ── Test 2: getAvailableSlots ─────────────────────────────────────────────
  console.log('\n📅 TEST 2 — getAvailableSlots (mañana)');
  let slotsResult = [];
  try {
    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000);
    slotsResult = await getAvailableSlots(BUSINESS_ID, manana);

    const formatter = new Intl.DateTimeFormat('sv', {
      timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    });
    console.log(`  Fecha consultada: ${formatter.format(manana)}`);
    console.log(`  Slots disponibles (${slotsResult.length}):`);
    slotsResult.forEach((s, i) => console.log(`    ${i + 1}. ${s.start} – ${s.end}`));

    if (!Array.isArray(slotsResult)) throw new Error('No retornó un array.');
    ok('getAvailableSlots retorna array de slots correctamente');
  } catch (error) {
    fail('getAvailableSlots', error);
  }

  // ── Test 3: createCalendarEvent ───────────────────────────────────────────
  console.log('\n📝 TEST 3 — createCalendarEvent');
  try {
    if (slotsResult.length === 0) {
      throw new Error('No hay slots disponibles para crear el evento de prueba.');
    }

    const slotDePrueba = slotsResult[0];
    const manana = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const formatter = new Intl.DateTimeFormat('sv', {
      timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const fechaManana = formatter.format(manana);

    const startTime = `${fechaManana}T${slotDePrueba.start}:00-06:00`;
    const endTime   = `${fechaManana}T${slotDePrueba.end}:00-06:00`;

    const eventId = await createCalendarEvent(
      BUSINESS_ID,
      '+5215512345678',
      'Corte de cabello',
      startTime,
      endTime
    );

    if (!eventId || typeof eventId !== 'string') throw new Error('No se recibió un eventId válido.');

    console.log(`  eventId creado: ${eventId}`);
    console.log(`  Horario       : ${startTime} → ${endTime}`);
    ok('createCalendarEvent crea evento exitosamente en Google Calendar');
  } catch (error) {
    fail('createCalendarEvent', error);
  }

  // ── Resumen ───────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════');
  console.log(`  Resultados: ${passed} ✅ pasaron | ${failed} ❌ fallaron`);
  console.log('══════════════════════════════════════════════════\n');

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error('[FATAL] Error no capturado en la suite:', err);
  pool.end();
  process.exit(1);
});
