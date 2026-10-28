import * as THREE from 'three'
import { positionToFrequency } from '../audio/frequencyMath'
import { assignChannel } from '../state/channelOps'
import type { RingsSettings, Settings } from '../state/settingsSchema'
import { createBandMaterial, createStripMaterial, type BandMaterial, type StripMaterial } from '../rendering/ShaderMaterials'
import {
  BaseVisualization,
  channelForFrequency,
  channelFrequency,
  enabledChannels,
  sampleSub,
  touch,
  type FrameContext,
} from './BaseVisualization'
import { CenterOrb } from './CenterOrb'
import { additivity, newElementColors } from './ColorEngine'
import { addInstanceAttributes, createLoopStripGeometry, type InstanceAttributes } from './geometry'

const COLOR_STYLE = { channel: 0, radial: 0, angular: 2, energy: 3 } as const

const segmentsFor = (detail: number) => Math.round(Math.min(1024, Math.max(96, 448 * detail)))

/**
 * Mode A — concentric rings, in three styles:
 * lines: thin luminous rings (one instanced draw, plus a faint "peak ghost" pass);
 * touching: filled rings that meet at the midpoints between their centres;
 * merged: a continuous field whose color and brightness blend from one ring centre to the next,
 *         so color follows the distance from the centre.
 * Bands are drawn between neighbouring rings with the same geometry functions as the lines, so
 * edges coincide exactly even while rings distort. Each ring follows a channel or a sub-band.
 */
export class RingVisualization extends BaseVisualization {
  readonly mode = 'rings' as const
  private lineMaterial: StripMaterial | null = null
  private peakMaterial: StripMaterial | null = null
  private bandMaterial: BandMaterial | null = null
  private lineAttrs: InstanceAttributes | null = null
  private bandAttrs: InstanceAttributes | null = null
  private orb: CenterOrb | null = null
  private count = 0
  private bandCount = 0
  private ringChannel = new Int32Array(0)
  private ringSub = new Float32Array(0)
  private ringPeak = new Float32Array(0)
  private ringValue = new Float32Array(0)
  /** Per band: ring index feeding edge A / B, and a scale for A (the centre fill is dimmer). */
  private bandRingA = new Int32Array(0)
  private bandRingB = new Int32Array(0)
  private bandScaleA = new Float32Array(0)
  private rotation = 0
  private distPhase = 0

  subbands(settings: Settings): number {
    const enabled = Math.max(1, settings.channels.filter((c) => c.enabled).length)
    return Math.min(64, Math.max(4, Math.ceil(settings.rings.count / enabled) * 2))
  }

  private instanceCount(settings: Settings): number {
    return settings.rings.assignment === 'perChannel' ? enabledChannels(settings).length : settings.rings.count
  }

  private drawsLines(r: RingsSettings) {
    return r.style === 'lines' || (r.style === 'merged' && r.outline)
  }

  protected structureKey(ctx: FrameContext): string {
    const r = ctx.settings.rings
    return [this.instanceCount(ctx.settings), segmentsFor(ctx.detail), r.style, this.drawsLines(r), r.peakRings && r.style === 'lines', r.center].join('|')
  }

  protected build(ctx: FrameContext) {
    const r = ctx.settings.rings
    const segments = segmentsFor(ctx.detail)
    const count = this.instanceCount(ctx.settings)
    this.count = count
    this.ringChannel = new Int32Array(count)
    this.ringSub = new Float32Array(count)
    this.ringPeak = new Float32Array(count)
    this.ringValue = new Float32Array(count)
    this.lineMaterial = this.peakMaterial = this.bandMaterial = null
    this.lineAttrs = this.bandAttrs = null
    this.orb = null

    if (r.style !== 'lines') {
      this.bandCount = count + 1
      const geometry = this.track(createLoopStripGeometry(segments))
      this.bandAttrs = addInstanceAttributes(geometry, this.bandCount, ['iRingA', 'iRingB', 'iColA', 'iColB', 'iEngA', 'iEngB', 'iMisc'], ['iDyn'])
      this.bandMaterial = this.track(createBandMaterial(ctx.spectrumTexture, ctx.colors.lut))
      const mesh = new THREE.Mesh(geometry, this.bandMaterial)
      mesh.renderOrder = 0
      this.addMesh(mesh)
      this.bandRingA = new Int32Array(this.bandCount)
      this.bandRingB = new Int32Array(this.bandCount)
      this.bandScaleA = new Float32Array(this.bandCount)
    }

    if (this.drawsLines(r)) {
      const geometry = this.track(createLoopStripGeometry(segments))
      this.lineAttrs = addInstanceAttributes(geometry, count, ['iGeom', 'iColA', 'iColB', 'iColG', 'iMisc'], ['iDyn'])
      this.lineMaterial = this.track(createStripMaterial(ctx.spectrumTexture, ctx.colors.lut))
      if (r.style === 'lines' && r.peakRings) {
        this.peakMaterial = this.track(createStripMaterial(ctx.spectrumTexture, ctx.colors.lut))
        this.peakMaterial.uniforms.uPeakPass.value = 1
        const peakMesh = new THREE.Mesh(geometry, this.peakMaterial)
        peakMesh.renderOrder = 1
        this.addMesh(peakMesh)
      }
      const mesh = new THREE.Mesh(geometry, this.lineMaterial)
      mesh.renderOrder = 2
      this.addMesh(mesh)
    }

    if (r.center !== 'none') {
      this.orb = this.track(new CenterOrb())
      this.orb.mesh.renderOrder = 3
      this.addMesh(this.orb.mesh)
    }
  }

