import type { WorkEventType } from '@living-world/shared-types'

// ─────────────────────────────────────────────────────────────────────────────
// SSE event bus (extracted from the §7 proof server, unchanged semantics).
// Every work-status change leaves the orchestrator as one of the frozen
// §1.3 contract events with source: 'live'. The browser re-emits them onto
// its internal bus; world/ and simulation/ cannot tell who produced them.
// ─────────────────────────────────────────────────────────────────────────────

export type EmitFn = (
  type: WorkEventType,
  agentId: string,
  taskId: string,
  payload?: Record<string, string | number | boolean>,
) => void

const clients = new Set<ReadableStreamDefaultController<Uint8Array>>()
const encoder = new TextEncoder()
let eventSeq = 0

export function broadcast(data: unknown) {
  const frame = encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
  for (const c of clients) {
    try {
      c.enqueue(frame)
    } catch {
      clients.delete(c)
    }
  }
}

export const emit: EmitFn = (type, agentId, taskId, payload) => {
  const event = { type, agentId, taskId, source: 'live' as const, payload, wallTime: new Date().toISOString() }
  console.log(`[event ${++eventSeq}] ${type} agent=${agentId} task=${taskId}`)
  broadcast(event)
}

/** A non-contract control frame (e.g. approval decided) for UI refreshes. */
export function broadcastControl(kind: string, data: Record<string, unknown>) {
  broadcast({ type: 'control', kind, ...data })
}

export function eventsResponse(model: string): Response {
  let controller: ReadableStreamDefaultController<Uint8Array>
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
      clients.add(c)
      c.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'hello', model })}\n\n`))
    },
    cancel() {
      clients.delete(controller)
    },
  })
  const heartbeat = setInterval(() => {
    try {
      controller.enqueue(encoder.encode(': heartbeat\n\n'))
    } catch {
      clearInterval(heartbeat)
    }
  }, 5_000)
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  })
}
