import { Mic, Play, Square } from 'lucide-react'
import { binWidth } from '../../../audio/frequencyMath'
import { audioEngine, startDemo, startMicrophone, stopAudio } from '../../../app/engine'
import { FFT_SIZES } from '../../../state/settingsSchema'
import { useAppStore } from '../../../state/useAppStore'
import { DominantTone, InputLevelMeter, SpectrumStrip } from '../../audio/SpectrumStrip'
import { Button, Group, Hint, SegmentedField, SelectField, SwitchField } from '../../ui/primitives'
import { RangeField, SliderField } from '../../ui/SliderField'
import { useSettingsGroup } from '../sectionMeta'

const DEFAULT_DEVICE = '__default__'

export function AudioInputSection() {
  const [audio, set] = useSettingsGroup('audio')
  const status = useAppStore((s) => s.audio.status)
  const devices = useAppStore((s) => s.audio.devices)
  const deviceLabel = useAppStore((s) => s.audio.activeDeviceLabel)
  const live = status === 'live'
  const demo = status === 'demo'

  const statusText = live
    ? `Listening to ${deviceLabel || 'the microphone'}`
    : demo
      ? 'Playing the demo track'
      : status === 'requesting'
        ? 'Waiting for microphone permission…'
        : 'Not listening'

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
            <span>Strongest tone</span>
            <DominantTone className="text-xs text-ink-muted" />
          </p>
          <div className="mt-3.5 flex flex-wrap gap-2">
            {live ? (
              <Button size="sm" onClick={() => void stopAudio()}>
                <Square size={12} className="fill-current" /> Stop microphone
              </Button>
            ) : (
              <Button size="sm" variant="primary" onClick={() => void startMicrophone()} disabled={status === 'requesting'}>
                <Mic size={13} /> Start microphone
              </Button>
            )}
            {demo ? (
              <Button size="sm" onClick={() => void stopAudio()}>
                <Square size={12} className="fill-current" /> Stop demo
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => void startDemo()}>
                <Play size={13} /> Play demo track
              </Button>
            )}
          </div>
        </div>
        {devices.length > 0 ? (
          <SelectField
            label="Input device"
            value={audio.deviceId && devices.some((d) => d.deviceId === audio.deviceId) ? audio.deviceId : DEFAULT_DEVICE}
            options={[{ value: DEFAULT_DEVICE, label: 'System default' }, ...devices.filter((d) => d.deviceId && d.deviceId !== 'default').map((d) => ({ value: d.deviceId, label: d.label }))]}
            onChange={(v) => void chooseDevice(v)}
          />
        ) : (
          <Button size="sm" variant="ghost" className="self-start" onClick={() => void audioEngine.listDevices()}>
            Look for input devices
          </Button>
        )}
      </Group>

      <Group title="Level">
        <SliderField label="Input gain" value={audio.gainDb} onChange={(v) => set('gainDb', v)} min={-36} max={36} step={0.5} unit="dB" defaultValue={0} />
        <SliderField label="Sensitivity" value={audio.sensitivity} onChange={(v) => set('sensitivity', v)} min={0} max={8} step={0.05} unit="×" defaultValue={1} />
        <Hint>Gain shifts the measured level in decibels before anything else. Sensitivity scales the result for every channel.</Hint>
      </Group>

      <Group title="Demo track">
        <SwitchField label="Play through speakers" description="Visuals react either way" checked={audio.demoMonitor} onChange={(v) => set('demoMonitor', v)} />
        <SliderField label="Volume" value={audio.demoVolume * 100} onChange={(v) => set('demoVolume', v / 100)} min={0} max={100} step={1} unit="%" disabled={!audio.demoMonitor} />
      </Group>

      <Hint>
        Aurora asks for the microphone only when you press start, and stops it completely when you stop. Sound is analyzed in this browser and is never recorded or sent anywhere.
      </Hint>
    </div>
  )
}

