import { Expand } from 'lucide-react'
import { useFullscreen, useIsDesktop } from '../../../hooks'
import { VISUALIZATION_MODES, type VisualizationMode } from '../../../state/settingsSchema'
import { useAppStore } from '../../../state/useAppStore'
import { ModeGlyph } from '../../visualizer/glyphs'
import { MODE_LABELS } from '../../visualizer/modeLabels'
import { Button, Group, Hint, SegmentedField, SelectField, SwitchField } from '../../ui/primitives'
import { cn } from '../../../utils/cn'
import { SliderField } from '../../ui/SliderField'
import { useSettingsGroup } from '../sectionMeta'

const MODE_COPY: Record<VisualizationMode, string> = {
  rings: 'Concentric rings of light that swell and bend with their bands.',
  leds: 'Circular rows of individual LEDs, like a programmable light installation.',
  bars: 'An equalizer, or a full-screen wall of light cells.',
  squares: 'Nested squares, LED matrices, tiles and expanding square waves.',
}

export function ModeSection() {
  const mode = useAppStore((s) => s.settings.mode)
  const setMode = useAppStore((s) => s.setMode)
  const [rings, setRings] = useSettingsGroup('rings')
  const [leds, setLeds] = useSettingsGroup('leds')
  const [bars, setBars] = useSettingsGroup('bars')
  const [squares, setSquares] = useSettingsGroup('squares')
  const desktop = useIsDesktop()
  const fullscreen = useFullscreen()

  return (
    <div className="flex flex-col gap-5">
      {!desktop && fullscreen.supported && (
        <Button variant="secondary" onClick={() => void fullscreen.toggle()}>
          <Expand size={14} /> {fullscreen.isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        </Button>
      )}
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Visualization mode">
        {VISUALIZATION_MODES.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            data-testid={`mode-card-${m}`}
            onClick={() => setMode(m)}
            className={cn(
              'flex flex-col items-start gap-2 rounded-[12px] border p-3 text-left transition-colors',
              mode === m ? 'border-ice/45 bg-white/[0.07]' : 'border-line hover:border-line-strong hover:bg-white/[0.03]',
            )}
          >
            <span className={mode === m ? 'text-ice' : 'text-ink-muted'}>
              <ModeGlyph mode={m} size={22} />
            </span>
            <span className="text-xs font-[560] text-ink">{MODE_LABELS[m]}</span>
            <span className="text-2xs leading-snug text-ink-muted">{MODE_COPY[m]}</span>
          </button>
        ))}
      </div>

      {mode === 'rings' && (
        <Group title="Ring style">
          <SegmentedField
            label="Rings follow"
            value={rings.assignment}
            options={[
              { value: 'grouped', label: 'Groups' },
              { value: 'perChannel', label: 'One each' },
              { value: 'cycled', label: 'Cycle' },
              { value: 'spectrum', label: 'Spectrum' },
            ]}
            onChange={(v) => setRings('assignment', v)}
          />
          <Hint>
            Groups give each channel a block of rings across its sub-bands. One each draws exactly one ring per channel. Cycle repeats the channels outward. Spectrum spreads rings evenly across all frequencies.
          </Hint>
          <SegmentedField label="Shape" value={rings.shape} options={[{ value: 'circle', label: 'Circles' }, { value: 'square', label: 'Squares' }]} onChange={(v) => setRings('shape', v)} />
          <SegmentedField
            label="Center"
            value={rings.center}
            options={[
              { value: 'orb', label: 'Orb' },
              { value: 'pulse', label: 'Pulse' },
              { value: 'none', label: 'None' },
            ]}
            onChange={(v) => setRings('center', v)}
          />
        </Group>
      )}
      {mode === 'leds' && (
        <Group title="LED behaviour">
          <SegmentedField
            label="Mapping"
            value={leds.mapping}
            options={[
              { value: 'rowPerBand', label: 'One band per row' },
              { value: 'ledMix', label: 'Each LED mixes bands' },
            ]}
            onChange={(v) => setLeds('mapping', v)}
            testIdPrefix="led-mapping"
          />
          {leds.mapping === 'rowPerBand' ? (
            <SegmentedField
              label="Row style"
              value={leds.rowStyle}
              options={[
                { value: 'spectrum', label: 'Spectrum' },
                { value: 'arc', label: 'Level arc' },
                { value: 'uniform', label: 'Uniform' },
              ]}
              onChange={(v) => setLeds('rowStyle', v)}
            />
          ) : (
            <SegmentedField
              label="Mix pattern"
              value={leds.mixPattern}
              options={[
                { value: 'angular', label: 'Angular' },
                { value: 'radial', label: 'Radial' },
                { value: 'spiral', label: 'Spiral' },
                { value: 'checker', label: 'Checker' },
              ]}
              onChange={(v) => setLeds('mixPattern', v)}
            />
          )}
        </Group>
      )}
      {mode === 'bars' && (
        <Group title="Bar style">
          <SegmentedField
            label="Style"
            value={bars.style}
            options={[
              { value: 'equalizer', label: 'Equalizer' },
              { value: 'lightwall', label: 'Light wall' },
            ]}
            onChange={(v) => setBars('style', v)}
            testIdPrefix="bars-style"
          />
          <SegmentedField label="Orientation" value={bars.orientation} options={[{ value: 'vertical', label: 'Vertical' }, { value: 'horizontal', label: 'Horizontal' }]} onChange={(v) => setBars('orientation', v)} />
        </Group>
      )}
      {mode === 'squares' && (
        <Group title="Square style">
          <SelectField
            label="Layout"
            value={squares.layout}
            options={[
              { value: 'concentric', label: 'Concentric squares' },
              { value: 'nested', label: 'Nested, twisting' },
              { value: 'matrix', label: 'LED matrix' },
              { value: 'tiles', label: 'Tiles' },
              { value: 'waves', label: 'Expanding waves' },
            ]}
            onChange={(v) => setSquares('layout', v)}
            testId="squares-layout"
          />
          <SelectField
            label="Channels map by"
            value={squares.mapping}
            options={[
              { value: 'radius', label: 'Distance from center' },
              { value: 'row', label: 'Row' },
              { value: 'column', label: 'Column' },
              { value: 'cell', label: 'Cell' },
              { value: 'spectrum', label: 'Spectrum' },
            ]}
            onChange={(v) => setSquares('mapping', v)}
          />
        </Group>
      )}
    </div>
  )
}

