import { describe, expect, it } from 'vitest'
import {
  bandCenter,
  bandEdges,
  binToFrequency,
  binWidth,
  clampToSpectrum,
  computeBinWeights,
  frequencyToBin,
  frequencyToNote,
  frequencyToPosition,
  nyquist,
  positionToFrequency,
} from '../../src/audio/frequencyMath'

describe('bin ↔ frequency mapping', () => {
  it('uses the real sample rate and FFT size', () => {
    expect(binWidth(48000, 4096)).toBeCloseTo(11.71875)
    expect(binToFrequency(1, 44100, 2048)).toBeCloseTo(21.533, 3)
    expect(binToFrequency(1024, 48000, 2048)).toBe(24000)
    expect(nyquist(44100)).toBe(22050)
  })

  it('round-trips frequency → bin → frequency', () => {
    for (const sr of [44100, 48000, 96000]) {
      for (const fft of [512, 2048, 8192]) {
        for (const hz of [27.5, 440, 1234.5, 15000]) {
          expect(binToFrequency(frequencyToBin(hz, sr, fft), sr, fft)).toBeCloseTo(hz, 6)
        }
      }
    }
  })

  it('clamps frequencies to the representable range', () => {
    expect(clampToSpectrum(1, 48000, 1024)).toBeCloseTo(binWidth(48000, 1024) / 2)
    expect(clampToSpectrum(30000, 48000, 1024)).toBeLessThan(24000)
  })
})

describe('band weights', () => {
  it('covers a multi-bin band with full interior weights and fractional edges', () => {
    const sr = 48000
    const fft = 1024 // 46.875 Hz bins
    const { start, weights } = computeBinWeights(100, 400, sr, fft)
    expect(start).toBe(Math.floor(100 / 46.875 + 0.5))
    const total = weights.reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo((400 - 100) / 46.875, 6)
    expect(weights.slice(1, -1).every((w) => Math.abs(w - 1) < 1e-9)).toBe(true)
  })

  it('interpolates between two bins for bands narrower than a bin', () => {
    const { start, weights } = computeBinWeights(60, 61, 48000, 512) // 93.75 Hz bins
    expect(weights).toHaveLength(2)
    expect(weights[0] + weights[1]).toBeCloseTo(1)
    expect(start).toBeGreaterThanOrEqual(1)
  })

  it('never uses the DC bin and stays below Nyquist', () => {
    const low = computeBinWeights(0, 10, 48000, 2048)
    expect(low.start).toBeGreaterThanOrEqual(1)
    const high = computeBinWeights(20000, 30000, 48000, 2048)
    expect(high.start + high.weights.length - 1).toBeLessThan(1024)
  })
})

describe('logarithmic and linear distribution', () => {
  it('produces geometric edges for log scale', () => {
    const edges = bandEdges(10, 20, 20480, 'log')
    expect(edges[0]).toBe(20)
    expect(edges[10]).toBe(20480)
    const ratio = edges[1] / edges[0]
    for (let i = 1; i < 10; i++) expect(edges[i + 1] / edges[i]).toBeCloseTo(ratio, 9)
    expect(ratio).toBeCloseTo(2, 9) // exactly one octave per band
  })

  it('produces arithmetic edges for linear scale', () => {
    const edges = bandEdges(4, 100, 500, 'linear')
    expect(Array.from(edges)).toEqual([100, 200, 300, 400, 500])
  })

  it('maps positions and frequencies inversely', () => {
    for (const t of [0, 0.25, 0.5, 0.9, 1]) {
      expect(frequencyToPosition(positionToFrequency(t, 20, 16000, 'log'), 20, 16000, 'log')).toBeCloseTo(t, 9)
      expect(frequencyToPosition(positionToFrequency(t, 20, 16000, 'linear'), 20, 16000, 'linear')).toBeCloseTo(t, 9)
    }
    expect(bandCenter(100, 400, 'log')).toBeCloseTo(200)
    expect(bandCenter(100, 400, 'linear')).toBe(250)
  })
})

describe('note names', () => {
  it('names concert pitch', () => {
    expect(frequencyToNote(440)).toEqual({ name: 'A', octave: 4, cents: 0 })
    expect(frequencyToNote(261.63)?.name).toBe('C')
    expect(frequencyToNote(-1)).toBeNull()
  })
})
