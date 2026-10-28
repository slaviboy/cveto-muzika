import { AlertCircle, Mic, Play, X } from 'lucide-react'
import { startDemo, startMicrophone } from '../../app/engine'
import { useIsDesktop } from '../../hooks'
import { AUDIO_ERROR_COPY } from '../../types/audio'
import { useAppStore } from '../../state/useAppStore'
import { Button, IconButton } from '../ui/primitives'
import { cn } from '../../utils/cn'

function ErrorCard() {
  const error = useAppStore((s) => s.audio.error)
  const setAudio = useAppStore((s) => s.setAudio)
  if (!error) return null
  const copy = AUDIO_ERROR_COPY[error.kind]
  const canRetry = error.kind !== 'insecure' && error.kind !== 'unsupported'
  return (
    <div role="alert" data-testid="audio-error" className="glass flex w-full max-w-md gap-3 rounded-[14px] p-4 text-left">
      <AlertCircle size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-[560] text-ink">{copy.title}</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">{copy.body}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {canRetry && (
            <Button size="sm" variant="secondary" onClick={() => void startMicrophone()}>
              Try again
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => void startDemo()}>
            Play demo track
          </Button>
        </div>
      </div>
      <IconButton label="Dismiss" tooltip={false} className="-mr-1 -mt-1 size-7" onClick={() => setAudio({ error: null })}>
        <X size={14} />
      </IconButton>
    </div>
  )
}

/**
 * First-run screen over the idle visual. The microphone only opens from the button here (or the
 * toolbar / Space key), never automatically. After the first session it collapses into a small bar.
 */
export function StartOverlay() {
  const status = useAppStore((s) => s.audio.status)
  const startedOnce = useAppStore((s) => s.ui.startedOnce)
  const hidden = useAppStore((s) => s.ui.uiHidden)
  const desktop = useIsDesktop()
  const secure = typeof window === 'undefined' || window.isSecureContext

  if (status === 'live' || status === 'demo') return null
  const requesting = status === 'requesting'

  if (startedOnce) {
    return (
      <div className={cn('chrome-fade pointer-events-none fixed inset-x-0 bottom-0 z-30 flex flex-col items-center gap-3 px-4 pb-[max(env(safe-area-inset-bottom),20px)]', hidden && 'chrome-hidden')}>
        <ErrorCard />
        <div className="glass pointer-events-auto flex items-center gap-1.5 rounded-full p-1.5 pl-4">
          <span className="pr-2 text-xs text-ink-muted">Paused</span>
          <Button size="sm" variant="primary" onClick={() => void startMicrophone()} disabled={requesting} className="rounded-full" data-testid="start-mic">
            <Mic size={14} /> Microphone
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void startDemo()} className="rounded-full" data-testid="start-demo">
            <Play size={13} /> Demo
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center px-5 pb-[env(safe-area-inset-bottom)]">
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at center, rgb(3 4 7 / 0.55) 0%, rgb(3 4 7 / 0.15) 55%, transparent 80%)' }}
        aria-hidden="true"
      />
      <div className="pointer-events-auto relative flex w-full max-w-lg flex-col items-center gap-7 text-center">
        <div className="flex flex-col items-center gap-3">
          <h1 className="text-[clamp(2.75rem,9vw,4.25rem)] font-[480] leading-[0.95] tracking-[-0.035em] text-ink">Aurora</h1>
          <p className="max-w-sm text-[clamp(0.95rem,2.6vw,1.0625rem)] leading-snug text-ink-muted">
            Sound in the room, turned into light. Every band of the spectrum gets its own color, timing and shape.
          </p>
        </div>
        <div className="flex w-full flex-col items-stretch gap-2.5 sm:w-auto sm:flex-row sm:items-center">
          <Button size="lg" variant="primary" onClick={() => void startMicrophone()} disabled={requesting} data-testid="start-mic">
            <Mic size={18} />
            {requesting ? 'Waiting for permission…' : 'Start microphone'}
          </Button>
          <Button size="lg" variant="secondary" onClick={() => void startDemo()} data-testid="start-demo">
            <Play size={16} />
            Play demo track
          </Button>
        </div>
        <ErrorCard />
        <p className="max-w-sm text-xs leading-relaxed text-ink-faint">
          {secure
            ? 'Aurora listens only after you press start. Sound is analyzed on this device and is never recorded or uploaded.'
            : 'This page is not on a secure connection, so the browser will block the microphone. The demo track still works.'}
          {desktop && <span className="mt-1 block">Press ? for keyboard shortcuts.</span>}
        </p>
      </div>
    </div>
  )
}