function RingsGeometry() {
  const [r, set] = useSettingsGroup('rings')
  return (
    <>
      <Group title="Layout">
        <SliderField label="Rings" value={r.count} onChange={(v) => set('count', v)} min={1} max={128} step={1} testId="ring-count" defaultValue={24} />
        <SliderField label="Inner radius" value={r.innerRadius} onChange={(v) => set('innerRadius', Math.min(v, r.outerRadius))} min={0} max={0.95} step={0.005} defaultValue={0.16} />
        <SliderField label="Outer radius" value={r.outerRadius} onChange={(v) => set('outerRadius', Math.max(v, r.innerRadius))} min={0.1} max={1.5} step={0.005} defaultValue={0.94} />
        <SliderField label="Spacing curve" value={r.spacingCurve} onChange={(v) => set('spacingCurve', v)} min={0.3} max={3} step={0.01} defaultValue={1.15} hint="Below 1 packs rings outward, above 1 packs them toward the center." />
        <SegmentedField label="Radius from" value={r.radiusSource} options={[{ value: 'auto', label: 'Even spacing' }, { value: 'channel', label: 'Channel positions' }]} onChange={(v) => set('radiusSource', v)} />
        <SliderField label="Thickness" value={r.thickness * 1000} onChange={(v) => set('thickness', v / 1000)} min={0.5} max={80} step={0.1} defaultValue={5.5} />
        <SliderField label="Glow width" value={r.glowWidth * 1000} onChange={(v) => set('glowWidth', v / 1000)} min={0} max={200} step={0.5} defaultValue={35} />
        <SliderField label="Center size" value={r.centerSize * 100} onChange={(v) => set('centerSize', v / 100)} min={0} max={40} step={0.5} unit="%" />
      </Group>
      <Group title="Reaction">
        <SliderField label="Radial expansion" value={r.radiusReactivity * 100} onChange={(v) => set('radiusReactivity', v / 100)} min={0} max={30} step={0.1} />
        <SliderField label="Thickness swell" value={r.thicknessReactivity} onChange={(v) => set('thicknessReactivity', v)} min={0} max={6} step={0.05} />
        <SliderField label="Opacity follows level" value={r.opacityReactivity * 100} onChange={(v) => set('opacityReactivity', v / 100)} min={0} max={100} step={1} unit="%" />
        <SwitchField label="Peak rings" description="A faint ring holds each recent peak" checked={r.peakRings} onChange={(v) => set('peakRings', v)} />
      </Group>
      <Group title="Shape and motion">
        <SliderField label="Distortion" value={r.distortion * 100} onChange={(v) => set('distortion', v / 100)} min={0} max={25} step={0.1} />
        <SliderField label="Lobes" value={r.distortionLobes} onChange={(v) => set('distortionLobes', v)} min={0} max={24} step={1} />
        <SliderField label="Distortion speed" value={r.distortionSpeed} onChange={(v) => set('distortionSpeed', v)} min={-4} max={4} step={0.05} />
        <SliderField label="Spectrum warp" value={r.spectrumWarp * 100} onChange={(v) => set('spectrumWarp', v / 100)} min={0} max={25} step={0.1} hint="Bends each ring by the live spectrum around it." />
        <SliderField label="Rotation speed" value={r.rotationSpeed} onChange={(v) => set('rotationSpeed', v)} min={-2} max={2} step={0.01} defaultValue={0.06} />
        <SwitchField label="Alternate rotation" checked={r.alternateRotation} onChange={(v) => set('alternateRotation', v)} />
        <SwitchField label="Mirrored symmetry" checked={r.mirror} onChange={(v) => set('mirror', v)} />
        <SliderField label="Depth" value={r.depth} onChange={(v) => set('depth', v)} min={0} max={2} step={0.01} hint="Pushes inner rings back in space. Combine with camera motion for a tunnel." />
      </Group>
    </>
  )
}

