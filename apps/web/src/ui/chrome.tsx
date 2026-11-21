import { useEffect, useRef, useState } from 'react'
import {
  Activity, BarChart3, Bell, Blocks, Bot, Building2, CalendarClock, CheckCheck, Globe2,
  Hammer, ListTodo, Pause, Play, Settings, Users, Video,
} from 'lucide-react'
import { fmtClock, useUiStore, useWorldStore, type ViewKey } from '../state/stores'
import { markAllNotificationsRead, markNotificationRead, useServerStore, type ServerNotification } from '../agent-client/ServerApi'

const glass = 'bg-white/72 shadow-[0_8px_30px_rgba(60,50,30,0.12)] backdrop-blur-md border border-white/60'

export function TopBar() {
  const simMinutes = useWorldStore((s) => s.simMinutes)
  const agents = useWorldStore((s) => s.agents)
  const tasks = useWorldStore((s) => s.tasks)
  const serverOnline = useServerStore((s) => s.online)
  const usageTotal = useServerStore((s) => s.usageTotal)
  const active = agents.filter((a) => !['idle', 'paused'].includes(a.status)).length
  const running = tasks.filter((t) => ['assigned', 'working'].includes(t.status)).length
  return (
    <header className={`pointer-events-auto absolute left-0 right-0 top-0 z-30 flex items-center gap-3 px-4 py-2.5 ${glass} rounded-b-2xl`}>
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-tang text-white">
          <Blocks size={18} />
        </span>
        <div className="leading-tight">
          <div className="text-sm font-bold text-ink">AI Agent Living World</div>
          <div className="text-[10px] font-medium uppercase tracking-wider text-ink/50">Phase 6 · World Editor</div>
        </div>
      </div>
      <span className="ml-2 rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-extrabold tracking-wide text-amber-950" title="All work events are scripted by the DemoDriver — no LLM is connected">
        DEMO MODE
      </span>
      <div className="ml-auto flex items-center gap-2 text-[12px] font-medium text-ink/80">
        <span className="hidden items-center gap-1.5 rounded-full bg-sand px-3 py-1.5 sm:flex" title="Virtual world clock">
          <CalendarClock size={14} /> {fmtClock(simMinutes)} <span className="text-ink/45">world time</span>
        </span>
        <span className="hidden rounded-full bg-sand px-3 py-1.5 md:block">{active} agents active</span>
        <span className="hidden rounded-full bg-sand px-3 py-1.5 md:block">{running} tasks running</span>
        <span className="hidden rounded-full bg-sand px-3 py-1.5 lg:block" title={serverOnline ? 'Real token usage from the orchestrator; cost is an estimate at the documented tariff' : 'Live channel offline — no usage data'}>
          API cost today: {serverOnline && usageTotal ? `$${usageTotal.costUsd.toFixed(4)}` : '$0.00'}{' '}
          <span className="text-ink/45">{serverOnline ? '(est. · live)' : '(demo)'}</span>
        </span>
        <NotificationBell />
      </div>
    </header>
  )
}

// ── Phase 4: notification center ─────────────────────────────────────────────
// Fed by live events AND server history (persisted in the orchestrator), so
// it survives reloads and restarts. Read/unread is a simple per-row flag.
const NOTIF_STYLE: Record<ServerNotification['kind'], string> = {
  'task.completed': 'bg-emerald-100 text-emerald-900',
  'task.failed': 'bg-red-100 text-red-900',
  'approval.pending': 'bg-amber-100 text-amber-900',
  'meeting.completed': 'bg-blue-100 text-blue-900',
  'meeting.failed': 'bg-red-100 text-red-900',
}

