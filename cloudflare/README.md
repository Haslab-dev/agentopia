# Cloudflare — deployment LIVE (2026-11-22)

Status: **aktif.** Agentopia berjalan di Cloudflare Stack atas keputusan
Lutfi (target diganti dari Supabase, 2026-11-21; integrasi disambungkan
dan dirilis, 2026-11-22). Persistence lokal (SQLite di orchestrator)
tetap menjadi mode dev; cloud memakai D1 dengan skema yang sama.

## Yang berjalan

| Lapisan | Realisasi |
|---|---|
| Web (`apps/web`) | Pages project `agentopia` → https://agentopia.pages.dev — build dengan `VITE_ORCHESTRATOR_URL=https://agentopia-orchestrator.hasdev.workers.dev` |
| Orchestrator | Worker `agentopia-orchestrator` → https://agentopia-orchestrator.hasdev.workers.dev; semua trafik diteruskan ke satu Durable Object (`OrchestratorDO`, instance "main") yang memegang engine + event stream — konfigurasi di `wrangler.toml` folder ini |
| Database | D1 `agentopia-db` (binding `agentopia_db`), migrasi `d1/migrations/` 0001–0003 sudah diterapkan; `D1Repository` terimplementasi penuh di `apps/orchestrator/src/db/d1-repository.ts` |
| Artefak (dokumen hasil run/meeting) | Isi dokumen di tabel D1 `artifact_contents` (migrasi 0003); metadata tetap di tabel `artifacts`. (R2 yang disebut di rencana awal tidak dipakai — satu tabel menghapus satu binding + bucket untuk beberapa KB markdown per artefak.) |
| Auth | JWT HS256 di dalam Worker (`apps/orchestrator/src/auth.ts`): `POST /auth/login` → token 24 jam; semua endpoint selain `/health` dan `/auth/login` wajib Bearer. **Bukan** Cloudflare Access — keputusan Lutfi 2026-11-22; tidak ada custom domain dan tidak ada perubahan zone. |

## Secrets (Worker) — keadaan saat rilis

| Secret | Keadaan |
|---|---|
| `AUTH_USERNAME` | Terpasang (produksi) |
| `JWT_SECRET` | Terpasang (produksi; nilai acak, tidak perlu diketahui siapa pun) |
| `AUTH_PASSWORD` | **Belum diset — satu-satunya langkah yang tersisa untuk Lutfi** (lihat di bawah). Selama kosong, login menjawab 503 `auth not configured` (fail-closed) dan endpoint terlindungi 401 |
| `KENARI_API_KEY` | Belum diset — task cloud gagal jujur dengan "KENARI_API_KEY not configured" sampai diset |

Memasang `AUTH_PASSWORD` (dan nanti `KENARI_API_KEY`) — dua jalur:

1. CLI lewat wrapper connector:
   `python3 ~/workspace/custom-connectors/custom.cloudflare/bin/run-wrangler.py --account-id 06ea3b1955007373e68a8d3489fd5781 -- secret put AUTH_PASSWORD -c cloudflare/wrangler.toml`
   (dijalankan dari root repo; wrangler akan meminta nilainya secara interaktif)
2. Dashboard Cloudflare: Workers & Pages → `agentopia-orchestrator` →
   Settings → Variables and Secrets → Add → Secret → nama `AUTH_PASSWORD`,
   nilai = password pilihan sendiri → Deploy.

## Verifikasi rilis (2026-11-22, bukti bukan klaim)

- `/health` publik membalas `repository: "d1"`, 10 agent (seed cloud).
- Uji login dengan password buangan: password salah → 401, username
  salah → 401, login benar → JWT membuka endpoint terlindungi, token
  dimanipulasi → 401. Agent + task `cloud-smoke-test` dibuat lewat
  Worker dan barisnya ditemukan langsung di D1 (run `failed` dengan
  error kunci Kenari belum terpasang — jujur, bukan sukses palsu);
  semua baris uji dihapus sesudahnya dan secret buangan dicabut.
- Web live di https://agentopia.pages.dev (HTTP 200, judul benar,
  bundle memuat URL Worker).
- Mode lokal diregresi setelah refactor: `/health` + `/agents` 200
  tanpa auth, `/auth/login` 404 lokal — perilaku lokal tidak berubah.

## Catatan model eksekusi

Worker tidak punya timer persisten: request yang bisa mengantre kerja
menendang `TaskEngine.pump()`, dan alarm Durable Object menjadi drain
cadangan. Bila DO terevict di tengah run, kelanjutan run ikut mati;
cold start berikutnya menandai baris yang menggantung sebagai `failed`
(`recoverInterruptedRuns`) — semantik yang sama jujurnya dengan restart
proses lokal, tidak pernah sukses diam-diam. Satu task LLM end-to-end
lewat cloud belum teruji karena `KENARI_API_KEY` belum terpasang sebagai
secret (jalur amannya tidak melewati agen mana pun).
