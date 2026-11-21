// Mutable per-agent visual runtime. Written by simulation/, read by world/
// (avatar renderer) every frame. Deliberately NOT React state: positions
// change at frame rate and must never trigger re-renders. Logical status
// (the source of truth for the UI) lives in the Zustand world store.

export type Pose =
  | 'stand' | 'walk' | 'sit' | 'typing' | 'thinking'
  | 'talking' | 'celebrate' | 'error' | 'sleep'

/** Where an avatar logically is (scene-graph §2.1: avatars are World-level;
    building/floor live here, in state — never as scene parenting). */
export type BuildingId = 'outdoor' | 'hq' | 'research' | 'apartment'

export interface AgentRuntime {
  pos: [number, number] // x, z in world space
  /** Current visual height — interpolated along stair portal segments. */
  y: number
  /** Floor level index of the segment currently being walked / occupied. */
  floor: number
  building: BuildingId
  heading: number // radians, facing direction
  pose: Pose
  /** 0..1 phase accumulator for procedural limb swings. */
  phase: number
  moving: boolean
  /** Floating badge above the head: '?' waiting, '!' error, 'Z' sleeping. */
  badge: string | null
  /** Phase 5: simulated small-talk bubble text (generic, labelled
      "simulasi" by the renderer). NEVER a real agent utterance — live
      speech only ever comes from server meeting transcripts. */
  chat: string | null
}

const runtimes = new Map<string, AgentRuntime>()

export function initRuntime(id: string, pos: [number, number]) {
  runtimes.set(id, {
    pos: [...pos], y: 0, floor: 0, building: 'outdoor',
    heading: 0, pose: 'stand', phase: 0, moving: false, badge: null, chat: null,
  })
}

export function getRuntime(id: string): AgentRuntime | undefined {
  return runtimes.get(id)
}

export function allRuntimes(): Map<string, AgentRuntime> {
  return runtimes
}
