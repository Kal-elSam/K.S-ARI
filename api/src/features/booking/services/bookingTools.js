/**
 * Definición OpenAI-compatible de tools para agendamiento con Groq.
 */

const BOOKING_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'check_availability',
      description: 'Consulta los horarios disponibles en el calendario para una fecha específica',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Fecha en formato YYYY-MM-DD',
          },
        },
        required: ['date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'book_appointment',
      description: 'Agenda una cita en el calendario cuando el cliente confirmó fecha y hora',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'Fecha en formato YYYY-MM-DD',
          },
          time: {
            type: 'string',
            description: 'Hora en formato HH:MM',
          },
          service: {
            type: 'string',
            description: 'Nombre del servicio que el cliente quiere',
          },
        },
        required: ['date', 'time', 'service'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_message',
      description: 'Envía un mensaje al cliente',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description: 'El mensaje a enviar',
          },
        },
        required: ['message'],
      },
    },
  },
];

module.exports = { BOOKING_TOOLS };
