import { channelRange } from '../state/channelOps'
import type { ChannelConfig, Settings } from '../state/settingsSchema'
import { MAX_DELAY_MS } from '../state/settingsSchema'
import { AutoGain } from './AutoGain'
import { BeatDetector } from './BeatDetector'
import { DelayedSignalBuffer } from './DelayedSignalBuffer'
import { FrequencyAnalyzer, type AnalyserLike } from './FrequencyAnalyzer'
import { FrequencyMapper } from './FrequencyMapper'
import { bandEdges, nyquist } from './frequencyMath'
import { EnvelopeFollower, PeakHold, smoothingCoefficient } from './TemporalSmoother'

export const DISPLAY_BINS = 256
export const MAX_SUBBANDS = 128
/** Upper bound on delay-buffer floats per frame, keeping history memory under ~10 MB. */
const DELAY_FLOAT_BUDGET = 2048
const HISTORY_CAPACITY = 1024
const EXTRA_BANDS = 6 // bass, mid, treble, overall, beat, dominant-search

export interface AnalysisFrame {
  time: number
  dt: number
  /** True while a live or demo source feeds the analyser. */
  active: boolean
  sampleRate: number
  channelCount: number
  subbandCount: number
  /** Smoothed + delayed level per channel, 0..1. */
  level: Float32Array
  /** Final visual intensity per channel (min/max, contrast, brightness applied). May exceed 1. */
  intensity: Float32Array
  /** Delayed peak-hold per channel, 0..1. */
  peak: Float32Array
  /** Undelayed level per channel, for meters. */
  live: Float32Array
  /** Visual intensity per channel sub-band: sub[c * subbandCount + j]. */
  sub: Float32Array
  /** Strongest spectral peak inside each channel's band (Hz), NaN when silent. */
  dominantHz: Float32Array
  /** Log/linear display spectrum, 0..1. */
  spectrum: Float32Array
  bass: number
  mid: number
  treble: number
  overall: number
  beat: number
  beatCount: number
  beatStrength: number
  dominantFrequency: number
}

export interface AudioSource {
  analyser: AnalyserLike | null
  sampleRate: number
}

type Curve = ChannelConfig['curve']

export function applyCurve(x: number, curve: Curve, gamma: number): number {
  switch (curve) {
    case 'smooth':
      return x * x * (3 - 2 * x)
    case 'punchy':
      return x * x
    case 'soft':
      return Math.sqrt(x)
    case 'gamma':
      return Math.pow(x, gamma)
    default:
      return x
  }
}

/** S-curve contrast that keeps 0 → 0 and 1 → 1 (c = 1 is identity). */
export function applyContrast(v: number, contrast: number): number {
  if (contrast === 1 || v <= 0 || v >= 1) return v
  const a = Math.pow(v, contrast)
  return a / (a + Math.pow(1 - v, contrast))
}

export function visualIntensity(level: number, ch: ChannelConfig): number {
  const v = applyContrast(level, ch.contrast)
  return (ch.minIntensity + (ch.maxIntensity - ch.minIntensity) * v) * ch.brightness
}

/**
 * Real-time DSP chain:
 * analyser → power spectrum (noise suppression, median) → band energies → normalisation →
 * sensitivity / auto gain / threshold / curve → attack-release envelope → timestamped delay →
 * visual intensity. Runs inside the render loop; nothing here allocates per frame.
 */
export class AudioPipeline {
  readonly analyzer = new FrequencyAnalyzer()
  private mapper = new FrequencyMapper()
  private bandPowers = new Float32Array(0)

  private channelsRef: ChannelConfig[] | null = null
  private audioRef: Settings['audio'] | null = null
  private sampleRate = 0
  private fftSize = 0
  private requestedSubbands = 16
  private channelCount = 0
  private subbandCount = 0

  private env = new EnvelopeFollower(0)
  private subEnv = new EnvelopeFollower(0)
  private peaks = new PeakHold(0)
  private adaptiveMean = new Float32Array(0)
  private autoGain = new AutoGain(1)
  private channelGain = new AutoGain(0)
  private delays: DelayedSignalBuffer[] = []
  private vector = new Float32Array(0)
  private globalEnv = new EnvelopeFollower(4)
  private spectrumEnv = new EnvelopeFollower(DISPLAY_BINS)
  readonly beatDetector = new BeatDetector()
  private lastTime = -1
  private lastNow = 0

