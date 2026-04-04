const OWNER_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_appointments',
      description: 'Obtiene las citas de un día específico o de hoy',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Fecha YYYY-MM-DD. Si no se especifica usa hoy',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_appointment',
      description: 'Cancela una cita del calendario y notifica al cliente',
      parameters: {
        type: 'object',
        properties: {
          event_id: { type: 'string', description: 'ID del evento' },
          client_phone: { type: 'string', description: 'Teléfono del cliente' },
          client_name: { type: 'string', description: 'Nombre del cliente' },
          reason: { type: 'string', description: 'Razón de cancelación (opcional)' },
        },
        required: ['event_id', 'client_phone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reschedule_appointment',
      description: 'Reagenda una cita a nueva fecha y hora',
      parameters: {
        type: 'object',
        properties: {
          event_id: { type: 'string', description: 'ID del evento actual' },
          client_phone: { type: 'string', description: 'Teléfono del cliente' },
          client_name: { type: 'string', description: 'Nombre del cliente' },
          new_date: { type: 'string', description: 'Nueva fecha YYYY-MM-DD' },
          new_time: { type: 'string', description: 'Nueva hora HH:MM' },
        },
        required: ['event_id', 'client_phone', 'new_date', 'new_time'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'block_day',
      description: 'Bloquea un día completo en el calendario',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Fecha YYYY-MM-DD' },
          reason: { type: 'string', description: 'Razón del bloqueo' },
        },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'broadcast_message',
      description: 'Manda un mensaje a todos los clientes con cita en un día',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Fecha YYYY-MM-DD' },
          message: { type: 'string', description: 'Mensaje a enviar' },
        },
        required: ['date', 'message'],
      },
    },
  },
];

module.exports = { OWNER_TOOLS };
