/**
 * Pure color math. All RGB triplets are components in 0..1.
 * "srgb" = gamma-encoded display values, "linear" = linear-light sRGB primaries.
 */
export type Vec3 = [number, number, number]

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

export function parseHex(input: string): Vec3 | null {
  const m = HEX_RE.exec(input.trim())
  if (!m) return null
  let hex = m[1]
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  const n = parseInt(hex, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function toHex(rgb: Vec3): string {
  const c = (v: number) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0')
  return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value)
}

/** HSL: h in degrees, s/l in 0..1 */
export function rgbToHsl([r, g, b]: Vec3): Vec3 {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  return [hueOf(r, g, b, max, d), s, l]
}

export function hslToRgb([h, s, l]: Vec3): Vec3 {
  const c = (1 - Math.abs(2 * l - 1)) * s
  return chromaToRgb(h, c, l - c / 2)
}

/** HSV: h in degrees, s/v in 0..1 */
export function rgbToHsv([r, g, b]: Vec3): Vec3 {
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  if (d === 0) return [0, 0, max]
  return [hueOf(r, g, b, max, d), d / max, max]
}

export function hsvToRgb([h, s, v]: Vec3): Vec3 {
  const c = v * s
  return chromaToRgb(h, c, v - c)
}

function hueOf(r: number, g: number, b: number, max: number, d: number): number {
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h *= 60
  return h < 0 ? h + 360 : h
}

function chromaToRgb(h: number, c: number, m: number): Vec3 {
  const hp = (((h % 360) + 360) % 360) / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let rgb: Vec3
  if (hp < 1) rgb = [c, x, 0]
  else if (hp < 2) rgb = [x, c, 0]
  else if (hp < 3) rgb = [0, c, x]
  else if (hp < 4) rgb = [0, x, c]
  else if (hp < 5) rgb = [x, 0, c]
  else rgb = [c, 0, x]
  return [rgb[0] + m, rgb[1] + m, rgb[2] + m]
}

const FN_RE = /^(rgb|rgba|hsl|hsla|hsv|hsb)\(\s*([^)]*)\)$/i

/** Parses #hex, rgb(), hsl() and hsv() strings into sRGB. */
export function parseColor(input: string): Vec3 | null {
  const text = input.trim().toLowerCase()
  const hex = parseHex(text)
  if (hex) return hex
  const m = FN_RE.exec(text)
  if (!m) return null
  const parts = m[2].split(/[\s,/]+/).filter(Boolean)
  if (parts.length < 3) return null
  const num = (p: string, scale: number) => (p.endsWith('%') ? parseFloat(p) / 100 : parseFloat(p) / scale)
  const fn = m[1]
  let out: Vec3
  if (fn.startsWith('rgb')) {
    out = [num(parts[0], 255), num(parts[1], 255), num(parts[2], 255)]
  } else {
    const h = parseFloat(parts[0])
    const a = num(parts[1], 100)
    const b = num(parts[2], 100)
    out = fn.startsWith('hsl') ? hslToRgb([h, clamp01(a), clamp01(b)]) : hsvToRgb([h, clamp01(a), clamp01(b)])
  }
  if (out.some((v) => !Number.isFinite(v))) return null
  return [clamp01(out[0]), clamp01(out[1]), clamp01(out[2])]
}

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}

export const srgbToLinearRgb = (c: Vec3): Vec3 => [srgbToLinear(c[0]), srgbToLinear(c[1]), srgbToLinear(c[2])]
export const linearToSrgbRgb = (c: Vec3): Vec3 => [linearToSrgb(c[0]), linearToSrgb(c[1]), linearToSrgb(c[2])]

