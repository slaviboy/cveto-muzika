import { AudioEngine } from '../audio/AudioEngine'
import { AudioPipeline } from '../audio/AudioPipeline'
import { liveData } from '../state/liveData'
import { useAppStore } from '../state/useAppStore'

/** App-wide singletons: one audio engine and one analysis pipeline for the whole session. */
export const audioEngine = new AudioEngine()
export const pipeline = new AudioPipeline()

let wired = false

/**
 * Connects engine events and analyser configuration to the store. Called once at startup;
 * returns a cleanup that releases the microphone and closes the audio context.
 */
export function wireEngine(): () => void {
  if (wired) return () => {}
  wired = true
  const store = useAppStore

  const offStatus = audioEngine.subscribe((snap) => {
    store.getState().setAudio({
      status: snap.status,
      error: snap.error,
      sampleRate: snap.sampleRate,
      activeDeviceLabel: snap.deviceLabel,
    })
  })
  const offDevices = audioEngine.onDevicesChange((devices) => store.getState().setAudio({ devices }))

  const applyAudio = () => {
    const a = store.getState().settings.audio
    audioEngine.configure({
      fftSize: a.fftSize,
      smoothingTimeConstant: a.smoothingTimeConstant,
      minDecibels: a.minDecibels,
      maxDecibels: a.maxDecibels,
    })
    audioEngine.setDemoMonitor(a.demoMonitor, a.demoVolume)
  }
  applyAudio()
  const offSettings = store.subscribe((state, prev) => {
    if (state.settings.audio !== prev.settings.audio) applyAudio()
  })

  const onUnload = () => {
    void audioEngine.dispose()
  }
  window.addEventListener('pagehide', onUnload)

  if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
    ;(window as unknown as Record<string, unknown>).__AURORA_DEBUG__ = {
      getState: () => store.getState(),
      getFrame: () => liveData.frame,
      getLive: () => liveData,
      audio: audioEngine,
    }
  }

  return () => {
    offStatus()
    offDevices()
    offSettings()
    window.removeEventListener('pagehide', onUnload)
    wired = false
    void audioEngine.dispose()
  }
}

export async function startMicrophone() {
  const { settings } = useAppStore.getState()
  const ok = await audioEngine.startMicrophone(settings.audio.deviceId || undefined)
  if (ok) {
    const devices = await audioEngine.listDevices()
    useAppStore.getState().setAudio({ devices })
  }
  return ok
}

export async function startDemo() {
  const a = useAppStore.getState().settings.audio
  return audioEngine.startDemo(a.demoMonitor, a.demoVolume)
}

export async function stopAudio() {
  await audioEngine.stop()
}

export async function toggleAudio() {
  const status = useAppStore.getState().audio.status
  if (status === 'live' || status === 'demo') await stopAudio()
  else await startMicrophone()
}
