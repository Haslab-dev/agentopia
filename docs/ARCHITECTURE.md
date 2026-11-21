# ARCHITECTURE — AI Agent Living World 3D

Dokumen arsitektur induk. Ditulis oleh @Wang (Innovator), diimplementasikan oleh @Jack.
Prinsip yang tidak bisa ditawar: **backend adalah sumber kebenaran; dunia 3D hanyalah representasi visualnya.** Avatar tidak pernah "mengaku" menyelesaikan pekerjaan yang backend gagalkan.

---

## 1. Arsitektur Teknis Keseluruhan

### 1.1 Lapisan sistem

```
┌─────────────────────────────────────────────────────────────┐
│ BROWSER (tidak ada secret, tidak ada panggilan LLM langsung)│
│  React + Vite + TS                                          │
│  ├─ World Engine (Three.js / R3F / drei) — render & gerak   │
│  ├─ Simulation Engine — jam virtual, jadwal, leisure        │
│  ├─ UI Layer (Tailwind, panel, HUD) — Zustand UI store      │
│  └─ Agent Client — REST + WebSocket ke orchestrator         │
└──────────────┬──────────────────────────────┬───────────────┘
               │ REST (perintah, CRUD)        │ WS/SSE (event stream)
┌──────────────▼──────────────────────────────▼───────────────┐
│ ORCHESTRATOR (Node.js + TypeScript, server-side only)       │
│  ├─ Task Engine — queue persisten, subtask, dependency,     │
│  │   retry-safe (idempotency key per aksi), cancel/pause    │
│  ├─ Agent Runner — reasoning loop, tool calling, handoff,   │
│  │   approval gate sebelum aksi eksternal/berisiko          │
│  ├─ LLM Adapter Layer — satu interface, banyak provider     │
│  ├─ Tool Executor — permission check, timeout, sandbox,     │
│  │   audit log per tool_call                                │
│  └─ Event Bus — setiap perubahan status dipancarkan sbg     │
│      event bertipe (lihat 1.3)                              │
├─────────────────────────────────────────────────────────────┤
│ SUPABASE                                                    │
│  Postgres (data + RLS per org) · Auth · Realtime (status    │
│  ringan) · Storage (artefak)                                │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Adapter LLM modular

Satu interface `LLMProvider` untuk semua provider; provider baru = satu file adapter, bukan refactor.

- Method inti: `chat(messages, tools, opts) → stream of {text_delta | tool_call | usage | error}`.
- Provider Fase 3: OpenAI, Gemini, Anthropic, + endpoint OpenAI-compatible generik (base URL + key).
- API key **hanya** hidup di orchestrator (terenkripsi di `provider_connections`), tidak pernah dikirim ke browser, tidak pernah masuk log.
- Setiap panggilan menghasilkan `usage_records` (token in/out, cost, latency) → ini bahan bakar panel Analytics dan budget guard.
- Budget guard: agent dengan `cost_limit` terlampaui → run di-pause otomatis + event `agent.budget_exceeded`, bukan diam-diam lanjut.

### 1.3 Event bus: status → animasi (jembatan dunia nyata ↔ dunia 3D)

Kontrak satu arah dan eksplisit. Backend memancarkan event; Simulation/World Engine menerjemahkannya menjadi perilaku avatar. Tidak ada jalur sebaliknya — animasi tidak pernah menulis status pekerjaan.

| Event backend | Perilaku avatar |
|---|---|
| `task.assigned` | Jalan ke meja kerja yang ditugaskan |
| `task.started` | Duduk, animasi typing |
| `run.thinking` | Animasi thinking (pause typing, indikator) |
| `tool.started` / `tool.finished` | Animasi interaksi komputer |
| `run.waiting_input` | Idle menunggu + badge "?" |
| `task.collaboration` | Peserta jalan ke meeting room, duduk |
| `meeting.speaking` (per agent) | Animasi talking pada pembicara aktif |
| `task.completed` | Animasi celebrate + notifikasi + artefak muncul di panel |
| `task.failed` | Indikator error di atas avatar + entri log |
| `agent.offline` | Pulang ke apartemen / tidur |
| *(tidak ada event; jadwal kosong)* | Simulation Engine menjalankan leisure terjadwal |

Transport: WebSocket dari orchestrator (event pekerjaan, presisi tinggi) + Supabase Realtime untuk status entitas ringan (CRUD dari klien lain). Klien menggabungkan keduanya ke satu `EventStore` Zustand; World Engine hanya membaca store itu — tidak tahu-menahu soal jaringan.

### 1.4 Demo mode vs Live mode — terpisah secara struktural, bukan flag kosmetik

- **Live mode**: semua status berasal dari orchestrator + DB. Tidak ada data yang di-hardcode.
- **Demo mode**: sebuah `DemoDriver` di sisi **orchestrator** (bukan di browser) memutar skenario scripted yang memancarkan event dengan format identik ke event bus. UI menampilkan badge `DEMO` permanen di top bar. Karena driver-nya duduk di jalur event yang sama, demo mode tidak pernah mencemari kode jalur live — dan tidak bisa "tidak sengaja" terlihat seperti pekerjaan nyata.
- Mode disimpan per-world di `world_settings.mode`; berpindah mode tidak mencampur data run (demo runs ditandai `agent_runs.is_demo = true` dan dikecualikan dari Analytics live).

---

## 2. Scene Graph Dunia

### 2.1 Hierarki

```
World (pulau/kampus, terrain, jalan, danau, cuaca, jam)
└─ District[] (kantor, research, rekreasi, sosial, hunian, luar)
   └─ Building[] (HQ, Research, Apartment, Café, Gym, ...)
      └─ Floor[] (L1..L6)
         └─ Room[] (lobby, workspace, meeting, server, ...)
            ├─ PlacedObject[] (meja, kursi, PC, tanaman — instanced bila berulang)
            ├─ NavZone (area jalan di dalam ruangan)
            └─ AnchorPoint[] (desk spot, meeting seat, leisure spot)
