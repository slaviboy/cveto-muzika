import { mixColors, oklchToSrgb, parseHex, srgbToLinearRgb, type InterpolationSpace, type Vec3 } from './colorMath'

export interface GradientStop {
  position: number
  color: string
}

const smoothstep = (e0: number, e1: number, x: number) => {
  if (e0 === e1) return x < e0 ? 0 : 1
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

export function sortStops(stops: readonly GradientStop[]): GradientStop[] {
  return [...stops].sort((a, b) => a.position - b.position)
}

/**
 * Samples a multi-stop gradient at t (0..1) and returns sRGB.
 * `crossfade` < 1 narrows each transition around the midpoint between stops (0 = hard bands).
 */
export function sampleStops(
  stops: readonly { position: number; rgb: Vec3 }[],
  t: number,
  space: InterpolationSpace,
  crossfade = 1,
): Vec3 {
  const n = stops.length
  if (n === 0) return [0, 0, 0]
  if (n === 1 || t <= stops[0].position) return stops[0].rgb
  if (t >= stops[n - 1].position) return stops[n - 1].rgb
  let i = 0
  while (i < n - 2 && t > stops[i + 1].position) i++
  const a = stops[i]
  const b = stops[i + 1]
  const span = b.position - a.position
  const local = span <= 1e-9 ? 1 : (t - a.position) / span
  const w = Math.min(1, Math.max(0, crossfade))
  const k = w >= 1 ? local : smoothstep(0.5 - w / 2, 0.5 + w / 2, local)
  return mixColors(a.rgb, b.rgb, k, space)
}

export function resolveStops(stops: readonly GradientStop[]): { position: number; rgb: Vec3 }[] {
  return sortStops(stops).map((s) => ({ position: s.position, rgb: parseHex(s.color) ?? [1, 1, 1] }))
}

export function sampleGradient(stops: readonly GradientStop[], t: number, space: InterpolationSpace = 'oklab'): Vec3 {
  return sampleStops(resolveStops(stops), t, space)
}

/** OKLCh hue sweep: perceptually even rainbow. */
export function rainbowColor(t: number, lightness = 0.72, chroma = 0.19, hueOffset = 265): Vec3 {
  return oklchToSrgb([lightness, chroma, hueOffset + t * 300])
}

/** Bakes `size` samples of a color function into a linear-light RGBA Float32Array. */
export function bakeLinear(size: number, fn: (t: number) => Vec3, out = new Float32Array(size * 4)): Float32Array {
  for (let i = 0; i < size; i++) {
    const lin = srgbToLinearRgb(fn(size === 1 ? 0 : i / (size - 1)))
    out[i * 4] = lin[0]
    out[i * 4 + 1] = lin[1]
    out[i * 4 + 2] = lin[2]
    out[i * 4 + 3] = 1
  }
  return out
}

export function gradientCss(stops: readonly GradientStop[], angle = 90): string {
  const parts = sortStops(stops).map((s) => `${s.color} ${(s.position * 100).toFixed(1)}%`)
  return `linear-gradient(${angle}deg, ${parts.join(', ')})`
}
