import type { WorkEvent, WorkEventInput } from '@living-world/shared-types'

// The single event bus for work events (ARCHITECTURE.md §1.3).
// Producers: DemoDriver today, the live orchestrator's WS client in Phase 4.
// Consumers: simulation/ (translates events into avatar behaviour) and the UI
// activity feed. world/ never touches this module directly.

type Listener = (e: WorkEvent) => void

let seq = 0
const listeners = new Set<Listener>()
const recent: WorkEvent[] = []

export function emitWorkEvent(input: WorkEventInput): WorkEvent {
  const event: WorkEvent = { ...input, seq: ++seq }
  recent.push(event)
  if (recent.length > 200) recent.shift()
  listeners.forEach((fn) => fn(event))
  return event
}

export function onWorkEvent(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function recentEvents(): WorkEvent[] {
  return recent
}
