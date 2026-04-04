-- Creamos extensión para poder generar UUIDs automáticamente
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Creación de la tabla principal de conversaciones
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(20) NOT NULL UNIQUE,  -- Número de cliente único activo
    client_name VARCHAR(100),
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
    slogan VARCHAR(200),
    owner_phone VARCHAR(20),
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

-- Tablas antiguas (p. ej. Railway): columnas faltantes. Ver database/migrations/001_upgrade_legacy_business_config.sql
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS slogan VARCHAR(200);
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS owner_phone VARCHAR(20);
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS tone VARCHAR(80) NOT NULL DEFAULT 'amigable';
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS welcome_message TEXT;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS active_announcement TEXT;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS services JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS client_name VARCHAR(100);

-- ============================================================================
-- TABLA: social_posts
-- Publicaciones de redes sociales (draft/scheduled/published/failed)
-- ============================================================================
CREATE TABLE IF NOT EXISTS social_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id VARCHAR(50) DEFAULT 'demo',
    platform VARCHAR(20) NOT NULL, -- 'instagram', 'facebook', 'both'
    content TEXT NOT NULL,
    image_url TEXT,
    hashtags TEXT,
    scheduled_at TIMESTAMP,
    published_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'draft', -- draft, scheduled, published, failed
    ig_post_id VARCHAR(100),
    fb_post_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_posts_business_created
    ON social_posts(business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_posts_status
    ON social_posts(status);

-- ============================================================================
-- TABLA: social_schedules
-- Configuración de autopublicación por negocio.
-- ============================================================================
CREATE TABLE IF NOT EXISTS social_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id VARCHAR(50) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT false,
    frequency VARCHAR(20) DEFAULT 'daily', -- 'daily', '3x_week', '5x_week'
    post_times JSONB DEFAULT '["10:00", "18:00"]'::jsonb, -- Horarios del día para publicar
    topics JSONB DEFAULT '[]'::jsonb, -- Temas recurrentes
    platforms JSONB DEFAULT '["instagram", "facebook"]'::jsonb,
    tone VARCHAR(30) DEFAULT 'Profesional',
    image_source VARCHAR(20) DEFAULT 'auto', -- 'own', 'unsplash', 'auto'
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_schedules_is_active
    ON social_schedules(is_active);

-- ============================================================================
-- TABLA: social_images
-- Banco de imágenes del negocio para autopublicación.
-- ============================================================================
CREATE TABLE IF NOT EXISTS social_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    business_id VARCHAR(50) NOT NULL,
    url TEXT NOT NULL,
    topic_tags JSONB DEFAULT '[]'::jsonb, -- Tags para matching de tema
    source VARCHAR(20) DEFAULT 'own', -- 'own' o 'unsplash'
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_images_business_id
    ON social_images(business_id);

INSERT INTO business_config (
    business_id,
    name,
    slogan,
    owner_phone,
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
    'Tu estilo, nuestra precisión',
    '524427471950',
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
    slogan = EXCLUDED.slogan,
    owner_phone = EXCLUDED.owner_phone,
    type = EXCLUDED.type,
    start_hour = EXCLUDED.start_hour,
    end_hour = EXCLUDED.end_hour,
    tone = EXCLUDED.tone,
    welcome_message = EXCLUDED.welcome_message,
    active_announcement = EXCLUDED.active_announcement,
    services = EXCLUDED.services,
    updated_at = CURRENT_TIMESTAMP;
