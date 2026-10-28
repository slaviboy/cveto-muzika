import { Dialog } from 'radix-ui'
import { X } from 'lucide-react'
import { useRef } from 'react'
import { SHORTCUTS } from '../../app/shortcuts'
import { useLiveFrame } from '../../hooks'
import { useT } from '../../i18n/useT'
import { useAppStore } from '../../state/useAppStore'
import { IconButton } from '../ui/primitives'
import { cn } from '../../utils/cn'

export function PerfHud() {
  const show = useAppStore((s) => s.settings.performance.showStats)
  const ref = useRef<HTMLDivElement>(null)
  useLiveFrame((live) => {
    if (!ref.current) return
    ref.current.textContent = `${live.fps.toFixed(0)} fps · ${live.frameMs.toFixed(1)} ms · ${live.widthPx}×${live.heightPx} @${live.pixelRatio.toFixed(2)} · scale ${live.resolutionScale.toFixed(2)} · ${live.drawCalls} draws`
  }, show)
  if (!show) return null
  return (
    <div
      ref={ref}
      data-testid="perf-hud"
      className="num pointer-events-none fixed bottom-3 left-3 z-30 rounded-md bg-void/70 px-2 py-1 text-2xs text-ink-muted pb-[max(env(safe-area-inset-bottom),4px)]"
    />
  )
}

export function Toasts() {
  const t = useT()
  const toasts = useAppStore((s) => s.toasts)
  const dismiss = useAppStore((s) => s.dismissToast)
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'glass pointer-events-auto flex max-w-md items-center gap-3 rounded-full py-1.5 pl-4 pr-1.5 text-xs text-ink',
            toast.tone === 'error' && 'border-danger/40',
          )}
        >
          <span className={cn('size-1.5 shrink-0 rounded-full', toast.tone === 'error' ? 'bg-danger' : toast.tone === 'success' ? 'bg-signal' : 'bg-ice')} aria-hidden="true" />
          <span className="min-w-0">{toast.message}</span>
          <IconButton label={t('Dismiss')} tooltip={false} className="size-7" onClick={() => dismiss(toast.id)}>
            <X size={13} />
          </IconButton>
        </div>
      ))}
    </div>
  )
}

export function SystemNotices() {
  const t = useT()
  const webgl2 = useAppStore((s) => s.system.webgl2)
  const lost = useAppStore((s) => s.system.contextLost)
  if (lost) {
    return (
      <div role="status" className="fixed inset-0 z-[60] flex items-center justify-center bg-void/60">
        <p className="glass rounded-full px-4 py-2 text-xs text-ink">{t('The graphics context was lost. Restoring…')}</p>
      </div>
    )
  }
  if (webgl2 === false) {
    return (
      <p role="status" className="glass fixed bottom-3 right-3 z-30 max-w-xs rounded-[12px] px-3 py-2 text-xs text-ink-muted">
        {t('This browser can’t run WebGL2, so Aurora is drawing a simplified view. Settings still apply where possible.')}
      </p>
    )
  }
  return null
}

export function ShortcutsDialog() {
  const t = useT()
  const open = useAppStore((s) => s.ui.shortcutsOpen)
  const setUi = useAppStore((s) => s.setUi)
  return (
    <Dialog.Root open={open} onOpenChange={(o) => setUi({ shortcutsOpen: o })}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[110] bg-void/50" />
        <Dialog.Content className="glass fixed left-1/2 top-1/2 z-[111] w-[min(92vw,380px)] -translate-x-1/2 -translate-y-1/2 rounded-[18px] p-5">
          <div className="mb-4 flex items-center justify-between">
            <Dialog.Title className="text-[0.9375rem] font-[560]">{t('Keyboard shortcuts')}</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label={t('Close')} tooltip={false}>
                <X size={15} />
              </IconButton>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">{t('Keys that control Aurora')}</Dialog.Description>
          <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2.5">
            {SHORTCUTS.map((s) => (
              <div key={s.keys} className="contents">
                <dt>
                  <kbd className="num rounded-md border border-line-strong bg-graphite-800 px-1.5 py-0.5 text-2xs text-ink">{s.keys}</kbd>
                </dt>
                <dd className="text-xs text-ink-muted">{t(s.action)}</dd>
              </div>
            ))}
          </dl>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
