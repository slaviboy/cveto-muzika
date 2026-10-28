import { RotateCcw, X } from 'lucide-react'
import { useRef, useState, type PointerEvent } from 'react'
import { useIsDesktop } from '../../hooks'
import { LOCALES } from '../../i18n'
import { useT } from '../../i18n/useT'
import { useAppStore, type SectionId } from '../../state/useAppStore'
import { cn } from '../../utils/cn'
import { Button, IconButton } from '../ui/primitives'
import { SECTIONS } from './sectionMeta'
import { AudioInputSection, FftSection } from './sections/AudioSections'
import { ChannelsSection } from './sections/ChannelsSection'
import { BrightnessSection, ColorsSection, EffectsSection, PerformanceSection, TimingSection } from './sections/LookSections'
import { PresetsSection } from './sections/PresetsSection'
import { GeometrySection, ModeSection } from './sections/VisualSections'

function SectionContent({ id }: { id: SectionId }) {
  switch (id) {
    case 'audio':
      return <AudioInputSection />
    case 'fft':
      return <FftSection />
    case 'channels':
      return <ChannelsSection />
    case 'mode':
      return <ModeSection />
    case 'geometry':
      return <GeometrySection />
    case 'colors':
      return <ColorsSection />
    case 'timing':
      return <TimingSection />
    case 'brightness':
      return <BrightnessSection />
    case 'effects':
      return <EffectsSection />
    case 'performance':
      return <PerformanceSection />
    case 'presets':
      return <PresetsSection />
  }
}

function useResetSection(id: SectionId) {
  const t = useT()
  const resetSection = useAppStore((s) => s.resetSection)
  const toast = useAppStore((s) => s.toast)
  const meta = SECTIONS.find((s) => s.id === id)!
  return () => {
    resetSection(id)
    toast(t('{section} reset to defaults', { section: t(meta.title) }))
  }
}

function SectionHeader({ id, onClose }: { id: SectionId; onClose: () => void }) {
  const t = useT()
  const meta = SECTIONS.find((s) => s.id === id)!
  const reset = useResetSection(id)
  return (
    <header className="flex items-start justify-between gap-3 border-b border-line px-5 pb-3.5 pt-4">
      <div className="min-w-0">
        <h2 className="text-[0.9375rem] font-[560] tracking-[-0.005em] text-ink" data-testid="section-title">
          {t(meta.title)}
        </h2>
        <p className="mt-0.5 text-xs leading-snug text-ink-muted">{t(meta.description)}</p>
      </div>
      <div className="-mr-2 -mt-1 flex shrink-0 items-center">
        {meta.resettable && (
          <IconButton label={t('Reset {section} to defaults', { section: t(meta.title).toLowerCase() })} onClick={reset}>
            <RotateCcw size={15} />
          </IconButton>
        )}
        <IconButton label={t('Close settings')} onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>
    </header>
  )
}

/** A clearly labelled reset at the end of every section. */
function SectionFooter({ id }: { id: SectionId }) {
  const t = useT()
  const meta = SECTIONS.find((s) => s.id === id)!
  const reset = useResetSection(id)
  if (!meta.resettable) return null
  return (
    <div className="mt-6 border-t border-line pt-4">
      <Button size="sm" variant="ghost" onClick={reset} data-testid="section-reset">
        <RotateCcw size={13} /> {t('Reset this section to defaults')}
      </Button>
    </div>
  )
}

function LanguageRailButton() {
  const t = useT()
  const locale = useAppStore((s) => s.locale)
  const setLocale = useAppStore((s) => s.setLocale)
  const current = LOCALES.find((l) => l.id === locale)!
  const next = LOCALES.find((l) => l.id !== locale)!
  return (
    <IconButton
      label={t('Switch language to {language}', { language: next.label })}
      onClick={() => setLocale(next.id)}
      className="num size-9 rounded-[10px] text-[0.6875rem] font-[620]"
      data-testid="language-toggle"
    >
      {current.short}
    </IconButton>
  )
}

