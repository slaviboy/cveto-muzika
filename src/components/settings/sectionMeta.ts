import { AudioWaveform, Bookmark, Gauge, Mic, Palette, Ruler, Shapes, SlidersHorizontal, Sparkles, SunMedium, Timer, type LucideIcon } from 'lucide-react'
import { useCallback } from 'react'
import type { Settings } from '../../state/settingsSchema'
import { useAppStore, type SectionId } from '../../state/useAppStore'

export interface SectionMeta {
  id: SectionId
  title: string
  short: string
  description: string
  icon: LucideIcon
  resettable: boolean
}

export const SECTIONS: SectionMeta[] = [
  { id: 'audio', title: 'Audio input', short: 'Input', description: 'What Aurora listens to, and how loud it hears it.', icon: Mic, resettable: true },
  { id: 'fft', title: 'FFT and spectrum', short: 'Spectrum', description: 'How sound is measured before it becomes light.', icon: AudioWaveform, resettable: true },
  { id: 'channels', title: 'Frequency channels', short: 'Channels', description: 'Bands of the spectrum, each with its own color, response and delay.', icon: SlidersHorizontal, resettable: true },
  { id: 'mode', title: 'Visualization mode', short: 'Mode', description: 'The shape the light takes.', icon: Shapes, resettable: true },
  { id: 'geometry', title: 'Geometry', short: 'Geometry', description: 'Counts, sizes and motion for the current mode.', icon: Ruler, resettable: true },
  { id: 'colors', title: 'Colors and gradients', short: 'Colors', description: 'Where colors come from and how they blend.', icon: Palette, resettable: true },
  { id: 'timing', title: 'Timing and delay', short: 'Timing', description: 'Response speed and true time delay for every channel.', icon: Timer, resettable: true },
  { id: 'brightness', title: 'Brightness and contrast', short: 'Light', description: 'Exposure, tone and per-channel intensity.', icon: SunMedium, resettable: true },
  { id: 'effects', title: 'Effects', short: 'Effects', description: 'Optional screen effects. Each one costs a little performance.', icon: Sparkles, resettable: true },
  { id: 'performance', title: 'Performance', short: 'Performance', description: 'Resolution and quality for this device.', icon: Gauge, resettable: true },
  { id: 'presets', title: 'Presets and export', short: 'Presets', description: 'Save looks, share them as files, or start from a built-in one.', icon: Bookmark, resettable: false },
]

type GroupKey = 'audio' | 'rings' | 'leds' | 'bars' | 'squares' | 'color' | 'background' | 'tone' | 'timing' | 'performance'

/** Subscribes to one settings group and returns a typed field setter. */
export function useSettingsGroup<K extends GroupKey>(key: K) {
  const value = useAppStore((s) => s.settings[key])
  const update = useAppStore((s) => s.update)
  const set = useCallback(
    <F extends keyof Settings[K]>(field: F, v: Settings[K][F]) =>
      update((s) => {
        ;(s[key] as Settings[K])[field] = v
      }),
    [key, update],
  )
  return [value, set] as const
}