function LedsGeometry() {
  const [l, set] = useSettingsGroup('leds')
  return (
    <>
      <Group title="Layout">
        <SliderField label="Rows" value={l.rows} onChange={(v) => set('rows', v)} min={1} max={48} step={1} testId="led-rows" />
        <SliderField label="LEDs per row" value={l.ledsPerRow} onChange={(v) => set('ledsPerRow', v)} min={4} max={512} step={1} />
        <SwitchField label="Even spacing" description="Inner rows get fewer LEDs" checked={l.constantSpacing} onChange={(v) => set('constantSpacing', v)} />
        <SliderField label="Inner radius" value={l.innerRadius} onChange={(v) => set('innerRadius', Math.min(v, l.outerRadius))} min={0} max={0.95} step={0.005} />
        <SliderField label="Outer radius" value={l.outerRadius} onChange={(v) => set('outerRadius', Math.max(v, l.innerRadius))} min={0.1} max={1.5} step={0.005} />
        <SliderField label="LED size" value={l.ledSize * 100} onChange={(v) => set('ledSize', v / 100)} min={10} max={150} step={1} unit="%" />
        <SegmentedField label="LED shape" value={l.shape} options={[{ value: 'round', label: 'Round' }, { value: 'square', label: 'Square' }, { value: 'diamond', label: 'Diamond' }]} onChange={(v) => set('shape', v)} />
      </Group>
      <Group title="Light">
        <SliderField label="Diffusion" value={l.diffusion * 100} onChange={(v) => set('diffusion', v / 100)} min={0} max={100} step={1} unit="%" />
        <SliderField label="Unlit glow" value={l.unlitLevel * 100} onChange={(v) => set('unlitLevel', v / 100)} min={0} max={30} step={0.5} unit="%" />
        <SliderField label="Rainbow" value={l.rainbow * 100} onChange={(v) => set('rainbow', v / 100)} min={0} max={100} step={1} unit="%" hint="Rotates hue around each row." />
        {l.mapping === 'ledMix' && <SliderField label="Band blending" value={l.mixSpread} onChange={(v) => set('mixSpread', v)} min={0.05} max={3} step={0.01} />}
      </Group>
      <Group title="Motion">
        <SwitchField label="Pulse waves" description="Beats travel outward row by row" checked={l.pulseWaves} onChange={(v) => set('pulseWaves', v)} />
        <SliderField label="Wave step" value={l.pulseSpeedMs} onChange={(v) => set('pulseSpeedMs', v)} min={10} max={200} step={1} unit="ms" disabled={!l.pulseWaves} />
        <SliderField label="Rotation speed" value={l.rotationSpeed} onChange={(v) => set('rotationSpeed', v)} min={-2} max={2} step={0.01} />
        <SwitchField label="Alternate rotation" checked={l.alternateRotation} onChange={(v) => set('alternateRotation', v)} />
      </Group>
    </>
  )
}

