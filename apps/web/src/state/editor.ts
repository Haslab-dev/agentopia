import { create } from 'zustand'
import {
  APT_CENTER, APT_MAX_Z, floorY, HQ_CENTER, HQ_MAX_Z, RES_CENTER, RES_MAX_Z,
  STAIR_X, STAIR_Z_BOT, STAIR_Z_TOP,
} from '../world/layout'
import { useUiStore } from './stores'
import type { BuildingId } from './agentRuntime'

// ─────────────────────────────────────────────────────────────────────────────
// Phase 6 — World Editor state. Editor objects are ADDITIONS layered over
// the built-in furniture: built-ins are instanced scene furniture and are
// never in this store, so they can never be selected or deleted here.
// Layout persists locally (localStorage, versioned key). Shared/server
// persistence is Integration Required — see the Build panel.
// Editor objects are DECORATIVE: they do not affect agent routing (the
// router is anchor/portal based). The UI says so; this store changes no
// simulation state except pausing the sim while Build Mode is open.
// ─────────────────────────────────────────────────────────────────────────────

export type EditorBuilding = Exclude<BuildingId, 'outdoor'>
export type EditorObjType =
  | 'desk' | 'chair' | 'plant' | 'server' | 'sofa' | 'beanbag'
  | 'meeting-table' | 'whiteboard' | 'lamp' | 'partition'

export interface PlacedObject {
  id: string
  type: EditorObjType
  building: EditorBuilding
  floor: number
  pos: [number, number]
  rotY: number
}

export interface ZoneRef { building: EditorBuilding; floor: number }

export const CATALOG: { type: EditorObjType; label: string; radius: number }[] = [
  { type: 'desk', label: 'Meja', radius: 1.15 },
  { type: 'chair', label: 'Kursi', radius: 0.42 },
  { type: 'plant', label: 'Tanaman', radius: 0.48 },
  { type: 'server', label: 'Rak Server', radius: 0.85 },
  { type: 'sofa', label: 'Sofa', radius: 1.25 },
  { type: 'beanbag', label: 'Beanbag', radius: 0.62 },
  { type: 'meeting-table', label: 'Meja Meeting', radius: 1.95 },
  { type: 'whiteboard', label: 'Papan Tulis', radius: 1.3 },
  { type: 'lamp', label: 'Lampu', radius: 0.36 },
  { type: 'partition', label: 'Partisi', radius: 1.3 },
]
export const catalogOf = (t: EditorObjType) => CATALOG.find((c) => c.type === t)!

export const FLOORS_OF: Record<EditorBuilding, number[]> = {
  hq: [0, 1, 2, 3],
  research: [0],
  apartment: [0, 1],
}
export const BUILDING_LABEL: Record<EditorBuilding, string> = {
  hq: 'HQ', research: 'Research', apartment: 'Apartments',
}

// ── Placement safety: bounds + forbidden zones (doors/portals, stairs) ──────
// Rects are [x1, z1, x2, z2] in world space, derived from the same layout
// constants the portal graph routes through — block those and routing dies,
// so the editor refuses placement there instead.
export interface Rect { x1: number; z1: number; x2: number; z2: number }
const rect = (x1: number, z1: number, x2: number, z2: number): Rect => ({ x1, z1, x2, z2 })

export function zoneSpec(b: EditorBuilding, _floor: number): { bounds: Rect; forbidden: Rect[] } {
  if (b === 'hq') {
    const [hx, hz] = HQ_CENTER
    return {
      bounds: rect(hx - 19 + 0.7, hz - 13 + 0.7, hx + 19 - 0.7, hz + 13 - 0.7),
      forbidden: [
        rect(hx - 3.4, HQ_MAX_Z - 4.6, hx + 3.4, HQ_MAX_Z + 0.5), // main door + entry portal
        rect(STAIR_X - 2.0, STAIR_Z_TOP - 1.2, hx - 12.2, STAIR_Z_BOT + 1.2), // stair bay + approach
      ],
    }
  }
  if (b === 'research') {
    const [rx, rz] = RES_CENTER
    return {
      bounds: rect(rx - 12 + 0.7, rz - 8 + 0.7, rx + 12 - 0.7, rz + 8 - 0.7),
      forbidden: [rect(rx - 2.8, RES_MAX_Z - 4.2, rx + 2.8, RES_MAX_Z + 0.5)],
    }
  }
  const [ax, az] = APT_CENTER
  return {
    bounds: rect(ax - 15 + 0.7, az - 6 + 0.7, ax + 15 - 0.7, az + 6 - 0.7),
    forbidden: [
      rect(ax - 12.6, APT_MAX_Z - 4.6, ax - 7.4, APT_MAX_Z + 0.5), // door portal
      rect(ax + 7.6, az - 4.2, ax + 15.2, az + 3.9), // stair bay + approach
    ],
  }
}

function circleHitsRect(x: number, z: number, r: number, rc: Rect): boolean {
  const cx = Math.max(rc.x1, Math.min(x, rc.x2))
  const cz = Math.max(rc.z1, Math.min(z, rc.z2))
  return (x - cx) ** 2 + (z - cz) ** 2 < r * r
}

/** True when an object of `type` may sit at (x, z) in the given zone. */
export function placementValid(b: EditorBuilding, floor: number, type: EditorObjType, x: number, z: number): boolean {
  const r = catalogOf(type).radius
  const { bounds, forbidden } = zoneSpec(b, floor)
  if (x - r < bounds.x1 || x + r > bounds.x2 || z - r < bounds.z1 || z + r > bounds.z2) return false
  return !forbidden.some((f) => circleHitsRect(x, z, r, f))
}

