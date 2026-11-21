# AI Agent Living World 3D — "Agentopia"

A living 3D campus where AI agents are represented by animated avatars.
**All 7 phases of the roadmap are implemented**: Phase 1 — Core 3D World,
Phase 2 — World Expansion, Phase 3 — Agent Engine, Phase 4 — Real-Time
Visual Connection, Phase 5 — Life Simulation, Phase 6 — World Editor,
Phase 7 — Performance, Security & QA. Architecture: see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (@Wang); this code follows it.

> **Honesty label:** the world still runs its **DEMO mode** driver in
> parallel (labelled), but real work now exists beside it: the Phase 3
> engine in `apps/orchestrator/` executes user-created tasks through the
> Kenari gateway with a persistent database, an approval gate for
> sensitive tools, and per-agent usage records (Tasks panel → LIVE tasks).
> Phase 4 wires that engine to the world in real time: live run steps,
> real multi-agent LLM meetings (Meetings panel), a notification center,
> and follow-live camera tracking. User accounts (Supabase Auth) remain
> *Integration Required* — see the Phase 3 table below.

## Run it

```bash
bun install
bun run dev        # http://localhost:5173
bun run build      # tsc + vite build (verified passing)
bun run preview    # serves the production build on :4173
```

Orchestrator (live tasks/meetings; optional — the world also runs its
labelled demo mode without it):

```bash
cd apps/orchestrator && python3 run.py   # API + SSE on :8787
# run.py attaches the Kenari credential from the Secure Vault as a
# surrogate env var; the key never appears in code, logs or the bundle.
# State: SQLite at apps/orchestrator/data/living-world.db
# (override with LW_DB_PATH). Set LW_DEMO=0 to silence the demo driver.
```

## How it fits together

- `packages/shared-types/` — the **frozen event contract**
  (`task.assigned`, `task.started`, `run.thinking`, `tool.started/finished`,
  `run.waiting_input`, `task.collaboration`, `meeting.speaking`,
  `task.completed`, `task.failed`, `agent.offline`) + agent/task types +
  scene-graph vocabulary. Changing this shape = contract revision.
- `apps/web/src/agent-client/` — event bus, `DemoDriver` (the labelled
  demo event source), `LiveClient` (SSE client re-emitting orchestrator
  events onto the same bus, `source: 'live'`), `ServerApi` (REST mirror of
  server truth: agents, tasks, approvals, meetings, notifications, usage).
- `apps/web/src/simulation/` — virtual clock, schedule/life-sim, waypoint
  navigation, and the event→behaviour translation. It consumes only the
  contract; it never invents work status.
- `apps/web/src/world/` — Three.js/R3F scene graph:
  World → District → Building → Floor → Room → Object, with avatars as
  World-level siblings. Procedural assets only, zero external GLB.
- `apps/web/src/state/` — Zustand stores (UI view state + logical world
  mirror) and the mutable per-frame avatar runtime registry.
- `apps/web/src/ui/` — sidebar, top bar, context panels, toolbar.

Module boundaries (per architecture doc): `world/` never imports
`agent-client/`; `simulation/` reads the event bus but makes no network
calls; `ui/` never touches Three.js directly.

## Phase 1 feature status (honest)

