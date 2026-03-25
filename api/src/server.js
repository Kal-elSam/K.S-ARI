const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const express = require('express');
const { Pool } = require('pg');

// ----------------------------------------------------------------------------
// VALIDACIÓN DE VARIABLES DE ENTORNO
// Imprime qué variables están presentes o ausentes sin mostrar los valores reales.
// ----------------------------------------------------------------------------
const ENV_VARS_REQUERIDAS = [
  'PORT',
  'DATABASE_URL',
  'WHATSAPP_TOKEN',
  'WHATSAPP_PHONE_ID',
  'WEBHOOK_VERIFY_TOKEN',
  'GROQ_API_KEY'
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

app.use(express.json());

// ----------------------------------------------------------------------------
// BASE DE DATOS (PostgreSQL)
// Usamos el paquete "pg" sin ORMs.
// Retry logic: si Postgres aún no está listo al arrancar (e.g., Docker lento),
// reintenta hasta 3 veces con 2 segundos de espera entre intentos.
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
 * @param {number} delayMs - Milisegundos de espera entre intentos (default: 2000)
 */
async function connectWithRetry(maxRetries = 3, delayMs = 2000) {
  for (let intento = 1; intento <= maxRetries; intento++) {
    try {
      const client = await pool.connect();
      client.release(); // Solo verificamos que la conexión sea viable
      console.log(`✅ PostgreSQL conectado correctamente (intento ${intento}/${maxRetries}).`);
      return; // Éxito — salimos de la función
    } catch (error) {
      console.error(`[DB] Intento ${intento}/${maxRetries} fallido: ${error.message}`);
      if (intento === maxRetries) {
        // Si agotamos todos los intentos, lanzamos el error final para que el proceso falle visiblemente
        throw new Error(`[DB] No se pudo conectar a PostgreSQL tras ${maxRetries} intentos. Verifica DATABASE_URL y que el contenedor esté corriendo.`);
      }
      // Esperamos antes del siguiente intento
      console.log(`   ⏳ Reintentando en ${delayMs / 1000} segundos...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/**
 * Función para obtener o crear una conversación basada en el número de teléfono.
 * Crea la conversación en estado NEW_LEAD.
 */
async function getOrCreateConversation(phone) {
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT * FROM conversations WHERE phone = $1 LIMIT 1', [phone]);
    
    if (rows.length > 0) {
      return rows[0]; // Retorna la conversación existente
    } else {
      // Si no existe, crearla con estado NEW_LEAD
      const insertQuery = `
        INSERT INTO conversations (phone, state, business_id, context)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
      `;
      // Convertimos un objeto vacío {} a string JSON
      const values = [phone, 'NEW_LEAD', 'demo', JSON.stringify({})];
      const result = await client.query(insertQuery, values);
      return result.rows[0];
    }
  } catch (error) {
    console.error('[ERROR DB] Falla al buscar o crear la conversación:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Función para actualizar la máquina de estados de una conversación
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
    throw error; // Lanzamos de vuelta el error para manejarlo en el Webhook general
  }
}

/**
 * Función para actualizar el jsonb de contexto con nueva data (merge)
 */
async function updateConversationContext(id, newContext) {
  try {
    // El operador || en jsonb combina el existente con el nuevo sin sobreescribir lo ajeno
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
// INTEGRACIÓN CON OPENAI (GPT-4o mini)
// ----------------------------------------------------------------------------

/**
 * Llama a la API de OpenAI estructurando el chat history con el mensaje actual
 * usando fetch nativo.
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
      console.error('[ERROR OPENAI] Fallo explícito de la API:', JSON.stringify(data, null, 2));
      throw new Error(data.error?.message || 'Error desconocido del lado de OpenAI');
    }

    // Retorna string procesado de contenido
    return data.choices[0].message.content;
  } catch (error) {
    console.error('[ERROR OPENAI] Excepción general:', error.message);
    throw error; // Tiramos para mandar el "lo siento" desde el try-catch de webhook
  }
}

// ----------------------------------------------------------------------------
// INTEGRACIÓN CON WHATSAPP (Meta API)
// ----------------------------------------------------------------------------

/**
 * Enviar mensaje de WhatsApp
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
    to: to,
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
      console.error('[ERROR] Fallo enviando WhatsApp Meta:', JSON.stringify(data, null, 2));
    } else {
      console.log(`[EXITO] WA Enviado a ${to}. MSG_ID: ${data.messages[0].id}`);
    }
  } catch (error) {
    console.error('[ERROR] Excepción de red al enviar WhatsApp:', error.message);
  }
}

// ----------------------------------------------------------------------------
// ENDPOINTS DE LA API
// ----------------------------------------------------------------------------

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'ARI API funcionando. Database & OpenAI connected.' });
});

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expectedToken = process.env.WEBHOOK_VERIFY_TOKEN;

  if (mode && token) {
    if (mode === 'subscribe' && token === expectedToken) {
      return res.status(200).send(challenge);
    } else {
      return res.status(403).json({ error: 'Token inválido' });
    }
  }
  return res.status(400).json({ error: 'Faltan parámetros' });
});


// ----------------------------------------------------------------------------
// STATE MACHINE LOGIC (Recepción de mensajes)
// ----------------------------------------------------------------------------
app.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          const value = change.value;
          
          if (value && value.messages && value.messages.length > 0) {
            const message = value.messages[0];
            let from = message.from;
            
            // [FIX] México: Webhooks mandan "521" pero el Allowed List de Meta pide "52"
            if (from.startsWith('521') && from.length === 13) {
              from = '52' + from.substring(3);
            }

            const messageId = message.id;

            console.log(`\n--- NUEVO MSG RECIBIDO DE ${from} ---`);

            if (message.type === 'text') {
              const userMessage = message.text.body;
              console.log(`💬 C: "${userMessage}"`);

              try {
                // 1. Logica de Base de Datos - Obtener Conversacion activa
                let conversation = await getOrCreateConversation(from);
                let currentState = conversation.state;
                console.log(`⚙️ State actual de la cuenta: ${currentState}`);

                // 2. Construir System Prompt Dinámico acorde al Estado
                let systemPrompt = "";
                if (currentState === 'NEW_LEAD') {
                  systemPrompt = "Eres ARI, asistente virtual de un negocio. Tu único objetivo es saludar cordialmente y preguntar en qué puedes ayudar. Sé breve y amigable.";
                } else if (currentState === 'QUALIFYING') {
                  systemPrompt = "Eres ARI. Ya iniciaste conversación con el cliente. Tu objetivo es entender qué servicio necesita y si tiene urgencia. Haz máximo 2 preguntas. Cuando tengas suficiente información, responde con la palabra clave READY_TO_BOOK en tu respuesta.";
                } else if (currentState === 'READY_TO_BOOK') {
                  systemPrompt = "Eres ARI. El cliente quiere agendar. Dile que con gusto lo agendas y que en breve le confirmas disponibilidad. Por ahora responde con un mensaje de confirmación cálido.";
                } else {
                  systemPrompt = "Eres un asistente virtual amable y servicial."; // Fallback
                }

                // 3. Consultar la API de la IA con fetch nativo
                console.log(`🧠 Consultando a Groq llama-3.3-70b-versatile...`);
                let aiResponse = await callAI(systemPrompt, userMessage);

                // 4. Lógica de avance de Estados dependiente de OpenAI
                if (currentState === 'NEW_LEAD') {
                  // Si estamos en lead e impactamos saludo, mandamos directo a calificar para la sig
                  console.log('🔄 Estado avanza: NEW_LEAD -> QUALIFYING');
                  await updateConversationState(conversation.id, 'QUALIFYING');
                  
                } else if (currentState === 'QUALIFYING' && aiResponse.includes('READY_TO_BOOK')) {
                  // Si OpenAI descubrió que el Lead ya está listo, lo avanzamos de estado
                  console.log('🔄 Estado avanza: QUALIFYING -> READY_TO_BOOK');
                  aiResponse = aiResponse.replace('READY_TO_BOOK', '').trim(); // Removemos flag visible para usuario
                  await updateConversationState(conversation.id, 'READY_TO_BOOK');
                }

                // 6. Responder a cliente con el resultado final
                console.log(`A: "${aiResponse}"`);
                await sendWhatsAppMessage(from, aiResponse);

              } catch (internalError) {
                // Captura fallos de Base de Datos o caída de servidor en OpenAI
                console.error('[CRÍTICO INTERNO] Falló el procesamiento lógico/IA:', internalError.message);
                await sendWhatsAppMessage(from, "En este momento no puedo procesar tu mensaje, intenta en unos minutos.");
              }

            } else {
              console.log(`Ignorando mensaje tipo '${message.type}'.`);
            }
          }
        }
      }
      // Retornar al servidor de Meta siempre Status OK 200 rápido para no ser penalizados o retryed.
      res.sendStatus(200);
    } else {
      res.sendStatus(404);
    }
  } catch (error) {
    console.error('[ERROR GENERAL] Caída en el procesamiento madre del Webhook:', error);
    res.sendStatus(500);
  }
});

// Intentamos conectar a la BD antes de abrir el servidor al tráfico.
// Así evitamos que el webhook acepte mensajes sin una DB operacional.
connectWithRetry()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🚀 Servidor ARI listo en el puerto ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('\n💥 Servidor ARI no pudo iniciar:', err.message);
    process.exit(1); // Salida con código de error para que Docker/Railway lo detecte
  });
