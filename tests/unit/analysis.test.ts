import { describe, expect, it } from 'vitest'
import { applyContrast, applyCurve, AudioPipeline, visualIntensity } from '../../src/audio/AudioPipeline'
import { BeatDetector } from '../../src/audio/BeatDetector'
import { FrequencyAnalyzer, type AnalyserLike } from '../../src/audio/FrequencyAnalyzer'
import { FrequencyMapper } from '../../src/audio/FrequencyMapper'
import { binToFrequency } from '../../src/audio/frequencyMath'
import { findSpectralPeaks, parabolicPeak } from '../../src/audio/SpectralPeaks'
import { createChannel } from '../../src/state/channelOps'
import { createDefaultSettings } from '../../src/state/defaults'

const SR = 48000
const FFT = 4096

/** Analyser stand-in that returns a fixed dB spectrum. */
function fakeAnalyser(fill: (hz: number) => number): AnalyserLike & { set(fn: (hz: number) => number): void } {
  let fn = fill
  return {
    fftSize: FFT,
    frequencyBinCount: FFT / 2,
    getFloatFrequencyData(arr: Float32Array) {
      for (let i = 0; i < arr.length; i++) arr[i] = fn(binToFrequency(i, SR, FFT))
    },
    set(next) {
      fn = next
    },
  }
}

/**
 * Tone with a Gaussian magnitude envelope (what a Gaussian-windowed FFT produces): a parabola in
 * dB around `hz`, over a −120 dB floor.
 */
const tone = (hz: number, widthHz = 8, peakDb = -20) => (f: number) => Math.max(-120, peakDb - 8.686 * ((f - hz) / widthHz) ** 2)

describe('FrequencyMapper', () => {
  it('measures band energy as mean power across the range', () => {
    const power = new Float32Array(FFT / 2).fill(1)
    const mapper = new FrequencyMapper()
    mapper.configure([100, 200, 1000, 4000], SR, FFT)
    const out = new Float32Array(2)
    mapper.compute(power, out)
    expect(out[0]).toBeCloseTo(1, 6)
    expect(out[1]).toBeCloseTo(1, 6)
    // Doubling the power inside only one band affects only that band.
    for (let k = Math.round(1000 / (SR / FFT)); k < Math.round(4000 / (SR / FFT)); k++) power[k] = 2
    mapper.compute(power, out)
    expect(out[0]).toBeCloseTo(1, 6)
    expect(out[1]).toBeGreaterThan(1.9)
  })

  it('finds the dominant frequency inside a band with sub-bin accuracy', () => {
    const analyzer = new FrequencyAnalyzer()
    analyzer.update(fakeAnalyser(tone(437.3)), 1 / 60, { gainDb: 0, noiseReduction: 0, spectralFilter: 'off' })
    const mapper = new FrequencyMapper()
    mapper.configure([200, 800], SR, FFT)
    expect(mapper.dominantFrequency(0, analyzer.power)).toBeCloseTo(437.3, 0)
  })
})

describe('spectral peaks', () => {
  it('interpolates a parabola vertex', () => {
    expect(parabolicPeak(1, 2, 1).offset).toBeCloseTo(0)
    expect(parabolicPeak(0, 2, 1).offset).toBeGreaterThan(0)
  })

  it('separates individual tones from band energy', () => {
    const fn = (f: number) => Math.max(tone(220)(f), tone(1760, 10, -30)(f))
    const db = new Float32Array(FFT / 2)
    fakeAnalyser(fn).getFloatFrequencyData(db)
    const out: { frequency: number; db: number }[] = []
    const n = findSpectralPeaks(db, SR, FFT, out, 4, -80, 6)
    expect(n).toBe(2)
    expect(out[0].frequency).toBeCloseTo(220, 0)
    expect(out[1].frequency).toBeCloseTo(1760, 0)
    expect(out[0].db).toBeGreaterThan(out[1].db)
  })
})

