-- Script idempotente ejecutado al iniciar Spring, antes de la validación JPA.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS turn_id varchar(36);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS route varchar(20);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS stt_latency_ms double precision;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS decision_latency_ms double precision;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS llm_latency_ms double precision;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS total_turn_latency_ms double precision;
CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_turn_role ON messages (turn_id, role);
