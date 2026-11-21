// ─────────────────────────────────────────────────────────────────────────────
// JWT (HS256) auth for the cloud Worker — Lutfi's decision (2026-11-22),
// replacing the earlier Cloudflare Access plan: no custom domain, no zone
// changes; the Worker guards itself.
//
// Design:
//  - POST /auth/login checks username/password against the Worker secrets
//    AUTH_USERNAME / AUTH_PASSWORD and, on success, issues an HS256 JWT
//    signed with the JWT_SECRET secret (sub = username, exp = 24 h).
//  - Signing/verification uses WebCrypto only — no new dependency.
//  - Fail-closed: when any of the three secrets is unset, login answers
//    503 "auth not configured" and protected endpoints stay 401. Nobody
//    can log in until Lutfi sets the production secrets himself.
//  - Secret values never appear in code, logs, or responses.
// ─────────────────────────────────────────────────────────────────────────────

const encoder = new TextEncoder()

function b64urlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ])
}

export interface JwtClaims {
  sub: string
  iat: number
  exp: number
}

export async function signJwt(username: string, secret: string, nowMs: number): Promise<string> {
  const header = b64urlEncode(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const iat = Math.floor(nowMs / 1000)
  const payload = b64urlEncode(
    encoder.encode(JSON.stringify({ sub: username, iat, exp: iat + 24 * 60 * 60 } satisfies JwtClaims)),
  )
  const signingInput = `${header}.${payload}`
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(signingInput))
  return `${signingInput}.${b64urlEncode(new Uint8Array(signature))}`
}

/** Returns the claims when the token is well-formed, correctly signed, and unexpired; otherwise null. */
export async function verifyJwt(token: string, secret: string, nowMs: number): Promise<JwtClaims | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, payload, signature] = parts
  let sigBytes: Uint8Array
  try {
    sigBytes = b64urlDecode(signature)
  } catch {
    return null
  }
  const ok = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    sigBytes as BufferSource,
    encoder.encode(`${header}.${payload}`),
  )
  if (!ok) return null
  try {
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(payload))) as JwtClaims
    if (typeof claims.sub !== 'string' || typeof claims.exp !== 'number') return null
    if (claims.exp * 1000 <= nowMs) return null
    return claims
  } catch {
    return null
  }
}

/** Length-checked string comparison that does not short-circuit on content. */
export function secretsEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export interface AuthConfig {
  username?: string
  password?: string
  jwtSecret?: string
}

export function authConfigured(auth: AuthConfig): boolean {
  return Boolean(auth.username && auth.password && auth.jwtSecret)
}
