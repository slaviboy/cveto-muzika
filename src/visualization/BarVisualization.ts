import * as THREE from 'three'
import type { Vec3 } from '../color/colorMath'
import { assignChannel, channelRange } from '../state/channelOps'
import type { Settings } from '../state/settingsSchema'
import { createCellMaterial, type CellMaterial } from '../rendering/ShaderMaterials'
import { BaseVisualization, channelFrequency, enabledChannels, sampleSub, spreadAcross, touch, type FrameContext } from './BaseVisualization'
import { additivity, newElementColors, writeColor, type ElementColors } from './ColorEngine'
import { addInstanceAttributes, createQuadGeometry, type InstanceAttributes } from './geometry'

/**
 * Mode C — light bars.
 * equalizer: columns spread across the enabled channels (by log-bandwidth or equal share), drawn
 * as segmented LED stacks or continuous fills, with optional peak markers.
 * lightwall: a full-screen grid where each row follows a channel and columns walk through that
 * channel's sub-bands.
 * leds: a full-screen equalizer of round LEDs; rows follow from the column count so LEDs stay
 * circular, and each column's peak is held as a single lit LED.
 * Layout is computed on a (u = column axis, v = growth axis) plane, then mapped to x/y by orientation.
 */
export class BarVisualization extends BaseVisualization {
  readonly mode = 'bars' as const
  private material: CellMaterial | null = null
  private peakMaterial: CellMaterial | null = null
  private attrs: InstanceAttributes = {}
  private peakAttrs: InstanceAttributes | null = null
  private cells = 0
  private peakCount = 0
  private logicalCols = 0
  private logicalRows = 0
  /** Per cell: logical element, segment / row index, side (+1 up, −1 down when mirrored). */
  private cellLogical = new Int32Array(0)
  private cellSegment = new Int32Array(0)
  private cellSide = new Int8Array(0)
  private peakLogical = new Int32Array(0)
  private peakSide = new Int8Array(0)
  private peakU = new Float32Array(0)
  /** Per logical element: channel and sub-band position, current value and peak. */
  private elemChannel = new Int32Array(0)
  private elemSub = new Float32Array(0)
  private value = new Float32Array(0)
  private prevValue = new Float32Array(0)
  private peak = new Float32Array(0)
  private peakHold = new Float32Array(0)
  private segments = 1
  /** Growth length of one side of a bar (half the area when mirrored vertically). */
  private span = 1

  subbands(settings: Settings): number {
    const b = settings.bars
    const enabled = Math.max(1, settings.channels.filter((c) => c.enabled).length)
    const cols = b.mirror === 'horizontal' || b.mirror === 'both' ? Math.ceil(b.columns / 2) : b.columns
    return Math.min(128, Math.max(4, b.style === 'lightwall' ? cols : Math.ceil(cols / enabled) + 1))
  }

  protected structureKey(ctx: FrameContext): string {
    const b = ctx.settings.bars
    return [b.style, b.columns, b.style === 'leds' ? this.ledRows(ctx) : b.rows, b.segmented, b.mirror, b.peakMarkers].join('|')
  }

  /** Full-screen area used by the LED style (u = column axis, v = growth axis). */
  private ledArea(ctx: FrameContext) {
    const L = ctx.layout
    const vertical = ctx.settings.bars.orientation === 'vertical'
    return { spanU: (vertical ? L.width : L.height) * 0.98, spanV: (vertical ? L.height : L.width) * 0.96 }
  }

  /** LED rows per side so that the LED pitch matches the column pitch (round LEDs). */
  private ledRows(ctx: FrameContext) {
    const b = ctx.settings.bars
    const { spanU, spanV } = this.ledArea(ctx)
    const half = b.mirror === 'vertical' || b.mirror === 'both' ? spanV / 2 : spanV
    return Math.max(3, Math.min(160, Math.round(half / (spanU / b.columns))))
  }

