import type { EffectsSettings } from '../../state/settingsSchema'

export type EffectKey = keyof EffectsSettings

export interface EffectParam {
  key: string
  label: string
  min: number
  max: number
  step: number
  unit?: string
  type?: 'color'
}

/** Effect controls; labels and descriptions are English source text, translated with t(). */
export const EFFECTS: { key: EffectKey; label: string; description: string; params: EffectParam[] }[] = [
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
