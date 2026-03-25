const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const express = require('express');
const { Pool } = require('pg');

// ----------------------------------------------------------------------------
// VALIDACIÓN DE VARIABLES DE ENTORNO
// ----------------------------------------------------------------------------
const ENV_VARS_REQUERIDAS = [
  'PORT',
  'DATABASE_URL',
  'WHATSAPP_TOKEN',
  'WHATSAPP_PHONE_ID',
  'WEBHOOK_VERIFY_TOKEN',
  'GROQ_API_KEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
];

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

const app = express();
const PORT = process.env.PORT || 3000;

// Zona horaria para toda la aplicación
const TIMEZONE = 'America/Mexico_City';

app.use(express.json());

// ----------------------------------------------------------------------------
// BASE DE DATOS (PostgreSQL)
// ----------------------------------------------------------------------------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
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

// ----------------------------------------------------------------------------
// HELPERS DE CONVERSACIÓN
// ----------------------------------------------------------------------------

/**
 * Obtiene o crea una conversación a partir del número de teléfono del cliente.
 */
async function getOrCreateConversation(phone) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      'SELECT * FROM conversations WHERE phone = $1 LIMIT 1',
      [phone]
    );

    if (rows.length > 0) return rows[0];

    const insertQuery = `
      INSERT INTO conversations (phone, state, business_id, context)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const result = await client.query(insertQuery, [phone, 'NEW_LEAD', 'demo', JSON.stringify({})]);
    return result.rows[0];
  } catch (error) {
    console.error('[ERROR DB] Falla al buscar o crear la conversación:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Actualiza el estado (state machine) de la conversación.
 */
async function updateConversationState(id, newState) {
  try {
    const query = `
      UPDATE conversations
      SET state = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *;
    `;
    const result = await pool.query(query, [newState, id]);
    return result.rows[0];
  } catch (error) {
    console.error('[ERROR DB] Falla al actualizar el estado:', error);
    throw error;
  }
}

/**
 * Actualiza el JSONB de contexto de la conversación (merge incremental).
 */
async function updateConversationContext(id, newContext) {
  try {
    const query = `
      UPDATE conversations
      SET context = context || $1::jsonb, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *;
    `;
    const result = await pool.query(query, [JSON.stringify(newContext), id]);
    return result.rows[0];
  } catch (error) {
    console.error('[ERROR DB] Falla al actualizar el contexto:', error);
    throw error;
  }
}

// ----------------------------------------------------------------------------
// GOOGLE CALENDAR — AUTENTICACIÓN
// ----------------------------------------------------------------------------

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';

/**
 * Obtiene un access_token válido para el negocio indicado.
 * Si el token actual expiró (o no existe), lo refresca con el refresh_token.
 * Actualiza el registro en DB con el nuevo token y su fecha de expiración.
 *
 * @param {string} businessId - Identificador del negocio en business_calendars
 * @returns {Promise<string>} - Access token listo para usar en la Google Calendar API
 */
async function getValidAccessToken(businessId) {
  try {
    // 1. Buscar el registro del negocio en DB
    const { rows } = await pool.query(
      'SELECT * FROM business_calendars WHERE business_id = $1 LIMIT 1',
      [businessId]
    );

    if (rows.length === 0) {
      throw new Error(`[CALENDAR] No se encontró calendario para business_id="${businessId}". Haz el flujo OAuth primero.`);
    }

    const registro = rows[0];
    const ahora = new Date();

    // 2. Si el access_token aún es válido (con margen de 60 seg), retornarlo directamente
    const tieneTokenValido =
      registro.google_access_token &&
      registro.token_expiry &&
      new Date(registro.token_expiry) > new Date(ahora.getTime() + 60_000);

    if (tieneTokenValido) {
      return registro.google_access_token;
    }

    // 3. Refrescar el access_token usando el refresh_token
    console.log(`[CALENDAR] Refrescando access_token para business_id="${businessId}"...`);

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: registro.google_refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[ERROR CALENDAR] Fallo al refrescar token:', JSON.stringify(data));
      throw new Error(data.error_description || 'No se pudo refrescar el token de Google');
    }

    // 4. Calcular nueva expiración (expires_in está en segundos)
    const nuevaExpiracion = new Date(ahora.getTime() + data.expires_in * 1000);

    // 5. Guardar el nuevo access_token en DB
    await pool.query(
      `UPDATE business_calendars
       SET google_access_token = $1, token_expiry = $2, updated_at = CURRENT_TIMESTAMP
       WHERE business_id = $3`,
      [data.access_token, nuevaExpiracion.toISOString(), businessId]
    );

    console.log(`[CALENDAR] Token refrescado exitosamente. Expira: ${nuevaExpiracion.toISOString()}`);
    return data.access_token;
  } catch (error) {
    console.error('[ERROR CALENDAR] getValidAccessToken:', error.message);
    throw error;
  }
}

// ----------------------------------------------------------------------------
// GOOGLE CALENDAR — SLOTS DISPONIBLES
// ----------------------------------------------------------------------------

/**
 * Devuelve los slots de hora disponibles para el día dado.
 * Horario de trabajo: 9am–6pm CST, slots de 1 hora.
 * Excluye slots que choquen con eventos existentes en Google Calendar.
 *
 * @param {string} businessId - Identificador del negocio
 * @param {Date}   date       - Fecha para la que se quieren los slots
 * @returns {Promise<Array<{start: string, end: string}>>} - Slots libres en formato HH:MM
 */
async function getAvailableSlots(businessId, date) {
  try {
    const accessToken = await getValidAccessToken(businessId);

    // Construir el rango completo del día en hora Mexico City (ISO 8601 + offset)
    // Usamos Intl para obtener el offset correcto incluyendo horario de verano
    const formatter = new Intl.DateTimeFormat('sv', {
      timeZone: TIMEZONE,
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const fechaLocal = formatter.format(date); // "YYYY-MM-DD"

    const timeMin = `${fechaLocal}T09:00:00-06:00`; // 9am CST
    const timeMax = `${fechaLocal}T18:00:00-06:00`; // 6pm CST

    // Slots de 1 hora dentro del rango de trabajo (9–18h)
    const HORAS_INICIO = [9, 10, 11, 12, 13, 14, 15, 16, 17];
    const todosLosSlots = HORAS_INICIO.map((hora) => ({
      start: `${String(hora).padStart(2, '0')}:00`,
      end:   `${String(hora + 1).padStart(2, '0')}:00`,
    }));

    // Obtener eventos del día desde Google Calendar
    const url = new URL(`${GOOGLE_CALENDAR_BASE}/calendars/primary/events`);
    url.searchParams.set('timeMin', timeMin);
    url.searchParams.set('timeMax', timeMax);
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[ERROR CALENDAR] Fallo al obtener eventos:', JSON.stringify(data));
      throw new Error(data.error?.message || 'Error al leer Google Calendar');
    }

    const eventos = data.items || [];
    console.log(`[CALENDAR] ${eventos.length} eventos encontrados el ${fechaLocal}`);

    // Filtrar slots que NO choquen con eventos existentes
    const slotsDisponibles = todosLosSlots.filter(({ start, end }) => {
      const slotStart = new Date(`${fechaLocal}T${start}:00-06:00`);
      const slotEnd   = new Date(`${fechaLocal}T${end}:00-06:00`);

      const choca = eventos.some((evento) => {
        const evStart = new Date(evento.start?.dateTime || evento.start?.date);
        const evEnd   = new Date(evento.end?.dateTime   || evento.end?.date);
        // Choque si los rangos se solapan (no basta con que toquen en un extremo)
        return evStart < slotEnd && evEnd > slotStart;
      });

      return !choca;
    });

    return slotsDisponibles;
  } catch (error) {
    console.error('[ERROR CALENDAR] getAvailableSlots:', error.message);
    throw error;
  }
}

// ----------------------------------------------------------------------------
// GOOGLE CALENDAR — CREAR EVENTO (con optimistic lock de 10 minutos)
// ----------------------------------------------------------------------------

/**
 * Crea un evento en Google Calendar.
 * Implementa un optimistic lock guardando en el título "PENDING_" por 10 minutos
 * hasta que la cita sea confirmada en BOOKED.
 *
 * @param {string} businessId  - Identificador del negocio
 * @param {string} clientPhone - Número de WhatsApp del cliente
 * @param {string} serviceName - Nombre del servicio
 * @param {string} startTime   - ISO 8601 con offset, e.g. "2025-03-26T10:00:00-06:00"
 * @param {string} endTime     - ISO 8601 con offset, e.g. "2025-03-26T11:00:00-06:00"
 * @returns {Promise<string>}  - eventId del evento creado en Google Calendar
 */
async function createCalendarEvent(businessId, clientPhone, serviceName, startTime, endTime) {
  try {
    const accessToken = await getValidAccessToken(businessId);

    // La expiración del lock es ahora + 10 minutos
    const lockExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const eventBody = {
      summary: `PENDING_${serviceName} - ${clientPhone}`,
      description: `Cita agendada por ARI.\nCliente: ${clientPhone}\nServicio: ${serviceName}\nLock expira: ${lockExpiry}`,
      start: {
        dateTime: startTime,
        timeZone: TIMEZONE,
      },
      end: {
        dateTime: endTime,
        timeZone: TIMEZONE,
      },
    };

    const response = await fetch(`${GOOGLE_CALENDAR_BASE}/calendars/primary/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(eventBody),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[ERROR CALENDAR] Fallo al crear evento:', JSON.stringify(data));
      throw new Error(data.error?.message || 'Error al crear evento en Google Calendar');
    }

    console.log(`[CALENDAR] Evento creado: ${data.id} | ${data.summary}`);
    return data.id;
  } catch (error) {
    console.error('[ERROR CALENDAR] createCalendarEvent:', error.message);
    throw error;
  }
}

