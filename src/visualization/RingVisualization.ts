import * as THREE from 'three'
import { positionToFrequency } from '../audio/frequencyMath'
import { assignChannel } from '../state/channelOps'
import type { Settings } from '../state/settingsSchema'
import { createStripMaterial, type StripMaterial } from '../rendering/ShaderMaterials'
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
import { additivity, newElementColors, writeColor } from './ColorEngine'
import { addInstanceAttributes, createLoopStripGeometry, type InstanceAttributes } from './geometry'

const COLOR_STYLE = { channel: 0, radial: 0, angular: 2, energy: 3 } as const

/**
 * Mode A — concentric luminous rings. One instanced draw for all rings (plus an optional faint
 * "peak ghost" pass sharing the same geometry). Each ring follows a channel, or a sub-band of a
 * channel, so even a few channels drive many independently moving rings.
 */
export class RingVisualization extends BaseVisualization {
  readonly mode = 'rings' as const
  private material: StripMaterial | null = null
  private peakMaterial: StripMaterial | null = null
  private attrs: InstanceAttributes = {}
  private orb: CenterOrb | null = null
  private count = 0
  private ringChannel = new Int32Array(0)
  private ringSub = new Float32Array(0)
  private ringPeak = new Float32Array(0)
  private rotation = 0
  private distPhase = 0

  subbands(settings: Settings): number {
    const enabled = Math.max(1, settings.channels.filter((c) => c.enabled).length)
    return Math.min(64, Math.max(4, Math.ceil(settings.rings.count / enabled) * 2))
  }

  protected structureKey(ctx: FrameContext): string {
    const r = ctx.settings.rings
    const segments = Math.round(Math.min(1024, Math.max(96, 448 * ctx.detail)))
    return `${this.instanceCount(ctx.settings)}|${segments}|${r.peakRings}|${r.center}`
  }

  private instanceCount(settings: Settings): number {
    return settings.rings.assignment === 'perChannel' ? enabledChannels(settings).length : settings.rings.count
  }

  protected build(ctx: FrameContext) {
    const segments = Math.round(Math.min(1024, Math.max(96, 448 * ctx.detail)))
    const count = this.instanceCount(ctx.settings)
    this.count = count
    const geometry = this.track(createLoopStripGeometry(segments))
    this.attrs = addInstanceAttributes(geometry, count, ['iGeom', 'iColA', 'iColB', 'iColG', 'iMisc'], ['iDyn'])
    this.material = this.track(createStripMaterial(ctx.spectrumTexture, ctx.colors.lut))
    const mesh = new THREE.Mesh(geometry, this.material)
    mesh.renderOrder = 2
    if (ctx.settings.rings.peakRings) {
      this.peakMaterial = this.track(createStripMaterial(ctx.spectrumTexture, ctx.colors.lut))
      this.peakMaterial.uniforms.uPeakPass.value = 1
      const peakMesh = new THREE.Mesh(geometry, this.peakMaterial)
      peakMesh.renderOrder = 1
      this.addMesh(peakMesh)
    } else {
      this.peakMaterial = null
    }
    this.addMesh(mesh)
    if (ctx.settings.rings.center !== 'none') {
      this.orb = this.track(new CenterOrb())
      this.orb.mesh.renderOrder = 3
      this.addMesh(this.orb.mesh)
    } else {
      this.orb = null
    }
    this.ringChannel = new Int32Array(count)
    this.ringSub = new Float32Array(count)
    this.ringPeak = new Float32Array(count)
  }