/** Björn Ottosson's OKLab, from linear sRGB. */
export function linearToOklab([r, g, b]: Vec3): Vec3 {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

export function oklabToLinear([L, a, b]: Vec3): Vec3 {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

/** OKLCh: L 0..1, C ~0..0.4, h in degrees. */
export function oklabToOklch([L, a, b]: Vec3): Vec3 {
  const C = Math.hypot(a, b)
  let h = (Math.atan2(b, a) * 180) / Math.PI
  if (h < 0) h += 360
  return [L, C, h]
}

export function oklchToOklab([L, C, h]: Vec3): Vec3 {
  const r = (h * Math.PI) / 180
  return [L, C * Math.cos(r), C * Math.sin(r)]
}

const inGamut = (c: Vec3, eps = 1e-4) => c.every((v) => v >= -eps && v <= 1 + eps)

/** OKLCh → sRGB, reducing chroma (keeping L and h) until the color fits the sRGB gamut. */
export function oklchToSrgb(lch: Vec3): Vec3 {
  const L = clamp01(lch[0])
  let lin = oklabToLinear(oklchToOklab([L, lch[1], lch[2]]))
  if (!inGamut(lin)) {
    let lo = 0
    let hi = lch[1]
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2
      if (inGamut(oklabToLinear(oklchToOklab([L, mid, lch[2]])))) lo = mid
      else hi = mid
    }
    lin = oklabToLinear(oklchToOklab([L, lo, lch[2]]))
  }
  return linearToSrgbRgb([clamp01(lin[0]), clamp01(lin[1]), clamp01(lin[2])])
}

export function srgbToOklch(c: Vec3): Vec3 {
  return oklabToOklch(linearToOklab(srgbToLinearRgb(c)))
}

export type InterpolationSpace = 'oklab' | 'oklch' | 'linear' | 'srgb' | 'hsl'

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

function lerpHue(a: number, b: number, t: number): number {
  let d = b - a
  if (d > 180) d -= 360
  else if (d < -180) d += 360
  const h = a + d * t
  return ((h % 360) + 360) % 360
}

/** Interpolates two sRGB colors in the requested space and returns sRGB. */
export function mixColors(a: Vec3, b: Vec3, t: number, space: InterpolationSpace = 'oklab'): Vec3 {
  if (t <= 0) return [a[0], a[1], a[2]]
  if (t >= 1) return [b[0], b[1], b[2]]
  switch (space) {
    case 'srgb':
      return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
    case 'linear': {
      const la = srgbToLinearRgb(a)
      const lb = srgbToLinearRgb(b)
      return linearToSrgbRgb([lerp(la[0], lb[0], t), lerp(la[1], lb[1], t), lerp(la[2], lb[2], t)])
    }
    case 'hsl': {
      const ha = rgbToHsl(a)
      const hb = rgbToHsl(b)
      // Achromatic endpoints take the other color's hue so greys don't swing through red.
      const h0 = ha[1] < 1e-4 ? hb[0] : ha[0]
      const h1 = hb[1] < 1e-4 ? ha[0] : hb[0]
      return hslToRgb([lerpHue(h0, h1, t), lerp(ha[1], hb[1], t), lerp(ha[2], hb[2], t)])
    }
    case 'oklch': {
      const ca = srgbToOklch(a)
      const cb = srgbToOklch(b)
      const h0 = ca[1] < 1e-4 ? cb[2] : ca[2]
      const h1 = cb[1] < 1e-4 ? ca[2] : cb[2]
      return oklchToSrgb([lerp(ca[0], cb[0], t), lerp(ca[1], cb[1], t), lerpHue(h0, h1, t)])
    }
    case 'oklab':
    default: {
      const la = linearToOklab(srgbToLinearRgb(a))
      const lb = linearToOklab(srgbToLinearRgb(b))
      const lin = oklabToLinear([lerp(la[0], lb[0], t), lerp(la[1], lb[1], t), lerp(la[2], lb[2], t)])
      return linearToSrgbRgb([clamp01(lin[0]), clamp01(lin[1]), clamp01(lin[2])])
    }
  }
}

/** Shifts a hex color in OKLCh: dL added to lightness, chroma multiplied, hue rotated. */
export function adjustHex(hex: string, dL = 0, chromaMul = 1, dH = 0): string {
  const rgb = parseHex(hex) ?? [1, 1, 1]
  const [L, C, h] = srgbToOklch(rgb)
  return toHex(oklchToSrgb([clamp01(L + dL), Math.max(0, C * chromaMul), h + dH]))
}

/** Applies global saturation (chroma multiplier) and luminance (lightness multiplier). */
export function gradeColor(rgb: Vec3, saturation: number, luminance: number): Vec3 {
  if (saturation === 1 && luminance === 1) return rgb
  const [L, C, h] = srgbToOklch(rgb)
  return oklchToSrgb([clamp01(L * luminance), C * saturation, h])
}

export function hexToLinear(hex: string): Vec3 {
  return srgbToLinearRgb(parseHex(hex) ?? [1, 1, 1])
}

/** Relative luminance of a linear color (Rec. 709 weights). */
export function luminance(lin: Vec3): number {
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

export function formatRgb(rgb: Vec3): string {
  return `rgb(${Math.round(rgb[0] * 255)}, ${Math.round(rgb[1] * 255)}, ${Math.round(rgb[2] * 255)})`
}
