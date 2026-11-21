import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CompatibleLLM } from './llm/compatible'
import { runLiveProof } from './proof'
import { SqliteRepository } from './db'
import { toAsyncRepository } from './db/async-repository'
import { TaskEngine } from './engine'
import { MeetingEngine } from './meetings'
import { createApp } from './app'
import { emit } from './events'

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator — local (Bun) entry point. The HTTP surface itself lives
// in app.ts and is shared verbatim with the Cloudflare Worker
// (worker.ts); this file only wires the local runtime: env config,
// SQLite persistence, the artifact directory, and Bun.serve.
//
// Local mode has NO auth (app.ts is created without an auth config) —
// unchanged behavior since Fase 3. The Kenari key exists solely as
// process env (run.py launcher, Secure Vault surrogate) — never in code,
// logs, DB, or the browser.
// ─────────────────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 8787)
const BASE_URL = process.env.KENARI_BASE_URL ?? 'https://kenari.id/v1'
const MODEL = process.env.KENARI_MODEL ?? 'deepseek-v4-1-flash'
const API_KEY = process.env.KENARI_API_KEY ?? ''
const ROOT = join(import.meta.dir, '..')
const ARTIFACTS_DIR = join(ROOT, 'artifacts')
const DB_PATH = process.env.LW_DB_PATH ?? join(ROOT, 'data', 'living-world.db')

if (process.env.REPO === 'd1') {
  console.error(
    '[orchestrator] REPO=d1 is only available inside the Cloudflare Worker runtime ' +
      '(D1 is reached through the env.agentopia_db binding — see src/worker.ts and cloudflare/README.md). ' +
      'Unset REPO to run locally on SQLite.',
  )
  process.exit(1)
}

const repoSync = new SqliteRepository(DB_PATH, MODEL)
const recovered = repoSync.recoverInterruptedRuns()
if (recovered > 0) {
  repoSync.addActivity('system', 'engine.recovered', 'orchestrator', `${recovered} interrupted run/task rows marked failed after restart`)
  console.log(`[orchestrator] recovered ${recovered} interrupted rows (marked failed, honestly)`)
}
const repo = toAsyncRepository(repoSync)

const llm = new CompatibleLLM(BASE_URL, API_KEY, MODEL)
const engine = new TaskEngine(repo, llm, ARTIFACTS_DIR, API_KEY.length > 0)
engine.start()
const meetings = new MeetingEngine(repo, llm, ARTIFACTS_DIR, API_KEY.length > 0)

const app = createApp({
  repo,
  engine,
  meetings,
  model: MODEL,
  baseUrl: BASE_URL,
  keyConfigured: API_KEY.length > 0,
  repositoryLabel: 'sqlite',
  readArtifact: async (name) => {
    try {
      return await readFile(join(ARTIFACTS_DIR, name), 'utf8')
    } catch {
      return null
    }
  },
  runProof: () => runLiveProof(llm, emit, ARTIFACTS_DIR),
})

const server = Bun.serve({
  port: PORT,
  idleTimeout: 255, // SSE streams are long-lived; heartbeats keep them active
  fetch(req, srv) {
    return app(req, srv.requestIP(req)?.address ?? 'unknown')
  },
})

console.log(`[orchestrator] Phase 3 engine on http://localhost:${server.port} · provider=kenari model=${MODEL} keyConfigured=${API_KEY.length > 0} repo=sqlite`)
