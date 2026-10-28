import { z } from 'zod'

/**
 * Single source of truth for every persisted / exported setting.
 * All fields carry defaults, so partial objects (old saves, hand-written presets) parse cleanly.
 */
export const MAX_CHANNELS = 32
export const MAX_DELAY_MS = 3000
export const FFT_SIZES = [512, 1024, 2048, 4096, 8192] as const

const num = (min: number, max: number, def: number) => z.number().min(min).max(max).default(def)
const int = (min: number, max: number, def: number) => z.number().int().min(min).max(max).default(def)
const bool = (def: boolean) => z.boolean().default(def)
const hex = (def: string) =>
  z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Expected a #rrggbb color')
    .default(def)
const pick = <const T extends readonly [string, ...string[]]>(values: T, def: T[number]) =>
  z.enum(values).default(def as never)

export const GradientStopSchema = z.object({
  position: num(0, 1, 0),
  color: hex('#ffffff'),
})

export const ChannelSchema = z.object({
  id: z.string().min(1).max(64).default('ch'),
  name: z.string().max(40).default('Channel'),
  enabled: bool(true),
  rangeMode: pick(['range', 'center'], 'range'),
  minHz: num(1, 24000, 20),
  maxHz: num(1, 24000, 250),
  centerHz: num(10, 24000, 100),
  bandwidthOct: num(0.05, 6, 1),
  scale: pick(['log', 'linear'], 'log'),
  color: hex('#3d7bff'),
  secondaryColor: hex('#8fb2ff'),
  gradientStart: hex('#1c2f8a'),
  gradientEnd: hex('#e6eeff'),
  opacity: num(0, 1, 1),
  brightness: num(0, 4, 1),
  contrast: num(0.1, 4, 1),
  sensitivity: num(0, 8, 1),
  gainDb: num(-36, 36, 0),
  delayMs: num(0, MAX_DELAY_MS, 0),
  attackMs: num(0, 2000, 18),
  releaseMs: num(0, 5000, 240),
  threshold: num(0, 0.95, 0.03),
  minIntensity: num(0, 1, 0),
  maxIntensity: num(0, 2, 1),
  glow: num(0, 3, 1),
  position: num(0, 1, 0.5),
  blendMode: pick(['additive', 'normal', 'soft'], 'additive'),
  curve: pick(['linear', 'smooth', 'punchy', 'soft', 'gamma'], 'smooth'),
  curveGamma: num(0.2, 5, 1),
})

export const AudioSchema = z.object({
  fftSize: z.literal(FFT_SIZES).default(4096),
  smoothingTimeConstant: num(0, 0.99, 0.45),
  minDecibels: num(-140, -30, -92),
  maxDecibels: num(-80, 0, -22),
  minFrequency: num(10, 2000, 20),
  maxFrequency: num(500, 24000, 16000),
  frequencyScale: pick(['log', 'linear'], 'log'),
  sensitivity: num(0, 8, 1),
  gainDb: num(-36, 36, 0),
  tiltDbPerOctave: num(-6, 12, 3),
  noiseReduction: num(0, 1, 0.35),
  spectralFilter: pick(['off', 'median3', 'median5'], 'off'),
  autoGain: pick(['off', 'global', 'perChannel'], 'global'),
  autoGainTarget: num(0.3, 1, 0.72),
  adaptiveThreshold: num(0, 1, 0),
  peakHoldMs: num(0, 3000, 450),
  peakDecay: num(0.05, 5, 0.9),
  beatSensitivity: num(0.5, 3, 1.35),
  demoMonitor: bool(true),
  demoVolume: num(0, 1, 0.55),
  deviceId: z.string().max(512).default(''),
})

export const TimingSchema = z.object({
  globalDelayMs: num(0, 1000, 0),
  animationSpeed: num(0, 3, 1),
})

export const RingsSchema = z.object({
  count: int(1, 128, 24),
  assignment: pick(['grouped', 'perChannel', 'cycled', 'spectrum'], 'grouped'),
  radiusSource: pick(['auto', 'channel'], 'auto'),
  innerRadius: num(0, 0.95, 0.16),
  outerRadius: num(0.1, 1.5, 0.94),
  spacingCurve: num(0.3, 3, 1.15),
  thickness: num(0.0005, 0.08, 0.0055),
  thicknessReactivity: num(0, 6, 1.6),
  radiusReactivity: num(0, 0.3, 0.035),
  opacityReactivity: num(0, 1, 0.65),
  glowWidth: num(0, 0.2, 0.024),
  distortion: num(0, 0.25, 0.014),
  distortionLobes: int(0, 24, 5),
  distortionSpeed: num(-4, 4, 0.4),
  spectrumWarp: num(0, 0.25, 0.02),
  rotationSpeed: num(-2, 2, 0.06),
  alternateRotation: bool(true),
  mirror: bool(true),
  shape: pick(['circle', 'square'], 'circle'),
  colorStyle: pick(['channel', 'radial', 'angular', 'energy'], 'channel'),
  center: pick(['none', 'orb', 'pulse'], 'orb'),
  centerSize: num(0, 0.4, 0.075),
  peakRings: bool(true),
  depth: num(0, 2, 0),
})

