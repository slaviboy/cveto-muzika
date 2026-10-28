import type { AudioError, AudioErrorKind, AudioStatus, InputDevice } from '../types/audio'
import { DemoSynth } from './DemoSynth'

export interface AnalyserConfig {
  fftSize: number
  smoothingTimeConstant: number
  minDecibels: number
  maxDecibels: number
}

export interface EngineSnapshot {
  status: AudioStatus
  error: AudioError | null
  sampleRate: number
  deviceLabel: string
}

export interface AudioEngineDeps {
  createContext: () => AudioContext
  mediaDevices: () => MediaDevices | undefined
  isSecureContext: () => boolean
}

const defaultDeps: AudioEngineDeps = {
  createContext: () => new AudioContext({ latencyHint: 'interactive' }),
  mediaDevices: () => (typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined),
  isSecureContext: () => (typeof window !== 'undefined' ? window.isSecureContext : true),
}

/**
 * Owns the AudioContext, the AnalyserNode and the active source (microphone or demo synth).
 * The microphone is opened only from explicit user actions and is never routed to the speakers.
 * Every stop path releases the MediaStream tracks and disconnects the graph.
 */
export class AudioEngine {
  private deps: AudioEngineDeps
  private ctx: AudioContext | null = null
  analyser: AnalyserNode | null = null
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private demo: DemoSynth | null = null
  private monitor: GainNode | null = null
  private status: AudioStatus = 'idle'
  private error: AudioError | null = null
  private deviceLabel = ''
  private listeners = new Set<(s: EngineSnapshot) => void>()
  private deviceListeners = new Set<(d: InputDevice[]) => void>()
  private watchingDevices = false
  private startToken = 0
  private config: AnalyserConfig = { fftSize: 4096, smoothingTimeConstant: 0.45, minDecibels: -92, maxDecibels: -22 }

  constructor(deps: Partial<AudioEngineDeps> = {}) {
    this.deps = { ...defaultDeps, ...deps }
  }

  get sampleRate(): number {
    return this.ctx?.sampleRate ?? 48000
  }

  /** Analyser only while a source is running; null otherwise so the pipeline decays to silence. */
  get activeAnalyser(): AnalyserNode | null {
    return this.status === 'live' || this.status === 'demo' ? this.analyser : null
  }

  get snapshot(): EngineSnapshot {
    return { status: this.status, error: this.error, sampleRate: this.sampleRate, deviceLabel: this.deviceLabel }
  }

  subscribe(fn: (s: EngineSnapshot) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  onDevicesChange(fn: (d: InputDevice[]) => void): () => void {
    this.deviceListeners.add(fn)
    return () => this.deviceListeners.delete(fn)
  }

  configure(config: Partial<AnalyserConfig>) {
    this.config = { ...this.config, ...config }
    if (this.analyser) this.applyConfig(this.analyser)
  }

  async startMicrophone(deviceId?: string): Promise<boolean> {
    const token = ++this.startToken
    this.stopSources()
    const media = this.deps.mediaDevices()
    if (!media?.getUserMedia) {
      this.fail(this.deps.isSecureContext() ? 'unsupported' : 'insecure')
      return false
    }
    // Create/resume the context synchronously inside the user gesture (required by Safari).
    const ctx = this.ensureContext()
    const resumed = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve()
    this.setStatus('requesting', null)

    const audio: MediaTrackConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    }
    let stream: MediaStream
    try {
      stream = await media.getUserMedia({ audio: deviceId ? { ...audio, deviceId: { exact: deviceId } } : audio })
    } catch (err) {
      const name = (err as { name?: string })?.name
      if (deviceId && (name === 'OverconstrainedError' || name === 'NotFoundError')) {
        // The remembered device is gone; fall back to the default input.
        if (token !== this.startToken) return false
        return this.startMicrophone()
      }
      if (token !== this.startToken) return false
      this.fail(mapMediaError(err, this.deps.isSecureContext()), err)
      return false
    }
    if (token !== this.startToken) {
      stream.getTracks().forEach((t) => t.stop())
      return false
    }
    try {
      await resumed
    } catch {
      // Resume can reject when the page is hidden; analysis will start once it resumes.
    }
    this.stream = stream
    this.source = ctx.createMediaStreamSource(stream)
    this.source.connect(this.analyser!)
    const track = stream.getAudioTracks()[0]
    this.deviceLabel = track?.label ?? ''
    track?.addEventListener('ended', this.handleTrackEnded)
    this.setStatus('live', null)
    void this.listDevices()
    return true
  }

