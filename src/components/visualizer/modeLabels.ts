import type { VisualizationMode } from '../../state/settingsSchema'

/** English source text; translate with t(). */
export const MODE_LABELS: Record<VisualizationMode, string> = {
  rings: 'Rings',
  leds: 'LED rings',
  bars: 'Bars',
  squares: 'Squares',
}

export const MODE_COPY: Record<VisualizationMode, string> = {
  rings: 'Concentric rings of light that swell and bend with their bands.',
  leds: 'Circular rows of individual LEDs, like a programmable light installation.',
  bars: 'An equalizer, a full-screen wall of light, or round LED bars.',
  squares: 'Nested squares, LED matrices, tiles and expanding square waves.',
}
