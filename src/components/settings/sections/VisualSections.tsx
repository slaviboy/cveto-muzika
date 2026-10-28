import { Expand } from 'lucide-react'
import { useFullscreen, useIsDesktop } from '../../../hooks'
import { useT } from '../../../i18n/useT'
import { VISUALIZATION_MODES } from '../../../state/settingsSchema'
import { useAppStore } from '../../../state/useAppStore'
import { cn } from '../../../utils/cn'
import { ModeGlyph } from '../../visualizer/glyphs'
import { MODE_COPY, MODE_LABELS } from '../../visualizer/modeLabels'
import { Button, Group, Hint, SegmentedField, SelectField, SwitchField } from '../../ui/primitives'
import { SliderField } from '../../ui/SliderField'
import { useSettingsGroup } from '../sectionMeta'

export function ModeSection() {
  const t = useT()
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
          <Expand size={14} /> {fullscreen.isFullscreen ? t('Exit fullscreen') : t('Enter fullscreen')}
        </Button>
      )}
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('Visualization mode')}>
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
            <span className="text-xs font-[560] text-ink">{t(MODE_LABELS[m])}</span>
            <span className="text-2xs leading-snug text-ink-muted">{t(MODE_COPY[m])}</span>
          </button>
        ))}
      </div>

      {mode === 'rings' && (
        <Group title={t('Ring style')}>
          <SegmentedField
            label={t('Rings are drawn as')}
            value={rings.style}
            options={[
              { value: 'lines', label: t('Lines') },
              { value: 'touching', label: t('Touching') },
              { value: 'merged', label: t('Merged') },
            ]}
            onChange={(v) => setRings('style', v)}
            testIdPrefix="ring-style"
          />
          <Hint>
            {rings.style === 'lines'
              ? t('Thin luminous rings with soft glow.')
              : rings.style === 'touching'
                ? t('Filled rings that meet each other, one color per ring.')
                : t('Filled rings whose colors blend from one ring to the next, following the distance from the center.')}
          </Hint>
          <SegmentedField
            label={t('Rings follow')}
            value={rings.assignment}
            options={[
              { value: 'grouped', label: t('Groups') },
              { value: 'perChannel', label: t('One each') },
              { value: 'cycled', label: t('Cycle') },
              { value: 'spectrum', label: t('Spectrum') },
            ]}
            onChange={(v) => setRings('assignment', v)}
          />
          <Hint>
            {t('Groups give each channel a block of rings across its sub-bands. One each draws exactly one ring per channel. Cycle repeats the channels outward. Spectrum spreads rings evenly across all frequencies.')}
          </Hint>
          <SegmentedField
            label={t('Shape')}
            value={rings.shape}
            options={[
              { value: 'circle', label: t('Circles') },
              { value: 'square', label: t('Squares') },
            ]}
            onChange={(v) => setRings('shape', v)}
          />
          <SegmentedField
            label={t('Center')}
            value={rings.center}
            options={[
              { value: 'orb', label: t('Orb') },
              { value: 'pulse', label: t('Pulse') },
              { value: 'none', label: t('None') },
            ]}
            onChange={(v) => setRings('center', v)}
          />
        </Group>
      )}
      {mode === 'leds' && (
        <Group title={t('LED behaviour')}>
          <SegmentedField
            label={t('Mapping')}
            value={leds.mapping}
            options={[
              { value: 'rowPerBand', label: t('One band per row') },
              { value: 'ledMix', label: t('Each LED mixes bands') },
            ]}
            onChange={(v) => setLeds('mapping', v)}
            testIdPrefix="led-mapping"
          />
          {leds.mapping === 'rowPerBand' ? (
            <SegmentedField
              label={t('Row style')}
              value={leds.rowStyle}
              options={[
                { value: 'spectrum', label: t('Spectrum') },
                { value: 'arc', label: t('Level arc') },
                { value: 'uniform', label: t('Uniform') },
              ]}
              onChange={(v) => setLeds('rowStyle', v)}
            />
          ) : (
            <SegmentedField
              label={t('Mix pattern')}
              value={leds.mixPattern}
              options={[
                { value: 'angular', label: t('Angular') },
                { value: 'radial', label: t('Radial') },
                { value: 'spiral', label: t('Spiral') },
                { value: 'checker', label: t('Checker') },
              ]}
              onChange={(v) => setLeds('mixPattern', v)}
            />
          )}
        </Group>
      )}
      {mode === 'bars' && (
        <Group title={t('Bar style')}>
          <SegmentedField
            label={t('Style')}
            value={bars.style}
            options={[
              { value: 'equalizer', label: t('Equalizer') },
              { value: 'lightwall', label: t('Light wall') },
              { value: 'leds', label: t('LED bars') },
            ]}
            onChange={(v) => setBars('style', v)}
            testIdPrefix="bars-style"
          />
          {bars.style === 'leds' && <Hint>{t('Round LEDs fill the whole screen. Each column rises with its band; the brightest LED marks the recent peak.')}</Hint>}
          <SegmentedField
            label={t('Orientation')}
            value={bars.orientation}
            options={[
              { value: 'vertical', label: t('Vertical') },
              { value: 'horizontal', label: t('Horizontal') },
            ]}
            onChange={(v) => setBars('orientation', v)}
          />
        </Group>
      )}
      {mode === 'squares' && (
        <Group title={t('Square style')}>
          <SelectField
            label={t('Layout')}
            value={squares.layout}
            options={[
              { value: 'concentric', label: t('Concentric squares') },
              { value: 'nested', label: t('Nested, twisting') },
              { value: 'matrix', label: t('LED matrix') },
              { value: 'tiles', label: t('Tiles') },
              { value: 'waves', label: t('Expanding waves') },
            ]}
            onChange={(v) => setSquares('layout', v)}
            testId="squares-layout"
          />
          <SelectField
            label={t('Channels map by')}
            value={squares.mapping}
            options={[
              { value: 'radius', label: t('Distance from center') },
              { value: 'row', label: t('Row') },
              { value: 'column', label: t('Column') },
              { value: 'cell', label: t('Cell') },
              { value: 'spectrum', label: t('Spectrum') },
            ]}
            onChange={(v) => setSquares('mapping', v)}
          />
        </Group>
      )}
    </div>
  )
}

