import type { AnalysisFrame } from '../audio/AudioPipeline'

/**
 * Mutable, non-reactive bus for per-frame values. The render loop writes here; small UI widgets
 * (meters, FPS) read it from their own rAF via refs, so audio never triggers React renders.
 */
export const liveData: {
  frame: AnalysisFrame | null
  fps: number
  frameMs: number
  resolutionScale: number
  pixelRatio: number
  drawCalls: number
  widthPx: number
  heightPx: number
} = {
  frame: null,
  fps: 0,
  frameMs: 0,
  resolutionScale: 1,
  pixelRatio: 1,
  drawCalls: 0,
  widthPx: 0,
  heightPx: 0,
}
