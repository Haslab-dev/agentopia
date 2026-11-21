import { useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { Scene } from './world/Scene'
import { Sidebar, Ticker, Toolbar, TopBar } from './ui/chrome'
import { ActivityPanel, AgentsPanel, BuildingsPanel, ContextPanel, MeetingsPanel, SettingsPanel, TasksPanel } from './ui/panels'
import { BuildPanel } from './ui/BuildPanel'
import { LoginGate } from './ui/LoginGate'
import { useUiStore, type ViewKey } from './state/stores'
import { startSimulation } from './simulation/engine'
import { connectLive } from './agent-client/LiveClient'
import { startServerSync } from './agent-client/ServerApi'

const params = new URLSearchParams(window.location.search)

export default function App() {
  const view = useUiStore((s) => s.view)

  useEffect(() => {
    // Dev/QA affordances via URL params (also used by screenshot checks):
    // ?floor=0..3|all — HQ floor selection · ?speed=1|2|4 · ?focus=x,z
    const ui = useUiStore.getState()
    const floor = params.get('floor')
    if (floor === 'all') ui.setHqFloor('all')
    else if (floor !== null && /^[0-3]$/.test(floor)) ui.setHqFloor(Number(floor))
    const speed = params.get('speed')
    if (speed === '2' || speed === '4') ui.setSpeed(Number(speed) as 2 | 4)
    const focus = params.get('focus')
    if (focus) {
      const [fx, fz] = focus.split(',').map(Number)
      if (Number.isFinite(fx) && Number.isFinite(fz)) ui.focusOn([fx, 0, fz])
    }
    const view = params.get('view')
    if (view && ['world', 'agents', 'tasks', 'meetings', 'buildings', 'build', 'activity', 'settings'].includes(view)) {
      ui.setView(view as ViewKey)
    }
    startSimulation()
    connectLive() // §7 proof channel: no-op if the orchestrator is offline; demo keeps running
    startServerSync() // Phase 3: mirror server truth (agents/tasks/approvals/usage) into the UI
  }, [])

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#bfd9e8] font-sans">
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ position: [42, 37, 42], fov: 42, near: 0.5, far: 500 }}
        onPointerMissed={() => useUiStore.getState().selectAgent(null)}
      >
        <Scene noAgents={params.has('noagents')} />
      </Canvas>
      {params.has('perf') && (
        <div id="perf-overlay" className="absolute bottom-20 left-3 z-40 rounded-lg bg-black/70 px-2.5 py-1.5 font-mono text-[11px] text-emerald-200">
          perf…
        </div>
      )}

      <div className="pointer-events-none absolute inset-0">
        <TopBar />
        <Sidebar />
        {view === 'agents' && <AgentsPanel />}
        {view === 'tasks' && <TasksPanel />}
        {view === 'buildings' && <BuildingsPanel />}
        {view === 'build' && <BuildPanel />}
        {view === 'meetings' && <MeetingsPanel />}
        {view === 'activity' && <ActivityPanel />}
        {view === 'settings' && <SettingsPanel />}
        <ContextPanel />
        <Toolbar />
        <Ticker />
        <LoginGate />
      </div>
    </div>
  )
}