  protected updateStatic(ctx: FrameContext) {
    const s = ctx.settings
    const r = s.rings
    const enabled = enabledChannels(s)
    const n = this.count
    const colors = newElementColors()
    const groupSize = new Map<number, number>()
    const groupIndex: number[] = []

    // Ring → channel (and sub-band) assignment.
    for (let i = 0; i < n; i++) {
      let c: number
      if (r.assignment === 'perChannel') c = enabled[i] ?? enabled[0]
      else if (r.assignment === 'cycled') c = enabled[i % enabled.length]
      else if (r.assignment === 'spectrum') {
        const t = n === 1 ? 0.5 : i / (n - 1)
        const hit = channelForFrequency(s, enabled, positionToFrequency(t, s.audio.minFrequency, s.audio.maxFrequency, 'log'))
        c = hit.channel
        this.ringSub[i] = hit.sub
      } else c = enabled[assignChannel(i, n, enabled.length, 'grouped')]
      this.ringChannel[i] = c
      groupIndex[i] = groupSize.get(c) ?? 0
      groupSize.set(c, groupIndex[i] + 1)
    }

    // Per-ring geometry and colors (linear RGB), shared by lines and bands.
    const radius = new Float32Array(n)
    const dir = new Float32Array(n)
    const phase = new Float32Array(n)
    const norm = new Float32Array(n)
    const z = new Float32Array(n)
    const base = new Float32Array(n * 3)
    const energy = new Float32Array(n * 3)
    const glow = new Float32Array(n * 3)
    const opacity = new Float32Array(n)
    const glowStrength = new Float32Array(n)
    const add = new Float32Array(n)
    const freqPos = new Float32Array(n)

    for (let i = 0; i < n; i++) {
      const c = this.ringChannel[i]
      const ch = s.channels[c]
      if (r.assignment === 'grouped') {
        const size = groupSize.get(c) ?? 1
        this.ringSub[i] = size > 1 ? (groupIndex[i] + 0.5) / size : -1
      } else if (r.assignment !== 'spectrum') {
        this.ringSub[i] = -1
      }
      const sub = this.ringSub[i] >= 0 ? this.ringSub[i] : null
      const hz = channelFrequency(s, c, sub)
      const t = n === 1 ? 0.5 : i / (n - 1)
      if (r.radiusSource === 'channel' && (r.assignment === 'perChannel' || r.assignment === 'grouped')) {
        const spread = sub === null ? 0 : (sub - 0.5) * 0.08
        radius[i] = r.innerRadius + (r.outerRadius - r.innerRadius) * Math.min(1, Math.max(0, ch.position + spread))
      } else {
        radius[i] = r.innerRadius + (r.outerRadius - r.innerRadius) * Math.pow(t, r.spacingCurve)
      }
      ctx.colors.resolve(s, c, hz, sub, colors)
      if (r.colorStyle === 'radial') ctx.colors.colorAtPosition(t, colors.base)
      dir[i] = r.alternateRotation ? (i % 2 ? -1 : 1) * (1 + 0.18 * (i % 3)) : 1
      phase[i] = i * 0.73
      norm[i] = t
      z[i] = -r.depth * (1 - t) * 1.6
      base.set(colors.base, i * 3)
      energy.set(colors.energy, i * 3)
      glow.set(colors.glow, i * 3)
      opacity[i] = ch.opacity
      glowStrength[i] = ch.glow
      add[i] = additivity(ch.blendMode)
      freqPos[i] = ctx.colors.positionOf(hz)
    }

    if (this.lineAttrs) {
      const { iGeom, iColA, iColB, iColG, iMisc } = this.lineAttrs
      const g = iGeom.array as Float32Array
      const a = iColA.array as Float32Array
      const b = iColB.array as Float32Array
      const gl = iColG.array as Float32Array
      const m = iMisc.array as Float32Array
      for (let i = 0; i < n; i++) {
        const o = i * 4
        g.set([radius[i], r.thickness, dir[i], z[i]], o)
        a.set([base[i * 3], base[i * 3 + 1], base[i * 3 + 2], opacity[i]], o)
        b.set([energy[i * 3], energy[i * 3 + 1], energy[i * 3 + 2], freqPos[i]], o)
        gl.set([glow[i * 3], glow[i * 3 + 1], glow[i * 3 + 2], glowStrength[i]], o)
        m.set([add[i], phase[i], norm[i], 0], o)
      }
      for (const attr of [iGeom, iColA, iColB, iColG, iMisc]) touch(attr)
    }

    if (this.bandAttrs) this.writeBands(r, { radius, dir, phase, norm, z, base, energy, opacity, add, freqPos })
  }

