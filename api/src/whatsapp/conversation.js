const { pool } = require('../core/db');

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

module.exports = {
  getOrCreateConversation,
  updateConversationState,
  updateConversationContext,
};
