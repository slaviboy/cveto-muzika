import { Mic, Play, Square } from 'lucide-react'
import { binWidth } from '../../../audio/frequencyMath'
import { audioEngine, startDemo, startMicrophone, stopAudio } from '../../../app/engine'
import { useT } from '../../../i18n/useT'
import { FFT_SIZES } from '../../../state/settingsSchema'
import { useAppStore } from '../../../state/useAppStore'
import { DominantTone, InputLevelMeter, SpectrumStrip } from '../../audio/SpectrumStrip'
import { Button, Group, Hint, SegmentedField, SelectField, SwitchField } from '../../ui/primitives'
import { RangeField, SliderField } from '../../ui/SliderField'
import { useSettingsGroup } from '../sectionMeta'

const DEFAULT_DEVICE = '__default__'

export function AudioInputSection() {
  const t = useT()
  const [audio, set, d] = useSettingsGroup('audio')
  const status = useAppStore((s) => s.audio.status)
  const devices = useAppStore((s) => s.audio.devices)
  const deviceLabel = useAppStore((s) => s.audio.activeDeviceLabel)
  const live = status === 'live'
  const demo = status === 'demo'

  const statusText = live
    ? t('Listening to {device}', { device: deviceLabel || t('the microphone') })
    : demo
      ? t('Playing the demo track')
      : status === 'requesting'
        ? t('Waiting for microphone permission…')
        : t('Not listening')

  const chooseDevice = async (id: string) => {
    set('deviceId', id === DEFAULT_DEVICE ? '' : id)
    if (live) await startMicrophone()
  }

  return (
    <div className="flex flex-col gap-5">
      <Group>
        <div className="rounded-[12px] border border-line bg-graphite-900/60 p-3.5">
          <p className="text-xs text-ink" data-testid="audio-status-text" role="status">
            {statusText}
          </p>
          <div className="mt-3">
            <InputLevelMeter />
          </div>
          <p className="mt-2 flex items-center justify-between text-2xs text-ink-faint">
            <span>{t('Strongest tone')}</span>
            <DominantTone className="text-xs text-ink-muted" />
          </p>
          <div className="mt-3.5 flex flex-wrap gap-2">
            {live ? (
              <Button size="sm" onClick={() => void stopAudio()}>
                <Square size={12} className="fill-current" /> {t('Stop microphone')}
              </Button>
            ) : (
              <Button size="sm" variant="primary" onClick={() => void startMicrophone()} disabled={status === 'requesting'}>
                <Mic size={13} /> {t('Start microphone')}
              </Button>
            )}
            {demo ? (
              <Button size="sm" onClick={() => void stopAudio()}>
                <Square size={12} className="fill-current" /> {t('Stop demo')}
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => void startDemo()}>
                <Play size={13} /> {t('Play demo track')}
              </Button>
            )}
          </div>
        </div>
        {devices.length > 0 ? (
          <SelectField
            label={t('Input device')}
            value={audio.deviceId && devices.some((dv) => dv.deviceId === audio.deviceId) ? audio.deviceId : DEFAULT_DEVICE}
            options={[
              { value: DEFAULT_DEVICE, label: t('System default') },
              ...devices.filter((dv) => dv.deviceId && dv.deviceId !== 'default').map((dv) => ({ value: dv.deviceId, label: dv.label })),
            ]}
            onChange={(v) => void chooseDevice(v)}
          />
        ) : (
          <Button size="sm" variant="ghost" className="self-start" onClick={() => void audioEngine.listDevices()}>
            {t('Look for input devices')}
          </Button>
        )}
      </Group>

      <Group title={t('Level')}>
        <SliderField label={t('Input gain')} value={audio.gainDb} onChange={(v) => set('gainDb', v)} min={-36} max={36} step={0.5} unit="dB" defaultValue={d.gainDb} />
        <SliderField label={t('Sensitivity')} value={audio.sensitivity} onChange={(v) => set('sensitivity', v)} min={0} max={8} step={0.05} unit="×" defaultValue={d.sensitivity} />
        <Hint>{t('Gain shifts the measured level in decibels before anything else. Sensitivity scales the result for every channel.')}</Hint>
      </Group>

      <Group title={t('Demo track')}>
        <SwitchField label={t('Play through speakers')} description={t('Visuals react either way')} checked={audio.demoMonitor} onChange={(v) => set('demoMonitor', v)} />
        <SliderField
          label={t('Volume')}
          value={audio.demoVolume * 100}
          onChange={(v) => set('demoVolume', v / 100)}
          min={0}
          max={100}
          step={1}
          unit="%"
          defaultValue={d.demoVolume * 100}
          disabled={!audio.demoMonitor}
        />
      </Group>

      <Hint>
        {t('Aurora asks for the microphone only when you press start, and stops it completely when you stop. Sound is analyzed in this browser and is never recorded or sent anywhere.')}
      </Hint>
    </div>
  )
}

