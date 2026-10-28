import { DropdownMenu } from 'radix-ui'
import { Check, ChevronDown, Expand, Loader2, Mic, MicOff, Play, Settings2, Shrink, Square } from 'lucide-react'
import { startDemo, startMicrophone, stopAudio } from '../../app/engine'
import { useFullscreen, useIsDesktop, useMediaQuery } from '../../hooks'
import { useT } from '../../i18n/useT'
import { BUILTIN_PRESETS } from '../../presets/builtinPresets'
import { VISUALIZATION_MODES } from '../../state/settingsSchema'
import { useAppStore } from '../../state/useAppStore'
import { cn } from '../../utils/cn'
import { LanguageMenu } from '../ui/LanguageSwitch'
import { IconButton, Tooltip } from '../ui/primitives'
import { LiveMark, MiniMeter, ModeGlyph } from './glyphs'
import { MODE_LABELS } from './modeLabels'

export function ModeSwitcher({ compact }: { compact?: boolean }) {
  const t = useT()
  const mode = useAppStore((s) => s.settings.mode)
  const setMode = useAppStore((s) => s.setMode)
  return (
    <div role="radiogroup" aria-label={t('Visualization mode')} className="flex items-center gap-0.5">
      {VISUALIZATION_MODES.map((m, i) => (
        <Tooltip key={m} content={`${t(MODE_LABELS[m])} (${i + 1})`}>
          <button
            type="button"
            role="radio"
            aria-checked={mode === m}
            aria-label={t(MODE_LABELS[m])}
            data-testid={`mode-${m}`}
            onClick={() => setMode(m)}
            className={cn(
              'flex h-9 items-center gap-2 rounded-full px-2.5 text-xs text-ink-muted transition-colors hover:text-ink pointer-coarse:h-10 pointer-coarse:px-2.5',
              mode === m && 'bg-white/[0.09] text-ink',
            )}
          >
            <ModeGlyph mode={m} />
            {!compact && mode === m && <span className="hidden pr-0.5 lg:inline">{t(MODE_LABELS[m])}</span>}
          </button>
        </Tooltip>
      ))}
    </div>
  )
}

export function AudioStatusPill({ compact }: { compact?: boolean }) {
  const t = useT()
  const status = useAppStore((s) => s.audio.status)
  const device = useAppStore((s) => s.audio.activeDeviceLabel)
  const error = useAppStore((s) => s.audio.error)

  if (status === 'requesting') {
    return (
      <span data-testid="audio-status" data-status="requesting" className="flex h-9 items-center gap-2 rounded-full px-3 text-xs text-ink-muted" role="status">
        <Loader2 size={15} className="animate-spin" />
        {!compact && t('Waiting for permission…')}
      </span>
    )
  }
  if (status === 'live' || status === 'demo') {
    const label = status === 'live' ? t('Stop microphone') : t('Stop demo')
    return (
      <Tooltip content={status === 'live' && device ? `${label} — ${device}` : label}>
        <button
          type="button"
          data-testid="audio-status"
          data-status={status}
          aria-label={label}
          onClick={() => void stopAudio()}
          className="group flex h-9 items-center gap-2 rounded-full bg-white/[0.07] pl-3 pr-3 text-xs text-ink transition-colors hover:bg-white/[0.12] pointer-coarse:h-10"
        >
          <span className="relative flex size-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-signal/60" />
            <span className="relative size-2 rounded-full bg-signal" />
          </span>
          <span className="font-[560]">{status === 'live' ? t('Live') : t('Demo')}</span>
          {!compact && status === 'live' && device && <span className="hidden max-w-36 truncate text-ink-muted xl:inline">{device}</span>}
          <MiniMeter className="text-ink-muted group-hover:hidden" />
          <Square size={11} className="hidden fill-current group-hover:block" aria-hidden="true" />
        </button>
      </Tooltip>
    )
  }
  return (
    <button
      type="button"
      data-testid="audio-status"
      data-status="idle"
      aria-label={t('Start microphone')}
      onClick={() => void startMicrophone()}
      className="flex h-9 items-center gap-2 rounded-full pl-3 pr-3.5 text-xs text-ink transition-colors hover:bg-white/[0.08] pointer-coarse:h-11"
    >
      {error ? <MicOff size={15} className="text-danger" /> : <Mic size={15} />}
      {!compact && <span>{error ? t('Microphone off') : t('Start microphone')}</span>}
    </button>
  )
}

