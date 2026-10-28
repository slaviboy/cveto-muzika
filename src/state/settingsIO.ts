import type { z } from 'zod'
import { createId, isPlainObject, jsonClone } from '../utils/misc'
import { defaultChannels } from './channelOps'
import { createDefaultSettings } from './defaults'
import { MAX_CHANNELS, SettingsSchema, type Settings } from './settingsSchema'

export interface ParseResult {
  settings: Settings
  /** Human-readable notes about values that were clamped or reset. */
  issues: string[]
}

type Container = Record<string, unknown> | unknown[]

function getParent(root: Container, path: PropertyKey[]): { parent: Container; key: PropertyKey } | null {
  let node: unknown = root
  for (let i = 0; i < path.length - 1; i++) {
    if (node === null || typeof node !== 'object') return null
    node = (node as Record<PropertyKey, unknown>)[path[i] as string]
  }
  if (node === null || typeof node !== 'object') return null
  return { parent: node as Container, key: path[path.length - 1] }
}

function describe(path: PropertyKey[]): string {
  return path.map((p) => (typeof p === 'number' ? `[${p}]` : String(p))).join('.').replace(/\.\[/g, '[')
}

/** Repairs one zod issue in place. Returns false when the issue cannot be repaired locally. */
function repair(root: Record<string, unknown>, issue: z.core.$ZodIssue): boolean {
  const path = issue.path
  if (path.length === 0) return false
  const loc = getParent(root, path)
  if (!loc) return false
  const { parent, key } = loc
  const value = (parent as Record<PropertyKey, unknown>)[key as string]

  if ((issue.code === 'too_big' || issue.code === 'too_small') && typeof value === 'number') {
    const bound = issue.code === 'too_big' ? Number(issue.maximum) : Number(issue.minimum)
    ;(parent as Record<PropertyKey, unknown>)[key as string] = bound
    return true
  }
  if (issue.code === 'too_big' && Array.isArray(value)) {
    value.length = Number(issue.maximum)
    return true
  }
  if (Array.isArray(parent) && typeof key === 'number') {
    parent.splice(key, 1)
    return true
  }
  delete (parent as Record<PropertyKey, unknown>)[key as string]
  return true
}

/** Fixes cross-field invariants zod cannot express per field. */
export function normalizeSettings(s: Settings): Settings {
  const ids = new Set<string>()
  for (const ch of s.channels) {
    if (ids.has(ch.id) || ch.id === 'ch') ch.id = createId('ch')
    ids.add(ch.id)
    if (ch.minHz > ch.maxHz) [ch.minHz, ch.maxHz] = [ch.maxHz, ch.minHz]
    if (ch.maxHz - ch.minHz < 1) ch.maxHz = ch.minHz + 1
    if (ch.minIntensity > ch.maxIntensity) [ch.minIntensity, ch.maxIntensity] = [ch.maxIntensity, ch.minIntensity]
  }
  const a = s.audio
  if (a.minDecibels >= a.maxDecibels) a.maxDecibels = Math.min(0, a.minDecibels + 10)
  if (a.minDecibels >= a.maxDecibels) a.minDecibels = a.maxDecibels - 10
  if (a.minFrequency >= a.maxFrequency) [a.minFrequency, a.maxFrequency] = [20, 16000]
  for (const geo of [s.rings, s.leds]) {
    if (geo.innerRadius > geo.outerRadius) [geo.innerRadius, geo.outerRadius] = [geo.outerRadius, geo.innerRadius]
  }
  return s
}

/**
 * Validates arbitrary data against the settings schema. Out-of-range numbers are clamped,
 * invalid fields fall back to defaults and unknown keys are dropped — every repair is reported.
 */
export function parseSettings(raw: unknown): ParseResult {
  const issues: string[] = []
  if (!isPlainObject(raw)) {
    return { settings: createDefaultSettings(), issues: ['Settings were not an object; defaults were used.'] }
  }
  let data: Record<string, unknown>
  try {
    data = jsonClone(raw)
  } catch {
    return { settings: createDefaultSettings(), issues: ['Settings could not be read; defaults were used.'] }
  }
  if (!Array.isArray(data.channels) || data.channels.length === 0) {
    if (data.channels !== undefined) issues.push('channels: invalid list; default channels were used.')
    data.channels = defaultChannels()
  } else if (data.channels.length > MAX_CHANNELS) {
    issues.push(`channels: limited to ${MAX_CHANNELS}.`)
    data.channels = data.channels.slice(0, MAX_CHANNELS)
  }

  for (let attempt = 0; attempt < 64; attempt++) {
    const result = SettingsSchema.safeParse(data)
    if (result.success) {
      if (result.data.channels.length === 0) result.data.channels = defaultChannels()
      return { settings: normalizeSettings(result.data), issues: [...new Set(issues)] }
    }
    let repaired = false
    for (const issue of result.error.issues) {
      issues.push(`${describe(issue.path) || 'settings'}: ${issue.message}`)
      if (repair(data, issue)) repaired = true
    }
    if (!Array.isArray(data.channels) || data.channels.length === 0) data.channels = defaultChannels()
    if (!repaired) break
  }
  return { settings: createDefaultSettings(), issues: [...new Set(issues), 'Settings could not be repaired; defaults were used.'] }
}
