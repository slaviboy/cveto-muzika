import * as THREE from 'three'
import type { Vec3 } from '../color/colorMath'
import { DelayedSignalBuffer } from '../audio/DelayedSignalBuffer'
import { assignChannel } from '../state/channelOps'
import type { Settings } from '../state/settingsSchema'
import { createCellMaterial, type CellMaterial } from '../rendering/ShaderMaterials'
import { BaseVisualization, channelFrequency, enabledChannels, sampleSub, touch, type FrameContext } from './BaseVisualization'
import { additivity, newElementColors, writeColor } from './ColorEngine'
import { addInstanceAttributes, createQuadGeometry, type InstanceAttributes } from './geometry'

const MAX_WEIGHTS = 4
const SHAPE = { round: 1, square: 0, diamond: 2 } as const

/**
 * Mode B — concentric rows of individual LEDs.
 * rowPerBand: every row follows one channel (uniform, VU arc or spectrum around the ring).
 * ledMix: every LED blends up to four channels with gaussian weights over a spatial pattern.
 */
export class LedRingVisualization extends BaseVisualization {
  readonly mode = 'leds' as const
  private material: CellMaterial | null = null
  private attrs: InstanceAttributes = {}
  private total = 0
  private rowOf = new Uint16Array(0)
  private symOf = new Float32Array(0)
  private rowChannel = new Int32Array(0)
  private weightIdx = new Int32Array(0)
  private weightVal = new Float32Array(0)
  private beatHistory = new DelayedSignalBuffer(1, 512)
  private rowPulse = new Float32Array(0)
  private rotation = 0

  subbands(settings: Settings): number {
    return settings.leds.mapping === 'rowPerBand' && settings.leds.rowStyle === 'spectrum' ? 48 : 4
  }

  private rowCounts(s: Settings): number[] {
    const l = s.leds
    const counts: number[] = []
    for (let r = 0; r < l.rows; r++) {
      const t = l.rows === 1 ? 1 : r / (l.rows - 1)
      const radius = l.innerRadius + (l.outerRadius - l.innerRadius) * t
      const n = l.constantSpacing ? Math.round((l.ledsPerRow * radius) / Math.max(0.05, l.outerRadius)) : l.ledsPerRow
      counts.push(Math.max(6, n))
    }
    return counts
  }

  protected structureKey(ctx: FrameContext): string {
    return this.rowCounts(ctx.settings).join(',')
  }

  protected build(ctx: FrameContext) {
    const counts = this.rowCounts(ctx.settings)
    this.total = counts.reduce((a, b) => a + b, 0)
    const geometry = this.track(createQuadGeometry())
    this.attrs = addInstanceAttributes(geometry, this.total, ['iRect', 'iColA', 'iColB', 'iColG', 'iMisc'], ['iDyn'])
    this.material = this.track(createCellMaterial())
    this.addMesh(new THREE.Mesh(geometry, this.material))
    this.rowOf = new Uint16Array(this.total)
    this.symOf = new Float32Array(this.total)
    this.weightIdx = new Int32Array(this.total * MAX_WEIGHTS)
    this.weightVal = new Float32Array(this.total * MAX_WEIGHTS)
  }

  protected updateStatic(ctx: FrameContext) {
    const s = ctx.settings
    const l = s.leds
    const enabled = enabledChannels(s)
    const E = enabled.length
    const counts = this.rowCounts(s)
    const unit = ctx.layout.unit
    const { iRect, iColA, iColB, iColG, iMisc } = this.attrs
    const rect = iRect.array as Float32Array
    const a = iColA.array as Float32Array
    const b = iColB.array as Float32Array
    const gl = iColG.array as Float32Array
    const m = iMisc.array as Float32Array
    const colors = newElementColors()
    const radialStep = l.rows > 1 ? (l.outerRadius - l.innerRadius) / (l.rows - 1) : 0.2
    this.rowChannel = new Int32Array(l.rows)
    const mixed: Vec3 = [0, 0, 0]
    const mixedEnergy: Vec3 = [0, 0, 0]
    const mixedGlow: Vec3 = [0, 0, 0]

    let k = 0
    for (let r = 0; r < l.rows; r++) {
      const rowT = l.rows === 1 ? 1 : r / (l.rows - 1)
      const radius = l.innerRadius + (l.outerRadius - l.innerRadius) * rowT
      const n = counts[r]
      const angularStep = (Math.PI * 2 * radius) / n
      const size = Math.max(0.002, Math.min(radialStep, angularStep) * l.ledSize) * unit
      const c = enabled[assignChannel(r, l.rows, E, 'grouped')]
      this.rowChannel[r] = c
      const offset = r % 2 ? 0.5 / n : 0
      for (let i = 0; i < n; i++, k++) {
        const ang = i / n + offset
        const theta = Math.PI / 2 + ang * Math.PI * 2
        const sym = Math.min(1, 2 * Math.min(ang % 1, 1 - (ang % 1)))
        this.rowOf[k] = r
        this.symOf[k] = sym
        const o = k * 4
        rect[o] = Math.cos(theta) * radius * unit
        rect[o + 1] = Math.sin(theta) * radius * unit
        rect[o + 2] = size
        rect[o + 3] = size

        let blend = 1
        if (l.mapping === 'ledMix') {
          let x: number
          let wrap = true
          switch (l.mixPattern) {
            case 'radial':
              x = rowT * (E - 1)
              wrap = false
              break
            case 'spiral':
              x = ((ang + rowT * 0.5) % 1) * E
              break
            case 'checker':
              x = (r + i) % E
              break
            default:
              x = (ang % 1) * E
          }
          const w = this.computeWeights(k, x, E, l.mixSpread, wrap, enabled)
          mixed.fill(0)
          mixedEnergy.fill(0)
          mixedGlow.fill(0)
          let add = 0
          for (let j = 0; j < MAX_WEIGHTS; j++) {
            const wv = this.weightVal[k * MAX_WEIGHTS + j]
            if (wv <= 0) continue
            const cj = this.weightIdx[k * MAX_WEIGHTS + j]
            ctx.colors.resolve(s, cj, channelFrequency(s, cj, null), null, colors)
            for (let q = 0; q < 3; q++) {
              mixed[q] += colors.base[q] * wv
              mixedEnergy[q] += colors.energy[q] * wv
              mixedGlow[q] += colors.glow[q] * wv
            }
            add += additivity(s.channels[cj].blendMode) * wv
          }
          blend = w > 0 ? add : 1
          writeColor(a, o, mixed, 1)
          writeColor(b, o, mixedEnergy, ang % 1)
          writeColor(gl, o, mixedGlow, s.channels[c].glow)
        } else {
          const ch = s.channels[c]
          const sub = l.rowStyle === 'spectrum' ? sym : null
          ctx.colors.resolve(s, c, channelFrequency(s, c, sub), sub, colors)
          writeColor(a, o, colors.base, ch.opacity)
          writeColor(b, o, colors.energy, ang % 1)
          writeColor(gl, o, colors.glow, ch.glow)
          blend = additivity(ch.blendMode)
        }
        m[o] = blend
        m[o + 1] = 0.18
        m[o + 2] = theta
        m[o + 3] = l.alternateRotation && r % 2 ? -1 : 1
      }
    }
    for (const attr of [iRect, iColA, iColB, iColG, iMisc]) touch(attr)
  }

