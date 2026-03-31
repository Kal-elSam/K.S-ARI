-- Creamos extensión para poder generar UUIDs automáticamente
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Creación de la tabla principal de conversaciones
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) NOT NULL UNIQUE,  -- Número de cliente único activo
    state VARCHAR(50) NOT NULL,
    business_id VARCHAR(50) NOT NULL,
    context JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indice para búsquedas rápidas por celular que es nuestra llave en base a WhatsApp
CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations(phone);

-- ============================================================================
-- TABLA: business_calendars
-- Almacena los tokens de acceso a Google Calendar por negocio.
-- Se llena mediante el flujo OAuth en /auth/google/callback.
-- ============================================================================
CREATE TABLE IF NOT EXISTS business_calendars (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id      VARCHAR(100) NOT NULL UNIQUE,   -- Clave del negocio dueño del calendario
    google_refresh_token TEXT NOT NULL,              -- Token permanente para refrescar acceso
    google_access_token  TEXT,                       -- Token temporal (dura ~1 hora)
    token_expiry     TIMESTAMP WITH TIME ZONE,       -- Cuándo vence el access_token
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índice para búsquedas rápidas por business_id
CREATE INDEX IF NOT EXISTS idx_business_calendars_business_id
    ON business_calendars(business_id);

-- ============================================================================
-- TABLA: business_config
-- Configuración operativa y de tono por negocio para ARI.
-- ============================================================================
CREATE TABLE IF NOT EXISTS business_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    type VARCHAR(80) NOT NULL,
    start_hour INT NOT NULL,
    end_hour INT NOT NULL,
    tone VARCHAR(80) NOT NULL,
    welcome_message TEXT,
    active_announcement TEXT,
    services JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_business_config_business_id
    ON business_config(business_id);

INSERT INTO business_config (
    business_id,
    name,
    type,
    start_hour,
    end_hour,
    tone,
    welcome_message,
    active_announcement,
    services
)
VALUES (
    'demo',
    'Clínica ARI Demo',
    'consultorio',
    9,
    18,
    'amigable',
    'Hola, soy ARI. Te ayudo a encontrar el mejor horario para tu cita.',
    NULL,
    '[
      {"name":"Limpieza dental","duration":60,"price":700},
      {"name":"Valoración general","duration":45,"price":500}
    ]'::jsonb
)
ON CONFLICT (business_id) DO UPDATE
SET
    name = EXCLUDED.name,
    type = EXCLUDED.type,
    start_hour = EXCLUDED.start_hour,
    end_hour = EXCLUDED.end_hour,
    tone = EXCLUDED.tone,
    welcome_message = EXCLUDED.welcome_message,
    active_announcement = EXCLUDED.active_announcement,
    services = EXCLUDED.services,
    updated_at = CURRENT_TIMESTAMP;
