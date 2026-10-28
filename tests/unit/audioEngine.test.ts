import { describe, expect, it, vi } from 'vitest'
import { AudioEngine, mapMediaError } from '../../src/audio/AudioEngine'

/** Minimal Web Audio fakes. Unknown node properties become AudioParam-like objects. */
function makeParam() {
  const p = { value: 0, setValueAtTime: () => p, linearRampToValueAtTime: () => p, exponentialRampToValueAtTime: () => p, setTargetAtTime: () => p }
  return p
}

function makeNode(extra: Record<string, unknown> = {}) {
  const base: Record<string | symbol, unknown> = {
    connections: [] as unknown[],
    connect: vi.fn(function (this: { connections: unknown[] }, n: unknown) {
      this.connections.push(n)
      return n
    }),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    ...extra,
  }
  return new Proxy(base, {
    get(target, prop) {
      if (!(prop in target) && typeof prop === 'string' && prop !== 'then') target[prop] = makeParam()
      return target[prop]
    },
  })
}

class FakeContext {
  state: 'suspended' | 'running' | 'closed' = 'suspended'
  sampleRate = 44100
  currentTime = 0
  destination = makeNode()
  analyser = makeNode({ fftSize: 2048, frequencyBinCount: 1024, minDecibels: -100, maxDecibels: -30, smoothingTimeConstant: 0.8, getFloatFrequencyData: vi.fn() })
  sources: ReturnType<typeof makeNode>[] = []
  resume = vi.fn(async () => {
    this.state = 'running'
  })
  suspend = vi.fn(async () => {
    this.state = 'suspended'
  })
  close = vi.fn(async () => {
    this.state = 'closed'
  })
  createAnalyser = () => this.analyser
  createMediaStreamSource = (stream: unknown) => {
    const n = makeNode({ stream })
    this.sources.push(n)
    return n
  }
  createGain = () => makeNode()
  createDynamicsCompressor = () => makeNode()
  createDelay = () => makeNode()
  createBiquadFilter = () => makeNode()
  createOscillator = () => makeNode()
  createBufferSource = () => makeNode()
  createBuffer = (_c: number, n: number) => ({ getChannelData: () => new Float32Array(n) })
}

class FakeTrack {
  label = 'Studio mic'
  stop = vi.fn()
  private listeners = new Map<string, () => void>()
  addEventListener = (type: string, fn: () => void) => this.listeners.set(type, fn)
  removeEventListener = vi.fn((type: string) => this.listeners.delete(type))
  fire(type: string) {
    this.listeners.get(type)?.()
  }
}

class FakeStream {
  track = new FakeTrack()
  getTracks = () => [this.track]
  getAudioTracks = () => [this.track]
}