  readonly frame: AnalysisFrame = {
    time: 0,
    dt: 1 / 60,
    active: false,
    sampleRate: 48000,
    channelCount: 0,
    subbandCount: 0,
    level: new Float32Array(0),
    intensity: new Float32Array(0),
    peak: new Float32Array(0),
    live: new Float32Array(0),
    sub: new Float32Array(0),
    dominantHz: new Float32Array(0),
    spectrum: new Float32Array(DISPLAY_BINS),
    bass: 0,
    mid: 0,
    treble: 0,
    overall: 0,
    beat: 0,
    beatCount: 0,
    beatStrength: 0,
    dominantFrequency: NaN,
  }

  /** Visualizations request how many sub-bands per channel they need (clamped to a memory budget). */
  setSubbandCount(count: number) {
    this.requestedSubbands = Math.max(1, Math.min(MAX_SUBBANDS, Math.round(count)))
  }

  process(nowMs: number, source: AudioSource, settings: Settings): AnalysisFrame {
    const dt = this.lastTime < 0 ? 1 / 60 : Math.min(0.1, Math.max(0.0005, (nowMs - this.lastTime) / 1000))
    this.lastTime = nowMs
    this.lastNow = nowMs
    const audio = settings.audio
    const channels = settings.channels
    const sampleRate = source.sampleRate || 48000
    const fftSize = source.analyser?.fftSize ?? audio.fftSize
    this.sync(channels, audio, sampleRate, fftSize)

    const f = this.frame
    f.time = nowMs
    f.dt = dt
    f.active = source.analyser !== null
    f.sampleRate = sampleRate

    if (source.analyser) {
      this.analyzer.update(source.analyser, dt, {
        gainDb: audio.gainDb,
        tiltDbPerOctave: audio.tiltDbPerOctave,
        sampleRate,
        noiseReduction: audio.noiseReduction,
        spectralFilter: audio.spectralFilter,
      })
    } else {
      this.analyzer.ensureSize(fftSize / 2)
      this.analyzer.clear()
    }
    const power = this.analyzer.power
    this.mapper.compute(power, this.bandPowers)

    const minDb = audio.minDecibels
    const range = Math.max(1, audio.maxDecibels - minDb)
    const norm = (p: number, gainDb: number) => {
      const db = p > 1e-30 ? 10 * Math.log10(p) : -300
      const x = (db + gainDb - minDb) / range
      return x < 0 ? 0 : x > 1 ? 1 : x
    }

    const C = this.channelCount
    const K = this.subbandCount
    const globalGain = audio.autoGain === 'global' ? this.autoGain.gain(0) : 1
    const sens = audio.sensitivity
    const delayGlobal = settings.timing.globalDelayMs
    const vec = this.vector
    let maxRaw = 0

    for (let c = 0; c < C; c++) {
      const ch = channels[c]
      if (!ch.enabled) {
        f.live[c] = 0
        f.dominantHz[c] = NaN
        vec.fill(0)
        this.delays[c].push(nowMs, vec)
        this.writeChannel(c, ch, 0, null, K)
        continue
      }
      const chSens = sens * ch.sensitivity
      let raw = norm(this.bandPowers[c], ch.gainDb) * chSens
      maxRaw = Math.max(maxRaw, raw)
      let gain = globalGain
      if (audio.autoGain === 'perChannel') gain = this.channelGain.process(c, raw, dt, audio.autoGainTarget)
      raw *= gain

      let threshold = ch.threshold
      if (audio.adaptiveThreshold > 0) {
        this.adaptiveMean[c] += (raw - this.adaptiveMean[c]) * smoothingCoefficient(dt, 1500)
        threshold = Math.max(threshold, this.adaptiveMean[c] * audio.adaptiveThreshold)
      }
      const shaped = this.shape(raw, threshold, ch)
      const smoothed = this.env.process(c, shaped, ch.attackMs, ch.releaseMs, dt)
      const peak = this.peaks.process(c, smoothed, audio.peakHoldMs, audio.peakDecay, dt)
      f.live[c] = smoothed
      f.dominantHz[c] = this.mapper.dominantFrequency(c, power)

      vec[0] = smoothed
      vec[1] = peak
      const subBase = C + c * K
      for (let j = 0; j < K; j++) {
        const s = norm(this.bandPowers[subBase + j], ch.gainDb) * chSens * gain
        vec[2 + j] = this.subEnv.process(c * K + j, this.shape(s, ch.threshold, ch), ch.attackMs, ch.releaseMs, dt)
      }
      this.delays[c].push(nowMs, vec)
      this.writeChannel(c, ch, nowMs - ch.delayMs - delayGlobal, this.delays[c], K)
    }

    if (audio.autoGain === 'global') this.autoGain.process(0, maxRaw, dt, audio.autoGainTarget)

    // Global bands + display spectrum (undelayed, used by effects and the UI).
    const extra = C + C * K + DISPLAY_BINS
    const g = sens * globalGain
    f.bass = this.globalEnv.process(0, Math.min(1, norm(this.bandPowers[extra], 0) * g), 12, 220, dt)
    f.mid = this.globalEnv.process(1, Math.min(1, norm(this.bandPowers[extra + 1], 0) * g), 12, 220, dt)
    f.treble = this.globalEnv.process(2, Math.min(1, norm(this.bandPowers[extra + 2], 0) * g), 12, 220, dt)
    f.overall = this.globalEnv.process(3, Math.min(1, norm(this.bandPowers[extra + 3], 0) * g), 12, 260, dt)
    const beatLevel = Math.min(1, norm(this.bandPowers[extra + 4], 0) * g)
    this.beatDetector.process(beatLevel, nowMs, dt, audio.beatSensitivity)
    f.beat = this.beatDetector.pulse
    f.beatCount = this.beatDetector.count
    f.beatStrength = this.beatDetector.strength
    f.dominantFrequency = this.mapper.dominantFrequency(extra + 5, power, 1e-9)

    const specBase = C + C * K
    for (let i = 0; i < DISPLAY_BINS; i++) {
      f.spectrum[i] = this.spectrumEnv.process(i, Math.min(1, norm(this.bandPowers[specBase + i], 0) * g), 8, 200, dt)
    }
    return f
  }

