-- Agrega columnas requeridas para notificaciones y contexto de cita bidireccional.
-- Idempotente: seguro ejecutar múltiples veces.

ALTER TABLE business_config
ADD COLUMN IF NOT EXISTS owner_phone VARCHAR(20);

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS client_name VARCHAR(100);
