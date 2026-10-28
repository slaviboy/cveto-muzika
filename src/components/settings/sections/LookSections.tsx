import { useMemo, useRef, useState, type ReactNode } from 'react'
import { toHex } from '../../../color/colorMath'
import { rainbowColor, resolveStops, sampleStops } from '../../../color/gradient'
import { bandCenter, frequencyToPosition } from '../../../audio/frequencyMath'
import { useLiveFrame } from '../../../hooks'
import { channelRange, deriveChannelColors, paletteSource } from '../../../state/channelOps'
import { MAX_DELAY_MS, type EffectsSettings, type Settings } from '../../../state/settingsSchema'
import { useAppStore } from '../../../state/useAppStore'
import { ColorField } from '../../ui/ColorField'
import { GradientEditor } from '../../ui/GradientEditor'
import { Button, Group, Hint, SegmentedField, SelectField, SwitchField } from '../../ui/primitives'
import { cn } from '../../../utils/cn'
import { NumberInput, SliderField } from '../../ui/SliderField'
import { useSettingsGroup } from '../sectionMeta'

/** CSS preview of the frequency → color map exactly as the renderer builds it. */
function frequencyMapCss(s: Settings): string {
  const c = s.color
  let fn: (t: number) => [number, number, number]
  if (c.source === 'palette') {
    const stops = resolveStops(c.palette)
    fn = (t) => sampleStops(stops, t, c.interpolation, c.crossfade)
  } else if (c.source === 'rainbow') {
    fn = (t) => rainbowColor(t)
  } else {
    const stops = s.channels
      .filter((ch) => ch.enabled)
      .map((ch) => {
        const [lo, hi] = channelRange(ch)
        return { position: frequencyToPosition(bandCenter(lo, hi), s.audio.minFrequency, s.audio.maxFrequency, 'log'), rgb: hexRgb(ch.color) }
      })
      .sort((a, b) => a.position - b.position)
    fn = (t) => (stops.length ? sampleStops(stops, t, c.interpolation, c.crossfade) : [1, 1, 1])
  }
  const parts: string[] = []
  for (let i = 0; i <= 64; i++) parts.push(`${toHex(fn(i / 64))} ${((i / 64) * 100).toFixed(2)}%`)
  return `linear-gradient(90deg, ${parts.join(', ')})`
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export function ColorsSection() {
  const settings = useAppStore((s) => s.settings)
  const update = useAppStore((s) => s.update)
  const [color, setColor] = useSettingsGroup('color')
  const [bg, setBg] = useSettingsGroup('background')
  const [rings, setRings] = useSettingsGroup('rings')
  const preview = useMemo(() => frequencyMapCss(settings), [settings])

  return (
    <div className="flex flex-col gap-5">
      <Group title="Frequency to color">
        <div className="flex flex-col gap-1">
          <div className="h-7 rounded-[8px] border border-line" style={{ background: preview }} data-testid="frequency-map-preview" />
          <div className="num flex justify-between text-2xs text-ink-faint">
            <span>{Math.round(settings.audio.minFrequency)} Hz</span>
            <span>{(settings.audio.maxFrequency / 1000).toFixed(1)} kHz</span>
          </div>
        </div>
        <SegmentedField
          label="Colors come from"
          value={color.source}
          options={[
            { value: 'channels', label: 'Channels' },
            { value: 'palette', label: 'Palette' },
            { value: 'rainbow', label: 'Rainbow' },
          ]}
          onChange={(v) => setColor('source', v)}
        />
        {color.source === 'palette' && (
          <>
            <GradientEditor stops={color.palette} onChange={(stops) => setColor('palette', stops)} space={color.interpolation} />
            <Button
              size="sm"
              variant="ghost"
              className="self-start"
              onClick={() =>
                update((s) => {
                  const fn = paletteSource(s.color.palette)
                  s.channels.forEach((ch, i) => Object.assign(ch, deriveChannelColors(fn(s.channels.length === 1 ? 0.5 : i / (s.channels.length - 1), i, s.channels.length))))
                })
              }
            >
              Paint channels with this palette
            </Button>
          </>
        )}
        <SliderField label="Blend between bands" value={color.crossfade * 100} onChange={(v) => setColor('crossfade', v / 100)} min={0} max={100} step={1} unit="%" defaultValue={65} hint="0% keeps hard color bands; 100% blends smoothly from one band's color into the next." />
        <SelectField
          label="Blend in"
          value={color.interpolation}
          options={[
            { value: 'oklab', label: 'OKLab (perceptual)' },
            { value: 'oklch', label: 'OKLCh (vivid hues)' },
            { value: 'linear', label: 'Linear light' },
            { value: 'srgb', label: 'sRGB' },
            { value: 'hsl', label: 'HSL' },
          ]}
          onChange={(v) => setColor('interpolation', v)}
        />
        <SegmentedField
          label="Color follows"
          value={color.drive}
          options={[
            { value: 'frequency', label: 'Frequency' },
            { value: 'energy', label: 'Energy' },
            { value: 'both', label: 'Both' },
          ]}
          onChange={(v) => setColor('drive', v)}
        />
        <Hint>Energy moves each element from its channel's gradient start toward its gradient end as it gets louder.</Hint>
      </Group>
      <Group title="Grading">
        <SliderField label="Saturation" value={color.saturation * 100} onChange={(v) => setColor('saturation', v / 100)} min={0} max={200} step={1} unit="%" defaultValue={100} />
        <SliderField label="Luminance" value={color.luminance * 100} onChange={(v) => setColor('luminance', v / 100)} min={20} max={200} step={1} unit="%" defaultValue={100} />
        <SliderField label="Glow tint" value={color.glowTint * 100} onChange={(v) => setColor('glowTint', v / 100)} min={0} max={100} step={1} unit="%" hint="How much each glow takes its channel's glow color." />
        {settings.mode === 'rings' && (
          <SelectField
            label="Ring coloring"
            value={rings.colorStyle}
            options={[
              { value: 'channel', label: 'By channel' },
              { value: 'radial', label: 'Radial gradient' },
              { value: 'angular', label: 'Around each ring' },
              { value: 'energy', label: 'By energy' },
            ]}
            onChange={(v) => setRings('colorStyle', v)}
          />
        )}
      </Group>
      <Group title="Background">
        <SegmentedField
          label="Style"
          value={bg.style}
          options={[
            { value: 'radial', label: 'Radial' },
            { value: 'linear', label: 'Linear' },
            { value: 'solid', label: 'Solid' },
          ]}
          onChange={(v) => setBg('style', v)}
        />
        <ColorField label={bg.style === 'solid' ? 'Color' : 'Center / start'} value={bg.colorA} onChange={(v) => setBg('colorA', v)} />
        {bg.style !== 'solid' && <ColorField label="Edge / end" value={bg.colorB} onChange={(v) => setBg('colorB', v)} />}
        {bg.style === 'linear' && <SliderField label="Angle" value={bg.angle} onChange={(v) => setBg('angle', v)} min={0} max={360} step={1} unit="°" />}
        <SliderField label="Breathes with bass" value={bg.reactivity * 100} onChange={(v) => setBg('reactivity', v / 100)} min={0} max={100} step={1} unit="%" />
      </Group>
    </div>
  )
}

function ChannelTable({ columns, render }: { columns: string[]; render: (index: number) => ReactNode[] }) {
  const channels = useAppStore((s) => s.settings.channels)
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-y-1 text-left">
        <thead>
          <tr className="text-2xs text-ink-faint">
            <th className="pb-1 font-normal">Channel</th>
            {columns.map((c) => (
              <th key={c} className="pb-1 text-right font-normal">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {channels.map((ch, i) => (
            <tr key={ch.id}>
              <td className="max-w-28 pr-2">
                <span className="flex items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: ch.color }} aria-hidden="true" />
                  <span className={cn('truncate text-xs', ch.enabled ? 'text-ink' : 'text-ink-faint')}>{ch.name}</span>
                </span>
              </td>
              {render(i).map((cell, k) => (
                <td key={k} className="text-right">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Small timeline showing undelayed vs delayed energy, so delay settings can be heard and seen. */
function DelayScope() {
  const ref = useRef<HTMLCanvasElement>(null)
  const channels = useAppStore((s) => s.settings.channels)
  const hist = useRef<{ live: number[]; out: number[] }>({ live: [], out: [] })
  useLiveFrame((live) => {
    const canvas = ref.current
    const g = canvas?.getContext('2d')
    const f = live.frame
    if (!canvas || !g || !f) return
    if (canvas.width !== canvas.clientWidth * 2) canvas.width = canvas.clientWidth * 2
    if (canvas.height !== canvas.clientHeight * 2) canvas.height = canvas.clientHeight * 2
    const w = canvas.width
    const h = canvas.height
    g.clearRect(0, 0, w, h)
    const n = Math.min(f.channelCount, channels.length)
    let a = 0
    let b = 0
    for (let i = 0; i < n; i++) {
      a = Math.max(a, f.live[i])
      b = Math.max(b, f.level[i])
    }
    hist.current.live.push(a)
    hist.current.out.push(b)
    if (hist.current.live.length > 180) {
      hist.current.live.shift()
      hist.current.out.shift()
    }
    const draw = (arr: number[], color: string, width: number) => {
      g.beginPath()
      // Newest sample on the right edge, scrolling left.
      arr.forEach((v, i) => {
        const x = w - ((arr.length - 1 - i) / 179) * w
        const y = h - 4 - Math.min(1, v) * (h - 8)
        if (i === 0) g.moveTo(x, y)
        else g.lineTo(x, y)
      })
      g.strokeStyle = color
      g.lineWidth = width
      g.stroke()
    }
    draw(hist.current.live, 'rgba(220,230,255,0.3)', 2)
    draw(hist.current.out, 'rgba(220,230,255,0.95)', 2.5)
  })
  return <canvas ref={ref} className="h-16 w-full rounded-[10px] border border-line bg-graphite-950/80" aria-label="Energy before and after delay" role="img" />
}

export function TimingSection() {
  const [timing, setTiming] = useSettingsGroup('timing')
  const [audio, setAudio] = useSettingsGroup('audio')
  const updateChannel = useAppStore((s) => s.updateChannel)
  const updateAll = useAppStore((s) => s.updateAllChannels)
  const channels = useAppStore((s) => s.settings.channels)
  const [cascade, setCascade] = useState(60)

  return (
    <div className="flex flex-col gap-5">
      <Group title="Delay per channel">
        <DelayScope />
        <Hint>Faint line: energy as it arrives. Bright line: what the visuals show after each channel's delay.</Hint>
        <ChannelTable
          columns={['Delay', 'Attack', 'Release']}
          render={(i) => {
            const ch = channels[i]
            return [
              <NumberInput key="d" label={`${ch.name} delay`} testId={`delay-input-${i}`} value={ch.delayMs} onCommit={(v) => updateChannel(ch.id, (c) => void (c.delayMs = v))} min={0} max={MAX_DELAY_MS} step={5} digits={0} unit="ms" />,
              <NumberInput key="a" label={`${ch.name} attack`} value={ch.attackMs} onCommit={(v) => updateChannel(ch.id, (c) => void (c.attackMs = v))} min={0} max={2000} step={1} digits={0} unit="ms" />,
              <NumberInput key="r" label={`${ch.name} release`} value={ch.releaseMs} onCommit={(v) => updateChannel(ch.id, (c) => void (c.releaseMs = v))} min={0} max={5000} step={5} digits={0} unit="ms" />,
            ]
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => updateAll((c) => void (c.delayMs = 0))}>
            Clear delays
          </Button>
          <span className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => updateAll((c, i) => void (c.delayMs = Math.min(MAX_DELAY_MS, i * cascade)))}>
              Cascade by
            </Button>
            <NumberInput label="Cascade step" value={cascade} onCommit={setCascade} min={0} max={500} step={5} digits={0} unit="ms" />
          </span>
        </div>
      </Group>
      <Group title="Global">
        <SliderField label="Sync offset" value={timing.globalDelayMs} onChange={(v) => setTiming('globalDelayMs', v)} min={0} max={1000} step={5} unit="ms" defaultValue={0} hint="Delays every channel, e.g. to line visuals up with Bluetooth speakers." />
        <SliderField label="Animation speed" value={timing.animationSpeed} onChange={(v) => setTiming('animationSpeed', v)} min={0} max={3} step={0.05} unit="×" defaultValue={1} />
        <SliderField label="Peak hold" value={audio.peakHoldMs} onChange={(v) => setAudio('peakHoldMs', v)} min={0} max={3000} step={10} unit="ms" />
        <SliderField label="Peak fall" value={audio.peakDecay} onChange={(v) => setAudio('peakDecay', v)} min={0.05} max={5} step={0.05} unit="/s" />
      </Group>
    </div>
  )
}

export function BrightnessSection() {
  const [tone, setTone] = useSettingsGroup('tone')
  const channels = useAppStore((s) => s.settings.channels)
  const updateChannel = useAppStore((s) => s.updateChannel)
  return (
    <div className="flex flex-col gap-5">
      <Group title="Overall">
        <SliderField label="Exposure" value={tone.exposure} onChange={(v) => setTone('exposure', v)} min={0.1} max={4} step={0.01} unit="×" defaultValue={1} />
        <SliderField label="Contrast" value={tone.contrast} onChange={(v) => setTone('contrast', v)} min={0.5} max={2} step={0.01} defaultValue={1.05} />
        <SliderField label="Saturation" value={tone.saturation} onChange={(v) => setTone('saturation', v)} min={0} max={2} step={0.01} defaultValue={1.05} />
        <SelectField
          label="Tone mapping"
          value={tone.toneMapping}
          options={[
            { value: 'neon', label: 'Neon (keeps hue)' },
            { value: 'agx', label: 'AgX (filmic)' },
            { value: 'aces', label: 'ACES' },
            { value: 'reinhard', label: 'Reinhard' },
            { value: 'none', label: 'None (clip)' },
          ]}
          onChange={(v) => setTone('toneMapping', v)}
        />
      </Group>
      <Group title="Per channel">
        <ChannelTable
          columns={['Bright', 'Contrast', 'Min', 'Max']}
          render={(i) => {
            const ch = channels[i]
            return [
              <NumberInput key="b" label={`${ch.name} brightness`} value={ch.brightness} onCommit={(v) => updateChannel(ch.id, (c) => void (c.brightness = v))} min={0} max={4} step={0.05} />,
              <NumberInput key="c" label={`${ch.name} contrast`} value={ch.contrast} onCommit={(v) => updateChannel(ch.id, (c) => void (c.contrast = v))} min={0.1} max={4} step={0.05} />,
              <NumberInput key="mi" label={`${ch.name} minimum intensity`} value={ch.minIntensity * 100} onCommit={(v) => updateChannel(ch.id, (c) => void (c.minIntensity = Math.min(v / 100, c.maxIntensity)))} min={0} max={100} step={1} digits={0} unit="%" />,
              <NumberInput key="ma" label={`${ch.name} maximum intensity`} value={ch.maxIntensity * 100} onCommit={(v) => updateChannel(ch.id, (c) => void (c.maxIntensity = Math.max(v / 100, c.minIntensity)))} min={0} max={200} step={1} digits={0} unit="%" />,
            ]
          }}
        />
        <Hint>Contrast steepens each channel's response without moving silence or full scale.</Hint>
      </Group>
    </div>
  )
}

type EffectKey = keyof EffectsSettings

interface ParamDef {
  key: string
  label: string
  min: number
  max: number
  step: number
  unit?: string
  scale?: number
  type?: 'color'
}

const EFFECTS: { key: EffectKey; label: string; description: string; params: ParamDef[] }[] = [
  { key: 'bloom', label: 'Bloom', description: 'Light spills softly around bright shapes.', params: [{ key: 'intensity', label: 'Intensity', min: 0, max: 3, step: 0.01 }, { key: 'threshold', label: 'Threshold', min: 0, max: 2, step: 0.01 }, { key: 'radius', label: 'Radius', min: 0, max: 1, step: 0.01 }] },
  { key: 'vignette', label: 'Vignette', description: 'Darkens the edges of the frame.', params: [{ key: 'amount', label: 'Amount', min: 0, max: 1, step: 0.01 }, { key: 'softness', label: 'Softness', min: 0.05, max: 1, step: 0.01 }] },
  { key: 'particles', label: 'Luminous dust', description: 'Drifting particles tinted by the palette.', params: [{ key: 'amount', label: 'Amount', min: 0, max: 1, step: 0.01 }, { key: 'size', label: 'Size', min: 0.2, max: 4, step: 0.05 }, { key: 'speed', label: 'Speed', min: 0, max: 3, step: 0.05 }, { key: 'reactivity', label: 'Reaction', min: 0, max: 2, step: 0.05 }] },
  { key: 'trails', label: 'Trails', description: 'Shapes leave fading afterimages.', params: [{ key: 'persistence', label: 'Persistence', min: 0, max: 0.98, step: 0.01 }] },
  { key: 'feedback', label: 'Feedback', description: 'Trails drift, rotate and shift hue.', params: [{ key: 'zoom', label: 'Zoom', min: -0.05, max: 0.05, step: 0.001 }, { key: 'rotation', label: 'Rotation', min: -0.05, max: 0.05, step: 0.001 }, { key: 'hueShift', label: 'Hue drift', min: -0.2, max: 0.2, step: 0.005 }] },
  { key: 'chromaticAberration', label: 'Chromatic aberration', description: 'Splits color channels toward the edges.', params: [{ key: 'amount', label: 'Amount', min: 0, max: 1, step: 0.01 }, { key: 'reactivity', label: 'Reaction', min: 0, max: 1, step: 0.01 }] },
  { key: 'grain', label: 'Film grain', description: 'Fine animated grain.', params: [{ key: 'amount', label: 'Amount', min: 0, max: 1, step: 0.01 }] },
  { key: 'kaleidoscope', label: 'Kaleidoscope', description: 'Folds the image into mirrored segments.', params: [{ key: 'segments', label: 'Segments', min: 2, max: 24, step: 1 }, { key: 'rotationSpeed', label: 'Rotation', min: -1, max: 1, step: 0.01 }] },
  { key: 'radialDistortion', label: 'Radial distortion', description: 'Lens-like bulge that swells with the bass.', params: [{ key: 'amount', label: 'Amount', min: -1, max: 1, step: 0.01 }, { key: 'reactivity', label: 'Reaction', min: 0, max: 1, step: 0.01 }] },
  { key: 'waveDistortion', label: 'Wave distortion', description: 'Rippling displacement of the whole frame.', params: [{ key: 'amount', label: 'Amount', min: 0, max: 0.1, step: 0.001 }, { key: 'frequency', label: 'Frequency', min: 0.5, max: 40, step: 0.5 }, { key: 'speed', label: 'Speed', min: 0, max: 5, step: 0.05 }] },
  { key: 'displacement', label: 'Audio displacement', description: 'Shapes jitter with noise scaled by their energy.', params: [{ key: 'amount', label: 'Amount', min: 0, max: 0.2, step: 0.001 }, { key: 'scale', label: 'Scale', min: 0.5, max: 20, step: 0.1 }] },
  { key: 'pulse', label: 'Pulse', description: 'Everything breathes outward with the bass.', params: [{ key: 'amount', label: 'Amount', min: 0, max: 0.3, step: 0.005 }] },
  { key: 'shockwave', label: 'Shockwaves', description: 'Strong bass beats send a ripple through the frame.', params: [{ key: 'strength', label: 'Strength', min: 0, max: 1, step: 0.01 }, { key: 'speed', label: 'Speed', min: 0.2, max: 4, step: 0.05 }] },
  { key: 'beatFlash', label: 'Beat flash', description: 'A brief wash of light on each beat.', params: [{ key: 'intensity', label: 'Intensity', min: 0, max: 1, step: 0.01 }, { key: 'color', label: 'Color', min: 0, max: 0, step: 0, type: 'color' }] },
  { key: 'camera', label: 'Camera motion', description: 'A slow drift around the scene.', params: [{ key: 'motion', label: 'Range', min: 0, max: 1, step: 0.01 }, { key: 'speed', label: 'Speed', min: 0, max: 2, step: 0.01 }, { key: 'tilt', label: 'Tilt', min: 0, max: 1, step: 0.01 }] },
  { key: 'parallax', label: 'Depth and parallax', description: 'Spreads particles in depth so camera motion has parallax.', params: [{ key: 'depth', label: 'Depth', min: 0, max: 1, step: 0.01 }] },
]

export function EffectsSection() {
  const effects = useAppStore((s) => s.settings.effects)
  const update = useAppStore((s) => s.update)
  const setFx = (key: EffectKey, field: string, value: unknown) =>
    update((s) => {
      ;(s.effects[key] as Record<string, unknown>)[field] = value
    })
  const enabledCount = EFFECTS.filter((e) => effects[e.key].enabled).length

  return (
    <div className="flex flex-col gap-2">
      <Hint className="mb-2">{enabledCount} of {EFFECTS.length} effects on. Effects respect reduced motion: movement-based ones hold still when it is enabled.</Hint>
      {EFFECTS.map((e) => {
        const fx = effects[e.key] as Record<string, unknown> & { enabled: boolean }
        return (
          <div key={e.key} className={cn('rounded-[12px] border px-3.5 py-3 transition-colors', fx.enabled ? 'border-line-strong bg-graphite-900/60' : 'border-line')} data-testid={`effect-${e.key}`}>
            <SwitchField label={e.label} description={e.description} checked={fx.enabled} onChange={(v) => setFx(e.key, 'enabled', v)} testId={`effect-toggle-${e.key}`} />
            {fx.enabled && (
              <div className="mt-3.5 flex flex-col gap-3">
                {e.params.map((p) =>
                  p.type === 'color' ? (
                    <ColorField key={p.key} label={p.label} value={fx[p.key] as string} onChange={(v) => setFx(e.key, p.key, v)} />
                  ) : (
                    <SliderField key={p.key} label={p.label} value={fx[p.key] as number} onChange={(v) => setFx(e.key, p.key, v)} min={p.min} max={p.max} step={p.step} unit={p.unit} />
                  ),
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function LiveStats() {
  const ref = useRef<HTMLSpanElement>(null)
  useLiveFrame((live) => {
    if (ref.current) ref.current.textContent = `${live.fps.toFixed(0)} fps · ${live.widthPx}×${live.heightPx} · scale ${live.resolutionScale.toFixed(2)}`
  })
  return <span ref={ref} className="num text-xs text-ink-muted" />
}

export function PerformanceSection() {
  const [perf, set] = useSettingsGroup('performance')
  const setProfile = useAppStore((s) => s.setPerformanceProfile)
  const custom = <K extends keyof Settings['performance']>(k: K, v: Settings['performance'][K]) => {
    set(k, v)
    if (k !== 'reducedMotion' && k !== 'showStats') set('profile', 'custom')
  }
  return (
    <div className="flex flex-col gap-5">
      <Group title="Profile" aside={<LiveStats />}>
        <SegmentedField
          label="Quality"
          value={perf.profile === 'custom' ? ('custom' as const) : perf.profile}
          options={[
            { value: 'quality', label: 'Quality' },
            { value: 'balanced', label: 'Balanced' },
            { value: 'performance', label: 'Performance' },
            ...(perf.profile === 'custom' ? [{ value: 'custom' as const, label: 'Custom' }] : []),
          ]}
          onChange={(v) => setProfile(v)}
          testIdPrefix="profile"
        />
        <Hint>Performance keeps phones cool: lower resolution, fewer particles and a lighter bloom.</Hint>
      </Group>
      <Group title="Resolution">
        <SliderField label="Max pixel ratio" value={perf.maxPixelRatio} onChange={(v) => custom('maxPixelRatio', v)} min={0.5} max={3} step={0.05} unit="×" />
        <SwitchField label="Adaptive resolution" description="Lowers resolution when frames run slow" checked={perf.adaptiveResolution} onChange={(v) => custom('adaptiveResolution', v)} />
        <SliderField label="Lowest scale" value={perf.minResolutionScale * 100} onChange={(v) => custom('minResolutionScale', v / 100)} min={30} max={100} step={1} unit="%" disabled={!perf.adaptiveResolution} />
        <SwitchField label="Multisample antialiasing" checked={perf.msaa} onChange={(v) => custom('msaa', v)} />
      </Group>
      <Group title="Detail">
        <SliderField label="Bloom levels" value={perf.bloomLevels} onChange={(v) => custom('bloomLevels', v)} min={2} max={7} step={1} />
        <SegmentedField label="Bloom resolution" value={perf.bloomResolution} options={[{ value: 'half', label: 'Half' }, { value: 'quarter', label: 'Quarter' }]} onChange={(v) => custom('bloomResolution', v)} />
        <SliderField label="Particle budget" value={perf.particleBudget} onChange={(v) => custom('particleBudget', v)} min={0} max={20000} step={100} />
        <SliderField label="Geometry detail" value={perf.geometryDetail} onChange={(v) => custom('geometryDetail', v)} min={0.25} max={2} step={0.05} unit="×" />
      </Group>
      <Group title="Comfort">
        <SelectField
          label="Reduced motion"
          value={perf.reducedMotion}
          options={[
            { value: 'system', label: 'Follow system' },
            { value: 'on', label: 'Always on' },
            { value: 'off', label: 'Off' },
          ]}
          onChange={(v) => set('reducedMotion', v)}
        />
        <SwitchField label="Show frame stats" checked={perf.showStats} onChange={(v) => set('showStats', v)} />
      </Group>
    </div>
  )
}