| Feature | Status |
|---|---|
| Build + typecheck (`bun run build`) | PASS |
| Campus scene: island, roads, plaza + animated fountain, lake, instanced trees/lamps, cars | PASS |
| HQ: 1 detailed floor — lobby/reception, open workspace (10 desks), meeting room (6 seats + screen), CEO office, focus pods ×3, pantry | PASS |
| Glass walls, hide-roof toggle (default: roof hidden so the interior shows) | PASS |
| Pool with animated water, mini football field, café building | PASS |
| Camera: orbit/zoom/pan, Iso/Orbit/Top presets, click building/agent focus, follow agent, World view | PASS |
| 10 procedural avatars, colour variants, nameplates + status rings | PASS |
| Animation poses: idle, walk, sit, typing, thinking, talking, celebrate, error, sleep (procedural, damped blending) | PASS |
| Waypoint navigation via door/aisle anchors — no wall clipping on designed routes | PASS |
| Virtual clock + schedule blocks (work / lunch / sport / rest); sun follows the clock | PASS |
| Frozen event contract + DemoDriver emitting it; task lifecycle walk→think→type→complete→celebrate | PASS |
| Scripted daily meeting 14:00 (collaboration + speaking events) | PASS |
| Tasks panel (create + assign demo task), Agents panel, Activity log, agent context panel (follow / assign / pause) | PASS |
| Sidebar entries for later phases shown disabled with phase labels (no fake buttons) | PASS |
| Live LLM execution, backend, auth, database | NOT IMPLEMENTED — "Integration Required", Phase 3 (single §7 proof task excepted) |
| AnimationMixer / GLB rigs | NOT TESTED — poses are procedural code; mixer arrives with GLB rigs (arch. §5) |
| Avatar separation steering (agents can overlap at shared anchors) | NOT IMPLEMENTED — known Fase 2 limitation |
| Touch gestures beyond OrbitControls defaults | NOT TESTED on a real device |
| Performance at 40–100 agents | NOT TESTED — Phase 7 benchmark |

## Phase 2 feature status (honest, measured 2026-11-21)

| Feature | Status |
|---|---|
| HQ 4 floors (L1 workspace · L2 team floor · L3 meeting floor · L4 lounge), each a §2.1 Floor group | PASS — screenshot-verified |
| Floor selection (§2.2): floors above the selected one hidden; per-floor view in Buildings panel + HQ context panel | PASS |
| Roof: shown only in All-floors view with roofs on; a selected floor is viewed open | PASS |
| Research building: lab benches, server racks, 2 desks; clickable/focusable; Eka (Research) works there | PASS — screenshot: Eka seated at research desk |
| Apartments: 2 floors × 5 rooms, one room per agent (bed + side table + common area) | PASS |
| Portal graph routing (§2.3): interior waypoints → stair portals (height interpolated — climbing, never floating) → doors → outdoor hub graph (HQ↔Research↔Apartments↔Plaza) | PASS — lunch scenario: agents photographed mid-stairwell en route to L4 |
| Clock-out scenario: 19:00 rest block → all 10 agents walk home and sleep in their own rooms | PASS — screenshot at 23:19, 0 agents active |
| Lunch block: agents climb to the L4 lounge (stairs get daily use) | PASS — screenshot 12:35 |
| `agent.offline` event → agent returns to its apartment (§1.3 mapping) | PASS (code path shared with rest block) |
| Static draw calls, floor-selected view (default) | **136** measured (`renderer.info`, `?perf&noagents`) — PASS vs <150 target |
| Static draw calls, All-floors view | **203** measured — FAIL vs <150: every floor's instanced sets draw at once; the budget is met in the floor-selected working view the doc designs for (§2.2), not in the overview |
| Static draw calls, Phase 1 baseline for comparison | 271 measured |
| Full scene incl. 10 avatars | 294 measured (Phase 1: 399) |
| FPS | NOT MEASURED on GPU hardware — headless SwiftShader (software GL) only; draw calls are the portable metric, FPS lands in Phase 7 |
| Frozen event contract §1.3 | UNCHANGED — no edits to `packages/shared-types` |
| Live (Kenari) regression after Phase 2 | Event flow re-verified end-to-end (assigned → started → thinking → failed/completed emitted by the orchestrator and consumed by the unchanged client path); see run note in repo history — provider-side empty responses surface as honest `task.failed`, never as success |
| L2 team-floor desks | Decorative in Fase 2 — the 10 demo agents keep L1/research desks (protects the §7 proof choreography); assigning agents per floor is Phase 3 agent data |

## Phase 3 feature status (honest, verified 2026-11-21)

