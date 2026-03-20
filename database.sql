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
