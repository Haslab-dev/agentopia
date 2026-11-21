import { CompatibleLLM } from './llm/compatible'
import { runLiveProof } from './proof'
import { D1Repository, type D1DatabaseLike } from './db/d1-repository'
import { D1ArtifactStore } from './db/d1-artifacts'
import { TaskEngine } from './engine'
import { MeetingEngine } from './meetings'
import { createApp } from './app'
import { emit } from './events'

// ─────────────────────────────────────────────────────────────────────────────
// Orchestrator — Cloudflare Worker entry point (Lutfi's Cloudflare Stack
// decision, 2026-11-21; JWT auth decision, 2026-11-22).
//
// Shape: the Worker itself is a thin forwarder. ALL API traffic goes to
// one Durable Object instance ("main"), which is the cloud reincarnation
// of the local Bun process: it owns the engines, the SSE client set
// (events.ts module state), and the D1 repository — so event payloads
// stay byte-identical to the frozen §1.3 contract and work status has a
// single writer, exactly like the local serial engine.
//
// Execution model: there is no persistent timer. Requests that can
// enqueue work (task create/retry, approval decide, meeting start) kick
// TaskEngine.pump() via waitUntil, and a Durable Object alarm acts as the
// backstop drain. If the DO is evicted mid-run, the run's continuation
// dies with it; on the next cold start recoverInterruptedRuns() marks the
// interrupted rows failed — the same honest semantics as a local process
// restart, never a silent success.
//
// Auth: createApp receives an auth config built from the AUTH_USERNAME /
// AUTH_PASSWORD / JWT_SECRET Worker secrets (see auth.ts). Until Lutfi
// sets AUTH_PASSWORD, login is fail-closed (503) by design.
// ─────────────────────────────────────────────────────────────────────────────

export interface Env {
  agentopia_db: D1DatabaseLike
  ORCHESTRATOR: {
    idFromName(name: string): unknown
    get(id: unknown): { fetch(req: Request): Promise<Response> }
  }
  KENARI_API_KEY?: string
  KENARI_BASE_URL?: string
  KENARI_MODEL?: string
  AUTH_USERNAME?: string
  AUTH_PASSWORD?: string
  JWT_SECRET?: string
}

interface DOState {
  waitUntil(promise: Promise<unknown>): void
  storage: {
    setAlarm(time: number): Promise<void>
  }
}

const KICK_PATHS = [/^\/tasks$/, /^\/tasks\/[^/]+\/retry$/, /^\/approvals\/[^/]+\/decide$/, /^\/meetings$/]

export class OrchestratorDO {
  private ready?: Promise<{
    app: (req: Request, ip: string) => Promise<Response>
    engine: TaskEngine
    repo: D1Repository
  }>

  constructor(
    private state: DOState,
    private env: Env,
  ) {}

  private init() {
    if (!this.ready) {
      this.ready = (async () => {
        const model = this.env.KENARI_MODEL ?? 'deepseek-v4-1-flash'
        const baseUrl = this.env.KENARI_BASE_URL ?? 'https://kenari.id/v1'
        const apiKey = this.env.KENARI_API_KEY ?? ''
        const repo = new D1Repository(this.env.agentopia_db, model)
        await repo.ensureSeeded()
        const recovered = await repo.recoverInterruptedRuns()
        if (recovered > 0) {
          await repo.addActivity(
            'system',
            'engine.recovered',
            'orchestrator',
            `${recovered} interrupted run/task rows marked failed after restart`,
          )
        }
        const llm = new CompatibleLLM(baseUrl, apiKey, model)
        const store = new D1ArtifactStore(this.env.agentopia_db)
        const engine = new TaskEngine(repo, llm, '', apiKey.length > 0, store)
        const meetings = new MeetingEngine(repo, llm, '', apiKey.length > 0, store)
        const app = createApp({
          repo,
          engine,
          meetings,
          model,
          baseUrl,
          keyConfigured: apiKey.length > 0,
          repositoryLabel: 'd1',
          readArtifact: async (name) => {
            try {
              return await store.read(name)
            } catch {
              return null
            }
          },
          runProof: () => runLiveProof(llm, emit, '', (name, content) => store.save(name, content)),
          auth: {
            username: this.env.AUTH_USERNAME,
            password: this.env.AUTH_PASSWORD,
            jwtSecret: this.env.JWT_SECRET,
          },
        })
        // Backstop: drain anything queued before this cold start.
        void this.state.storage.setAlarm(Date.now() + 1_500)
        return { app, engine, repo }
      })()
    }
    return this.ready
  }

  async fetch(req: Request): Promise<Response> {
    const { app, engine } = await this.init()
    const url = new URL(req.url)
    const res = await app(req, req.headers.get('CF-Connecting-IP') ?? 'unknown')
    if ((req.method === 'POST' || req.method === 'PATCH') && KICK_PATHS.some((p) => p.test(url.pathname))) {
      this.state.waitUntil(engine.pump())
      void this.state.storage.setAlarm(Date.now() + 2_000)
    }
    return res
  }

  async alarm(): Promise<void> {
    const { engine, repo } = await this.init()
    await engine.pump()
    if (await repo.nextQueuedTask()) {
      await this.state.storage.setAlarm(Date.now() + 3_000)
    }
  }
}

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    const stub = env.ORCHESTRATOR.get(env.ORCHESTRATOR.idFromName('main'))
    return stub.fetch(req)
  },
}
