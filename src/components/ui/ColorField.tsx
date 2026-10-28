import { Popover } from 'radix-ui'
import { useState } from 'react'
import { HexColorPicker } from 'react-colorful'
import { hslToRgb, hsvToRgb, parseColor, parseHex, rgbToHsl, rgbToHsv, toHex, type Vec3 } from '../../color/colorMath'
import { cn } from '../../utils/cn'

type Format = 'hex' | 'rgb' | 'hsl' | 'hsv'

const FORMATS: { id: Format; label: string }[] = [
  { id: 'hex', label: 'HEX' },
  { id: 'rgb', label: 'RGB' },
  { id: 'hsl', label: 'HSL' },
  { id: 'hsv', label: 'HSV' },
]

function channelsFor(format: Exclude<Format, 'hex'>, rgb: Vec3): number[] {
  if (format === 'rgb') return rgb.map((v) => Math.round(v * 255))
  const [h, a, b] = format === 'hsl' ? rgbToHsl(rgb) : rgbToHsv(rgb)
  return [Math.round(h), Math.round(a * 100), Math.round(b * 100)]
}

function fromChannels(format: Exclude<Format, 'hex'>, v: number[]): Vec3 {
  if (format === 'rgb') return [v[0] / 255, v[1] / 255, v[2] / 255]
  const triple: Vec3 = [v[0], v[1] / 100, v[2] / 100]
  return format === 'hsl' ? hslToRgb(triple) : hsvToRgb(triple)
}

const LIMITS: Record<Exclude<Format, 'hex'>, { labels: string[]; max: number[] }> = {
  rgb: { labels: ['R', 'G', 'B'], max: [255, 255, 255] },
  hsl: { labels: ['H', 'S', 'L'], max: [360, 100, 100] },
  hsv: { labels: ['H', 'S', 'V'], max: [360, 100, 100] },
}

function ColorInputs({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const [format, setFormat] = useState<Format>('hex')
  // Text being typed; null shows the committed value.
  const [draft, setDraft] = useState<string | null>(null)
  const hexDraft = draft ?? value
  const rgb = parseHex(value) ?? [1, 1, 1]

  return (
    <div className="flex flex-col gap-2">
      <div role="tablist" aria-label="Color format" className="flex gap-0.5 rounded-lg bg-graphite-900 p-0.5">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={format === f.id}
            onClick={() => setFormat(f.id)}
            className={cn(
              'h-6 flex-1 rounded-md text-2xs font-[560] text-ink-muted hover:text-ink',
              format === f.id && 'bg-graphite-600 text-ink',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      {format === 'hex' ? (
        <input
          aria-label="Hex color"
          data-testid="color-hex-input"
          className="num h-8 rounded-md border border-line-strong bg-graphite-900 px-2 text-xs uppercase text-ink outline-none focus:border-ice/50"
          value={hexDraft}
          spellCheck={false}
          onChange={(e) => {
            setDraft(e.target.value)
            const parsed = parseColor(e.target.value)
            if (parsed && /^#?[0-9a-f]{6}$/i.test(e.target.value.trim())) onChange(toHex(parsed))
          }}
          onBlur={() => {
            const parsed = parseColor(hexDraft)
            if (parsed) onChange(toHex(parsed))
            setDraft(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const parsed = parseColor(hexDraft)
              if (parsed) onChange(toHex(parsed))
              setDraft(null)
            }
          }}
        />
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {channelsFor(format, rgb).map((v, i) => (
            <label key={`${format}-${i}`} className="flex h-8 items-center gap-1 rounded-md border border-line-strong bg-graphite-900 px-2 focus-within:border-ice/50">
              <span className="text-2xs text-ink-faint">{LIMITS[format].labels[i]}</span>
              <input
                aria-label={`${format.toUpperCase()} ${LIMITS[format].labels[i]}`}
                inputMode="numeric"
                className="num w-full bg-transparent text-right text-xs text-ink outline-none"
                defaultValue={v}
                key={`${value}-${format}-${i}`}
                onBlur={(e) => {
                  const n = parseFloat(e.target.value)
                  if (!Number.isFinite(n)) return
                  const next = channelsFor(format, rgb)
                  next[i] = Math.min(LIMITS[format].max[i], Math.max(0, n))
                  onChange(toHex(fromChannels(format, next)))
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export function ColorSwatch({ color, className, glow }: { color: string; className?: string; glow?: boolean }) {
  return (
    <span
      className={cn('block rounded-full border border-white/15', className)}
      style={{ background: color, boxShadow: glow ? `0 0 12px -2px ${color}` : undefined }}
    />
  )
}

/** Swatch button opening a picker with HEX / RGB / HSL / HSV entry. */
export function ColorField({
  label,
  value,
  onChange,
  compact,
  testId,
}: {
  label: string
  value: string
  onChange: (hex: string) => void
  compact?: boolean
  testId?: string
}) {
  const trigger = (
    <Popover.Trigger
      aria-label={`${label}: ${value}`}
      data-testid={testId}
      className={cn(
        'group inline-flex items-center gap-2 rounded-[var(--radius-control)] transition-colors',
        compact ? 'size-7 justify-center rounded-full pointer-coarse:size-9' : 'h-8 border border-line-strong bg-graphite-800 pl-1.5 pr-2.5 hover:border-ice/25 pointer-coarse:h-10',
      )}
    >
      <ColorSwatch color={value} className={compact ? 'size-5 group-hover:scale-110 transition-transform' : 'size-5'} glow={compact} />
      {!compact && <span className="num text-xs uppercase text-ink">{value}</span>}
    </Popover.Trigger>
  )
  return (
    <Popover.Root>
      {compact ? (
        trigger
      ) : (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-ink-muted">{label}</span>
          {trigger}
        </div>
      )}
      <Popover.Portal>
        <Popover.Content
          sideOffset={8}
          collisionPadding={12}
          className="aurora-color-picker z-[95] flex w-60 flex-col gap-3 rounded-[14px] border border-line-strong bg-graphite-800 p-3 shadow-2xl"
          aria-label={label}
        >
          <div className="text-xs font-[560] text-ink">{label}</div>
          <HexColorPicker color={value} onChange={onChange} />
          <ColorInputs value={value} onChange={onChange} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