  protected build(ctx: FrameContext) {
    const b = ctx.settings.bars
    const mirrorH = b.mirror === 'horizontal' || b.mirror === 'both'
    const mirrorV = b.mirror === 'vertical' || b.mirror === 'both'
    const C = b.columns
    const R = b.rows
    this.logicalCols = mirrorH ? Math.ceil(C / 2) : C
    const centerC = (C - 1) / 2
    const logicalCol = (v: number) => (mirrorH ? Math.floor(Math.abs(v - centerC)) : v)

    const cellLogical: number[] = []
    const cellSegment: number[] = []
    const cellSide: number[] = []
    if (b.style !== 'lightwall') {
      const segmented = b.style === 'leds' || b.segmented
      this.logicalRows = 1
      this.segments = b.style === 'leds' ? this.ledRows(ctx) : segmented ? R : 1
      // A continuous bar mirrored vertically is a single centre-filled instance.
      const sides = mirrorV && segmented ? 2 : 1
      for (let v = 0; v < C; v++) {
        for (let side = 0; side < sides; side++) {
          for (let sgm = 0; sgm < this.segments; sgm++) {
            cellLogical.push(logicalCol(v))
            cellSegment.push(sgm)
            cellSide.push(side === 0 ? 1 : -1)
          }
        }
      }
      const peakSides = mirrorV ? 2 : 1
      // LED bars show the peak as a lit LED instead of a separate marker.
      this.peakCount = b.peakMarkers && b.style === 'equalizer' ? C * peakSides : 0
      this.peakLogical = new Int32Array(this.peakCount)
      this.peakSide = new Int8Array(this.peakCount)
      this.peakU = new Float32Array(this.peakCount)
      for (let i = 0; i < this.peakCount; i++) {
        this.peakLogical[i] = logicalCol(Math.floor(i / peakSides))
        this.peakSide[i] = i % peakSides === 0 ? 1 : -1
      }
    } else {
      this.logicalRows = mirrorV ? Math.ceil(R / 2) : R
      const centerR = (R - 1) / 2
      for (let r = 0; r < R; r++) {
        const lr = mirrorV ? Math.floor(Math.abs(r - centerR)) : r
        for (let v = 0; v < C; v++) {
          cellLogical.push(lr * this.logicalCols + logicalCol(v))
          cellSegment.push(r)
          cellSide.push(1)
        }
      }
      this.peakCount = 0
    }
    this.cells = cellLogical.length
    this.cellLogical = Int32Array.from(cellLogical)
    this.cellSegment = Int32Array.from(cellSegment)
    this.cellSide = Int8Array.from(cellSide)

    const logicalCount = this.logicalCols * this.logicalRows
    this.elemChannel = new Int32Array(logicalCount)
    this.elemSub = new Float32Array(logicalCount)
    this.value = new Float32Array(logicalCount)
    this.prevValue = new Float32Array(logicalCount)
    this.peak = new Float32Array(logicalCount)
    this.peakHold = new Float32Array(logicalCount)

    const geometry = this.track(createQuadGeometry())
    this.attrs = addInstanceAttributes(geometry, this.cells, ['iRect', 'iColA', 'iColB', 'iColG', 'iMisc'], ['iDyn'])
    this.material = this.track(createCellMaterial())
    this.addMesh(new THREE.Mesh(geometry, this.material))
    if (this.peakCount) {
      const pg = this.track(createQuadGeometry())
      this.peakAttrs = addInstanceAttributes(pg, this.peakCount, ['iColA', 'iColB', 'iColG', 'iMisc'], ['iRect', 'iDyn'])
      this.peakMaterial = this.track(createCellMaterial())
      const pm = new THREE.Mesh(pg, this.peakMaterial)
      pm.renderOrder = 2
      this.addMesh(pm)
    } else {
      this.peakAttrs = null
      this.peakMaterial = null
    }
  }

  private cellsPerColumn() {
    return this.cells / this.columnsCount
  }

  private columnsCount = 1