  /**
   * Bands between neighbouring rings, ordered by radius: a centre fill (or inner half-band), one
   * band per gap between rings, and an outer half-band beyond the last ring.
   */
  private writeBands(
    r: RingsSettings,
    d: {
      radius: Float32Array
      dir: Float32Array
      phase: Float32Array
      norm: Float32Array
      z: Float32Array
      base: Float32Array
      energy: Float32Array
      opacity: Float32Array
      add: Float32Array
      freqPos: Float32Array
    },
  ) {
    const attrs = this.bandAttrs!
    const n = this.count
    const order = Array.from({ length: n }, (_, i) => i).sort((p, q) => d.radius[p] - d.radius[q])
    const ringA = attrs.iRingA.array as Float32Array
    const ringB = attrs.iRingB.array as Float32Array
    const colA = attrs.iColA.array as Float32Array
    const colB = attrs.iColB.array as Float32Array
    const engA = attrs.iEngA.array as Float32Array
    const engB = attrs.iEngB.array as Float32Array
    const misc = attrs.iMisc.array as Float32Array
    const dyn = attrs.iDyn.array as Float32Array

    const spacingAt = (k: number) => {
      if (n < 2) return Math.max(0.04, d.radius[order[0]] * 0.5)
      const a = order[Math.max(0, Math.min(n - 2, k))]
      const b = order[Math.max(1, Math.min(n - 1, k + 1))]
      return Math.max(0.005, d.radius[b] - d.radius[a])
    }
    const writeEdge = (ringArr: Float32Array, col: Float32Array, eng: Float32Array, o: number, i: number, radius: number) => {
      ringArr.set([radius, d.dir[i], d.phase[i], d.norm[i]], o)
      col.set([d.base[i * 3], d.base[i * 3 + 1], d.base[i * 3 + 2], d.opacity[i]], o)
      eng.set([d.energy[i * 3], d.energy[i * 3 + 1], d.energy[i * 3 + 2], d.freqPos[i]], o)
    }

    for (let k = 0; k <= n; k++) {
      const o = k * 4
      let a: number
      let b: number
      let radiusA: number
      let radiusB: number
      let center = 0
      let outer = 0
      let separator = 0
      if (k === 0) {
        b = order[0]
        a = b
        radiusB = d.radius[b]
        center = r.fillCenter ? 1 : 0
        radiusA = r.fillCenter ? 0 : Math.max(0, radiusB - spacingAt(0) / 2)
      } else if (k === n) {
        a = order[n - 1]
        b = a
        radiusA = d.radius[a]
        radiusB = radiusA + spacingAt(n - 2) / 2
        outer = 1
      } else {
        a = order[k - 1]
        b = order[k]
        radiusA = d.radius[a]
        radiusB = d.radius[b]
        separator = 1
      }
      writeEdge(ringA, colA, engA, o, a, radiusA)
      writeEdge(ringB, colB, engB, o, b, radiusB)
      misc.set([(d.add[a] + d.add[b]) / 2, d.z[a], d.z[b], separator], o)
      dyn[o + 2] = center
      dyn[o + 3] = outer
      this.bandRingA[k] = a
      this.bandRingB[k] = b
      this.bandScaleA[k] = center ? 0.8 : 1
    }
    for (const attr of Object.values(attrs)) touch(attr)
  }

