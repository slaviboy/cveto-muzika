import * as THREE from 'three'
import type { AudioEngine } from '../audio/AudioEngine'
import type { AudioPipeline } from '../audio/AudioPipeline'
import { liveData } from '../state/liveData'
import type { Settings } from '../state/settingsSchema'
import type { FrameContext, ViewLayout } from '../visualization/BaseVisualization'
import { ColorEngine } from '../visualization/ColorEngine'
import { EffectsPipeline } from '../visualization/EffectsPipeline'
import { ParticleField } from '../visualization/ParticleField'
import { VisualizationManager } from '../visualization/VisualizationManager'
import { PerformanceMonitor } from './PerformanceMonitor'
import { createDataTexture1D, writeHalfFloat } from './ShaderMaterials'
import { DISPLAY_BINS } from '../audio/AudioPipeline'

const FOV = 30
const CAMERA_Z = 1 / Math.tan(((FOV / 2) * Math.PI) / 180)

export interface RendererOptions {
  container: HTMLElement
  audio: AudioEngine
  pipeline: AudioPipeline
  getSettings: () => Settings
  isReducedMotion: () => boolean
  onContextLost: () => void
  onContextRestored: () => void
}

/**
 * Owns the WebGL renderer, scene, camera and the single requestAnimationFrame loop.
 * Per frame: audio analysis → color/LUT sync → visualization → particles → effects. Nothing here
 * touches React state; live values go to `liveData`.
 */
