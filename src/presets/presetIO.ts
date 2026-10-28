import { createDefaultSettings } from '../state/defaults'
import { migrateSettings, SETTINGS_VERSION } from '../state/migrations'
import { parseSettings } from '../state/settingsIO'
import type { Settings } from '../state/settingsSchema'
import { deepMerge, isPlainObject, jsonClone } from '../utils/misc'

export const PRESET_FORMAT = 'aurora-preset'
export const PRESET_FORMAT_VERSION = 1

export type PresetSettings = Omit<Settings, 'performance'>

export interface PresetFile {
  format: typeof PRESET_FORMAT
  formatVersion: number
  settingsVersion: number
  name: string
  createdAt: string
  settings: PresetSettings
}

export interface UserPreset {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  settings: PresetSettings
}

/** Strips device-specific values: performance tuning and the selected microphone. */
export function toPresetSettings(settings: Settings): PresetSettings {
  const { performance: _performance, ...rest } = jsonClone(settings)
  rest.audio.deviceId = ''
  return rest
}

export function createPresetFile(name: string, settings: Settings, now = new Date()): PresetFile {
  return {
    format: PRESET_FORMAT,
    formatVersion: PRESET_FORMAT_VERSION,
    settingsVersion: SETTINGS_VERSION,
    name: name.trim() || 'Untitled preset',
    createdAt: now.toISOString(),
    settings: toPresetSettings(settings),
  }
}

/** Serializes a stored user preset without touching the current settings. */
export function serializeUserPreset(preset: UserPreset): string {
  const file: PresetFile = {
    format: PRESET_FORMAT,
    formatVersion: PRESET_FORMAT_VERSION,
    settingsVersion: SETTINGS_VERSION,
    name: preset.name,
    createdAt: preset.createdAt,
    settings: preset.settings,
  }
  return JSON.stringify(file, null, 2)
}

export function serializePreset(name: string, settings: Settings): string {
  return JSON.stringify(createPresetFile(name, settings), null, 2)
}

/**
 * Applies preset values on top of the current device-specific settings (performance profile,
 * microphone, demo monitoring) so loading a look never changes how the device performs.
 */
export function mergePresetIntoSettings(current: Settings, preset: unknown): { settings: Settings; issues: string[] } {
  const patch = isPlainObject(preset) ? { ...preset } : {}
  delete patch.performance
  const base = createDefaultSettings()
  const merged = deepMerge(base, patch) as Settings
  merged.performance = jsonClone(current.performance)
  merged.audio = {
    ...merged.audio,
    deviceId: current.audio.deviceId,
    demoMonitor: current.audio.demoMonitor,
    demoVolume: current.audio.demoVolume,
  }
  return parseSettings(merged)
}

export type ImportResult =
  | { ok: true; name: string; settings: Settings; warnings: string[] }
  | { ok: false; error: string }

export function parsePresetText(text: string, current: Settings): ImportResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' }
  }
  if (!isPlainObject(data)) return { ok: false, error: 'This file does not contain an Aurora preset.' }

  let name = 'Imported preset'
  let rawSettings: unknown
  let version = SETTINGS_VERSION
  const warnings: string[] = []

  if (data.format === PRESET_FORMAT) {
    if (typeof data.formatVersion === 'number' && data.formatVersion > PRESET_FORMAT_VERSION) {
      warnings.push('This preset was made with a newer version of Aurora. Unknown options were skipped.')
    }
    if (typeof data.name === 'string' && data.name.trim()) name = data.name.trim().slice(0, 60)
    if (typeof data.settingsVersion === 'number') version = data.settingsVersion
    rawSettings = data.settings
  } else if (Array.isArray(data.channels)) {
    // A bare settings object (e.g. copied from localStorage) is accepted as well.
    rawSettings = data
    warnings.push('The file had no preset header; it was read as raw settings.')
  } else {
    return { ok: false, error: 'This file does not contain an Aurora preset.' }
  }
  if (!isPlainObject(rawSettings)) return { ok: false, error: 'The preset has no settings.' }

  const migrated = migrateSettings(rawSettings, version)
  if (migrated.fromFuture && !warnings.length) warnings.push('This preset was made with a newer version of Aurora.')
  const { settings, issues } = mergePresetIntoSettings(current, migrated.settings)
  return { ok: true, name, settings, warnings: [...warnings, ...issues] }
}
