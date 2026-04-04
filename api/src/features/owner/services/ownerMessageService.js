const { pool } = require('../../../core/db');
const { callAIWithTools } = require('../../../infrastructure/groqClient');
const { sendWhatsAppMessage } = require('../../../whatsapp/whatsapp');
const { OWNER_TOOLS } = require('./ownerTools');
const { executeOwnerTool } = require('./ownerToolExecutor');

const MAX_TOOL_ROUNDS = 5;

function normalizeOwnerDecision(text) {
  const normalized = String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  if (normalized === '1' || normalized.includes('si') || normalized.includes('aprobar')) return 'approve';
  if (normalized === '2' || normalized.includes('no') || normalized.includes('rechazar')) return 'reject';
  return null;
}

async function findPendingRescheduleApproval(businessId) {
  const { rows } = await pool.query(
    `SELECT id, phone, context
     FROM conversations
     WHERE business_id = $1
       AND COALESCE((context->>'pending_owner_reschedule_approval')::boolean, false) = true
     ORDER BY updated_at DESC
     LIMIT 1`,
    [businessId]
  );
  return rows[0] || null;
}

async function resolvePendingApproval(ownerPhone, businessId, ownerMessage) {
  try {
    const pending = await findPendingRescheduleApproval(businessId);
    if (!pending) {
      return false;
    }

    const decision = normalizeOwnerDecision(ownerMessage);
    if (!decision) {
      await sendWhatsAppMessage(
        ownerPhone,
        'Tienes una solicitud de reagenda pendiente. Responde:\n1️⃣ Sí, que elija nueva fecha\n2️⃣ No, mantener cita'
      );
      return true;
    }

    const pendingCtx = pending.context || {};
    const clientName = pendingCtx.reminder_client_name || pending.phone;
    if (decision === 'approve') {
      await pool.query(
        `UPDATE conversations
         SET state = 'READY_TO_BOOK',
             context = context
               || '{"pending_owner_reschedule_approval": false, "reminder_sent": false, "owner_reschedule_approved": true}'::jsonb,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [pending.id]
      );

      await sendWhatsAppMessage(
        pending.phone,
        `Perfecto ${clientName} 👋 El dueño aprobó tu cambio. ¿Qué día te gustaría reagendar?`
      );
      await sendWhatsAppMessage(ownerPhone, `Aprobado ✅ ${clientName} ya puede elegir nueva fecha.`);
      return true;
    }

    await pool.query(
      `UPDATE conversations
       SET context = context
         || '{"pending_owner_reschedule_approval": false, "owner_reschedule_approved": false}'::jsonb,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [pending.id]
    );
    await sendWhatsAppMessage(
      pending.phone,
      'Lo sentimos, por ahora no podemos reagendar. Contáctanos directamente para coordinar.'
    );
    await sendWhatsAppMessage(ownerPhone, `Solicitud rechazada ❌ para ${clientName}.`);
    return true;
  } catch (error) {
    console.error('[OWNER FLOW] Error resolviendo aprobación pendiente:', error.message);
    return false;
  }
}

function buildOwnerPrompt(config) {
  const fechaHoy = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    dateStyle: 'full',
  }).format(new Date());

  return `Eres ARI, asistente de ${config.name}.
Estás hablando con el dueño del negocio.
Hoy es ${fechaHoy}.
Puedes ayudarle a gestionar su agenda, cancelar o reagendar citas y comunicarse con sus clientes.
Sé directo y eficiente. Confirma siempre antes de cancelar o reagendar para evitar errores.`;
}

function buildToolMessage(content, toolCallId) {
  return {
    role: 'tool',
    tool_call_id: toolCallId,
    content,
  };
}

async function handleOwnerMessage(from, businessId, userMessage, config) {
  try {
    const handledPending = await resolvePendingApproval(from, businessId, userMessage);
    if (handledPending) {
      return;
    }

    const systemPrompt = buildOwnerPrompt(config);
    const messages = [{ role: 'user', content: userMessage }];
    let finalResponse = '';

    for (let step = 0; step < MAX_TOOL_ROUNDS; step += 1) {
      const aiMessage = await callAIWithTools(systemPrompt, messages, OWNER_TOOLS, { temperature: 0.2 });
      const hasToolCalls = Array.isArray(aiMessage.tool_calls) && aiMessage.tool_calls.length > 0;

      if (!hasToolCalls) {
        finalResponse = typeof aiMessage.content === 'string' ? aiMessage.content : '';
        break;
      }

      messages.push({
        role: 'assistant',
        content: typeof aiMessage.content === 'string' ? aiMessage.content : '',
        tool_calls: aiMessage.tool_calls,
      });

      for (const toolCall of aiMessage.tool_calls) {
        let args = {};
        try {
          args = JSON.parse(toolCall.function?.arguments || '{}');
        } catch {
          messages.push(buildToolMessage('Error: argumentos inválidos (JSON).', toolCall.id));
          continue;
        }

        let toolResult = '';
        try {
          toolResult = await executeOwnerTool(toolCall, args, businessId);
        } catch (error) {
          toolResult = `Error al ejecutar herramienta: ${error.message}`;
        }
        messages.push(buildToolMessage(toolResult, toolCall.id));
      }
    }

    await sendWhatsAppMessage(from, finalResponse || 'Listo. ¿Qué más necesitas en la agenda?');
  } catch (error) {
    console.error('[OWNER FLOW] Error:', error.message);
    await sendWhatsAppMessage(from, 'No pude procesar tu solicitud como dueño en este momento.');
  }
}

module.exports = { handleOwnerMessage };
