import { Tooltip } from 'radix-ui'
import { useEffect } from 'react'
import { StartOverlay } from '../components/audio/StartOverlay'
import { FloatingChannelEditor } from '../components/settings/sections/ChannelsSection'
import { SettingsPanel } from '../components/settings/SettingsPanel'
import { PerfHud, ShortcutsDialog, SystemNotices, Toasts } from '../components/visualizer/Overlays'
import { Toolbar } from '../components/visualizer/Toolbar'
import { VisualizerCanvas } from '../components/visualizer/VisualizerCanvas'
import { useFullscreen, useIdleHide, useSystemReducedMotion, useWakeLock } from '../hooks'
import { useAppStore } from '../state/useAppStore'
import { wireEngine } from './engine'
import { useKeyboardShortcuts } from './shortcuts'

export function App() {
  const status = useAppStore((s) => s.audio.status)
  const settingsOpen = useAppStore((s) => s.ui.settingsOpen)
  const floating = useAppStore((s) => s.ui.floatingEditor)
  const shortcutsOpen = useAppStore((s) => s.ui.shortcutsOpen)
  const uiHidden = useAppStore((s) => s.ui.uiHidden)
  const setUi = useAppStore((s) => s.setUi)
  const running = status === 'live' || status === 'demo'
  const fullscreen = useFullscreen()

  useEffect(() => wireEngine(), [])
  useEffect(() => {
    if (running) setUi({ startedOnce: true })
  }, [running, setUi])
  useSystemReducedMotion()
  useWakeLock(running)
  useIdleHide(running && !settingsOpen && !floating && !shortcutsOpen)
  useKeyboardShortcuts(fullscreen.toggle)

  return (
    <Tooltip.Provider delayDuration={350} skipDelayDuration={150}>
      <main className={`relative h-full w-full overflow-hidden ${uiHidden ? 'cursor-none' : ''}`} aria-label="Aurora music visualizer">
        <VisualizerCanvas />
        <StartOverlay />
        <Toolbar />
        <SettingsPanel />
        <FloatingChannelEditor />
        <PerfHud />
        <SystemNotices />
        <Toasts />
        <ShortcutsDialog />
      </main>
    </Tooltip.Provider>
  )
}
