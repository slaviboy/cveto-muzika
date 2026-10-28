import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { DropdownMenu } from 'radix-ui'
import { ArrowDown, ArrowUp, ChevronDown, Copy, GripVertical, MoreHorizontal, PanelRightOpen, Pin, Plus, Trash2, Wand2, X } from 'lucide-react'
import { useRef, useState, type PointerEvent } from 'react'
import { applyCurve } from '../../../audio/AudioPipeline'
import { formatHz } from '../../../audio/frequencyMath'
import { useIsDesktop } from '../../../hooks'
import { useT } from '../../../i18n/useT'
import { CHANNEL_LAYOUTS, channelRange, deriveChannelColors, type ChannelLayoutId } from '../../../state/channelOps'
import { MAX_CHANNELS, MAX_DELAY_MS, type ChannelConfig } from '../../../state/settingsSchema'
import { useAppStore } from '../../../state/useAppStore'
import { cn } from '../../../utils/cn'
import { ChannelMeter, DominantTone, SpectrumStrip } from '../../audio/SpectrumStrip'
import { ColorField } from '../../ui/ColorField'
import { Button, Group, Hint, IconButton, SegmentedField, SelectField } from '../../ui/primitives'
import { NumberInput, RangeField, SliderField } from '../../ui/SliderField'
import { channelDefaults } from '../sectionMeta'

const BAND_COUNTS = [1, 2, 3, 4, 6, 8, 12, 16]

function rangeLabel(ch: ChannelConfig) {
  const [lo, hi] = channelRange(ch)
  return `${formatHz(lo)} – ${formatHz(hi)}`
}

