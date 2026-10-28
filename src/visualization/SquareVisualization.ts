import * as THREE from 'three'
import { positionToFrequency } from '../audio/frequencyMath'
import type { Settings } from '../state/settingsSchema'
import { createCellMaterial, createStripMaterial, type CellMaterial, type StripMaterial } from '../rendering/ShaderMaterials'
import {
  BaseVisualization,
  channelForFrequency,
  channelFrequency,
  enabledChannels,
  sampleSub,
  spreadAcross,
  touch,
  type FrameContext,
} from './BaseVisualization'
import { additivity, newElementColors, writeColor } from './ColorEngine'
import { addInstanceAttributes, createLoopStripGeometry, createQuadGeometry, type InstanceAttributes } from './geometry'

const DEG = Math.PI / 180

/**
 * Mode D — squares and geometric grids.
 * concentric / nested: constant-thickness square outlines (shared strip shader), nested adds twist
 * and counter-rotation. matrix / tiles / waves: instanced cells; waves read each channel's history
 * at a delay proportional to the cell's square (Chebyshev) distance from the centre.
 */
export class SquareVisualization extends BaseVisualization {
  readonly mode = 'squares' as const
  private strip: StripMaterial | null = null
  private cellMat: CellMaterial | null = null
  private attrs: InstanceAttributes = {}
  private count = 0
  private elemChannel = new Int32Array(0)
  private elemSub = new Float32Array(0)
  private elemDist = new Float32Array(0)
  private rotation = 0

  private isOutline(s: Settings) {
    return s.squares.layout === 'concentric' || s.squares.layout === 'nested'
  }

  subbands(settings: Settings): number {
    const q = settings.squares
    const enabled = Math.max(1, settings.channels.filter((c) => c.enabled).length)
    const span = this.isOutline(settings) ? q.layers : Math.max(q.rows, q.columns)
    return Math.min(64, Math.max(4, Math.ceil(span / enabled) * 2))
  }

  protected structureKey(ctx: FrameContext): string {
    const q = ctx.settings.squares
    if (this.isOutline(ctx.settings)) return `outline|${q.layers}|${Math.round(160 * ctx.detail)}`
    return `cells|${q.rows}|${q.columns}`
  }

  protected build(ctx: FrameContext) {
    const q = ctx.settings.squares
    if (this.isOutline(ctx.settings)) {
      this.count = q.layers
      const geometry = this.track(createLoopStripGeometry(Math.max(32, Math.round(160 * ctx.detail))))
      this.attrs = addInstanceAttributes(geometry, this.count, ['iGeom', 'iColA', 'iColB', 'iColG', 'iMisc'], ['iDyn'])
      this.strip = this.track(createStripMaterial(ctx.spectrumTexture, ctx.colors.lut))
      this.cellMat = null
      this.addMesh(new THREE.Mesh(geometry, this.strip))
    } else {
      this.count = q.rows * q.columns
      const geometry = this.track(createQuadGeometry())
      this.attrs = addInstanceAttributes(geometry, this.count, ['iRect', 'iColA', 'iColB', 'iColG', 'iMisc'], ['iDyn'])
      this.cellMat = this.track(createCellMaterial())
      this.strip = null
      this.addMesh(new THREE.Mesh(geometry, this.cellMat))
    }
    this.elemChannel = new Int32Array(this.count)
    this.elemSub = new Float32Array(this.count)
    this.elemDist = new Float32Array(this.count)
  }

  /** Channel + sub-band for a normalised coordinate along the mapping axis. */
  private map(s: Settings, enabled: number[], t: number, cellIndex: number): { channel: number; sub: number } {
    const mapping = s.squares.mapping
    if (mapping === 'cell') return { channel: enabled[cellIndex % enabled.length], sub: -1 }
    if (mapping === 'spectrum') {
      const hz = positionToFrequency(Math.min(1, Math.max(0, t)), s.audio.minFrequency, s.audio.maxFrequency, 'log')
      return channelForFrequency(s, enabled, hz)
    }
    return spreadAcross(t, enabled)
  }

