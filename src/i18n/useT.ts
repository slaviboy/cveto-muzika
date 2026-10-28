import { useMemo } from 'react'
import { useAppStore } from '../state/useAppStore'
import { translate, type T } from './index'

/** Translation function for the current UI language; components re-render when it changes. */
export function useT(): T {
  const locale = useAppStore((s) => s.locale)
  return useMemo<T>(() => (text, params) => translate(locale, text, params), [locale])
}

/** Non-reactive translation for code outside React (toasts fired from actions, etc.). */
export function tNow(text: string, params?: Record<string, string | number>): string {
  return translate(useAppStore.getState().locale, text, params)
}
