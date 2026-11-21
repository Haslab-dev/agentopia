import { useEffect, useRef, useState } from 'react'
import { Bot, Building2, Check, CircleAlert, Eye, FileText, ListTodo, Pause, Play, Radio, RotateCcw, Send, Server, ShieldAlert, Users, Video, X, XCircle } from 'lucide-react'

import { useUiStore, useWorldStore } from '../state/stores'
import { demoDriver } from '../agent-client/DemoDriver'
import { connectLive, fetchArtifact, runLiveProof } from '../agent-client/LiveClient'
import {
  createLiveTask, createMeeting, createServerAgent, decideApproval, fetchMeetingDetail, fetchTaskDetail, retryLiveTask, updateServerAgent,
  useMeetingLiveStore, useServerStore, type ServerAgent, type ServerMeeting, type ServerMeetingMessage, type ServerRun,
} from '../agent-client/ServerApi'
import { onWorkEvent } from '../agent-client/eventBus'
import { APT_CENTER, HQ_CENTER, RES_CENTER } from '../world/layout'

const glass = 'bg-white/78 shadow-[0_8px_30px_rgba(60,50,30,0.13)] backdrop-blur-md border border-white/60'
const panelPos = 'pointer-events-auto absolute left-[4.5rem] top-20 z-30 max-h-[calc(100vh-11rem)] w-[19rem] overflow-y-auto rounded-2xl p-4 sm:left-52'

const STATUS_DOT: Record<string, string> = {
  working: '#5f9e6e', thinking: '#e8b93d', meeting: '#7fb3e0', celebrating: '#f59e4c',
  error: '#e0654f', walking: '#9db38a', leisure: '#6ec3c9', idle: '#b8b2a4', paused: '#8a8578',
}

const ALL_TOOLS = ['write_document', 'read_artifact', 'send_external_message']