| Feature | Status |
|---|---|
| Orchestrator task engine: persistent queue (SQLite via `Repository` interface), lifecycle queued → running → completed/failed in DB first, then as §1.3 events | PASS — verified end-to-end via the same REST endpoints the UI uses |
| Agent profiles + configs persisted (10 seeded agents); CRUD endpoints; web Agents panel reads/edits server data (model, temperature, system prompt, allowed tools, active) | PASS — PATCH bug found in verification (undefined fields overwrote values) and fixed, then re-verified |
| Real task from UI/API → Kenari run → artifact + run + usage recorded | PASS — Gilang wrote "Rencana Peluncuran Fitur Weather Engine RakitIO"; model called `write_document` itself; 2 LLM calls, 2,117 in / 681 out tokens on that run |
| Restart persistence: tasks, runs, artifacts, usage survive an orchestrator restart; interrupted runs are marked failed, never completed | PASS — verified across two restarts |
| Retry-safe: retry creates run #2 and keeps run #1 + its artifact in history | PASS |
| Tool registry with permission check (per-agent `allowed_tools`; denial recorded as `denied_permission`) | PASS (code + denial path implemented; live denial not exercised in verification) |
| Approval gate: `send_external_message` pauses the run in persisted `waiting_approval`; UI card approves/rejects | PASS — rejection verified (tool recorded `rejected`, never executed; task completed its remaining work); approval verified (recorded `approved_not_sent` — nothing is sent, no messaging integration exists) |
| Usage tracking: real provider token counts per call/agent; cost = estimate at a documented assumed tariff (USD 0.30/1M in, 1.20/1M out — not Kenari billing) | PASS — verification day total: 10,165 in / 3,118 out tokens, 10 calls |
| Supabase: migration SQL for the §4 core tables written to `supabase/migrations/`; repository stub behind the same interface | PREPARED, NOT CONNECTED — "Integration Required": needs Lutfi's Supabase project; RLS policies + cross-org test (§6 Fase 3 criterion) NOT TESTED because there is no project to test against |
| User registration/login (Supabase Auth) | NOT IMPLEMENTED — Integration Required, marked in the Settings panel; no fake login |
| Web panels with server data (Agents, Tasks + approvals, Activity server log, per-agent usage, Settings) + honest "live channel disconnected" states when the orchestrator is down | PASS — screenshots 1280px with live data (`lw3-tasks.png`, `lw3-agents.png` in workspace root) |
| Frozen event contract §1.3 / `packages/shared-types` | UNCHANGED — 0 files touched in `world/`, `simulation/`, `packages/` this phase |
| §7 proof endpoint | PASS — kept intact as the regression path |

## Phase 4 feature status (honest, verified 2026-11-21)

