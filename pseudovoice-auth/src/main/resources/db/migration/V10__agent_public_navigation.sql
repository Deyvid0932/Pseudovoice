ALTER TABLE agent_preferences ADD COLUMN IF NOT EXISTS auto_approve_public_navigation BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE agent_preferences ADD COLUMN IF NOT EXISTS public_navigation_origins TEXT NOT NULL DEFAULT '[]';