function CurvePreview({ curve, gamma, threshold }: { curve: ChannelConfig['curve']; gamma: number; threshold: number }) {
  const pts: string[] = []
  for (let i = 0; i <= 32; i++) {
    const x = i / 32
    const t = x <= threshold ? 0 : (x - threshold) / (1 - threshold)
    const y = applyCurve(Math.min(1, t), curve, gamma)
    pts.push(`${(x * 56).toFixed(1)},${(40 - y * 36).toFixed(1)}`)
  }
  return (
    <svg width="60" height="44" viewBox="-2 0 60 44" className="shrink-0 rounded-md border border-line bg-graphite-950/70" aria-hidden="true">
      <polyline points={pts.join(' ')} fill="none" stroke="#dce6ff" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

/** Every per-channel control: frequency, color, response, timing and light. */
export function ChannelEditor({ id }: { id: string }) {
  const t = useT()
  const channel = useAppStore((s) => s.settings.channels.find((c) => c.id === id))
  const index = useAppStore((s) => s.settings.channels.findIndex((c) => c.id === id))
  const updateChannel = useAppStore((s) => s.updateChannel)
  const sampleRate = useAppStore((s) => s.audio.sampleRate)
  if (!channel) return null
  const d = channelDefaults()
  const set = <K extends keyof ChannelConfig>(key: K, value: ChannelConfig[K]) => updateChannel(id, (c) => void (c[key] = value))
  const nyq = Math.min(24000, sampleRate / 2)

  return (
    <div className="flex flex-col gap-5 pt-1" data-testid="channel-editor">
      <Group title={t('Band')}>
        <label className="flex items-center justify-between gap-3">
          <span className="text-xs text-ink-muted">{t('Name')}</span>
          <input
            data-testid="channel-name-input"
            aria-label={t('Channel name')}
            className="h-8 w-44 rounded-[var(--radius-control)] border border-line-strong bg-graphite-800 px-2.5 text-xs text-ink outline-none focus:border-ice/50 pointer-coarse:h-10"
            value={channel.name}
            maxLength={40}
            onChange={(e) => set('name', e.target.value)}
          />
        </label>
        <SegmentedField
          label={t('Define by')}
          value={channel.rangeMode}
          options={[
            { value: 'range', label: t('Range') },
            { value: 'center', label: t('Center and width') },
          ]}
          onChange={(v) => {
            const [lo, hi] = channelRange(channel)
            updateChannel(id, (c) => {
              c.rangeMode = v
              if (v === 'center') {
                c.centerHz = Math.round(Math.sqrt(lo * hi))
                c.bandwidthOct = Math.max(0.05, Math.min(6, Math.round(Math.log2(hi / lo) * 100) / 100))
              } else {
                c.minHz = Math.round(lo)
                c.maxHz = Math.round(hi)
              }
            })
          }}
        />
        {channel.rangeMode === 'range' ? (
          <RangeField
            label={t('Frequency range')}
            testId="channel-range"
            low={channel.minHz}
            high={channel.maxHz}
            min={10}
            max={nyq}
            onChange={(lo, hi) =>
              updateChannel(id, (c) => {
                c.minHz = lo
                c.maxHz = hi
              })
            }
          />
        ) : (
          <>
            <SliderField label={t('Center')} value={channel.centerHz} onChange={(v) => set('centerHz', v)} min={10} max={nyq} step={1} unit="Hz" scale="log" />
            <SliderField label={t('Width')} value={channel.bandwidthOct} onChange={(v) => set('bandwidthOct', v)} min={0.05} max={6} step={0.05} unit={t('oct')} defaultValue={d.bandwidthOct} />
          </>
        )}
        <SegmentedField
          label={t('Sub-band spacing')}
          value={channel.scale}
          options={[
            { value: 'log', label: t('Logarithmic') },
            { value: 'linear', label: t('Linear') },
          ]}
          onChange={(v) => set('scale', v)}
        />
        <div className="rounded-[10px] border border-line bg-graphite-900/60 px-3 py-2.5">
          <div className="text-2xs text-ink-faint">{t('Band energy (faint: live, solid: after delay)')}</div>
          <ChannelMeter index={index} color={channel.color} className="mt-2 h-1.5" />
          <div className="mt-2 flex items-center justify-between text-2xs text-ink-faint">
            <span>{t('Strongest tone in band')}</span>
            <DominantTone channelIndex={index} className="text-xs text-ink-muted" />
          </div>
        </div>
      </Group>

      <Group
        title={t('Color')}
        aside={
          <Button size="sm" variant="ghost" onClick={() => updateChannel(id, (c) => Object.assign(c, deriveChannelColors(c.color)))}>
            <Wand2 size={13} /> {t('Match to primary')}
          </Button>
        }
      >
        <ColorField label={t('Primary')} value={channel.color} onChange={(v) => set('color', v)} testId="channel-color" />
        <ColorField label={t('Glow')} value={channel.secondaryColor} onChange={(v) => set('secondaryColor', v)} />
        <ColorField label={t('Gradient start')} value={channel.gradientStart} onChange={(v) => set('gradientStart', v)} />
        <ColorField label={t('Gradient end')} value={channel.gradientEnd} onChange={(v) => set('gradientEnd', v)} />
        <div className="h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${channel.gradientStart}, ${channel.color}, ${channel.gradientEnd})` }} aria-hidden="true" />
        <SliderField label={t('Opacity')} value={channel.opacity * 100} onChange={(v) => set('opacity', v / 100)} min={0} max={100} step={1} unit="%" defaultValue={d.opacity * 100} />
        <SliderField label={t('Glow strength')} value={channel.glow} onChange={(v) => set('glow', v)} min={0} max={3} step={0.05} defaultValue={d.glow} />
        <SelectField
          label={t('Blend mode')}
          value={channel.blendMode}
          options={[
            { value: 'additive', label: t('Additive light') },
            { value: 'soft', label: t('Soft light') },
            { value: 'normal', label: t('Normal') },
          ]}
          onChange={(v) => set('blendMode', v)}
        />
      </Group>

      <Group title={t('Response')}>
        <SliderField label={t('Sensitivity')} value={channel.sensitivity} onChange={(v) => set('sensitivity', v)} min={0} max={8} step={0.05} unit="×" defaultValue={d.sensitivity} />
        <SliderField label={t('Gain')} value={channel.gainDb} onChange={(v) => set('gainDb', v)} min={-36} max={36} step={0.5} unit="dB" defaultValue={d.gainDb} />
        <SliderField label={t('Threshold')} value={channel.threshold * 100} onChange={(v) => set('threshold', v / 100)} min={0} max={95} step={1} unit="%" defaultValue={d.threshold * 100} />
        <div className="flex items-end gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <SelectField
              label={t('Response curve')}
              value={channel.curve}
              options={[
                { value: 'linear', label: t('Linear') },
                { value: 'smooth', label: t('Smooth') },
                { value: 'punchy', label: t('Punchy') },
                { value: 'soft', label: t('Soft') },
                { value: 'gamma', label: t('Custom gamma') },
              ]}
              onChange={(v) => set('curve', v)}
            />
            {channel.curve === 'gamma' && <SliderField label={t('Gamma')} value={channel.curveGamma} onChange={(v) => set('curveGamma', v)} min={0.2} max={5} step={0.05} defaultValue={d.curveGamma} />}
          </div>
          <CurvePreview curve={channel.curve} gamma={channel.curveGamma} threshold={channel.threshold} />
        </div>
      </Group>

      <Group title={t('Timing')}>
        <SliderField
          label={t('Delay')}
          value={channel.delayMs}
          onChange={(v) => set('delayMs', v)}
          min={0}
          max={MAX_DELAY_MS}
          step={5}
          unit="ms"
          defaultValue={d.delayMs}
          testId="channel-delay"
          hint={t("A true time shift: the visuals replay this band's energy later, without smoothing it.")}
        />
        <SliderField label={t('Attack')} value={channel.attackMs} onChange={(v) => set('attackMs', v)} min={0} max={2000} step={1} unit="ms" scale="log" defaultValue={d.attackMs} />
        <SliderField label={t('Release')} value={channel.releaseMs} onChange={(v) => set('releaseMs', v)} min={0} max={5000} step={5} unit="ms" scale="log" defaultValue={d.releaseMs} />
      </Group>

      <Group title={t('Light')}>
        <SliderField label={t('Brightness')} value={channel.brightness} onChange={(v) => set('brightness', v)} min={0} max={4} step={0.05} unit="×" defaultValue={d.brightness} />
        <SliderField label={t('Contrast')} value={channel.contrast} onChange={(v) => set('contrast', v)} min={0.1} max={4} step={0.05} defaultValue={d.contrast} />
        <SliderField
          label={t('Minimum intensity')}
          value={channel.minIntensity * 100}
          onChange={(v) => set('minIntensity', Math.min(v / 100, channel.maxIntensity))}
          min={0}
          max={100}
          step={1}
          unit="%"
          defaultValue={d.minIntensity * 100}
        />
        <SliderField
          label={t('Maximum intensity')}
          value={channel.maxIntensity * 100}
          onChange={(v) => set('maxIntensity', Math.max(v / 100, channel.minIntensity))}
          min={0}
          max={200}
          step={1}
          unit="%"
          defaultValue={d.maxIntensity * 100}
        />
        <SliderField
          label={t('Spatial position')}
          value={channel.position * 100}
          onChange={(v) => set('position', v / 100)}
          min={0}
          max={100}
          step={1}
          unit="%"
          hint={t('Ring radius when rings use channel positions.')}
        />
      </Group>
    </div>
  )
}

function ChannelRow({ channel, index, count }: { channel: ChannelConfig; index: number; count: number }) {
  const t = useT()
  const editingId = useAppStore((s) => s.ui.editingChannelId)
  const floating = useAppStore((s) => s.ui.floatingEditor)
  const setUi = useAppStore((s) => s.setUi)
  const updateChannel = useAppStore((s) => s.updateChannel)
  const duplicate = useAppStore((s) => s.duplicateChannel)
  const remove = useAppStore((s) => s.removeChannel)
  const move = useAppStore((s) => s.moveChannel)
  const desktop = useIsDesktop()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: channel.id })
  const expanded = editingId === channel.id
  const item = 'flex h-8 cursor-pointer select-none items-center gap-2.5 rounded-md px-2 text-xs text-ink outline-none data-[highlighted]:bg-white/[0.08] data-[disabled]:opacity-40'

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-testid="channel-row"
      className={cn('rounded-[12px] border transition-colors', expanded ? 'border-line-strong bg-graphite-900/70' : 'border-transparent', isDragging && 'relative z-10 bg-graphite-800 shadow-2xl')}
    >
      <div className="flex items-center gap-1.5 py-1 pl-0.5 pr-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={t('Reorder {name}', { name: channel.name })}
          className="flex size-7 cursor-grab touch-none items-center justify-center rounded-md text-ink-faint hover:text-ink active:cursor-grabbing pointer-coarse:size-9"
        >
          <GripVertical size={14} />
        </button>
        <ColorField
          compact
          label={t('{name} color', { name: channel.name })}
          value={channel.color}
          onChange={(c) => updateChannel(channel.id, (ch) => Object.assign(ch, deriveChannelColors(c)))}
        />
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setUi({ editingChannelId: expanded ? null : channel.id })}
          className={cn('flex min-w-0 flex-1 flex-col gap-1 rounded-md px-1.5 py-1 text-left', !channel.enabled && 'opacity-45')}
          data-testid="channel-row-toggle"
        >
          <span className="flex items-center gap-2">
            <span className="truncate text-xs text-ink">{channel.name}</span>
            <span className="num ml-auto shrink-0 text-2xs text-ink-faint">{rangeLabel(channel)}</span>
            {channel.delayMs > 0 && <span className="num shrink-0 rounded bg-white/[0.06] px-1 text-2xs text-ink-muted">+{Math.round(channel.delayMs)} ms</span>}
          </span>
          <ChannelMeter index={index} color={channel.color} />
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          <span className="scale-90">
            <SwitchInline checked={channel.enabled} label={t('{name} enabled', { name: channel.name })} onChange={(v) => updateChannel(channel.id, (c) => void (c.enabled = v))} />
          </span>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                aria-label={t('{name} actions', { name: channel.name })}
                className="flex size-7 items-center justify-center rounded-md text-ink-muted hover:bg-white/[0.07] hover:text-ink pointer-coarse:size-9"
              >
                <MoreHorizontal size={15} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content align="end" sideOffset={6} className="z-[85] w-52 rounded-[12px] border border-line-strong bg-graphite-800 p-1 shadow-2xl">
                <DropdownMenu.Item className={item} onSelect={() => setUi({ editingChannelId: channel.id })}>
                  <ChevronDown size={13} /> {t('Edit')}
                </DropdownMenu.Item>
                {desktop && (
                  <DropdownMenu.Item className={item} onSelect={() => setUi({ editingChannelId: channel.id, floatingEditor: true })}>
                    <PanelRightOpen size={13} /> {t('Edit in floating window')}
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Item className={item} disabled={count >= MAX_CHANNELS} onSelect={() => duplicate(channel.id)}>
                  <Copy size={13} /> {t('Duplicate')}
                </DropdownMenu.Item>
                <DropdownMenu.Item className={item} disabled={index === 0} onSelect={() => move(index, index - 1)}>
                  <ArrowUp size={13} /> {t('Move up')}
                </DropdownMenu.Item>
                <DropdownMenu.Item className={item} disabled={index === count - 1} onSelect={() => move(index, index + 1)}>
                  <ArrowDown size={13} /> {t('Move down')}
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="my-1 h-px bg-line" />
                <DropdownMenu.Item className={cn(item, 'text-danger')} disabled={count <= 1} onSelect={() => remove(channel.id)}>
                  <Trash2 size={13} /> {t('Delete')}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
      {expanded && !floating && (
        <div className="border-t border-line px-3.5 pb-4 pt-4">
          <ChannelEditor id={channel.id} />
        </div>
      )}
    </li>
  )
}