  protected updateStatic(ctx: FrameContext) {
    const s = ctx.settings
    const r = s.rings
    const enabled = enabledChannels(s)
    const n = this.count
    const { iGeom, iColA, iColB, iColG, iMisc } = this.attrs
    const g = iGeom.array as Float32Array
    const a = iColA.array as Float32Array
    const b = iColB.array as Float32Array
    const gl = iColG.array as Float32Array
    const m = iMisc.array as Float32Array
    const colors = newElementColors()
    const groupSize = new Map<number, number>()
    const groupIndex: number[] = []

    for (let i = 0; i < n; i++) {
      let c: number
      if (r.assignment === 'perChannel') c = enabled[i] ?? enabled[0]
      else if (r.assignment === 'cycled') c = enabled[i % enabled.length]
      else if (r.assignment === 'spectrum') {
        const t = n === 1 ? 0.5 : i / (n - 1)
        const hz = positionToFrequency(t, s.audio.minFrequency, s.audio.maxFrequency, 'log')
        const hit = channelForFrequency(s, enabled, hz)
        c = hit.channel
        this.ringSub[i] = hit.sub
      } else c = enabled[assignChannel(i, n, enabled.length, 'grouped')]
      this.ringChannel[i] = c
      groupIndex[i] = groupSize.get(c) ?? 0
      groupSize.set(c, groupIndex[i] + 1)
    }

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
      let radius: number
      if (r.radiusSource === 'channel' && (r.assignment === 'perChannel' || r.assignment === 'grouped')) {
        const spread = sub === null ? 0 : (sub - 0.5) * 0.08
        radius = r.innerRadius + (r.outerRadius - r.innerRadius) * Math.min(1, Math.max(0, ch.position + spread))
      } else {
        radius = r.innerRadius + (r.outerRadius - r.innerRadius) * Math.pow(t, r.spacingCurve)
      }

      ctx.colors.resolve(s, c, hz, sub, colors)
      if (r.colorStyle === 'radial') ctx.colors.colorAtPosition(t, colors.base)
      const dir = r.alternateRotation ? (i % 2 ? -1 : 1) * (1 + 0.18 * (i % 3)) : 1
      const z = -r.depth * (1 - t) * 1.6
      const o = i * 4
      g[o] = radius
      g[o + 1] = r.thickness
      g[o + 2] = dir
      g[o + 3] = z
      writeColor(a, o, colors.base, ch.opacity)
      writeColor(b, o, colors.energy, ctx.colors.positionOf(hz))
      writeColor(gl, o, colors.glow, ch.glow)
      m[o] = additivity(ch.blendMode)
      m[o + 1] = i * 0.73
      m[o + 2] = t
      m[o + 3] = 0
    }
    for (const attr of [iGeom, iColA, iColB, iColG, iMisc]) touch(attr)
  }

  protected updateFrame(ctx: FrameContext) {
    const { frame, settings: s, dt, motion } = ctx
    const r = s.rings
    const dyn = this.attrs.iDyn.array as Float32Array
    const decay = s.audio.peakDecay * dt
    for (let i = 0; i < this.count; i++) {
      const c = this.ringChannel[i]
      const sub = this.ringSub[i]
      const v = sub >= 0 ? sampleSub(frame, c, sub) : frame.intensity[c] ?? 0
      this.ringPeak[i] = Math.max(v, this.ringPeak[i] - decay)
      const o = i * 4
      dyn[o] = v
      dyn[o + 1] = this.ringPeak[i]
      dyn[o + 2] = frame.level[c] ?? 0
    }
    touch(this.attrs.iDyn, this.count)

    this.rotation += r.rotationSpeed * dt * motion
    this.distPhase += r.distortionSpeed * dt * motion
    for (const mat of [this.material, this.peakMaterial]) {
      if (!mat) continue
      const u = mat.uniforms
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
      u.uThickReact.value = r.thicknessReactivity
      u.uOpacityReact.value = r.opacityReactivity
      u.uGlowWidth.value = r.glowWidth
      u.uGlowNorm.value = Math.min(1, Math.max(0.35, Math.sqrt(12 / Math.max(1, this.count))))
      u.uColorStyle.value = COLOR_STYLE[r.colorStyle]
      u.uEnergyMix.value = ctx.colors.energyMix(s)
      u.uGlowTint.value = s.color.glowTint
      u.uDisplace.value = ctx.displace
      u.uDisplaceScale.value = ctx.displaceScale
      u.uPulse.value = ctx.pulse
    }

    if (this.orb) {
      const first = this.ringChannel[0] ?? 0
      const pal = ctx.colors.channel(first)
      const level = Math.max(frame.bass, frame.intensity[first] ?? 0)
      this.orb.update({
        style: r.center === 'pulse' ? 'pulse' : 'orb',
        radius: Math.max(0.005, r.centerSize) * ctx.layout.unit,
        level,
        beat: frame.beat * motion,
        time: ctx.time,
        pixel: ctx.layout.pixel,
        colorA: pal.primary,
        colorB: pal.gradEnd,
      })
    }
  }
}