function setup(opts: { secure?: boolean; getUserMedia?: (c: MediaStreamConstraints) => Promise<unknown>; noMedia?: boolean } = {}) {
  const ctx = new FakeContext()
  const streams: FakeStream[] = []
  const getUserMedia = vi.fn(
    opts.getUserMedia ??
      (async () => {
        const s = new FakeStream()
        streams.push(s)
        return s
      }),
  )
  const media = {
    getUserMedia,
    enumerateDevices: vi.fn(async () => [
      { kind: 'audioinput', deviceId: 'a', label: 'Mic A' },
      { kind: 'videoinput', deviceId: 'v', label: 'Cam' },
    ]),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  const engine = new AudioEngine({
    createContext: () => ctx as unknown as AudioContext,
    mediaDevices: () => (opts.noMedia ? undefined : (media as unknown as MediaDevices)),
    isSecureContext: () => opts.secure ?? true,
  })
  return { engine, ctx, media, streams, getUserMedia }
}

describe('AudioEngine microphone lifecycle', () => {
  it('opens the mic with raw (unprocessed) constraints and feeds the analyser', async () => {
    const { engine, ctx, getUserMedia } = setup()
    expect(engine.activeAnalyser).toBeNull()
    expect(await engine.startMicrophone()).toBe(true)
    const constraints = getUserMedia.mock.calls[0][0] as { audio: MediaTrackConstraints }
    expect(constraints.audio).toMatchObject({ echoCancellation: false, noiseSuppression: false, autoGainControl: false })
    expect(engine.snapshot.status).toBe('live')
    expect(engine.snapshot.deviceLabel).toBe('Studio mic')
    expect(engine.activeAnalyser).toBe(ctx.analyser)
    expect(ctx.sources[0].connect).toHaveBeenCalledWith(ctx.analyser)
    // The microphone is never routed to the speakers.
    expect(ctx.sources[0].connect).not.toHaveBeenCalledWith(ctx.destination)
  })

  it('stops every track and disconnects nodes when stopped', async () => {
    const { engine, ctx, streams } = setup()
    await engine.startMicrophone()
    await engine.stop()
    expect(streams[0].track.stop).toHaveBeenCalled()
    expect(ctx.sources[0].disconnect).toHaveBeenCalled()
    expect(ctx.suspend).toHaveBeenCalled()
    expect(engine.snapshot.status).toBe('idle')
    expect(engine.activeAnalyser).toBeNull()
  })

  it('closes the audio context on dispose', async () => {
    const { engine, ctx, streams } = setup()
    await engine.startMicrophone()
    await engine.dispose()
    expect(streams[0].track.stop).toHaveBeenCalled()
    expect(ctx.close).toHaveBeenCalled()
    expect(ctx.analyser.disconnect).toHaveBeenCalled()
    expect(engine.analyser).toBeNull()
  })

  it('reports a denied permission and stays idle', async () => {
    const { engine } = setup({ getUserMedia: async () => Promise.reject(Object.assign(new Error('nope'), { name: 'NotAllowedError' })) })
    const statuses: string[] = []
    engine.subscribe((s) => statuses.push(s.status))
    expect(await engine.startMicrophone()).toBe(false)
    expect(statuses).toEqual(['requesting', 'idle'])
    expect(engine.snapshot.error?.kind).toBe('denied')
  })

  it('explains insecure contexts and missing APIs', async () => {
    expect(await setup({ noMedia: true, secure: false }).engine.startMicrophone()).toBe(false)
    const insecure = setup({ noMedia: true, secure: false })
    await insecure.engine.startMicrophone()
    expect(insecure.engine.snapshot.error?.kind).toBe('insecure')
    const unsupported = setup({ noMedia: true, secure: true })
    await unsupported.engine.startMicrophone()
    expect(unsupported.engine.snapshot.error?.kind).toBe('unsupported')
    expect(mapMediaError({ name: 'NotReadableError' }, true)).toBe('busy')
    expect(mapMediaError({ name: 'NotFoundError' }, true)).toBe('nodevice')
  })

  it('handles device disconnection by releasing the stream', async () => {
    const { engine, streams } = setup()
    await engine.startMicrophone()
    streams[0].track.fire('ended')
    expect(engine.snapshot.status).toBe('idle')
    expect(engine.snapshot.error?.kind).toBe('disconnected')
    expect(streams[0].track.stop).toHaveBeenCalled()
  })

  it('falls back to the default input when a remembered device is gone', async () => {
    let calls = 0
    const { engine } = setup({
      getUserMedia: async (c) => {
        calls++
        if ((c.audio as MediaTrackConstraints).deviceId) throw Object.assign(new Error(), { name: 'OverconstrainedError' })
        return new FakeStream()
      },
    })
    expect(await engine.startMicrophone('missing-device')).toBe(true)
    expect(calls).toBe(2)
  })

  it('releases a stream that arrives after the user already stopped', async () => {
    let resolve!: (s: FakeStream) => void
    const late = new FakeStream()
    const { engine } = setup({ getUserMedia: () => new Promise((r) => (resolve = r)) })
    const pending = engine.startMicrophone()
    await engine.stop()
    resolve(late)
    expect(await pending).toBe(false)
    expect(late.track.stop).toHaveBeenCalled()
    expect(engine.snapshot.status).toBe('idle')
  })

  it('lists only audio inputs', async () => {
    const { engine } = setup()
    expect(await engine.listDevices()).toEqual([{ deviceId: 'a', label: 'Mic A' }])
  })

  it('applies analyser configuration safely', async () => {
    const { engine, ctx } = setup()
    await engine.startMicrophone()
    engine.configure({ fftSize: 8192, minDecibels: -20, maxDecibels: -10, smoothingTimeConstant: 2 })
    expect(ctx.analyser.fftSize).toBe(8192)
    expect(ctx.analyser.smoothingTimeConstant).toBe(0.99)
    expect(ctx.analyser.minDecibels as number).toBeLessThan(ctx.analyser.maxDecibels as number)
  })
})

describe('AudioEngine demo mode', () => {
  it('plays a synthesized track through the analyser and cleans it up', async () => {
    vi.useFakeTimers()
    const { engine, ctx } = setup()
    expect(await engine.startDemo(false, 0.5)).toBe(true)
    expect(engine.snapshot.status).toBe('demo')
    expect(engine.activeAnalyser).toBe(ctx.analyser)
    // Switching to the microphone replaces the demo source.
    await engine.startMicrophone()
    expect(engine.snapshot.status).toBe('live')
    await engine.stop()
    expect(engine.snapshot.status).toBe('idle')
    vi.useRealTimers()
  })
})
