import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { AudioPipeline } from '../../src/audio/AudioPipeline'
import { createDefaultSettings } from '../../src/state/defaults'
import { VISUALIZATION_MODES, type Settings, type VisualizationMode } from '../../src/state/settingsSchema'
import type { BaseVisualization, FrameContext, ViewLayout } from '../../src/visualization/BaseVisualization'
import { ColorEngine } from '../../src/visualization/ColorEngine'
import { VISUALIZATION_FACTORIES, VisualizationManager } from '../../src/visualization/VisualizationManager'

const layout: ViewLayout = { width: 3.2, height: 2, aspect: 1.6, unit: 1, pixel: 0.002, widthPx: 1600, heightPx: 1000, pixelRatio: 1 }

function context(settings: Settings, pipeline = new AudioPipeline()): FrameContext {
  const colors = new ColorEngine()
  colors.update(settings)
  pipeline.setSubbandCount(16)
  const frame = pipeline.process(16, { analyser: null, sampleRate: 48000 }, settings)
  frame.intensity.fill(0.6)
  frame.sub.fill(0.5)
  return {
    frame,
    settings,
    time: 1,
    dt: 1 / 60,
    motion: 1,
    colors,
    pipeline,
    spectrumTexture: new THREE.DataTexture(new Uint16Array(256), 256, 1, THREE.RedFormat, THREE.HalfFloatType),
    layout,
    detail: 1,
    pulse: 0,
    displace: 0,
    displaceScale: 4,
  }
}

function instanceCount(root: THREE.Object3D): number {
  let n = 0
  root.traverse((o) => {
    const g = (o as THREE.Mesh).geometry as THREE.InstancedBufferGeometry | undefined
    if (g && 'instanceCount' in g && (o as THREE.Mesh).isMesh) n += g.instanceCount
  })
  return n
}

describe('visualization mode switching', () => {
  it('keeps exactly one visualization and disposes the previous one', () => {
    const disposed: string[] = []
    const fake = (mode: VisualizationMode) => () =>
      ({ mode, root: new THREE.Group(), dispose: () => disposed.push(mode), subbands: () => 4, update: () => {} }) as unknown as BaseVisualization
    const parent = new THREE.Group()
    const mgr = new VisualizationManager(parent, { rings: fake('rings'), leds: fake('leds'), bars: fake('bars'), squares: fake('squares') })
    mgr.ensure('rings')
    expect(mgr.ensure('rings')).toBe(mgr.active)
    mgr.ensure('bars')
    mgr.ensure('squares')
    expect(disposed).toEqual(['rings', 'bars'])
    expect(mgr.mode).toBe('squares')
    mgr.dispose()
    expect(disposed).toEqual(['rings', 'bars', 'squares'])
    expect(mgr.active).toBeNull()
  })

  it('builds every real mode and frees all GPU resources on switch', () => {
    const geomDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose')
    const matDispose = vi.spyOn(THREE.Material.prototype, 'dispose')
    const parent = new THREE.Group()
    const mgr = new VisualizationManager(parent)
    for (const mode of VISUALIZATION_MODES) {
      const s = createDefaultSettings()
      s.mode = mode
      const ctx = context(s)
      mgr.update(ctx)
      mgr.update(ctx)
      expect(parent.children).toHaveLength(1)
      expect(instanceCount(parent.children[0]), mode).toBeGreaterThan(0)
    }
    const before = geomDispose.mock.calls.length
    mgr.dispose()
    expect(geomDispose.mock.calls.length).toBeGreaterThan(before)
    expect(matDispose).toHaveBeenCalled()
    expect(parent.children).toHaveLength(0)
  })
})

describe('adjustable geometry', () => {
  it('rebuilds rings when the ring count changes', () => {
    const viz = VISUALIZATION_FACTORIES.rings()
    const s = createDefaultSettings()
    s.rings.peakRings = false
    s.rings.center = 'none'
    for (const count of [1, 24, 128]) {
      s.rings = { ...s.rings, count }
      viz.update(context(s))
      expect(instanceCount(viz.root)).toBe(count)
    }
    viz.dispose()
  })

  it('creates one ring per channel in per-channel mode', () => {
    const viz = VISUALIZATION_FACTORIES.rings()
    const s = createDefaultSettings()
    s.rings = { ...s.rings, assignment: 'perChannel', peakRings: false, center: 'none' }
    viz.update(context(s))
    expect(instanceCount(viz.root)).toBe(s.channels.length)
  })

  it('scales LED density with rows and LEDs per row', () => {
    const viz = VISUALIZATION_FACTORIES.leds()
    const s = createDefaultSettings()
    s.leds = { ...s.leds, rows: 4, ledsPerRow: 50, constantSpacing: false }
    viz.update(context(s))
    expect(instanceCount(viz.root)).toBe(200)
  })

  it('sizes bar grids from rows and columns', () => {
    const viz = VISUALIZATION_FACTORIES.bars()
    const s = createDefaultSettings()
    s.bars = { ...s.bars, style: 'lightwall', rows: 5, columns: 12 }
    viz.update(context(s))
    expect(instanceCount(viz.root)).toBe(60)
    s.bars = { ...s.bars, style: 'equalizer', rows: 10, columns: 8, segmented: true, peakMarkers: true, mirror: 'none' }
    viz.update(context(s))
    expect(instanceCount(viz.root)).toBe(8 * 10 + 8)
  })

  it('sizes square grids and outline layers', () => {
    const viz = VISUALIZATION_FACTORIES.squares()
    const s = createDefaultSettings()
    s.squares = { ...s.squares, layout: 'tiles', rows: 7, columns: 9 }
    viz.update(context(s))
    expect(instanceCount(viz.root)).toBe(63)
    s.squares = { ...s.squares, layout: 'nested', layers: 11 }
    viz.update(context(s))
    expect(instanceCount(viz.root)).toBe(11)
  })
})
