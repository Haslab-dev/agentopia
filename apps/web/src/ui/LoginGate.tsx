import { useState } from 'react'
import { KeyRound, LogOut } from 'lucide-react'
import { useServerStore } from '../agent-client/ServerApi'
import { connectLive, disconnectLive } from '../agent-client/LiveClient'

// ─────────────────────────────────────────────────────────────────────────────
// LoginGate — the cloud JWT login (2026-11-22). The cloud Worker guards
// every API endpoint except /health with a Bearer JWT; when the API
// answers 401 (no token, or an expired/invalid one) the store raises
// `authRequired` and this gate shows a plain username/password form.
// The token lives in localStorage (ServerApi) and every API call carries
// it; the SSE stream reconnects with it after login. Local mode never
// raises authRequired, so this component renders nothing there — except
// the logout chip while a token exists.
// ─────────────────────────────────────────────────────────────────────────────

export function LoginGate() {
  const authRequired = useServerStore((s) => s.authRequired)
  const authToken = useServerStore((s) => s.authToken)
  const login = useServerStore((s) => s.login)
  const logout = useServerStore((s) => s.logout)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!authRequired) {
    if (!authToken) return null
    return (
      <button
        onClick={() => {
          disconnectLive()
          logout()
        }}
        className="pointer-events-auto absolute right-3 top-14 z-50 flex items-center gap-1.5 rounded-full bg-ink/80 px-3 py-1.5 text-[11px] font-semibold text-white shadow-lg backdrop-blur-sm transition hover:bg-ink"
        title="Hapus token login dari browser ini"
      >
        <LogOut size={12} /> Keluar
      </button>
    )
  }

  return (
    <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
      <form
        className="w-full max-w-xs rounded-2xl bg-white/95 p-5 shadow-2xl"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          setError(null)
          const r = await login(username.trim(), password)
          setBusy(false)
          if (r.ok) {
            disconnectLive()
            connectLive()
          } else {
            setError(
              r.error === 'auth not configured'
                ? 'Login belum dikonfigurasi di server (AUTH_PASSWORD belum diset pemilik).'
                : (r.error ?? 'Login gagal.'),
            )
          }
        }}
      >
        <div className="mb-1 flex items-center gap-2 text-ink">
          <KeyRound size={16} />
          <h2 className="text-sm font-bold">Login — Agentopia Cloud</h2>
        </div>
        <p className="mb-3 text-[11.5px] leading-snug text-ink/60">
          API cloud memerlukan login. Mode demo tetap berjalan di belakang gerbang ini.
        </p>
        <label className="mb-2 block">
          <span className="mb-0.5 block text-[11px] font-semibold text-ink/70">Username</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            className="w-full rounded-lg border border-ink/15 bg-white px-2.5 py-2 text-sm text-ink outline-none focus:border-ink/40"
          />
        </label>
        <label className="mb-3 block">
          <span className="mb-0.5 block text-[11px] font-semibold text-ink/70">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full rounded-lg border border-ink/15 bg-white px-2.5 py-2 text-sm text-ink outline-none focus:border-ink/40"
          />
        </label>
        {error && (
          <p className="mb-3 rounded-lg bg-red-50 px-2.5 py-2 text-[11.5px] leading-snug text-red-800">{error}</p>
        )}
        <button
          type="submit"
          disabled={busy || !username.trim() || !password}
          className="w-full rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white transition enabled:hover:bg-ink/85 disabled:opacity-40"
        >
          {busy ? 'Memeriksa…' : 'Masuk'}
        </button>
      </form>
    </div>
  )
}
