import { binToFrequency } from './frequencyMath'

/**
 * Vertex of the parabola through (−1, a), (0, b), (1, c). Gives sub-bin peak position (offset in
 * −0.5..0.5) and the interpolated peak value. Apply to log magnitudes for best accuracy.
 */
export function parabolicPeak(a: number, b: number, c: number): { offset: number; value: number } {
  const denom = a - 2 * b + c
  if (denom === 0 || !Number.isFinite(denom)) return { offset: 0, value: b }
  const offset = Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom))
  return { offset, value: b - 0.25 * (a - c) * offset }
}

export interface SpectralPeak {
  frequency: number
  db: number
}

/**
 * Individual tonal peaks: local maxima above `minDb` that stand at least `prominenceDb` above the
 * lower of their neighbours two bins away. Returns how many peaks were written to `out`, strongest first.
 */
export function findSpectralPeaks(
  db: Float32Array,
  sampleRate: number,
  fftSize: number,
  out: SpectralPeak[],
  maxPeaks = 8,
  minDb = -80,
  prominenceDb = 6,
): number {
  let count = 0
  for (let k = 2; k < db.length - 2; k++) {
    const v = db[k]
    if (!(v > minDb) || v < db[k - 1] || v <= db[k + 1]) continue
    const base = Math.min(db[k - 2], db[k + 2])
    if (v - base < prominenceDb) continue
    const { offset, value } = parabolicPeak(db[k - 1], v, db[k + 1])
    const peak = { frequency: binToFrequency(k + offset, sampleRate, fftSize), db: value }
    // Keep `out` sorted by strength, bounded to maxPeaks.
    let pos = Math.min(count, maxPeaks)
    while (pos > 0 && out[pos - 1].db < peak.db) pos--
    if (pos >= maxPeaks) continue
    for (let i = Math.min(count, maxPeaks - 1); i > pos; i--) out[i] = out[i - 1]
    out[pos] = peak
    if (count < maxPeaks) count++
  }
  return count
}
