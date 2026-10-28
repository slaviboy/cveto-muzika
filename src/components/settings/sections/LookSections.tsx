import { useMemo, useRef, useState, type ReactNode } from 'react'
import { toHex } from '../../../color/colorMath'
import { rainbowColor, resolveStops, sampleStops } from '../../../color/gradient'
import { bandCenter, frequencyToPosition } from '../../../audio/frequencyMath'
import { useLiveFrame } from '../../../hooks'
import { useT } from '../../../i18n/useT'
import { channelRange, deriveChannelColors, paletteSource } from '../../../state/channelOps'
import { MAX_DELAY_MS, type Settings } from '../../../state/settingsSchema'
import { useAppStore } from '../../../state/useAppStore'
import { cn } from '../../../utils/cn'
import { ColorField } from '../../ui/ColorField'
import { GradientEditor } from '../../ui/GradientEditor'
import { Button, Group, Hint, SegmentedField, SelectField, SwitchField } from '../../ui/primitives'
import { NumberInput, SliderField } from '../../ui/SliderField'
import { EFFECTS, type EffectKey } from '../effectsMeta'
import { channelDefaults, factoryDefaults, useSettingsGroup } from '../sectionMeta'

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
  const t = useT()
  const settings = useAppStore((s) => s.settings)
  const update = useAppStore((s) => s.update)
  const [color, setColor, dc] = useSettingsGroup('color')
  const [bg, setBg, db] = useSettingsGroup('background')
  const [rings, setRings] = useSettingsGroup('rings')
  const preview = useMemo(() => frequencyMapCss(settings), [settings])
  const particles = settings.effects.particles

  return (
    <div className="flex flex-col gap-5">
      <Group title={t('Frequency to color')}>
        <div className="flex flex-col gap-1">
          <div className="h-7 rounded-[8px] border border-line" style={{ background: preview }} data-testid="frequency-map-preview" />
          <div className="num flex justify-between text-2xs text-ink-faint">
            <span>{Math.round(settings.audio.minFrequency)} Hz</span>
            <span>{(settings.audio.maxFrequency / 1000).toFixed(1)} kHz</span>
          </div>
        </div>
        <SegmentedField
          label={t('Colors come from')}
          value={color.source}
          options={[
            { value: 'channels', label: t('Channels') },
            { value: 'palette', label: t('Palette') },
            { value: 'rainbow', label: t('Rainbow') },
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
              {t('Paint channels with this palette')}
            </Button>
          </>
        )}
        <SliderField
          label={t('Blend between bands')}
          value={color.crossfade * 100}
          onChange={(v) => setColor('crossfade', v / 100)}
          min={0}
          max={100}
          step={1}
          unit="%"
          defaultValue={dc.crossfade * 100}
          hint={t("0% keeps hard color bands; 100% blends smoothly from one band's color into the next.")}
        />
        <SelectField
          label={t('Blend in')}
          value={color.interpolation}
          options={[
            { value: 'oklab', label: t('OKLab (perceptual)') },
            { value: 'oklch', label: t('OKLCh (vivid hues)') },
            { value: 'linear', label: t('Linear light') },
            { value: 'srgb', label: 'sRGB' },
            { value: 'hsl', label: 'HSL' },
          ]}
          onChange={(v) => setColor('interpolation', v)}
        />
        <SegmentedField
          label={t('Color follows')}
          value={color.drive}
          options={[
            { value: 'frequency', label: t('Frequency') },
            { value: 'energy', label: t('Energy') },
            { value: 'both', label: t('Both') },
          ]}
          onChange={(v) => setColor('drive', v)}
        />
        <Hint>{t("Energy moves each element from its channel's gradient start toward its gradient end as it gets louder.")}</Hint>
      </Group>
      <Group title={t('Grading')}>
        <SliderField label={t('Saturation')} value={color.saturation * 100} onChange={(v) => setColor('saturation', v / 100)} min={0} max={200} step={1} unit="%" defaultValue={dc.saturation * 100} />
        <SliderField label={t('Luminance')} value={color.luminance * 100} onChange={(v) => setColor('luminance', v / 100)} min={20} max={200} step={1} unit="%" defaultValue={dc.luminance * 100} />
        <SliderField
          label={t('Glow tint')}
          value={color.glowTint * 100}
          onChange={(v) => setColor('glowTint', v / 100)}
          min={0}
          max={100}
          step={1}
          unit="%"
          defaultValue={dc.glowTint * 100}
          hint={t("How much each glow takes its channel's glow color.")}
        />
        {settings.mode === 'rings' && (
          <SelectField
            label={t('Ring coloring')}
            value={rings.colorStyle}
            options={[
              { value: 'channel', label: t('By channel') },
              { value: 'radial', label: t('By distance from center') },
              { value: 'angular', label: t('Around each ring') },
              { value: 'energy', label: t('By energy') },
            ]}
            onChange={(v) => setRings('colorStyle', v)}
          />
        )}
      </Group>
      <Group title={t('Background')}>
        <SwitchField
          label={t('Background visuals')}
          description={t('Floating particles behind the visualization')}
          checked={particles.enabled}
          onChange={(v) => update((s) => void (s.effects.particles.enabled = v))}
          testId="background-visuals"
        />
        <SegmentedField
          label={t('Style')}
          value={bg.style}
          options={[
            { value: 'radial', label: t('Radial') },
            { value: 'linear', label: t('Linear') },
            { value: 'solid', label: t('Solid') },
          ]}
          onChange={(v) => setBg('style', v)}
        />
        <ColorField label={bg.style === 'solid' ? t('Color') : t('Center / start')} value={bg.colorA} onChange={(v) => setBg('colorA', v)} />
        {bg.style !== 'solid' && <ColorField label={t('Edge / end')} value={bg.colorB} onChange={(v) => setBg('colorB', v)} />}
        {bg.style === 'linear' && <SliderField label={t('Angle')} value={bg.angle} onChange={(v) => setBg('angle', v)} min={0} max={360} step={1} unit="°" defaultValue={db.angle} />}
        <SliderField
          label={t('Breathes with bass')}
          value={bg.reactivity * 100}
          onChange={(v) => setBg('reactivity', v / 100)}
          min={0}
          max={100}
          step={1}
          unit="%"
          defaultValue={db.reactivity * 100}
          hint={t('0% keeps the background completely still.')}
        />
      </Group>
    </div>
  )
}

