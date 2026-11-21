import type { D1DatabaseLike } from './d1-repository'

// ─────────────────────────────────────────────────────────────────────────────
// Artifact content store on D1. Locally, artifact bodies are .md files in
// apps/orchestrator/artifacts/ and the `artifacts` table holds metadata.
// The Worker runtime has no filesystem, so in the cloud the body lives in
// the `artifact_contents` table (cloudflare/d1/migrations/0003) keyed by
// the same file name the metadata row carries. This is the ArtifactStore
// shape tools.ts accepts via ToolContext.store — the local fs path is
// used whenever no store is injected, so local behavior is unchanged.
// (cloudflare/README.md originally sketched R2 for this; one D1 table
// deletes a whole second binding and bucket for what is a few KB of
// markdown per artifact.)
// ─────────────────────────────────────────────────────────────────────────────

import type { ArtifactStore } from '../tools'

export class D1ArtifactStore implements ArtifactStore {
  constructor(private db: D1DatabaseLike) {}

  async save(fileName: string, content: string): Promise<void> {
    await this.db
      .prepare(
        'INSERT INTO artifact_contents (file_name, content, created_at) VALUES (?, ?, ?) ON CONFLICT(file_name) DO UPDATE SET content = excluded.content',
      )
      .bind(fileName, content, new Date().toISOString())
      .run()
  }

  async read(fileName: string): Promise<string> {
    const row = await this.db
      .prepare('SELECT content FROM artifact_contents WHERE file_name = ?')
      .bind(fileName)
      .first<{ content: string }>()
    if (!row) throw new Error(`Artifact ${fileName} not found`)
    return row.content
  }
}
