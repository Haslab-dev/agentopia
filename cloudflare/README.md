# Cloudflare — target deploy (Integration Required)

Status: **rencana, belum diaktifkan.** Tidak ada resource Cloudflare yang
dibuat untuk proyek ini. Persistence yang berjalan hari ini adalah SQLite
lokal di orchestrator (`apps/orchestrator/data/living-world.db`).

Keputusan 2026-11-21 (Lutfi): target cloud diganti dari Supabase ke
Cloudflare Stack — seluruh proyek Lutfi yang lain sudah berjalan di
Cloudflare, dan D1 berdialek SQLite sehingga skema yang sudah berjalan
pindah tanpa lapisan terjemahan.

## Peta target

| Lapisan | Target Cloudflare |
|---|---|
| Web (`apps/web`) | Pages — build statis yang sama seperti sekarang |
| Orchestrator | Worker; koordinasi real-time (event stream, giliran meeting) di Durable Objects |
| Database | D1 lewat binding `DB` — migrasi di `d1/migrations/` |
| Artefak (dokumen hasil run/meeting) | R2; metadata tetap di tabel `artifacts` D1 |
| Auth | Cloudflare Access di depan Worker — menutup catatan "API tanpa auth" dari Fase 7 |

## Langkah aktivasi (nanti — belum dilakukan)

1. Buat database: `wrangler d1 create agentopia`.
2. Terapkan migrasi: `wrangler d1 migrations apply agentopia --remote`
   (membaca `d1/migrations/` di folder ini).
3. Port orchestrator ke runtime Worker; implementasikan `D1Repository`
   (stub di `apps/orchestrator/src/db/d1-repository.ts`) di atas binding
   `env.DB` — interface `Repository`-nya sama persis dengan SQLite lokal.
4. Bind D1 + R2 di `wrangler.toml`; letakkan Cloudflare Access di depan
   endpoint orchestrator sebelum port-nya diekspos ke jaringan mana pun.
5. Uji isolasi per-org di lapisan Worker (pengganti uji RLS di desain
   lama) sebelum data nyata masuk.

Sampai langkah-langkah itu dikerjakan, semua jalur cloud berlabel
**Integration Required** — tidak ada kode yang berpura-pura terhubung.
