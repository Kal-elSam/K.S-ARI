const { pool } = require('./db');

/**
 * Construye el system prompt dinámico usando toda la configuración del negocio.
 * Se consulta DB en cada mensaje para reflejar cambios del panel inmediatamente.
 */
function formatServiceForPrompt(service) {
  if (!service || typeof service !== 'object') {
    return 'Servicio';
  }
  const name = service.name || 'Servicio';
  const price = service.price;
  const currency = service.currency === 'USD' ? 'USD' : 'MXN';
  const isQuotePrice = price === null || price === undefined;

  if (!service.price_type) {
    if (isQuotePrice) {
      return `${name} (precio por cotización)`;
    }
    const safePrice = price ?? 'N/A';
    return `${name} ($${safePrice} ${currency}, ${service.duration ?? 'N/A'} min)`;
  }

  const priceTypeLabels = {
    one_time: 'pago único',
    monthly: 'renta mensual',
    annual: 'renta anual',
    per_session: 'por sesión',
  };
  const pt = service.price_type;
  const tipoLabel = priceTypeLabels[pt] || pt;
  const parts = [name];
  if (service.description) {
    parts.push(`(${String(service.description)})`);
  }

  if (isQuotePrice) {
    parts.push('(precio por cotización)');
  } else {
    parts.push(`— ${tipoLabel}: $${price} ${currency}`);
  }

  if ((pt === 'monthly' || pt === 'annual') && service.setup_fee != null && service.setup_fee !== '') {
    const sf = Number(service.setup_fee);
    if (!Number.isNaN(sf)) {
      parts.push(`setup/inscripción: $${sf} ${currency}`);
    }
  }

  if (pt === 'per_session' && service.duration != null && service.duration !== '') {
    const mins = Number(service.duration);
    if (!Number.isNaN(mins)) {
      parts.push(`${mins} min`);
    }
  }

  return parts.join(' ');
}

async function buildSystemPrompt(businessId, state) {
  const config = await getBusinessConfig(businessId);
  const safeServices = Array.isArray(config.services) ? config.services : [];
  const serviciosTexto = safeServices.length
    ? safeServices.map((service) => formatServiceForPrompt(service)).join('; ')
    : 'Sin servicios configurados';

  const base = `Eres ARI, asistente virtual de ${config.name}.
${config.slogan ? `Slogan del negocio: "${config.slogan}".` : ''}
Servicios disponibles: ${serviciosTexto}.
Horario de atención: ${config.start_hour}:00 a ${config.end_hour}:00 hrs.
Tono de comunicación: ${config.tone}.
${config.active_announcement ? `⚠️ Anuncio importante: ${config.active_announcement}` : ''}

Reglas importantes:
- Siempre responde en español
- Sé conciso, máximo 3 oraciones por mensaje
- Tu objetivo es agendar citas, no solo informar
- Nunca inventes servicios o precios que no estén en tu lista`;

  const statePrompts = {
    NEW_LEAD: `${base}
Tu misión ahora: saludar con el mensaje de bienvenida configurado y preguntar en qué puedes ayudar.
Mensaje de bienvenida a usar: "${config.welcome_message || 'Hola, ¿en qué te puedo ayudar?'}"`,

    QUALIFYING: `${base}
Tu misión ahora: entender qué servicio necesita el cliente.
Cuando tengas claro el servicio, incluye exactamente "READY_TO_BOOK" en tu respuesta.
Máximo 2 preguntas antes de avanzar.`,

    READY_TO_BOOK: `${base}
Tu misión ahora: mostrar disponibilidad y confirmar la cita.
El cliente quiere agendar — sé directo y eficiente.`,

    BOOKED: `${base}
Tu misión ahora: la cita ya está agendada.
Confirma calurosamente, menciona la hora si la tienes en contexto, despídete.
No ofrezcas más servicios ni hagas preguntas innecesarias.`,

    FOLLOW_UP: `${base}
Tu misión ahora: reactivar al cliente que no completó su cita.
Sé amigable y ofrece reagendar.`,
  };

  return statePrompts[state] || base;
}

/**
 * Devuelve una configuración de negocio por defecto.
 * Esto evita romper el webhook si aún no existe fila en business_config.
 */
function getDefaultBusinessConfig(businessId) {
  return {
    business_id: businessId,
    name: 'Negocio ARI',
    slogan: '',
    type: 'general',
    start_hour: 9,
    end_hour: 18,
    tone: 'amigable',
    welcome_message: 'Hola, soy ARI. ¿En qué puedo ayudarte?',
    active_announcement: '',
    services: [],
  };
}

/**
 * Obtiene la configuración del negocio desde business_config.
 */
async function getBusinessConfig(businessId) {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM business_config WHERE business_id = $1 LIMIT 1',
      [businessId]
    );

    if (rows.length === 0) {
      return getDefaultBusinessConfig(businessId);
    }

    const config = rows[0];
    return {
      ...config,
      services: Array.isArray(config.services) ? config.services : [],
    };
  } catch (error) {
    console.error('[ERROR DB] No se pudo leer business_config:', error.message);
    return getDefaultBusinessConfig(businessId);
  }
}

module.exports = {
  formatServiceForPrompt,
  buildSystemPrompt,
  getDefaultBusinessConfig,
  getBusinessConfig,
};
