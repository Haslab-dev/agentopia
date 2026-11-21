import { useEffect, useRef, useState } from 'react'
import {
  Download, Hammer, Magnet, PauseCircle, RotateCcw, RotateCw, Trash2, TriangleAlert, Upload, X,
} from 'lucide-react'
import {
  BUILDING_LABEL, CATALOG, FLOORS_OF, useEditorStore,
  type EditorBuilding,
} from '../state/editor'
import { useUiStore } from '../state/stores'

const glass = 'bg-white/78 shadow-[0_8px_30px_rgba(60,50,30,0.13)] backdrop-blur-md border border-white/60'
const panelPos = 'pointer-events-auto absolute left-[4.5rem] top-20 z-30 max-h-[calc(100vh-11rem)] w-[19rem] overflow-y-auto rounded-2xl p-4 sm:left-52'

const ROT_STEP = Math.PI / 12 // 15°

// Phase 6 — Build Mode panel. Entering Build Mode pauses the simulation
// (labelled below and in the store); leaving restores the previous state.
export function BuildPanel() {
  const setBuildMode = useEditorStore((s) => s.setBuildMode)
  const zone = useEditorStore((s) => s.zone)
  const setZone = useEditorStore((s) => s.setZone)
  const objects = useEditorStore((s) => s.objects)
  const placingType = useEditorStore((s) => s.placingType)
  const setPlacing = useEditorStore((s) => s.setPlacing)
  const selectedId = useEditorStore((s) => s.selectedId)
  const snap = useEditorStore((s) => s.snap)
  const setSnap = useEditorStore((s) => s.setSnap)
  const setView = useUiStore((s) => s.setView)
  const fileRef = useRef<HTMLInputElement>(null)
  const [importMsg, setImportMsg] = useState<string | null>(null)

  // Open Build Mode on mount, close (and resume the sim) on unmount.
  useEffect(() => {
    setBuildMode(true)
    return () => setBuildMode(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selected = objects.find((o) => o.id === selectedId) ?? null
  const inZone = objects.filter((o) => o.building === zone.building && o.floor === zone.floor)

  // Q/E rotate, Delete removes, Escape cancels — while this panel is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return
      const s = useEditorStore.getState()
      if (e.key === 'Escape') {
        if (s.placingType) s.setPlacing(null)
        else s.select(null)
      } else if (s.selectedId && (e.key === 'q' || e.key === 'Q')) {
        s.rotateObject(s.selectedId, ROT_STEP)
      } else if (s.selectedId && (e.key === 'e' || e.key === 'E')) {
        s.rotateObject(s.selectedId, -ROT_STEP)
      } else if (s.selectedId && (e.key === 'Delete' || e.key === 'Backspace')) {
        s.removeObject(s.selectedId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const doExport = () => {
    const blob = new Blob([useEditorStore.getState().exportJSON()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'living-world-layout.json'
    a.click()
    URL.revokeObjectURL(url)
  }
  const doImport = async (f: File) => {
    const err = useEditorStore.getState().importJSON(await f.text())
    setImportMsg(err ?? 'Layout berhasil dimuat.')
  }

  const chip = (active: boolean) =>
    `rounded-lg px-2 py-1 text-[11px] font-bold transition ${active ? 'bg-ink text-white' : 'bg-sand text-ink/70 hover:bg-sand/70'}`

  return (
    <section className={`${panelPos} ${glass}`}>
      <div className="mb-1 flex items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink"><Hammer size={16} /> Build Mode</h2>
        <span className="rounded-full bg-tang px-2 py-0.5 text-[9.5px] font-extrabold text-white">PHASE 6</span>
        <button
          onClick={() => setView('world')}
          title="Keluar dari Build Mode (simulasi dilanjutkan)"
          className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-sand text-ink/70 hover:bg-sand/70"
        >
          <X size={13} />
        </button>
      </div>

      <p className="mb-2 flex items-start gap-1.5 rounded-xl bg-amber-100 px-2.5 py-2 text-[11px] leading-snug text-amber-900">
        <PauseCircle size={13} className="mt-0.5 shrink-0" />
        <span><b>Simulasi dijeda</b> selama Build Mode — tidak ada agent yang bergerak menabrak objek yang sedang kamu edit. Menutup panel ini melanjutkan simulasi.</span>
      </p>

      {/* Zone picker */}
      <div className="mb-1 flex gap-1">
        {(Object.keys(FLOORS_OF) as EditorBuilding[]).map((b) => (
          <button key={b} className={chip(zone.building === b)} onClick={() => setZone({ building: b, floor: 0 })}>
            {BUILDING_LABEL[b]}
          </button>
        ))}
      </div>
      <div className="mb-3 flex items-center gap-1">
        <span className="mr-1 text-[11px] font-semibold text-ink/55">Lantai:</span>
        {FLOORS_OF[zone.building].map((f) => (
          <button key={f} className={chip(zone.floor === f)} onClick={() => setZone({ building: zone.building, floor: f })}>
            L{f + 1}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-ink/50">{inZone.length} objek di zona ini</span>
      </div>

      {/* Catalog */}
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink/50">Katalog — klik, lalu klik lantai</div>
      <div className="mb-3 grid grid-cols-3 gap-1.5">
        {CATALOG.map((c) => (
          <button
            key={c.type}
            onClick={() => setPlacing(placingType === c.type ? null : c.type)}
            className={`rounded-xl px-2 py-2 text-[12px] font-semibold transition ${
              placingType === c.type ? 'bg-tang text-white shadow' : 'bg-sand/80 text-ink/80 hover:bg-sand'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      {placingType && (
        <p className="-mt-1.5 mb-3 text-[11px] leading-snug text-ink/60">
          Menempatkan <b>{CATALOG.find((c) => c.type === placingType)?.label}</b>: klik area lantai yang bebas.
          Zona <span className="font-bold text-red-600">merah</span> (pintu/portal & tangga) dilarang — graf rute agent tidak boleh putus. Esc untuk batal.
        </p>
      )}

      <label className="mb-3 flex cursor-pointer items-center gap-2 text-[12px] font-semibold text-ink/80">
        <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} className="accent-[#2f2a24]" />
        <Magnet size={13} /> Snap ke grid 0,5 m
      </label>

      {/* Selection controls */}
      {selected ? (
        <div className="mb-3 rounded-xl bg-sand/70 p-3">
          <div className="mb-2 text-[12.5px] font-bold text-ink">
            {CATALOG.find((c) => c.type === selected.type)?.label}
            <span className="ml-2 font-mono text-[11px] font-medium text-ink/55">
              ({selected.pos[0].toFixed(1)}, {selected.pos[1].toFixed(1)}) · {Math.round(((selected.rotY * 180) / Math.PI) % 360)}°
            </span>
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => useEditorStore.getState().rotateObject(selected.id, ROT_STEP)} className="flex items-center gap-1 rounded-lg bg-white px-2 py-1.5 text-[11px] font-bold text-ink/80 hover:bg-white/70">
              <RotateCcw size={13} /> Putar
            </button>
            <button onClick={() => useEditorStore.getState().rotateObject(selected.id, -ROT_STEP)} className="flex items-center gap-1 rounded-lg bg-white px-2 py-1.5 text-[11px] font-bold text-ink/80 hover:bg-white/70">
              <RotateCw size={13} /> Putar
            </button>
            <button onClick={() => useEditorStore.getState().removeObject(selected.id)} className="ml-auto flex items-center gap-1 rounded-lg bg-red-500 px-2 py-1.5 text-[11px] font-bold text-white hover:bg-red-400">
              <Trash2 size={13} /> Hapus
            </button>
          </div>
          <p className="mt-2 text-[11px] text-ink/55">Seret objek untuk menggeser · Q/E juga memutar.</p>
        </div>
      ) : (
        <p className="mb-3 text-[11px] leading-snug text-ink/55">
          Klik objek tambahan di lantai untuk memilihnya, lalu seret / putar / hapus.
        </p>
      )}

      {/* Layout persistence */}
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-ink/50">Layout — {objects.length} objek total</div>
      <div className="mb-2 flex gap-1.5">
        <button onClick={doExport} className="flex items-center gap-1 rounded-lg bg-ink px-2 py-1.5 text-[11px] font-bold text-white hover:bg-ink/85">
          <Download size={13} /> Export JSON
        </button>
        <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1 rounded-lg bg-ink px-2 py-1.5 text-[11px] font-bold text-white hover:bg-ink/85">
          <Upload size={13} /> Import JSON
        </button>
        <input
          ref={fileRef} type="file" accept="application/json,.json" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = '' }}
        />
        <button
          onClick={() => { if (window.confirm('Hapus semua objek tambahan dan kembali ke layout bawaan?')) useEditorStore.getState().resetLayout() }}
          className="ml-auto flex items-center gap-1 rounded-lg bg-sand px-2 py-1.5 text-[11px] font-bold text-ink/75 hover:bg-sand/70"
        >
          <RotateCcw size={13} /> Reset
        </button>
      </div>
      {importMsg && <p className="mb-2 text-[11px] font-medium text-ink/70">{importMsg}</p>}
      <p className="mb-3 text-[11px] leading-snug text-ink/55">
        Layout tersimpan otomatis di <b>localStorage</b> browser ini dan dimuat lagi saat start.
      </p>

      <p className="flex items-start gap-1.5 rounded-xl bg-sand/70 px-2.5 py-2 text-[11px] leading-snug text-ink/65">
        <TriangleAlert size={13} className="mt-0.5 shrink-0" />
        <span>
          Furnitur <b>bawaan</b> ruangan tidak bisa dipilih/dihapus — hanya objek tambahan editor.
          Objek editor bersifat <b>dekoratif</b>: agent tidak menghindarinya dan routing tidak berubah.
          Berbagi layout antar pengguna lewat server: <b>Integration Required</b> — butuh project Supabase Lutfi (penyimpanan per akun belum ada).
        </span>
      </p>
    </section>
  )
}