function NotificationBell() {
  const notifications = useServerStore((s) => s.notifications)
  const unread = useServerStore((s) => s.unreadNotifications)
  const online = useServerStore((s) => s.online)
  const setView = useUiStore((s) => s.setView)
  const selectAgent = useUiStore((s) => s.selectAgent)
  const setFollow = useUiStore((s) => s.setFollow)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const openNotif = (n: ServerNotification) => {
    void markNotificationRead(n.id)
    setOpen(false)
    if (n.kind.startsWith('meeting')) {
      setView('meetings')
      return
    }
    if (n.kind === 'approval.pending') {
      setView('tasks')
      return
    }
    // Task notifications: follow-live — camera to the agent, context opens.
    if (n.agentId) {
      selectAgent(n.agentId)
      setFollow(true)
    }
    setView('world')
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        title={online ? 'Notifikasi dari server (task, approval, meeting)' : 'Notifikasi — live channel offline'}
        className="relative flex h-9 w-9 items-center justify-center rounded-full bg-sand text-ink/80 transition hover:bg-sand/70"
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-extrabold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className={`absolute right-0 top-full z-40 mt-2 w-80 rounded-2xl p-2 ${glass}`}>
          <div className="flex items-center justify-between px-1.5 py-1">
            <span className="text-[12px] font-bold text-ink">Notifikasi</span>
            <button
              onClick={() => void markAllNotificationsRead()}
              className="flex items-center gap-1 text-[11px] font-semibold text-ink/60 hover:text-ink"
            >
              <CheckCheck size={13} /> Tandai semua dibaca
            </button>
          </div>
          {!online && (
            <p className="px-1.5 pb-1 text-[11px] leading-snug text-red-800">
              Live channel disconnected — menampilkan riwayat terakhir yang diketahui.
            </p>
          )}
          <ul className="max-h-80 space-y-1 overflow-y-auto">
            {notifications.length === 0 && (
              <li className="px-1.5 py-2 text-[12px] text-ink/55">Belum ada notifikasi dari server.</li>
            )}
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => openNotif(n)}
                  className={`w-full rounded-xl px-2.5 py-2 text-left transition hover:bg-sand/80 ${n.isRead ? 'opacity-60' : ''}`}
                >
                  <span className="flex items-start gap-2">
                    <span className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-extrabold ${NOTIF_STYLE[n.kind]}`}>{n.kind}</span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[12.5px] ${n.isRead ? 'font-medium' : 'font-bold'} text-ink`}>{n.title}</span>
                      <span className="block truncate text-[11px] text-ink/55">{n.detail}</span>
                      <span className="block text-[10.5px] text-ink/40">
                        {new Date(n.createdAt).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </span>
                    {!n.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

const NAV: { key: ViewKey; label: string; icon: typeof Globe2; phase?: string }[] = [
  { key: 'world', label: 'World', icon: Globe2 },
  { key: 'agents', label: 'Agents', icon: Bot },
  { key: 'tasks', label: 'Tasks', icon: ListTodo },
  { key: 'teams', label: 'Teams', icon: Users, phase: 'Phase 3' },
  { key: 'meetings', label: 'Meetings', icon: Video },
  { key: 'buildings', label: 'Buildings', icon: Building2 },
  { key: 'build', label: 'Build Mode', icon: Hammer },
  { key: 'analytics', label: 'Analytics', icon: BarChart3, phase: 'Roadmap' },
  { key: 'activity', label: 'Activity', icon: Activity },
  { key: 'settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const view = useUiStore((s) => s.view)
  const setView = useUiStore((s) => s.setView)
  return (
    <nav className={`pointer-events-auto absolute bottom-24 left-3 top-20 z-30 flex w-14 flex-col gap-1 rounded-2xl p-2 sm:w-44 ${glass}`}>
      {NAV.map(({ key, label, icon: Icon, phase }) => {
        const disabled = !!phase
        const isActive = view === key
        return (
          <button
            key={key}
            disabled={disabled}
            onClick={() => setView(key)}
            title={disabled ? `${label} — ${phase}` : label}
            className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-semibold transition
              ${isActive ? 'bg-tang text-white shadow' : 'text-ink/75 hover:bg-sand'}
              ${disabled ? 'cursor-not-allowed opacity-45 hover:bg-transparent' : ''}`}
          >
            <Icon size={17} className="shrink-0" />
            <span className="hidden sm:inline">{label}</span>
            {phase && <span className="ml-auto hidden whitespace-nowrap rounded-full bg-ink/10 px-1.5 py-0.5 text-[8.5px] font-bold sm:inline">{phase}</span>}
          </button>
        )
      })}
      <div className="mt-auto hidden rounded-xl bg-sand/80 p-2.5 text-[10.5px] leading-snug text-ink/60 sm:block">
        Phase 6: <b>Build Mode</b> is live — add furniture per floor; layouts persist in this
        browser (localStorage). Accounts (Supabase Auth): <b>Integration Required</b>. The demo driver still runs, labelled.
      </div>
    </nav>
  )
}

export function Toolbar() {
  const playing = useUiStore((s) => s.playing)
  const setPlaying = useUiStore((s) => s.setPlaying)
  const speed = useUiStore((s) => s.speed)
  const setSpeed = useUiStore((s) => s.setSpeed)
  const cameraMode = useUiStore((s) => s.cameraMode)
  const setCameraMode = useUiStore((s) => s.setCameraMode)
  const hideRoof = useUiStore((s) => s.hideRoof)
  const setHideRoof = useUiStore((s) => s.setHideRoof)
  const followAgent = useUiStore((s) => s.followAgent)
  const setFollow = useUiStore((s) => s.setFollow)
  const selectedAgentId = useUiStore((s) => s.selectedAgentId)
  const focusOn = useUiStore((s) => s.focusOn)

  const btn = (active: boolean) =>
    `shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-bold transition ${active ? 'bg-ink text-white' : 'text-ink/70 hover:bg-sand'}`
  return (
    <div className={`pointer-events-auto absolute bottom-4 left-2 right-2 z-30 flex items-center gap-1.5 overflow-x-auto rounded-full p-1.5 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:overflow-visible ${glass}`}>
      <button className={btn(false)} onClick={() => setPlaying(!playing)} title={playing ? 'Pause simulation' : 'Play simulation'}>
        {playing ? <Pause size={15} /> : <Play size={15} />}
      </button>
      {([1, 2, 4] as const).map((s) => (
        <button key={s} className={btn(speed === s)} onClick={() => setSpeed(s)}>{s}×</button>
      ))}
      <span className="mx-1 h-5 w-px bg-ink/15" />
      {(['iso', 'orbit', 'top'] as const).map((m) => (
        <button key={m} className={btn(cameraMode === m)} onClick={() => { setCameraMode(m); focusOn([0, 0, 0]) }}>
          {m === 'iso' ? 'Iso' : m === 'orbit' ? 'Orbit' : 'Top'}
        </button>
      ))}
      <span className="mx-1 h-5 w-px bg-ink/15" />
      <button className={btn(hideRoof)} onClick={() => setHideRoof(!hideRoof)}>Hide roof</button>
      <button className={btn(false)} onClick={() => focusOn([0, 0, 0])}>World view</button>
      <button
        className={btn(followAgent)}
        disabled={!selectedAgentId}
        onClick={() => setFollow(!followAgent)}
        title={selectedAgentId ? 'Follow selected agent' : 'Select an agent first'}
      >
        Follow agent
      </button>
    </div>
  )
}

export function Ticker() {
  const latest = useWorldStore((s) => s.log[0])
  if (!latest) return null
  return (
    <div className="pointer-events-none absolute bottom-24 left-52 z-20 hidden max-w-xs rounded-xl bg-black/45 px-3 py-2 text-[11px] font-medium text-white backdrop-blur-sm lg:block">
      <span className="text-white/60">{latest.time}</span> · {latest.text}
    </div>
  )
}
