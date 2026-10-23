ALTER TABLE voice_characters
    ADD COLUMN IF NOT EXISTS personality_prompt TEXT;
