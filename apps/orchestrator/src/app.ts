import { basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ProofResult } from './proof'
import type { AsyncRepository } from './db/async-repository'
import type { TaskEngine } from './engine'
import type { MeetingEngine } from './meetings'
import { broadcastControl, emit, eventsResponse } from './events'
import { PRICING_NOTE } from './pricing'
import { authConfigured, secretsEqual, signJwt, verifyJwt, type AuthConfig } from './auth'

// ─────────────────────────────────────────────────────────────────────────────
// HTTP router for the orchestrator — ONE implementation, two runtimes.
// Extracted from index.ts (Fase 3–7) so the Bun server (index.ts, local
// dev) and the Cloudflare Worker (worker.ts, Durable Object) serve the
// exact same API surface. Handlers talk to AsyncRepository; local mode
// adapts its synchronous SqliteRepository (db/async-repository.ts).
//
// Auth (cloud only): when deps.auth is provided, every path except
// /health and /auth/login requires a valid Bearer JWT (see auth.ts).
// Local mode passes no auth config and keeps its historical open-on-
// localhost behavior — unchanged.
// ─────────────────────────────────────────────────────────────────────────────

export interface AppDeps {
  repo: AsyncRepository
  engine: TaskEngine
  meetings: MeetingEngine
  model: string
  baseUrl: string
  keyConfigured: boolean
  /** Label reported by /health ('sqlite' locally, 'd1' in the Worker). */
  repositoryLabel: string
  /** Artifact body by file name, or null when it does not exist. */
  readArtifact: (name: string) => Promise<string | null>
  /** Runs the §7 live proof; the router owns the running/last-result state. */
  runProof: () => Promise<ProofResult>
  /** Cloud auth config. Omit entirely for local mode (no auth). */
  auth?: AuthConfig
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: cors })

const PALETTE = ['#e07a9b', '#5f9e6e', '#7fb3e0', '#f59e4c', '#6ec3c9', '#b48ce0', '#e0654f', '#9db38a']

// Fase 7: minimal write rate limit — per client IP, fixed 60 s window.
// Generous for the real UI (a human clicks a few writes a minute), tight
// enough that a script cannot hammer task/meeting creation (each of which
// can spend real LLM tokens). GETs and the SSE stream are never limited.
const WRITE_LIMIT_PER_MIN = 30
// Login attempts are limited much harder: credential guessing must be slow.
const LOGIN_LIMIT_PER_MIN = 10

