ALTER TABLE voice_characters ADD COLUMN IF NOT EXISTS provider_source VARCHAR(20);
ALTER TABLE voice_characters ADD COLUMN IF NOT EXISTS provider_voice_id VARCHAR(255);
ALTER TABLE voice_characters ADD COLUMN IF NOT EXISTS catalog_original_name VARCHAR(255);
ALTER TABLE voice_characters ADD COLUMN IF NOT EXISTS catalog_image_url TEXT;