function SwitchInline({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn('relative h-5 w-9 rounded-full border transition-colors pointer-coarse:h-6 pointer-coarse:w-11', checked ? 'border-ice/60 bg-ice/85' : 'border-line-strong bg-graphite-600')}
    >
      <span
        className={cn(
          'absolute top-1/2 block size-3.5 -translate-y-1/2 rounded-full transition-all pointer-coarse:size-[18px]',
          checked ? 'left-[18px] bg-void pointer-coarse:left-[22px]' : 'left-[2px] bg-ink',
        )}
      />
    </button>
  )
}

export function ChannelsSection() {
  const t = useT()
  const channels = useAppStore((s) => s.settings.channels)
  const editingId = useAppStore((s) => s.ui.editingChannelId)
  const addChannel = useAppStore((s) => s.addChannel)
  const applyLayout = useAppStore((s) => s.applyChannelLayout)
  const generate = useAppStore((s) => s.generateChannelBands)
  const move = useAppStore((s) => s.moveChannel)
  const setUi = useAppStore((s) => s.setUi)
  const [customCount, setCustomCount] = useState(10)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const from = channels.findIndex((c) => c.id === e.active.id)
    const to = channels.findIndex((c) => c.id === e.over!.id)
    move(from, to)
  }

  return (
    <div className="flex flex-col gap-5">
      <SpectrumStrip highlightId={editingId} />
      <Group title={t('Layout')}>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Number of log-spaced bands')}>
          {BAND_COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => generate(n)}
              data-testid={`bands-${n}`}
              className={cn(
                'num h-8 min-w-9 rounded-[8px] border px-2 text-xs transition-colors pointer-coarse:h-10',
                channels.length === n ? 'border-ice/40 bg-white/[0.08] text-ink' : 'border-line text-ink-muted hover:text-ink',
              )}
            >
              {n}
            </button>
          ))}
          <span className="flex items-center gap-1.5 pl-1">
            <span className="text-xs text-ink-muted">{t('Custom')}</span>
            <NumberInput label={t('Custom band count')} value={customCount} onCommit={(v) => setCustomCount(Math.round(v))} min={1} max={MAX_CHANNELS} step={1} />
            <Button size="sm" variant="secondary" onClick={() => generate(customCount)}>
              {t('Split')}
            </Button>
          </span>
        </div>
        <Hint>{t('Splits the displayed frequency range into evenly spaced bands with fresh colors.')}</Hint>
        <SelectField<ChannelLayoutId | 'none'>
          label={t('Start from a mapping')}
          value="none"
          options={[{ value: 'none', label: t('Choose…') }, ...(Object.keys(CHANNEL_LAYOUTS) as ChannelLayoutId[]).map((k) => ({ value: k, label: t(CHANNEL_LAYOUTS[k].label) }))]}
          onChange={(v) => v !== 'none' && applyLayout(v)}
        />
      </Group>
      <Group
        title={t('Channels · {count}', { count: channels.length })}
        aside={
          <Button size="sm" variant="secondary" onClick={() => addChannel()} disabled={channels.length >= MAX_CHANNELS} data-testid="add-channel">
            <Plus size={13} /> {t('Add channel')}
          </Button>
        }
      >
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={channels.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <ul className="-mx-1.5 flex flex-col gap-0.5" aria-label={t('Frequency channels')}>
              {channels.map((ch, i) => (
                <ChannelRow key={ch.id} channel={ch} index={i} count={channels.length} />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
        {channels.length >= MAX_CHANNELS && <Hint>{t('Aurora supports up to {max} channels.', { max: MAX_CHANNELS })}</Hint>}
        {editingId && (
          <Button size="sm" variant="ghost" className="self-start" onClick={() => setUi({ editingChannelId: null })}>
            {t('Collapse editor')}
          </Button>
        )}
      </Group>
    </div>
  )
}

/** Desktop: the channel editor detached into a draggable floating window. */
export function FloatingChannelEditor() {
  const t = useT()
  const floating = useAppStore((s) => s.ui.floatingEditor)
  const editingId = useAppStore((s) => s.ui.editingChannelId)
  const channels = useAppStore((s) => s.settings.channels)
  const setUi = useAppStore((s) => s.setUi)
  const desktop = useIsDesktop()
  const [pos, setPos] = useState({ x: 24, y: 80 })
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  const channel = channels.find((c) => c.id === editingId)
  if (!floating || !desktop || !channel) return null

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    setPos({
      x: Math.max(8, Math.min(window.innerWidth - 120, e.clientX - drag.current.dx)),
      y: Math.max(8, Math.min(window.innerHeight - 80, e.clientY - drag.current.dy)),
    })
  }

  return (
    <div
      role="dialog"
      aria-label={t('{name} channel', { name: channel.name })}
      className="glass fixed z-[45] flex max-h-[calc(100vh-100px)] w-[360px] flex-col overflow-hidden rounded-[var(--radius-panel)]"
      style={{ left: pos.x, top: pos.y }}
    >
      <div className="flex cursor-move touch-none items-center gap-2.5 border-b border-line px-4 py-3" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => (drag.current = null)}>
        <span className="size-3 rounded-full" style={{ background: channel.color, boxShadow: `0 0 10px ${channel.color}` }} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-sm font-[560]">{channel.name}</span>
        <IconButton label={t('Dock editor in the panel')} onClick={() => setUi({ floatingEditor: false })}>
          <Pin size={14} />
        </IconButton>
        <IconButton label={t('Close editor')} onClick={() => setUi({ floatingEditor: false, editingChannelId: null })}>
          <X size={15} />
        </IconButton>
      </div>
      <div className="scroll-thin overflow-y-auto px-4 pb-5 pt-4">
        <ChannelEditor id={channel.id} />
      </div>
    </div>
  )
}