  protected updateStatic(ctx: FrameContext) {
    const s = ctx.settings
    const b = s.bars
    const enabled = enabledChannels(s)
    const vertical = b.orientation === 'vertical'
    const mirrorV = b.mirror === 'vertical' || b.mirror === 'both'
    const C = b.columns
    const R = b.rows
    this.columnsCount = C
    const L = ctx.layout
    const leds = b.style === 'leds'
    const area = leds ? this.ledArea(ctx) : null
    const spanU = area ? area.spanU : (vertical ? L.width : L.height) * b.widthScale
    const spanV = area ? area.spanV : (vertical ? L.height : L.width) * b.heightScale
    const colW = spanU / C
    const colors = newElementColors()
    const tmp: Vec3 = [0, 0, 0]

    const weights =
      b.distribution === 'log'
        ? enabled.map((c) => {
            const [lo, hi] = channelRange(s.channels[c])
            return Math.max(0.05, Math.log2(hi / lo))
          })
        : undefined
    for (let lr = 0; lr < this.logicalRows; lr++) {
      for (let lc = 0; lc < this.logicalCols; lc++) {
        const idx = lr * this.logicalCols + lc
        const t = (lc + 0.5) / this.logicalCols
        if (b.style !== 'lightwall') {
          const hit = spreadAcross(t, enabled, weights)
          this.elemChannel[idx] = hit.channel
          this.elemSub[idx] = hit.sub
        } else {
          this.elemChannel[idx] = enabled[assignChannel(lr, this.logicalRows, enabled.length, 'grouped')]
          this.elemSub[idx] = t
        }
      }
    }

    const { iRect, iColA, iColB, iColG, iMisc } = this.attrs
    const rect = iRect.array as Float32Array
    const a = iColA.array as Float32Array
    const bb = iColB.array as Float32Array
    const gl = iColG.array as Float32Array
    const m = iMisc.array as Float32Array
    // Cells are rotated so their local +y follows the growth axis; sizes stay in (u, v) terms.
    const rotation = vertical ? 0 : -Math.PI / 2
    const writeRect = (o: number, u: number, v: number, sizeU: number, sizeV: number) => {
      rect[o] = vertical ? u : v
      rect[o + 1] = vertical ? v : -u
      rect[o + 2] = sizeU
      rect[o + 3] = sizeV
    }

    if (b.style !== 'lightwall') {
      const half = mirrorV ? spanV / 2 : spanV
      this.span = half
      const segSize = half / this.segments
      // LEDs are round: one diameter for both axes.
      const ledSize = Math.max(L.pixel * 1.5, Math.min(colW, segSize) * (1 - b.gap))
      const barW = leds ? ledSize : Math.max(L.pixel * 1.5, colW * (1 - b.gap))
      const baseV = mirrorV ? 0 : -spanV / 2
      const perColumn = this.cellsPerColumn()
      for (let k = 0; k < this.cells; k++) {
        const col = Math.floor(k / perColumn)
        const u = -spanU / 2 + (col + 0.5) * colW
        const o = k * 4
        if (leds) {
          writeRect(o, u, baseV + this.cellSide[k] * (this.cellSegment[k] + 0.5) * segSize, ledSize, ledSize)
        } else if (b.segmented) {
          const v = baseV + this.cellSide[k] * (this.cellSegment[k] + 0.5) * segSize
          writeRect(o, u, v, barW, Math.max(L.pixel, segSize * (1 - b.segmentGap)))
        } else {
          writeRect(o, u, mirrorV ? 0 : baseV + half / 2, barW, mirrorV ? spanV : half)
        }
        const li = this.cellLogical[k]
        const along = leds || b.segmented ? this.cellSegment[k] / Math.max(1, this.segments - 1) : 0
        this.writeCellColors(ctx, k, li, along, (col + 0.5) / C, colors, tmp, a, bb, gl, m)
        m[o + 1] = b.cornerRadius
        m[o + 2] = rotation
      }
      if (this.peakAttrs) {
        const pr = this.peakAttrs.iRect.array as Float32Array
        const pa = this.peakAttrs.iColA.array as Float32Array
        const pb = this.peakAttrs.iColB.array as Float32Array
        const pg = this.peakAttrs.iColG.array as Float32Array
        const pm = this.peakAttrs.iMisc.array as Float32Array
        const sides = mirrorV ? 2 : 1
        for (let i = 0; i < this.peakCount; i++) {
          const col = Math.floor(i / sides)
          const o = i * 4
          this.peakU[i] = -spanU / 2 + (col + 0.5) * colW
          pr[o + 2] = barW
          pr[o + 3] = Math.max(L.pixel * 2, Math.min(segSize * 0.45, spanV * 0.012))
          const pal = ctx.colors.channel(this.elemChannel[this.peakLogical[i]])
          writeColor(pa, o, pal.secondary, 1)
          writeColor(pb, o, pal.gradEnd, (col + 0.5) / C)
          writeColor(pg, o, pal.secondary, 0.6)
          pm[o] = 1
          pm[o + 1] = 0.5
          pm[o + 2] = rotation
          pm[o + 3] = 0
        }
        for (const attr of Object.values(this.peakAttrs)) touch(attr)
      }
    } else {
      const cellU = spanU / C
      const cellV = spanV / R
      for (let k = 0; k < this.cells; k++) {
        const r = this.cellSegment[k]
        const col = k % C
        const o = k * 4
        writeRect(
          o,
          -spanU / 2 + (col + 0.5) * cellU,
          spanV / 2 - (r + 0.5) * cellV,
          Math.max(L.pixel, cellU * (1 - b.gap)),
          Math.max(L.pixel, cellV * (1 - b.gap)),
        )
        this.writeCellColors(ctx, k, this.cellLogical[k], R > 1 ? r / (R - 1) : 0, (col + 0.5) / C, colors, tmp, a, bb, gl, m)
        m[o + 1] = b.cornerRadius
        m[o + 2] = rotation
      }
    }
    for (const attr of [iRect, iColA, iColB, iColG, iMisc]) touch(attr)
  }