function BarsGeometry() {
  const [b, set] = useSettingsGroup('bars')
  return (
    <>
      <Group title="Layout">
        <SliderField label="Columns" value={b.columns} onChange={(v) => set('columns', v)} min={1} max={256} step={1} testId="bar-columns" />
        <SliderField label={b.style === 'equalizer' ? 'Segments' : 'Rows'} value={b.rows} onChange={(v) => set('rows', v)} min={1} max={64} step={1} />
        <SliderField label="Width" value={b.widthScale * 100} onChange={(v) => set('widthScale', v / 100)} min={20} max={100} step={1} unit="%" />
        <SliderField label="Height" value={b.heightScale * 100} onChange={(v) => set('heightScale', v / 100)} min={10} max={100} step={1} unit="%" />
        <SliderField label="Gap" value={b.gap * 100} onChange={(v) => set('gap', v / 100)} min={0} max={90} step={1} unit="%" />
        {b.style === 'equalizer' && <SwitchField label="Segmented" description="LED-style stacked cells" checked={b.segmented} onChange={(v) => set('segmented', v)} />}
        {b.style === 'equalizer' && b.segmented && <SliderField label="Segment gap" value={b.segmentGap * 100} onChange={(v) => set('segmentGap', v / 100)} min={0} max={90} step={1} unit="%" />}
        <SliderField label="Corner radius" value={b.cornerRadius * 100} onChange={(v) => set('cornerRadius', v / 100)} min={0} max={50} step={1} unit="%" />
        <SelectField
          label="Mirror"
          value={b.mirror}
          options={[
            { value: 'none', label: 'None' },
            { value: 'horizontal', label: 'From the center out' },
            { value: 'vertical', label: 'Up and down' },
            { value: 'both', label: 'Both' },
          ]}
          onChange={(v) => set('mirror', v)}
        />
        {b.style === 'equalizer' && (
          <SegmentedField label="Columns per channel" value={b.distribution} options={[{ value: 'log', label: 'By bandwidth' }, { value: 'linear', label: 'Equal' }]} onChange={(v) => set('distribution', v)} />
        )}
      </Group>
      <Group title="Light and motion">
        <SelectField
          label="Coloring"
          value={b.colorMode}
          options={[
            { value: 'channel', label: 'Channel colors' },
            { value: 'vertical', label: 'Channel gradient' },
            { value: 'frequency', label: 'Frequency map' },
          ]}
          onChange={(v) => set('colorMode', v)}
        />
        <SliderField label="Glow" value={b.glow} onChange={(v) => set('glow', v)} min={0} max={2} step={0.05} />
        {b.style === 'equalizer' && <SwitchField label="Peak markers" checked={b.peakMarkers} onChange={(v) => set('peakMarkers', v)} />}
        <SliderField label="Wave propagation" value={b.waveProp * 100} onChange={(v) => set('waveProp', v / 100)} min={0} max={100} step={1} unit="%" hint="Lets energy ripple into neighbouring cells." />
      </Group>
    </>
  )
}

