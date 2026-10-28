import * as THREE from 'three'
import type { AnalysisFrame, AudioPipeline } from '../audio/AudioPipeline'
import { bandCenter, positionToFrequency } from '../audio/frequencyMath'
import { channelRange } from '../state/channelOps'
import type { Settings, VisualizationMode } from '../state/settingsSchema'
import type { ColorEngine } from './ColorEngine'

export interface ViewLayout {
  /** World-space size of the z = 0 plane (height is always 2). */
  width: number
  height: number
  aspect: number
  /** Half of the smaller viewport side, in world units — radius 1 in "unit space". */
  unit: number
  /** World units per device pixel. */
  pixel: number
  widthPx: number
  heightPx: number
  pixelRatio: number
}

export interface FrameContext {
  frame: AnalysisFrame
  settings: Settings
  /** Animation clock in seconds (scaled by timing.animationSpeed, frozen by reduced motion). */
  time: number
  /** Animation delta in seconds (same scaling). */
  dt: number
  /** 0 with reduced motion, 1 otherwise. */
  motion: number
  colors: ColorEngine
  pipeline: AudioPipeline
  spectrumTexture: THREE.Texture
  layout: ViewLayout
  /** Geometry detail multiplier from the performance profile. */
  detail: number
  /** Global scale pulse from the pulse effect (0 = none). */
  pulse: number
  /** Displacement effect amount (0 = off) and scale. */
  displace: number
  displaceScale: number
}

/** Interpolated visual intensity of channel `c` at sub-band position `pos` (0..1). */
export function sampleSub(frame: AnalysisFrame, c: number, pos: number): number {
  const K = frame.subbandCount
  if (K <= 1) return frame.intensity[c] ?? 0
  const x = Math.min(K - 1, Math.max(0, pos * K - 0.5))
  const i = Math.min(K - 2, Math.floor(x))
  const f = x - i
  const base = c * K
  const a = frame.sub[base + i] ?? 0
  return a + ((frame.sub[base + i + 1] ?? 0) - a) * f
}

/** Indices of enabled channels (falls back to channel 0 so layouts never collapse). */
export function enabledChannels(settings: Settings): number[] {
  const out: number[] = []
  settings.channels.forEach((ch, i) => {
    if (ch.enabled) out.push(i)
  })
  return out.length ? out : [0]
}

/** Frequency at sub-band position `sub` inside a channel (following the channel's scale). */
export function channelFrequency(settings: Settings, c: number, sub: number | null): number {
  const ch = settings.channels[c]
  const [lo, hi] = channelRange(ch)
  if (sub === null) return bandCenter(lo, hi, ch.scale)
  return positionToFrequency(Math.min(1, Math.max(0, sub)), lo, hi, ch.scale)
}

/**
 * Maps a 0..1 coordinate across the enabled channels: which channel, and where inside it.
 * `weights` (optional) makes wider channels take proportionally more space (log-bandwidth).
 */
export function spreadAcross(t: number, enabled: number[], weights?: number[]): { channel: number; sub: number } {
  const n = enabled.length
  const x = Math.min(0.999999, Math.max(0, t))
  if (!weights) {
    const e = Math.min(n - 1, Math.floor(x * n))
    return { channel: enabled[e], sub: x * n - e }
  }
  const total = weights.reduce((a, b) => a + b, 0) || 1
  let acc = 0
  for (let e = 0; e < n; e++) {
    const w = weights[e] / total
    if (x < acc + w || e === n - 1) return { channel: enabled[e], sub: w > 0 ? (x - acc) / w : 0.5 }
    acc += w
  }
  return { channel: enabled[n - 1], sub: 1 }
}

/** Channel whose range contains `hz` (or the nearest one on a log axis). */
export function channelForFrequency(settings: Settings, enabled: number[], hz: number): { channel: number; sub: number } {
  let best = enabled[0]
  let bestDist = Infinity
  for (const c of enabled) {
    const [lo, hi] = channelRange(settings.channels[c])
    if (hz >= lo && hz <= hi) {
      const ch = settings.channels[c]
      const sub = ch.scale === 'log' ? Math.log(hz / lo) / Math.log(hi / lo) : (hz - lo) / (hi - lo)
      return { channel: c, sub: Math.min(1, Math.max(0, sub)) }
    }
    const d = Math.abs(Math.log(hz / bandCenter(lo, hi)))
    if (d < bestDist) {
      bestDist = d
      best = c
    }
  }
  const [lo, hi] = channelRange(settings.channels[best])
  return { channel: best, sub: hz < lo ? 0 : hz > hi ? 1 : 0.5 }
}

export abstract class BaseVisualization {
  readonly root = new THREE.Group()
  abstract readonly mode: VisualizationMode
  private resources: { dispose(): void }[] = []
  private builtKey: string | null = null
  private staticRefs: unknown[] = []

  /** Sub-bands per channel this visualization needs from the audio pipeline. */
  abstract subbands(settings: Settings): number
  /** Changes whenever buffers must be reallocated (instance counts, segment counts…). */
  protected abstract structureKey(ctx: FrameContext): string
  protected abstract build(ctx: FrameContext): void
  /** Recomputes static per-instance data: layout and colors. */
  protected abstract updateStatic(ctx: FrameContext): void
  /** Per-frame dynamic data and uniforms. */
  protected abstract updateFrame(ctx: FrameContext): void

  /** References whose identity change triggers `updateStatic`. */
  protected staticDeps(ctx: FrameContext): unknown[] {
    const s = ctx.settings
    return [s[this.mode], s.channels, s.color, ctx.colors.version, ctx.layout]
  }

  update(ctx: FrameContext) {
    const key = this.structureKey(ctx)
    let rebuilt = false
    if (key !== this.builtKey) {
      this.release()
      this.build(ctx)
      this.builtKey = key
      rebuilt = true
    }
    const deps = this.staticDeps(ctx)
    if (rebuilt || deps.length !== this.staticRefs.length || deps.some((d, i) => d !== this.staticRefs[i])) {
      this.updateStatic(ctx)
      this.staticRefs = deps
    }
    this.updateFrame(ctx)
  }

  protected track<T extends { dispose(): void }>(resource: T): T {
    this.resources.push(resource)
    return resource
  }

  protected addMesh(mesh: THREE.Object3D) {
    mesh.frustumCulled = false
    this.root.add(mesh)
  }

  /** Frees all GPU resources created by `build`. */
  protected release() {
    for (const r of this.resources) r.dispose()
    this.resources = []
    this.root.clear()
  }

  dispose() {
    this.release()
    this.builtKey = null
    this.root.removeFromParent()
  }
}

/** Marks a whole instanced attribute for upload. */
export function touch(attr: THREE.InstancedBufferAttribute, count?: number) {
  attr.clearUpdateRanges()
  if (count !== undefined) attr.addUpdateRange(0, count * attr.itemSize)
  attr.needsUpdate = true
}