function RingsGeometry() {
  const t = useT()
  const [r, set, d] = useSettingsGroup('rings')
  const bands = r.style !== 'lines'
  return (
    <>
      <Group title={t('Layout')}>
        <SliderField label={t('Rings')} value={r.count} onChange={(v) => set('count', v)} min={1} max={128} step={1} testId="ring-count" defaultValue={d.count} />
        <SliderField label={t('Inner radius')} value={r.innerRadius} onChange={(v) => set('innerRadius', Math.min(v, r.outerRadius))} min={0} max={0.95} step={0.005} defaultValue={d.innerRadius} />
        <SliderField label={t('Outer radius')} value={r.outerRadius} onChange={(v) => set('outerRadius', Math.max(v, r.innerRadius))} min={0.1} max={1.5} step={0.005} defaultValue={d.outerRadius} />
        <SliderField
          label={t('Spacing curve')}
          value={r.spacingCurve}
          onChange={(v) => set('spacingCurve', v)}
          min={0.3}
          max={3}
          step={0.01}
          defaultValue={d.spacingCurve}
          hint={t('Below 1 packs rings outward, above 1 packs them toward the center.')}
        />
        <SegmentedField
          label={t('Radius from')}
          value={r.radiusSource}
          options={[
            { value: 'auto', label: t('Even spacing') },
            { value: 'channel', label: t('Channel positions') },
          ]}
          onChange={(v) => set('radiusSource', v)}
        />
        {!bands && (
          <>
            <SliderField label={t('Thickness')} value={r.thickness * 1000} onChange={(v) => set('thickness', v / 1000)} min={0.5} max={80} step={0.1} defaultValue={d.thickness * 1000} />
            <SliderField label={t('Glow width')} value={r.glowWidth * 1000} onChange={(v) => set('glowWidth', v / 1000)} min={0} max={200} step={0.5} defaultValue={d.glowWidth * 1000} />
          </>
        )}
        <SliderField label={t('Center size')} value={r.centerSize * 100} onChange={(v) => set('centerSize', v / 100)} min={0} max={40} step={0.5} unit="%" defaultValue={d.centerSize * 100} />
      </Group>
      {bands && (
        <Group title={t('Filled rings')}>
          <SliderField label={t('Band brightness')} value={r.bandBrightness} onChange={(v) => set('bandBrightness', v)} min={0.1} max={2} step={0.05} unit="×" defaultValue={d.bandBrightness} />
          {r.style === 'touching' && (
            <SliderField label={t('Gap between rings')} value={r.bandGap * 100} onChange={(v) => set('bandGap', v / 100)} min={0} max={60} step={1} unit="%" defaultValue={d.bandGap * 100} testId="band-gap" />
          )}
          <SwitchField label={t('Fill the center')} description={t('Extend the first ring to the middle')} checked={r.fillCenter} onChange={(v) => set('fillCenter', v)} />
          {r.style === 'merged' && <SwitchField label={t('Ring outlines')} description={t('Thin lines at each ring center')} checked={r.outline} onChange={(v) => set('outline', v)} />}
        </Group>
      )}
      <Group title={t('Reaction')}>
        <SliderField label={t('Radial expansion')} value={r.radiusReactivity * 100} onChange={(v) => set('radiusReactivity', v / 100)} min={0} max={30} step={0.1} defaultValue={d.radiusReactivity * 100} />
        {!bands && <SliderField label={t('Thickness swell')} value={r.thicknessReactivity} onChange={(v) => set('thicknessReactivity', v)} min={0} max={6} step={0.05} defaultValue={d.thicknessReactivity} />}
        <SliderField label={t('Opacity follows level')} value={r.opacityReactivity * 100} onChange={(v) => set('opacityReactivity', v / 100)} min={0} max={100} step={1} unit="%" defaultValue={d.opacityReactivity * 100} />
        {!bands && <SwitchField label={t('Peak rings')} description={t('A faint ring holds each recent peak')} checked={r.peakRings} onChange={(v) => set('peakRings', v)} />}
      </Group>
      <Group title={t('Shape and motion')}>
        <SliderField label={t('Distortion')} value={r.distortion * 100} onChange={(v) => set('distortion', v / 100)} min={0} max={25} step={0.1} defaultValue={d.distortion * 100} />
        <SliderField label={t('Lobes')} value={r.distortionLobes} onChange={(v) => set('distortionLobes', v)} min={0} max={24} step={1} defaultValue={d.distortionLobes} />
        <SliderField label={t('Distortion speed')} value={r.distortionSpeed} onChange={(v) => set('distortionSpeed', v)} min={-4} max={4} step={0.05} defaultValue={d.distortionSpeed} />
        <SliderField
          label={t('Spectrum warp')}
          value={r.spectrumWarp * 100}
          onChange={(v) => set('spectrumWarp', v / 100)}
          min={0}
          max={25}
          step={0.1}
          defaultValue={d.spectrumWarp * 100}
          hint={t('Bends each ring by the live spectrum around it.')}
        />
        <SliderField label={t('Rotation speed')} value={r.rotationSpeed} onChange={(v) => set('rotationSpeed', v)} min={-2} max={2} step={0.01} defaultValue={d.rotationSpeed} />
        <SwitchField label={t('Alternate rotation')} checked={r.alternateRotation} onChange={(v) => set('alternateRotation', v)} />
        <SwitchField label={t('Mirrored symmetry')} checked={r.mirror} onChange={(v) => set('mirror', v)} />
        <SliderField
          label={t('Depth')}
          value={r.depth}
          onChange={(v) => set('depth', v)}
          min={0}
          max={2}
          step={0.01}
          defaultValue={d.depth}
          hint={t('Pushes inner rings back in space. Combine with camera motion for a tunnel.')}
        />
      </Group>
    </>
  )
}

