-- Agent preferences are per user. Technical task/audit rows have a short retention;
-- conversations and memories are intentionally untouched by cleanup.
CREATE TABLE IF NOT EXISTS agent_preferences (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    allow_public_navigation BOOLEAN NOT NULL DEFAULT TRUE,
    allow_authenticated_navigation BOOLEAN NOT NULL DEFAULT FALSE,
    allow_read BOOLEAN NOT NULL DEFAULT TRUE,
    allow_form_fill BOOLEAN NOT NULL DEFAULT FALSE,
    allow_downloads BOOLEAN NOT NULL DEFAULT FALSE,
    allow_uploads BOOLEAN NOT NULL DEFAULT FALSE,
    allow_modifications BOOLEAN NOT NULL DEFAULT FALSE,
    whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    authorization_mode VARCHAR(20) NOT NULL DEFAULT 'per_action' CHECK (authorization_mode IN ('per_action', 'temporary_contact')),
    max_steps INTEGER NOT NULL DEFAULT 15 CHECK (max_steps BETWEEN 1 AND 15),
    deepseek_budget_usd NUMERIC(10, 4) NOT NULL DEFAULT 0.02 CHECK (deepseek_budget_usd >= 0),
    fish_budget_usd NUMERIC(10, 4) NOT NULL DEFAULT 0 CHECK (fish_budget_usd >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_tasks (
    id BIGSERIAL PRIMARY KEY,
    run_id UUID NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    character_id INTEGER NOT NULL REFERENCES voice_characters(id) ON DELETE CASCADE,
    conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'awaiting_approval', 'completed', 'failed', 'interrupted', 'cancelled', 'uncertain')),
    summary VARCHAR(1000),
    error_code VARCHAR(80),
    step_count INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    deepseek_cost_usd NUMERIC(12, 8) NOT NULL DEFAULT 0,
    fish_cost_usd NUMERIC(12, 8) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_agent_tasks_owner_created ON agent_tasks(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_agent_tasks_status ON agent_tasks(status, updated_at);

CREATE TABLE IF NOT EXISTS agent_task_steps (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL,
    tool_name VARCHAR(80) NOT NULL,
    action_class VARCHAR(24) NOT NULL CHECK (action_class IN ('read', 'write', 'external_send')),
    target_origin VARCHAR(512),
    status VARCHAR(24) NOT NULL CHECK (status IN ('planned', 'awaiting_approval', 'running', 'succeeded', 'failed', 'uncertain', 'skipped')),
    summary VARCHAR(1000),
    action_hash CHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(task_id, sequence)
);
CREATE INDEX IF NOT EXISTS ix_agent_task_steps_task ON agent_task_steps(task_id, sequence);

CREATE TABLE IF NOT EXISTS agent_approvals (
    id BIGSERIAL PRIMARY KEY,
    task_id BIGINT NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
    step_id BIGINT NOT NULL REFERENCES agent_task_steps(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    character_id INTEGER NOT NULL REFERENCES voice_characters(id) ON DELETE CASCADE,
    action_label VARCHAR(120) NOT NULL,
    destination VARCHAR(512),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    payload_hash CHAR(64) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'consumed', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL,
    decided_at TIMESTAMPTZ,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_agent_approvals_pending ON agent_approvals(user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_contact_grants (
    id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    character_id INTEGER NOT NULL REFERENCES voice_characters(id) ON DELETE CASCADE,
    contact_key VARCHAR(256) NOT NULL,
    action_scope VARCHAR(80) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (expires_at <= created_at + INTERVAL '1 hour')
);
CREATE INDEX IF NOT EXISTS ix_agent_contact_grants_active ON agent_contact_grants(user_id, character_id, expires_at) WHERE revoked_at IS NULL;