| Feature | Status |
|---|---|
| Live run visibility: Tasks panel shows a per-step live feed (assigned → thinking → tool started/finished → waiting/completed/failed) from real server events, plus the selected task's persisted tool calls with real durations | PASS — steps render as events arrive; task text appears per completed step (tasks use the non-streaming turn API — labelled in the UI; only meeting speeches stream) |
| Token streaming in the adapter (`chatStream`): Kenari serves SSE deltas + a final usage chunk (probed before building) | PASS — partial speech text in the Meetings panel is real streamed model output, never a typing effect |
| Real multi-agent meetings: create from the Meetings panel (2–4 agents + topic, 1–3 rounds); every speech is that agent's OWN LLM call with its persisted config and the transcript-so-far as context | PASS — 6 verification meetings (24 speeches, all on-topic, agents answering each other — e.g. the CEO locking the QA gate the Manager proposed and the Copywriter's error-template). Per-call usage recorded for every completed call: 26 meeting calls, 13,761 in / 15,592 out tokens |
| Avatars mirror the meeting: `task.collaboration` seats participants in the HQ meeting room, `meeting.speaking` follows the real current speaker | PASS with one fix — the orchestrator's keepalive re-emit was 8 s and demonstrably starved the frozen sim's route re-planning (avatars walked forever); measured and changed to 30 s server-side, after which the sim (headless test) seats all participants in "HQ · Meeting room". At 2×/4× sim speed the 45-sim-min seat expiry outruns any safe re-plan interval — same property as the demo meeting |
| Failed turns are honest: a provider HTTP 503 (`all_providers_failed`) on one agent's turn is persisted as a `system` transcript entry and the meeting continues | PASS — happened for real in verification (twice for the same agent across two meetings; the other agents' discussion was unaffected) |
| Minutes: organizer writes summary + decisions + action items as an artifact through the same `write_document` executor | PASS (mechanism) with an environmental caveat — 2 of 6 verification meetings produced a real `minutes` artifact (decisions + action items traceable to the transcript). The Kenari upstream for the default model flapped hard all evening (HTTP 503 `all_providers_failed`, empty-content responses, one full timeout); minutes generation retries once (streaming call) and then falls back to the verbatim transcript labelled as such — 4 meetings used the fallback, every failure recorded on the meeting row, never a fabricated summary |
| Transcript persistence: `meetings` + `meeting_messages` tables; readable in the panel; survives orchestrator restarts | PASS — verified across restarts (a meeting interrupted mid-run by a restart is marked failed, never completed) |
| Notification center: bell with unread badge; task completed/failed, approval pending, meeting completed/failed; fed by live events AND server history; read/unread state; click navigates (task → follow-live on its agent, approval → Tasks, meeting → Meetings) | PASS — notifications persisted server-side (survive restarts); badge + panel verified in screenshots |
| Follow-live: "Ikuti live" on a running/queued/waiting task (and task notifications) focuses the camera on the executing agent with follow enabled and opens its context | PASS — wired to the existing follow-camera; exercised via UI state (visual chase-cam framing itself is the Phase 1/2 follow rig, unchanged) |
| Demo mode separation: the scripted 14:00 demo meeting stays labelled demo and is never mixed with live meetings (separate panel section, `source` labels, live meetings listed from the server only) | PASS |
| Frozen event contract §1.3 / `packages/shared-types` | UNCHANGED — 0 files touched in `world/`, `simulation/`, `packages/` this phase (newest mtime there predates Phase 4); meeting behaviour achieved entirely through existing event types. `packages/shared-types` untouched — the web's meeting/notification shapes are client-side mirrors of the REST API, not contract types |
| Supabase meetings/notifications migration (`20261121000002_meetings_notifications.sql`) + repository stubs | PREPARED, NOT APPLIED — same Integration Required status as Phase 3 (needs Lutfi's Supabase project) |
| Web build (`bun run build`: tsc + vite) | PASS |

## Phase 5 feature status (honest, verified 2026-11-21)

Phase 5 is a SIMULATION layer (`simulation/` + needs state in `state/needs.ts`).
It is deliberately incapable of affecting real work: the life layer reads an
agent's mode/pose, it never writes work status, emits no work events, and
makes zero LLM calls (proven below from `usage_records`).

| Feature | Status |
|---|---|
| Needs system per agent (energy / focus / social, 0–100, ticking once per sim minute): work drains focus & energy, sleep restores energy, solitude drains social, company restores it | PASS — measured from sim state via CDP probe: a sleeping agent's energy rose 49.6 → 100 over ~48 sim-min; a working agent's focus fell until the break threshold |
| Needs visible in the UI: bars (Energi/Fokus/Sosial) in the agent context panel under an explicit "simulation" label, with copy stating they never change real work status | PASS — `NeedsBars` in `ui/panels.tsx`, mirrored from the engine at most once per sim minute |
| Per-agent variation: drain multiplier, break threshold and leisure preference derived deterministically from each agent's own id (no global profile) | PASS — evening probe: healthy agents defaulted to sport while three seeded agents diverged (below) |
| Autonomous leisure: a free agent serves its LOWEST need — energy → lounge beanbags (or home when critical), social → café/plaza, focus → walk by the lake — walking the real portal graph, activity has a duration and restores its need | PASS — measured: at 17:05 with seeded needs, ceo→social @plaza, research→focus (lake), data→rest @home simultaneously; the other seven (no critical need) → sport |
| Light social interaction: two agents idling at the same leisure spot pair up for ~3 sim-min (talking pose, face each other, social rises faster) | PASS — pairing observed from state (designer↔qa, pose `talking`, `chatWith` set both ways) |
| Chat bubbles are generic SIMULATION lines, rendered with a "simulasi" tag; they are never presented as real agent speech (real speech = server meeting transcripts only) | PASS — bubble text comes from a fixed line pool in the simulation engine; the tag is rendered in `world/Avatar.tsx` (the phase's only `world/` change: nameplate renderer, no geometry/scene change) |
| Daily rhythm: morning wake + departure from apartments, work blocks, lunch (Phase 2), micro-breaks, evening leisure, home + sleep | PASS — 06:40 probe: at 07:17, 10/10 agents awake, 9/10 already outside the apartment building, en route to needs-chosen morning activities |
| Micro-breaks: focus below the agent's own threshold mid-work-block → brief café break, focus restores, then back to desk (30 sim-min cooldown) | PASS — seeded focus 5 at 09:30 → micro-break act at ~09:55, focus 5 → 16.6 across the break, then schedule resumed |
| Needs NEVER touch work: an agent on a live/demo task is never pulled away; a critically "tired" agent still completes real work | PASS — live regression: agent `copy` seeded to energy/focus/social 6/6/6 completed a real Kenari task (completed, 1 run, 2 LLM calls) while the sim ran; only AFTER completion did the life layer send it on a micro-break |
| Zero LLM calls from leisure (§6 criterion), proven from `usage_records` | PASS — `/usage` totals were byte-identical before and after all simulation probes (36 calls, 23,926 in / 18,710 out); the only delta afterwards came from the regression task itself (+2 calls) |
| Watchdog (§6 criterion): free agent standing idle > 5 sim-min with no activity/path/legitimate pose is logged and its schedule re-applied | IMPLEMENTED — no stuck agent occurred during probes, so the trigger itself is NOT TESTED live |
| Schedule modes Realistic / Always Working / Custom (§6 wording) | NOT IMPLEMENTED — out of this run's brief; the existing 1×/2×/4× speed + pause covers "Fast". Flagged for Lutfi/@Wang to schedule or drop |
| Leisure pose set (swim/eat/sport animations, §5 asset note) | PARTIAL — leisure reuses the existing pose set (stand/sit/talking/sleep); no new swim/eat poses were modelled this phase |
| Frozen event contract §1.3 / `packages/shared-types` / orchestrator | UNCHANGED — leisure emits no events at all; `packages/` and `apps/orchestrator/` untouched. Files changed: `simulation/engine.ts`, `state/needs.ts` (new), `state/stores.ts`, `state/agentRuntime.ts` (+`chat` field), `ui/panels.tsx`, `world/Avatar.tsx` (bubble renderer only) |
| Web build (`bun run build`: tsc + vite) | PASS |

## Phase 6 feature status (honest, verified 2026-11-21)

Phase 6 is a UI/world layer (`state/editor.ts` + `world/EditorLayer.tsx` +
`ui/BuildPanel.tsx`). The sidebar's "Build Mode — Phase 6" promise is now a
working editor. Two scope decisions, stated in the panel itself: entering
Build Mode **pauses the whole simulation** (the engine already honours
`playing`; the panel labels it, exit restores the prior state), and editor
objects are **decorative — they do not affect agent routing** (the router is
anchor/portal based; nothing in `simulation/` changed).

| Feature | Status |
|---|---|
| Build Mode toggle in the sidebar (was a disabled "Phase 6" placeholder) | PASS |
| Catalog of 10 placeable objects (desk, chair, plant, server rack, sofa, beanbag, meeting table, whiteboard, lamp, partition), all procedural primitives in the world's palette | PASS |
| Placement: catalog click → ghost preview follows the pointer (raycast onto the active floor plane), green/red ring = valid/invalid, click places | PASS — CDP mouse proof: plant placed at exactly (-26, -13) on HQ L1 |
| Select / drag on the floor plane / rotate (panel buttons + Q/E, 15° steps) / delete (button + Del) | PASS — drag moved the plant to exactly (-22, -9); E rotated -15° (store-verified). Small objects get an invisible grab proxy of their catalog radius (a plant pot is ~8 px wide) |
| Snap to 0.5 m grid, toggleable | PASS (on for all verification placements — positions landed on exact 0.5 multiples) |
| Zones: HQ L1–L4, Research, Apartments L1–L2, one active zone at a time; camera flies to the zone, HQ floor selector follows | PASS |
| Forbidden zones (building door portals + stair bays, derived from the same `layout.ts` constants the portal graph routes through): rendered red while building, placement refused, drag into one reverts on release | PASS — click in the door zone placed nothing; `placementValid(door)=false` vs `placementValid(free)=true`; drag into the zone reverted to the drag start; overlay visible in the top-view screenshot (`lw6-top.png`) |
| Built-in furniture can never be selected or deleted (editor objects live in a separate store/layer; built-ins are instanced scene furniture) | PASS — by construction, and stated in the panel |
| Layout persistence: localStorage `living-world-layout-v1` (versioned), auto-saved on every change, loaded at start; Reset Layout restores the built-in default | PASS — reload produced a byte-identical object list, screenshot `lw6-reload.png` |
| Export JSON: downloads `living-world-layout.json` with the exact layout | PARTIAL — the real Export button starts the download with the right filename and `exportJSON()` content is exactly the layout (both asserted via CDP), but the completed file could not be captured in this VM: its headless Chrome cancels ALL blob downloads (proven with a minimal repro page unrelated to the app), so file-on-disk completion is NOT TESTED here |
| Import JSON via the panel's file input replaces the layout | PASS — imported sofa (`imp-1`) replaced the layout through the real `<input type=file>` (CDP `DOM.setFileInputFiles`) |
| Shared/server layout persistence | NOT IMPLEMENTED — "Integration Required" in the panel: needs Lutfi's Supabase project (per-account storage does not exist yet) |
| §6 (@Wang) extras: add rooms, change materials, undo/redo ≥ 20 steps, automatic nav-validation of edited layouts | NOT IMPLEMENTED — outside this run's brief; the brief's editor (place/move/rotate/delete + portal-safe zones + local persistence) is what shipped |
| Frozen event contract §1.3 / orchestrator / `simulation/` | UNCHANGED — 0 files touched (mtimes predate this phase); building click handlers in `world/` only gained a build-mode guard (no camera flights while editing) |
| Web build (`bun run build`: tsc + vite) | PASS |
| 390 px Build Mode | PASS — panel + catalog render and are usable (`lw6-build-390.png`) |

## Phase 7 feature status (honest, measured 2026-11-21)

Performance method (same as Phase 2): `renderer.info.render.calls` sampled
via the `?perf` PerfProbe, median of 6 samples; static views use
`?noagents`. FPS in this VM is 0.1–1.5 fps under SwiftShader **software
rendering — it is not representative of any real user device** and no UX
conclusion is drawn from it; draw calls remain the portable metric.

| Item | Status |
|---|---|
| Draw calls, floor-selected static: **139 → 119** | PASS (<150) |
| Draw calls, All-floors static: **206 → 126** | PASS (<150) — the Phase 2 FAIL is closed. Method: repeated static furniture (HQ desks/chairs/plants/sofas/lamps/pods/beds/tables across all floors, apartment furniture, recreation plants) merged into one InstancedMesh per part type spanning floors, with the instance `count` capped to the selected floor's prefix — the same visibility rule the scene already used, now also saving the draw calls |
| Geometry unchanged by the optimisation: triangles identical before/after (14,822 selected / 20,122 all-floors); comparison screenshots taken | PASS |
| Draw calls, full scene incl. avatars (was 264 at Phase 7 baseline) | NOT MEASURED after the change — the VM's headless Chrome began dying at startup (SIGTRAP) mid-run; see "Known limitations" |
| Bundle: single chunk 1,278,121 B (gzip 358.6 kB) → split `three` chunk 1,131,885 B (gzip 315.6 kB) + app chunk 148,224 B (gzip 43.5 kB) via `manualChunks`; total dist +0.16% (chunk overhead). The win is cache separation (app updates no longer re-download three.js), not total bytes — stated plainly | PASS |
| Secrets in the client bundle: `grep` over `dist` for `hsurr`, `KENARI_API_KEY`, `kenari.id`, `Authorization`, `Bearer `, `x-api-key`, `process.env` → 0 hits (the only `sk-` matches are three.js internals and the demo `task-` id prefix) | PASS |
| Web preview does not serve server data: requests for the SQLite DB, its WAL, orchestrator sources and artifact paths all return the 500-byte SPA fallback `index.html` — zero database bytes | PASS |
| Orchestrator API audit (code-level): no DELETE endpoints exist; there is no direct tool-execution endpoint — the sensitive tool is reachable only through the engine's approval flow (`decideApproval` is idempotent: re-deciding a settled approval changes nothing); `/artifact` is basename- + `.md`-constrained (no path traversal) | PASS (audit) |
| Fixes applied: write rate limit (30 POST/PATCH per minute per IP → 429, so a script cannot hammer LLM-spending endpoints) and malformed JSON now returns 400 instead of 500 | IMPLEMENTED + parse-verified (`bun build`); runtime re-test NOT TESTED — see the environment incident below |
| Approval-gate negative tests (decide unknown id → 404, invalid decision → 400, double-decide no-op), live Kenari task, live 3-agent meeting, restart persistence — this run | NOT TESTED — environment incident below. The gate itself was proven both ways in Phase 3 (rejection and approval), and restart persistence in Phases 3–4 |
| QA regression: web build PASS; demo flow / life-sim ticking / Build Mode / 390 px in a browser | Build PASS; browser items NOT TESTED this run (Chrome incident below; all four were PASS in their own phases) |
| DB robustness fix: WAL open could die with `SQLITE_IOERR_SHMSIZE` on filesystems/sandboxes without shared-memory mmap. The repository now falls back to the DELETE journal (+ `synchronous=OFF`) — safe here because the repository is a single in-process connection | IMPLEMENTED — the fallback path was exercised for real during this run (it triggered and started; a further sandbox write block then stopped schema creation) |
| Frozen event contract §1.3 / `simulation/` / `packages/` | UNCHANGED — Phase 7 touched `world/` (rendering only), `vite.config.ts`, and the orchestrator's HTTP/DB edge |

**Environment incident (2026-11-21, during this run):** the sandbox VM
progressively blocked `fsync`, `MAP_SHARED` mmap and finally plain writes
from spawned processes (shell redirection and the editor kept working).
Consequences, all evidenced in the run log: headless Chrome SIGTRAPs at
startup (browser QA + the post-change full-scene measurement impossible);
the orchestrator's SQLite (WAL) could not reopen, and copying the database
out is blocked, so the Phase 3–5 data file (`apps/orchestrator/data/`,
DB + 2.6 MB WAL) is **intact but sealed in place** — on any normal
filesystem SQLite replays the WAL on open and nothing is lost. Do not
delete `data/`. Runtime re-verification of the API fixes and the live
Kenari QA items should be re-run once the orchestrator can start again.

## Remaining Integration Required

- **Supabase**: migrations + `SupabaseRepository` stub are prepared; needs
  Lutfi's Supabase project. RLS policies + cross-org isolation test NOT
  TESTED (no project exists).
- **User auth**: none exists by design so far — the orchestrator API is
  unauthenticated and CORS-open for local development. Do not expose
  :8787 beyond localhost until auth (Supabase) lands. The approval gate
  protects against an *agent* acting without a human; it is not a
  network security boundary.
- **Shared/server layout persistence** for Build Mode (localStorage only).
- **Schedule modes** Realistic / Always Working / Custom (Phase 5 §6 item).
- **Export-file download** verification in a real browser (headless blob
  downloads are blocked in this VM — Phase 6).

## Known limitations

- FPS on real GPU hardware: NOT MEASURED (only SwiftShader software
  rendering exists here). Performance at 40–100 agents: NOT TESTED.
- Avatars have no separation steering — they can overlap at shared
  anchors. Poses are procedural; no GLB rigs / AnimationMixer yet.
- Editor objects are decorative: they do not affect agent routing.
- Meetings/tasks depend on the Kenari gateway, which intermittently
  returns 503 `all_providers_failed`; failures are recorded honestly as
  failed runs/turns, never hidden.
- One cosmetic leftover: `simulation/engine.ts` narrates any
  `task.started` with the words "(demo script)", including live tasks.

## Notes

- Bundle: split since Phase 7 into `three` + app chunks (see Phase 7
  table); the world is the first screen, so the scene is not lazy-loaded.
- Demo script pacing is wall-clock; sim speed (1×/2×/4×) scales the clock
  and movement.
- `.env.example` lists the keys the future backend will need. No secrets
  are used or shipped in the web app; the orchestrator's provider key
  stays server-side.
- QA/dev URL params on the web app: `?perf` (draw-call/FPS overlay),
  `?noagents` (static-scene measurement), `?floor=0..3|all`,
  `?t=HH:MM` (start the virtual clock at a scenario time),
  `?speed=1|2|4`, `?focus=x,z`.