export function FftSection() {
  const [audio, set] = useSettingsGroup('audio')
  const sampleRate = useAppStore((s) => s.audio.sampleRate)
  const resolution = binWidth(sampleRate, audio.fftSize)
  const windowMs = (audio.fftSize / sampleRate) * 1000

  return (
    <div className="flex flex-col gap-5">
      <Group>
        <SpectrumStrip />
      </Group>
      <Group title="Analysis window">
        <SegmentedField
          label="FFT size"
          value={String(audio.fftSize)}
          options={FFT_SIZES.map((n) => ({ value: String(n), label: n >= 1024 ? `${n / 1024}k` : String(n) }))}
          onChange={(v) => set('fftSize', Number(v) as (typeof FFT_SIZES)[number])}
          testIdPrefix="fft"
        />
        <Hint>
          <span className="num text-ink">{resolution.toFixed(1)} Hz</span> per bin at {(sampleRate / 1000).toFixed(1)} kHz, window{' '}
          <span className="num text-ink">{windowMs.toFixed(0)} ms</span>. Larger sizes separate low notes better but react a little later.
        </Hint>
        <SliderField label="Analyser smoothing" value={audio.smoothingTimeConstant} onChange={(v) => set('smoothingTimeConstant', v)} min={0} max={0.99} step={0.01} defaultValue={0.45} />
      </Group>
      <Group title="Range">
        <SliderField label="Floor" value={audio.minDecibels} onChange={(v) => set('minDecibels', Math.min(v, audio.maxDecibels - 10))} min={-140} max={-30} step={1} unit="dB" defaultValue={-92} />
        <SliderField label="Ceiling" value={audio.maxDecibels} onChange={(v) => set('maxDecibels', Math.max(v, audio.minDecibels + 10))} min={-80} max={0} step={1} unit="dB" defaultValue={-22} />
        <RangeField
          label="Displayed frequencies"
          low={audio.minFrequency}
          high={audio.maxFrequency}
          min={10}
          max={Math.min(24000, sampleRate / 2)}
          onChange={(lo, hi) => {
            set('minFrequency', Math.max(10, Math.min(2000, lo)))
            set('maxFrequency', Math.max(500, Math.min(24000, hi)))
          }}
        />
        <SegmentedField
          label="Frequency axis"
          value={audio.frequencyScale}
          options={[
            { value: 'log', label: 'Logarithmic' },
            { value: 'linear', label: 'Linear' },
          ]}
          onChange={(v) => set('frequencyScale', v)}
        />
      </Group>
      <Group title="Balance">
        <SliderField label="Treble tilt" value={audio.tiltDbPerOctave} onChange={(v) => set('tiltDbPerOctave', v)} min={-6} max={12} step={0.5} unit="dB/oct" defaultValue={3} hint="Music loses energy toward the treble. Tilting the spectrum up by a few dB per octave (around 1 kHz) keeps high bands as lively as low ones." />
      </Group>
      <Group title="Noise and stability">
        <SliderField label="Noise reduction" value={audio.noiseReduction} onChange={(v) => set('noiseReduction', v)} min={0} max={1} step={0.01} defaultValue={0.35} hint="Subtracts a slowly adapting estimate of the background noise floor." />
        <SelectField
          label="Spectral filter"
          value={audio.spectralFilter}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'median3', label: 'Median, 3 bins' },
            { value: 'median5', label: 'Median, 5 bins' },
          ]}
          onChange={(v) => set('spectralFilter', v)}
        />
        <SliderField label="Adaptive threshold" value={audio.adaptiveThreshold} onChange={(v) => set('adaptiveThreshold', v)} min={0} max={1} step={0.01} defaultValue={0} hint="Raises each channel's threshold toward its recent average, so steady sound fades and changes stand out." />
      </Group>
      <Group title="Automatic gain">
        <SegmentedField
          label="Normalize levels"
          value={audio.autoGain}
          options={[
            { value: 'off', label: 'Off' },
            { value: 'global', label: 'Together' },
            { value: 'perChannel', label: 'Per channel' },
          ]}
          onChange={(v) => set('autoGain', v)}
        />
        <SliderField label="Target level" value={audio.autoGainTarget} onChange={(v) => set('autoGainTarget', v)} min={0.3} max={1} step={0.01} disabled={audio.autoGain === 'off'} />
      </Group>
      <Group title="Beats">
        <SliderField label="Beat threshold" value={audio.beatSensitivity} onChange={(v) => set('beatSensitivity', v)} min={0.5} max={3} step={0.05} defaultValue={1.35} hint="Lower values detect more beats. Beats drive flashes, shockwaves and LED pulse waves." />
      </Group>
    </div>
  )
}
