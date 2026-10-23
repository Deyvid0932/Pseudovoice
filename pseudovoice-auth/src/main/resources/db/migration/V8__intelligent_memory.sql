-- User-controlled policy for automatic, suggested, and manual memory capture.
CREATE TABLE IF NOT EXISTS memory_preferences (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    mode VARCHAR(12) NOT NULL DEFAULT 'suggested' CHECK (mode IN ('automatic', 'suggested', 'manual')),
    shared_consent BOOLEAN NOT NULL DEFAULT FALSE,
    sensitive_consent BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE conversation_memories
    ADD COLUMN IF NOT EXISTS origin VARCHAR(12) NOT NULL DEFAULT 'suggested'
        CHECK (origin IN ('manual', 'suggested', 'automatic')),
    ADD COLUMN IF NOT EXISTS sensitive BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS content_ciphertext BYTEA,
    ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Preserve memories when a chat is deleted. Character deletion still removes its memories.
ALTER TABLE conversation_memories DROP CONSTRAINT IF EXISTS conversation_memories_conversation_id_fkey;
DO 'BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = ''fk_memory_conversation'' AND conrelid = ''conversation_memories''::regclass) THEN
        ALTER TABLE conversation_memories ADD CONSTRAINT fk_memory_conversation
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL;
    END IF;
END';

-- Each extraction batch can be retried safely without duplicate memory writes or usage charges.
CREATE TABLE IF NOT EXISTS memory_extraction_batches (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    conversation_id INTEGER REFERENCES conversations(id) ON DELETE SET NULL,
    batch_key VARCHAR(120) NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    estimated_cost_usd NUMERIC(12, 8) NOT NULL DEFAULT 0,
    memories_created INTEGER NOT NULL DEFAULT 0,
    memories_updated INTEGER NOT NULL DEFAULT 0,
    memories_skipped INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, batch_key)
);

CREATE TABLE IF NOT EXISTS memory_activity (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    character_id INTEGER REFERENCES voice_characters(id) ON DELETE SET NULL,
    memory_id BIGINT,
    batch_id BIGINT REFERENCES memory_extraction_batches(id) ON DELETE SET NULL,
    action VARCHAR(16) NOT NULL CHECK (action IN ('created', 'updated', 'retrieved', 'undone')),
    source VARCHAR(12) NOT NULL CHECK (source IN ('automatic', 'suggested', 'manual', 'system')),
    snapshot JSONB,
    expected_revision INTEGER,
    related_activity_id BIGINT REFERENCES memory_activity(id) ON DELETE SET NULL,
    context_items INTEGER NOT NULL DEFAULT 0,
    context_tokens_estimate INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    undone_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_memory_activity_owner_time ON memory_activity(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_memory_activity_memory ON memory_activity(user_id, memory_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_memory_extraction_usage ON memory_extraction_batches(user_id, created_at DESC);
