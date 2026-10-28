/**
 * Generative demo track synthesised with the Web Audio API (118 BPM, A minor). Its output feeds
 * the same AnalyserNode as the microphone, so demo visuals come from real FFT data.
 * Uses a look-ahead scheduler: a 25 ms timer schedules notes ~120 ms ahead on the audio clock.
 */
const BPM = 118
const LOOKAHEAD = 0.12
const TICK_MS = 25

// Chord per bar: Am9, Fmaj7, Cadd9, G6 — MIDI notes.
const PROGRESSION = [
  { root: 45, pad: [57, 60, 64, 67, 71] },
  { root: 41, pad: [53, 57, 60, 64, 69] },
  { root: 48, pad: [55, 60, 62, 64, 67] },
  { root: 43, pad: [55, 59, 62, 64, 67] },
]
const ARP_PATTERNS = [
  [0, 2, 4, 2, 1, 3, 4, 3, 0, 2, 4, 2, 1, 3, 4, 3],
  [4, 3, 2, 0, 4, 3, 1, 0, 4, 2, 3, 1, 4, 2, 3, 0],
]
const LEAD = [76, -1, 74, 72, -1, 72, 71, -1, 69, -1, 67, 69, -1, 71, -1, -1]

const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

export class DemoSynth {
  readonly output: GainNode
  private bus: GainNode
  private echo: DelayNode
  private echoFeedback: GainNode
  private echoTone: BiquadFilterNode
  private noise: AudioBuffer
  private timer: ReturnType<typeof setInterval> | null = null
  private nextTime = 0
  private step = 0
  private readonly stepDur = 60 / BPM / 4
  private nodes = new Set<AudioScheduledSourceNode>()
  private ctx: AudioContext

  constructor(ctx: AudioContext) {
    this.ctx = ctx
    this.output = ctx.createGain()
    this.output.gain.value = 0.9
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.ratio.value = 3.5
    comp.attack.value = 0.004
    comp.release.value = 0.18
    this.bus = ctx.createGain()
    this.bus.gain.value = 0.8
    this.bus.connect(comp)
    comp.connect(this.output)

    // Dotted-eighth echo for the arpeggio and lead.
    this.echo = ctx.createDelay(1)
    this.echo.delayTime.value = this.stepDur * 3
    this.echoFeedback = ctx.createGain()
    this.echoFeedback.gain.value = 0.36
    this.echoTone = ctx.createBiquadFilter()
    this.echoTone.type = 'lowpass'
    this.echoTone.frequency.value = 3200
    this.echo.connect(this.echoTone)
    this.echoTone.connect(this.echoFeedback)
    this.echoFeedback.connect(this.echo)
    this.echoTone.connect(this.bus)

    const length = ctx.sampleRate
    this.noise = ctx.createBuffer(1, length, ctx.sampleRate)
    const data = this.noise.getChannelData(0)
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  }

  start() {
    if (this.timer) return
    this.step = 0
    this.nextTime = this.ctx.currentTime + 0.08
    this.timer = setInterval(() => this.schedule(), TICK_MS)
    this.schedule()
  }

  stop() {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    const now = this.ctx.currentTime
    for (const node of this.nodes) {
      try {
        node.stop(now + 0.02)
      } catch {
        // already stopped
      }
    }
    this.nodes.clear()
  }

  dispose() {
    this.stop()
    for (const n of [this.output, this.bus, this.echo, this.echoFeedback, this.echoTone]) n.disconnect()
  }