export function zoneCenter(b: EditorBuilding): [number, number] {
  if (b === 'hq') return HQ_CENTER
  if (b === 'research') return RES_CENTER
  return APT_CENTER
}

// ── Persistence (localStorage, versioned) ────────────────────────────────────
export const LAYOUT_KEY = 'living-world-layout-v1'
const LAYOUT_VERSION = 1

function sanitize(raw: unknown): PlacedObject[] {
  if (!Array.isArray(raw)) return []
  const types = new Set(CATALOG.map((c) => c.type))
  return raw.filter((o): o is PlacedObject => {
    if (!o || typeof o !== 'object') return false
    const p = o as PlacedObject
    return (
      typeof p.id === 'string' && types.has(p.type) &&
      (p.building === 'hq' || p.building === 'research' || p.building === 'apartment') &&
      FLOORS_OF[p.building as EditorBuilding].includes(p.floor) &&
      Array.isArray(p.pos) && p.pos.every(Number.isFinite) && Number.isFinite(p.rotY)
    )
  })
}

function loadLayout(): PlacedObject[] {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as { version?: number; objects?: unknown }
    if (parsed.version !== LAYOUT_VERSION) return []
    return sanitize(parsed.objects)
  } catch {
    return []
  }
}

function saveLayout(objects: PlacedObject[]) {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ version: LAYOUT_VERSION, objects }))
  } catch { /* storage full/blocked — layout stays in memory, panel count still true */ }
}

// ── Store ────────────────────────────────────────────────────────────────────
let idSeq = 0
const newId = () => `eo-${Date.now().toString(36)}-${++idSeq}`

interface EditorStore {
  buildMode: boolean
  zone: ZoneRef
  objects: PlacedObject[]
  placingType: EditorObjType | null
  selectedId: string | null
  snap: boolean
  /** Sim `playing` value captured when Build Mode opened, restored on exit. */
  wasPlaying: boolean
  setBuildMode: (on: boolean) => void
  setZone: (z: ZoneRef) => void
  setPlacing: (t: EditorObjType | null) => void
  setSnap: (s: boolean) => void
  select: (id: string | null) => void
  addObject: (o: Omit<PlacedObject, 'id'>) => string
  moveObject: (id: string, pos: [number, number]) => void
  rotateObject: (id: string, deltaRad: number) => void
  removeObject: (id: string) => void
  resetLayout: () => void
  exportJSON: () => string
  importJSON: (text: string) => string | null
}

function focusZone(z: ZoneRef) {
  const ui = useUiStore.getState()
  const [cx, cz] = zoneCenter(z.building)
  if (z.building === 'hq') ui.setHqFloor(z.floor)
  ui.focusOn([cx, floorY(z.floor), cz])
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  buildMode: false,
  zone: { building: 'hq', floor: 0 },
  objects: loadLayout(),
  placingType: null,
  selectedId: null,
  snap: true,
  wasPlaying: true,

  setBuildMode: (on) => {
    const ui = useUiStore.getState()
    if (on) {
      // Simplest honest routing safety: the whole sim pauses while editing
      // (the engine already honours `playing`), and the panel labels it.
      set({ buildMode: true, wasPlaying: ui.playing })
      ui.setPlaying(false)
      focusZone(get().zone)
    } else {
      set({ buildMode: false, placingType: null, selectedId: null })
      ui.setPlaying(get().wasPlaying)
    }
  },
  setZone: (zone) => {
    set({ zone, selectedId: null, placingType: null })
    if (get().buildMode) focusZone(zone)
  },
  setPlacing: (placingType) => set({ placingType, selectedId: null }),
  setSnap: (snap) => set({ snap }),
  select: (selectedId) => set({ selectedId }),

  addObject: (o) => {
    const id = newId()
    const objects = [...get().objects, { ...o, id }]
    set({ objects, selectedId: id, placingType: null })
    saveLayout(objects)
    return id
  },
  moveObject: (id, pos) => {
    const objects = get().objects.map((o) => (o.id === id ? { ...o, pos } : o))
    set({ objects })
    saveLayout(objects)
  },
  rotateObject: (id, deltaRad) => {
    const objects = get().objects.map((o) => (o.id === id ? { ...o, rotY: o.rotY + deltaRad } : o))
    set({ objects })
    saveLayout(objects)
  },
  removeObject: (id) => {
    const objects = get().objects.filter((o) => o.id !== id)
    set({ objects, selectedId: get().selectedId === id ? null : get().selectedId })
    saveLayout(objects)
  },
  resetLayout: () => {
    set({ objects: [], selectedId: null, placingType: null })
    saveLayout([])
  },
  exportJSON: () => JSON.stringify({ version: LAYOUT_VERSION, objects: get().objects }, null, 2),
  importJSON: (text) => {
    try {
      const parsed = JSON.parse(text) as { version?: number; objects?: unknown }
      if (parsed.version !== LAYOUT_VERSION) return `Versi layout tidak didukung (butuh v${LAYOUT_VERSION}).`
      const objects = sanitize(parsed.objects)
      set({ objects, selectedId: null, placingType: null })
      saveLayout(objects)
      return null
    } catch {
      return 'File bukan JSON layout yang valid.'
    }
  },
}))

// Dev/QA affordance (same pattern as window.__LW_PERF__): lets CDP probes
// read editor state instead of guessing from pixels.
declare global {
  interface Window {
    __LW_EDITOR__?: typeof useEditorStore & { placementValid: typeof placementValid; zoneSpec: typeof zoneSpec }
  }
}
if (typeof window !== 'undefined') {
  window.__LW_EDITOR__ = Object.assign(useEditorStore, { placementValid, zoneSpec })
}