function ChannelTable({ columns, render }: { columns: string[]; render: (index: number) => ReactNode[] }) {
  const t = useT()
  const channels = useAppStore((s) => s.settings.channels)
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-y-1 text-left">
        <thead>
          <tr className="text-2xs text-ink-faint">
            <th className="pb-1 font-normal">{t('Channel')}</th>
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

/** Small timeline showing undelayed vs delayed energy, so delay settings can be seen. */
function DelayScope() {
  const t = useT()
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
  return <canvas ref={ref} className="h-16 w-full rounded-[10px] border border-line bg-graphite-950/80" aria-label={t('Energy before and after delay')} role="img" />
}

export function TimingSection() {
  const t = useT()
  const [timing, setTiming, dt] = useSettingsGroup('timing')
  const [audio, setAudio, da] = useSettingsGroup('audio')
  const updateChannel = useAppStore((s) => s.updateChannel)
  const updateAll = useAppStore((s) => s.updateAllChannels)
  const channels = useAppStore((s) => s.settings.channels)
  const [cascade, setCascade] = useState(60)

  return (
    <div className="flex flex-col gap-5">
      <Group title={t('Delay per channel')}>
        <DelayScope />
        <Hint>{t('Faint line: energy as it arrives. Bright line: what the visuals show after each channel’s delay.')}</Hint>
        <ChannelTable
          columns={[t('Delay'), t('Attack'), t('Release')]}
          render={(i) => {
            const ch = channels[i]
            return [
              <NumberInput key="d" label={t('{name} delay', { name: ch.name })} testId={`delay-input-${i}`} value={ch.delayMs} onCommit={(v) => updateChannel(ch.id, (c) => void (c.delayMs = v))} min={0} max={MAX_DELAY_MS} step={5} digits={0} unit="ms" />,
              <NumberInput key="a" label={t('{name} attack', { name: ch.name })} value={ch.attackMs} onCommit={(v) => updateChannel(ch.id, (c) => void (c.attackMs = v))} min={0} max={2000} step={1} digits={0} unit="ms" />,
              <NumberInput key="r" label={t('{name} release', { name: ch.name })} value={ch.releaseMs} onCommit={(v) => updateChannel(ch.id, (c) => void (c.releaseMs = v))} min={0} max={5000} step={5} digits={0} unit="ms" />,
            ]
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => updateAll((c) => void (c.delayMs = 0))}>
            {t('Clear delays')}
          </Button>
          <span className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => updateAll((c, i) => void (c.delayMs = Math.min(MAX_DELAY_MS, i * cascade)))}>
              {t('Cascade by')}
            </Button>
            <NumberInput label={t('Cascade step')} value={cascade} onCommit={setCascade} min={0} max={500} step={5} digits={0} unit="ms" />
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              const d = channelDefaults()
              updateAll((c) => Object.assign(c, { delayMs: d.delayMs, attackMs: d.attackMs, releaseMs: d.releaseMs }))
            }}
          >
            {t('Default timing for all')}
          </Button>
        </div>
      </Group>
      <Group title={t('Global')}>
        <SliderField
          label={t('Sync offset')}
          value={timing.globalDelayMs}
          onChange={(v) => setTiming('globalDelayMs', v)}
          min={0}
          max={1000}
          step={5}
          unit="ms"
          defaultValue={dt.globalDelayMs}
          hint={t('Delays every channel, e.g. to line visuals up with Bluetooth speakers.')}
        />
        <SliderField label={t('Animation speed')} value={timing.animationSpeed} onChange={(v) => setTiming('animationSpeed', v)} min={0} max={3} step={0.05} unit="×" defaultValue={dt.animationSpeed} />
        <SliderField label={t('Peak hold')} value={audio.peakHoldMs} onChange={(v) => setAudio('peakHoldMs', v)} min={0} max={3000} step={10} unit="ms" defaultValue={da.peakHoldMs} />
        <SliderField label={t('Peak fall')} value={audio.peakDecay} onChange={(v) => setAudio('peakDecay', v)} min={0.05} max={5} step={0.05} unit="/s" defaultValue={da.peakDecay} />
      </Group>
    </div>
  )
}