export class Renderer {
  readonly canvas: HTMLCanvasElement
  private opts: RendererOptions
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private world = new THREE.Group()
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 100)
  private effects: EffectsPipeline
  private colors = new ColorEngine()
  private viz: VisualizationManager
  private particles: ParticleField
  private spectrumTexture = createDataTexture1D(DISPLAY_BINS, 1)
  private monitor = new PerformanceMonitor()
  private resizeObserver: ResizeObserver
  private raf = 0
  private running = false
  private disposed = false
  private lastTime = -1
  private animTime = 0
  private cssWidth = 1
  private cssHeight = 1
  private pixelRatio = 1
  private layout: ViewLayout
  private statsTimer = 0

  constructor(opts: RendererOptions) {
    this.opts = opts
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'aurora-canvas'
    this.canvas.setAttribute('aria-hidden', 'true')
    opts.container.appendChild(this.canvas)

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    })
    this.renderer.autoClear = false
    this.renderer.info.autoReset = false
    const ext = this.renderer.extensions
    const floatTargets = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float')
    this.effects = new EffectsPipeline(this.renderer, floatTargets)

    this.camera.position.set(0, 0, CAMERA_Z)
    this.scene.add(this.world)
    this.viz = new VisualizationManager(this.world)
    this.particles = new ParticleField(this.colors.lut)
    this.scene.add(this.particles.points)

    this.layout = this.computeLayout()
    this.canvas.addEventListener('webglcontextlost', this.handleContextLost, false)
    this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored, false)
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(opts.container)
    this.resize()
  }

  start() {
    if (this.running || this.disposed) return
    this.running = true
    this.lastTime = -1
    this.raf = requestAnimationFrame(this.frame)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.raf)
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.stop()
    this.resizeObserver.disconnect()
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost)
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored)
    this.viz.dispose()
    this.particles.dispose()
    this.effects.dispose()
    this.colors.dispose()
    this.spectrumTexture.dispose()
    this.renderer.dispose()
    this.canvas.remove()
    liveData.frame = null
  }

  /** Test hook: name of the active visualization. */
  get activeMode() {
    return this.viz.mode
  }

  private handleContextLost = (e: Event) => {
    e.preventDefault()
    this.stop()
    this.opts.onContextLost()
  }

  private handleContextRestored = () => {
    this.opts.onContextRestored()
  }

  private targetPixelRatio(settings: Settings) {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    return Math.max(0.5, Math.min(dpr, settings.performance.maxPixelRatio) * this.monitor.scale)
  }

  private resize() {
    const rect = this.opts.container.getBoundingClientRect()
    this.cssWidth = Math.max(1, Math.round(rect.width))
    this.cssHeight = Math.max(1, Math.round(rect.height))
    this.applySize(this.opts.getSettings())
  }

  private applySize(settings: Settings) {
    this.pixelRatio = this.targetPixelRatio(settings)
    this.renderer.setPixelRatio(this.pixelRatio)
    this.renderer.setSize(this.cssWidth, this.cssHeight, false)
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2())
    this.effects.setSize(size.x, size.y, settings.performance.msaa)
    this.camera.aspect = this.cssWidth / this.cssHeight
    this.camera.updateProjectionMatrix()
    this.layout = this.computeLayout()
    liveData.pixelRatio = this.pixelRatio
    liveData.widthPx = size.x
    liveData.heightPx = size.y
  }

  private computeLayout(): ViewLayout {
    const aspect = this.cssWidth / this.cssHeight
    const heightPx = this.cssHeight * this.pixelRatio
    return {
      width: 2 * aspect,
      height: 2,
      aspect,
      unit: Math.min(aspect, 1),
      pixel: 2 / Math.max(1, heightPx),
      widthPx: this.cssWidth * this.pixelRatio,
      heightPx,
      pixelRatio: this.pixelRatio,
    }
  }

  private frame = (now: number) => {
    if (!this.running) return
    this.raf = requestAnimationFrame(this.frame)
    const settings = this.opts.getSettings()
    const dtReal = this.lastTime < 0 ? 1 / 60 : Math.min(0.1, Math.max(0, (now - this.lastTime) / 1000))
    this.lastTime = now
    this.monitor.sample(dtReal * 1000)

    const perf = settings.performance
    const scaleChanged = this.monitor.adapt(dtReal * 1000, perf.adaptiveResolution, perf.minResolutionScale)
    if (scaleChanged || Math.abs(this.targetPixelRatio(settings) - this.pixelRatio) > 0.01) this.applySize(settings)
    else this.effects.setSize(this.renderer.domElement.width, this.renderer.domElement.height, perf.msaa)

    const reduced = this.opts.isReducedMotion()
    const motion = reduced ? 0 : 1
    const dt = dtReal * settings.timing.animationSpeed * (reduced ? 0.25 : 1)
    this.animTime += dt

    const audio = this.opts.audio
    const pipeline = this.opts.pipeline
    pipeline.setSubbandCount(this.viz.subbands(settings))
    const frame = pipeline.process(now, { analyser: audio.activeAnalyser, sampleRate: audio.sampleRate }, settings)
    liveData.frame = frame
    writeHalfFloat(this.spectrumTexture, frame.spectrum)
    this.colors.update(settings)

    const fx = settings.effects
    // Camera drift and depth: subtle Lissajous orbit around the z = 0 plane.
    if (fx.camera.enabled && motion) {
      const t = this.animTime * fx.camera.speed
      const m = fx.camera.motion
      this.camera.position.set(Math.sin(t * 0.7) * 0.35 * m, Math.cos(t * 0.53) * 0.25 * m, CAMERA_Z * (1 - 0.04 * m * Math.sin(t * 0.31)))
      this.camera.lookAt(0, 0, 0)
      this.camera.rotateZ(Math.sin(t * 0.21) * 0.12 * fx.camera.tilt)
    } else {
      this.camera.position.set(0, 0, CAMERA_Z)
      this.camera.rotation.set(0, 0, 0)
    }

    const pulse = fx.pulse.enabled ? fx.pulse.amount * frame.bass * (0.6 + 0.4 * motion) : 0
    const ctx: FrameContext = {
      frame,
      settings,
      time: this.animTime,
      dt,
      motion,
      colors: this.colors,
      pipeline,
      spectrumTexture: this.spectrumTexture,
      layout: this.layout,
      detail: perf.geometryDetail,
      pulse,
      displace: fx.displacement.enabled ? fx.displacement.amount : 0,
      displaceScale: fx.displacement.scale,
    }
    this.renderer.info.reset()
    this.viz.update(ctx)

    const p = fx.particles
    this.particles.setCount(p.enabled ? perf.particleBudget : 0)
    if (p.enabled) {
      this.particles.update({
        time: this.animTime,
        width: this.layout.width,
        height: this.layout.height,
        depth: fx.parallax.enabled ? 0.6 + fx.parallax.depth * 2.4 : 0.4,
        size: p.size,
        pixelRatio: this.pixelRatio,
        speed: p.speed,
        bass: frame.bass,
        energy: frame.overall,
        reactivity: p.reactivity,
        amount: p.amount,
      })
    }
    this.particles.points.visible = p.enabled && p.amount > 0

    this.effects.render(this.scene, this.camera, settings, {
      time: this.animTime,
      dt,
      motion,
      bass: frame.bass,
      overall: frame.overall,
      beat: frame.beat,
      beatCount: frame.beatCount,
      beatStrength: frame.beatStrength,
    })

    this.statsTimer += dtReal
    if (this.statsTimer > 0.25) {
      this.statsTimer = 0
      liveData.fps = this.monitor.fps
      liveData.frameMs = this.monitor.frameMs
      liveData.resolutionScale = this.monitor.scale
      liveData.drawCalls = this.renderer.info.render.calls
    }
  }
}
