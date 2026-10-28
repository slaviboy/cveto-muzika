import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { liveData } from '../state/liveData'
import { useAppStore } from '../state/useAppStore'

/**
 * Runs `callback` on every animation frame with the shared live data, without React renders.
 * Use it to write meter widths / text straight into DOM refs.
 */
export function useLiveFrame(callback: (data: typeof liveData) => void, active = true) {
  const cb = useRef(callback)
  useLayoutEffect(() => {
    cb.current = callback
  })
  useEffect(() => {
    if (!active) return
    let raf = 0
    const tick = () => {
      cb.current(liveData)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active])
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', notify)
      return () => mql.removeEventListener('change', notify)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Desktop layout: wide enough for the sidebar and a fine pointer, or simply wide. */
export function useIsDesktop() {
  return useMediaQuery('(min-width: 900px)')
}

export function useFullscreen() {
  const supported = typeof document !== 'undefined' && !!document.fullscreenEnabled
  const [isFullscreen, setIsFullscreen] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement)
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const toggle = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
    } catch {
      // Fullscreen can be refused (iframe policy, iOS); the button simply has no effect.
    }
  }
  return { supported, isFullscreen, toggle }
}

/** Hides the chrome after a period without pointer / keyboard activity while audio is running. */
export function useIdleHide(enabled: boolean, delayMs = 3500) {
  const setUi = useAppStore((s) => s.setUi)
  useEffect(() => {
    if (!enabled) {
      setUi({ uiHidden: false })
      return
    }
    let timer = setTimeout(() => setUi({ uiHidden: true }), delayMs)
    const wake = () => {
      if (useAppStore.getState().ui.uiHidden) setUi({ uiHidden: false })
      clearTimeout(timer)
      timer = setTimeout(() => setUi({ uiHidden: true }), delayMs)
    }
    const events = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    events.forEach((e) => window.addEventListener(e, wake, { passive: true }))
    return () => {
      clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, wake))
    }
  }, [enabled, delayMs, setUi])
}

/** Mirrors prefers-reduced-motion into the store. */
export function useSystemReducedMotion() {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)')
  const setSystem = useAppStore((s) => s.setSystem)
  useEffect(() => setSystem({ reducedMotionSystem: reduced }), [reduced, setSystem])
}

export function isReducedMotion(): boolean {
  const s = useAppStore.getState()
  const pref = s.settings.performance.reducedMotion
  return pref === 'on' || (pref === 'system' && s.system.reducedMotionSystem)
}

/** Keeps the screen awake while the visualizer is listening (Screen Wake Lock API). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }
    if (!active || !nav.wakeLock) return
    let lock: { release(): Promise<void> } | null = null
    let cancelled = false
    const acquire = async () => {
      try {
        lock = await nav.wakeLock!.request('screen')
        if (cancelled) void lock.release()
      } catch {
        // Denied or unsupported in this context.
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire()
    }
    void acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release()
    }
  }, [active])
}
