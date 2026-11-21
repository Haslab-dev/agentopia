// ─────────────────────────────────────────────────────────────────────────────
// Life-simulation needs (Phase 5, ARCHITECTURE.md §6). PURE simulation data:
// energy / focus / social are properties of the *avatar's simulated body*,
// never of the agent's real work. They are derived deterministically from
// each agent's own data (id hash) so agents differ in drain rate, break
// thresholds and leisure preference — there is no single global profile.
//
// Hard boundary: nothing in this module (or in the engine code consuming it)
// may touch work status. A "tired" agent still finishes its live task; needs
// only steer what the avatar does with its free time.
// ─────────────────────────────────────────────────────────────────────────────

export interface Needs {
  energy: number // 0..100 — restored by rest/sleep, drained by everything
  focus: number // 0..100 — drained by work, restored by breaks & walks
  social: number // 0..100 — drained by solitude, restored by company
}

export type LeisureKind = 'rest' | 'social' | 'focus'

export interface NeedsProfile {
  /** Multiplier on work drain (0.8–1.3): some agents tire faster. */
  drainMul: number
  /** Focus level at which a work-block micro-break triggers. */
  focusBreakAt: number
  /** Preference order when two needs are close: this agent's tie-break. */
  pref: LeisureKind[]
}

function hash(id: string): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967295 // 0..1
}

const PREFS: LeisureKind[][] = [
  ['social', 'rest', 'focus'],
  ['rest', 'focus', 'social'],
  ['focus', 'social', 'rest'],
  ['social', 'focus', 'rest'],
  ['focus', 'rest', 'social'],
  ['rest', 'social', 'focus'],
]

export function needsProfile(id: string): NeedsProfile {
  const h = hash(id)
  return {
    drainMul: 0.8 + h * 0.5,
    focusBreakAt: 20 + Math.floor(h * 13), // 20..32
    pref: PREFS[Math.floor(h * PREFS.length) % PREFS.length],
  }
}

/** Starting needs when the page loads — varied per agent (different nights). */
export function initialNeeds(id: string): Needs {
  const h = hash(id)
  const h2 = hash(id + ':b')
  const h3 = hash(id + ':c')
  return {
    energy: Math.round(62 + h * 30), // 62..92
    focus: Math.round(55 + h2 * 33), // 55..88
    social: Math.round(40 + h3 * 42), // 40..82
  }
}

/** The need an agent should serve first: lowest value, profile breaks ties. */
export function lowestNeed(n: Needs, p: NeedsProfile): LeisureKind {
  const entries: [LeisureKind, number][] = [
    ['rest', n.energy],
    ['focus', n.focus],
    ['social', n.social],
  ]
  entries.sort((a, b) => {
    const d = a[1] - b[1]
    if (Math.abs(d) > 6) return d
    return p.pref.indexOf(a[0]) - p.pref.indexOf(b[0])
  })
  return entries[0][0]
}

export const clampNeed = (v: number) => Math.max(0, Math.min(100, v))
