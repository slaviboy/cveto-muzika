import { Trash2 } from 'lucide-react'
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { toHex } from '../../color/colorMath'
import { gradientCss, sampleGradient, sortStops, type GradientStop } from '../../color/gradient'
import type { InterpolationSpace } from '../../color/colorMath'
import { ColorField } from './ColorField'
import { IconButton } from './primitives'
import { SliderField } from './SliderField'

/**
 * Multi-stop gradient editor. Click the bar to add a stop, drag stops to move them, use arrow
 * keys on a focused stop for fine moves. Interpolation preview matches the render space.
 */
export function GradientEditor({
  stops,
  onChange,
  space = 'oklab',
}: {
  stops: GradientStop[]
  onChange: (stops: GradientStop[]) => void
  space?: InterpolationSpace
}) {
  const barRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState(0)
  const dragging = useRef<number | null>(null)
  const sel = Math.min(selected, stops.length - 1)

  // Preview with many samples so the CSS gradient reflects the perceptual interpolation.
  const preview = Array.from({ length: 24 }, (_, i) => ({ position: i / 23, color: toHex(sampleGradient(stops, i / 23, space)) }))

  const positionFromEvent = (clientX: number) => {
    const rect = barRef.current!.getBoundingClientRect()
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }

  const update = (index: number, patch: Partial<GradientStop>) => {
    onChange(stops.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  const addAt = (position: number) => {
    if (stops.length >= 16) return
    const color = toHex(sampleGradient(stops, position, space))
    const next = [...stops, { position, color }]
    onChange(next)
    setSelected(next.length - 1)
  }

  const onBarPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.target !== barRef.current) return
    addAt(Math.round(positionFromEvent(e.clientX) * 1000) / 1000)
  }

  const onStopPointerDown = (index: number) => (e: PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    setSelected(index)
    dragging.current = index
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onStopPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    if (dragging.current === null) return
    update(dragging.current, { position: Math.round(positionFromEvent(e.clientX) * 1000) / 1000 })
  }

  const onStopKey = (index: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
    const delta = e.key === 'ArrowLeft' ? -0.01 : e.key === 'ArrowRight' ? 0.01 : 0
    if (delta) {
      e.preventDefault()
      update(index, { position: Math.min(1, Math.max(0, stops[index].position + delta * (e.shiftKey ? 5 : 1))) })
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && stops.length > 2) {
      onChange(stops.filter((_, i) => i !== index))
      setSelected(0)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        ref={barRef}
        onPointerDown={onBarPointerDown}
        className="relative h-9 cursor-copy rounded-[10px] border border-line-strong"
        style={{ background: gradientCss(preview) }}
        aria-label="Gradient. Click to add a color stop."
      >
        {stops.map((s, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Color stop ${i + 1} at ${Math.round(s.position * 100)}%`}
            onPointerDown={onStopPointerDown(i)}
            onPointerMove={onStopPointerMove}
            onPointerUp={() => (dragging.current = null)}
            onKeyDown={onStopKey(i)}
            onFocus={() => setSelected(i)}
            className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-2 shadow-lg active:cursor-grabbing pointer-coarse:size-7"
            style={{
              left: `${s.position * 100}%`,
              background: s.color,
              borderColor: i === sel ? '#ffffff' : 'rgb(0 0 0 / 0.55)',
            }}
          />
        ))}
      </div>
      {stops[sel] && (
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <SliderField
              label={`Stop ${sel + 1} position`}
              value={stops[sel].position * 100}
              onChange={(v) => update(sel, { position: v / 100 })}
              min={0}
              max={100}
              step={0.5}
              unit="%"
            />
          </div>
          <ColorField compact label={`Stop ${sel + 1} color`} value={stops[sel].color} onChange={(color) => update(sel, { color })} />
          <IconButton
            label="Remove stop"
            disabled={stops.length <= 2}
            onClick={() => {
              onChange(stops.filter((_, i) => i !== sel))
              setSelected(0)
            }}
          >
            <Trash2 size={15} />
          </IconButton>
        </div>
      )}
      <button
        type="button"
        className="self-start text-2xs text-ink-faint underline-offset-2 hover:text-ink hover:underline"
        onClick={() => onChange(sortStops(stops).map((s, i, arr) => ({ ...s, position: arr.length > 1 ? i / (arr.length - 1) : 0 })))}
      >
        Space stops evenly
      </button>
    </div>
  )
}
