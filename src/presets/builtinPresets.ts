import { CHANNEL_LAYOUTS, AURORA_PALETTE } from '../state/channelOps'
import type { Settings, VisualizationMode } from '../state/settingsSchema'
import type { DeepPartial } from '../utils/misc'

export interface BuiltinPreset {
  id: string
  name: string
  description: string
  mode: VisualizationMode
  build: () => DeepPartial<Settings>
}

export const BUILTIN_PRESETS: BuiltinPreset[] = [
  {
    id: 'aurora',
    name: 'Aurora',
    description: 'Six bands of luminous rings with a soft core.',
    mode: 'rings',
    build: () => ({ channels: CHANNEL_LAYOUTS.aurora.build(), mode: 'rings' }),
  },
  {
    id: 'rgb3',
    name: 'Three-band RGB',
    description: 'Bass in red, mids in green, highs in blue.',
    mode: 'rings',
    build: () => ({
      channels: CHANNEL_LAYOUTS.rgb3.build(),
      mode: 'rings',
      rings: { count: 18, thickness: 0.007, distortionLobes: 3, center: 'pulse' },
      color: { drive: 'frequency', crossfade: 0.25 },
    }),
  },
  {
    id: 'spectrum6',
    name: 'Six-band spectrum',
    description: 'A segmented equalizer across six log-spaced bands.',
    mode: 'bars',
    build: () => ({
      channels: CHANNEL_LAYOUTS.spectrum6.build(),
      mode: 'bars',
      bars: { style: 'equalizer', columns: 48, rows: 18, segmented: true, peakMarkers: true, colorMode: 'channel' },
    }),
  },
  {
    id: 'rainbow8',
    name: 'Eight-band rainbow',
    description: 'Concentric LED rows, one rainbow band each.',
    mode: 'leds',
    build: () => ({
      channels: CHANNEL_LAYOUTS.rainbow8.build(),
      mode: 'leds',
      leds: { rows: 16, ledsPerRow: 128, mapping: 'rowPerBand', rowStyle: 'spectrum' },
    }),
  },
  {
    id: 'deep-warm-bright',
    name: 'Deep, warm, bright',
    description: 'Indigo bass, amber mids and icy highs.',
    mode: 'rings',
    build: () => ({
      channels: CHANNEL_LAYOUTS.deepWarmBright.build(),
      mode: 'rings',
      rings: { count: 36, thickness: 0.004, glowWidth: 0.05, spacingCurve: 1.4, center: 'orb', centerSize: 0.1 },
      background: { colorA: '#0b0710', colorB: '#010102' },
    }),
  },
  {
    id: 'deep-spectrum',
    name: 'Deep spectrum',
    description: 'Five custom ranges that blend smoothly into each other.',
    mode: 'rings',
    build: () => ({
      channels: CHANNEL_LAYOUTS.deepSpectrum.build(),
      mode: 'rings',
      rings: { count: 64, assignment: 'spectrum', thickness: 0.0028, glowWidth: 0.028, distortion: 0.006, spectrumWarp: 0.03 },
      color: { crossfade: 1, drive: 'frequency' },
    }),
  },
  {
    id: 'led-installation',
    name: 'LED installation',
    description: 'Every LED mixes neighbouring bands, with pulse waves on the beat.',
    mode: 'leds',
    build: () => ({
      channels: CHANNEL_LAYOUTS.aurora.build(),
      mode: 'leds',
      leds: { rows: 20, ledsPerRow: 160, mapping: 'ledMix', mixPattern: 'spiral', mixSpread: 0.8, pulseWaves: true, ledSize: 0.55 },
      color: { source: 'palette', palette: AURORA_PALETTE, crossfade: 1 },
    }),
  },
  {
    id: 'light-wall',
    name: 'Light wall',
    description: 'A full-screen wall of cells, mirrored from the centre.',
    mode: 'bars',
    build: () => ({
      channels: CHANNEL_LAYOUTS.spectrum6.build(),
      mode: 'bars',
      bars: { style: 'lightwall', rows: 12, columns: 64, mirror: 'both', waveProp: 0.45, gap: 0.18, cornerRadius: 0.3, glow: 0.8 },
      effects: { particles: { enabled: false } },
    }),
  },
  {
    id: 'neon-equalizer',
    name: 'Neon equalizer',
    description: 'Mirrored bars with vertical gradients and peak markers.',
    mode: 'bars',
    build: () => ({
      channels: CHANNEL_LAYOUTS.rainbow8.build(),
      mode: 'bars',
      bars: { style: 'equalizer', columns: 40, rows: 22, mirror: 'vertical', colorMode: 'vertical', peakMarkers: true, heightScale: 0.9 },
    }),
  },
  {
    id: 'square-pulse',
    name: 'Square pulse',
    description: 'Nested squares that twist and breathe with the bass.',
    mode: 'squares',
    build: () => ({
      channels: CHANNEL_LAYOUTS.deepSpectrum.build(),
      mode: 'squares',
      squares: { layout: 'nested', layers: 22, twist: 4.5, rotationSpeed: 0.05, scalePulse: 0.08 },
      effects: { shockwave: { enabled: true, strength: 0.3 } },
    }),
  },
  {
    id: 'square-waves',
    name: 'Square waves',
    description: 'Bass ripples outward through a grid of tiles.',
    mode: 'squares',
    build: () => ({
      channels: CHANNEL_LAYOUTS.aurora.build(),
      mode: 'squares',
      squares: { layout: 'waves', rows: 21, columns: 21, mapping: 'radius', waveSpeedMs: 55, gap: 0.2, cornerRadius: 0.2, symmetry: 'quad' },
    }),
  },
  {
    id: 'kaleidoscope',
    name: 'Kaleidoscope',
    description: 'Folded rings with trails and a hint of chromatic fringe.',
    mode: 'rings',
    build: () => ({
      channels: CHANNEL_LAYOUTS.rainbow8.build(),
      mode: 'rings',
      rings: { count: 40, distortion: 0.04, distortionLobes: 7, spectrumWarp: 0.06, mirror: true },
      effects: {
        kaleidoscope: { enabled: true, segments: 8 },
        trails: { enabled: true, persistence: 0.86 },
        chromaticAberration: { enabled: true, amount: 0.3 },
        feedback: { enabled: true, zoom: 0.006, rotation: 0.003, hueShift: 0.02 },
      },
    }),
  },
  {
    id: 'tunnel',
    name: 'Tunnel',
    description: 'Square rings receding in depth with slow camera drift.',
    mode: 'rings',
    build: () => ({
      channels: CHANNEL_LAYOUTS.deepSpectrum.build(),
      mode: 'rings',
      rings: { count: 48, shape: 'square', depth: 1.2, rotationSpeed: 0.08, distortion: 0.004, center: 'none' },
      effects: { camera: { enabled: true, motion: 0.5, tilt: 0.45 }, parallax: { enabled: true } },
    }),
  },
]

export function findBuiltinPreset(id: string): BuiltinPreset | undefined {
  return BUILTIN_PRESETS.find((p) => p.id === id)
}
