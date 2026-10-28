import { describe, expect, it, vi } from 'vitest'
import { BUILTIN_PRESETS } from '../../src/presets/builtinPresets'
import { createPresetFile, mergePresetIntoSettings, parsePresetText, serializePreset, toPresetSettings } from '../../src/presets/presetIO'
import { createDefaultSettings } from '../../src/state/defaults'
import { migrateSettings, SETTINGS_VERSION, type Migration } from '../../src/state/migrations'
import { parseSettings } from '../../src/state/settingsIO'
import { createDebouncedStorage } from '../../src/state/storage'
import { mergePersisted, useAppStore } from '../../src/state/useAppStore'

describe('settings validation', () => {
  it('accepts the defaults unchanged', () => {
    const d = createDefaultSettings()
    const { settings, issues } = parseSettings(JSON.parse(JSON.stringify(d)))
    expect(issues).toEqual([])
    expect(settings).toEqual(d)
  })

  it('fills missing fields from defaults', () => {
    const { settings } = parseSettings({ channels: [{ name: 'Only', minHz: 40, maxHz: 90 }] })
    expect(settings.channels).toHaveLength(1)
    expect(settings.channels[0].name).toBe('Only')
    expect(settings.rings.count).toBe(createDefaultSettings().rings.count)
    expect(settings.effects.bloom.enabled).toBe(true)
  })

  it('clamps out-of-range numbers and resets invalid values, reporting each fix', () => {
    const { settings, issues } = parseSettings({
      channels: [{ delayMs: 99999, color: 'banana', blendMode: 'weird' }],
      rings: { count: 5000 },
      audio: { fftSize: 1000 },
    })
    expect(settings.channels[0].delayMs).toBe(3000)
    expect(settings.channels[0].color).toMatch(/^#[0-9a-f]{6}$/i)
    expect(settings.channels[0].blendMode).toBe('additive')
    expect(settings.rings.count).toBe(128)
    expect(settings.audio.fftSize).toBe(4096)
    expect(issues.length).toBeGreaterThanOrEqual(4)
  })

  it('repairs cross-field invariants and duplicate ids', () => {
    const { settings } = parseSettings({
      channels: [
        { id: 'same', minHz: 500, maxHz: 100 },
        { id: 'same', minHz: 1, maxHz: 2 },
      ],
      audio: { minDecibels: -40, maxDecibels: -60 },
    })
    expect(settings.channels[0].minHz).toBe(100)
    expect(settings.channels[0].maxHz).toBe(500)
    expect(settings.channels[0].id).not.toBe(settings.channels[1].id)
    expect(settings.audio.minDecibels).toBeLessThan(settings.audio.maxDecibels)
  })

  it('falls back to defaults for unusable data', () => {
    expect(parseSettings('garbage').settings).toEqual(expect.objectContaining({ mode: 'rings' }))
    expect(parseSettings({ channels: [] }).settings.channels.length).toBeGreaterThan(0)
  })
})

describe('schema migration', () => {
  it('runs each step from the stored version to the current one', () => {
    const table: Record<number, Migration> = {
      1: (s) => ({ ...s, step1: true }),
      2: (s) => ({ ...s, step2: true, renamed: s.old }),
    }
    const { settings } = migrateSettings({ old: 7 }, 1, 3, table)
    expect(settings).toEqual({ old: 7, step1: true, step2: true, renamed: 7 })
  })

  it('flags data from a newer version and leaves it for validation', () => {
    const r = migrateSettings({ x: 1 }, SETTINGS_VERSION + 5)
    expect(r.fromFuture).toBe(true)
  })

  it('treats garbage as an empty object', () => {
    expect(migrateSettings(null, 0).settings).toEqual({})
  })
})

describe('persistence', () => {
  it('validates persisted state when rehydrating', () => {
    const current = useAppStore.getState()
    const merged = mergePersisted(
      {
        settings: { channels: [{ name: 'Kept', delayMs: -50 }], mode: 'bars' },
        userPresets: [{ id: 'u1', name: 'Mine', settings: {} }, { broken: true }],
        activePresetId: 'u1',
      },
      current,
    )
    expect(merged.settings.mode).toBe('bars')
    expect(merged.settings.channels[0].delayMs).toBe(0)
    expect(merged.userPresets).toHaveLength(1)
    expect(merged.activePresetId).toBe('u1')
  })

  it('ignores corrupt persisted state', () => {
    const current = useAppStore.getState()
    expect(mergePersisted('not json', current)).toBe(current)
  })

  it('debounces writes and survives a failing backend', () => {
    vi.useFakeTimers()
    const writes: string[] = []
    const backend = {
      getItem: () => null,
      setItem: (_k: string, v: string) => writes.push(v),
      removeItem: () => {},
    } as unknown as Storage
    const storage = createDebouncedStorage(200, () => backend)
    storage.setItem('k', '1')
    storage.setItem('k', '2')
    storage.setItem('k', '3')
    expect(storage.getItem('k')).toBe('3')
    expect(writes).toEqual([])
    vi.advanceTimersByTime(250)
    expect(writes).toEqual(['3'])

    const failing = createDebouncedStorage(10, () => ({ setItem: () => { throw new Error('quota') }, getItem: () => { throw new Error('denied') }, removeItem: () => {} }) as unknown as Storage)
    expect(() => failing.setItem('a', 'b')).not.toThrow()
    expect(() => vi.advanceTimersByTime(20)).not.toThrow()
    expect(failing.getItem('missing')).toBeNull()
    vi.useRealTimers()
  })
})

describe('presets', () => {
  it('serializes and parses back to the same look', () => {
    const s = createDefaultSettings()
    s.mode = 'squares'
    s.channels[0].delayMs = 180
    s.channels[1].color = '#abcdef'
    const text = serializePreset('Test look', s)
    const parsed = parsePresetText(text, createDefaultSettings('performance'))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.name).toBe('Test look')
    expect(parsed.settings.mode).toBe('squares')
    expect(parsed.settings.channels[0].delayMs).toBe(180)
    expect(parsed.settings.channels[1].color).toBe('#abcdef')
  })

  it('excludes device settings and keeps the current ones on import', () => {
    const s = createDefaultSettings('quality')
    s.audio.deviceId = 'secret-mic'
    const file = createPresetFile('x', s)
    expect(file.settings.audio.deviceId).toBe('')
    expect('performance' in file.settings).toBe(false)
    const current = createDefaultSettings('performance')
    current.audio.deviceId = 'my-mic'
    const { settings } = mergePresetIntoSettings(current, toPresetSettings(s))
    expect(settings.performance.profile).toBe('performance')
    expect(settings.audio.deviceId).toBe('my-mic')
  })

  it('rejects invalid files with a readable message', () => {
    const current = createDefaultSettings()
    expect(parsePresetText('{not json', current)).toEqual({ ok: false, error: 'This file is not valid JSON.' })
    expect(parsePresetText('{"hello":1}', current).ok).toBe(false)
    expect(parsePresetText('[1,2,3]', current).ok).toBe(false)
  })

  it('imports with warnings when values are out of range', () => {
    const text = JSON.stringify({ format: 'aurora-preset', formatVersion: 1, settingsVersion: 1, name: 'Loud', settings: { rings: { count: 9000 } } })
    const r = parsePresetText(text, createDefaultSettings())
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.settings.rings.count).toBe(128)
      expect(r.warnings.some((w) => w.includes('rings.count'))).toBe(true)
    }
  })

  it('every built-in preset produces valid settings', () => {
    for (const p of BUILTIN_PRESETS) {
      const { settings, issues } = mergePresetIntoSettings(createDefaultSettings(), p.build())
      expect(issues, p.id).toEqual([])
      expect(settings.mode).toBe(p.mode)
    }
  })

  it('saves, renames, overwrites and deletes user presets in the store', () => {
    useAppStore.setState({ settings: createDefaultSettings(), userPresets: [] })
    const s = useAppStore.getState()
    const id = s.saveUserPreset('First')
    expect(useAppStore.getState().userPresets[0]).toMatchObject({ id, name: 'First' })
    s.renameUserPreset(id, 'Renamed')
    s.update((st) => void (st.rings.count = 7))
    expect(useAppStore.getState().presetDirty).toBe(true)
    s.overwriteUserPreset(id)
    expect(useAppStore.getState().userPresets[0].settings.rings.count).toBe(7)
    s.update((st) => void (st.rings.count = 50))
    s.applyUserPreset(id)
    expect(useAppStore.getState().settings.rings.count).toBe(7)
    s.deleteUserPreset(id)
    expect(useAppStore.getState().userPresets).toHaveLength(0)
  })
})