function DesktopPanel() {
  const t = useT()
  const section = useAppStore((s) => s.ui.section)
  const setUi = useAppStore((s) => s.setUi)
  const close = () => setUi({ settingsOpen: false })
  return (
    <aside
      aria-label={t('Settings')}
      data-testid="settings-panel"
      className="glass fixed bottom-3 right-3 top-[68px] z-40 flex w-[min(440px,calc(100vw-24px))] overflow-hidden rounded-[var(--radius-panel)]"
    >
      <nav aria-label={t('Settings sections')} className="scroll-thin flex w-[52px] shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-line py-2.5">
        {SECTIONS.map((s) => {
          const Icon = s.icon
          return (
            <IconButton
              key={s.id}
              label={t(s.title)}
              active={section === s.id}
              aria-current={section === s.id ? 'page' : undefined}
              data-testid={`section-${s.id}`}
              onClick={() => setUi({ section: s.id })}
              className="size-9 rounded-[10px]"
            >
              <Icon size={16} />
            </IconButton>
          )
        })}
        <span className="mt-auto pt-2">
          <LanguageRailButton />
        </span>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <SectionHeader id={section} onClose={close} />
        <div className="scroll-thin flex-1 overflow-y-auto overscroll-contain px-5 pb-8 pt-4">
          <SectionContent id={section} />
          <SectionFooter id={section} />
        </div>
      </div>
    </aside>
  )
}

const SNAPS = { half: 0.56, full: 0.9 } as const

function MobileSheet() {
  const t = useT()
  const section = useAppStore((s) => s.ui.section)
  const setUi = useAppStore((s) => s.setUi)
  const [snap, setSnap] = useState<keyof typeof SNAPS>('half')
  const [drag, setDrag] = useState<number | null>(null)
  const start = useRef<{ y: number; h: number } | null>(null)
  const close = () => setUi({ settingsOpen: false })
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const height = drag ?? SNAPS[snap] * vh

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    start.current = { y: e.clientY, h: height }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return
    setDrag(Math.max(80, Math.min(vh * 0.95, start.current.h + (start.current.y - e.clientY))))
  }
  const onUp = () => {
    if (!start.current) return
    const h = drag ?? height
    start.current = null
    setDrag(null)
    if (h < vh * 0.3) close()
    else setSnap(h > vh * 0.73 ? 'full' : 'half')
  }

  return (
    <div
      role="dialog"
      aria-label={t('Settings')}
      data-testid="settings-sheet"
      className={cn('glass fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-[22px] border-b-0', drag === null && 'transition-[height] duration-300 ease-[var(--ease-out-soft)]')}
      style={{ height }}
    >
      <div
        className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <button
          type="button"
          aria-label={snap === 'half' ? t('Expand settings') : t('Shrink settings')}
          onClick={() => setSnap(snap === 'half' ? 'full' : 'half')}
          className="h-1.5 w-11 rounded-full bg-graphite-500"
        />
      </div>
      <nav aria-label={t('Settings sections')} className="scroll-thin flex shrink-0 gap-1.5 overflow-x-auto px-4 pb-2">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            data-testid={`section-${s.id}`}
            aria-current={section === s.id ? 'page' : undefined}
            onClick={() => setUi({ section: s.id })}
            className={cn(
              'h-9 shrink-0 rounded-full border px-3.5 text-xs transition-colors',
              section === s.id ? 'border-ice/40 bg-white/[0.1] text-ink' : 'border-line text-ink-muted',
            )}
          >
            {t(s.short)}
          </button>
        ))}
        <span className="shrink-0">
          <LanguageRailButton />
        </span>
      </nav>
      <SectionHeader id={section} onClose={close} />
      <div className="scroll-thin flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(env(safe-area-inset-bottom),24px)] pt-4">
        <SectionContent id={section} />
        <SectionFooter id={section} />
      </div>
    </div>
  )
}

export function SettingsPanel() {
  const open = useAppStore((s) => s.ui.settingsOpen)
  const desktop = useIsDesktop()
  if (!open) return null
  return desktop ? <DesktopPanel /> : <MobileSheet />
}
