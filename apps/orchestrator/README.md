# Orchestrator — Living World

Server-side engine for the AI Agent Living World. **Phase 3 status: the
task engine is real** — persistent queue, agent configs, tool registry with
an approval gate, usage tracking — on top of the §7 proof layer (one
OpenAI-compatible LLM adapter pointed at Lutfi's Kenari gateway, one SSE
event stream speaking the frozen §1.3 contract from
`packages/shared-types`). **Phase 4 adds**: the meeting engine (real
multi-agent round-robin LLM discussions with streamed speeches, persisted
transcripts and minutes artifacts), a notifications table + endpoints, and
token streaming in the LLM adapter (`chatStream`).

## Run

```bash
python3 apps/orchestrator/run.py   # from the repo root
```

`run.py` attaches the Kenari credential from the Secure Vault connection
(`custom.kenari` connector) as an `hsurr:` surrogate in the child process
environment — the same sanctioned pattern as that connector's `run-agent.py`.
The real key is swapped in by Muse on egress to `kenari.id`; it never exists
in this repo, in a log, or in the browser. Starting `src/index.ts` directly
without the launcher works too, but `/run-live-proof` will refuse with
"KENARI_API_KEY not configured".

## Endpoints

| Route | Purpose |
|---|---|
| `GET /health` | Status: provider, model, key configured, repository, agent/task counts, last proof |
| `GET /events` | SSE stream of live work events (`source: 'live'`, frozen §1.3 types) + control frames |
| `POST /run-live-proof` | The §7 proof task (409 if one is already running) — kept as regression path |
| `GET /artifact?name=<file.md>` | Read an artifact produced by a run |
| `GET/POST /agents`, `PATCH /agents/:id` | Agent profiles + configs, persisted (create / edit model, prompt, tools, active) |
| `GET/POST /tasks`, `GET /tasks/:id`, `POST /tasks/:id/retry` | Task engine: queue → run → history; retry = a NEW run, history kept |
| `GET /approvals`, `POST /approvals/:id/decide` | Human approval gate for sensitive tools |
| `GET /activity`, `GET /usage`, `GET /artifacts` | Persistent audit log, per-agent token usage, artifact index |
| `GET/POST /meetings`, `GET /meetings/:id` | Phase 4 meeting engine: create (2–4 participants, 1–3 rounds, 409 while one runs) and read a meeting + its full persisted transcript |
| `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all` | Phase 4 notification center: task completed/failed, approval pending, meeting completed/failed — persisted server-side, simple read/unread flag |

## Phase 3 engine — how it works

- **Persistence**: SQLite (`bun:sqlite`, file `data/living-world.db`) behind
  the `Repository` interface (`src/db.ts`). Tables: agents, agent_configs,
  tasks, task_events, agent_runs, tool_calls, approvals, artifacts,
  usage_records, activity_logs. Data survives restarts — verified. A run
  interrupted by a restart is marked `failed` ("Orchestrator restarted
  mid-run") at boot, never resurrected as success. Set `LW_DB_PATH` to use
  a throwaway database.
- **Runs**: one serial worker drains the queue (priority, then FIFO). The
  agent loop uses real function calling: the model may call
  `write_document`, `read_artifact`, `send_external_message` (subset per
  agent config). If the model ends with prose and no artifact, the engine
  saves that exact text through the same `write_document` executor and
  records the tool call as `ok_engine_fallback` — visible in history.
- **Approval gate**: `send_external_message` is sensitive. A call creates a
  persisted approval, pauses the run in `waiting_approval` (avatar shows
  the waiting pose via `run.waiting_input`), and only a human decision
  resumes it. Rejection is recorded and the tool never executes. Even when
  approved, **nothing is sent** — no messaging integration exists; the
  recorded outcome is `approved_not_sent` (Integration Required).
- **Usage**: every LLM call records the provider's real token counts.
  Costs are **estimates** at an assumed internal tariff of USD 0.30 / 1M
  input tokens and USD 1.20 / 1M output tokens (`src/pricing.ts`) — not
  Kenari billing figures.

## Phase 4 meetings — how they work

- **Engine** (`src/meetings.ts`): one meeting at a time. Participants are
  seated via the frozen `task.collaboration` event (seat index per
  participant); `meeting.speaking` marks the agent whose turn is actually
  in flight. A 500 ms ticker re-emits that same true state because the
  frozen sim mapping expires a seat after 45 virtual minutes — it never
  invents a different speaker.
- **Turns**: round-robin; each speech is the agent's OWN streaming LLM
  call (its persisted system prompt, model, temperature) with the
  transcript-so-far as context. Partial text is pushed to the UI as SSE
  control frames (`meeting-delta`) — real model output as it forms, not a
  typing effect. A failed turn (e.g. provider HTTP 503) is persisted as a
  `system` transcript entry and the meeting continues; if every turn
  fails, the meeting is marked `failed`.
- **Persistence**: tables `meetings` + `meeting_messages` in the local
  SQLite schema; the D1 migration
  `cloudflare/d1/migrations/0002_meetings_notifications.sql` mirrors them
  for the cloud target. The
  organizer writes minutes (summary, decisions, action items) through the
  same `write_document` executor as tasks — via the streaming call with
  one retry, because the gateway's provider pool intermittently fails
  (503 `all_providers_failed`, empty content, timeouts); if generation
  still fails, the artifact is the verbatim transcript, labelled as
  such, and the error is recorded on the meeting.
- **Notifications**: table `notifications`; created on task completed /
  task failed / approval pending / meeting completed / meeting failed,
  and pushed live as a `notification` control frame.

## Cloud runtime (live since 2026-11-22)

The same code also runs as a Cloudflare Worker: `src/worker.ts` forwards
all traffic to one Durable Object holding the engines, backed by the
implemented `src/db/d1-repository.ts` on the real D1 database
`agentopia-db` (binding `env.agentopia_db`; migrations in
`cloudflare/d1/migrations/` at repo root). The HTTP surface is shared
verbatim with local mode via `src/app.ts`; the sync `Repository`
interface is untouched — the cloud implements its async mirror
(`src/db/async-repository.ts`). Auth is a JWT login built into the
Worker (`src/auth.ts`); the local server mounts no auth. Details and
the remaining owner-only steps (setting the `KENARI_API_KEY` and
`AUTH_PASSWORD` secrets): `cloudflare/README.md` at repo root.

## Not here yet (Integration Required)

External messaging delivery, multi-provider adapters beyond the generic
OpenAI-compatible one, and parallel run workers are not built.

## The proof run

Agent **Gilang (Copywriter)** writes a short Indonesian team work-plan
document through Kenari (`deepseek-v4-1-flash`). Event honesty:

- `task.assigned` → `task.started` → `run.thinking` (covers the real
  in-flight LLM call) → `tool.started`/`tool.finished` (artifact write) →
  `task.completed`, emitted **only after** the response arrived and the
  artifact is on disk under `artifacts/`.
- Any failure emits `task.failed` with the real error. No path marks a
  failed run as completed.

## Transport choice

SSE over WebSocket: the event stream is one-way (server → browser),
EventSource gives reconnect for free, and the whole server needs zero npm
dependencies on Bun's built-in HTTP server. Commands use plain HTTP POST.

## History

Phase 3 (2026-11-21) replaced this README's "not here yet" list — task
engine, approval gates and persistence above — with working code. The §7
proof section below is unchanged and still runs.