function LedsGeometry() {
  const t = useT()
  const [l, set, d] = useSettingsGroup('leds')
  return (
    <>
      <Group title={t('Layout')}>
        <SliderField label={t('Rows')} value={l.rows} onChange={(v) => set('rows', v)} min={1} max={48} step={1} testId="led-rows" defaultValue={d.rows} />
        <SliderField label={t('LEDs per row')} value={l.ledsPerRow} onChange={(v) => set('ledsPerRow', v)} min={4} max={512} step={1} defaultValue={d.ledsPerRow} />
        <SwitchField label={t('Even spacing')} description={t('Inner rows get fewer LEDs')} checked={l.constantSpacing} onChange={(v) => set('constantSpacing', v)} />
        <SliderField label={t('Inner radius')} value={l.innerRadius} onChange={(v) => set('innerRadius', Math.min(v, l.outerRadius))} min={0} max={0.95} step={0.005} defaultValue={d.innerRadius} />
        <SliderField label={t('Outer radius')} value={l.outerRadius} onChange={(v) => set('outerRadius', Math.max(v, l.innerRadius))} min={0.1} max={1.5} step={0.005} defaultValue={d.outerRadius} />
        <SliderField label={t('LED size')} value={l.ledSize * 100} onChange={(v) => set('ledSize', v / 100)} min={10} max={150} step={1} unit="%" defaultValue={d.ledSize * 100} />
        <SegmentedField
          label={t('LED shape')}
          value={l.shape}
          options={[
            { value: 'round', label: t('Round') },
            { value: 'square', label: t('Square') },
            { value: 'diamond', label: t('Diamond') },
          ]}
          onChange={(v) => set('shape', v)}
        />
      </Group>
      <Group title={t('Light')}>
        <SliderField label={t('Diffusion')} value={l.diffusion * 100} onChange={(v) => set('diffusion', v / 100)} min={0} max={100} step={1} unit="%" defaultValue={d.diffusion * 100} />
        <SliderField label={t('Unlit glow')} value={l.unlitLevel * 100} onChange={(v) => set('unlitLevel', v / 100)} min={0} max={30} step={0.5} unit="%" defaultValue={d.unlitLevel * 100} />
        <SliderField label={t('Rainbow')} value={l.rainbow * 100} onChange={(v) => set('rainbow', v / 100)} min={0} max={100} step={1} unit="%" defaultValue={d.rainbow * 100} hint={t('Rotates hue around each row.')} />
        {l.mapping === 'ledMix' && <SliderField label={t('Band blending')} value={l.mixSpread} onChange={(v) => set('mixSpread', v)} min={0.05} max={3} step={0.01} defaultValue={d.mixSpread} />}
      </Group>
      <Group title={t('Motion')}>
        <SwitchField label={t('Pulse waves')} description={t('Beats travel outward row by row')} checked={l.pulseWaves} onChange={(v) => set('pulseWaves', v)} />
        <SliderField label={t('Wave step')} value={l.pulseSpeedMs} onChange={(v) => set('pulseSpeedMs', v)} min={10} max={200} step={1} unit="ms" defaultValue={d.pulseSpeedMs} disabled={!l.pulseWaves} />
        <SliderField label={t('Rotation speed')} value={l.rotationSpeed} onChange={(v) => set('rotationSpeed', v)} min={-2} max={2} step={0.01} defaultValue={d.rotationSpeed} />
        <SwitchField label={t('Alternate rotation')} checked={l.alternateRotation} onChange={(v) => set('alternateRotation', v)} />
      </Group>
    </>
  )
}