export const LedsSchema = z.object({
  rows: int(1, 48, 14),
  ledsPerRow: int(4, 512, 112),
  constantSpacing: bool(true),
  innerRadius: num(0, 0.95, 0.2),
  outerRadius: num(0.1, 1.5, 0.95),
  ledSize: num(0.1, 1.5, 0.62),
  shape: pick(['round', 'square', 'diamond'], 'round'),
  mapping: pick(['rowPerBand', 'ledMix'], 'rowPerBand'),
  rowStyle: pick(['spectrum', 'uniform', 'arc'], 'spectrum'),
  mixPattern: pick(['angular', 'radial', 'spiral', 'checker'], 'angular'),
  mixSpread: num(0.05, 3, 0.6),
  pulseWaves: bool(true),
  pulseSpeedMs: num(10, 200, 45),
  rotationSpeed: num(-2, 2, 0.04),
  alternateRotation: bool(true),
  rainbow: num(0, 1, 0),
  unlitLevel: num(0, 0.3, 0.045),
  diffusion: num(0, 1, 0.55),
})

export const BarsSchema = z.object({
  style: pick(['equalizer', 'lightwall'], 'equalizer'),
  orientation: pick(['vertical', 'horizontal'], 'vertical'),
  rows: int(1, 64, 18),
  columns: int(1, 256, 48),
  gap: num(0, 0.9, 0.28),
  segmented: bool(true),
  segmentGap: num(0, 0.9, 0.3),
  cornerRadius: num(0, 0.5, 0.25),
  mirror: pick(['none', 'horizontal', 'vertical', 'both'], 'none'),
  peakMarkers: bool(true),
  waveProp: num(0, 1, 0),
  distribution: pick(['log', 'linear'], 'log'),
  heightScale: num(0.1, 1, 0.78),
  widthScale: num(0.2, 1, 0.9),
  colorMode: pick(['channel', 'vertical', 'frequency'], 'channel'),
  glow: num(0, 2, 0.6),
})

export const SquaresSchema = z.object({
  layout: pick(['concentric', 'nested', 'matrix', 'tiles', 'waves'], 'concentric'),
  layers: int(1, 64, 16),
  rows: int(1, 64, 17),
  columns: int(1, 64, 17),
  mapping: pick(['radius', 'row', 'column', 'cell', 'spectrum'], 'radius'),
  size: num(0.2, 1.5, 0.9),
  gap: num(0, 0.9, 0.22),
  cornerRadius: num(0, 0.5, 0.12),
  thickness: num(0.0005, 0.08, 0.005),
  glowWidth: num(0, 0.2, 0.03),
  rotation: num(-180, 180, 0),
  rotationSpeed: num(-2, 2, 0),
  twist: num(-45, 45, 4),
  scalePulse: num(0, 0.5, 0.06),
  displacement: num(0, 0.3, 0),
  symmetry: pick(['none', 'mirror', 'quad', 'kaleido'], 'none'),
  waveSpeedMs: num(10, 400, 70),
})

export const ColorSchema = z.object({
  source: pick(['channels', 'palette', 'rainbow'], 'channels'),
  drive: pick(['frequency', 'energy', 'both'], 'both'),
  interpolation: pick(['oklab', 'oklch', 'linear', 'srgb', 'hsl'], 'oklab'),
  crossfade: num(0, 1, 0.65),
  saturation: num(0, 2, 1),
  luminance: num(0.2, 2, 1),
  glowTint: num(0, 1, 0.4),
  palette: z
    .array(GradientStopSchema)
    .min(2)
    .max(16)
    .default([
      { position: 0, color: '#2a3bff' },
      { position: 0.3, color: '#00c2ff' },
      { position: 0.55, color: '#21f0b5' },
      { position: 0.8, color: '#a35cff' },
      { position: 1, color: '#ff5ab4' },
    ]),
})

export const BackgroundSchema = z.object({
  style: pick(['solid', 'linear', 'radial'], 'radial'),
  colorA: hex('#070912'),
  colorB: hex('#010103'),
  angle: num(0, 360, 90),
  reactivity: num(0, 1, 0.2),
})

