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
  addCalendarDays,
  buildISOWithOffset,
  formatDateDDMMYYYY,
  formatDateISOYYYYMMDD,
  formatFechaTextoUsuario,
  formatSlotForUser,
  getTodayInTimezone,
  parseISODateToUTCNoon,
} = require('../booking/bookingHelpers');

/**
 * Maneja la primera entrada al estado READY_TO_BOOK.
 * Pregunta qué día prefiere el cliente para su cita.
 */
async function handleReadyToBook(convId, from, businessId, context) {
  await updateConversationContext(convId, {
    esperandoDia: true,
  });

  const mensaje = '¡Perfecto! ¿Qué día te queda mejor para tu cita?\nPuedes decirme el día de la semana o una fecha específica 📅';
  await sendWhatsAppMessage(from, mensaje);
}

/**
 * Extrae y procesa el día elegido por el cliente en READY_TO_BOOK.
 */
function normalizeDateExtractorResult(rawResponse) {
  if (!rawResponse) return 'NO_DATE';

  const cleanResponse = String(rawResponse).trim();
  const lines = cleanResponse.split('\n').map((line) => line.trim()).filter(Boolean);
  const tokens = ['NO_DATE', 'PAST_DATE'];

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (tokens.includes(upper)) return upper;
    if (/^\d{4}-\d{2}-\d{2}$/.test(line)) return line;
  }

  const directToken = cleanResponse.match(/\b(NO_DATE|PAST_DATE)\b/i);
  if (directToken?.[1]) return directToken[1].toUpperCase();

  const isoDate = cleanResponse.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (isoDate?.[0]) return isoDate[0];

  return 'NO_DATE';
}

async function handleDaySelection(convId, from, businessId, context, userMessage) {
  const today = getTodayInTimezone();
  const todayText = formatDateDDMMYYYY(today);
  const todayISO = formatDateISOYYYYMMDD(today);
  const systemPrompt = `Eres un extractor de fechas. Hoy es ${todayText}.
El usuario quiere agendar una cita. Extrae qué día menciona.
Responde SOLO con la fecha en formato YYYY-MM-DD.

Reglas:
- 'mañana' → fecha de mañana
- 'pasado mañana' → fecha en 2 días
- 'el lunes', 'el martes', etc → el próximo día de esa semana
- 'esta semana' → mañana
- 'la próxima semana' → el lunes de la próxima semana
- 'en 15 días' → fecha en 15 días
- Si no menciona fecha → responde exactamente: NO_DATE
- Si la fecha es hoy o pasada → responde exactamente: PAST_DATE

Mensaje del usuario: ${userMessage}`;

  let extractedDate;
  try {
    const aiResponse = await callAI(systemPrompt, 'OK', { temperature: 0 });
    extractedDate = normalizeDateExtractorResult(aiResponse);
  } catch {
    await sendWhatsAppMessage(from, 'Tuve un problema al entender la fecha. ¿Puedes decirme el día nuevamente?');
    return;
  }

  if (extractedDate === 'NO_DATE') {
    await sendWhatsAppMessage(
      from,
      "No entendí bien el día 😅 ¿Puedes decirme el día de la semana o una fecha? Por ejemplo: 'el jueves' o '15 de abril'"
    );
    return;
  }

  if (extractedDate === 'PAST_DATE' || extractedDate <= todayISO) {
    await sendWhatsAppMessage(
      from,
      'Ese día ya pasó 😊 ¿Te refieres a la próxima semana? Dime el día y con gusto reviso'
    );
    return;
  }

  const requestedDate = parseISODateToUTCNoon(extractedDate);
  let slots = [];
  try {
    slots = await getAvailableSlots(businessId, requestedDate);
  } catch {
    await sendWhatsAppMessage(from, 'Tuve un problema al consultar la disponibilidad. Por favor escríbenos de nuevo en un momento.');
    return;
  }

  if (slots.length > 0) {
    const slotsAMostrar = slots.slice(0, 3);
    const emojis = ['1️⃣', '2️⃣', '3️⃣'];
    const fechaTexto = formatFechaTextoUsuario(extractedDate);
    const opciones = slotsAMostrar
      .map((slot, index) => `${emojis[index]} ${formatSlotForUser(slot.start)}`)
      .join('\n');

    await updateConversationContext(convId, {
      esperandoDia: false,
      slotsOfrecidos: slotsAMostrar,
      fechaReserva: extractedDate,
      fechaTexto,
    });

    await sendWhatsAppMessage(from, `${fechaTexto} tengo disponible:\n${opciones}\n\n¿Cuál prefieres?`);
    return;
  }

  for (let dayOffset = 1; dayOffset <= 14; dayOffset += 1) {
    const nextDate = addCalendarDays(requestedDate, dayOffset);
    const nextDateISO = formatDateISOYYYYMMDD(nextDate);
    let nextSlots = [];
    try {
      nextSlots = await getAvailableSlots(businessId, nextDate);
    } catch {
      await sendWhatsAppMessage(from, 'Tuve un problema al consultar la disponibilidad. Por favor escríbenos de nuevo en un momento.');
      return;
    }

    if (nextSlots.length === 0) continue;

    const slotsAMostrar = nextSlots.slice(0, 3);
    const fechaTexto = formatFechaTextoUsuario(nextDateISO);
    const horariosTexto = slotsAMostrar.map((slot) => formatSlotForUser(slot.start)).join(', ');

    await updateConversationContext(convId, {
      esperandoDia: false,
      slotsOfrecidos: slotsAMostrar,
      fechaReserva: nextDateISO,
      fechaTexto,
    });

    await sendWhatsAppMessage(
      from,
      `Ese día no tengo disponibilidad 😕\nEl próximo día disponible es ${fechaTexto}, con horarios a las ${horariosTexto}. ¿Te funciona?`
    );
    return;
  }

  await updateConversationContext(convId, { esperandoDia: true });
  await sendWhatsAppMessage(
    from,
    'No encontré horarios disponibles en los próximos días 😕 ¿Quieres que revise otra fecha?'
  );
}

