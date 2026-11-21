import { create } from 'zustand'
import type { AgentState, LogEntry, Task } from '@living-world/shared-types'
import { AGENT_DEFS } from '../agent-client/demoAgents'
import { initialNeeds, type Needs } from './needs'

// ── World store: logical state mirrored from the event stream ───────────────
interface WorldStore {
  simMinutes: number
  agents: AgentState[]
  tasks: Task[]
  log: LogEntry[]
  /** Phase 5 life-simulation needs, mirrored from the simulation engine at
      most once per sim minute. Simulation data only — never work status. */
  needs: Record<string, Needs>
  applyAgentPatch: (id: string, patch: Partial<AgentState>) => void
  upsertTask: (t: Task) => void
  setSimMinutes: (m: number) => void
  setNeeds: (id: string, n: Needs) => void
}

let logSeq = 0
export function fmtClock(simMinutes: number): string {
  const h = Math.floor(simMinutes / 60) % 24
  const m = Math.floor(simMinutes % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function pushLog(text: string, kind: LogEntry['kind']) {
  const time = fmtClock(useWorldStore.getState().simMinutes)
  useWorldStore.setState((s) => ({
    log: [{ id: ++logSeq, time, text, kind }, ...s.log].slice(0, 80),
  }))
}

export const useWorldStore = create<WorldStore>((set) => ({
  simMinutes: 8 * 60,
  agents: AGENT_DEFS.map((d) => ({
    ...d,
    status: 'idle' as const,
    activity: 'Arriving on campus',
    currentTaskId: null,
    currentRoomId: 'outdoor',
    tasksDone: 0,
    paused: false,
  })),
  tasks: [],
  log: [],
  needs: Object.fromEntries(AGENT_DEFS.map((d) => [d.id, initialNeeds(d.id)])),
  setNeeds: (id, n) =>
    set((s) => ({ needs: { ...s.needs, [id]: n } })),
  applyAgentPatch: (id, patch) =>
    set((s) => ({
      agents: s.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    })),
  upsertTask: (t) =>
    set((s) => {
      const i = s.tasks.findIndex((x) => x.id === t.id)
      if (i === -1) return { tasks: [...s.tasks, t] }
      const tasks = [...s.tasks]
      tasks[i] = t
      return { tasks }
    }),
  setSimMinutes: (simMinutes) => set({ simMinutes }),
}))

// ── UI store: view state only, never work data ───────────────────────────────
export type ViewKey =
  | 'world' | 'agents' | 'tasks' | 'teams' | 'meetings'
  | 'buildings' | 'build' | 'analytics' | 'activity' | 'settings'

export type CameraMode = 'iso' | 'orbit' | 'top'

export type BuildingSel = 'hq' | 'research' | 'apartment'

interface UiStore {
  view: ViewKey
  selectedAgentId: string | null
  selectedBuildingId: BuildingSel | null
  followAgent: boolean
  hideRoof: boolean
  /** HQ floor selector (Fase 2, §2.2): level index 0..3, or 'all'. */
  hqFloor: number | 'all'
  cameraMode: CameraMode
  focusNonce: number
  focusPoint: [number, number, number]
  playing: boolean
  speed: 1 | 2 | 4
  setView: (v: ViewKey) => void
  selectAgent: (id: string | null) => void
  selectBuilding: (b: BuildingSel | null) => void
  setFollow: (f: boolean) => void
  setHideRoof: (h: boolean) => void
  setHqFloor: (f: number | 'all') => void
  setCameraMode: (m: CameraMode) => void
  focusOn: (p: [number, number, number]) => void
  setPlaying: (p: boolean) => void
  setSpeed: (s: 1 | 2 | 4) => void
}

export const useUiStore = create<UiStore>((set) => ({
  view: 'world',
  selectedAgentId: null,
  selectedBuildingId: null,
  followAgent: false,
  hideRoof: true, // Phase 1 default: the detailed interior is the showcase; roof is one click away
  hqFloor: 0, // Fase 2 default: L1 selected (the Fase 1 showcase); upper floors one click away
  cameraMode: 'iso',
  focusNonce: 0,
  focusPoint: [0, 0, 0],
  playing: true,
  speed: 1,
  setView: (view) => set({ view }),
  selectAgent: (selectedAgentId) => set({ selectedAgentId, selectedBuildingId: null }),
  selectBuilding: (selectedBuildingId) => set({ selectedBuildingId, selectedAgentId: null }),
  setFollow: (followAgent) => set({ followAgent }),
  setHideRoof: (hideRoof) => set({ hideRoof }),
  setHqFloor: (hqFloor) => set({ hqFloor }),
  setCameraMode: (cameraMode) => set({ cameraMode }),
  focusOn: (focusPoint) => set((s) => ({ focusPoint, focusNonce: s.focusNonce + 1 })),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
}))
