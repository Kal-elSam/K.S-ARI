const { pool } = require('../core/db');
const { normalizeBusinessConfigPayload } = require('../core/normalizeBusinessConfigPayload');
const { GOOGLE_CALENDAR_BASE, getValidAccessToken } = require('../booking/googleCalendar');

/**
 * @param {import('express').Express} app
 */
function registerDashboardRoutes(app) {
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'ARI API funcionando.' });
  });

  app.get('/api/metrics', async (req, res) => {
    try {
      const leadsTodayResult = await pool.query(
        `SELECT COUNT(*)::int AS leads_today
         FROM conversations
         WHERE created_at::date = CURRENT_DATE`
      );

      const bookedWeekResult = await pool.query(
        `SELECT COUNT(*)::int AS appointments_week
         FROM conversations
         WHERE state = 'BOOKED'
         AND date_trunc('week', created_at) = date_trunc('week', CURRENT_DATE)`
      );

      const totalWeekResult = await pool.query(
        `SELECT COUNT(*)::int AS total_week
         FROM conversations
         WHERE date_trunc('week', created_at) = date_trunc('week', CURRENT_DATE)`
      );

      const recentConversationsResult = await pool.query(
        `SELECT id, phone, state, business_id, created_at
         FROM conversations
         ORDER BY created_at DESC
         LIMIT 5`
      );

      const appointmentsWeek = bookedWeekResult.rows[0]?.appointments_week || 0;
      const totalWeek = totalWeekResult.rows[0]?.total_week || 0;
      const conversionRate = totalWeek > 0
        ? Number(((appointmentsWeek / totalWeek) * 100).toFixed(1))
        : 0;

      return res.status(200).json({
        leads_today: leadsTodayResult.rows[0]?.leads_today || 0,
        appointments_week: appointmentsWeek,
        conversion_rate: conversionRate,
        avg_response_time: '1m 30s',
        recent_conversations: recentConversationsResult.rows,
      });
    } catch (error) {
      console.error('[ERROR API] /api/metrics:', error.message);
      return res.status(500).json({ error: 'No se pudieron obtener métricas.' });
    }
  });

  app.get('/api/conversations', async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, phone, state, business_id, created_at, updated_at
         FROM conversations
         ORDER BY updated_at DESC`
      );

      return res.status(200).json(rows);
    } catch (error) {
      console.error('[ERROR API] /api/conversations:', error.message);
      return res.status(500).json({ error: 'No se pudieron obtener conversaciones.' });
    }
  });

  app.get('/api/conversations/:phone/messages', async (req, res) => {
    try {
      const { phone } = req.params;

      const messages = [
        {
          id: 'mock-1',
          from: phone,
          text: 'Hola, quiero información de servicios.',
          sent_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        },
        {
          id: 'mock-2',
          from: 'ari',
          text: '¡Hola! Claro, te puedo ayudar a agendar tu cita.',
          sent_at: new Date(Date.now() - 29 * 60 * 1000).toISOString(),
        },
        {
          id: 'mock-3',
          from: phone,
          text: 'Me interesa una limpieza dental.',
          sent_at: new Date(Date.now() - 27 * 60 * 1000).toISOString(),
        },
      ];

      return res.status(200).json(messages);
    } catch (error) {
      console.error('[ERROR API] /api/conversations/:phone/messages:', error.message);
      return res.status(500).json({ error: 'No se pudo obtener el historial de mensajes.' });
    }
  });

  app.get('/api/appointments', async (req, res) => {
    try {
      const accessToken = await getValidAccessToken('demo');

      const now = new Date();
      const day = now.getDay();
      const diffToMonday = (day + 6) % 7;

      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - diffToMonday);
      weekStart.setHours(0, 0, 0, 0);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);

      const url = new URL(`${GOOGLE_CALENDAR_BASE}/calendars/primary/events`);
      url.searchParams.set('timeMin', weekStart.toISOString());
      url.searchParams.set('timeMax', weekEnd.toISOString());
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('orderBy', 'startTime');

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Error al consultar eventos en Google Calendar');
      }

      const appointments = (data.items || []).map((event) => {
        const summary = event.summary || '';
        const summaryParts = summary.split(' - ');
        const phone = summaryParts[summaryParts.length - 1] || null;
        const servicePart = summaryParts.length > 1 ? summaryParts[1] : null;

        return {
          id: event.id,
          title: summary || 'Sin título',
          start: event.start?.dateTime || event.start?.date || null,
          end: event.end?.dateTime || event.end?.date || null,
          phone,
          service: servicePart ? servicePart.replace('PENDING_', '').trim() : null,
        };
      });

      return res.status(200).json(appointments);
    } catch (error) {
      console.error('[ERROR API] /api/appointments:', error.message);
      return res.status(500).json({ error: 'No se pudieron obtener las citas de la semana.' });
    }
  });

  app.get('/api/config/:businessId', async (req, res) => {
    try {
      const { businessId } = req.params;
      const { rows } = await pool.query(
        'SELECT * FROM business_config WHERE business_id = $1 LIMIT 1',
        [businessId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: `No existe configuración para ${businessId}.` });
      }

      return res.status(200).json(rows[0]);
    } catch (error) {
      console.error('[ERROR API] /api/config/:businessId (GET):', error.message);
      const isDev = process.env.NODE_ENV !== 'production';
      return res.status(500).json({
        error: 'No se pudo leer la configuración del negocio.',
        ...(isDev && error?.message ? { detail: error.message } : {}),
      });
    }
  });

  app.post('/api/config/:businessId', async (req, res) => {
    try {
      const { businessId } = req.params;

      if (!Array.isArray(req.body?.services)) {
        return res.status(400).json({ error: 'El campo services debe ser un arreglo JSON.' });
      }

      const n = normalizeBusinessConfigPayload(req.body, businessId);

      const query = `
      INSERT INTO business_config (
        business_id, name, slogan, owner_phone, type, start_hour, end_hour, tone, welcome_message, active_announcement, services
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
      ON CONFLICT (business_id) DO UPDATE
      SET
        name = EXCLUDED.name,
        slogan = EXCLUDED.slogan,
        owner_phone = EXCLUDED.owner_phone,
        type = EXCLUDED.type,
        start_hour = EXCLUDED.start_hour,
        end_hour = EXCLUDED.end_hour,
        tone = EXCLUDED.tone,
        welcome_message = EXCLUDED.welcome_message,
        active_announcement = EXCLUDED.active_announcement,
        services = EXCLUDED.services,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *;
    `;

      const values = [
        n.businessId,
        n.name,
        n.slogan,
        n.owner_phone,
        n.type,
        n.start_hour,
        n.end_hour,
        n.tone,
        n.welcome_message,
        n.active_announcement,
        JSON.stringify(n.services),
      ];

      const result = await pool.query(query, values);
      return res.status(200).json({ success: true, config: result.rows[0] });
    } catch (error) {
      console.error('[ERROR API] /api/config/:businessId (POST):', error.message);
      const isDev = process.env.NODE_ENV !== 'production';
      return res.status(500).json({
        error: 'No se pudo actualizar la configuración del negocio.',
        ...(isDev && error?.message ? { detail: error.message } : {}),
      });
    }
  });
}

module.exports = { registerDashboardRoutes };