export function FftSection() {
  const t = useT()
  const [audio, set, d] = useSettingsGroup('audio')
  const sampleRate = useAppStore((s) => s.audio.sampleRate)
  const resolution = binWidth(sampleRate, audio.fftSize)
  const windowMs = (audio.fftSize / sampleRate) * 1000

  return (
    <div className="flex flex-col gap-5">
      <Group>
        <SpectrumStrip />
      </Group>
      <Group title={t('Analysis window')}>
        <SegmentedField
          label={t('FFT size')}
          value={String(audio.fftSize)}
          options={FFT_SIZES.map((n) => ({ value: String(n), label: n >= 1024 ? `${n / 1024}k` : String(n) }))}
          onChange={(v) => set('fftSize', Number(v) as (typeof FFT_SIZES)[number])}
          testIdPrefix="fft"
        />
        <Hint>
          {t('{resolution} per bin at {rate}, window {window}. Larger sizes separate low notes better but react a little later.', {
            resolution: `${resolution.toFixed(1)} Hz`,
            rate: `${(sampleRate / 1000).toFixed(1)} kHz`,
            window: `${windowMs.toFixed(0)} ms`,
          })}
        </Hint>
        <SliderField label={t('Analyser smoothing')} value={audio.smoothingTimeConstant} onChange={(v) => set('smoothingTimeConstant', v)} min={0} max={0.99} step={0.01} defaultValue={d.smoothingTimeConstant} />
      </Group>
      <Group title={t('Range')}>
        <SliderField label={t('Floor')} value={audio.minDecibels} onChange={(v) => set('minDecibels', Math.min(v, audio.maxDecibels - 10))} min={-140} max={-30} step={1} unit="dB" defaultValue={d.minDecibels} />
        <SliderField label={t('Ceiling')} value={audio.maxDecibels} onChange={(v) => set('maxDecibels', Math.max(v, audio.minDecibels + 10))} min={-80} max={0} step={1} unit="dB" defaultValue={d.maxDecibels} />
        <RangeField
          label={t('Displayed frequencies')}
          low={audio.minFrequency}
          high={audio.maxFrequency}
          min={10}
          max={Math.min(24000, sampleRate / 2)}
          defaultLow={d.minFrequency}
          defaultHigh={d.maxFrequency}
          onChange={(lo, hi) => {
            set('minFrequency', Math.max(10, Math.min(2000, lo)))
            set('maxFrequency', Math.max(500, Math.min(24000, hi)))
          }}
        />
        <SegmentedField
          label={t('Frequency axis')}
          value={audio.frequencyScale}
          options={[
            { value: 'log', label: t('Logarithmic') },
            { value: 'linear', label: t('Linear') },
          ]}
          onChange={(v) => set('frequencyScale', v)}
        />
      </Group>
      <Group title={t('Balance')}>
        <SliderField
          label={t('Treble tilt')}
          value={audio.tiltDbPerOctave}
          onChange={(v) => set('tiltDbPerOctave', v)}
          min={-6}
          max={12}
          step={0.5}
          unit="dB/oct"
          defaultValue={d.tiltDbPerOctave}
          hint={t('Music loses energy toward the treble. Tilting the spectrum up by a few dB per octave (around 1 kHz) keeps high bands as lively as low ones.')}
        />
      </Group>
      <Group title={t('Noise and stability')}>
        <SliderField
          label={t('Noise reduction')}
          value={audio.noiseReduction}
          onChange={(v) => set('noiseReduction', v)}
          min={0}
          max={1}
          step={0.01}
          defaultValue={d.noiseReduction}
          hint={t('Subtracts a slowly adapting estimate of the background noise floor.')}
        />
        <SelectField
          label={t('Spectral filter')}
          value={audio.spectralFilter}
          options={[
            { value: 'off', label: t('Off') },
            { value: 'median3', label: t('Median, 3 bins') },
            { value: 'median5', label: t('Median, 5 bins') },
          ]}
          onChange={(v) => set('spectralFilter', v)}
        />
        <SliderField
          label={t('Adaptive threshold')}
          value={audio.adaptiveThreshold}
          onChange={(v) => set('adaptiveThreshold', v)}
          min={0}
          max={1}
          step={0.01}
          defaultValue={d.adaptiveThreshold}
          hint={t("Raises each channel's threshold toward its recent average, so steady sound fades and changes stand out.")}
        />
      </Group>
      <Group title={t('Automatic gain')}>
        <SegmentedField
          label={t('Normalize levels')}
          value={audio.autoGain}
          options={[
            { value: 'off', label: t('Off') },
            { value: 'global', label: t('Together') },
            { value: 'perChannel', label: t('Per channel') },
          ]}
          onChange={(v) => set('autoGain', v)}
        />
        <SliderField label={t('Target level')} value={audio.autoGainTarget} onChange={(v) => set('autoGainTarget', v)} min={0.3} max={1} step={0.01} defaultValue={d.autoGainTarget} disabled={audio.autoGain === 'off'} />
      </Group>
      <Group title={t('Beats')}>
        <SliderField
          label={t('Beat threshold')}
          value={audio.beatSensitivity}
          onChange={(v) => set('beatSensitivity', v)}
          min={0.5}
          max={3}
          step={0.05}
          defaultValue={d.beatSensitivity}
          hint={t('Lower values detect more beats. Beats drive flashes, shockwaves and LED pulse waves.')}
        />
      </Group>
    </div>
  )
}