  private writeCellColors(
    ctx: FrameContext,
    k: number,
    li: number,
    along: number,
    spatial: number,
    out: ElementColors,
    tmp: Vec3,
    a: Float32Array,
    bb: Float32Array,
    gl: Float32Array,
    m: Float32Array,
  ) {
    const s = ctx.settings
    const c = this.elemChannel[li]
    const ch = s.channels[c]
    const hz = channelFrequency(s, c, this.elemSub[li])
    ctx.colors.resolve(s, c, hz, this.elemSub[li], out)
    if (s.bars.colorMode === 'frequency') {
      ctx.colors.colorAtFrequency(hz, out.base)
      ctx.colors.colorAtFrequency(hz, out.energy)
    } else if (s.bars.colorMode === 'vertical') {
      const pal = ctx.colors.channel(c)
      for (let q = 0; q < 3; q++) tmp[q] = pal.gradStart[q] + (pal.gradEnd[q] - pal.gradStart[q]) * along
      out.base = [tmp[0], tmp[1], tmp[2]]
      out.energy = [pal.gradEnd[0], pal.gradEnd[1], pal.gradEnd[2]]
    }
    const o = k * 4
    writeColor(a, o, out.base, ch.opacity)
    writeColor(bb, o, out.energy, spatial)
    writeColor(gl, o, out.glow, ch.glow * s.bars.glow)
    m[o] = additivity(ch.blendMode)
    m[o + 3] = 0
  }