export function BrightnessSection() {
  const t = useT()
  const [tone, setTone, d] = useSettingsGroup('tone')
  const channels = useAppStore((s) => s.settings.channels)
  const updateChannel = useAppStore((s) => s.updateChannel)
  return (
    <div className="flex flex-col gap-5">
      <Group title={t('Overall')}>
        <SliderField label={t('Exposure')} value={tone.exposure} onChange={(v) => setTone('exposure', v)} min={0.1} max={4} step={0.01} unit="×" defaultValue={d.exposure} />
        <SliderField label={t('Contrast')} value={tone.contrast} onChange={(v) => setTone('contrast', v)} min={0.5} max={2} step={0.01} defaultValue={d.contrast} />
        <SliderField label={t('Saturation')} value={tone.saturation} onChange={(v) => setTone('saturation', v)} min={0} max={2} step={0.01} defaultValue={d.saturation} />
        <SelectField
          label={t('Tone mapping')}
          value={tone.toneMapping}
          options={[
            { value: 'neon', label: t('Neon (keeps hue)') },
            { value: 'agx', label: t('AgX (filmic)') },
            { value: 'aces', label: 'ACES' },
            { value: 'reinhard', label: 'Reinhard' },
            { value: 'none', label: t('None (clip)') },
          ]}
          onChange={(v) => setTone('toneMapping', v)}
        />
      </Group>
      <Group title={t('Per channel')}>
        <ChannelTable
          columns={[t('Bright'), t('Contrast'), t('Min'), t('Max')]}
          render={(i) => {
            const ch = channels[i]
            return [
              <NumberInput key="b" label={t('{name} brightness', { name: ch.name })} value={ch.brightness} onCommit={(v) => updateChannel(ch.id, (c) => void (c.brightness = v))} min={0} max={4} step={0.05} />,
              <NumberInput key="c" label={t('{name} contrast', { name: ch.name })} value={ch.contrast} onCommit={(v) => updateChannel(ch.id, (c) => void (c.contrast = v))} min={0.1} max={4} step={0.05} />,
              <NumberInput
                key="mi"
                label={t('{name} minimum intensity', { name: ch.name })}
                value={ch.minIntensity * 100}
                onCommit={(v) => updateChannel(ch.id, (c) => void (c.minIntensity = Math.min(v / 100, c.maxIntensity)))}
                min={0}
                max={100}
                step={1}
                digits={0}
                unit="%"
              />,
              <NumberInput
                key="ma"
                label={t('{name} maximum intensity', { name: ch.name })}
                value={ch.maxIntensity * 100}
                onCommit={(v) => updateChannel(ch.id, (c) => void (c.maxIntensity = Math.max(v / 100, c.minIntensity)))}
                min={0}
                max={200}
                step={1}
                digits={0}
                unit="%"
              />,
            ]
          }}
        />
        <Hint>{t("Contrast steepens each channel's response without moving silence or full scale.")}</Hint>
      </Group>
    </div>
  )
}