  /** Gaussian weights of up to four nearest channels around coordinate x (in channel units). */
  private computeWeights(k: number, x: number, E: number, spread: number, wrap: boolean, enabled: number[]): number {
    const base = k * MAX_WEIGHTS
    const scored: { c: number; w: number }[] = []
    for (let e = 0; e < E; e++) {
      let d = Math.abs(x - (e + (wrap ? 0.5 : 0)))
      if (wrap) d = Math.min(d, E - d)
      scored.push({ c: enabled[e], w: Math.exp(-(d * d) / (2 * spread * spread)) })
    }
    scored.sort((p, q) => q.w - p.w)
    let sum = 0
    for (let j = 0; j < MAX_WEIGHTS; j++) sum += scored[j]?.w ?? 0
    for (let j = 0; j < MAX_WEIGHTS; j++) {
      this.weightIdx[base + j] = scored[j]?.c ?? 0
      this.weightVal[base + j] = scored[j] && sum > 0 ? scored[j].w / sum : 0
    }
    return sum
  }

  protected updateFrame(ctx: FrameContext) {
    const { frame, settings: s, dt, motion } = ctx
    const l = s.leds
    const dyn = this.attrs.iDyn.array as Float32Array
    const now = frame.time
    if (l.pulseWaves) this.beatHistory.push(now, frame.beat * motion)
    const rows = l.rows
    if (this.rowPulse.length !== rows) this.rowPulse = new Float32Array(rows)
    const rowPulse = this.rowPulse
    rowPulse.fill(0)
    if (l.pulseWaves) for (let r = 0; r < rows; r++) rowPulse[r] = this.beatHistory.readScalar(now - r * l.pulseSpeedMs) * 0.55

    for (let k = 0; k < this.total; k++) {
      const r = this.rowOf[k]
      let v: number
      if (l.mapping === 'ledMix') {
        v = 0
        const base = k * MAX_WEIGHTS
        for (let j = 0; j < MAX_WEIGHTS; j++) v += (frame.intensity[this.weightIdx[base + j]] ?? 0) * this.weightVal[base + j]
      } else {
        const c = this.rowChannel[r]
        const level = frame.intensity[c] ?? 0
        if (l.rowStyle === 'spectrum') v = sampleSub(frame, c, this.symOf[k])
        else if (l.rowStyle === 'arc') {
          const edge = Math.min(1.05, level)
          const lit = 1 - smoothstep(edge - 0.03, edge + 0.03, this.symOf[k])
          v = lit * (0.45 + 0.75 * level)
        } else v = level
      }
      v += rowPulse[r] ?? 0
      const o = k * 4
      dyn[o] = v
      dyn[o + 1] = 1
      dyn[o + 2] = 1
    }
    touch(this.attrs.iDyn, this.total)

    this.rotation += l.rotationSpeed * dt * motion
    const u = this.material!.uniforms
    u.uTime.value = ctx.time
    u.uPixel.value = ctx.layout.pixel
    u.uRotation.value = this.rotation
    u.uHalo.value = 0.15 + l.diffusion * 0.85
    u.uEnergyMix.value = ctx.colors.energyMix(s)
    u.uGlowTint.value = s.color.glowTint
    u.uRainbow.value = l.rainbow
    u.uDisplace.value = ctx.displace * ctx.layout.unit
    u.uDisplaceScale.value = ctx.displaceScale
    u.uPulse.value = ctx.pulse
    u.uShape.value = SHAPE[l.shape]
    u.uFillMode.value = 0
    u.uUnlit.value = l.unlitLevel
    u.uLens.value = 1
  }

  override dispose() {
    super.dispose()
    this.beatHistory.clear()
  }
}

function smoothstep(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}