  protected updateFrame(ctx: FrameContext) {
    const { frame, settings: s, dt } = ctx
    const b = s.bars
    const n = this.value.length
    // Wave propagation: each element is pulled up by its decaying neighbours (frame-rate scaled).
    const prop = b.waveProp > 0 ? Math.pow(b.waveProp, 0.5 * Math.max(0.25, dt * 60)) * 0.97 : 0
    this.prevValue.set(this.value)
    for (let i = 0; i < n; i++) {
      let v = sampleSub(frame, this.elemChannel[i], this.elemSub[i])
      if (prop > 0) {
        const lc = i % this.logicalCols
        const left = lc > 0 ? this.prevValue[i - 1] : 0
        const right = lc < this.logicalCols - 1 ? this.prevValue[i + 1] : 0
        v = Math.max(v, Math.max(left, right) * prop)
      }
      this.value[i] = v
      if (v >= this.peak[i]) {
        this.peak[i] = v
        this.peakHold[i] = s.audio.peakHoldMs
      } else if (this.peakHold[i] > 0) this.peakHold[i] -= dt * 1000
      else this.peak[i] = Math.max(v, this.peak[i] - s.audio.peakDecay * dt)
    }

    const dyn = this.attrs.iDyn.array as Float32Array
    const vertical = b.orientation === 'vertical'
    const mirrorV = b.mirror === 'vertical' || b.mirror === 'both'
    if (b.style !== 'lightwall') {
      const S = this.segments
      const leds = b.style === 'leds'
      for (let k = 0; k < this.cells; k++) {
        const li = this.cellLogical[k]
        const v = this.value[li]
        const o = k * 4
        if (leds || b.segmented) {
          const seg = this.cellSegment[k]
          const lit = Math.min(1, Math.max(0, Math.min(1.2, v) * S - seg))
          let level = lit * (0.4 + 0.8 * Math.min(1.5, v))
          if (leds && b.peakMarkers) {
            const peakSeg = Math.min(S - 1, Math.floor(Math.min(1, this.peak[li]) * S - 1e-6))
            if (seg === peakSeg && this.peak[li] > 0.02) level = Math.max(level, 0.9)
          }
          dyn[o] = level
          dyn[o + 1] = 1
        } else {
          dyn[o] = Math.min(1.5, v)
          dyn[o + 1] = Math.min(1, v)
        }
        dyn[o + 2] = 1
      }
      if (this.peakAttrs) {
        const pdyn = this.peakAttrs.iDyn.array as Float32Array
        const prect = this.peakAttrs.iRect.array as Float32Array
        for (let i = 0; i < this.peakCount; i++) {
          const p = Math.min(1, this.peak[this.peakLogical[i]])
          const o = i * 4
          const v = mirrorV ? this.peakSide[i] * p * this.span : -this.span / 2 + p * this.span
          const u = this.peakU[i]
          prect[o] = vertical ? u : v
          prect[o + 1] = vertical ? v : -u
          pdyn[o] = p > 0.01 ? 0.5 + p * 0.8 : 0
          pdyn[o + 1] = 1
          pdyn[o + 2] = 1
        }
        touch(this.peakAttrs.iDyn, this.peakCount)
        touch(this.peakAttrs.iRect, this.peakCount)
      }
    } else {
      for (let k = 0; k < this.cells; k++) {
        const o = k * 4
        dyn[o] = this.value[this.cellLogical[k]]
        dyn[o + 1] = 1
        dyn[o + 2] = 1
      }
    }
    touch(this.attrs.iDyn, this.cells)

    const mixEnergy = b.colorMode === 'vertical' ? (b.segmented || b.style === 'leds' ? 0.35 : 1) : ctx.colors.energyMix(s)
    for (const mat of [this.material, this.peakMaterial]) {
      if (!mat) continue
      const u = mat.uniforms
      u.uTime.value = ctx.time
      u.uPixel.value = ctx.layout.pixel
      u.uRotation.value = 0
      u.uHalo.value = 0.12 + b.glow * 0.4
      u.uEnergyMix.value = mixEnergy
      u.uGlowTint.value = s.color.glowTint
      u.uRainbow.value = 0
      u.uDisplace.value = ctx.displace * ctx.layout.unit
      u.uDisplaceScale.value = ctx.displaceScale
      u.uPulse.value = ctx.pulse * 0.5
      u.uShape.value = b.style === 'leds' ? 1 : 0
      u.uUnlit.value = b.style === 'leds' ? 0.07 : b.style === 'lightwall' ? 0.05 : 0.06
      u.uLens.value = b.style === 'leds' ? 1 : b.style === 'lightwall' ? 0.6 : 0.25
      u.uFillMode.value = 0
    }
    if (b.style === 'leds') this.material!.uniforms.uHalo.value = 0.3 + b.glow * 0.35
    this.material!.uniforms.uFillMode.value = b.style === 'equalizer' && !b.segmented ? (mirrorV ? 2 : 1) : 0
    if (this.peakMaterial) {
      this.peakMaterial.uniforms.uHalo.value = 0.6
      this.peakMaterial.uniforms.uUnlit.value = 0
    }
  }
}