export const ToneSchema = z.object({
  exposure: num(0.1, 4, 1),
  contrast: num(0.5, 2, 1.05),
  saturation: num(0, 2, 1.05),
  toneMapping: pick(['neon', 'agx', 'aces', 'reinhard', 'none'], 'neon'),
})

const effect = <T extends z.ZodRawShape>(enabled: boolean, shape: T) => z.object({ enabled: bool(enabled), ...shape }).prefault({} as never)

export const EffectsSchema = z.object({
  bloom: effect(true, { intensity: num(0, 3, 0.65), threshold: num(0, 2, 0.45), radius: num(0, 1, 0.65) }),
  vignette: effect(true, { amount: num(0, 1, 0.45), softness: num(0.05, 1, 0.6) }),
  chromaticAberration: effect(false, { amount: num(0, 1, 0.25), reactivity: num(0, 1, 0.5) }),
  grain: effect(false, { amount: num(0, 1, 0.25) }),
  trails: effect(false, { persistence: num(0, 0.98, 0.82) }),
  feedback: effect(false, { zoom: num(-0.05, 0.05, 0.008), rotation: num(-0.05, 0.05, 0.004), hueShift: num(-0.2, 0.2, 0.02) }),
  radialDistortion: effect(false, { amount: num(-1, 1, 0.18), reactivity: num(0, 1, 0.5) }),
  waveDistortion: effect(false, { amount: num(0, 0.1, 0.012), frequency: num(0.5, 40, 9), speed: num(0, 5, 0.8) }),
  kaleidoscope: effect(false, { segments: int(2, 24, 6), rotationSpeed: num(-1, 1, 0.05) }),
  particles: effect(true, { amount: num(0, 1, 0.35), size: num(0.2, 4, 1.1), speed: num(0, 3, 0.5), reactivity: num(0, 2, 0.8) }),
  displacement: effect(false, { amount: num(0, 0.2, 0.025), scale: num(0.5, 20, 4) }),
  pulse: effect(false, { amount: num(0, 0.3, 0.05) }),
  camera: effect(false, { motion: num(0, 1, 0.35), speed: num(0, 2, 0.25), tilt: num(0, 1, 0.3) }),
  parallax: effect(false, { depth: num(0, 1, 0.5) }),
  beatFlash: effect(false, { intensity: num(0, 1, 0.18), color: hex('#9fb7ff') }),
  shockwave: effect(false, { strength: num(0, 1, 0.35), speed: num(0.2, 4, 1.4) }),
})

export const PerformanceSchema = z.object({
  profile: pick(['quality', 'balanced', 'performance', 'custom'], 'balanced'),
  maxPixelRatio: num(0.5, 3, 1.5),
  adaptiveResolution: bool(true),
  minResolutionScale: num(0.3, 1, 0.55),
  msaa: bool(false),
  bloomLevels: int(2, 7, 5),
  bloomResolution: pick(['half', 'quarter'], 'half'),
  particleBudget: int(0, 20000, 3000),
  geometryDetail: num(0.25, 2, 1),
  reducedMotion: pick(['system', 'on', 'off'], 'system'),
  showStats: bool(false),
})

const prefault = <T extends z.ZodType>(schema: T) => schema.prefault({} as never)

export const SettingsSchema = z.object({
  audio: prefault(AudioSchema),
  channels: z.array(ChannelSchema).min(1).max(MAX_CHANNELS),
  mode: pick(['rings', 'leds', 'bars', 'squares'], 'rings'),
  rings: prefault(RingsSchema),
  leds: prefault(LedsSchema),
  bars: prefault(BarsSchema),
  squares: prefault(SquaresSchema),
  color: prefault(ColorSchema),
  background: prefault(BackgroundSchema),
  tone: prefault(ToneSchema),
  effects: prefault(EffectsSchema),
  timing: prefault(TimingSchema),
  performance: prefault(PerformanceSchema),
})

export type Settings = z.infer<typeof SettingsSchema>
export type ChannelConfig = z.infer<typeof ChannelSchema>
export type AudioSettings = Settings['audio']
export type RingsSettings = Settings['rings']
export type LedsSettings = Settings['leds']
export type BarsSettings = Settings['bars']
export type SquaresSettings = Settings['squares']
export type ColorSettings = Settings['color']
export type BackgroundSettings = Settings['background']
export type ToneSettings = Settings['tone']
export type EffectsSettings = Settings['effects']
export type PerformanceSettings = Settings['performance']
export type TimingSettings = Settings['timing']
export type GradientStopConfig = z.infer<typeof GradientStopSchema>
export type VisualizationMode = Settings['mode']
export type PerformanceProfile = PerformanceSettings['profile']

export const VISUALIZATION_MODES: readonly VisualizationMode[] = ['rings', 'leds', 'bars', 'squares']