  protected updateFrame(ctx: FrameContext) {
    const { frame, settings: s, dt, motion } = ctx
    const r = s.rings
    const decay = s.audio.peakDecay * dt
    for (let i = 0; i < this.count; i++) {
      const c = this.ringChannel[i]
      const sub = this.ringSub[i]
      const v = sub >= 0 ? sampleSub(frame, c, sub) : frame.intensity[c] ?? 0
      this.ringValue[i] = v
      this.ringPeak[i] = Math.max(v, this.ringPeak[i] - decay)
    }

    if (this.lineAttrs) {
      const dyn = this.lineAttrs.iDyn.array as Float32Array
      for (let i = 0; i < this.count; i++) {
        const o = i * 4
        dyn[o] = this.ringValue[i]
        dyn[o + 1] = this.ringPeak[i]
        dyn[o + 2] = frame.level[this.ringChannel[i]] ?? 0
      }
      touch(this.lineAttrs.iDyn, this.count)
    }
    if (this.bandAttrs) {
      const dyn = this.bandAttrs.iDyn.array as Float32Array
      for (let k = 0; k < this.bandCount; k++) {
        dyn[k * 4] = this.ringValue[this.bandRingA[k]] * this.bandScaleA[k]
        dyn[k * 4 + 1] = this.ringValue[this.bandRingB[k]]
      }
      touch(this.bandAttrs.iDyn, this.bandCount)
    }

    this.rotation += r.rotationSpeed * dt * motion
    this.distPhase += r.distortionSpeed * dt * motion
    const energyMix = ctx.colors.energyMix(s)
    const shared = (u: Record<string, THREE.IUniform>) => {
      u.uTime.value = ctx.time
      u.uScale.value = ctx.layout.unit
      u.uPixel.value = ctx.layout.pixel
      u.uRotation.value = this.rotation
      u.uShape.value = r.shape === 'square' ? 1 : 0
      u.uMirror.value = r.mirror ? 1 : 0
      u.uDistortion.value = r.distortion
      u.uLobes.value = r.distortionLobes
      u.uDistPhase.value = this.distPhase
      u.uSpectrumWarp.value = r.spectrumWarp
      u.uRadiusReact.value = r.radiusReactivity
      u.uColorStyle.value = COLOR_STYLE[r.colorStyle]
      u.uEnergyMix.value = energyMix
      u.uDisplace.value = ctx.displace
      u.uDisplaceScale.value = ctx.displaceScale
      u.uPulse.value = ctx.pulse
    }
    for (const mat of [this.lineMaterial, this.peakMaterial]) {
      if (!mat) continue
      const u = mat.uniforms
      shared(u)
      u.uThickReact.value = r.thicknessReactivity
      u.uOpacityReact.value = r.opacityReactivity
      u.uGlowWidth.value = r.glowWidth
      u.uGlowNorm.value = Math.min(1, Math.max(0.35, Math.sqrt(12 / Math.max(1, this.count))))
      u.uGlowTint.value = s.color.glowTint
      u.uLineGain.value = r.style === 'lines' ? 1 : 0.45
    }
    if (this.bandMaterial) {
      const u = this.bandMaterial.uniforms
      shared(u)
      u.uBandMode.value = r.style === 'merged' ? 1 : 0
      u.uGap.value = r.bandGap
      u.uBandGain.value = r.bandBrightness
      u.uOpacityReact.value = r.opacityReactivity
    }

    if (this.orb) {
      const first = this.ringChannel[0] ?? 0
      const pal = ctx.colors.channel(first)
      this.orb.update({
        style: r.center === 'pulse' ? 'pulse' : 'orb',
        radius: Math.max(0.005, r.centerSize) * ctx.layout.unit,
        level: Math.max(frame.bass, frame.intensity[first] ?? 0),
        beat: frame.beat * motion,
        time: ctx.time,
        pixel: ctx.layout.pixel,
        colorA: pal.primary,
        colorB: pal.gradEnd,
      })
    }
  }
}
