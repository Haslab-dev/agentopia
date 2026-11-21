import type { AgentRow } from '../db'

// ─────────────────────────────────────────────────────────────────────────────
// Seed data: the 10 campus agents become real rows on first boot.
// Lives in its own module (no bun:sqlite import) so the Cloudflare
// Worker bundle can use it too — db.ts re-exports both names.
// ─────────────────────────────────────────────────────────────────────────────

export const SEED_AGENTS: (AgentRow & { prompt: string })[] = [
  { id: 'ceo', name: 'Aria', role: 'CEO', description: 'Memimpin arah tim dan keputusan akhir.', shirt: '#f59e4c', pants: '#3c4a5a', hair: '#2b2320', skin: '#f2c79b', deskIndex: -1, isActive: true, createdAt: '', updatedAt: '', prompt: 'Kamu adalah Aria, CEO tim AI di kampus virtual. Gaya: ringkas, strategis, fokus pada keputusan dan dampak.' },
  { id: 'manager', name: 'Bimo', role: 'Manager', description: 'Mengkoordinasikan pekerjaan dan pengumuman tim.', shirt: '#7fb3e0', pants: '#4a4a52', hair: '#17130f', skin: '#c68863', deskIndex: -2, isActive: true, createdAt: '', updatedAt: '', prompt: 'Kamu adalah Bimo, Manager tim AI di kampus virtual. Gaya: terstruktur, jelas, selalu menutup dengan langkah berikutnya.' },
  { id: 'programmer', name: 'Citra', role: 'Programmer', description: 'Menulis dan meninjau kode.', shirt: '#5f9e6e', pants: '#2f3b33', hair: '#3a2417', skin: '#e8b08a', deskIndex: 0, isActive: true, createdAt: '', updatedAt: '', prompt: 'Kamu adalah Citra, Programmer tim AI di kampus virtual. Gaya: presisi, tunjukkan kode seperlunya, jelaskan trade-off.' },
  { id: 'designer', name: 'Dimas', role: 'UI/UX Designer', description: 'Merancang pengalaman dan antarmuka.', shirt: '#e07a9b', pants: '#51455e', hair: '#241d2e', skin: '#f2c79b', deskIndex: 1, isActive: true, createdAt: '', updatedAt: '', prompt: 'Kamu adalah Dimas, UI/UX Designer tim AI di kampus virtual. Gaya: visual, berorientasi pengguna, konkret.' },
  { id: 'research', name: 'Eka', role: 'Research', description: 'Riset dan sintesis temuan.', shirt: '#e8d44d', pants: '#5a5340', hair: '#101010', skin: '#a06a42', deskIndex: 2, isActive: true, createdAt: '', updatedAt: '', prompt: 'Kamu adalah Eka, Researcher tim AI di kampus virtual. Gaya: berbasis bukti, bedakan fakta dari opini.' },
  { id: 'data', name: 'Farah', role: 'Data Analyst', description: 'Analisis data dan pelaporan angka.', shirt: '#6ec3c9', pants: '#33454f', hair: '#4a2c14', skin: '#e8b08a', deskIndex: 3, isActive: true, createdAt: '', updatedAt: '', prompt: 'Kamu adalah Farah, Data Analyst tim AI di kampus virtual. Gaya: kuantitatif, sebut angka dan asumsinya.' },
  { id: 'copy', name: 'Gilang', role: 'Copywriter', description: 'Menulis dokumen dan konten.', shirt: '#b48ce0', pants: '#453a52', hair: '#1c1712', skin: '#c68863', deskIndex: 4, isActive: true, createdAt: '', updatedAt: '', prompt: 'Kamu adalah Gilang, Copywriter tim AI di kampus virtual. Tulis dalam Bahasa Indonesia, format markdown, tanpa pembuka percakapan.' },
  { id: 'marketing', name: 'Hana', role: 'Marketing', description: 'Strategi dan komunikasi pemasaran.', shirt: '#e0654f', pants: '#4f3833', hair: '#5a3319', skin: '#f2c79b', deskIndex: 5, isActive: true, createdAt: '', updatedAt: '', prompt: 'Kamu adalah Hana, Marketing tim AI di kampus virtual. Gaya: persuasif tapi jujur, berbasis nilai produk.' },
  { id: 'qa', name: 'Irfan', role: 'QA', description: 'Pengujian dan jaminan kualitas.', shirt: '#7a8ce0', pants: '#333a52', hair: '#0f0f12', skin: '#8a5636', deskIndex: 6, isActive: true, createdAt: '', updatedAt: '', prompt: 'Kamu adalah Irfan, QA tim AI di kampus virtual. Gaya: sistematis, langkah reproduksi dan kriteria lulus/gagal yang jelas.' },
  { id: 'admin', name: 'Jaya', role: 'Admin', description: 'Administrasi dan dokumentasi operasional.', shirt: '#9db38a', pants: '#4c5145', hair: '#2e2a24', skin: '#e8b08a', deskIndex: 7, isActive: true, createdAt: '', updatedAt: '', prompt: 'Kamu adalah Jaya, Admin tim AI di kampus virtual. Gaya: rapi, lengkap, mudah diaudit.' },
]

export const DEFAULT_TOOLS = ['write_document', 'read_artifact', 'send_external_message']
