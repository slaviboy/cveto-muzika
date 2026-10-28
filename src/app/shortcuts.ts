import { useEffect } from 'react'
import { VISUALIZATION_MODES } from '../state/settingsSchema'
import { useAppStore } from '../state/useAppStore'
import { startDemo, stopAudio, toggleAudio } from './engine'

export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Space', action: 'Start or stop the microphone' },
  { keys: 'D', action: 'Play or stop the demo track' },
  { keys: '1 – 4', action: 'Switch visualization mode' },
  { keys: 'S', action: 'Show or hide settings' },
  { keys: 'F', action: 'Toggle fullscreen' },
  { keys: 'H', action: 'Hide the interface' },
  { keys: '?', action: 'Show keyboard shortcuts' },
  { keys: 'Esc', action: 'Close panels' },
]

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable || el.getAttribute('role') === 'slider'
}

export function useKeyboardShortcuts(toggleFullscreen: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return
      const state = useAppStore.getState()
      const key = e.key.toLowerCase()
      if (key === ' ' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault()
        void toggleAudio()
      } else if (key === 'd') {
        if (state.audio.status === 'demo') void stopAudio()
        else void startDemo()
      } else if (key >= '1' && key <= '4') {
        state.setMode(VISUALIZATION_MODES[Number(key) - 1])
      } else if (key === 's') {
        state.setUi({ settingsOpen: !state.ui.settingsOpen })
      } else if (key === 'f') {
        toggleFullscreen()
      } else if (key === 'h') {
        state.setUi({ uiHidden: !state.ui.uiHidden })
      } else if (e.key === '?') {
        state.setUi({ shortcutsOpen: true })
      } else if (e.key === 'Escape') {
        if (state.ui.shortcutsOpen) state.setUi({ shortcutsOpen: false })
        else if (state.ui.floatingEditor) state.setUi({ floatingEditor: false })
        else if (state.ui.settingsOpen) state.setUi({ settingsOpen: false })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleFullscreen])
}
