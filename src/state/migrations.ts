/**
 * Settings schema versioning. Bump SETTINGS_VERSION whenever the persisted shape or a default
 * changes in a way the zod defaults cannot absorb, and register a migration keyed by the version
 * it upgrades FROM.
 */
export const SETTINGS_VERSION = 2

export type Migration = (settings: Record<string, unknown>) => Record<string, unknown>

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/** MIGRATIONS[n] upgrades a settings object from version n to n + 1. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  // Version 0 = unversioned data written before versioning existed; the shape is identical.
  0: (s) => s,
  // Version 2: LED rings no longer rotate by default, and the background is static by default
  // (no luminous dust, no bass breathing). Values still at the old defaults move to the new ones;
  // anything a user changed on purpose is kept.
  1: (s) => {
    const out: Obj = { ...s }
    if (isObj(out.leds) && out.leds.rotationSpeed === 0.04) out.leds = { ...out.leds, rotationSpeed: 0 }
    if (isObj(out.background) && out.background.reactivity === 0.2) out.background = { ...out.background, reactivity: 0 }
    if (isObj(out.effects) && isObj(out.effects.particles)) {
      const p = out.effects.particles
      if (p.enabled === true && (p.amount === 0.35 || p.amount === 0.45)) {
        out.effects = { ...out.effects, particles: { ...p, enabled: false } }
      }
    }
    return out
  },
}

export interface MigrationResult {
  settings: Record<string, unknown>
  /** True when the data came from a newer app version; unknown fields will be dropped. */
  fromFuture: boolean
}

export function migrateSettings(
  settings: unknown,
  fromVersion: number,
  toVersion: number = SETTINGS_VERSION,
  table: Readonly<Record<number, Migration>> = MIGRATIONS,
): MigrationResult {
  let current: Record<string, unknown> = isObj(settings) ? { ...settings } : {}
  const from = Number.isFinite(fromVersion) ? Math.max(0, Math.floor(fromVersion)) : 0
  if (from > toVersion) return { settings: current, fromFuture: true }
  for (let v = from; v < toVersion; v++) {
    const step = table[v]
    if (step) current = step(current)
  }
  return { settings: current, fromFuture: false }
}
