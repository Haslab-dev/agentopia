import type { Repository } from '../db'

// ─────────────────────────────────────────────────────────────────────────────
// AsyncRepository — the Repository interface, mirrored asynchronously.
//
// db.ts's `Repository` is synchronous because bun:sqlite is synchronous,
// and it stays exactly as it is: SqliteRepository implements it and local
// (Bun) mode is untouched. Cloudflare D1 is reachable only through async
// calls, so the Worker runtime needs the same surface with Promise
// returns. This mapped type derives that surface from the sync interface
// — same method names, same parameters, same result shapes — so the two
// can never drift apart silently: change one, the other follows.
//
// The engines (engine.ts, meetings.ts) and the HTTP router (app.ts) are
// written against AsyncRepository. Local mode adapts its sync repository
// with toAsyncRepository(); the Worker uses D1Repository directly.
// ─────────────────────────────────────────────────────────────────────────────

export type AsyncRepository = {
  [K in keyof Repository]: (
    ...args: Parameters<Repository[K]>
  ) => Promise<Awaited<ReturnType<Repository[K]>>>
}

/**
 * Wrap a synchronous Repository so it satisfies AsyncRepository. Each
 * method runs synchronously and its result is returned as a resolved
 * promise — semantics identical to calling the sync repository directly.
 */
export function toAsyncRepository(repo: Repository): AsyncRepository {
  return new Proxy(repo, {
    get(target, prop) {
      const value = Reflect.get(target, prop)
      if (typeof value !== 'function') return value
      return (...args: unknown[]) =>
        Promise.resolve((value as (...a: unknown[]) => unknown).apply(target, args))
    },
  }) as unknown as AsyncRepository
}