└─ AgentAvatar[] (saudara World, BUKAN anak Room — agent berpindah antar gedung;
   posisi logisnya ada di state, posisi visualnya di scene)
└─ PropLayer (pohon, lampu jalan, kendaraan — hampir semua instanced)
```

Keputusan penting: avatar adalah node tingkat-World. Parenting avatar ke Room akan membuat perpindahan antar lantai/gedung jadi operasi reparenting yang rapuh; cukup simpan `currentBuildingId/currentFloorId/currentRoomId` di state, dan biarkan pathfinding yang mengantarnya.

### 2.2 Floor selection & hide-roof

- Setiap `Floor` adalah satu `<group>` dengan daftar mesh atap/dinding-eksterior bertanda `occluder: true`.
- Saat lantai N dipilih: lantai > N disembunyikan total; atap + dinding depan lantai N di-fade ke opacity 0 (transisi 300 ms, bukan pop) atau di-hide sesuai setting; lantai < N tampil penuh sebagai konteks.
- Mode "All floors" hanya untuk view isometric jauh — interior tidak di-render (room contents di-unmount per lantai yang tidak aktif) demi GPU.
- Kamera interior mode mengunci target ke room terpilih; orbit dibatasi (min/max polar + distance) agar tidak menembus dinding.

### 2.3 Pathfinding

- Navmesh per lantai (grid A* di atas floor plan cukup untuk Fase 1–2; Recast-style navmesh bila layout editor Fase 6 menuntut bentuk bebas).
- Perpindahan antar lantai/gedung lewat `PortalNode` (lift/tangga/pintu) yang dirangkai menjadi satu graph global: A* dalam ruangan → portal → A* tujuan.
- Steering: arrival + separation sederhana antar agent agar tidak bertumpuk; collision terhadap furnitur ditangani navmesh (objek statis dipotong dari area jalan saat layout dimuat), bukan physics engine penuh.

### 2.4 Skala ke 100 agent — instancing & LOD

- **Furnitur & props berulang**: `InstancedMesh` per tipe (kursi, meja, PC, pohon, lampu) dengan material & geometri bersama. Target: < 150 draw calls untuk seluruh kampus statis.
- **Avatar**: geometri modular bersama (body parts dari kit yang sama), variasi lewat warna material + aksesori — bukan 100 model unik. Animasi via satu AnimationMixer per avatar aktif.
- **LOD perilaku** (lebih penting dari LOD geometri): agent dalam frustum & dekat kamera → update gerak tiap frame; agent jauh/di lantai lain → update 5 Hz, animasi disederhanakan (tanpa jari/aksesori); agent di gedung tak terlihat → tidak di-render, hanya posisi logis di state.
- Adaptive pixel ratio + quality setting Low/Medium/High/Auto; shadow hanya dari satu directional light dengan shadow map terbatas pada area kamera.

---

## 3. Struktur Folder Proyek

```
ai-agent-living-world/
├─ apps/
│  ├─ web/                      # React + Vite + TS (browser)
│  │  └─ src/
│  │     ├─ world/              # WORLD ENGINE: scene, kamera, gedung, nav, avatar renderer
│  │     ├─ simulation/         # SIMULATION ENGINE: jam virtual, jadwal, life sim, leisure
│  │     ├─ ui/                 # UI LAYER: sidebar, panel konteks, HUD, form, chart
│  │     ├─ agent-client/       # klien REST/WS ke orchestrator + EventStore
│  │     └─ state/              # Zustand stores (ui, world-view, event) — bukan DB
│  └─ orchestrator/             # Node.js + TS (server)
│     └─ src/
│        ├─ task-engine/        # queue, dependency, retry, approval gate
│        ├─ agent-runner/       # reasoning loop, handoff, meeting orchestration
│        ├─ llm/                # adapter: openai.ts, gemini.ts, anthropic.ts, compatible.ts
│        ├─ tools/              # tool executor, permission, sandbox, registry
│        ├─ events/             # event bus + WS gateway
│        └─ api/                # REST endpoints, validasi, rate limit
├─ packages/
│  ├─ shared-types/             # tipe event, DTO, skema validasi (dipakai web + orchestrator)
│  └─ world-schema/             # tipe layout dunia (building/floor/room/object) + blueprint
├─ supabase/
│  ├─ migrations/               # skema DB versi-terkontrol
│  └─ seed/                     # seed demo world + agent contoh
├─ docs/                        # dokumen ini + SETUP.md, TEST-REPORT.md, BACKLOG.md
├─ .env.example                 # tanpa secret asli, selalu
└─ package.json                 # workspace root
```

Aturan batas modul: `world/` tidak import dari `agent-client/` (hanya dari `state/`); `simulation/` boleh membaca event store tapi tidak memanggil jaringan; `ui/` tidak menyentuh Three.js langsung. Pelanggaran batas ini = bug arsitektur, bukan gaya.

---

## 4. Struktur Database (PostgreSQL via Supabase)

Kolom kunci saja. Semua tabel multi-tenant membawa `org_id` dan dilindungi RLS per org. Semua tabel punya `id uuid PK`, `created_at`, `updated_at` kecuali disebut lain.

**Identitas & dunia**
- `users` — id (= auth user), email, display_name.
- `organizations` — id, name, owner_id → users.
- `worlds` — id, org_id, name, template, settings_id.
- `world_settings` — world_id PK, mode (`live|demo`), sim_speed, schedule_mode, weather, quality_default.
- `buildings` — id, world_id, district, name, kind, pos_x/pos_z, rotation.
- `floors` — id, building_id, level, name.
- `rooms` — id, floor_id, name, kind, bounds (polygon/rect).
- `placed_objects` — id, room_id, object_type, transform (pos/rot/scale), material_variant, is_anchor, anchor_kind (`desk|meeting_seat|leisure`).

**Agent**
- `teams` — id, org_id, name, lead_agent_id.
- `agent_profiles` — id, org_id, team_id, name, role, personality, avatar_config (jsonb: wajah/rambut/outfit/aksesori), home_room_id, desk_object_id → placed_objects, is_active.
- `agent_configs` — agent_id PK, provider_connection_id, model, system_prompt, allowed_task_kinds, token_limit, cost_limit, schedule (jsonb).
- `agent_positions` — agent_id PK, building_id, floor_id, room_id, pos, current_activity, updated_at (di-throttle write-nya; ini cache visual, bukan sumber kebenaran pekerjaan).
- `agent_schedules` — id, agent_id, day_pattern, blocks (jsonb: jam → aktivitas).
- `provider_connections` — id, org_id, provider, base_url, encrypted_api_key, status. **Tidak pernah terekspos ke klien selain nama + status.**

**Pekerjaan**
- `tasks` — id, org_id, title, description, kind, priority, status (`queued|assigned|running|waiting_input|waiting_approval|completed|failed|cancelled|paused`), assignee_agent_id, parent_task_id, deadline, created_by.
- `subtasks` — id, task_id, title, status, assignee_agent_id, order_index. (Sengaja tabel terpisah dari tasks: subtask tidak punya dependency graph sendiri.)
- `task_dependencies` — task_id, depends_on_task_id (PK gabungan).
- `task_events` — id, task_id, event_type, payload (jsonb), created_at. Append-only; inilah yang diterjemahkan menjadi animasi.
- `agent_runs` — id, task_id, agent_id, provider, model, status, started_at, ended_at, error, is_demo.
- `tool_calls` — id, run_id, tool_name, args (jsonb, tersanitasi), result_status, duration_ms, requires_approval, approval_id.
- `approvals` — id, org_id, task_id/run_id, action_summary, status (`pending|approved|rejected`), decided_by, decided_at.
- `artifacts` — id, task_id, run_id, kind (`doc|code|image|report`), title, storage_path (Supabase Storage), created_by_agent_id.
- `knowledge_sources` — id, org_id, name, kind (`file|url|note`), storage_path/content_ref, access_scope.

**Kolaborasi & audit**
- `meetings` — id, org_id, topic, goal, room_id (ruang 3D), status, scheduled_at, minutes_artifact_id.
- `meeting_messages` — id, meeting_id, agent_id (nullable = user), content, created_at. Ini transkrip asli dari model, bukan karangan UI.
- `usage_records` — id, agent_id, run_id, provider, model, tokens_in, tokens_out, cost_usd, latency_ms, created_at.
- `activity_logs` — id, org_id, actor (`user|agent|system`), action, entity_ref, detail (jsonb), created_at. Append-only, fondasi audit trail.

Relasi inti: `organizations 1—n worlds 1—n buildings 1—n floors 1—n rooms 1—n placed_objects`; `agent_profiles n—1 teams`, `1—1 agent_configs`, `1—1 agent_positions`; `tasks 1—n subtasks/task_events/agent_runs`, `tasks n—n tasks via task_dependencies`; `agent_runs 1—n tool_calls`; `meetings 1—n meeting_messages`.

---

## 5. Aset 3D Prosedural — Fase 1

Semua aset Fase 1 **prosedural** (Three.js geometry + material PBR sederhana), nol file GLB eksternal. Alasannya: lisensi bersih, ukuran bundle kecil, dan setiap objek bisa diparameterisasi untuk Build Mode nanti.

**Gedung HQ — 1 lantai interior detail** (lantai lain menyusul Fase 2)
- Shell: dinding modular (panel lurus + sudut membulat), jendela kaca transparan, pintu, atap yang bisa di-fade.
- Ruangan: lobby + reception desk, open workspace (grid meja), ruang meeting (meja + 6 kursi + layar), ruang manager, focus pod ×2, pantry mini.
- Kit furnitur prosedural (satu fungsi pembangun per tipe, dipakai ulang via instancing): meja, kursi kantor, monitor + PC, sofa, rak, tanaman pot, lampu gantung, whiteboard, reception counter.
- Anchor points: 10 desk spot, 6 meeting seat — dipakai pathfinding & penugasan meja agent.

**Lingkungan luar**
- Terrain pulau (plane dengan tepi melengkung), rumput, jalan + trotoar mengelilingi HQ, plaza + air mancur sederhana, danau kecil, jembatan pendek.
- Vegetasi: pohon (2 varian prosedural: batang + kanopi), semak, bunga — semua instanced.
- Props: lampu jalan, bangku taman, parkir + 3 mobil prosedural sederhana, gerbang + pagar.
- Lighting: directional sun + hemisphere ambient, langit gradient, siklus siang dasar (jam virtual menggerakkan sudut matahari).

**Avatar (10 agent contoh)**
- Kit modular: tubuh (capsule-based), kepala, rambut (3 gaya), outfit berwarna per departemen, aksesori opsional (kacamata, topi).
- Rig sederhana berbasis bone kelompok (badan, kepala, lengan, kaki) cukup untuk set animasi Fase 1: idle, walk, sit, typing, thinking, celebrate. Animasi prosedural (keyframe di kode) — AnimationMixer tetap dipakai agar transisi halus dan kompatibel dengan GLB di fase berikutnya.
- Nameplate + status bubble di atas kepala (sprite), warna status mengikuti event bus.

**Strategi aset fase berikutnya**: Fase 2 memperbanyak ruangan/gedung dari kit yang sama (bukan aset baru per ruangan); Fase 5 menambah set animasi leisure (swim, eat, sleep, sport) pada rig yang sama; GLB eksternal hanya masuk bila ada kebutuhan spesifik (mis. peralatan gym) dan wajib lisensi CC0/CC-BY + dicatat di `docs/ASSET-LICENSES.md`. Tidak ada aset berbayar di fase mana pun tanpa keputusan eksplisit Lutfi.

---

## 6. Roadmap 7 Fase — dengan kriteria selesai yang bisa diuji

**Fase 1 — Core 3D World**
Selesai bila: build + typecheck lulus; scene kampus + HQ 1 lantai detail termuat; 10 avatar berjalan dari spawn ke desk anchor via pathfinding tanpa menembus furnitur; kamera orbit/zoom/isometric/top-down berfungsi; klik avatar membuka panel agent (data lokal state); jam virtual berjalan dan menggerakkan matahari; screenshot 1280px & 390px tanpa overflow UI. *(Belum ada backend — status agent masih dari state lokal dan WAJIB dilabeli sebagai demo lokal di UI.)*

**Fase 2 — World Expansion**
Selesai bila: HQ 4 lantai dengan floor selection + fade atap terverifikasi per lantai; gedung research, area rekreasi (kolam beranimasi air, lapangan bola mini), area sosial (café), apartemen dengan kamar per agent; agent bisa berpindah gedung/lantai lewat portal tanpa teleport visual; jumlah draw calls kampus statis < 150 (diukur, bukan dikira).

**Fase 3 — Agent Engine**
Selesai bila: user bisa registrasi/login (Supabase Auth); membuat agent lewat form dan tersimpan di DB (bukan localStorage); menghubungkan 1 provider dengan key terenkripsi; memberi 1 tugas nyata → agent run di orchestrator → artefak (dokumen) tersimpan di Storage dan bisa dibuka; tool tanpa izin tampil `Integration Required`; run yang gagal tampil `failed` dengan log — tidak ada jalur kode yang menandai gagal sebagai sukses; RLS teruji: user A tidak bisa membaca data org B (test otomatis).

**Fase 4 — Real-Time Visual Connection**
Selesai bila: seluruh pemetaan event→animasi di tabel 1.3 bekerja dari event live (bukan scripted); meeting 3 agent berjalan lewat orchestrator, transkrip asli tampil, notulen + action items ter-generate sebagai artefak; latency event→animasi < 1 detik di jaringan lokal (diukur dari timestamp event vs frame animasi mulai).

**Fase 5 — Life Simulation**
Selesai bila: jadwal harian (datang–kerja–makan–olahraga–pulang–tidur) berjalan di 4 mode (Realistic/Fast/Always Working/Custom); kolam, gym, café punya animasi leisure masing-masing; simulasi berjalan 1 jam virtual tanpa agent tersangkut (watchdog mendeteksi agent diam > 5 menit virtual di luar status idle sah dan melaporkannya); nol panggilan LLM terpicu oleh aktivitas leisure (dibuktikan dari usage_records).

**Fase 6 — World Editor**
Selesai bila: user bisa menambah ruangan, memindah furnitur (grid snap + collision check), ganti material, simpan layout ke DB dan memuatnya kembali identik di sesi baru; undo/redo ≥ 20 langkah; setelah layout diubah, validasi navigasi otomatis menjalankan agent uji ke semua anchor — anchor tak terjangkau ditandai merah sebelum layout disimpan permanen.

**Fase 7 — Performance, Security, QA**
Selesai bila: test report jujur (PASS/FAIL/NOT TESTED per fitur) terbit; benchmark agent bertingkat 3/10/40/80/100 diukur FPS + memori di laptop kelas menengah dan angkanya dilaporkan apa adanya; uji failure (API down, timeout, budget habis, retry, cancel) lulus tanpa duplikasi aksi; audit keamanan: tidak ada secret di bundle klien (scan otomatis), approval gate tidak bisa dilewati dari klien, rate limit aktif di API.

---

## 7. Taruhan Utama @Wang

**Taruhan: event contract dulu, dunia belakangan.** Keputusan paling menentukan di proyek ini bukan pilihan Three.js vs Babylon, bukan gaya visual — melainkan mendefinisikan **skema event pekerjaan (`task_events` + tabel pemetaan 1.3) sebagai kontrak beku sejak Fase 1**, dan membangun Fase 1 dengan avatar yang digerakkan oleh event stream *scripted* yang formatnya persis sama dengan event live Fase 4. Backend nanti tinggal "menyambungkan kabel" ke bus yang sudah ada; tidak ada rewrite lapisan animasi.

Kenapa ini taruhan, bukan keputusan aman: risikonya nyata — kalau skema event ternyata kurang ekspresif (mis. perlu event kolaborasi multi-agent yang kompleks), kontrak beku ini jadi utang. Tapi taruhan sebaliknya jauh lebih mahal dan itu yang membunuh proyek sejenis: tim membangun dunia 3D cantik dengan state ad-hoc, lalu saat backend nyata datang, seluruh lapisan perilaku avatar dibongkar. Bottleneck proyek ini — seperti pelajaran Scale AI — bukan di model atau render-nya, melainkan di **data dan kontrak antar sistem**.

**Uji rasa ≤ 30 hari (kriteria bunuh/lolos yang eksplisit):**
Di akhir Fase 1, jalankan satu skenario scripted penuh (task assigned → jalan ke meja → thinking → typing → meeting 3 agent → completed + celebrate) hanya dari event stream. Lalu ganti sumber event dari script ke satu panggilan LLM nyata lewat adapter paling sederhana (satu provider, satu tugas "tulis dokumen singkat") **tanpa mengubah satu baris pun di `world/` dan `simulation/`**. Jika pergantian sumber itu menyentuh kode di luar `agent-client/` dan orchestrator → kontrak gagal, hentikan ekspansi dunia, perbaiki kontrak dulu sebelum Fase 2. Jika lolos → kontrak terbukti, Fase 2–7 tinggal eksekusi.

Satu kalimat versi dapur: *kita tidak sedang membangun game yang ditempeli AI; kita membangun sistem agent yang kebetulan punya tubuh 3D — dan tubuh itu hanya berguna kalau kabel sarafnya (event bus) benar sejak hari pertama.*