function BarsGeometry() {
  const t = useT()
  const [b, set, d] = useSettingsGroup('bars')
  const leds = b.style === 'leds'
  return (
    <>
      <Group title={t('Layout')}>
        <SliderField label={t('Columns')} value={b.columns} onChange={(v) => set('columns', v)} min={1} max={256} step={1} testId="bar-columns" defaultValue={d.columns} />
        {leds ? (
          <Hint>{t('Rows follow from the column count so every LED stays round.')}</Hint>
        ) : (
          <>
            <SliderField label={b.style === 'equalizer' ? t('Segments') : t('Rows')} value={b.rows} onChange={(v) => set('rows', v)} min={1} max={64} step={1} defaultValue={d.rows} />
            <SliderField label={t('Width')} value={b.widthScale * 100} onChange={(v) => set('widthScale', v / 100)} min={20} max={100} step={1} unit="%" defaultValue={d.widthScale * 100} />
            <SliderField label={t('Height')} value={b.heightScale * 100} onChange={(v) => set('heightScale', v / 100)} min={10} max={100} step={1} unit="%" defaultValue={d.heightScale * 100} />
          </>
        )}
        <SliderField label={t('Gap')} value={b.gap * 100} onChange={(v) => set('gap', v / 100)} min={0} max={90} step={1} unit="%" defaultValue={d.gap * 100} />
        {b.style === 'equalizer' && <SwitchField label={t('Segmented')} description={t('LED-style stacked cells')} checked={b.segmented} onChange={(v) => set('segmented', v)} />}
        {b.style === 'equalizer' && b.segmented && (
          <SliderField label={t('Segment gap')} value={b.segmentGap * 100} onChange={(v) => set('segmentGap', v / 100)} min={0} max={90} step={1} unit="%" defaultValue={d.segmentGap * 100} />
        )}
        {!leds && <SliderField label={t('Corner radius')} value={b.cornerRadius * 100} onChange={(v) => set('cornerRadius', v / 100)} min={0} max={50} step={1} unit="%" defaultValue={d.cornerRadius * 100} />}
        <SelectField
          label={t('Mirror')}
          value={b.mirror}
          options={[
            { value: 'none', label: t('None') },
            { value: 'horizontal', label: t('From the center out') },
            { value: 'vertical', label: t('Up and down') },
            { value: 'both', label: t('Both') },
          ]}
          onChange={(v) => set('mirror', v)}
        />
        {b.style !== 'lightwall' && (
          <SegmentedField
            label={t('Columns per channel')}
            value={b.distribution}
            options={[
              { value: 'log', label: t('By bandwidth') },
              { value: 'linear', label: t('Equal') },
            ]}
            onChange={(v) => set('distribution', v)}
          />
        )}
      </Group>
      <Group title={t('Light and motion')}>
        <SelectField
          label={t('Coloring')}
          value={b.colorMode}
          options={[
            { value: 'channel', label: t('Channel colors') },
            { value: 'vertical', label: t('Channel gradient') },
            { value: 'frequency', label: t('Frequency map') },
          ]}
          onChange={(v) => set('colorMode', v)}
        />
        <SliderField label={t('Glow')} value={b.glow} onChange={(v) => set('glow', v)} min={0} max={2} step={0.05} defaultValue={d.glow} />
        {b.style !== 'lightwall' && <SwitchField label={leds ? t('Peak LED') : t('Peak markers')} checked={b.peakMarkers} onChange={(v) => set('peakMarkers', v)} />}
        <SliderField
          label={t('Wave propagation')}
          value={b.waveProp * 100}
          onChange={(v) => set('waveProp', v / 100)}
          min={0}
          max={100}
          step={1}
          unit="%"
          defaultValue={d.waveProp * 100}
          hint={t('Lets energy ripple into neighbouring cells.')}
        />
      </Group>
    </>
  )
}

