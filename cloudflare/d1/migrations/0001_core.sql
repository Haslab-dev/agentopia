-- ═══════════════════════════════════════════════════════════════════════════
-- Agentopia — Cloudflare D1 migration 0001: core schema.
--
-- Derived 1:1 from the SQLite schema that ACTUALLY runs today
-- (apps/orchestrator/src/db.ts, the SqliteRepository constructor DDL).
-- D1 speaks the SQLite dialect, so the DDL is identical — no translation
-- layer, no Postgres features (no RLS, no extensions, no uuid/jsonb types).
--
-- INTEGRATION REQUIRED: prepared and versioned, but NOT applied anywhere.
-- No D1 database has been created. Activation steps: cloudflare/README.md.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  shirt TEXT, pants TEXT, hair TEXT, skin TEXT, desk_index INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS agent_configs (
  agent_id TEXT PRIMARY KEY REFERENCES agents(id), provider TEXT NOT NULL, model TEXT NOT NULL,
  temperature REAL NOT NULL DEFAULT 0.7, system_prompt TEXT NOT NULL DEFAULT '',
  allowed_tools TEXT NOT NULL DEFAULT '[]', workspace TEXT NOT NULL DEFAULT '');

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, instructions TEXT NOT NULL, agent_id TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal', status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL, agent_id TEXT NOT NULL, run_number INTEGER NOT NULL,
  provider TEXT NOT NULL, model TEXT NOT NULL, status TEXT NOT NULL,
  started_at TEXT NOT NULL, ended_at TEXT, error TEXT);

CREATE TABLE IF NOT EXISTS tool_calls (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL, tool_name TEXT NOT NULL, args_summary TEXT NOT NULL DEFAULT '',
  result_status TEXT NOT NULL, duration_ms INTEGER, requires_approval INTEGER NOT NULL DEFAULT 0,
  approval_id TEXT, created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL, run_id TEXT NOT NULL, tool_call_id TEXT NOT NULL,
  action_summary TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, decided_at TEXT);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL, run_id TEXT NOT NULL, agent_id TEXT NOT NULL,
  kind TEXT NOT NULL, title TEXT NOT NULL, file_name TEXT NOT NULL, created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS usage_records (
  id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, run_id TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL,
  tokens_in INTEGER NOT NULL, tokens_out INTEGER NOT NULL, cost_usd REAL NOT NULL,
  latency_ms INTEGER NOT NULL, created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL,
  entity_ref TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS task_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, event_type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_runs_task ON agent_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_usage_day ON usage_records(created_at);