  protected updateStatic(ctx: FrameContext) {
    const s = ctx.settings
    const q = s.squares
    const enabled = enabledChannels(s)
    const colors = newElementColors()
    const a = this.attrs.iColA.array as Float32Array
    const b = this.attrs.iColB.array as Float32Array
    const gl = this.attrs.iColG.array as Float32Array
    const m = this.attrs.iMisc.array as Float32Array

    if (this.isOutline(s)) {
      const g = this.attrs.iGeom.array as Float32Array
      const nested = q.layout === 'nested'
      for (let l = 0; l < this.count; l++) {
        const t = this.count === 1 ? 1 : l / (this.count - 1)
        const hit = this.map(s, enabled, t, l)
        this.elemChannel[l] = hit.channel
        this.elemSub[l] = hit.sub
        const sub = hit.sub >= 0 ? hit.sub : null
        const ch = s.channels[hit.channel]
        ctx.colors.resolve(s, hit.channel, channelFrequency(s, hit.channel, sub), sub, colors)
        const o = l * 4
        g[o] = q.size * (l + 1) / this.count
        g[o + 1] = q.thickness
        g[o + 2] = nested && l % 2 ? -1 : 1
        g[o + 3] = 0
        writeColor(a, o, colors.base, ch.opacity)
        writeColor(b, o, colors.energy, t)
        writeColor(gl, o, colors.glow, ch.glow)
        m[o] = additivity(ch.blendMode)
        m[o + 1] = l * 0.6
        m[o + 2] = t
        m[o + 3] = q.rotation * DEG + (nested ? l * q.twist * DEG : 0)
      }
      for (const name of ['iGeom', 'iColA', 'iColB', 'iColG', 'iMisc']) touch(this.attrs[name])
      return
    }

    const rect = this.attrs.iRect.array as Float32Array
    const L = ctx.layout
    const square = q.layout === 'matrix'
    const areaW = square ? 2 * L.unit * q.size * 0.95 : L.width * Math.min(1, q.size) * 0.96
    const areaH = square ? 2 * L.unit * q.size * 0.95 : L.height * Math.min(1, q.size) * 0.96
    const cw = areaW / q.columns
    const chh = areaH / q.rows
    const cr = (q.rows - 1) / 2
    const cc = (q.columns - 1) / 2
    const maxRing = Math.max(cr, cc, 1)

    for (let r = 0; r < q.rows; r++) {
      for (let c = 0; c < q.columns; c++) {
        const k = r * q.columns + c
        let x = q.columns > 1 ? (c - cc) / cc : 0
        let y = q.rows > 1 ? (cr - r) / cr : 0
        if (q.symmetry === 'mirror') x = Math.abs(x)
        if (q.symmetry === 'quad' || q.symmetry === 'kaleido') {
          x = Math.abs(x)
          y = Math.abs(y)
          if (q.symmetry === 'kaleido' && y > x) [x, y] = [y, x]
        }
        let t: number
        switch (q.mapping) {
          case 'row':
            t = q.symmetry === 'none' || q.symmetry === 'mirror' ? (y + 1) / 2 : y
            break
          case 'column':
            t = q.symmetry === 'none' ? (x + 1) / 2 : x
            break
          default:
            t = Math.max(Math.abs(x), Math.abs(y))
        }
        const foldedIndex = Math.round((y + 1) * 997 + (x + 1) * 31)
        const hit = this.map(s, enabled, t, q.symmetry === 'none' ? k : foldedIndex)
        this.elemChannel[k] = hit.channel
        this.elemSub[k] = hit.sub
        this.elemDist[k] = Math.max(Math.abs(r - cr), Math.abs(c - cc)) / maxRing
        const sub = hit.sub >= 0 ? hit.sub : null
        const ch = s.channels[hit.channel]
        ctx.colors.resolve(s, hit.channel, channelFrequency(s, hit.channel, sub), sub, colors)
        const o = k * 4
        rect[o] = -areaW / 2 + (c + 0.5) * cw
        rect[o + 1] = areaH / 2 - (r + 0.5) * chh
        rect[o + 2] = Math.max(L.pixel, cw * (1 - q.gap))
        rect[o + 3] = Math.max(L.pixel, chh * (1 - q.gap))
        writeColor(a, o, colors.base, ch.opacity)
        writeColor(b, o, colors.energy, t)
        writeColor(gl, o, colors.glow, ch.glow)
        m[o] = additivity(ch.blendMode)
        m[o + 1] = q.layout === 'matrix' ? 0.5 : q.cornerRadius
        m[o + 2] = 0
        m[o + 3] = 1
      }
    }
    for (const name of ['iRect', 'iColA', 'iColB', 'iColG', 'iMisc']) touch(this.attrs[name])
  }

