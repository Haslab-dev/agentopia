-- 0003 — artifact bodies for the Worker runtime.
-- Locally, artifact bodies are .md files on disk and the `artifacts`
-- table (0001) holds only metadata. Workers have no filesystem, so the
-- cloud stores the body in D1, keyed by the same file_name the metadata
-- row carries. Applied to agentopia-db on 2026-11-22 during the
-- Cloudflare integration (see cloudflare/README.md).
CREATE TABLE IF NOT EXISTS artifact_contents (
  file_name TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
