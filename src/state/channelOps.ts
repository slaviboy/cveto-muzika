import { adjustHex, toHex } from '../color/colorMath'
import { rainbowColor, sampleGradient, type GradientStop } from '../color/gradient'
import { bandCenter, bandEdges, type FrequencyScale } from '../audio/frequencyMath'
import { createId } from '../utils/misc'
import { ChannelSchema, MAX_CHANNELS, type ChannelConfig } from './settingsSchema'

/** Musical name for a band, chosen by its centre frequency. */
export function nameForBand(lo: number, hi: number): string {
  const c = bandCenter(lo, hi)
  if (c < 60) return 'Sub'
  if (c < 250) return 'Bass'
  if (c < 500) return 'Low mids'
  if (c < 2000) return 'Mids'
  if (c < 4000) return 'Upper mids'
  if (c < 6500) return 'Presence'
  return 'Air'
}

/** Derives the supporting colors of a channel from its primary color. */
export function deriveChannelColors(color: string) {
  return {
    color,
    secondaryColor: adjustHex(color, 0.12, 0.85, 18),
    gradientStart: adjustHex(color, -0.22, 0.9, -10),
    gradientEnd: adjustHex(color, 0.16, 0.65, 14),
  }
}

export function createChannel(partial: Partial<ChannelConfig> & { color?: string } = {}): ChannelConfig {
  const colors = deriveChannelColors(partial.color ?? '#3d7bff')
  return ChannelSchema.parse({ ...colors, ...partial, id: partial.id ?? createId('ch') })
}

/** Resolves the effective [lo, hi] range of a channel, honouring centre/bandwidth mode. */
export function channelRange(ch: Pick<ChannelConfig, 'rangeMode' | 'minHz' | 'maxHz' | 'centerHz' | 'bandwidthOct'>): [number, number] {
  if (ch.rangeMode === 'center') {
    const half = Math.pow(2, ch.bandwidthOct / 2)
    return [ch.centerHz / half, ch.centerHz * half]
  }
  return ch.minHz <= ch.maxHz ? [ch.minHz, ch.maxHz] : [ch.maxHz, ch.minHz]
}

/** Gives duplicate names a numeric suffix ("Mids", "Mids 2"). */
function uniqueNames(channels: ChannelConfig[]): ChannelConfig[] {
  const seen = new Map<string, number>()
  return channels.map((ch) => {
    const n = (seen.get(ch.name) ?? 0) + 1
    seen.set(ch.name, n)
    return n === 1 ? ch : { ...ch, name: `${ch.name} ${n}` }
  })
}

export type ColorSourceFn = (t: number, index: number, count: number) => string

export const rainbowSource: ColorSourceFn = (t) => toHex(rainbowColor(t))
export const paletteSource =
  (stops: readonly GradientStop[]): ColorSourceFn =>
  (t) =>
    toHex(sampleGradient(stops, t))

export function generateChannels(
  count: number,
  minHz = 20,
  maxHz = 16000,
  scale: FrequencyScale = 'log',
  colorFn: ColorSourceFn = rainbowSource,
): ChannelConfig[] {
  const n = Math.max(1, Math.min(MAX_CHANNELS, Math.round(count)))
  const edges = bandEdges(n, minHz, maxHz, scale)
  const channels: ChannelConfig[] = []
  for (let i = 0; i < n; i++) {
    const lo = Math.round(edges[i] * 10) / 10
    const hi = Math.round(edges[i + 1] * 10) / 10
    channels.push(
      createChannel({
        name: nameForBand(lo, hi),
        minHz: lo,
        maxHz: hi,
        position: n === 1 ? 0.5 : i / (n - 1),
        color: colorFn(n === 1 ? 0.5 : i / (n - 1), i, n),
      }),
    )
  }
  return uniqueNames(channels)
}

interface BandSpec {
  name: string
  min: number
  max: number
  color: string
}

function fromSpecs(specs: BandSpec[]): ChannelConfig[] {
  return specs.map((s, i) =>
    createChannel({ name: s.name, minHz: s.min, maxHz: s.max, color: s.color, position: specs.length === 1 ? 0.5 : i / (specs.length - 1) }),
  )
}

