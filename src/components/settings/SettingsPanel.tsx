import { RotateCcw, X } from 'lucide-react'
import { useRef, useState, type PointerEvent } from 'react'
import { useIsDesktop } from '../../hooks'
import { useAppStore, type SectionId } from '../../state/useAppStore'
import { IconButton } from '../ui/primitives'
import { cn } from '../../utils/cn'
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

function SectionHeader({ id, onClose }: { id: SectionId; onClose: () => void }) {
  const meta = SECTIONS.find((s) => s.id === id)!
  const resetSection = useAppStore((s) => s.resetSection)
  const toast = useAppStore((s) => s.toast)
  return (
    <header className="flex items-start justify-between gap-3 border-b border-line px-5 pb-3.5 pt-4">
      <div className="min-w-0">
        <h2 className="text-[0.9375rem] font-[560] tracking-[-0.005em] text-ink" data-testid="section-title">
          {meta.title}
        </h2>
        <p className="mt-0.5 text-xs leading-snug text-ink-muted">{meta.description}</p>
      </div>
      <div className="-mr-2 -mt-1 flex shrink-0 items-center">
        {meta.resettable && (
          <IconButton
            label={`Reset ${meta.title.toLowerCase()}`}
            onClick={() => {
              resetSection(id)
              toast(`${meta.title} reset to defaults`)
            }}
          >
            <RotateCcw size={15} />
          </IconButton>
        )}
        <IconButton label="Close settings" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </div>
    </header>
  )
}

function DesktopPanel() {
  const section = useAppStore((s) => s.ui.section)
  const setUi = useAppStore((s) => s.setUi)
  const close = () => setUi({ settingsOpen: false })
  return (
    <aside
      aria-label="Settings"
      data-testid="settings-panel"
      className="glass fixed bottom-3 right-3 top-[68px] z-40 flex w-[min(440px,calc(100vw-24px))] overflow-hidden rounded-[var(--radius-panel)]"
    >
      <nav aria-label="Settings sections" className="scroll-thin flex w-[52px] shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-r border-line py-2.5">
        {SECTIONS.map((s) => {
          const Icon = s.icon
          return (
            <IconButton
              key={s.id}
              label={s.title}
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
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <SectionHeader id={section} onClose={close} />
        <div className="scroll-thin flex-1 overflow-y-auto overscroll-contain px-5 pb-8 pt-4">
          <SectionContent id={section} />
        </div>
      </div>
    </aside>
  )
}

const SNAPS = { half: 0.56, full: 0.9 } as const

function MobileSheet() {
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
      aria-label="Settings"
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
          aria-label={snap === 'half' ? 'Expand settings' : 'Shrink settings'}
          onClick={() => setSnap(snap === 'half' ? 'full' : 'half')}
          className="h-1.5 w-11 rounded-full bg-graphite-500"
        />
      </div>
      <nav aria-label="Settings sections" className="scroll-thin flex shrink-0 gap-1.5 overflow-x-auto px-4 pb-2">
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
            {s.short}
          </button>
        ))}
      </nav>
      <SectionHeader id={section} onClose={close} />
      <div className="scroll-thin flex-1 overflow-y-auto overscroll-contain px-5 pb-[max(env(safe-area-inset-bottom),24px)] pt-4">
        <SectionContent id={section} />
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
