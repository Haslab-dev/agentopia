-- ═══════════════════════════════════════════════════════════════════════════
-- Agentopia — Cloudflare D1 migration 0002: meetings + notifications.
--
-- Same source of truth and same status as 0001: derived 1:1 from the
-- running SQLite DDL in apps/orchestrator/src/db.ts (Phase 4 tables).
-- INTEGRATION REQUIRED: prepared, NOT applied — no D1 database exists yet.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS meetings (
  id TEXT PRIMARY KEY, topic TEXT NOT NULL, participant_ids TEXT NOT NULL DEFAULT '[]',
  rounds INTEGER NOT NULL DEFAULT 2, status TEXT NOT NULL, artifact_file TEXT,
  error TEXT, created_at TEXT NOT NULL, ended_at TEXT);

CREATE TABLE IF NOT EXISTS meeting_messages (
  id TEXT PRIMARY KEY, meeting_id TEXT NOT NULL, seq INTEGER NOT NULL,
  agent_id TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'speech', content TEXT NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0, tokens_out INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '',
  entity_ref TEXT NOT NULL DEFAULT '', agent_id TEXT, is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL);

CREATE INDEX IF NOT EXISTS idx_meeting_messages ON meeting_messages(meeting_id, seq);
CREATE INDEX IF NOT EXISTS idx_notifications ON notifications(is_read, created_at);
