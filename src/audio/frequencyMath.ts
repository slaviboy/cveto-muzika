/**
 * FFT bin ↔ frequency math. An AnalyserNode with fftSize N at sample rate fs exposes N/2 bins;
 * bin k is centred on k·fs/N and spans ±half a bin width. Nyquist = fs/2.
 */
export type FrequencyScale = 'log' | 'linear'

export const binWidth = (sampleRate: number, fftSize: number) => sampleRate / fftSize
export const nyquist = (sampleRate: number) => sampleRate / 2
export const binToFrequency = (bin: number, sampleRate: number, fftSize: number) => (bin * sampleRate) / fftSize
export const frequencyToBin = (hz: number, sampleRate: number, fftSize: number) => (hz * fftSize) / sampleRate

/** Clamps an audible frequency to the range the analyser can represent. */
export function clampToSpectrum(hz: number, sampleRate: number, fftSize: number): number {
  const lo = binWidth(sampleRate, fftSize) * 0.5
  const hi = nyquist(sampleRate) - binWidth(sampleRate, fftSize) * 0.5
  return Math.min(hi, Math.max(lo, hz))
}

/** count+1 edges between min and max, geometric (log) or arithmetic (linear). */
export function bandEdges(count: number, minHz: number, maxHz: number, scale: FrequencyScale): Float64Array {
  const n = Math.max(1, Math.floor(count))
  const edges = new Float64Array(n + 1)
  const lo = Math.max(1e-3, Math.min(minHz, maxHz))
  const hi = Math.max(minHz, maxHz)
  if (scale === 'log') {
    const ratio = hi / lo
    for (let i = 0; i <= n; i++) edges[i] = lo * Math.pow(ratio, i / n)
  } else {
    for (let i = 0; i <= n; i++) edges[i] = lo + ((hi - lo) * i) / n
  }
  edges[0] = lo
  edges[n] = hi
  return edges
}

/** Position of a frequency on a 0..1 axis between min and max. */
export function frequencyToPosition(hz: number, minHz: number, maxHz: number, scale: FrequencyScale): number {
  if (maxHz <= minHz) return 0
  const t =
    scale === 'log'
      ? Math.log(Math.max(hz, 1e-3) / minHz) / Math.log(maxHz / minHz)
      : (hz - minHz) / (maxHz - minHz)
  return Math.min(1, Math.max(0, t))
}

export function positionToFrequency(t: number, minHz: number, maxHz: number, scale: FrequencyScale): number {
  return scale === 'log' ? minHz * Math.pow(maxHz / minHz, t) : minHz + (maxHz - minHz) * t
}

/** Geometric centre for log bands, arithmetic for linear. */
export function bandCenter(lo: number, hi: number, scale: FrequencyScale = 'log'): number {
  return scale === 'log' ? Math.sqrt(lo * hi) : (lo + hi) / 2
}

export interface BinWeights {
  /** First bin index covered by the band. */
  start: number
  /** Overlap fraction (0..1] of each consecutive bin with the band. */
  weights: number[]
}

/**
 * Weights of every FFT bin for the band [loHz, hiHz]. Bands at least one bin wide use the
 * fractional overlap of each bin with the band. Narrower bands linearly interpolate between the
 * two nearest bin centres, so finely divided low-frequency bands vary smoothly instead of in
 * steps. DC (bin 0) is excluded.
 */
export function computeBinWeights(loHz: number, hiHz: number, sampleRate: number, fftSize: number): BinWeights {
  const binCount = fftSize / 2
  const w = binWidth(sampleRate, fftSize)
  let lo = Math.min(loHz, hiHz)
  let hi = Math.max(loHz, hiHz)
  lo = Math.max(lo, w * 0.5)
  hi = Math.min(hi, (binCount - 0.5) * w)
  if (hi <= lo) {
    // Collapsed or out-of-range band: use the single nearest valid bin.
    const k = Math.min(binCount - 1, Math.max(1, Math.round(frequencyToBin(lo, sampleRate, fftSize))))
    return { start: k, weights: [1] }
  }
  if (hi - lo < w) {
    const x = Math.min(binCount - 1, Math.max(1, (lo + hi) / 2 / w))
    const k0 = Math.min(binCount - 2, Math.floor(x))
    const frac = x - k0
    if (k0 < 1) return { start: 1, weights: [1] }
    return { start: k0, weights: [1 - frac, frac] }
  }
  const first = Math.max(1, Math.floor(lo / w + 0.5))
  const last = Math.min(binCount - 1, Math.floor(hi / w + 0.5))
  const weights: number[] = []
  for (let k = first; k <= last; k++) {
    const binLo = (k - 0.5) * w
    const binHi = (k + 0.5) * w
    const overlap = Math.min(hi, binHi) - Math.max(lo, binLo)
    weights.push(Math.max(0, overlap) / w)
  }
  return { start: first, weights }
}

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']

/** Nearest equal-tempered note (A4 = 440 Hz) and cents offset. */
export function frequencyToNote(hz: number): { name: string; octave: number; cents: number } | null {
  if (!(hz > 0) || !Number.isFinite(hz)) return null
  const midi = 69 + 12 * Math.log2(hz / 440)
  const rounded = Math.round(midi)
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12]
  return { name, octave: Math.floor(rounded / 12) - 1, cents: Math.round((midi - rounded) * 100) }
}

export function formatHz(hz: number): string {
  if (!Number.isFinite(hz)) return '—'
  if (hz >= 1000) return `${(hz / 1000).toFixed(hz >= 10000 ? 1 : 2).replace(/\.?0+$/, '')} kHz`
  return `${Math.round(hz)} Hz`
}
