import { describe, expect, it } from 'vitest'
import { DelayedSignalBuffer } from '../../src/audio/DelayedSignalBuffer'
import { EnvelopeFollower, exponentialSmooth, PeakHold, smoothingCoefficient } from '../../src/audio/TemporalSmoother'

describe('DelayedSignalBuffer', () => {
  it('returns the exact value at a stored timestamp', () => {
    const b = new DelayedSignalBuffer(1, 16)
    for (let t = 0; t <= 100; t += 10) b.push(t, t / 10)
    expect(b.readScalar(50)).toBe(5)
    expect(b.readScalar(100)).toBe(10)
  })

  it('interpolates linearly between frames', () => {
    const b = new DelayedSignalBuffer(1, 16)
    b.push(0, 0)
    b.push(10, 1)
    expect(b.readScalar(2.5)).toBeCloseTo(0.25)
    expect(b.readScalar(7.5)).toBeCloseTo(0.75)
  })

  it('clamps reads outside the stored range', () => {
    const b = new DelayedSignalBuffer(1, 8)
    b.push(100, 3)
    b.push(110, 4)
    expect(b.readScalar(0)).toBe(3)
    expect(b.readScalar(500)).toBe(4)
    expect(new DelayedSignalBuffer().readScalar(10)).toBe(0)
  })

  it('wraps around and keeps only the newest frames', () => {
    const b = new DelayedSignalBuffer(1, 4)
    for (let t = 0; t < 10; t++) b.push(t, t)
    expect(b.size).toBe(4)
    expect(b.oldestTime).toBe(6)
    expect(b.newestTime).toBe(9)
    expect(b.readScalar(7.5)).toBeCloseTo(7.5)
    expect(b.readScalar(0)).toBe(6)
  })

  it('stores and interpolates vectors', () => {
    const b = new DelayedSignalBuffer(3, 8)
    b.push(0, [0, 10, 100])
    b.push(10, [1, 20, 200])
    const out = new Float32Array(3)
    b.read(5, out)
    expect(Array.from(out)).toEqual([0.5, 15, 150])
  })

  it('overwrites the newest frame for equal timestamps', () => {
    const b = new DelayedSignalBuffer(1, 4)
    b.push(5, 1)
    b.push(5, 2)
    expect(b.size).toBe(1)
    expect(b.readScalar(5)).toBe(2)
  })

  it('produces a true delay for a step signal regardless of frame timing', () => {
    const b = new DelayedSignalBuffer(1, 1024)
    const delay = 250
    let firstHigh = -1
    let t = 0
    while (t < 2000) {
      t += 7 + (t % 3) // irregular frame times
      b.push(t, t >= 1000 ? 1 : 0)
      if (firstHigh < 0 && b.readScalar(t - delay) > 0.99) firstHigh = t
    }
    expect(firstHigh).toBeGreaterThanOrEqual(1000 + delay)
    expect(firstHigh).toBeLessThan(1000 + delay + 12)
  })
})

describe('temporal smoothing', () => {
  it('is frame-rate independent', () => {
    // Integrate exactly 200 ms at different frame rates.
    const run = (fps: number) => {
      let v = 0
      const dt = 1 / fps
      for (let i = 0; i < Math.round(0.2 * fps); i++) v = exponentialSmooth(v, 1, dt, 50)
      return v
    }
    expect(run(30)).toBeCloseTo(run(240), 6)
    expect(run(60)).toBeCloseTo(1 - Math.exp(-200 / 50), 4)
  })

  it('treats a zero time constant as instant', () => {
    expect(smoothingCoefficient(0.016, 0)).toBe(1)
  })

  it('attacks faster than it releases', () => {
    const env = new EnvelopeFollower(1)
    const dt = 1 / 60
    for (let i = 0; i < 6; i++) env.process(0, 1, 10, 500, dt)
    const afterAttack = env.values[0]
    expect(afterAttack).toBeGreaterThan(0.99)
    for (let i = 0; i < 6; i++) env.process(0, 0, 10, 500, dt)
    expect(env.values[0]).toBeGreaterThan(0.75)
  })

  it('smoothing does not delay the onset (unlike the delay buffer)', () => {
    const env = new EnvelopeFollower(1)
    expect(env.process(0, 1, 100, 100, 1 / 60)).toBeGreaterThan(0)
  })
})

describe('PeakHold', () => {
  it('holds, then decays at the configured rate', () => {
    const p = new PeakHold(1)
    p.process(0, 1, 100, 2, 0.016)
    for (let i = 0; i < 5; i++) p.process(0, 0, 100, 2, 0.016) // 80 ms: still holding
    expect(p.values[0]).toBe(1)
    for (let i = 0; i < 2; i++) p.process(0, 0, 100, 2, 0.016) // hold expires
    p.process(0, 0, 100, 2, 0.1)
    expect(p.values[0]).toBeCloseTo(0.8, 1)
  })
})