function normalizeSlotIntentResponse(rawResponse) {
  if (!rawResponse) return 'UNCLEAR';
  const upper = String(rawResponse).trim().toUpperCase();
  const match = upper.match(/\b(SLOT_[1-3]|REJECT|UNCLEAR)\b/);
  return match ? match[1] : 'UNCLEAR';
}

/**
 * Procesa la selección de horario del cliente (1, 2 o 3) con detección de intención por IA.
 */
async function handleSlotSelection(convId, from, businessId, context, userMessage) {
  const slotsOfrecidos = context.slotsOfrecidos || [];
  if (slotsOfrecidos.length === 0) {
    await sendWhatsAppMessage(
      from,
      'Por favor elige primero un día para tu cita y te muestro los horarios disponibles.'
    );
    return;
  }

  const slotsFormateados = slotsOfrecidos
    .map((slot, index) => `${index + 1}. ${formatSlotForUser(slot.start)}`)
    .join('\n');

  const systemPrompt = `El usuario está viendo estas opciones de horario:
${slotsFormateados}

¿Qué quiere el usuario? Responde SOLO una de estas palabras:
SLOT_1 → eligió el primer horario (dice '1', 'primero', 'el primero', '10am', etc)
SLOT_2 → eligió el segundo horario
SLOT_3 → eligió el tercer horario
REJECT → no le quedan bien, quiere otro día, otra hora, cambiar
         (dice: 'no', 'ninguno', 'otro día', 'mejor otro',
          'no me queda', 'cambiar', 'diferente', 'no puedo')
UNCLEAR → no se entiende su respuesta

Mensaje del usuario: ${userMessage}`;

  let intent;
  try {
    const aiResponse = await callAI(systemPrompt, 'OK', { temperature: 0 });
    intent = normalizeSlotIntentResponse(aiResponse);
  } catch {
    await sendWhatsAppMessage(
      from,
      'Tuve un problema al leer tu respuesta. ¿Puedes decirme 1, 2 o 3, u otro día si prefieres?'
    );
    return;
  }

  if (intent === 'REJECT') {
    await updateConversationContext(convId, {
      slotsOfrecidos: [],
      esperandoDia: true,
    });
    await sendWhatsAppMessage(from, 'Sin problema 😊 ¿Qué otro día te queda mejor?');
    return;
  }

  if (intent === 'UNCLEAR') {
    await sendWhatsAppMessage(
      from,
      'Por favor responde con el número de tu horario preferido:\n1, 2 o 3. 😊'
    );
    return;
  }

  const slotIndex = intent === 'SLOT_1' ? 0 : intent === 'SLOT_2' ? 1 : 2;
  if (slotIndex >= slotsOfrecidos.length) {
    await sendWhatsAppMessage(
      from,
      'Esa opción no está disponible. Por favor elige 1, 2 o 3 según los horarios que te mostré. 😊'
    );
    return;
  }

  const slotElegido = slotsOfrecidos[slotIndex];
  const fechaReserva = context.fechaReserva;
  const serviceName = context.servicio || 'Consulta';

  const startISO = buildISOWithOffset(fechaReserva, slotElegido.start);
  const endISO = buildISOWithOffset(fechaReserva, slotElegido.end);

  try {
    const eventId = await createCalendarEvent(businessId, from, serviceName, startISO, endISO);

    await confirmCalendarEvent(businessId, eventId, serviceName, from);

    await updateConversationState(convId, 'BOOKED');
    await updateConversationContext(convId, {
      eventId,
      horarioConfirmado: slotElegido.start,
      esperandoDia: false,
      slotsOfrecidos: [],
    });

    const horaFormateada = formatSlotForUser(slotElegido.start);
    const fechaTexto = context.fechaTexto || formatFechaTextoUsuario(fechaReserva);
    await sendWhatsAppMessage(
      from,
      `✅ Tu cita está agendada para ${fechaTexto} a las ${horaFormateada}. ¡Te esperamos!`
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
function normalizeSpanishText(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isNewBusinessQuestion(userMessage) {
  if (!userMessage) return false;
  if (userMessage.includes('?') || userMessage.includes('¿')) return true;

  const normalizedMessage = normalizeSpanishText(userMessage);
  const questionKeywords = ['que', 'cuanto', 'como', 'cual', 'tienen', 'ofrecen', 'precio', 'costo', 'informacion'];

  return questionKeywords.some((keyword) => {
    const keywordRegex = new RegExp(`\\b${keyword}\\b`, 'i');
    return keywordRegex.test(normalizedMessage);
  });
}

async function handleGeneralState(convId, from, businessId, currentState, userMessage) {
  const promptState = currentState === 'BOOKED' && isNewBusinessQuestion(userMessage)
    ? 'QUALIFYING'
    : currentState;
  const systemPrompt = await buildSystemPrompt(businessId, promptState);

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
  handleDaySelection,
  handleSlotSelection,
  handleGeneralState,
};
