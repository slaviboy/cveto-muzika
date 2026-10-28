/**
 * Settings schema versioning. Bump SETTINGS_VERSION whenever the persisted shape changes in a way
 * the zod defaults cannot absorb, and register a migration keyed by the version it upgrades FROM.
 */
export const SETTINGS_VERSION = 1

export type Migration = (settings: Record<string, unknown>) => Record<string, unknown>

/** MIGRATIONS[n] upgrades a settings object from version n to n + 1. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  // Version 0 = unversioned data written before versioning existed; the shape is identical.
  0: (s) => s,
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
  let current: Record<string, unknown> =
    typeof settings === 'object' && settings !== null && !Array.isArray(settings) ? { ...(settings as Record<string, unknown>) } : {}
  const from = Number.isFinite(fromVersion) ? Math.max(0, Math.floor(fromVersion)) : 0
  if (from > toVersion) return { settings: current, fromFuture: true }
  for (let v = from; v < toVersion; v++) {
    const step = table[v]
    if (step) current = step(current)
  }
  return { settings: current, fromFuture: false }
}