/**
 * Confirma un evento eliminando el prefijo PENDING_ del título.
 * Se llama cuando la conversación avanza a BOOKED.
 *
 * @param {string} businessId - Identificador del negocio
 * @param {string} eventId    - ID del evento a confirmar
 * @param {string} serviceName - Nombre del servicio para el título final
 * @param {string} clientPhone - Número del cliente para el título final
 */
async function confirmCalendarEvent(businessId, eventId, serviceName, clientPhone) {
  try {
    const accessToken = await getValidAccessToken(businessId);

    const response = await fetch(`${GOOGLE_CALENDAR_BASE}/calendars/primary/events/${eventId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: `Cita - ${serviceName} - ${clientPhone}`,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      console.error('[ERROR CALENDAR] Fallo al confirmar evento:', JSON.stringify(data));
    } else {
      console.log(`[CALENDAR] Evento ${eventId} confirmado (PENDING_ removido).`);
    }
  } catch (error) {
    console.error('[ERROR CALENDAR] confirmCalendarEvent:', error.message);
    // No lanzamos: no queremos bloquear el flujo del usuario por un PATCH opcional
  }
}

// ----------------------------------------------------------------------------
// RECORDATORIOS (función manual — cron se agrega en Semana 4)
// ----------------------------------------------------------------------------

/**
 * Envía recordatorios de WhatsApp para citas del día siguiente.
 * Busca en Google Calendar los eventos del mañana para el negocio indicado.
 *
 * @param {string} businessId - Identificador del negocio
 */
async function sendReminder(businessId) {
  try {
    const accessToken = await getValidAccessToken(businessId);

    // Calcular "mañana" en hora México
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);

    const formatter = new Intl.DateTimeFormat('sv', {
      timeZone: TIMEZONE,
      year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const fechaManana = formatter.format(manana);

    const timeMin = `${fechaManana}T00:00:00-06:00`;
    const timeMax = `${fechaManana}T23:59:59-06:00`;

    const url = new URL(`${GOOGLE_CALENDAR_BASE}/calendars/primary/events`);
    url.searchParams.set('timeMin', timeMin);
    url.searchParams.set('timeMax', timeMax);
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[ERROR REMINDER] Fallo al obtener eventos:', JSON.stringify(data));
      return;
    }

    const eventos = data.items || [];
    console.log(`[REMINDER] ${eventos.length} citas encontradas para mañana (${fechaManana}).`);

    for (const evento of eventos) {
      // Extraer teléfono desde el título "Cita - {servicio} - {phone}"
      const partes = (evento.summary || '').split(' - ');
      if (partes.length < 3) continue;

      const clientPhone = partes[partes.length - 1].trim();
      const horaEvento = new Intl.DateTimeFormat('es-MX', {
        timeZone: TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(new Date(evento.start?.dateTime || evento.start?.date));

      const mensaje = `🔔 *Recordatorio de tu cita*\nHola, te recordamos que mañana tienes una cita a las *${horaEvento}*. ¡Te esperamos!`;

      await sendWhatsAppMessage(clientPhone, mensaje);
      console.log(`[REMINDER] Recordatorio enviado a ${clientPhone} para las ${horaEvento}.`);
    }
  } catch (error) {
    console.error('[ERROR REMINDER] sendReminder:', error.message);
  }
}

// ----------------------------------------------------------------------------
// INTEGRACIÓN CON GROQ (LLaMA 3.3)
// ----------------------------------------------------------------------------

/**
 * Llama a la API de Groq con el sistema de prompts dinámico.
 */
async function callAI(systemPrompt, userMessage) {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error('Llave de Groq (GROQ_API_KEY) no configurada en .env');
  }

  const url = 'https://api.groq.com/openai/v1/chat/completions';

  const payload = {
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ],
    temperature: 0.7
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[ERROR GROQ] Fallo explícito de la API:', JSON.stringify(data, null, 2));
      throw new Error(data.error?.message || 'Error desconocido de Groq');
    }

    return data.choices[0].message.content;
  } catch (error) {
    console.error('[ERROR GROQ] Excepción general:', error.message);
    throw error;
  }
}

// ----------------------------------------------------------------------------
// INTEGRACIÓN CON WHATSAPP (Meta API)
// ----------------------------------------------------------------------------

/**
 * Envía un mensaje de texto por WhatsApp con la API de Meta.
 */
async function sendWhatsAppMessage(to, text) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;

  if (!token || !phoneId) {
    console.error('[ERROR] Faltan variables WHATSAPP en .env');
    return;
  }

  const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: false, body: text }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[ERROR WA] Fallo enviando mensaje Meta:', JSON.stringify(data, null, 2));
    } else {
      console.log(`[EXITO WA] Enviado a ${to}. MSG_ID: ${data.messages[0].id}`);
    }
  } catch (error) {
    console.error('[ERROR WA] Excepción de red:', error.message);
  }
}

// ----------------------------------------------------------------------------
// HELPERS — BOOKING
// ----------------------------------------------------------------------------

/**
 * Calcula "mañana" como Date en timezone Mexico City.
 * Respeta el cambio de horario de verano (DST).
 */
function getTomorrowInMexico() {
  const ahora = new Date();
  // Sumar 1 día en milisegundos — luego usamos Intl para formatear
  return new Date(ahora.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Convierte un slot { start: "HH:MM", end: "HH:MM" } a ISO con offset CST para una fecha.
 *
 * @param {string} fechaISO - Fecha en formato "YYYY-MM-DD" (hora local Mexico)
 * @param {string} horaHHMM - Hora en formato "HH:MM"
 * @returns {string} ISO 8601 con offset, e.g. "2025-03-26T10:00:00-06:00"
 */
function buildISOWithOffset(fechaISO, horaHHMM) {
  return `${fechaISO}T${horaHHMM}:00-06:00`;
}

/**
 * Formatea un slot de hora para mostrarlo en un mensaje de WhatsApp.
 * e.g., "10:00" → "10:00am"
 */
function formatSlotForUser(horaHHMM) {
  const [hStr] = horaHHMM.split(':');
  const hora = parseInt(hStr, 10);
  const sufijo = hora < 12 ? 'am' : 'pm';
  const hora12 = hora <= 12 ? hora : hora - 12;
  return `${hora12}:00${sufijo}`;
}

// ----------------------------------------------------------------------------
// ENDPOINTS — API
// ----------------------------------------------------------------------------

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'ARI API funcionando.' });
});

// ──────────────────────────────────────────────
// GOOGLE OAUTH — Paso 1: Redirigir a Google
// ──────────────────────────────────────────────
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
    access_type: 'offline',   // Necesario para obtener refresh_token
    prompt: 'consent',        // Forzar pantalla de consentimiento para garantizar refresh_token
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  console.log('[OAUTH] Redirigiendo a Google Authorization URL...');
  res.redirect(authUrl);
});

// ──────────────────────────────────────────────
// GOOGLE OAUTH — Paso 2: Callback con el código
// ──────────────────────────────────────────────
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
    // 1. Intercambiar el código por tokens
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri:  process.env.GOOGLE_REDIRECT_URI,
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

    // 2. Calcular expiración del access_token
    const expiracion = new Date(Date.now() + tokens.expires_in * 1000);

    // 3. Guardar tokens en DB (INSERT o UPDATE si business_id ya existe)
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

// ──────────────────────────────────────────────
// WEBHOOK — Verificación de Meta
// ──────────────────────────────────────────────
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expectedToken = process.env.WEBHOOK_VERIFY_TOKEN;

  if (mode && token) {
    if (mode === 'subscribe' && token === expectedToken) {
      return res.status(200).send(challenge);
    }
    return res.status(403).json({ error: 'Token inválido' });
  }
  return res.status(400).json({ error: 'Faltan parámetros' });
});

// ----------------------------------------------------------------------------
// STATE MACHINE — Webhook de WhatsApp (POST)
// ----------------------------------------------------------------------------
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    if (body.object !== 'whatsapp_business_account') {
      return res.sendStatus(404);
    }

    for (const entry of body.entry) {
      for (const change of entry.changes) {
        const value = change.value;

        if (!value?.messages?.length) continue;

        const message = value.messages[0];
        let from = message.from;

        // [FIX] México: Webhooks mandan "521" pero el Allowed List de Meta pide "52"
        if (from.startsWith('521') && from.length === 13) {
          from = '52' + from.substring(3);
        }

        console.log(`\n--- NUEVO MSG DE ${from} ---`);

        if (message.type !== 'text') {
          console.log(`Ignorando mensaje tipo '${message.type}'.`);
          continue;
        }

        const userMessage = message.text.body.trim();
        console.log(`💬 C: "${userMessage}"`);

        try {
          const conversation = await getOrCreateConversation(from);
          const { id: convId, state: currentState, context, business_id: businessId } = conversation;
          console.log(`⚙️  Estado actual: ${currentState}`);

          // ── ESTADO: READY_TO_BOOK ────────────────────────────────────────
          // El cliente ya está calificado. Ofrecemos hasta 3 slots disponibles.
          if (currentState === 'READY_TO_BOOK' && !context?.slotsOfrecidos) {
            await handleReadyToBook(convId, from, businessId, context);
            continue;
          }

          // ── ESTADO: READY_TO_BOOK (esperando selección de horario) ───────
          if (currentState === 'READY_TO_BOOK' && context?.slotsOfrecidos) {
            await handleSlotSelection(convId, from, businessId, context, userMessage);
            continue;
          }

          // ── ESTADOS GENERALES (NEW_LEAD / QUALIFYING) ────────────────────
          await handleGeneralState(convId, from, businessId, currentState, userMessage);

        } catch (internalError) {
          console.error('[CRÍTICO INTERNO] Fallo en procesamiento:', internalError.message);
          await sendWhatsAppMessage(from, 'En este momento no puedo procesar tu mensaje, intenta en unos minutos.');
        }
      }
    }

    // Meta requiere siempre 200 rápido para no reintentar
    res.sendStatus(200);
  } catch (error) {
    console.error('[ERROR GENERAL] Caída en el Webhook:', error);
    res.sendStatus(500);
  }
});

// ----------------------------------------------------------------------------
// HANDLERS DE STATE MACHINE (extraídos para mantener el webhook limpio)
// ----------------------------------------------------------------------------

/**
 * Maneja el estado READY_TO_BOOK la primera vez:
 * Obtiene slots disponibles para mañana y los presenta al cliente.
 */
async function handleReadyToBook(convId, from, businessId, context) {
  const manana = getTomorrowInMexico();

  const formatter = new Intl.DateTimeFormat('sv', {
    timeZone: TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const fechaManana = formatter.format(manana); // "YYYY-MM-DD"

  let slots = [];
  try {
    slots = await getAvailableSlots(businessId, manana);
  } catch {
    // Si Google Calendar falla, mandamos un mensaje de disculpa y no bloqueamos
    await sendWhatsAppMessage(from, 'Tuve un problema al consultar la disponibilidad. Por favor escríbenos de nuevo en un momento.');
    return;
  }

  if (slots.length === 0) {
    await sendWhatsAppMessage(from, 'Lamentablemente no tenemos disponibilidad para mañana. ¿Te gustaría que revisara otro día?');
    return;
  }

  // Tomar los primeros 3 slots disponibles
  const slotsAMostrar = slots.slice(0, 3);

  // Guardar los slots en el contexto para usarlos cuando el cliente responda
  await updateConversationContext(convId, {
    slotsOfrecidos: slotsAMostrar,
    fechaReserva: fechaManana,
  });

  const emojis = ['1️⃣', '2️⃣', '3️⃣'];
  const opciones = slotsAMostrar
    .map((slot, i) => `${emojis[i]} ${formatSlotForUser(slot.start)}`)
    .join('\n');

  const mensaje = `¡Perfecto! Tengo disponibilidad mañana:\n${opciones}\n\n¿Cuál prefieres?`;
  await sendWhatsAppMessage(from, mensaje);
}

/**
 * Procesa la selección de horario del cliente (1, 2 o 3).
 * Crea el evento en Google Calendar y confirma la cita.
 */
async function handleSlotSelection(convId, from, businessId, context, userMessage) {
  const seleccion = parseInt(userMessage, 10);
  const slotsOfrecidos = context.slotsOfrecidos || [];

  // Validar que la selección es 1, 2 o 3 y que el slot exista
  if (!seleccion || seleccion < 1 || seleccion > slotsOfrecidos.length) {
    await sendWhatsAppMessage(
      from,
      `Por favor responde con el número de tu horario preferido:\n1, 2 o 3. 😊`
    );
    return;
  }

  const slotElegido = slotsOfrecidos[seleccion - 1];
  const fechaReserva = context.fechaReserva;
  const serviceName = context.servicio || 'Consulta';

  const startISO = buildISOWithOffset(fechaReserva, slotElegido.start);
  const endISO   = buildISOWithOffset(fechaReserva, slotElegido.end);

  try {
    const eventId = await createCalendarEvent(businessId, from, serviceName, startISO, endISO);

    // Confirmar el evento (quitar prefijo PENDING_)
    await confirmCalendarEvent(businessId, eventId, serviceName, from);

    // Actualizar la conversación a BOOKED y guardar el eventId
    await updateConversationState(convId, 'BOOKED');
    await updateConversationContext(convId, { eventId, horarioConfirmado: slotElegido.start });

    const horaFormateada = formatSlotForUser(slotElegido.start);
    await sendWhatsAppMessage(
      from,
      `✅ Tu cita está agendada para mañana a las ${horaFormateada}. ¡Te esperamos!`
    );
  } catch {
    await sendWhatsAppMessage(
      from,
      'Hubo un problema al agendar tu cita. Por favor intenta nuevamente.'
    );
  }
}

/**
 * Maneja los estados generales: NEW_LEAD y QUALIFYING.
 * Consulta a Groq para generar la respuesta y avanza el estado si corresponde.
 */
async function handleGeneralState(convId, from, businessId, currentState, userMessage) {
  let systemPrompt = '';

  if (currentState === 'NEW_LEAD') {
    systemPrompt = 'Eres ARI, asistente virtual de un negocio. Tu único objetivo es saludar cordialmente y preguntar en qué puedes ayudar. Sé breve y amigable.';
  } else if (currentState === 'QUALIFYING') {
    systemPrompt = 'Eres ARI. Ya iniciaste conversación con el cliente. Tu objetivo es entender qué servicio necesita y si tiene urgencia. Haz máximo 2 preguntas. Cuando tengas suficiente información, incluye la palabra clave READY_TO_BOOK en tu respuesta.';
  } else {
    systemPrompt = 'Eres un asistente virtual amable y servicial.';
  }

  console.log('🧠 Consultando a Groq llama-3.3-70b-versatile...');
  let aiResponse = await callAI(systemPrompt, userMessage);

  if (currentState === 'NEW_LEAD') {
    console.log('🔄 Estado avanza: NEW_LEAD → QUALIFYING');
    await updateConversationState(convId, 'QUALIFYING');

  } else if (currentState === 'QUALIFYING' && aiResponse.includes('READY_TO_BOOK')) {
    console.log('🔄 Estado avanza: QUALIFYING → READY_TO_BOOK');
    aiResponse = aiResponse.replace('READY_TO_BOOK', '').trim();
    await updateConversationState(convId, 'READY_TO_BOOK');
  }

  console.log(`🤖 A: "${aiResponse}"`);
  await sendWhatsAppMessage(from, aiResponse);
}

// ----------------------------------------------------------------------------
// ARRANQUE DEL SERVIDOR
// ----------------------------------------------------------------------------
connectWithRetry()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🚀 Servidor ARI listo en el puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('\n💥 Servidor ARI no pudo iniciar:', err.message);
    process.exit(1);
  });
