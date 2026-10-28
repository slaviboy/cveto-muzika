import { Slider } from 'radix-ui'
import { useId, useState, type KeyboardEvent } from 'react'
import { cn } from '../../utils/cn'
import { formatNumber, roundTo, stepDecimals } from '../../utils/format'

/** Numeric text field that validates and clamps on Enter / blur; arrow keys step (Shift ×10). */
export function NumberInput({
  id,
  value,
  onCommit,
  min,
  max,
  step = 1,
  digits,
  unit,
  label,
  className,
  testId,
}: {
  id?: string
  value: number
  onCommit: (v: number) => void
  min: number
  max: number
  step?: number
  digits?: number
  unit?: string
  label?: string
  className?: string
  testId?: string
}) {
  const d = digits ?? stepDecimals(step)
  const [draft, setDraft] = useState<string | null>(null)
  const commit = (text: string) => {
    const parsed = parseFloat(text.replace(',', '.'))
    setDraft(null)
    if (!Number.isFinite(parsed)) return
    onCommit(Math.min(max, Math.max(min, parsed)))
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      commit((e.target as HTMLInputElement).value)
      ;(e.target as HTMLInputElement).blur()
    } else if (e.key === 'Escape') {
      setDraft(null)
      ;(e.target as HTMLInputElement).blur()
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const delta = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)
      onCommit(Math.min(max, Math.max(min, roundTo(value + delta, step))))
      setDraft(null)
    }
  }
  return (
    <span
      className={cn(
        'inline-flex h-7 items-center rounded-md border border-transparent bg-graphite-900/70 px-1.5 focus-within:border-ice/40 hover:border-line-strong pointer-coarse:h-9',
        className,
      )}
    >
      <input
        id={id}
        aria-label={label}
        data-testid={testId}
        inputMode="decimal"
        className="num w-[4.6em] bg-transparent text-right text-xs text-ink outline-none"
        value={draft ?? formatNumber(value, d)}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={(e) => draft !== null && commit(e.target.value)}
        onKeyDown={onKeyDown}
      />
      {unit && <span className="ml-1 text-2xs text-ink-faint">{unit}</span>}
    </span>
  )
}

export interface SliderFieldProps {
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number
  unit?: string
  digits?: number
  scale?: 'linear' | 'log'
  defaultValue?: number
  hint?: string
  testId?: string
  disabled?: boolean
}

const LOG_STEPS = 1000

/** Slider + precise numeric input. Double-click the label to restore the default. */
export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.01,
  unit,
  digits,
  scale = 'linear',
  defaultValue,
  hint,
  testId,
  disabled,
}: SliderFieldProps) {
  const id = useId()
  const log = scale === 'log' && min > 0
  const toSlider = (v: number) => (log ? (Math.log(v / min) / Math.log(max / min)) * LOG_STEPS : v)
  const fromSlider = (x: number) => (log ? min * Math.pow(max / min, x / LOG_STEPS) : x)
  const set = (v: number) => onChange(roundTo(Math.min(max, Math.max(min, v)), step))
  return (
    <div className={cn('flex flex-col gap-1', disabled && 'pointer-events-none opacity-40')}>
      <div className="flex items-center justify-between gap-3">
        <label
          htmlFor={id}
          className="min-w-0 select-none truncate text-xs text-ink-muted"
          title={hint ?? (defaultValue !== undefined ? 'Double-click to reset' : undefined)}
          onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)}
        >
          {label}
        </label>
        <NumberInput id={id} value={value} onCommit={set} min={min} max={max} step={step} digits={digits} unit={unit} testId={testId} />
      </div>
      <Slider.Root
        className="relative flex h-5 w-full touch-none select-none items-center pointer-coarse:h-8"
        value={[toSlider(value)]}
        min={log ? 0 : min}
        max={log ? LOG_STEPS : max}
        step={log ? 1 : step}
        onValueChange={([x]) => set(fromSlider(x))}
        disabled={disabled}
      >
        <Slider.Track className="relative h-[3px] grow overflow-hidden rounded-full bg-graphite-600">
          <Slider.Range className="absolute h-full rounded-full bg-ice/60" />
        </Slider.Track>
        <Slider.Thumb
          aria-label={label}
          className="block size-3.5 rounded-full border-2 border-void bg-ice shadow-[0_0_0_1px_rgb(220_230_255/0.35)] transition-transform hover:scale-110 pointer-coarse:size-5"
        />
      </Slider.Root>
    </div>
  )
}

/** Two-thumb log-frequency range with numeric min/max inputs. */
export function RangeField({
  label,
  low,
  high,
  onChange,
  min,
  max,
  unit = 'Hz',
  testId,
}: {
  label: string
  low: number
  high: number
  onChange: (low: number, high: number) => void
  min: number
  max: number
  unit?: string
  testId?: string
}) {
  const toSlider = (v: number) => (Math.log(Math.max(min, v) / min) / Math.log(max / min)) * LOG_STEPS
  const fromSlider = (x: number) => Math.round(min * Math.pow(max / min, x / LOG_STEPS) * 10) / 10
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink-muted">{label}</span>
        <span className="flex items-center gap-1">
          <NumberInput
            label={`${label} minimum`}
            testId={testId ? `${testId}-min` : undefined}
            value={low}
            onCommit={(v) => onChange(Math.min(v, high - 1), high)}
            min={min}
            max={max}
            step={1}
            digits={0}
          />
          <span className="text-ink-faint">–</span>
          <NumberInput
            label={`${label} maximum`}
            testId={testId ? `${testId}-max` : undefined}
            value={high}
            onCommit={(v) => onChange(low, Math.max(v, low + 1))}
            min={min}
            max={max}
            step={1}
            digits={0}
            unit={unit}
          />
        </span>
      </div>
      <Slider.Root
        className="relative flex h-5 w-full touch-none select-none items-center pointer-coarse:h-8"
        value={[toSlider(low), toSlider(high)]}
        min={0}
        max={LOG_STEPS}
        step={1}
        minStepsBetweenThumbs={4}
        onValueChange={([a, b]) => onChange(fromSlider(a), fromSlider(b))}
      >
        <Slider.Track className="relative h-[3px] grow overflow-hidden rounded-full bg-graphite-600">
          <Slider.Range className="absolute h-full rounded-full bg-ice/60" />
        </Slider.Track>
        <Slider.Thumb aria-label={`${label} minimum`} className="block size-3.5 rounded-full border-2 border-void bg-ice pointer-coarse:size-5" />
        <Slider.Thumb aria-label={`${label} maximum`} className="block size-3.5 rounded-full border-2 border-void bg-ice pointer-coarse:size-5" />
      </Slider.Root>
    </div>
  )
}