function SquaresGeometry() {
  const t = useT()
  const [q, set, d] = useSettingsGroup('squares')
  const outline = q.layout === 'concentric' || q.layout === 'nested'
  return (
    <>
      <Group title={t('Layout')}>
        {outline ? (
          <SliderField label={t('Layers')} value={q.layers} onChange={(v) => set('layers', v)} min={1} max={64} step={1} defaultValue={d.layers} />
        ) : (
          <>
            <SliderField label={t('Rows')} value={q.rows} onChange={(v) => set('rows', v)} min={1} max={64} step={1} testId="square-rows" defaultValue={d.rows} />
            <SliderField label={t('Columns')} value={q.columns} onChange={(v) => set('columns', v)} min={1} max={64} step={1} defaultValue={d.columns} />
            <SliderField label={t('Gap')} value={q.gap * 100} onChange={(v) => set('gap', v / 100)} min={0} max={90} step={1} unit="%" defaultValue={d.gap * 100} />
            {q.layout !== 'matrix' && (
              <SliderField label={t('Corner radius')} value={q.cornerRadius * 100} onChange={(v) => set('cornerRadius', v / 100)} min={0} max={50} step={1} unit="%" defaultValue={d.cornerRadius * 100} />
            )}
          </>
        )}
        <SliderField label={t('Size')} value={q.size * 100} onChange={(v) => set('size', v / 100)} min={20} max={150} step={1} unit="%" defaultValue={d.size * 100} />
        {outline && (
          <>
            <SliderField label={t('Line thickness')} value={q.thickness * 1000} onChange={(v) => set('thickness', v / 1000)} min={0.5} max={80} step={0.1} defaultValue={d.thickness * 1000} />
            <SliderField label={t('Glow width')} value={q.glowWidth * 1000} onChange={(v) => set('glowWidth', v / 1000)} min={0} max={200} step={0.5} defaultValue={d.glowWidth * 1000} />
          </>
        )}
        <SelectField
          label={t('Symmetry')}
          value={q.symmetry}
          options={[
            { value: 'none', label: t('None') },
            { value: 'mirror', label: t('Mirror') },
            { value: 'quad', label: t('Four-way') },
            { value: 'kaleido', label: t('Kaleidoscope') },
          ]}
          onChange={(v) => set('symmetry', v)}
        />
      </Group>
      <Group title={t('Motion')}>
        <SliderField label={t('Rotation')} value={q.rotation} onChange={(v) => set('rotation', v)} min={-180} max={180} step={0.5} unit="°" defaultValue={d.rotation} />
        <SliderField label={t('Rotation speed')} value={q.rotationSpeed} onChange={(v) => set('rotationSpeed', v)} min={-2} max={2} step={0.01} defaultValue={d.rotationSpeed} />
        {q.layout === 'nested' && <SliderField label={t('Twist per layer')} value={q.twist} onChange={(v) => set('twist', v)} min={-45} max={45} step={0.1} unit="°" defaultValue={d.twist} />}
        <SliderField label={t('Scale pulse')} value={q.scalePulse * 100} onChange={(v) => set('scalePulse', v / 100)} min={0} max={50} step={0.5} unit="%" defaultValue={d.scalePulse * 100} />
        <SliderField label={t('Displacement')} value={q.displacement * 100} onChange={(v) => set('displacement', v / 100)} min={0} max={30} step={0.5} unit="%" defaultValue={d.displacement * 100} />
        {q.layout === 'waves' && (
          <SliderField
            label={t('Wave step')}
            value={q.waveSpeedMs}
            onChange={(v) => set('waveSpeedMs', v)}
            min={10}
            max={400}
            step={1}
            unit="ms"
            defaultValue={d.waveSpeedMs}
            hint={t('Delay added per ring of cells away from the center.')}
          />
        )}
      </Group>
    </>
  )
}

export function GeometrySection() {
  const t = useT()
  const mode = useAppStore((s) => s.settings.mode)
  return (
    <div className="flex flex-col gap-5">
      <Hint>{t('Showing controls for {mode}. Switch modes to edit the others.', { mode: t(MODE_LABELS[mode]) })}</Hint>
      {mode === 'rings' && <RingsGeometry />}
      {mode === 'leds' && <LedsGeometry />}
      {mode === 'bars' && <BarsGeometry />}
      {mode === 'squares' && <SquaresGeometry />}
    </div>
  )
}