  private schedule() {
    while (this.nextTime < this.ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.nextTime)
      this.nextTime += this.stepDur
      this.step++
    }
  }

  private playStep(step: number, t: number) {
    const s = step % 16
    const bar = Math.floor(step / 16)
    const section = Math.floor(bar / 4) % 8
    const chord = PROGRESSION[bar % 4]
    const full = section >= 2 && section !== 4 && section !== 7
    const swing = s % 2 === 1 ? this.stepDur * 0.08 : 0
    const time = t + swing

    if (s === 0) this.pad(time, chord.pad, this.stepDur * 16, section === 4 ? 0.07 : 0.05)
    if (section !== 4 || bar % 2 === 0) {
      const pattern = ARP_PATTERNS[Math.floor(bar / 8) % 2]
      const note = chord.pad[pattern[s] % chord.pad.length] + 12
      if (section !== 0 || s % 2 === 0) this.pluck(time, note, s % 4 === 0 ? 0.12 : 0.08)
    }
    if (section >= 1 && section !== 4) {
      if (s % 2 === 0) this.hat(time, s % 4 === 2 ? 0.16 : 0.08, false)
      if (s % 4 === 2 && full) this.hat(time + 0.001, 0.07, true)
      if (s === 2 || s === 6 || s === 10 || s === 14 || (s === 15 && bar % 2 === 1)) {
        this.bass(time, chord.root + (s === 6 || s === 14 ? 12 : 0), this.stepDur * 1.6)
      }
    }
    if (full && s % 4 === 0) this.kick(time, s === 0 ? 1 : 0.9)
    if (full && section !== 2 && (s === 4 || s === 12)) this.clap(time)
    if (section === 7 && s % 8 === 0) this.kick(time, 0.6)
    if (section === 5 && LEAD[s] > 0) this.lead(time, LEAD[s], this.stepDur * 1.8)
    if (section === 4 && s === 0 && bar % 4 === 0) this.riser(time, this.stepDur * 64)
  }

  private track(node: AudioScheduledSourceNode, chain: AudioNode[]) {
    this.nodes.add(node)
    node.onended = () => {
      this.nodes.delete(node)
      node.disconnect()
      for (const n of chain) n.disconnect()
    }
  }

  private envelope(gain: AudioParam, t: number, peak: number, attack: number, decay: number) {
    gain.setValueAtTime(0.0001, t)
    gain.exponentialRampToValueAtTime(peak, t + attack)
    gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  }

  private kick(t: number, vel: number) {
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(150, t)
    osc.frequency.exponentialRampToValueAtTime(44, t + 0.12)
    this.envelope(g.gain, t, 1.0 * vel, 0.003, 0.42)
    osc.connect(g).connect(this.bus)
    osc.start(t)
    osc.stop(t + 0.5)
    this.track(osc, [g])
  }

  private noiseHit(t: number, type: BiquadFilterType, freq: number, q: number, peak: number, decay: number, dest: AudioNode = this.bus) {
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const filter = ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = freq
    filter.Q.value = q
    const g = ctx.createGain()
    this.envelope(g.gain, t, peak, 0.002, decay)
    src.connect(filter).connect(g).connect(dest)
    src.start(t, Math.random() * 0.5)
    src.stop(t + decay + 0.05)
    this.track(src, [filter, g])
  }

  private hat(t: number, vel: number, open: boolean) {
    this.noiseHit(t, 'highpass', open ? 7000 : 8500, 0.7, vel, open ? 0.22 : 0.045)
  }

  private clap(t: number) {
    for (let i = 0; i < 3; i++) this.noiseHit(t + i * 0.011, 'bandpass', 1400, 0.9, 0.32, i === 2 ? 0.2 : 0.03)
  }

  private bass(t: number, midi: number, dur: number) {
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    const sub = ctx.createOscillator()
    const filter = ctx.createBiquadFilter()
    const g = ctx.createGain()
    osc.type = 'sawtooth'
    sub.type = 'sine'
    osc.frequency.value = midiToHz(midi)
    sub.frequency.value = midiToHz(midi - 12)
    filter.type = 'lowpass'
    filter.Q.value = 6
    filter.frequency.setValueAtTime(1100, t)
    filter.frequency.exponentialRampToValueAtTime(180, t + dur)
    this.envelope(g.gain, t, 0.32, 0.006, dur)
    osc.connect(filter)
    sub.connect(filter)
    filter.connect(g).connect(this.bus)
    for (const o of [osc, sub]) {
      o.start(t)
      o.stop(t + dur + 0.05)
    }
    this.track(osc, [filter, g])
    this.track(sub, [])
  }

  private pad(t: number, notes: number[], dur: number, level: number) {
    const ctx = this.ctx
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(700, t)
    filter.frequency.linearRampToValueAtTime(2400, t + dur * 0.5)
    filter.frequency.linearRampToValueAtTime(900, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(level, t + 0.8)
    g.gain.setValueAtTime(level, t + dur - 0.2)
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.2)
    filter.connect(g).connect(this.bus)
    const oscs: OscillatorNode[] = []
    for (const n of notes) {
      for (const detune of [-8, 7]) {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = midiToHz(n)
        o.detune.value = detune
        o.connect(filter)
        o.start(t)
        o.stop(t + dur + 1.3)
        oscs.push(o)
      }
    }
    oscs.forEach((o, i) => this.track(o, i === 0 ? [filter, g] : []))
  }

  private pluck(t: number, midi: number, vel: number) {
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    const filter = ctx.createBiquadFilter()
    const g = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = midiToHz(midi)
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(6000, t)
    filter.frequency.exponentialRampToValueAtTime(900, t + 0.2)
    this.envelope(g.gain, t, vel, 0.004, 0.22)
    osc.connect(filter).connect(g)
    g.connect(this.bus)
    g.connect(this.echo)
    osc.start(t)
    osc.stop(t + 0.3)
    this.track(osc, [filter, g])
  }

  private lead(t: number, midi: number, dur: number) {
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    const vib = ctx.createOscillator()
    const vibGain = ctx.createGain()
    const filter = ctx.createBiquadFilter()
    const g = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = midiToHz(midi)
    vib.frequency.value = 5.5
    vibGain.gain.value = 6
    vib.connect(vibGain).connect(osc.detune)
    filter.type = 'lowpass'
    filter.frequency.value = 2600
    this.envelope(g.gain, t, 0.07, 0.02, dur)
    osc.connect(filter).connect(g)
    g.connect(this.bus)
    g.connect(this.echo)
    for (const o of [osc, vib]) {
      o.start(t)
      o.stop(t + dur + 0.05)
    }
    this.track(osc, [filter, g])
    this.track(vib, [vibGain])
  }

  private riser(t: number, dur: number) {
    const ctx = this.ctx
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.Q.value = 4
    filter.frequency.setValueAtTime(300, t)
    filter.frequency.exponentialRampToValueAtTime(7000, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.12, t + dur * 0.95)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(filter).connect(g).connect(this.bus)
    src.start(t)
    src.stop(t + dur + 0.05)
    this.track(src, [filter, g])
  }
}