export function AgentsPanel() {
  const agents = useWorldStore((s) => s.agents)
  const selectAgent = useUiStore((s) => s.selectAgent)
  const selectedId = useUiStore((s) => s.selectedAgentId)
  const online = useServerStore((s) => s.online)
  const serverAgents = useServerStore((s) => s.agents)
  const [editId, setEditId] = useState<string | null>(null)
  const [model, setModel] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [prompt, setPrompt] = useState('')
  const [tools, setTools] = useState<string[]>([])
  const [active, setActive] = useState(true)
  const [saveMsg, setSaveMsg] = useState('')
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState('')

  const beginEdit = (a: ServerAgent) => {
    setEditId(a.id)
    setModel(a.config.model)
    setTemperature(a.config.temperature)
    setPrompt(a.config.systemPrompt)
    setTools(a.config.allowedTools)
    setActive(a.isActive)
    setSaveMsg('')
    if (a.deskIndex < 100) selectAgent(a.id)
  }

  const save = async (id: string) => {
    try {
      await updateServerAgent(id, {
        isActive: active,
        config: { model: model.trim(), temperature, systemPrompt: prompt, allowedTools: tools },
      })
      setSaveMsg('Saved to the orchestrator — this config is what the next run uses.')
    } catch (err) {
      setSaveMsg(`Save failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const create = async () => {
    if (!newName.trim() || !newRole.trim()) return
    try {
      await createServerAgent({ name: newName.trim(), role: newRole.trim() })
      setNewName('')
      setNewRole('')
    } catch { /* refresh loop will surface state; form stays for retry */ }
  }

  return (
    <section className={`${panelPos} ${glass}`}>
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-ink"><Bot size={16} /> Agents · {online ? serverAgents.length : agents.length}</h2>
      {online ? (
        <p className="mb-3 rounded-lg bg-emerald-50 px-2.5 py-2 text-[11px] leading-snug text-emerald-900">
          <b>Live — server data.</b> These profiles & configs are stored in the orchestrator's
          database (Phase 3 engine) and survive restarts. Click an agent to edit its config.
        </p>
      ) : (
        <p className="mb-3 rounded-lg bg-red-50 px-2.5 py-2 text-[11px] leading-snug text-red-900">
          <b>Live channel disconnected</b> — the orchestrator is unreachable, so server agents
          can't be loaded or edited. Showing the demo seed agents below; nothing here is
          server data right now.
        </p>
      )}
      {online ? (
        <>
          <ul className="space-y-1">
            {serverAgents.map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => beginEdit(a)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${editId === a.id ? 'bg-sand' : 'hover:bg-sand/70'}`}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white" style={{ background: a.shirt }}>
                    {a.name[0]}
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-[13px] font-bold text-ink">{a.name} · {a.role}{a.isActive ? '' : ' · off'}</span>
                    <span className="block truncate text-[11px] text-ink/55">
                      {a.config.model} · {(a.usageToday.tokensIn + a.usageToday.tokensOut).toLocaleString()} tokens today
                    </span>
                  </span>
                </button>
                {editId === a.id && (
                  <div className="space-y-2 rounded-xl bg-sand/60 p-3">
                    <label className="block text-[11px] font-bold text-ink/60">Model
                      <input value={model} onChange={(e) => setModel(e.target.value)} className="mt-0.5 w-full rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-[12px] outline-none" />
                    </label>
                    <label className="block text-[11px] font-bold text-ink/60">Temperature · {temperature}
                      <input type="range" min={0} max={1.5} step={0.1} value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} className="w-full" />
                    </label>
                    <label className="block text-[11px] font-bold text-ink/60">System prompt
                      <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} className="mt-0.5 w-full rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-[12px] outline-none" />
                    </label>
                    <div className="text-[11px] font-bold text-ink/60">Allowed tools</div>
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_TOOLS.map((t) => (
                        <button
                          key={t}
                          onClick={() => setTools(tools.includes(t) ? tools.filter((x) => x !== t) : [...tools, t])}
                          className={`rounded-full px-2 py-1 text-[11px] font-semibold ${tools.includes(t) ? 'bg-ink text-white' : 'bg-white text-ink/60 border border-ink/15'}`}
                        >
                          {t}{t === 'send_external_message' ? ' (approval)' : ''}
                        </button>
                      ))}
                    </div>
                    <label className="flex items-center gap-2 text-[12px] font-semibold text-ink/75">
                      <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Agent active
                    </label>
                    {a.deskIndex >= 100 && <p className="text-[11px] text-ink/50">Server-only agent — no 3D avatar yet (avatars arrive with world expansion).</p>}
                    <button onClick={() => save(a.id)} className="w-full rounded-xl bg-ink px-3 py-2 text-[12px] font-bold text-white">Save config to server</button>
                    {saveMsg && <p className="text-[11px] leading-snug text-ink/70">{saveMsg}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-2 border-t border-ink/10 pt-3">
            <div className="text-[11px] font-bold uppercase tracking-wide text-ink/45">New agent (stored on server)</div>
            <div className="flex gap-2">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" className="min-w-0 flex-1 rounded-xl border border-ink/15 bg-white px-2.5 py-2 text-[12px] outline-none" />
              <input value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="Role" className="min-w-0 flex-1 rounded-xl border border-ink/15 bg-white px-2.5 py-2 text-[12px] outline-none" />
              <button onClick={create} className="rounded-xl bg-tang px-3 py-2 text-[12px] font-bold text-white">Add</button>
            </div>
          </div>
        </>
      ) : (
        <ul className="space-y-1">
          {agents.map((a) => (
            <li key={a.id}>
              <button
                onClick={() => selectAgent(a.id)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${selectedId === a.id ? 'bg-sand' : 'hover:bg-sand/70'}`}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white" style={{ background: a.shirt }}>
                  {a.name[0]}
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate text-[13px] font-bold text-ink">{a.name} · {a.role}</span>
                  <span className="block truncate text-[11px] text-ink/55">{a.activity}</span>
                </span>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_DOT[a.status] }} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const TASK_STATUS_STYLE: Record<string, string> = {
  queued: 'bg-sand text-ink/70',
  running: 'bg-blue-100 text-blue-900',
  waiting_approval: 'bg-amber-200 text-amber-950',
  completed: 'bg-emerald-100 text-emerald-900',
  failed: 'bg-red-100 text-red-900',
  cancelled: 'bg-sand text-ink/50',
}

export function TasksPanel() {
  const agents = useWorldStore((s) => s.agents)
  const tasks = useWorldStore((s) => s.tasks)
  const upsertTask = useWorldStore((s) => s.upsertTask)
  const online = useServerStore((s) => s.online)
  const serverTasks = useServerStore((s) => s.tasks)
  const serverAgents = useServerStore((s) => s.agents)
  const approvals = useServerStore((s) => s.approvals)
  const [title, setTitle] = useState('')
  const [agentId, setAgentId] = useState(agents[2]?.id ?? '')
  const [liveMsg, setLiveMsg] = useState('')
  const [liveBusy, setLiveBusy] = useState(false)
  const [artifactName, setArtifactName] = useState<string | null>(null)
  const [artifactText, setArtifactText] = useState('')
  // Live task form
  const [ltTitle, setLtTitle] = useState('')
  const [ltInstructions, setLtInstructions] = useState('')
  const [ltAgent, setLtAgent] = useState('copy')
  const [ltPriority, setLtPriority] = useState('normal')
  const [ltMsg, setLtMsg] = useState('')
  // Phase 4: live run feed (per-step events as the server emits them) +
  // follow-live (camera follows the executing agent).
  const selectAgent = useUiStore((s) => s.selectAgent)
  const setFollow = useUiStore((s) => s.setFollow)
  const setView = useUiStore((s) => s.setView)
  const [feed, setFeed] = useState<{ n: number; taskId: string; text: string; at: string }[]>([])
  const feedSeq = useRef(0)
  const [selTask, setSelTask] = useState<string | null>(null)
  const [selRuns, setSelRuns] = useState<ServerRun[]>([])

  useEffect(
    () =>
      onWorkEvent((e) => {
        if (e.source !== 'live' || !e.taskId) return
        if (e.type === 'meeting.speaking' || e.type === 'task.collaboration') return
        const p = e.payload ?? {}
        const label: Partial<Record<string, string>> = {
          'task.assigned': 'Ditugaskan — avatar berjalan ke meja',
          'task.started': 'Mulai bekerja di meja',
          'run.thinking': `Berpikir — panggilan LLM berjalan (giliran ${String(p.turn ?? '?')})`,
          'tool.started': `Tool ${String(p.tool ?? '')} — mulai`,
          'tool.finished': `Tool ${String(p.tool ?? '')} — selesai`,
          'run.waiting_input': 'Menunggu keputusan approval-mu',
          'task.completed': `Selesai${p.artifact ? ` — artefak ${String(p.artifact)}` : ''}`,
          'task.failed': `Gagal — ${String(p.error ?? 'error')}`,
        }
        const text = label[e.type]
        if (!text) return
        setFeed((f) => [{ n: ++feedSeq.current, taskId: e.taskId!, text, at: new Date().toLocaleTimeString('id-ID') }, ...f].slice(0, 60))
      }),
    [],
  )

  useEffect(() => {
    if (!selTask) {
      setSelRuns([])
      return
    }
    let stop = false
    const load = () =>
      fetchTaskDetail(selTask)
        .then((d) => { if (!stop) setSelRuns(d.runs) })
        .catch(() => { /* next poll retries */ })
    void load()
    const iv = setInterval(load, 3000)
    return () => { stop = true; clearInterval(iv) }
  }, [selTask])

  const watchLive = (agentId: string) => {
    selectAgent(agentId)
    setFollow(true)
    setView('world')
  }
  const lastRun = selRuns.at(-1)

  const viewArtifact = (name: string) => {
    setArtifactName(name)
    setArtifactText('')
    fetchArtifact(name)
      .then(setArtifactText)
      .catch(() => setArtifactText('(failed to load the artifact from the orchestrator)'))
  }

  // Show the real artifact content as soon as a live run completes.
  useEffect(
    () =>
      onWorkEvent((e) => {
        if (e.source !== 'live') return
        if (e.type === 'task.completed' && e.payload?.artifact) {
          viewArtifact(String(e.payload.artifact))
          setLiveBusy(false)
        }
        if (e.type === 'task.failed') setLiveBusy(false)
      }),
    [],
  )

  const runLive = async () => {
    setLiveBusy(true)
    setArtifactName(null)
    setArtifactText('')
    const r = await runLiveProof()
    setLiveMsg(r.message)
    if (!r.ok) setLiveBusy(false)
  }

  const submitLive = async () => {
    if (!ltTitle.trim() || !ltInstructions.trim()) return
    try {
      await createLiveTask({ title: ltTitle.trim(), instructions: ltInstructions.trim(), agentId: ltAgent, priority: ltPriority })
      setLtMsg('Task queued on the server — the engine will run it and the avatar will act it out from live events.')
      setLtTitle('')
      setLtInstructions('')
    } catch (err) {
      setLtMsg(`Could not create task: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const submit = () => {
    const t = title.trim()
    if (!t || !agentId) return
    const task = {
      id: `task-${Date.now()}`,
      title: t,
      agentId,
      status: 'assigned' as const,
      isDemo: true as const,
      createdAt: Date.now(),
    }
    upsertTask(task)
    demoDriver.assignTask(task) // emits task.assigned on the frozen event bus
    setTitle('')
  }

  return (
    <section className={`${panelPos} ${glass}`}>
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-ink"><ListTodo size={16} /> Tasks</h2>

      {/* ── Approvals waiting on the user ─────────────────────────────────── */}
      {approvals.length > 0 && (
        <div className="mb-3 space-y-2">
          {approvals.map((ap) => (
            <div key={ap.id} className="rounded-xl border border-amber-500/40 bg-amber-50 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[12px] font-bold text-amber-950">
                <ShieldAlert size={13} /> Approval needed — sensitive tool paused
              </div>
              <p className="mt-1 text-[11.5px] leading-snug text-amber-950/85">{ap.actionSummary}</p>
              <p className="text-[11px] text-amber-950/60">Task: {serverTasks.find((t) => t.id === ap.taskId)?.title ?? ap.taskId.slice(0, 8)} · the run is paused until you decide. Rejecting means the tool never executes.</p>
              <div className="mt-2 flex gap-2">
                <button onClick={() => decideApproval(ap.id, 'approved')} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-[12px] font-bold text-white"><Check size={13} /> Approve</button>
                <button onClick={() => decideApproval(ap.id, 'rejected')} className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-red-600 px-2 py-1.5 text-[12px] font-bold text-white"><XCircle size={13} /> Reject</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── LIVE tasks (Phase 3 engine) ────────────────────────────────────── */}
      <div className="rounded-xl border border-emerald-600/25 bg-emerald-50 px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-[12px] font-bold text-emerald-900">
          <Server size={13} /> LIVE tasks — Phase 3 engine <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">LIVE</span>
        </div>
        {online ? (
          <>
            <p className="mt-1 text-[11px] leading-snug text-emerald-900/75">
              Real tasks, executed by the orchestrator through Kenari and stored in its
              database — they survive restarts. Sensitive tools pause for your approval above.
            </p>
            <div className="mt-2 space-y-2">
              <input value={ltTitle} onChange={(e) => setLtTitle(e.target.value)} placeholder="Live task title" className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-[13px] outline-none" />
              <textarea value={ltInstructions} onChange={(e) => setLtInstructions(e.target.value)} rows={3} placeholder="Instructions for the agent — e.g. Tulis dokumen singkat tentang rencana peluncuran produk, lalu simpan sebagai artefak." className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-[13px] outline-none" />
              <div className="flex gap-2">
                <select value={ltAgent} onChange={(e) => setLtAgent(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-ink/15 bg-white px-2 py-2 text-[13px] outline-none">
                  {serverAgents.filter((a) => a.isActive).map((a) => (
                    <option key={a.id} value={a.id}>{a.name} — {a.role}</option>
                  ))}
                </select>
                <select value={ltPriority} onChange={(e) => setLtPriority(e.target.value)} className="rounded-xl border border-ink/15 bg-white px-2 py-2 text-[13px] outline-none">
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
                <button onClick={submitLive} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-[13px] font-bold text-white shadow hover:brightness-105">
                  <Send size={14} /> Run
                </button>
              </div>
              {ltMsg && <p className="text-[11px] leading-snug text-emerald-900/80">{ltMsg}</p>}
            </div>
            <ul className="mt-3 space-y-1.5">
              {serverTasks.length === 0 && <li className="text-[12px] text-emerald-900/60">No live tasks in the database yet.</li>}
              {serverTasks.map((t) => {
                const a = serverAgents.find((x) => x.id === t.agentId)
                const lastRun = t.runs[t.runs.length - 1]
                return (
                  <li key={t.id} className="rounded-xl bg-white/75 px-3 py-2">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold text-ink">{t.title}</div>
                        <div className="text-[11px] text-ink/55">
                          {a ? `${a.name} (${a.role})` : t.agentId} · {t.runs.length} run{t.runs.length === 1 ? '' : 's'}
                          {lastRun ? ` · last: ${lastRun.status}${lastRun.error ? ` — ${lastRun.error.slice(0, 90)}` : ''}` : ''}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${TASK_STATUS_STYLE[t.status]}`}>{t.status}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {t.artifacts.map((art) => (
                        <button key={art.id} onClick={() => viewArtifact(art.fileName)} className="rounded-full bg-emerald-600/10 px-2 py-1 text-[11px] font-semibold text-emerald-900 hover:bg-emerald-600/20">
                          📄 {art.title}
                        </button>
                      ))}
                      {(t.status === 'queued' || t.status === 'running' || t.status === 'waiting_approval') && (
                        <button onClick={() => watchLive(t.agentId)} className="flex items-center gap-1 rounded-full bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:brightness-110">
                          <Eye size={11} /> Ikuti live
                        </button>
                      )}
                      <button onClick={() => setSelTask(selTask === t.id ? null : t.id)} className={`rounded-full px-2 py-1 text-[11px] font-semibold ${selTask === t.id ? 'bg-ink text-white' : 'bg-sand text-ink/75 hover:bg-sand/70'}`}>
                        Feed live
                      </button>
                      {(t.status === 'failed' || t.status === 'completed') && (
                        <button onClick={() => retryLiveTask(t.id)} className="flex items-center gap-1 rounded-full bg-sand px-2 py-1 text-[11px] font-semibold text-ink/75 hover:bg-sand/70">
                          <RotateCcw size={11} /> Retry as new run
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        ) : (
          <p className="mt-1 text-[11px] leading-snug text-red-900">
            <b>Live channel disconnected.</b> The orchestrator is unreachable — live tasks,
            run history and approvals can't be loaded. Start it with
            <code className="mx-1 rounded bg-white px-1">python3 apps/orchestrator/run.py</code>
            Demo tasks below keep working and stay labelled demo.
          </p>
        )}
        {/* ── Phase 4: live run feed ─────────────────────────────────────── */}
        <div className="mt-3 rounded-xl bg-white/70 px-3 py-2.5">
          <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-900/60">
            Feed live{selTask ? ` — ${serverTasks.find((t) => t.id === selTask)?.title ?? ''}` : ' — semua task live'}
          </div>
          <p className="mt-0.5 text-[10.5px] leading-snug text-emerald-900/60">
            Langkah tampil saat event server tiba. Teks hasil task muncul ketika langkahnya
            selesai — task tidak di-stream per token; yang di-stream adalah ucapan di meeting.
          </p>
          <ul className="mt-1.5 space-y-1">
            {(selTask ? feed.filter((f) => f.taskId === selTask) : feed).slice(0, 14).map((f) => (
              <li key={f.n} className="flex items-baseline gap-2 text-[11.5px] leading-snug text-ink/80">
                <span className="shrink-0 font-mono text-[10.5px] text-ink/45">{f.at}</span>
                <span>{f.text}</span>
              </li>
            ))}
            {(selTask ? feed.filter((f) => f.taskId === selTask) : feed).length === 0 && (
              <li className="text-[11.5px] text-emerald-900/60">Belum ada langkah live di sesi ini — jalankan task live atau tunggu event berikutnya.</li>
            )}
          </ul>
          {selTask && lastRun && (
            <div className="mt-2 border-t border-emerald-900/10 pt-2">
              <div className="text-[10.5px] font-bold uppercase tracking-wide text-emerald-900/60">Tool calls run terakhir (server)</div>
              <ul className="mt-1 space-y-1">
                {(lastRun.toolCalls ?? []).map((tc) => (
                  <li key={tc.id} className="flex items-baseline gap-2 text-[11.5px] text-ink/80">
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${tc.resultStatus === 'ok' ? 'bg-emerald-100 text-emerald-900' : 'bg-red-100 text-red-900'}`}>{tc.resultStatus}</span>
                    <span className="shrink-0 font-semibold">{tc.toolName}</span>
                    <span className="truncate text-ink/55">{tc.argsSummary}</span>
                    <span className="ml-auto shrink-0 font-mono text-[10.5px] text-ink/45">{tc.durationMs ?? '—'} ms</span>
                  </li>
                ))}
                {(lastRun.toolCalls ?? []).length === 0 && (
                  <li className="text-[11.5px] text-emerald-900/60">Run ini belum memanggil tool.</li>
                )}
              </ul>
            </div>
          )}
        </div>

        {artifactName && (
          <div className="mt-2">
            <div className="text-[11px] font-bold text-emerald-900">Artifact · {artifactName}</div>
            <pre className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-white/80 p-2.5 text-[11px] leading-relaxed text-ink/85">{artifactText || 'Loading…'}</pre>
          </div>
        )}
      </div>

      {/* ── §7 proof (fixed scenario, regression path) ─────────────────────── */}
      <div className="mt-3 rounded-xl border border-ink/10 bg-white/50 px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-[12px] font-bold text-ink/80">
          <Radio size={13} /> §7 proof task — fixed scenario
        </div>
        <p className="mt-1 text-[11px] leading-snug text-ink/60">
          The original contract-proof run: Gilang writes a team work-plan via Kenari on the
          same frozen event contract. Kept as the regression path for the §7 bet.
        </p>
        <button
          onClick={runLive}
          disabled={liveBusy}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-ink px-3 py-2 text-[13px] font-bold text-white shadow hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
        >
          <Radio size={14} /> {liveBusy ? 'Proof run in progress…' : 'Run §7 proof (Kenari)'}
        </button>
        {liveMsg && <p className="mt-1.5 text-[11px] leading-snug text-ink/70">{liveMsg}</p>}
      </div>

      {/* ── Demo tasks ─────────────────────────────────────────────────────── */}
      <p className="mb-3 mt-4 rounded-lg bg-amber-100 px-2.5 py-2 text-[11px] leading-snug text-amber-900">
        <b>Demo tasks.</b> Assigning below runs a scripted event lifecycle (walk → think → type → celebrate).
        No LLM executes anything in this section — for real work use LIVE tasks above.
      </p>
      <div className="space-y-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Demo task title, e.g. Draft the release notes"
          className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-[13px] outline-none focus:border-tang"
        />
        <div className="flex gap-2">
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-ink/15 bg-white px-2 py-2 text-[13px] outline-none">
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name} — {a.role}</option>
            ))}
          </select>
          <button onClick={submit} className="flex items-center gap-1.5 rounded-xl bg-tang px-3 py-2 text-[13px] font-bold text-white shadow hover:brightness-105">
            <Send size={14} /> Assign demo
          </button>
        </div>
      </div>
      <ul className="mt-4 space-y-1.5">
        {tasks.length === 0 && <li className="text-[12px] text-ink/50">No demo tasks yet this session.</li>}
        {[...tasks].reverse().map((t) => {
          const a = agents.find((x) => x.id === t.agentId)
          return (
            <li key={t.id} className="rounded-xl bg-sand/70 px-3 py-2">
              <div className="text-[13px] font-semibold text-ink">{t.title}</div>
              <div className="text-[11px] text-ink/55">
                {a ? `${a.name} (${a.role})` : 'Unassigned'} · <b>{t.status}</b> · {t.isDemo ? 'demo' : 'LIVE · Kenari'}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const FLOOR_LABELS = ['L1 · Workspace', 'L2 · Teams', 'L3 · Meeting', 'L4 · Lounge']

export function FloorButtons({ compact = false }: { compact?: boolean }) {
  const hqFloor = useUiStore((s) => s.hqFloor)
  const setHqFloor = useUiStore((s) => s.setHqFloor)
  const btn = (active: boolean) =>
    `rounded-lg px-2 py-1.5 text-[11px] font-bold transition ${active ? 'bg-ink text-white' : 'bg-sand text-ink/70 hover:bg-sand/70'}`
  return (
    <div className="flex flex-wrap gap-1.5">
      {[0, 1, 2, 3].map((f) => (
        <button key={f} className={btn(hqFloor === f)} onClick={() => setHqFloor(f)}>
          {compact ? `L${f + 1}` : FLOOR_LABELS[f]}
        </button>
      ))}
      <button className={btn(hqFloor === 'all')} onClick={() => setHqFloor('all')}>All floors</button>
    </div>
  )
}

export function BuildingsPanel() {
  const focusOn = useUiStore((s) => s.focusOn)
  const selectBuilding = useUiStore((s) => s.selectBuilding)
  const go = (id: 'hq' | 'research' | 'apartment', c: [number, number]) => {
    selectBuilding(id)
    focusOn([c[0], 0, c[1]])
  }
  return (
    <section className={`${panelPos} ${glass}`}>
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-ink"><Building2 size={16} /> Buildings</h2>
      <p className="mb-3 text-[11px] text-ink/55">
        Fase 2 campus: three buildings on one portal graph — agents walk between
        them through doors and stairs, never teleport.
      </p>
      <div className="space-y-3">
        <div className="rounded-xl bg-sand/70 p-3">
          <div className="flex items-center justify-between">
            <b className="text-[13px] text-ink">HQ — Head Office</b>
            <button onClick={() => go('hq', HQ_CENTER)} className="rounded-lg bg-ink px-2 py-1 text-[11px] font-bold text-white">Focus</button>
          </div>
          <p className="mt-0.5 text-[11px] text-ink/55">4 floors · workspace, team floor, meeting floor, lounge. Pick a floor to view it (floors above are hidden):</p>
          <div className="mt-2"><FloorButtons /></div>
        </div>
        <div className="rounded-xl bg-sand/70 p-3">
          <div className="flex items-center justify-between">
            <b className="text-[13px] text-ink">Research Building</b>
            <button onClick={() => go('research', RES_CENTER)} className="rounded-lg bg-ink px-2 py-1 text-[11px] font-bold text-white">Focus</button>
          </div>
          <p className="mt-0.5 text-[11px] text-ink/55">Lab benches, server racks, 2 research desks — Eka (Research) works here.</p>
        </div>
        <div className="rounded-xl bg-sand/70 p-3">
          <div className="flex items-center justify-between">
            <b className="text-[13px] text-ink">Apartments</b>
            <button onClick={() => go('apartment', APT_CENTER)} className="rounded-lg bg-ink px-2 py-1 text-[11px] font-bold text-white">Focus</button>
          </div>
          <p className="mt-0.5 text-[11px] text-ink/55">2 floors × 5 rooms — one room per agent. Everyone walks home at 19:00.</p>
        </div>
      </div>
    </section>
  )
}

const MEETING_STATUS_STYLE: Record<string, string> = {
  running: 'bg-blue-100 text-blue-900',
  completed: 'bg-emerald-100 text-emerald-900',
  failed: 'bg-red-100 text-red-900',
}

export function MeetingsPanel() {
  const online = useServerStore((s) => s.online)
  const serverAgents = useServerStore((s) => s.agents)
  const meetings = useServerStore((s) => s.meetings)
  const meetingRunning = useServerStore((s) => s.meetingRunning)
  const worldAgents = useWorldStore((s) => s.agents)
  const speakerId = useMeetingLiveStore((s) => s.speakerId)
  const partialText = useMeetingLiveStore((s) => s.partialText)
  const [topic, setTopic] = useState('')
  const [picked, setPicked] = useState<string[]>(['ceo', 'manager', 'copy'])
  const [rounds, setRounds] = useState(2)
  const [msg, setMsg] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ meeting: ServerMeeting; messages: ServerMeetingMessage[] } | null>(null)
  const [minutesName, setMinutesName] = useState<string | null>(null)
  const [minutesText, setMinutesText] = useState('')

  const nameOf = (id: string) => serverAgents.find((a) => a.id === id)?.name ?? worldAgents.find((a) => a.id === id)?.name ?? id
  const roleOf = (id: string) => serverAgents.find((a) => a.id === id)?.role ?? ''
  // Only agents with a 3D avatar can visibly attend; server-only agents
  // (deskIndex ≥ 100) have no body in the world yet.
  const avatarIds = new Set(worldAgents.map((a) => a.id))
  const candidates = serverAgents.filter((a) => a.isActive && avatarIds.has(a.id))

  const runningMeeting = meetings.find((m) => m.status === 'running')
  const focusId = runningMeeting?.id ?? openId

  useEffect(() => {
    if (!focusId) {
      setDetail(null)
      return
    }
    let stop = false
    const load = () =>
      fetchMeetingDetail(focusId)
        .then((d) => { if (!stop) setDetail(d) })
        .catch(() => { /* next poll retries */ })
    void load()
    const iv = setInterval(load, 3000)
    return () => { stop = true; clearInterval(iv) }
  }, [focusId])

  const togglePick = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 4 ? p : [...p, id]))

  const start = async () => {
    if (!topic.trim() || picked.length < 2) return
    try {
      const m = await createMeeting({ topic: topic.trim(), participantIds: picked, rounds })
      setMsg('Meeting dimulai — peserta berjalan ke ruang meeting HQ; setiap giliran adalah panggilan LLM asli agent itu.')
      setOpenId(m.id)
      setTopic('')
    } catch (err) {
      setMsg(`Tidak bisa memulai meeting: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const viewMinutes = (name: string) => {
    setMinutesName(name)
    setMinutesText('')
    fetchArtifact(name)
      .then(setMinutesText)
      .catch(() => setMinutesText('(gagal memuat notulen dari orchestrator)'))
  }

  return (
    <section className={`${panelPos} ${glass}`}>
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-ink"><Video size={16} /> Meetings</h2>

      {/* ── LIVE meetings (Phase 4) ───────────────────────────────────────── */}
      <div className="rounded-xl border border-emerald-600/25 bg-emerald-50 px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-[12px] font-bold text-emerald-900">
          <Server size={13} /> LIVE meetings — Phase 4 <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">LIVE</span>
        </div>
        {!online ? (
          <p className="mt-1 text-[11px] leading-snug text-red-900">
            <b>Live channel disconnected.</b> The orchestrator is unreachable — live meetings
            can't be started or read. Start it with
            <code className="mx-1 rounded bg-white px-1">python3 apps/orchestrator/run.py</code>
          </p>
        ) : (
          <>
            {runningMeeting && (
              <div className="mt-2 rounded-xl bg-white/80 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[12px] font-bold text-blue-900">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" /> Sedang berlangsung
                </div>
                <div className="mt-0.5 text-[13px] font-semibold text-ink">{runningMeeting.topic}</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {runningMeeting.participantIds.map((id) => (
                    <span
                      key={id}
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${speakerId === id ? 'bg-blue-600 text-white' : 'bg-sand text-ink/70'}`}
                    >
                      {nameOf(id)}{speakerId === id ? ' · berbicara…' : ''}
                    </span>
                  ))}
                </div>
                {partialText && (
                  <div className="mt-2 rounded-lg bg-blue-50 px-2.5 py-2">
                    <div className="text-[10.5px] font-bold uppercase tracking-wide text-blue-900/60">
                      {speakerId ? nameOf(speakerId) : ''} — teks live dari model (streaming, bukan efek ketik)
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed text-ink/85">{partialText}</p>
                  </div>
                )}
              </div>
            )}

            {detail && focusId && (
              <div className="mt-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-900/60">
                  <Users size={12} /> Transkrip — {detail.meeting.topic}
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold normal-case ${MEETING_STATUS_STYLE[detail.meeting.status]}`}>{detail.meeting.status}</span>
                </div>
                <ul className="mt-1.5 space-y-1.5">
                  {detail.messages.length === 0 && (
                    <li className="text-[12px] text-emerald-900/60">Belum ada giliran selesai — peserta sedang menuju ruang meeting.</li>
                  )}
                  {detail.messages.map((m) =>
                    m.kind === 'system' ? (
                      <li key={m.id} className="rounded-lg bg-amber-100 px-2.5 py-1.5 text-[11.5px] italic leading-snug text-amber-900">{m.content}</li>
                    ) : (
                      <li key={m.id} className="rounded-lg bg-white/80 px-2.5 py-2">
                        <div className="text-[11px] font-bold text-ink/70">
                          {nameOf(m.agentId)} <span className="font-medium text-ink/45">· {roleOf(m.agentId)} · {(m.tokensIn + m.tokensOut).toLocaleString()} tokens</span>
                        </div>
                        <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed text-ink/85">{m.content}</p>
                      </li>
                    ),
                  )}
                </ul>
                {detail.meeting.error && (
                  <p className="mt-1.5 text-[11px] leading-snug text-red-800">Catatan: {detail.meeting.error}</p>
                )}
                {detail.meeting.artifactFile && (
                  <button
                    onClick={() => viewMinutes(detail.meeting.artifactFile!)}
                    className="mt-2 flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-[12px] font-bold text-white"
                  >
                    <FileText size={13} /> Lihat notulen / artefak meeting
                  </button>
                )}
                {minutesName && detail.meeting.artifactFile === minutesName && (
                  <pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-white/85 p-2.5 text-[11px] leading-relaxed text-ink/85">{minutesText || 'Memuat…'}</pre>
                )}
              </div>
            )}

            {/* ── Create form ─────────────────────────────────────────────── */}
            <div className="mt-3 space-y-2 border-t border-emerald-900/10 pt-3">
              <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-900/60">Meeting baru</div>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Topik meeting — mis. Strategi peluncuran fitur ekspor RakitIO"
                className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-[13px] outline-none"
              />
              <div className="flex flex-wrap gap-1.5">
                {candidates.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => togglePick(a.id)}
                    className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${picked.includes(a.id) ? 'bg-ink text-white' : 'bg-white text-ink/60 border border-ink/15'}`}
                  >
                    {a.name} · {a.role}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <select value={rounds} onChange={(e) => setRounds(Number(e.target.value))} className="rounded-xl border border-ink/15 bg-white px-2 py-2 text-[13px] outline-none">
                  <option value={1}>1 putaran</option>
                  <option value={2}>2 putaran</option>
                  <option value={3}>3 putaran</option>
                </select>
                <button
                  onClick={start}
                  disabled={meetingRunning || picked.length < 2 || !topic.trim()}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-[13px] font-bold text-white shadow hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Video size={14} /> {meetingRunning ? 'Meeting lain sedang berjalan…' : 'Mulai meeting live'}
                </button>
              </div>
              <p className="text-[11px] leading-snug text-emerald-900/70">Pilih 2–4 peserta. Setiap giliran = satu panggilan LLM asli dengan config agent itu; transkrip tersimpan permanen di server.</p>
              {msg && <p className="text-[11px] leading-snug text-emerald-900/85">{msg}</p>}
            </div>

            {/* ── History ─────────────────────────────────────────────────── */}
            <ul className="mt-3 space-y-1.5">
              {meetings.length === 0 && <li className="text-[12px] text-emerald-900/60">Belum ada meeting live tersimpan.</li>}
              {meetings.map((m) => (
                <li key={m.id}>
                  <button
                    onClick={() => setOpenId(openId === m.id ? null : m.id)}
                    className={`w-full rounded-xl px-3 py-2 text-left ${openId === m.id ? 'bg-white shadow-sm' : 'bg-white/60 hover:bg-white/80'}`}
                  >
                    <span className="flex items-start gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold text-ink">{m.topic}</span>
                        <span className="block text-[11px] text-ink/55">
                          {m.participantIds.map(nameOf).join(', ')} · {m.messageCount} pesan · {new Date(m.createdAt).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${MEETING_STATUS_STYLE[m.status]}`}>{m.status}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* ── Demo meeting (scripted, kept separate) ──────────────────────────── */}
      <p className="mt-3 rounded-lg bg-amber-100 px-2.5 py-2 text-[11px] leading-snug text-amber-900">
        <b>Demo meeting — terpisah.</b> Sync harian scripted jam <b>14:00 world time</b> tetap
        berjalan dari DemoDriver (Manager, CEO, Designer, Research “berbicara” bergiliran).
        Itu simulasi berlabel demo — bukan percakapan model, dan tidak dicampur dengan
        meeting live di atas.
      </p>
    </section>
  )
}

export function ActivityPanel() {
  const log = useWorldStore((s) => s.log)
  const online = useServerStore((s) => s.online)
  const activity = useServerStore((s) => s.activity)
  return (
    <section className={`${panelPos} ${glass}`}>
      <h2 className="mb-2 text-sm font-bold text-ink">Activity</h2>
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">
        <Server size={12} /> Server log — orchestrator (persistent)
      </div>
      {online ? (
        <ul className="mb-4 space-y-1.5">
          {activity.length === 0 && <li className="text-[12px] text-ink/50">No server activity recorded yet.</li>}
          {activity.map((e) => (
            <li key={e.id} className="flex gap-2 text-[12px] leading-snug text-ink/75">
              <span className="shrink-0 font-mono text-[11px] text-ink/40">
                {new Date(e.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span>
                <b className="text-ink/85">{e.actor} · {e.action}</b>
                {e.detail ? <span className="block text-ink/60">{e.detail}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 rounded-lg bg-red-50 px-2.5 py-2 text-[11px] leading-snug text-red-900">
          <b>Live channel disconnected</b> — server activity (runs, tool calls, approvals) can't
          be loaded. The session log below is local demo activity only.
        </p>
      )}
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">Session log — this browser (demo + live events)</div>
      <ul className="space-y-1.5">
        {log.length === 0 && <li className="text-[12px] text-ink/50">Nothing yet.</li>}
        {log.map((e) => (
          <li key={e.id} className="flex gap-2 text-[12px] leading-snug text-ink/75">
            <span className="shrink-0 font-mono text-[11px] text-ink/40">{e.time}</span>
            <span>{e.text}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function SettingsPanel() {
  const online = useServerStore((s) => s.online)
  const stream = useServerStore((s) => s.streamConnected)
  const usageTotal = useServerStore((s) => s.usageTotal)
  const pricingNote = useServerStore((s) => s.pricingNote)
  return (
    <section className={`${panelPos} ${glass}`}>
      <h2 className="mb-1 flex items-center gap-2 text-sm font-bold text-ink"><Server size={16} /> Settings · Phase 3 engine</h2>
      <dl className="space-y-2 text-[12.5px]">
        <Row k="Live channel" v={online ? `Connected (REST${stream ? ' + event stream' : ''}) — orchestrator on :8787` : 'DISCONNECTED — orchestrator unreachable; live panels show demo data and say so'} />
        <Row k="Provider" v="Kenari gateway (OpenAI-compatible) · key lives server-side only, never in the browser" />
        <Row k="Persistence" v="Local SQLite via the Repository interface (apps/orchestrator/data/) — agents, tasks, runs, tool calls, approvals, usage survive restarts" />
        <Row k="Usage today" v={usageTotal ? `${(usageTotal.tokensIn + usageTotal.tokensOut).toLocaleString()} tokens · ${usageTotal.calls} LLM calls · $${usageTotal.costUsd.toFixed(4)} (estimate)` : '—'} />
      </dl>
      {pricingNote && <p className="mt-2 text-[11px] leading-snug text-ink/50">{pricingNote}</p>}
      <div className="mt-3 rounded-xl bg-amber-100 px-3 py-2.5 text-[12px] leading-snug text-amber-900">
        <CircleAlert size={13} className="mr-1 inline" />
        <b>Cloud login — JWT.</b> The cloud deployment (Pages + Worker +
        D1 database <code className="rounded bg-white/70 px-1">agentopia-db</code>) guards its API with a
        username/password login that issues a 24-hour JWT; credentials live only as Worker
        secrets, set by the owner. Until the owner sets <code className="rounded bg-white/70 px-1">AUTH_PASSWORD</code>,
        the login endpoint answers <i>auth not configured</i> — fail-closed, by design.
        Local mode (this orchestrator on localhost) has no login at all.
      </div>
      <div className="mt-2 rounded-xl bg-sand/70 px-3 py-2.5 text-[12px] leading-snug text-ink/70">
        <b>External messaging — Integration Required.</b> The <code className="rounded bg-white/70 px-1">send_external_message</code> tool
        is approval-gated and fully audited, but no chat/email service is connected:
        even an approved message is recorded as <i>not sent</i>.
      </div>
    </section>
  )
}

export function ContextPanel() {
  const selectedAgentId = useUiStore((s) => s.selectedAgentId)
  const selectedBuildingId = useUiStore((s) => s.selectedBuildingId)
  const selectAgent = useUiStore((s) => s.selectAgent)
  const selectBuilding = useUiStore((s) => s.selectBuilding)
  const setFollow = useUiStore((s) => s.setFollow)
  const followAgent = useUiStore((s) => s.followAgent)
  const setView = useUiStore((s) => s.setView)
  const setHideRoof = useUiStore((s) => s.setHideRoof)
  const hideRoof = useUiStore((s) => s.hideRoof)
  const focusOn = useUiStore((s) => s.focusOn)
  const agent = useWorldStore((s) => s.agents.find((a) => a.id === selectedAgentId))
  const applyAgentPatch = useWorldStore((s) => s.applyAgentPatch)
  const tasks = useWorldStore((s) => s.tasks)
  const serverAgent = useServerStore((s) => s.agents.find((a) => a.id === selectedAgentId))

  const close = () => { selectAgent(null); selectBuilding(null) }

  return (
    <aside className={`pointer-events-auto absolute bottom-24 right-3 top-20 z-30 w-[19rem] overflow-y-auto rounded-2xl p-4 max-sm:left-3 max-sm:right-3 max-sm:top-auto max-sm:max-h-[46vh] max-sm:w-auto ${glass}`}>
      {agent ? (
        <>
          <div className="mb-3 flex items-start gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl text-lg font-bold text-white" style={{ background: agent.shirt }}>
              {agent.name[0]}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-[15px] font-bold text-ink">{agent.name}</div>
              <div className="text-[12px] text-ink/55">{agent.role}</div>
            </div>
            <button onClick={close} className="rounded-full p-1 text-ink/50 hover:bg-sand"><X size={15} /></button>
          </div>
          <dl className="space-y-1.5 text-[12.5px]">
            <Row k="Status" v={`${agent.status} — ${agent.activity}`} />
            <Row k="Location" v={agent.currentRoomId} />
            <Row k="Model" v={agent.modelLabel} />
            <Row k="Current task" v={tasks.find((t) => t.id === agent.currentTaskId)?.title ?? '—'} />
            <Row k="Tasks completed" v={String(agent.tasksDone)} />
            {serverAgent && (
              <>
                <Row k="Live model" v={`${serverAgent.config.model} (server config)`} />
                <Row k="Tokens today" v={`${(serverAgent.usageToday.tokensIn + serverAgent.usageToday.tokensOut).toLocaleString()} · $${serverAgent.usageToday.costUsd.toFixed(4)} est. · ${serverAgent.usageToday.calls} calls`} />
              </>
            )}
          </dl>
          <div className="mt-3 rounded-xl bg-sand/60 p-2.5">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] font-bold text-ink/70">Life simulation · needs</span>
              <span className="rounded bg-white/70 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-ink/50">simulation</span>
            </div>
            <NeedsBars agentId={agent.id} />
            <p className="mt-1.5 text-[10px] leading-snug text-ink/50">
              The avatar's simulated body — drains at work, recovers on breaks,
              sleep and company. It steers free time only; it never changes
              this agent's real work status above.
            </p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={() => setFollow(!followAgent)} className="flex items-center justify-center gap-1.5 rounded-xl bg-ink px-2 py-2 text-[12px] font-bold text-white">
              <Eye size={13} /> {followAgent ? 'Unfollow' : 'Follow'}
            </button>
            <button onClick={() => setView('tasks')} className="rounded-xl bg-tang px-2 py-2 text-[12px] font-bold text-white">
              Assign task
            </button>
            <button
              onClick={() => applyAgentPatch(agent.id, { paused: !agent.paused })}
              className="col-span-2 flex items-center justify-center gap-1.5 rounded-xl bg-sand px-2 py-2 text-[12px] font-bold text-ink"
            >
              {agent.paused ? <Play size={13} /> : <Pause size={13} />} {agent.paused ? 'Resume agent' : 'Pause agent'}
            </button>
          </div>
          <p className="mt-3 text-[11px] leading-snug text-ink/50">
            Live work runs from the <b>Tasks panel</b> (Phase 3 engine, server-persisted).
            Want this agent to actually speak? Seat it in a <b>live meeting</b> (Meetings panel, Phase 4).
          </p>
        </>
      ) : selectedBuildingId ? (
        <>
          <div className="mb-2 flex items-start gap-2">
            <Building2 size={18} className="mt-0.5 text-ink/70" />
            <div className="flex-1 leading-tight">
              <div className="text-[15px] font-bold text-ink">
                {selectedBuildingId === 'hq' ? 'HQ — Head Office' : selectedBuildingId === 'research' ? 'Research Building' : 'Apartments'}
              </div>
              <div className="text-[12px] text-ink/55">
                {selectedBuildingId === 'hq'
                  ? 'Office district · 4 floors (Phase 2)'
                  : selectedBuildingId === 'research'
                    ? 'Research district · lab, 1 floor (Phase 2)'
                    : 'Residential district · 2 floors × 5 rooms (Phase 2)'}
              </div>
            </div>
            <button onClick={close} className="rounded-full p-1 text-ink/50 hover:bg-sand"><X size={15} /></button>
          </div>
          {selectedBuildingId === 'hq' && (
            <>
              <ul className="list-inside list-disc space-y-1 text-[12.5px] text-ink/75">
                <li>L1 — lobby, workspace (10 desks), meeting, CEO office, pods</li>
                <li>L2 — team floor, 8 desks in two clusters</li>
                <li>L3 — meeting room 2 (8 seats), focus pods</li>
                <li>L4 — lounge (the lunch-break destination)</li>
              </ul>
              <div className="mt-3">
                <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink/45">View floor</div>
                <FloorButtons />
              </div>
            </>
          )}
          {selectedBuildingId === 'research' && (
            <ul className="list-inside list-disc space-y-1 text-[12.5px] text-ink/75">
              <li>Lab benches ×3 · server racks</li>
              <li>2 research desks — Eka (Research) is based here</li>
              <li>Whiteboard + data screen</li>
            </ul>
          )}
          {selectedBuildingId === 'apartment' && (
            <ul className="list-inside list-disc space-y-1 text-[12.5px] text-ink/75">
              <li>10 rooms — one per agent, own bed + side table</li>
              <li>Common area per floor (sofa + table)</li>
              <li>Agents walk home at 19:00 and sleep here</li>
            </ul>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={() => setHideRoof(!hideRoof)} className="rounded-xl bg-ink px-2 py-2 text-[12px] font-bold text-white">
              {hideRoof ? 'Show roofs' : 'Hide roofs'}
            </button>
            <button
              onClick={() => focusOn([
                selectedBuildingId === 'hq' ? HQ_CENTER[0] : selectedBuildingId === 'research' ? RES_CENTER[0] : APT_CENTER[0],
                0,
                selectedBuildingId === 'hq' ? HQ_CENTER[1] : selectedBuildingId === 'research' ? RES_CENTER[1] : APT_CENTER[1],
              ])}
              className="rounded-xl bg-sand px-2 py-2 text-[12px] font-bold text-ink"
            >
              Focus building
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 className="mb-1 text-sm font-bold text-ink">Campus overview</h2>
          <p className="text-[12px] leading-relaxed text-ink/70">
            Click any <b>agent</b> or <b>building</b> (HQ · Research · Apartments) to inspect it.
            Drag to orbit, scroll to zoom, right-drag to pan. The Buildings panel switches HQ floors.
          </p>
          <div className="mt-3 rounded-xl bg-amber-100 px-3 py-2.5 text-[12px] leading-snug text-amber-900">
            <CircleAlert size={13} className="mr-1 inline" />
            <b>Demo mode.</b> Avatars are driven by a scripted event driver using the frozen
            Phase 1 event contract. No AI model is connected.
          </div>
          <button onClick={() => setView('tasks')} className="mt-3 w-full rounded-xl bg-emerald-600 px-3 py-2 text-[12px] font-bold text-white">
            Run a LIVE task (Kenari) — Tasks panel
          </button>
          <p className="mt-2 text-[11px] leading-snug text-ink/50">
            Real tasks now run through the Phase 3 engine (orchestrator + database) on the
            same frozen event contract — see the Tasks panel. The cloud deployment adds a
            JWT login in front of the API (Settings panel).
          </p>
        </>
      )}
    </aside>
  )
}

/** Phase 5 life-simulation needs bars. Labelled honestly: these numbers
    describe the avatar's simulated body, NOT the agent's real work state —
    a low bar never blocks, delays or fakes a server task. */
export function NeedsBars({ agentId, compact = false }: { agentId: string; compact?: boolean }) {
  const needs = useWorldStore((s) => s.needs[agentId])
  if (!needs) return null
  const bars: { label: string; v: number; color: string }[] = [
    { label: 'Energi', v: needs.energy, color: '#e8b93d' },
    { label: 'Fokus', v: needs.focus, color: '#7fb3e0' },
    { label: 'Sosial', v: needs.social, color: '#e07a9b' },
  ]
  return (
    <div className={compact ? 'mt-1.5 space-y-1' : 'space-y-1.5'}>
      {bars.map((b) => (
        <div key={b.label} className="flex items-center gap-2">
          <span className="w-11 shrink-0 text-[10px] font-semibold text-ink/50">{b.label}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10">
            <span className="block h-full rounded-full transition-all duration-500" style={{ width: `${Math.round(b.v)}%`, background: b.color }} />
          </span>
          <span className="w-7 shrink-0 text-right text-[10px] font-bold text-ink/60">{Math.round(b.v)}</span>
        </div>
      ))}
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 font-semibold text-ink/45">{k}</dt>
      <dd className="min-w-0 flex-1 text-ink/85">{v}</dd>
    </div>
  )
}
