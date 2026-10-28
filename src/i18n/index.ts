import { bg } from './bg'

/**
 * Lightweight i18n. Keys are the English source strings, so untranslated text falls back to
 * readable English, and `t('Start microphone')` reads naturally at the call site.
 * Placeholders use {name} and are filled from the params object.
 */
export type Locale = 'en' | 'bg'

export const LOCALES: readonly { id: Locale; label: string; short: string }[] = [
  { id: 'en', label: 'English', short: 'EN' },
  { id: 'bg', label: 'Български', short: 'БГ' },
]

export type TParams = Record<string, string | number>
export type T = (text: string, params?: TParams) => string

const DICTIONARIES: Record<Locale, Readonly<Record<string, string>>> = { en: {}, bg }

export function translate(locale: Locale, text: string, params?: TParams): string {
  const s = DICTIONARIES[locale]?.[text] ?? text
  if (!params) return s
  return s.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match))
}

export function hasTranslation(locale: Locale, text: string): boolean {
  return locale === 'en' || text in DICTIONARIES[locale]
}

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'bg'
}

/** Bulgarian when the browser prefers it, English otherwise. */
export function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en'
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language]
  return langs.some((l) => l?.toLowerCase().startsWith('bg')) ? 'bg' : 'en'
}

/** Names the app generates for frequency bands; translated when created and on language switch. */
export const BAND_NAME_KEYS = [
  'Sub',
  'Bass',
  'Low mids',
  'Mids',
  'Upper mids',
  'Presence',
  'Air',
  'Highs',
  'Deep bass',
  'Warm mids',
  'Bright highs',
  'Channel',
] as const

/**
 * Renames a generated band name ("Bass", "Bass 2", "Bass copy") from one language to the other.
 * Names the user typed are returned unchanged.
 */
export function relabelBandName(name: string, from: Locale, to: Locale): string {
  const copy = translate(from, '{name} copy', { name: '' }).trim()
  let rest = name
  let copySuffix = false
  if (copy && rest.endsWith(` ${copy}`)) {
    rest = rest.slice(0, -copy.length - 1)
    copySuffix = true
  }
  const m = /^(.*?)(?: (\d+))?$/.exec(rest)
  if (!m) return name
  const key = BAND_NAME_KEYS.find((k) => translate(from, k) === m[1])
  if (!key) return name
  const renamed = translate(to, key) + (m[2] ? ` ${m[2]}` : '')
  return copySuffix ? translate(to, '{name} copy', { name: renamed }) : renamed
}