export function PresetMenu() {
  const t = useT()
  const activeId = useAppStore((s) => s.activePresetId)
  const dirty = useAppStore((s) => s.presetDirty)
  const userPresets = useAppStore((s) => s.userPresets)
  const applyBuiltin = useAppStore((s) => s.applyBuiltinPreset)
  const applyUser = useAppStore((s) => s.applyUserPreset)
  const setUi = useAppStore((s) => s.setUi)
  const builtin = BUILTIN_PRESETS.find((p) => p.id === activeId)
  const name = builtin ? t(builtin.name) : (userPresets.find((p) => p.id === activeId)?.name ?? t('Custom'))

  const item = 'flex h-8 cursor-pointer select-none items-center gap-2.5 rounded-md px-2 text-xs text-ink outline-none data-[highlighted]:bg-white/[0.08]'
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        data-testid="preset-menu"
        className="flex h-9 max-w-48 items-center gap-1.5 rounded-full px-3 text-xs text-ink hover:bg-white/[0.07]"
        aria-label={dirty ? t('Preset: {name} (edited)', { name }) : t('Preset: {name}', { name })}
      >
        <span className="truncate">{name}</span>
        {dirty && <span className="text-2xs text-ink-faint">{t('edited')}</span>}
        <ChevronDown size={13} className="shrink-0 text-ink-muted" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={10}
          collisionPadding={12}
          className="scroll-thin z-[85] max-h-[min(70vh,560px)] w-64 overflow-y-auto rounded-[14px] border border-line-strong bg-graphite-800/95 p-1.5 shadow-2xl backdrop-blur-xl"
        >
          <DropdownMenu.Label className="px-2 pb-1 pt-1.5 text-2xs text-ink-faint">{t('Built-in looks')}</DropdownMenu.Label>
          {BUILTIN_PRESETS.map((p) => (
            <DropdownMenu.Item key={p.id} className={item} onSelect={() => applyBuiltin(p.id)}>
              <span className="text-ink-muted">
                <ModeGlyph mode={p.mode} size={15} />
              </span>
              <span className="flex-1 truncate">{t(p.name)}</span>
              {activeId === p.id && <Check size={13} className="text-ice" />}
            </DropdownMenu.Item>
          ))}
          {userPresets.length > 0 && (
            <>
              <DropdownMenu.Separator className="my-1.5 h-px bg-line" />
              <DropdownMenu.Label className="px-2 pb-1 pt-1 text-2xs text-ink-faint">{t('Your presets')}</DropdownMenu.Label>
              {userPresets.map((p) => (
                <DropdownMenu.Item key={p.id} className={item} onSelect={() => applyUser(p.id)}>
                  <span className="flex-1 truncate">{p.name}</span>
                  {activeId === p.id && <Check size={13} className="text-ice" />}
                </DropdownMenu.Item>
              ))}
            </>
          )}
          <DropdownMenu.Separator className="my-1.5 h-px bg-line" />
          <DropdownMenu.Item className={item} onSelect={() => setUi({ settingsOpen: true, section: 'presets' })}>
            {t('Save, import or export…')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export function Toolbar() {
  const t = useT()
  const hidden = useAppStore((s) => s.ui.uiHidden)
  const settingsOpen = useAppStore((s) => s.ui.settingsOpen)
  const setUi = useAppStore((s) => s.setUi)
  const status = useAppStore((s) => s.audio.status)
  const desktop = useIsDesktop()
  const wide = useMediaQuery('(min-width: 480px)')
  const fullscreen = useFullscreen()

  return (
    <header
      className={cn(
        'chrome-fade pointer-events-none fixed inset-x-0 top-0 z-40 flex items-start justify-between gap-2 px-3 pt-[max(env(safe-area-inset-top),12px)] sm:px-4',
        hidden && 'chrome-hidden',
      )}
    >
      <div className="glass pointer-events-auto flex items-center gap-1 rounded-full p-1 pl-2.5">
        <span className="flex items-center gap-2 pr-1">
          <LiveMark />
          <span className="hidden text-[0.9375rem] font-[560] tracking-[-0.01em] text-ink sm:inline">Aurora</span>
        </span>
        <span className="mx-1 h-5 w-px bg-line-strong" aria-hidden="true" />
        <ModeSwitcher compact={!desktop} />
      </div>
      <div className="glass pointer-events-auto flex items-center gap-0.5 rounded-full p-1">
        <AudioStatusPill compact={!desktop} />
        {desktop && <PresetMenu />}
        {status === 'idle' && desktop && (
          <IconButton label={t('Play demo track (D)')} onClick={() => void startDemo()} data-testid="toolbar-demo">
            <Play size={15} />
          </IconButton>
        )}
        {desktop && <LanguageMenu />}
        {fullscreen.supported && (desktop || wide) && (
          <IconButton label={fullscreen.isFullscreen ? t('Exit fullscreen (F)') : t('Fullscreen (F)')} onClick={() => void fullscreen.toggle()}>
            {fullscreen.isFullscreen ? <Shrink size={16} /> : <Expand size={16} />}
          </IconButton>
        )}
        <IconButton
          label={settingsOpen ? t('Close settings (S)') : t('Settings (S)')}
          active={settingsOpen}
          aria-expanded={settingsOpen}
          data-testid="settings-toggle"
          onClick={() => setUi({ settingsOpen: !settingsOpen })}
        >
          <Settings2 size={16} />
        </IconButton>
      </div>
    </header>
  )
}