export const AURORA_PALETTE: GradientStop[] = [
  { position: 0, color: '#3b2bff' },
  { position: 0.22, color: '#0a8dff' },
  { position: 0.45, color: '#13e0c2' },
  { position: 0.62, color: '#6dff9e' },
  { position: 0.82, color: '#b45cff' },
  { position: 1, color: '#ff5ab8' },
]

export const CHANNEL_LAYOUTS = {
  aurora: {
    label: 'Aurora six-band',
    build: () =>
      fromSpecs([
        { name: 'Sub', min: 20, max: 60, color: '#3b2bff' },
        { name: 'Bass', min: 60, max: 250, color: '#0a8dff' },
        { name: 'Low mids', min: 250, max: 500, color: '#13e0c2' },
        { name: 'Mids', min: 500, max: 2000, color: '#6dff9e' },
        { name: 'Presence', min: 2000, max: 6000, color: '#b45cff' },
        { name: 'Air', min: 6000, max: 16000, color: '#ff5ab8' },
      ]),
  },
  rgb3: {
    label: 'Three-band RGB',
    build: () =>
      fromSpecs([
        { name: 'Bass', min: 20, max: 250, color: '#ff2d4b' },
        { name: 'Mids', min: 250, max: 2000, color: '#25ff7a' },
        { name: 'Highs', min: 2000, max: 16000, color: '#2f6bff' },
      ]),
  },
  spectrum6: {
    label: 'Six-band spectrum',
    build: () => generateChannels(6, 20, 16000, 'log', paletteSource(AURORA_PALETTE)),
  },
  rainbow8: {
    label: 'Eight-band rainbow',
    build: () => generateChannels(8, 20, 16000, 'log', rainbowSource),
  },
  deepWarmBright: {
    label: 'Deep bass, warm mids, bright highs',
    build: () =>
      fromSpecs([
        { name: 'Deep bass', min: 20, max: 120, color: '#3a2bff' },
        { name: 'Warm mids', min: 120, max: 2000, color: '#ff9a3d' },
        { name: 'Bright highs', min: 2000, max: 16000, color: '#dff4ff' },
      ]),
  },
  deepSpectrum: {
    label: 'Custom mapping (deep spectrum)',
    build: () =>
      fromSpecs([
        { name: 'Sub', min: 20, max: 80, color: '#1d2bff' },
        { name: 'Bass', min: 80, max: 250, color: '#00d5ff' },
        { name: 'Low mids', min: 250, max: 1000, color: '#8b4dff' },
        { name: 'Upper mids', min: 1000, max: 4000, color: '#ff3bd4' },
        { name: 'Highs', min: 4000, max: 12000, color: '#ff8a2a' },
      ]),
  },
} as const

export type ChannelLayoutId = keyof typeof CHANNEL_LAYOUTS

export function defaultChannels(): ChannelConfig[] {
  return CHANNEL_LAYOUTS.aurora.build()
}

/** New channel placed above the current highest band (or splitting the range if there is no room). */
export function nextChannel(channels: ChannelConfig[]): ChannelConfig {
  const ranges = channels.map(channelRange)
  const top = ranges.reduce((m, r) => Math.max(m, r[1]), 0)
  let lo = top > 0 ? top : 20
  let hi = Math.min(20000, lo * 2)
  if (hi - lo < 50) {
    lo = 2000
    hi = 6000
  }
  const t = channels.length / Math.max(1, Math.min(MAX_CHANNELS, channels.length + 1))
  return createChannel({ name: nameForBand(lo, hi), minHz: Math.round(lo), maxHz: Math.round(hi), color: toHex(rainbowColor(t)) })
}

export function duplicateChannel(ch: ChannelConfig): ChannelConfig {
  return { ...ch, id: createId('ch'), name: `${ch.name} copy`.slice(0, 40) }
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return list
  const next = list.slice()
  const [item] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item)
  return next
}

/**
 * Element → channel assignment used by every visualization.
 * grouped: contiguous blocks; cycled: round-robin; perChannel: one element per channel.
 */
export function assignChannel(index: number, count: number, channelCount: number, mode: 'grouped' | 'cycled'): number {
  if (channelCount <= 1) return 0
  if (mode === 'cycled') return index % channelCount
  return Math.min(channelCount - 1, Math.floor((index * channelCount) / Math.max(1, count)))
}