  /**
   * Level of a channel `extraDelayMs` further in the past than its configured delay — used for
   * travelling waves (square waves, LED pulse waves). Returns visual intensity.
   */
  history(channel: number, extraDelayMs: number, settings: Settings): number {
    const buf = this.delays[channel]
    const ch = settings.channels[channel]
    if (!buf || !ch || !ch.enabled) return 0
    const t = this.lastNow - ch.delayMs - settings.timing.globalDelayMs - extraDelayMs
    return visualIntensity(buf.readScalar(t, 0), ch)
  }

  /** Timestamp (ms) of the most recent processed frame. */
  get now() {
    return this.lastNow
  }

  private shape(x: number, threshold: number, ch: ChannelConfig): number {
    if (x <= threshold) return 0
    const t = threshold >= 1 ? 0 : (x - threshold) / (1 - threshold)
    const y = applyCurve(t > 1 ? 1 : t, ch.curve, ch.curveGamma)
    return y > 1 ? 1 : y
  }

  private writeChannel(c: number, ch: ChannelConfig, readTime: number, buf: DelayedSignalBuffer | null, K: number) {
    const f = this.frame
    const vec = this.vector
    if (buf) buf.read(readTime, vec)
    else vec.fill(0)
    f.level[c] = vec[0]
    f.peak[c] = vec[1]
    f.intensity[c] = ch.enabled ? visualIntensity(vec[0], ch) : 0
    const subBase = c * K
    for (let j = 0; j < K; j++) f.sub[subBase + j] = ch.enabled ? visualIntensity(vec[2 + j], ch) : 0
  }

