import { gradeColor, parseHex, srgbToLinearRgb, type Vec3 } from '../color/colorMath'
import { rainbowColor, resolveStops, sampleStops } from '../color/gradient'
import { bandCenter, frequencyToPosition } from '../audio/frequencyMath'
import { channelRange } from '../state/channelOps'
import type { Settings } from '../state/settingsSchema'
import { createDataTexture1D, writeHalfFloat } from '../rendering/ShaderMaterials'

export const LUT_SIZE = 256

export interface ElementColors {
  base: Vec3
  energy: Vec3
  glow: Vec3
}

interface ChannelPalette {
  primary: Vec3
  secondary: Vec3
  gradStart: Vec3
  gradEnd: Vec3
}

const ENERGY_MIX = { frequency: 0, energy: 1, both: 0.45 } as const

/**
 * Derives every color the renderers need from settings: graded per-channel colors (linear), the
 * frequency → color map (channel colors at their log-centre frequencies, crossfaded in the chosen
 * space, or a custom palette / rainbow), and a GPU LUT of that map. Recomputed only when the
 * channel or color settings change identity.
 */
export class ColorEngine {
  readonly lut = createDataTexture1D(LUT_SIZE, 4)
  /** Linear RGB samples of the frequency map along the log axis [minFrequency, maxFrequency]. */
  private lutLinear = new Float32Array(LUT_SIZE * 3)
  private palettes: ChannelPalette[] = []
  private channelsRef: Settings['channels'] | null = null
  private colorRef: Settings['color'] | null = null
  private minHz = 20
  private maxHz = 16000
  version = 0

  energyMix(settings: Settings): number {
    return ENERGY_MIX[settings.color.drive]
  }

  /** Returns true when derived colors changed this call. */
  update(settings: Settings): boolean {
    const a = settings.audio
    if (
      settings.channels === this.channelsRef &&
      settings.color === this.colorRef &&
      a.minFrequency === this.minHz &&
      a.maxFrequency === this.maxHz
    ) {
      return false
    }
    this.channelsRef = settings.channels
    this.colorRef = settings.color
    this.minHz = a.minFrequency
    this.maxHz = a.maxFrequency
    const color = settings.color
    const grade = (hex: string): Vec3 => gradeColor(parseHex(hex) ?? [1, 1, 1], color.saturation, color.luminance)

    this.palettes = settings.channels.map((ch) => ({
      primary: srgbToLinearRgb(grade(ch.color)),
      secondary: srgbToLinearRgb(grade(ch.secondaryColor)),
      gradStart: srgbToLinearRgb(grade(ch.gradientStart)),
      gradEnd: srgbToLinearRgb(grade(ch.gradientEnd)),
    }))

    let mapFn: (t: number) => Vec3
    if (color.source === 'palette') {
      const stops = resolveStops(color.palette)
      mapFn = (t) => sampleStops(stops, t, color.interpolation, color.crossfade)
    } else if (color.source === 'rainbow') {
      mapFn = (t) => rainbowColor(t)
    } else {
      const stops = settings.channels
        .filter((ch) => ch.enabled)
        .map((ch) => {
          const [lo, hi] = channelRange(ch)
          return { position: frequencyToPosition(bandCenter(lo, hi), a.minFrequency, a.maxFrequency, 'log'), rgb: parseHex(ch.color) ?? [1, 1, 1] as Vec3 }
        })
        .sort((x, y) => x.position - y.position)
      if (!stops.length) stops.push({ position: 0.5, rgb: [1, 1, 1] })
      mapFn = (t) => sampleStops(stops, t, color.interpolation, color.crossfade)
    }

    const rgba = new Float32Array(LUT_SIZE * 4)
    for (let i = 0; i < LUT_SIZE; i++) {
      const lin = srgbToLinearRgb(gradeColor(mapFn(i / (LUT_SIZE - 1)), color.saturation, color.luminance))
      this.lutLinear[i * 3] = lin[0]
      this.lutLinear[i * 3 + 1] = lin[1]
      this.lutLinear[i * 3 + 2] = lin[2]
      rgba[i * 4] = lin[0]
      rgba[i * 4 + 1] = lin[1]
      rgba[i * 4 + 2] = lin[2]
      rgba[i * 4 + 3] = 1
    }
    writeHalfFloat(this.lut, rgba)
    this.version++
    return true
  }

  /** Linear color of the frequency map at a 0..1 position on the log axis. */
  colorAtPosition(t: number, out: Vec3 = [0, 0, 0]): Vec3 {
    const x = Math.min(1, Math.max(0, t)) * (LUT_SIZE - 1)
    const i = Math.min(LUT_SIZE - 2, Math.floor(x))
    const f = x - i
    for (let k = 0; k < 3; k++) {
      const a = this.lutLinear[i * 3 + k]
      out[k] = a + (this.lutLinear[(i + 1) * 3 + k] - a) * f
    }
    return out
  }

  positionOf(hz: number): number {
    return frequencyToPosition(hz, this.minHz, this.maxHz, 'log')
  }

  colorAtFrequency(hz: number, out: Vec3 = [0, 0, 0]): Vec3 {
    return this.colorAtPosition(this.positionOf(hz), out)
  }

  channel(index: number): ChannelPalette {
    return this.palettes[index] ?? this.palettes[0]
  }

  /**
   * Colors of one visual element bound to `channel` at frequency `hz`.
   * `spatial` (0..1) places the element along the channel's own gradient (gradient start → end).
   */
  resolve(settings: Settings, channel: number, hz: number, spatial: number | null, out: ElementColors): ElementColors {
    const pal = this.channel(channel)
    const freq = this.colorAtFrequency(hz, out.base)
    switch (settings.color.drive) {
      case 'energy': {
        const start = spatial === null ? pal.gradStart : lerp3(pal.gradStart, pal.primary, spatial * 0.6)
        copy3(out.base, start)
        copy3(out.energy, pal.gradEnd)
        break
      }
      case 'both':
        copy3(out.energy, lerp3(freq, pal.gradEnd, 0.7))
        break
      default:
        copy3(out.energy, freq)
    }
    copy3(out.glow, pal.secondary)
    return out
  }

  dispose() {
    this.lut.dispose()
  }
}

export function newElementColors(): ElementColors {
  return { base: [0, 0, 0], energy: [0, 0, 0], glow: [0, 0, 0] }
}

function copy3(out: Vec3, v: Vec3) {
  out[0] = v[0]
  out[1] = v[1]
  out[2] = v[2]
}

function lerp3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

export function writeColor(arr: Float32Array, offset: number, c: Vec3, w: number) {
  arr[offset] = c[0]
  arr[offset + 1] = c[1]
  arr[offset + 2] = c[2]
  arr[offset + 3] = w
}

export function additivity(mode: Settings['channels'][number]['blendMode']): number {
  return mode === 'additive' ? 1 : mode === 'soft' ? 0.5 : 0
}
