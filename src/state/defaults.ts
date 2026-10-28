import { defaultChannels } from './channelOps'
import { SettingsSchema, type PerformanceProfile, type PerformanceSettings, type Settings } from './settingsSchema'

export const PERFORMANCE_PROFILES: Record<Exclude<PerformanceProfile, 'custom'>, Omit<PerformanceSettings, 'profile' | 'reducedMotion' | 'showStats'>> = {
  quality: {
    maxPixelRatio: 2,
    adaptiveResolution: true,
    minResolutionScale: 0.6,
    msaa: true,
    bloomLevels: 6,
    bloomResolution: 'half',
    particleBudget: 6000,
    geometryDetail: 1.5,
  },
  balanced: {
    maxPixelRatio: 1.5,
    adaptiveResolution: true,
    minResolutionScale: 0.55,
    msaa: false,
    bloomLevels: 5,
    bloomResolution: 'half',
    particleBudget: 3000,
    geometryDetail: 1,
  },
  performance: {
    maxPixelRatio: 1,
    adaptiveResolution: true,
    minResolutionScale: 0.45,
    msaa: false,
    bloomLevels: 4,
    bloomResolution: 'quarter',
    particleBudget: 1200,
    geometryDetail: 0.6,
  },
}

/** Picks a starting profile from coarse device hints (only used for first-run defaults). */
export function detectProfile(): Exclude<PerformanceProfile, 'custom'> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return 'balanced'
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
  const cores = navigator.hardwareConcurrency ?? 4
  if (coarse && (memory <= 4 || cores <= 4)) return 'performance'
  if (coarse) return 'balanced'
  if (memory >= 8 && cores >= 8) return 'quality'
  return 'balanced'
}

export function performanceDefaults(profile: Exclude<PerformanceProfile, 'custom'>): PerformanceSettings {
  return { ...SettingsSchema.shape.performance.parse({}), ...PERFORMANCE_PROFILES[profile], profile }
}

export function createDefaultSettings(profile: Exclude<PerformanceProfile, 'custom'> = 'balanced'): Settings {
  const settings = SettingsSchema.parse({ channels: defaultChannels() })
  settings.performance = performanceDefaults(profile)
  return settings
}
