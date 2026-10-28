/** Minimal surface of AnalyserNode used here, so tests can drive the analyzer with synthetic spectra. */
export interface AnalyserLike {
  readonly fftSize: number
  readonly frequencyBinCount: number
  getFloatFrequencyData(array: Float32Array<ArrayBuffer>): void
}

export interface AnalyzerOptions {
  /** Pre-gain in dB applied to every bin. */
  gainDb: number
  /** Spectral tilt in dB per octave around 1 kHz (compensates the natural treble roll-off of music). */
  tiltDbPerOctave?: number
  sampleRate?: number
  /** 0..1 amount of adaptive noise-floor subtraction. */
  noiseReduction: number
  spectralFilter: 'off' | 'median3' | 'median5'
}

const DB_TO_POWER = Math.LN10 / 10
/** Noise-floor estimate rises at most ~3 dB every 4 s, so sustained notes are barely attenuated. */
const FLOOR_RISE_DB_PER_SEC = 0.75

/**
 * Reads the analyser once per frame and produces a linear power spectrum with optional
 * adaptive noise-floor suppression and a light spectral median filter. All buffers are reused.
 */
export class FrequencyAnalyzer {
  db: Float32Array<ArrayBuffer> = new Float32Array(0)
  power: Float32Array<ArrayBuffer> = new Float32Array(0)
  private floor = new Float32Array(0)
  private scratch = new Float32Array(0)
  private floorPrimed = false
  private tilt = new Float32Array(0)
  private tiltSlope = NaN
  private tiltRate = NaN

  get binCount() {
    return this.power.length
  }

  ensureSize(binCount: number) {
    if (binCount === this.power.length) return
    this.db = new Float32Array(binCount)
    this.power = new Float32Array(binCount)
    this.floor = new Float32Array(binCount)
    this.scratch = new Float32Array(binCount)
    this.floorPrimed = false
  }

  clear() {
    this.power.fill(0)
    this.db.fill(-Infinity)
  }

  update(analyser: AnalyserLike, dtSeconds: number, opts: AnalyzerOptions) {
    this.ensureSize(analyser.frequencyBinCount)
    analyser.getFloatFrequencyData(this.db)
    const n = this.power.length
    const power = this.power
    const gain = Math.exp(opts.gainDb * DB_TO_POWER)
    const tilt = this.tiltGains(n, opts.tiltDbPerOctave ?? 0, opts.sampleRate ?? 48000)
    for (let i = 0; i < n; i++) {
      const d = this.db[i]
      power[i] = Number.isFinite(d) ? Math.exp(d * DB_TO_POWER) * gain * tilt[i] : 0
    }

    if (opts.spectralFilter !== 'off') this.median(opts.spectralFilter === 'median5' ? 5 : 3)

    const floor = this.floor
    if (!this.floorPrimed) {
      floor.set(power)
      this.floorPrimed = true
    }
    if (opts.noiseReduction > 0) {
      const rise = Math.exp(FLOOR_RISE_DB_PER_SEC * DB_TO_POWER * dtSeconds)
      const fall = Math.min(1, dtSeconds * 12)
      const overSubtract = opts.noiseReduction * 2
      for (let i = 0; i < n; i++) {
        const p = power[i]
        let f = floor[i]
        if (p < f) f += (p - f) * fall
        else f = Math.min(p, f * rise + 1e-14)
        floor[i] = f
        const clean = p - f * overSubtract
        power[i] = clean > 0 ? clean : 0
      }
    }
  }

  /** Per-bin power multipliers for the spectral tilt, cached until size / rate / slope change. */
  private tiltGains(n: number, dbPerOctave: number, sampleRate: number): Float32Array {
    if (n === this.tilt.length && dbPerOctave === this.tiltSlope && sampleRate === this.tiltRate) return this.tilt
    this.tiltSlope = dbPerOctave
    this.tiltRate = sampleRate
    this.tilt = new Float32Array(n)
    const binHz = sampleRate / (n * 2)
    for (let i = 0; i < n; i++) {
      const hz = Math.max(20, i * binHz)
      this.tilt[i] = Math.exp(dbPerOctave * Math.log2(hz / 1000) * DB_TO_POWER)
    }
    return this.tilt
  }

  /** Median across neighbouring bins removes isolated spikes without smearing broad peaks. */
  private median(taps: 3 | 5) {
    const src = this.power
    const out = this.scratch
    const n = src.length
    const r = taps >> 1
    const win = [0, 0, 0, 0, 0]
    for (let i = 0; i < n; i++) {
      let m = 0
      for (let k = -r; k <= r; k++) {
        const j = i + k < 0 ? 0 : i + k >= n ? n - 1 : i + k
        win[m++] = src[j]
      }
      // Insertion sort on ≤5 values.
      for (let a = 1; a < m; a++) {
        const v = win[a]
        let b = a - 1
        while (b >= 0 && win[b] > v) {
          win[b + 1] = win[b]
          b--
        }
        win[b + 1] = v
      }
      out[i] = win[r]
    }
    src.set(out)
  }
}

export const powerToDb = (p: number) => (p > 1e-30 ? 10 * Math.log10(p) : -300)
