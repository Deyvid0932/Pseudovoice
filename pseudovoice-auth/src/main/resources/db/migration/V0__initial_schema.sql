-- Esquema base para una instalación nueva. IF NOT EXISTS conserva bases existentes.
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    google_id VARCHAR(255) NOT NULL UNIQUE,
    email VARCHAR(150) NOT NULL UNIQUE,
    full_name VARCHAR(100) NOT NULL,
    avatar_url VARCHAR(255),
    role VARCHAR(20) NOT NULL DEFAULT 'USER',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS voice_characters (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    character_name VARCHAR(100) NOT NULL,
    reference_audio_path VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    language VARCHAR(10) DEFAULT 'es',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_character UNIQUE (user_id, character_name)
);

CREATE TABLE IF NOT EXISTS active_session_states (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    active_character_id INTEGER NOT NULL REFERENCES voice_characters(id) ON DELETE CASCADE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rules_catalog (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    rule_code VARCHAR(50) NOT NULL UNIQUE,
    category VARCHAR(50) DEFAULT 'general',
    prompt_description TEXT NOT NULL,
    created_by_voice BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS character_rules (
    id SERIAL PRIMARY KEY,
    character_id INTEGER NOT NULL REFERENCES voice_characters(id) ON DELETE CASCADE,
    rule_id INTEGER NOT NULL REFERENCES rules_catalog(id) ON DELETE CASCADE,
    priority INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT uq_character_rule UNIQUE (character_id, rule_id)
);

CREATE TABLE IF NOT EXISTS conversations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    character_id INTEGER NOT NULL REFERENCES voice_characters(id) ON DELETE CASCADE,
    title VARCHAR(150) DEFAULT 'New Conversation',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    generated_audio_path VARCHAR(255),
    tts_latency_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_voice_characters_user ON voice_characters(user_id);
CREATE INDEX IF NOT EXISTS ix_conversations_user_started ON conversations(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS ix_messages_conversation_created ON messages(conversation_id, created_at);