describe('noise suppression and filtering', () => {
  it('removes a steady noise floor but keeps a tone above it', () => {
    const analyzer = new FrequencyAnalyzer()
    const opts = { gainDb: 0, noiseReduction: 0.5, spectralFilter: 'median3' as const }
    const noise = () => -70
    const a = fakeAnalyser(noise)
    for (let i = 0; i < 120; i++) analyzer.update(a, 1 / 60, opts)
    const k = Math.round(1000 / (SR / FFT))
    expect(analyzer.power[k]).toBeLessThan(1e-7 * 0.5)
    a.set((f) => Math.max(noise(), tone(1000, 30, -20)(f)))
    analyzer.update(a, 1 / 60, opts)
    expect(analyzer.power[k]).toBeGreaterThan(1e-3)
  })

  it('applies spectral tilt around 1 kHz', () => {
    const analyzer = new FrequencyAnalyzer()
    analyzer.update(fakeAnalyser(() => -40), 1 / 60, { gainDb: 0, noiseReduction: 0, spectralFilter: 'off', tiltDbPerOctave: 3, sampleRate: SR })
    const at = (hz: number) => 10 * Math.log10(analyzer.power[Math.round(hz / (SR / FFT))])
    expect(at(2000) - at(1000)).toBeCloseTo(3, 0)
    expect(at(1000) - at(500)).toBeCloseTo(3, 0)
  })
})

describe('response shaping', () => {
  it('keeps curve and contrast endpoints fixed', () => {
    for (const c of ['linear', 'smooth', 'punchy', 'soft', 'gamma'] as const) {
      expect(applyCurve(0, c, 2)).toBe(0)
      expect(applyCurve(1, c, 2)).toBe(1)
    }
    expect(applyContrast(0.5, 3)).toBeCloseTo(0.5)
    expect(applyContrast(0.7, 3)).toBeGreaterThan(0.7)
    expect(applyContrast(0.3, 3)).toBeLessThan(0.3)
  })

  it('maps level through min/max intensity and brightness', () => {
    const ch = createChannel({ minIntensity: 0.2, maxIntensity: 1, brightness: 2 })
    expect(visualIntensity(0, ch)).toBeCloseTo(0.4)
    expect(visualIntensity(1, ch)).toBeCloseTo(2)
  })
})

describe('AudioPipeline', () => {
  const settingsWith = (delayMs: number) => {
    const s = createDefaultSettings()
    s.audio.autoGain = 'off'
    s.audio.noiseReduction = 0
    s.channels = [createChannel({ minHz: 800, maxHz: 1250, attackMs: 0, releaseMs: 0, threshold: 0, curve: 'linear', delayMs })]
    return s
  }

  it('drives a channel from real FFT data and silence decays to zero', () => {
    const p = new AudioPipeline()
    const s = settingsWith(0)
    const a = fakeAnalyser(tone(1000, 60, -30))
    let t = 0
    for (let i = 0; i < 10; i++) p.process((t += 16), { analyser: a, sampleRate: SR }, s)
    expect(p.frame.level[0]).toBeGreaterThan(0.5)
    expect(p.frame.dominantHz[0]).toBeCloseTo(1000, -1)
    for (let i = 0; i < 10; i++) p.process((t += 16), { analyser: null, sampleRate: SR }, s)
    expect(p.frame.level[0]).toBe(0)
  })

  it('delays a channel by its configured time, not by smoothing', () => {
    const p = new AudioPipeline()
    const s = settingsWith(200)
    const a = fakeAnalyser(() => -140)
    let t = 0
    for (let i = 0; i < 30; i++) p.process((t += 10), { analyser: a, sampleRate: SR }, s)
    a.set(tone(1000, 60, -30))
    const onset = t + 10
    let firstNonZero = -1
    for (let i = 0; i < 40; i++) {
      p.process((t += 10), { analyser: a, sampleRate: SR }, s)
      if (firstNonZero < 0 && p.frame.level[0] > 0.1) firstNonZero = t
      // The undelayed meter reacts immediately.
      if (t === onset) expect(p.frame.live[0]).toBeGreaterThan(0.1)
    }
    expect(firstNonZero - onset).toBeGreaterThanOrEqual(190)
    expect(firstNonZero - onset).toBeLessThanOrEqual(210)
  })

  it('produces requested sub-bands per channel', () => {
    const p = new AudioPipeline()
    p.setSubbandCount(12)
    const s = settingsWith(0)
    p.process(16, { analyser: fakeAnalyser(tone(1000)), sampleRate: SR }, s)
    expect(p.frame.subbandCount).toBe(12)
    expect(p.frame.sub).toHaveLength(12)
  })
})

describe('BeatDetector', () => {
  it('fires on onsets after a quiet history', () => {
    const b = new BeatDetector()
    let t = 0
    for (let i = 0; i < 60; i++) b.process(0.05 + (i % 2) * 0.01, (t += 16), 0.016, 1.4)
    expect(b.count).toBe(0)
    expect(b.process(0.9, (t += 16), 0.016, 1.4)).toBe(true)
    expect(b.pulse).toBeGreaterThan(0.5)
  })
})