export function createApp(deps: AppDeps): (req: Request, clientIp: string) => Promise<Response> {
  const { repo, engine, meetings } = deps
  const writeHits = new Map<string, { count: number; resetAt: number }>()
  const loginHits = new Map<string, { count: number; resetAt: number }>()
  let proofRunning = false
  let lastProof: ProofResult | null = null

  const hitLimit = (map: Map<string, { count: number; resetAt: number }>, ip: string, limit: number): boolean => {
    const nowMs = Date.now()
    const w = map.get(ip)
    if (!w || nowMs >= w.resetAt) {
      map.set(ip, { count: 1, resetAt: nowMs + 60_000 })
      return false
    }
    return ++w.count > limit
  }

  return async function handle(req: Request, clientIp: string): Promise<Response> {
    const url = new URL(req.url)
    const path = url.pathname
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors })

    try {
      // ── Auth (cloud Worker only; deps.auth is undefined locally) ─────────
      if (deps.auth) {
        if (path === '/auth/login' && req.method === 'POST') {
          if (!authConfigured(deps.auth)) {
            return json({ ok: false, error: 'auth not configured' }, 503)
          }
          if (hitLimit(loginHits, clientIp, LOGIN_LIMIT_PER_MIN)) {
            return json({ ok: false, error: 'Rate limit: too many login attempts — slow down' }, 429)
          }
          const body = (await req.json()) as { username?: string; password?: string }
          const userOk = typeof body.username === 'string' && secretsEqual(body.username, deps.auth.username!)
          const passOk = typeof body.password === 'string' && secretsEqual(body.password, deps.auth.password!)
          if (!userOk || !passOk) {
            // One generic 401 for wrong username and wrong password alike.
            return json({ ok: false, error: 'Invalid credentials' }, 401)
          }
          const token = await signJwt(body.username!, deps.auth.jwtSecret!, Date.now())
          return json({ ok: true, token, tokenType: 'Bearer', expiresInHours: 24 })
        }
        if (path !== '/health') {
          const header = req.headers.get('Authorization')
          // EventSource cannot set headers, so the SSE stream additionally
          // accepts the same JWT as a ?token= query parameter.
          const token =
            header?.startsWith('Bearer ') ? header.slice(7) : path === '/events' ? url.searchParams.get('token') : null
          const claims =
            token && deps.auth.jwtSecret ? await verifyJwt(token, deps.auth.jwtSecret, Date.now()) : null
          if (!claims) return json({ ok: false, error: 'Unauthorized' }, 401)
        }
      }

      if (req.method === 'POST' || req.method === 'PATCH') {
        if (hitLimit(writeHits, clientIp, WRITE_LIMIT_PER_MIN)) {
          return json({ ok: false, error: 'Rate limit: too many write requests — slow down' }, 429)
        }
      }

      if (path === '/health') {
        return json({
          ok: true, phase: 4, provider: 'kenari', baseUrl: deps.baseUrl, model: deps.model,
          keyConfigured: deps.keyConfigured, repository: deps.repositoryLabel,
          agents: (await repo.listAgents()).length, tasks: (await repo.listTasks(1000)).length,
          meetings: (await repo.listMeetings(1000)).length, meetingRunning: meetings.isRunning(),
          unreadNotifications: await repo.unreadNotificationCount(), lastProof,
        })
      }

      if (path === '/events') {
        const res = eventsResponse(deps.model)
        for (const [k, v] of Object.entries(cors)) res.headers.set(k, v)
        return res
      }

      // ── §7 proof (kept intact as the regression path) ────────────────────
      if (path === '/run-live-proof' && req.method === 'POST') {
        if (!deps.keyConfigured) return json({ ok: false, error: 'KENARI_API_KEY not configured — set the Worker secret (cloud) or start the orchestrator via run.py (local).' }, 500)
        if (proofRunning) return json({ ok: false, error: 'A live proof run is already in progress.' }, 409)
        proofRunning = true
        const taskId = `live-${Date.now()}`
        deps
          .runProof()
          .then((r) => { lastProof = r })
          .catch((err) => { lastProof = { ok: false, taskId, error: String(err) } })
          .finally(() => { proofRunning = false })
        return json({ ok: true, started: true, note: 'Progress arrives on /events; completion is only claimed there.' })
      }

      if (path === '/artifact') {
        const name = basename(url.searchParams.get('name') ?? '')
        if (!name.endsWith('.md')) return new Response('Bad artifact name', { status: 400, headers: cors })
        const text = await deps.readArtifact(name)
        if (text === null) return new Response('Artifact not found', { status: 404, headers: cors })
        return new Response(text, { headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' } })
      }

      // ── Agents ─────────────────────────────────────────────────────────────
      if (path === '/agents' && req.method === 'GET') {
        const usage = new Map((await repo.usageToday()).map((u) => [u.agentId, u]))
        return json({
          agents: (await repo.listAgents()).map((a) => ({
            ...a,
            usageToday: usage.get(a.id) ?? { tokensIn: 0, tokensOut: 0, costUsd: 0, calls: 0 },
          })),
        })
      }
      if (path === '/agents' && req.method === 'POST') {
        const body = (await req.json()) as { name?: string; role?: string; description?: string; model?: string; systemPrompt?: string }
        if (!body.name?.trim() || !body.role?.trim()) return json({ ok: false, error: 'name and role are required' }, 400)
        const count = (await repo.listAgents()).length
        const id = `${body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}-${randomUUID().slice(0, 4)}`
        const color = PALETTE[count % PALETTE.length]
        const agent = await repo.createAgent(
          {
            id, name: body.name.trim(), role: body.role.trim(), description: body.description ?? '',
            shirt: color, pants: '#3c4a5a', hair: '#2b2320', skin: '#e8b08a', deskIndex: 100 + count,
            isActive: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          },
          {
            agentId: id, provider: 'kenari', model: body.model ?? deps.model, temperature: 0.7,
            systemPrompt: body.systemPrompt ?? `Kamu adalah ${body.name.trim()}, ${body.role.trim()} di tim AI kampus virtual.`,
            allowedTools: ['write_document', 'read_artifact'], workspace: `agents/${id}`,
          },
        )
        await repo.addActivity('user', 'agent.created', id, `${agent.name} (${agent.role})`)
        return json({ ok: true, agent }, 201)
      }
      const agentMatch = path.match(/^\/agents\/([^/]+)$/)
      if (agentMatch && req.method === 'PATCH') {
        const body = (await req.json()) as {
          name?: string; role?: string; description?: string; isActive?: boolean
          config?: { provider?: string; model?: string; temperature?: number; systemPrompt?: string; allowedTools?: string[]; workspace?: string }
        }
        const updated = await repo.updateAgent(agentMatch[1], {
          name: body.name, role: body.role, description: body.description, isActive: body.isActive,
        }, body.config ?? {})
        if (!updated) return json({ ok: false, error: 'Agent not found' }, 404)
        await repo.addActivity('user', 'agent.updated', updated.id, `${updated.name} config saved (model ${updated.config.model})`)
        return json({ ok: true, agent: updated })
      }

      // ── Tasks ──────────────────────────────────────────────────────────────
      if (path === '/tasks' && req.method === 'GET') {
        const tasks = await repo.listTasks(50)
        const withRuns = []
        for (const t of tasks) {
          withRuns.push({ ...t, runs: await repo.listRuns(t.id), artifacts: await repo.listArtifacts(t.id) })
        }
        return json({ tasks: withRuns })
      }
      if (path === '/tasks' && req.method === 'POST') {
        const body = (await req.json()) as { title?: string; instructions?: string; agentId?: string; priority?: string }
        if (!body.title?.trim() || !body.instructions?.trim() || !body.agentId) {
          return json({ ok: false, error: 'title, instructions and agentId are required' }, 400)
        }
        const agent = await repo.getAgent(body.agentId)
        if (!agent) return json({ ok: false, error: `Agent ${body.agentId} not found` }, 400)
        if (!agent.isActive) return json({ ok: false, error: `Agent ${agent.name} is deactivated` }, 400)
        const task = await repo.createTask({
          id: randomUUID(), title: body.title.trim(), instructions: body.instructions.trim(),
          agentId: body.agentId,
          priority: (['low', 'normal', 'high'].includes(body.priority ?? '') ? body.priority : 'normal') as 'low' | 'normal' | 'high',
          status: 'queued', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        })
        await repo.addActivity('user', 'task.created', task.id, `"${task.title}" → ${agent.name}`)
        return json({ ok: true, task }, 201)
      }
      const taskMatch = path.match(/^\/tasks\/([^/]+)$/)
      if (taskMatch && req.method === 'GET') {
        const task = await repo.getTask(taskMatch[1])
        if (!task) return json({ ok: false, error: 'Task not found' }, 404)
        const runs = []
        for (const r of await repo.listRuns(task.id)) {
          runs.push({ ...r, toolCalls: await repo.listToolCalls(r.id) })
        }
        return json({ task, runs, artifacts: await repo.listArtifacts(task.id), events: await repo.listTaskEvents(task.id) })
      }
      const retryMatch = path.match(/^\/tasks\/([^/]+)\/retry$/)
      if (retryMatch && req.method === 'POST') {
        const task = await repo.getTask(retryMatch[1])
        if (!task) return json({ ok: false, error: 'Task not found' }, 404)
        if (!['failed', 'completed', 'cancelled'].includes(task.status)) {
          return json({ ok: false, error: `Task is ${task.status} — only finished tasks can be retried` }, 409)
        }
        await repo.setTaskStatus(task.id, 'queued')
        await repo.addActivity('user', 'task.retry', task.id, `"${task.title}" re-queued as a new run`)
        return json({ ok: true, task: await repo.getTask(task.id) })
      }

      // ── Approvals ──────────────────────────────────────────────────────────
      if (path === '/approvals' && req.method === 'GET') {
        return json({ approvals: await repo.listApprovals(url.searchParams.get('status') ?? undefined) })
      }
      const decideMatch = path.match(/^\/approvals\/([^/]+)\/decide$/)
      if (decideMatch && req.method === 'POST') {
        const body = (await req.json()) as { decision?: string }
        if (body.decision !== 'approved' && body.decision !== 'rejected') {
          return json({ ok: false, error: 'decision must be "approved" or "rejected"' }, 400)
        }
        const before = await repo.getApproval(decideMatch[1])
        if (!before) return json({ ok: false, error: 'Approval not found' }, 404)
        const decided = await repo.decideApproval(decideMatch[1], body.decision)
        if (before.status === 'pending') {
          engine.decide(decideMatch[1], body.decision) // wake the paused run
          broadcastControl('approval-decided', { approvalId: decideMatch[1], decision: body.decision })
        }
        return json({ ok: true, approval: decided })
      }

      // ── Meetings (Phase 4) ─────────────────────────────────────────────────
      if (path === '/meetings' && req.method === 'GET') {
        return json({ meetings: await repo.listMeetings(30), running: meetings.isRunning() })
      }
      if (path === '/meetings' && req.method === 'POST') {
        const body = (await req.json()) as { topic?: string; participantIds?: string[]; rounds?: number }
        const topic = body.topic?.trim() ?? ''
        const ids = [...new Set((body.participantIds ?? []).filter((x) => typeof x === 'string'))]
        if (!topic) return json({ ok: false, error: 'topic is required' }, 400)
        if (ids.length < 2 || ids.length > 4) {
          return json({ ok: false, error: 'Pick 2–4 participants' }, 400)
        }
        for (const id of ids) {
          const a = await repo.getAgent(id)
          if (!a) return json({ ok: false, error: `Agent ${id} not found` }, 400)
          if (!a.isActive) return json({ ok: false, error: `Agent ${a.name} is deactivated` }, 400)
        }
        if (meetings.isRunning()) return json({ ok: false, error: 'A meeting is already running' }, 409)
        const rounds = Math.min(3, Math.max(1, Math.round(body.rounds ?? 2)))
        try {
          const meeting = await meetings.start({ topic, participantIds: ids, rounds })
          return json({ ok: true, meeting }, 201)
        } catch (err) {
          return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
        }
      }
      const meetingMatch = path.match(/^\/meetings\/([^/]+)$/)
      if (meetingMatch && req.method === 'GET') {
        const meeting = await repo.getMeeting(meetingMatch[1])
        if (!meeting) return json({ ok: false, error: 'Meeting not found' }, 404)
        return json({ meeting, messages: await repo.listMeetingMessages(meeting.id) })
      }

      // ── Notifications (Phase 4) ────────────────────────────────────────────
      if (path === '/notifications' && req.method === 'GET') {
        return json({
          notifications: await repo.listNotifications(Number(url.searchParams.get('limit') ?? 50)),
          unread: await repo.unreadNotificationCount(),
        })
      }
      if (path === '/notifications/read-all' && req.method === 'POST') {
        await repo.markAllNotificationsRead()
        return json({ ok: true, unread: 0 })
      }
      const notifMatch = path.match(/^\/notifications\/([^/]+)\/read$/)
      if (notifMatch && req.method === 'POST') {
        await repo.markNotificationRead(notifMatch[1])
        return json({ ok: true, unread: await repo.unreadNotificationCount() })
      }

      // ── Activity & usage ───────────────────────────────────────────────────
      if (path === '/activity' && req.method === 'GET') {
        return json({ activity: await repo.listActivity(Number(url.searchParams.get('limit') ?? 60)) })
      }
      if (path === '/usage' && req.method === 'GET') {
        const byAgent = await repo.usageToday()
        return json({
          byAgent,
          total: {
            tokensIn: byAgent.reduce((s, u) => s + u.tokensIn, 0),
            tokensOut: byAgent.reduce((s, u) => s + u.tokensOut, 0),
            costUsd: byAgent.reduce((s, u) => s + u.costUsd, 0),
            calls: byAgent.reduce((s, u) => s + u.calls, 0),
          },
          pricingNote: PRICING_NOTE,
        })
      }
      if (path === '/artifacts' && req.method === 'GET') {
        return json({ artifacts: await repo.listArtifacts() })
      }

      return new Response('Not found', { status: 404, headers: cors })
    } catch (err) {
      // Fase 7: a malformed JSON body is a client error (400), not a crash.
      if (err instanceof SyntaxError) {
        return json({ ok: false, error: 'Request body is not valid JSON' }, 400)
      }
      console.error('[orchestrator] request error', err)
      return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500)
    }
  }
}

// Re-exported for the runtimes that wire the proof's event emitter.
export { emit }