function SquaresGeometry() {
  const [q, set] = useSettingsGroup('squares')
  const outline = q.layout === 'concentric' || q.layout === 'nested'
  return (
    <>
      <Group title="Layout">
        {outline ? (
          <SliderField label="Layers" value={q.layers} onChange={(v) => set('layers', v)} min={1} max={64} step={1} />
        ) : (
          <>
            <SliderField label="Rows" value={q.rows} onChange={(v) => set('rows', v)} min={1} max={64} step={1} testId="square-rows" />
            <SliderField label="Columns" value={q.columns} onChange={(v) => set('columns', v)} min={1} max={64} step={1} />
            <SliderField label="Gap" value={q.gap * 100} onChange={(v) => set('gap', v / 100)} min={0} max={90} step={1} unit="%" />
            {q.layout !== 'matrix' && <SliderField label="Corner radius" value={q.cornerRadius * 100} onChange={(v) => set('cornerRadius', v / 100)} min={0} max={50} step={1} unit="%" />}
          </>
        )}
        <SliderField label="Size" value={q.size * 100} onChange={(v) => set('size', v / 100)} min={20} max={150} step={1} unit="%" />
        {outline && (
          <>
            <SliderField label="Line thickness" value={q.thickness * 1000} onChange={(v) => set('thickness', v / 1000)} min={0.5} max={80} step={0.1} />
            <SliderField label="Glow width" value={q.glowWidth * 1000} onChange={(v) => set('glowWidth', v / 1000)} min={0} max={200} step={0.5} />
          </>
        )}
        <SelectField
          label="Symmetry"
          value={q.symmetry}
          options={[
            { value: 'none', label: 'None' },
            { value: 'mirror', label: 'Mirror' },
            { value: 'quad', label: 'Four-way' },
            { value: 'kaleido', label: 'Kaleidoscope' },
          ]}
          onChange={(v) => set('symmetry', v)}
        />
      </Group>
      <Group title="Motion">
        <SliderField label="Rotation" value={q.rotation} onChange={(v) => set('rotation', v)} min={-180} max={180} step={0.5} unit="°" defaultValue={0} />
        <SliderField label="Rotation speed" value={q.rotationSpeed} onChange={(v) => set('rotationSpeed', v)} min={-2} max={2} step={0.01} />
        {q.layout === 'nested' && <SliderField label="Twist per layer" value={q.twist} onChange={(v) => set('twist', v)} min={-45} max={45} step={0.1} unit="°" />}
        <SliderField label="Scale pulse" value={q.scalePulse * 100} onChange={(v) => set('scalePulse', v / 100)} min={0} max={50} step={0.5} unit="%" />
        <SliderField label="Displacement" value={q.displacement * 100} onChange={(v) => set('displacement', v / 100)} min={0} max={30} step={0.5} unit="%" />
        {q.layout === 'waves' && <SliderField label="Wave step" value={q.waveSpeedMs} onChange={(v) => set('waveSpeedMs', v)} min={10} max={400} step={1} unit="ms" hint="Delay added per ring of cells away from the center." />}
      </Group>
    </>
  )
}

export function GeometrySection() {
  const mode = useAppStore((s) => s.settings.mode)
  return (
    <div className="flex flex-col gap-5">
      <Hint>
        Showing controls for <span className="text-ink">{MODE_LABELS[mode]}</span>. Switch modes to edit the others.
      </Hint>
      {mode === 'rings' && <RingsGeometry />}
      {mode === 'leds' && <LedsGeometry />}
      {mode === 'bars' && <BarsGeometry />}
      {mode === 'squares' && <SquaresGeometry />}
    </div>
  )
}