export function EffectsSection() {
  const t = useT()
  const effects = useAppStore((s) => s.settings.effects)
  const update = useAppStore((s) => s.update)
  const defaults = factoryDefaults().effects
  const setFx = (key: EffectKey, field: string, value: unknown) =>
    update((s) => {
      ;(s.effects[key] as Record<string, unknown>)[field] = value
    })
  const enabledCount = EFFECTS.filter((e) => effects[e.key].enabled).length

  return (
    <div className="flex flex-col gap-2">
      <Hint className="mb-2">
        {t('{count} of {total} effects on. Effects respect reduced motion: movement-based ones hold still when it is enabled.', { count: enabledCount, total: EFFECTS.length })}
      </Hint>
      {EFFECTS.map((e) => {
        const fx = effects[e.key] as Record<string, unknown> & { enabled: boolean }
        const def = defaults[e.key] as Record<string, unknown>
        return (
          <div key={e.key} className={cn('rounded-[12px] border px-3.5 py-3 transition-colors', fx.enabled ? 'border-line-strong bg-graphite-900/60' : 'border-line')} data-testid={`effect-${e.key}`}>
            <SwitchField label={t(e.label)} description={t(e.description)} checked={fx.enabled} onChange={(v) => setFx(e.key, 'enabled', v)} testId={`effect-toggle-${e.key}`} />
            {fx.enabled && (
              <div className="mt-3.5 flex flex-col gap-3">
                {e.params.map((p) =>
                  p.type === 'color' ? (
                    <ColorField key={p.key} label={t(p.label)} value={fx[p.key] as string} onChange={(v) => setFx(e.key, p.key, v)} />
                  ) : (
                    <SliderField
                      key={p.key}
                      label={t(p.label)}
                      value={fx[p.key] as number}
                      onChange={(v) => setFx(e.key, p.key, v)}
                      min={p.min}
                      max={p.max}
                      step={p.step}
                      unit={p.unit}
                      defaultValue={def[p.key] as number}
                    />
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
    if (ref.current) ref.current.textContent = `${live.fps.toFixed(0)} fps · ${live.widthPx}×${live.heightPx} · ${live.resolutionScale.toFixed(2)}×`
  })
  return <span ref={ref} className="num text-xs text-ink-muted" />
}

export function PerformanceSection() {
  const t = useT()
  const [perf, set, d] = useSettingsGroup('performance')
  const setProfile = useAppStore((s) => s.setPerformanceProfile)
  const custom = <K extends keyof Settings['performance']>(k: K, v: Settings['performance'][K]) => {
    set(k, v)
    if (k !== 'reducedMotion' && k !== 'showStats') set('profile', 'custom')
  }
  return (
    <div className="flex flex-col gap-5">
      <Group title={t('Profile')} aside={<LiveStats />}>
        <SegmentedField
          label={t('Quality')}
          value={perf.profile === 'custom' ? ('custom' as const) : perf.profile}
          options={[
            { value: 'quality', label: t('Quality') },
            { value: 'balanced', label: t('Balanced') },
            { value: 'performance', label: t('Performance') },
            ...(perf.profile === 'custom' ? [{ value: 'custom' as const, label: t('Custom') }] : []),
          ]}
          onChange={(v) => setProfile(v)}
          testIdPrefix="profile"
        />
        <Hint>{t('Performance keeps phones cool: lower resolution, fewer particles and a lighter bloom.')}</Hint>
      </Group>
      <Group title={t('Resolution')}>
        <SliderField label={t('Max pixel ratio')} value={perf.maxPixelRatio} onChange={(v) => custom('maxPixelRatio', v)} min={0.5} max={3} step={0.05} unit="×" defaultValue={d.maxPixelRatio} />
        <SwitchField label={t('Adaptive resolution')} description={t('Lowers resolution when frames run slow')} checked={perf.adaptiveResolution} onChange={(v) => custom('adaptiveResolution', v)} />
        <SliderField
          label={t('Lowest scale')}
          value={perf.minResolutionScale * 100}
          onChange={(v) => custom('minResolutionScale', v / 100)}
          min={30}
          max={100}
          step={1}
          unit="%"
          defaultValue={d.minResolutionScale * 100}
          disabled={!perf.adaptiveResolution}
        />
        <SwitchField label={t('Multisample antialiasing')} checked={perf.msaa} onChange={(v) => custom('msaa', v)} />
      </Group>
      <Group title={t('Detail')}>
        <SliderField label={t('Bloom levels')} value={perf.bloomLevels} onChange={(v) => custom('bloomLevels', v)} min={2} max={7} step={1} defaultValue={d.bloomLevels} />
        <SegmentedField
          label={t('Bloom resolution')}
          value={perf.bloomResolution}
          options={[
            { value: 'half', label: t('Half') },
            { value: 'quarter', label: t('Quarter') },
          ]}
          onChange={(v) => custom('bloomResolution', v)}
        />
        <SliderField label={t('Particle budget')} value={perf.particleBudget} onChange={(v) => custom('particleBudget', v)} min={0} max={20000} step={100} defaultValue={d.particleBudget} />
        <SliderField label={t('Geometry detail')} value={perf.geometryDetail} onChange={(v) => custom('geometryDetail', v)} min={0.25} max={2} step={0.05} unit="×" defaultValue={d.geometryDetail} />
      </Group>
      <Group title={t('Comfort')}>
        <SelectField
          label={t('Reduced motion')}
          value={perf.reducedMotion}
          options={[
            { value: 'system', label: t('Follow system') },
            { value: 'on', label: t('Always on') },
            { value: 'off', label: t('Off') },
          ]}
          onChange={(v) => set('reducedMotion', v)}
        />
        <SwitchField label={t('Show frame stats')} checked={perf.showStats} onChange={(v) => set('showStats', v)} />
      </Group>
    </div>
  )
}
