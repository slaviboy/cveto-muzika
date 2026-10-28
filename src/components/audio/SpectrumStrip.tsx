import { useEffect, useRef } from 'react'
import { DISPLAY_BINS } from '../../audio/AudioPipeline'
import { formatHz, frequencyToNote, frequencyToPosition } from '../../audio/frequencyMath'
import { useLiveFrame } from '../../hooks'
import { channelRange } from '../../state/channelOps'
import { useAppStore } from '../../state/useAppStore'

const TICKS = [50, 100, 200, 500, 1000, 2000, 5000, 10000]

/**
 * Live spectrum with every channel's range drawn underneath, so it is visible which part of the
 * spectrum each band listens to. The highlighted channel (being edited) is emphasised.
 */
export function SpectrumStrip({ highlightId, height = 84 }: { highlightId?: string | null; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const channels = useAppStore((s) => s.settings.channels)
  const audio = useAppStore((s) => s.settings.audio)
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ro = new ResizeObserver(() => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      sizeRef.current = { w, h, dpr }
    })
    ro.observe(canvas)
    return () => ro.disconnect()
  }, [])

  useLiveFrame((live) => {
    const canvas = canvasRef.current
    const g = canvas?.getContext('2d')
    if (!canvas || !g) return
    const { w, h, dpr } = sizeRef.current
    if (!w) return
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, w, h)
    const minF = audio.minFrequency
    const maxF = audio.maxFrequency
    const scale = audio.frequencyScale
    const bandH = 10
    const plotH = h - bandH - 14
    const x = (hz: number) => frequencyToPosition(hz, minF, maxF, scale) * w

    // Grid.
    g.strokeStyle = 'rgba(200,212,255,0.07)'
    g.fillStyle = 'rgba(139,144,164,0.8)'
    g.font = '500 9px "Instrument Sans Variable", sans-serif'
    g.lineWidth = 1
    for (const t of TICKS) {
      if (t < minF || t > maxF) continue
      const px = Math.round(x(t)) + 0.5
      g.beginPath()
      g.moveTo(px, 0)
      g.lineTo(px, plotH)
      g.stroke()
      g.fillText(t >= 1000 ? `${t / 1000}k` : String(t), px + 2, h - 3)
    }

    // Channel ranges.
    channels.forEach((ch, i) => {
      const [lo, hi] = channelRange(ch)
      const x0 = x(lo)
      const x1 = Math.max(x0 + 2, x(hi))
      const active = highlightId === ch.id
      const level = live.frame?.intensity[i] ?? 0
      g.globalAlpha = ch.enabled ? (active ? 1 : 0.75) : 0.2
      g.fillStyle = ch.color
      g.fillRect(x0, plotH + 2, x1 - x0, bandH - 4)
      if (active || level > 0.02) {
        g.globalAlpha = (active ? 0.16 : 0) + Math.min(0.22, level * 0.22)
        g.fillRect(x0, 0, x1 - x0, plotH)
      }
    })
    g.globalAlpha = 1

    // Spectrum.
    const spec = live.frame?.spectrum
    if (spec) {
      g.beginPath()
      g.moveTo(0, plotH)
      for (let i = 0; i < DISPLAY_BINS; i++) {
        g.lineTo(((i + 0.5) / DISPLAY_BINS) * w, plotH - Math.min(1, spec[i]) * (plotH - 2))
      }
      g.lineTo(w, plotH)
      g.closePath()
      g.fillStyle = 'rgba(220,230,255,0.12)'
      g.fill()
      g.strokeStyle = 'rgba(220,230,255,0.7)'
      g.lineWidth = 1.2
      g.stroke()
      const dom = live.frame?.dominantFrequency
      if (dom && Number.isFinite(dom) && dom >= minF && dom <= maxF && live.frame?.active) {
        const px = x(dom)
        g.fillStyle = '#dce6ff'
        g.fillRect(px - 0.75, 0, 1.5, plotH)
      }
    }
  })

  return (
    <canvas
      ref={canvasRef}
      className="block w-full rounded-[10px] border border-line bg-graphite-950/80"
      style={{ height }}
      role="img"
      aria-label="Live spectrum with channel ranges"
    />
  )
}

/** Text readout of the strongest tone, updated outside React. */
export function DominantTone({ channelIndex, className }: { channelIndex?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const last = useRef(0)
  useLiveFrame((live) => {
    const el = ref.current
    if (!el) return
    const now = performance.now()
    if (now - last.current < 120) return
    last.current = now
    const f = live.frame
    const hz = f ? (channelIndex === undefined ? f.dominantFrequency : f.dominantHz[channelIndex]) : NaN
    const level = f ? (channelIndex === undefined ? f.overall : f.live[channelIndex]) : 0
    if (!f?.active || !Number.isFinite(hz) || level < 0.03) {
      el.textContent = '—'
      return
    }
    const note = frequencyToNote(hz)
    el.textContent = `${formatHz(hz)}${note ? ` · ${note.name}${note.octave}` : ''}`
  })
  return <span ref={ref} className={`num ${className ?? ''}`}>—</span>
}

/**
 * Horizontal meter: faint bar = undelayed band energy, solid bar = what the visuals receive after
 * the channel's delay. With a delay set, the solid bar visibly trails the faint one.
 */
export function ChannelMeter({ index, color, className }: { index: number; color: string; className?: string }) {
  const liveRef = useRef<HTMLSpanElement>(null)
  const outRef = useRef<HTMLSpanElement>(null)
  useLiveFrame((live) => {
    const f = live.frame
    const a = f ? Math.min(1, f.live[index] ?? 0) : 0
    const b = f ? Math.min(1, f.level[index] ?? 0) : 0
    if (liveRef.current) liveRef.current.style.transform = `scaleX(${a.toFixed(3)})`
    if (outRef.current) outRef.current.style.transform = `scaleX(${b.toFixed(3)})`
  })
  return (
    <span className={`relative block h-1 overflow-hidden rounded-full bg-graphite-600 ${className ?? ''}`} aria-hidden="true">
      <span ref={liveRef} className="absolute inset-0 origin-left rounded-full opacity-35" style={{ background: color, transform: 'scaleX(0)' }} />
      <span ref={outRef} className="absolute inset-0 origin-left rounded-full" style={{ background: color, transform: 'scaleX(0)' }} />
    </span>
  )
}

export function InputLevelMeter() {
  const ref = useRef<HTMLSpanElement>(null)
  useLiveFrame((live) => {
    if (ref.current) ref.current.style.transform = `scaleX(${Math.min(1, live.frame?.overall ?? 0).toFixed(3)})`
  })
  return (
    <span className="relative block h-1.5 overflow-hidden rounded-full bg-graphite-600" aria-hidden="true">
      <span ref={ref} className="absolute inset-0 origin-left rounded-full bg-gradient-to-r from-ice/50 to-ice" style={{ transform: 'scaleX(0)' }} />
    </span>
  )
}
