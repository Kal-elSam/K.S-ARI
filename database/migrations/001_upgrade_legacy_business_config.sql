-- Actualiza tablas `business_config` antiguas (p. ej. Railway con pocas columnas)
-- hasta el esquema esperado por la API. Idempotente: seguro ejecutar varias veces.

ALTER TABLE business_config ADD COLUMN IF NOT EXISTS slogan VARCHAR(200);

ALTER TABLE business_config ADD COLUMN IF NOT EXISTS tone VARCHAR(80) NOT NULL DEFAULT 'amigable';

ALTER TABLE business_config ADD COLUMN IF NOT EXISTS welcome_message TEXT;

ALTER TABLE business_config ADD COLUMN IF NOT EXISTS active_announcement TEXT;

ALTER TABLE business_config ADD COLUMN IF NOT EXISTS services JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE business_config ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE business_config ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