  /** Rebuilds band plans when ranges, FFT geometry or sub-band count change. */
  private sync(channels: ChannelConfig[], audio: Settings['audio'], sampleRate: number, fftSize: number) {
    const C = channels.length
    const budgetK = Math.max(1, Math.floor(DELAY_FLOAT_BUDGET / Math.max(1, C)) - 2)
    const K = Math.max(1, Math.min(this.requestedSubbands, budgetK))
    const structural = C !== this.channelCount || K !== this.subbandCount
    if (
      !structural &&
      channels === this.channelsRef &&
      audio === this.audioRef &&
      sampleRate === this.sampleRate &&
      fftSize === this.fftSize
    ) {
      return
    }
    const rangesChanged =
      structural ||
      sampleRate !== this.sampleRate ||
      fftSize !== this.fftSize ||
      this.rangesDiffer(channels, audio)

    this.channelsRef = channels
    this.audioRef = audio
    if (structural) this.allocate(C, K)
    if (!rangesChanged) return
    this.sampleRate = sampleRate
    this.fftSize = fftSize

    const ny = nyquist(sampleRate)
    const total = C + C * K + DISPLAY_BINS + EXTRA_BANDS
    const ranges = new Float64Array(total * 2)
    let b = 0
    const put = (lo: number, hi: number) => {
      ranges[b * 2] = Math.min(lo, ny)
      ranges[b * 2 + 1] = Math.min(hi, ny)
      b++
    }
    const resolved = channels.map(channelRange)
    for (const [lo, hi] of resolved) put(lo, hi)
    for (let c = 0; c < C; c++) {
      const edges = bandEdges(K, resolved[c][0], resolved[c][1], channels[c].scale)
      for (let j = 0; j < K; j++) put(edges[j], edges[j + 1])
    }
    const specEdges = bandEdges(DISPLAY_BINS, audio.minFrequency, Math.min(audio.maxFrequency, ny), audio.frequencyScale)
    for (let i = 0; i < DISPLAY_BINS; i++) put(specEdges[i], specEdges[i + 1])
    put(20, 250)
    put(250, 2000)
    put(2000, Math.min(12000, ny * 0.98))
    put(20, Math.min(16000, ny))
    put(40, 140)
    put(30, Math.min(8000, ny))
    this.mapper.configure(ranges, sampleRate, fftSize)
    this.bandPowers = new Float32Array(total)
  }

  private rangesDiffer(channels: ChannelConfig[], audio: Settings['audio']): boolean {
    const prev = this.channelsRef
    const prevAudio = this.audioRef
    if (!prev || !prevAudio) return true
    if (
      audio.minFrequency !== prevAudio.minFrequency ||
      audio.maxFrequency !== prevAudio.maxFrequency ||
      audio.frequencyScale !== prevAudio.frequencyScale
    ) {
      return true
    }
    for (let i = 0; i < channels.length; i++) {
      const a = channels[i]
      const p = prev[i]
      if (
        !p ||
        a.rangeMode !== p.rangeMode ||
        a.minHz !== p.minHz ||
        a.maxHz !== p.maxHz ||
        a.centerHz !== p.centerHz ||
        a.bandwidthOct !== p.bandwidthOct ||
        a.scale !== p.scale
      ) {
        return true
      }
    }
    return false
  }

  private allocate(C: number, K: number) {
    this.channelCount = C
    this.subbandCount = K
    this.env = new EnvelopeFollower(C)
    this.subEnv = new EnvelopeFollower(C * K)
    this.peaks = new PeakHold(C)
    this.adaptiveMean = new Float32Array(C)
    this.channelGain = new AutoGain(C)
    this.vector = new Float32Array(K + 2)
    this.delays = Array.from({ length: C }, () => new DelayedSignalBuffer(K + 2, HISTORY_CAPACITY))
    const f = this.frame
    f.channelCount = C
    f.subbandCount = K
    f.level = new Float32Array(C)
    f.intensity = new Float32Array(C)
    f.peak = new Float32Array(C)
    f.live = new Float32Array(C)
    f.sub = new Float32Array(C * K)
    f.dominantHz = new Float32Array(C).fill(NaN)
  }
}

export const MAX_HISTORY_MS = MAX_DELAY_MS + 1000
