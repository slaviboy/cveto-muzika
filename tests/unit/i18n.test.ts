import { describe, expect, it } from 'vitest'
import { SHORTCUTS } from '../../src/app/shortcuts'
import { EFFECTS } from '../../src/components/settings/effectsMeta'
import { SECTIONS } from '../../src/components/settings/sectionMeta'
import { MODE_COPY, MODE_LABELS } from '../../src/components/visualizer/modeLabels'
import { BAND_NAME_KEYS, relabelBandName, translate } from '../../src/i18n'
import { bg } from '../../src/i18n/bg'
import { BUILTIN_PRESETS } from '../../src/presets/builtinPresets'
import { PRESET_MESSAGES } from '../../src/presets/presetIO'
import { CHANNEL_LAYOUTS, generateChannels } from '../../src/state/channelOps'
import { AUDIO_ERROR_COPY } from '../../src/types/audio'

/** Every literal t('…') call in the source. */
function literalKeys(): string[] {
  const files = import.meta.glob('../../src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  const keys: string[] = []
  const re = /\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1/g
  for (const source of Object.values(files)) {
    for (const m of source.matchAll(re)) keys.push(m[2].replace(/\\(['"\\])/g, '$1'))
  }
  return keys
}

/** Strings stored as data and translated at render time. */
function dataKeys(): string[] {
  return [
    ...SECTIONS.flatMap((s) => [s.title, s.short, s.description]),
    ...Object.values(MODE_LABELS),
    ...Object.values(MODE_COPY),
    ...EFFECTS.flatMap((e) => [e.label, e.description, ...e.params.map((p) => p.label)]),
    ...Object.values(AUDIO_ERROR_COPY).flatMap((c) => [c.title, c.body]),
    ...SHORTCUTS.map((s) => s.action),
    ...BUILTIN_PRESETS.flatMap((p) => [p.name, p.description]),
    ...Object.values(CHANNEL_LAYOUTS).map((l) => l.label),
    ...Object.values(PRESET_MESSAGES),
    ...BAND_NAME_KEYS,
    '{name} copy',
  ]
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()

describe('Bulgarian translation', () => {
  const keys = [...new Set([...literalKeys(), ...dataKeys()])]

  it('covers every UI string', () => {
    const missing = keys.filter((k) => !(k in bg))
    expect(missing).toEqual([])
  })

  it('keeps every placeholder', () => {
    const broken = Object.entries(bg).filter(([en, tr]) => placeholders(en).join() !== placeholders(tr).join())
    expect(broken).toEqual([])
  })

  it('has no stale entries', () => {
    const used = new Set(keys)
    expect(Object.keys(bg).filter((k) => !used.has(k))).toEqual([])
  })
})

describe('i18n helpers', () => {
  it('falls back to English and fills placeholders', () => {
    expect(translate('en', 'Start microphone')).toBe('Start microphone')
    expect(translate('bg', 'not a key {x}', { x: 1 })).toBe('not a key 1')
    expect(translate('bg', 'Channels · {count}', { count: 6 })).toContain('6')
  })

  it('relabels generated band names between languages and leaves custom names alone', () => {
    expect(relabelBandName('Bass', 'en', 'bg')).toBe(translate('bg', 'Bass'))
    expect(relabelBandName('Mids 2', 'en', 'bg')).toBe(`${translate('bg', 'Mids')} 2`)
    expect(relabelBandName(translate('bg', 'Air'), 'bg', 'en')).toBe('Air')
    expect(relabelBandName('Kick drum', 'en', 'bg')).toBe('Kick drum')
    const copy = translate('en', '{name} copy', { name: 'Bass' })
    expect(relabelBandName(copy, 'en', 'bg')).toBe(translate('bg', '{name} copy', { name: translate('bg', 'Bass') }))
  })

  it('generates channel names in the requested language', () => {
    const names = generateChannels(3, 20, 16000, 'log', undefined, 'bg').map((c) => c.name)
    expect(names.every((n) => /[А-Яа-я]/.test(n))).toBe(true)
  })
})
