const { pool } = require('./core/db');

async function buildSystemPrompt(businessId, state) {
  const config = await getBusinessConfig(businessId);
  const safeServices = Array.isArray(config.services) ? config.services : [];
  const serviciosDetalle = safeServices
    .map((service) => {
      if (!service || typeof service !== 'object') {
        return '• Servicio';
      }

      let linea = `• ${service.name || 'Servicio'}`;
      if (service.description) linea += `: ${service.description}`;
      if (service.price && service.price_type) {
        const tipos = {
          monthly: '/mes',
          one_time: 'pago único',
          per_session: 'por sesión',
          annual: '/año',
        };
        linea += ` — $${service.price} ${service.currency || 'MXN'} ${tipos[service.price_type] || ''}`;
        if (service.setup_fee) linea += ` (setup inicial: $${service.setup_fee} ${service.currency || 'MXN'})`;
      } else if (service.price_label) {
        linea += ` — ${service.price_label}`;
      }
      return linea;
    })
    .join('\n');

  const base = `Eres ARI, asistente virtual de ${config.name}.
${config.slogan ? `Slogan: "${config.slogan}"` : ''}

CONOCIMIENTO DEL NEGOCIO (responde con esta info cuando te pregunten):
Servicios y precios:
${serviciosDetalle || 'Sin servicios configurados'}
Horario: ${config.start_hour}:00 a ${config.end_hour}:00 hrs, de lunes a viernes.
Tono: ${config.tone}.
${config.active_announcement ? `Promoción activa: ${config.active_announcement}` : ''}

REGLAS IMPORTANTES:
- Siempre responde en español
- Si te preguntan por servicios, precios o información del negocio → responde con los datos de arriba
- Si el cliente muestra interés en contratar o agendar → enfócate en agendar
- Máximo 3 oraciones por mensaje
- Nunca inventes información que no esté en este prompt
- Si no sabes algo → di "Para más información puedes contactarnos directamente"`;

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
  buildSystemPrompt,
  getDefaultBusinessConfig,
  getBusinessConfig,
};
