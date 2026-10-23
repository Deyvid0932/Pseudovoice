CREATE TABLE IF NOT EXISTS memory_groups (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    personality_instructions TEXT,
    UNIQUE (id, user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_character_owner ON voice_characters(id, user_id);
CREATE TABLE IF NOT EXISTS memory_group_members (
    group_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    character_id INTEGER NOT NULL,
    PRIMARY KEY (group_id, character_id),
    FOREIGN KEY (group_id, user_id) REFERENCES memory_groups(id, user_id) ON DELETE CASCADE,
    FOREIGN KEY (character_id, user_id) REFERENCES voice_characters(id, user_id) ON DELETE CASCADE
);
ALTER TABLE conversation_memories ADD COLUMN IF NOT EXISTS scope VARCHAR(10) NOT NULL DEFAULT 'private'
    CHECK (scope IN ('private', 'group', 'all'));
ALTER TABLE conversation_memories ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE conversation_memories ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES memory_groups(id) ON DELETE RESTRICT;
ALTER TABLE conversation_memories ALTER COLUMN conversation_id DROP NOT NULL;
ALTER TABLE conversation_memories ALTER COLUMN embedding DROP NOT NULL;
-- Single-quoted DO body is supported by Spring SQL initialization's statement splitter.
DO 'BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = ''ck_memory_scope_group'' AND conrelid = ''conversation_memories''::regclass) THEN
        ALTER TABLE conversation_memories ADD CONSTRAINT ck_memory_scope_group
            CHECK ((scope = ''group'' AND group_id IS NOT NULL) OR (scope <> ''group'' AND group_id IS NULL));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = ''fk_memory_group_owner'' AND conrelid = ''conversation_memories''::regclass) THEN
        ALTER TABLE conversation_memories ADD CONSTRAINT fk_memory_group_owner
            FOREIGN KEY (group_id, user_id) REFERENCES memory_groups(id, user_id);
    END IF;
END';
CREATE INDEX IF NOT EXISTS ix_approved_memory_scope ON conversation_memories(user_id, scope, group_id)
    WHERE approved = TRUE;
CREATE INDEX IF NOT EXISTS ix_memory_group_character ON memory_group_members(user_id, character_id, group_id);
