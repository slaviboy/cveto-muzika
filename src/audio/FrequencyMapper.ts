import { binToFrequency, computeBinWeights } from './frequencyMath'
import { parabolicPeak } from './SpectralPeaks'

/**
 * Precomputed band plans: for every band, the FFT bins it covers and their overlap weights.
 * Rebuilt only when ranges, FFT size or sample rate change; computing band energies per frame is
 * a single pass over flat typed arrays with no allocation.
 *
 * Band energy = weighted mean of linear power across the band (energy across a range), which is
 * deliberately distinct from `dominantFrequency` (the single strongest spectral peak in a band).
 */
export class FrequencyMapper {
  bandCount = 0
  private offsets = new Int32Array(1)
  private bins = new Int32Array(0)
  private weights = new Float32Array(0)
  private weightSums = new Float32Array(0)
  private sampleRate = 48000
  private fftSize = 2048

  /** @param ranges flat [lo0, hi0, lo1, hi1, …] in Hz */
  configure(ranges: ArrayLike<number>, sampleRate: number, fftSize: number) {
    const count = Math.floor(ranges.length / 2)
    this.bandCount = count
    this.sampleRate = sampleRate
    this.fftSize = fftSize
    const plans = new Array<{ start: number; weights: number[] }>(count)
    let total = 0
    for (let b = 0; b < count; b++) {
      const plan = computeBinWeights(ranges[b * 2], ranges[b * 2 + 1], sampleRate, fftSize)
      plans[b] = plan
      total += plan.weights.length
    }
    this.offsets = new Int32Array(count + 1)
    this.bins = new Int32Array(total)
    this.weights = new Float32Array(total)
    this.weightSums = new Float32Array(count)
    let cursor = 0
    for (let b = 0; b < count; b++) {
      this.offsets[b] = cursor
      const plan = plans[b]
      let sum = 0
      for (let i = 0; i < plan.weights.length; i++) {
        this.bins[cursor] = plan.start + i
        this.weights[cursor] = plan.weights[i]
        sum += plan.weights[i]
        cursor++
      }
      this.weightSums[b] = sum
    }
    this.offsets[count] = cursor
  }

  /** Mean linear power per band. */
  compute(power: Float32Array, out: Float32Array) {
    const n = power.length
    for (let b = 0; b < this.bandCount; b++) {
      let acc = 0
      for (let i = this.offsets[b], end = this.offsets[b + 1]; i < end; i++) {
        const k = this.bins[i]
        if (k < n) acc += power[k] * this.weights[i]
      }
      const ws = this.weightSums[b]
      out[b] = ws > 0 ? acc / ws : 0
    }
  }

  /** Frequency of the strongest bin in a band, refined with parabolic interpolation. NaN if silent. */
  dominantFrequency(band: number, power: Float32Array, minPower = 1e-12): number {
    const start = this.offsets[band]
    const end = this.offsets[band + 1]
    let best = -1
    let bestP = minPower
    for (let i = start; i < end; i++) {
      const k = this.bins[i]
      if (this.weights[i] < 0.5) continue
      if (power[k] > bestP) {
        bestP = power[k]
        best = k
      }
    }
    if (best < 0) return NaN
    if (best <= 0 || best >= power.length - 1) return binToFrequency(best, this.sampleRate, this.fftSize)
    const a = Math.log(power[best - 1] + 1e-30)
    const b = Math.log(power[best] + 1e-30)
    const c = Math.log(power[best + 1] + 1e-30)
    const { offset } = parabolicPeak(a, b, c)
    return binToFrequency(best + offset, this.sampleRate, this.fftSize)
  }
}