  async startDemo(monitor: boolean, volume: number): Promise<boolean> {
    ++this.startToken
    this.stopSources()
    const ctx = this.ensureContext()
    const resumed = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve()
    this.demo = new DemoSynth(ctx)
    this.demo.output.connect(this.analyser!)
    this.monitor = ctx.createGain()
    this.monitor.gain.value = monitor ? volume : 0
    this.demo.output.connect(this.monitor)
    this.monitor.connect(ctx.destination)
    try {
      await resumed
    } catch {
      // see startMicrophone
    }
    this.demo.start()
    this.deviceLabel = 'Demo track'
    this.setStatus('demo', null)
    return true
  }

  setDemoMonitor(monitor: boolean, volume: number) {
    if (this.monitor && this.ctx) this.monitor.gain.setTargetAtTime(monitor ? volume : 0, this.ctx.currentTime, 0.05)
  }

  /** Stops the current source and releases the microphone. The context is suspended, not closed. */
  async stop() {
    ++this.startToken
    this.stopSources()
    this.setStatus('idle', null)
    if (this.ctx && this.ctx.state === 'running') {
      try {
        await this.ctx.suspend()
      } catch {
        // ignore
      }
    }
  }

  /** Full teardown: releases the microphone, disconnects every node and closes the context. */
  async dispose() {
    ++this.startToken
    this.stopSources()
    this.analyser?.disconnect()
    this.analyser = null
    const ctx = this.ctx
    this.ctx = null
    if (ctx && ctx.state !== 'closed') {
      try {
        await ctx.close()
      } catch {
        // ignore
      }
    }
    this.deps.mediaDevices()?.removeEventListener?.('devicechange', this.handleDeviceChange)
    this.watchingDevices = false
    this.setStatus('idle', null)
  }

  async listDevices(): Promise<InputDevice[]> {
    const media = this.deps.mediaDevices()
    if (!media?.enumerateDevices) return []
    if (!this.watchingDevices && media.addEventListener) {
      media.addEventListener('devicechange', this.handleDeviceChange)
      this.watchingDevices = true
    }
    try {
      const devices = await media.enumerateDevices()
      const inputs = devices
        .filter((d) => d.kind === 'audioinput')
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` }))
      this.deviceListeners.forEach((fn) => fn(inputs))
      return inputs
    } catch {
      return []
    }
  }

  private handleDeviceChange = () => {
    void this.listDevices()
  }

  private handleTrackEnded = () => {
    if (this.status !== 'live') return
    this.stopSources()
    this.error = { kind: 'disconnected', message: 'The input device was disconnected.' }
    this.setStatus('idle', this.error)
  }

  private ensureContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = this.deps.createContext()
      this.analyser = this.ctx.createAnalyser()
      this.applyConfig(this.analyser)
    }
    return this.ctx
  }

  private applyConfig(analyser: AnalyserNode) {
    const c = this.config
    analyser.fftSize = c.fftSize
    analyser.smoothingTimeConstant = Math.min(0.99, Math.max(0, c.smoothingTimeConstant))
    // min must stay below max at every intermediate step or the setter throws.
    const min = Math.min(c.minDecibels, c.maxDecibels - 1)
    const max = Math.max(c.maxDecibels, min + 1)
    if (min >= analyser.maxDecibels) {
      analyser.maxDecibels = max
      analyser.minDecibels = min
    } else {
      analyser.minDecibels = min
      analyser.maxDecibels = max
    }
  }

  private stopSources() {
    if (this.demo) {
      this.demo.dispose()
      this.demo = null
    }
    if (this.monitor) {
      this.monitor.disconnect()
      this.monitor = null
    }
    if (this.source) {
      this.source.disconnect()
      this.source = null
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.removeEventListener('ended', this.handleTrackEnded)
        track.stop()
      }
      this.stream = null
    }
    this.deviceLabel = ''
  }

  private fail(kind: AudioErrorKind, cause?: unknown) {
    const detail = cause instanceof Error && cause.message ? cause.message : ''
    this.error = { kind, message: detail }
    this.setStatus('idle', this.error)
  }

  private setStatus(status: AudioStatus, error: AudioError | null) {
    this.status = status
    this.error = error
    const snap = this.snapshot
    this.listeners.forEach((fn) => fn(snap))
  }
}

export function mapMediaError(err: unknown, secure: boolean): AudioErrorKind {
  const name = (err as { name?: string })?.name ?? ''
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return secure ? 'denied' : 'insecure'
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'nodevice'
    case 'NotReadableError':
    case 'TrackStartError':
      return 'busy'
    case 'TypeError':
      return secure ? 'unsupported' : 'insecure'
    default:
      return 'unknown'
  }
}
