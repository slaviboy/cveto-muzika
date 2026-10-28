import { DropdownMenu } from 'radix-ui'
import { Check, Languages } from 'lucide-react'
import { LOCALES } from '../../i18n'
import { useT } from '../../i18n/useT'
import { useAppStore } from '../../state/useAppStore'
import { cn } from '../../utils/cn'
import { Segmented } from './primitives'

/** Two-option language toggle (EN / БГ). */
export function LanguageSwitch({ className }: { className?: string }) {
  const t = useT()
  const locale = useAppStore((s) => s.locale)
  const setLocale = useAppStore((s) => s.setLocale)
  return (
    <Segmented
      label={t('Language')}
      value={locale}
      options={LOCALES.map((l) => ({ value: l.id, label: l.label }))}
      onChange={setLocale}
      className={className}
      testIdPrefix="locale"
    />
  )
}

/** Compact toolbar menu for picking the interface language. */
export function LanguageMenu() {
  const t = useT()
  const locale = useAppStore((s) => s.locale)
  const setLocale = useAppStore((s) => s.setLocale)
  const current = LOCALES.find((l) => l.id === locale)!
  const item = 'flex h-8 cursor-pointer select-none items-center gap-2.5 rounded-md px-2 text-xs text-ink outline-none data-[highlighted]:bg-white/[0.08]'
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={t('Language: {language}', { language: current.label })}
        data-testid="language-menu"
        className="flex h-9 items-center gap-1.5 rounded-full px-2.5 text-xs text-ink-muted hover:bg-white/[0.07] hover:text-ink"
      >
        <Languages size={15} />
        <span className="num">{current.short}</span>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={10} className="z-[85] w-44 rounded-[12px] border border-line-strong bg-graphite-800/95 p-1 shadow-2xl backdrop-blur-xl">
          {LOCALES.map((l) => (
            <DropdownMenu.Item key={l.id} className={cn(item)} onSelect={() => setLocale(l.id)} lang={l.id}>
              <span className="flex-1">{l.label}</span>
              {l.id === locale && <Check size={13} className="text-ice" />}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