  protected updateFrame(ctx: FrameContext) {
    const { frame, settings: s, dt, motion } = ctx
    const q = s.squares
    const dyn = this.attrs.iDyn.array as Float32Array
    const waves = q.layout === 'waves'
    const maxRing = Math.max((q.rows - 1) / 2, (q.columns - 1) / 2, 1)
    for (let k = 0; k < this.count; k++) {
      const c = this.elemChannel[k]
      const sub = this.elemSub[k]
      let v: number
      if (waves) v = ctx.pipeline.history(c, this.elemDist[k] * maxRing * q.waveSpeedMs, s)
      else v = sub >= 0 ? sampleSub(frame, c, sub) : frame.intensity[c] ?? 0
      const o = k * 4
      dyn[o] = v
      dyn[o + 1] = this.strip ? v : 1
      dyn[o + 2] = 1 + q.scalePulse * Math.min(1.5, v)
    }
    touch(this.attrs.iDyn, this.count)
    this.rotation += q.rotationSpeed * dt * motion

    if (this.strip) {
      const u = this.strip.uniforms
      u.uTime.value = ctx.time
      u.uScale.value = ctx.layout.unit
      u.uPixel.value = ctx.layout.pixel
      u.uRotation.value = this.rotation
      u.uShape.value = 1
      u.uMirror.value = 0
      u.uDistortion.value = 0
      u.uLobes.value = 0
      u.uSpectrumWarp.value = 0
      u.uRadiusReact.value = q.scalePulse * 0.35
      u.uThickReact.value = 1.4
      u.uOpacityReact.value = 0.55
      u.uGlowWidth.value = q.glowWidth
      u.uGlowNorm.value = Math.min(1, Math.max(0.35, Math.sqrt(12 / Math.max(1, this.count))))
      u.uColorStyle.value = 0
      u.uEnergyMix.value = ctx.colors.energyMix(s)
      u.uGlowTint.value = s.color.glowTint
      u.uDisplace.value = ctx.displace + q.displacement
      u.uDisplaceScale.value = ctx.displaceScale
      u.uPulse.value = ctx.pulse
    }
    if (this.cellMat) {
      const u = this.cellMat.uniforms
      u.uTime.value = ctx.time
      u.uPixel.value = ctx.layout.pixel
      u.uRotation.value = q.rotation * DEG + this.rotation
      u.uHalo.value = q.layout === 'matrix' ? 0.6 : 0.3
      u.uEnergyMix.value = ctx.colors.energyMix(s)
      u.uGlowTint.value = s.color.glowTint
      u.uRainbow.value = 0
      u.uDisplace.value = (ctx.displace + q.displacement) * ctx.layout.unit
      u.uDisplaceScale.value = ctx.displaceScale
      u.uPulse.value = ctx.pulse
      u.uShape.value = q.layout === 'matrix' ? 1 : 0
      u.uFillMode.value = 0
      u.uUnlit.value = q.layout === 'matrix' ? 0.05 : 0.035
      u.uLens.value = q.layout === 'matrix' ? 1 : 0.4
    }
  }
}
