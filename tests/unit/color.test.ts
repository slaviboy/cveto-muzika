import { describe, expect, it } from 'vitest'
import {
  hslToRgb,
  hsvToRgb,
  linearToOklab,
  mixColors,
  oklabToLinear,
  oklchToSrgb,
  parseColor,
  parseHex,
  rgbToHsl,
  rgbToHsv,
  srgbToLinear,
  srgbToOklch,
  linearToSrgb,
  toHex,
  type Vec3,
} from '../../src/color/colorMath'
import { resolveStops, sampleGradient, sampleStops } from '../../src/color/gradient'

const close = (a: Vec3, b: Vec3, digits = 3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], digits))

describe('color parsing and conversion', () => {
  it('parses HEX, RGB, HSL and HSV inputs', () => {
    expect(parseHex('#ff8000')).toEqual([1, 128 / 255, 0])
    expect(parseHex('#f80')).toEqual([1, 136 / 255, 0])
    close(parseColor('rgb(255, 128, 0)')!, [1, 128 / 255, 0])
    close(parseColor('hsl(30, 100%, 50%)')!, [1, 0.5, 0])
    close(parseColor('hsv(30, 100%, 100%)')!, [1, 0.5, 0])
    expect(parseColor('not a color')).toBeNull()
  })

  it('round-trips through HSL and HSV', () => {
    const samples: Vec3[] = [
      [0.2, 0.4, 0.6],
      [1, 0, 0.5],
      [0.9, 0.9, 0.1],
    ]
    for (const c of samples) {
      close(hslToRgb(rgbToHsl(c)), c)
      close(hsvToRgb(rgbToHsv(c)), c)
    }
    expect(toHex([1, 0.5, 0])).toBe('#ff8000')
  })

  it('converts sRGB transfer function both ways', () => {
    for (const v of [0, 0.003, 0.04, 0.5, 1]) expect(linearToSrgb(srgbToLinear(v))).toBeCloseTo(v, 6)
  })

  it('matches reference OKLab values', () => {
    // White has L = 1 and no chroma; pure sRGB red has L ≈ 0.628.
    close(linearToOklab([1, 1, 1]), [1, 0, 0], 3)
    expect(linearToOklab([1, 0, 0])[0]).toBeCloseTo(0.628, 2)
    close(oklabToLinear(linearToOklab([0.2, 0.5, 0.8])), [0.2, 0.5, 0.8], 5)
  })

  it('keeps OKLCh conversions in gamut', () => {
    const c = oklchToSrgb([0.7, 0.4, 145]) // far outside sRGB
    c.forEach((v) => expect(v).toBeGreaterThanOrEqual(0))
    c.forEach((v) => expect(v).toBeLessThanOrEqual(1))
    expect(srgbToOklch(c)[2]).toBeCloseTo(145, -1)
  })
})

describe('interpolation', () => {
  const blue = parseHex('#0000ff')!
  const yellow = parseHex('#ffff00')!

  it('returns exact endpoints in every space', () => {
    for (const s of ['oklab', 'oklch', 'linear', 'srgb', 'hsl'] as const) {
      close(mixColors(blue, yellow, 0, s), blue)
      close(mixColors(blue, yellow, 1, s), yellow)
    }
  })

  it('avoids the muddy grey midpoint of naive sRGB mixing', () => {
    const naive = mixColors(blue, yellow, 0.5, 'srgb')
    const perceptual = mixColors(blue, yellow, 0.5, 'oklab')
    const L = (c: Vec3) => srgbToOklch(c)[0]
    // The OKLab midpoint lies at the perceptual midpoint of the endpoints' lightness.
    expect(L(perceptual)).toBeCloseTo((L(blue) + L(yellow)) / 2, 2)
    expect(Math.abs(L(naive) - L(perceptual))).toBeGreaterThan(0.01)
  })

  it('takes the shortest hue path in OKLCh', () => {
    const red = parseHex('#ff0040')!
    const magenta = parseHex('#ff00ff')!
    const mid = srgbToOklch(mixColors(red, magenta, 0.5, 'oklch'))[2]
    const h0 = srgbToOklch(red)[2]
    const h1 = srgbToOklch(magenta)[2]
    // Red (~15°) to magenta (~328°) is shortest through 0°, not the long way round through green.
    const arc = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))
    expect(arc(mid, h0) + arc(mid, h1)).toBeCloseTo(arc(h0, h1), 0)
    expect(arc(h0, h1)).toBeLessThan(180)
  })

  it('changes continuously along a gradient (no perceptual jumps)', () => {
    const stops = [
      { position: 0, color: '#1d2bff' },
      { position: 0.25, color: '#00d5ff' },
      { position: 0.5, color: '#8b4dff' },
      { position: 0.75, color: '#ff3bd4' },
      { position: 1, color: '#ff8a2a' },
    ]
    // Measured as OKLab distance (ΔE), since raw sRGB changes steeply near zero by design.
    const lab = (t: number) => linearToOklab(sampleGradient(stops, t).map(srgbToLinear) as Vec3)
    let prev = lab(0)
    for (let i = 1; i <= 400; i++) {
      const c = lab(i / 400)
      expect(Math.hypot(c[0] - prev[0], c[1] - prev[1], c[2] - prev[2])).toBeLessThan(0.01)
      prev = c
    }
  })

  it('crossfade 0 gives hard bands, 1 gives a smooth blend', () => {
    const stops = resolveStops([
      { position: 0, color: '#ff0000' },
      { position: 1, color: '#0000ff' },
    ])
    close(sampleStops(stops, 0.3, 'oklab', 0), parseHex('#ff0000')!)
    close(sampleStops(stops, 0.7, 'oklab', 0), parseHex('#0000ff')!)
    const smooth = sampleStops(stops, 0.5, 'oklab', 1)
    expect(smooth[0]).toBeGreaterThan(0.2)
    expect(smooth[2]).toBeGreaterThan(0.2)
  })
})
