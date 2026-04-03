const { TIMEZONE } = require('../core/constants');
const {
  getOrCreateConversation,
  updateConversationState,
  updateConversationContext,
} = require('./conversation');
const { buildSystemPrompt } = require('../businessConfig');
const { callAI } = require('../groq');
const { sendWhatsAppMessage } = require('./whatsapp');
const {
  getAvailableSlots,
  createCalendarEvent,
  confirmCalendarEvent,
} = require('../booking/googleCalendar');
const {
  getTomorrowInMexico,
  buildISOWithOffset,
  formatSlotForUser,
} = require('../booking/bookingHelpers');

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
  const fechaManana = formatter.format(manana);

  let slots = [];
  try {
    slots = await getAvailableSlots(businessId, manana);
  } catch {
    await sendWhatsAppMessage(from, 'Tuve un problema al consultar la disponibilidad. Por favor escríbenos de nuevo en un momento.');
    return;
  }

  if (slots.length === 0) {
    await sendWhatsAppMessage(from, 'Lamentablemente no tenemos disponibilidad para mañana. ¿Te gustaría que revisara otro día?');
    return;
  }

  const slotsAMostrar = slots.slice(0, 3);

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
 */
async function handleSlotSelection(convId, from, businessId, context, userMessage) {
  const seleccion = parseInt(userMessage, 10);
  const slotsOfrecidos = context.slotsOfrecidos || [];

  if (!seleccion || seleccion < 1 || seleccion > slotsOfrecidos.length) {
    await sendWhatsAppMessage(
      from,
      'Por favor responde con el número de tu horario preferido:\n1, 2 o 3. 😊'
    );
    return;
  }

  const slotElegido = slotsOfrecidos[seleccion - 1];
  const fechaReserva = context.fechaReserva;
  const serviceName = context.servicio || 'Consulta';

  const startISO = buildISOWithOffset(fechaReserva, slotElegido.start);
  const endISO = buildISOWithOffset(fechaReserva, slotElegido.end);

  try {
    const eventId = await createCalendarEvent(businessId, from, serviceName, startISO, endISO);

    await confirmCalendarEvent(businessId, eventId, serviceName, from);

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
 */
async function handleGeneralState(convId, from, businessId, currentState, userMessage) {
  const systemPrompt = await buildSystemPrompt(businessId, currentState);

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

module.exports = {
  handleReadyToBook,
  handleSlotSelection,
  handleGeneralState,
};
