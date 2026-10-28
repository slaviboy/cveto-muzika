import { useRef } from 'react'
import { useLiveFrame } from '../../hooks'
import type { VisualizationMode } from '../../state/settingsSchema'
import { useAppStore } from '../../state/useAppStore'

/** Small line glyphs for the four modes, drawn to match the visuals rather than generic icons. */
export function ModeGlyph({ mode, size = 18 }: { mode: VisualizationMode; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', 'aria-hidden': true }
  switch (mode) {
    case 'rings':
      return (
        <svg {...common} strokeWidth={1.4}>
          <circle cx="10" cy="10" r="8" opacity="0.55" />
          <circle cx="10" cy="10" r="5" />
          <circle cx="10" cy="10" r="2" />
        </svg>
      )
    case 'leds':
      return (
        <svg {...common} stroke="none" fill="currentColor">
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2
            return <circle key={`o${i}`} cx={10 + Math.cos(a) * 7.5} cy={10 + Math.sin(a) * 7.5} r="1.1" opacity="0.6" />
          })}
          {Array.from({ length: 7 }, (_, i) => {
            const a = (i / 7) * Math.PI * 2
            return <circle key={`i${i}`} cx={10 + Math.cos(a) * 4} cy={10 + Math.sin(a) * 4} r="1.1" />
          })}
        </svg>
      )
    case 'bars':
      return (
        <svg {...common} strokeWidth={2.2} strokeLinecap="round">
          <path d="M4 16V9M8 16V4M12 16V10M16 16V6" />
        </svg>
      )
    case 'squares':
      return (
        <svg {...common} strokeWidth={1.4}>
          <rect x="2.5" y="2.5" width="15" height="15" rx="1" opacity="0.55" />
          <rect x="6" y="6" width="8" height="8" rx="0.5" transform="rotate(8 10 10)" />
        </svg>
      )
  }
}

/** Live logo mark: three rings that breathe with bass, mids and highs in the user's own colors. */
export function LiveMark({ size = 22 }: { size?: number }) {
  const channels = useAppStore((s) => s.settings.channels)
  const enabled = channels.filter((c) => c.enabled)
  const pick = (t: number) => enabled[Math.min(enabled.length - 1, Math.round(t * (enabled.length - 1)))]?.color ?? '#dce6ff'
  const colors = [pick(0), pick(0.5), pick(1)]
  const svgRef = useRef<SVGSVGElement>(null)
  useLiveFrame((live) => {
    const f = live.frame
    const circles = svgRef.current?.children
    if (!circles) return
    // Drawn outermost first: treble, mids, bass.
    const values = f ? [f.treble, f.mid, f.bass] : [0, 0, 0]
    for (let i = 0; i < 3; i++) {
      const v = Math.min(1, values[i] * 1.2)
      circles[i].setAttribute('stroke-width', (1.3 + v * 1.6).toFixed(2))
      circles[i].setAttribute('opacity', (0.45 + v * 0.55).toFixed(2))
    }
  })
  return (
    <svg ref={svgRef} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke={colors[2]} strokeWidth="1.3" opacity="0.45" />
      <circle cx="12" cy="12" r="6.5" stroke={colors[1]} strokeWidth="1.3" opacity="0.45" />
      <circle cx="12" cy="12" r="3" stroke={colors[0]} strokeWidth="1.3" opacity="0.45" />
    </svg>
  )
}

/** Five-bar live level meter (decorative; status is always also given as text). */
export function MiniMeter({ className }: { className?: string }) {
  const boxRef = useRef<HTMLSpanElement>(null)
  useLiveFrame((live) => {
    const f = live.frame
    const bars = boxRef.current?.children
    if (!bars) return
    const vals = f ? [f.bass, (f.bass + f.mid) / 2, f.mid, (f.mid + f.treble) / 2, f.treble] : [0, 0, 0, 0, 0]
    for (let i = 0; i < bars.length; i++) {
      ;(bars[i] as HTMLElement).style.transform = `scaleY(${(0.18 + Math.min(1, vals[i] * 1.3) * 0.82).toFixed(3)})`
    }
  })
  return (
    <span ref={boxRef} className={`inline-flex h-3.5 items-end gap-[2px] ${className ?? ''}`} aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="block h-full w-[2px] origin-bottom rounded-full bg-current" style={{ transform: 'scaleY(0.18)' }} />
      ))}
    </span>
  )
}
