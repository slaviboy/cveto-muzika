import * as THREE from 'three'
import { hexToLinear } from '../color/colorMath'
import type { Settings } from '../state/settingsSchema'
import { createPassMaterial } from '../rendering/ShaderMaterials'
import { bloomDownFrag, bloomUpFrag, compositeFrag, feedbackFrag, fullscreenVert } from '../rendering/shaders/post.glsl'

export interface EffectsFrame {
  time: number
  dt: number
  motion: number
  bass: number
  overall: number
  beat: number
  beatCount: number
  beatStrength: number
}

const TONE_MAP = { agx: 0, aces: 1, reinhard: 2, none: 3, neon: 4 } as const
const BG_STYLE = { solid: 0, linear: 1, radial: 2 } as const

interface Shock {
  start: number
  strength: number
}

/**
 * Scene → HDR target → optional trails/feedback → optional mip-chain bloom → one composite pass
 * that does every cheap screen-space effect plus tone mapping, grading and dithering.
 * Passes for disabled effects are skipped and their render targets released.
 */
export class EffectsPipeline {
  private renderer: THREE.WebGLRenderer
  private type: THREE.TextureDataType
  private width = 1
  private height = 1
  private msaa = false
  private sceneRT: THREE.WebGLRenderTarget
  private feedbackRT: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget] | null = null
  private feedbackIndex = 0
  private mips: THREE.WebGLRenderTarget[] = []
  private mipConfig = ''
  private quadScene = new THREE.Scene()
  private quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private quad: THREE.Mesh
  private feedbackMat: THREE.ShaderMaterial
  private downMat: THREE.ShaderMaterial
  private upMat: THREE.ShaderMaterial
  private compositeMat: THREE.ShaderMaterial
  private shocks: Shock[] = []
  private lastBeatCount = 0
  private kaleidoRotation = 0
  private wavePhase = 0
  private bgA = new THREE.Vector3()
  private bgB = new THREE.Vector3()
  private bgKey = ''
  private flashColor = new THREE.Vector3(1, 1, 1)
  private flashKey = ''

  constructor(renderer: THREE.WebGLRenderer, floatTargets: boolean) {
    this.renderer = renderer
    this.type = floatTargets ? THREE.HalfFloatType : THREE.UnsignedByteType
    this.sceneRT = this.createTarget(1, 1, 0)
    const geometry = new THREE.PlaneGeometry(2, 2)
    this.feedbackMat = createPassMaterial(fullscreenVert, feedbackFrag, {
      tScene: { value: null },
      tPrev: { value: null },
      uPersistence: { value: 0.8 },
      uZoom: { value: 0 },
      uRotate: { value: 0 },
      uHueShift: { value: 0 },
      uAspect: { value: 1 },
    })
    this.downMat = createPassMaterial(fullscreenVert, bloomDownFrag, {
      tSource: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uPrefilter: { value: 0 },
      uThreshold: { value: 0.2 },
      uKnee: { value: 0.1 },
    })
    this.upMat = createPassMaterial(
      fullscreenVert,
      bloomUpFrag,
      {
        tSource: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uRadius: { value: 1 },
        uWeight: { value: 1 },
      },
      true,
    )
    this.compositeMat = createPassMaterial(fullscreenVert, compositeFrag, {
      tScene: { value: null },
      tBloom: { value: null },
      uTime: { value: 0 },
      uAspect: { value: 1 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uKaleido: { value: 0 },
      uKaleidoSegments: { value: 6 },
      uKaleidoRotation: { value: 0 },
      uRadial: { value: 0 },
      uWaveAmount: { value: 0 },
      uWaveFreq: { value: 8 },
      uWavePhase: { value: 0 },
      uShock: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
      uChroma: { value: 0 },
      uBloom: { value: 0 },
      uBgStyle: { value: 0 },
      uBgA: { value: this.bgA },
      uBgB: { value: this.bgB },
      uBgDir: { value: new THREE.Vector2(0, 1) },
      uBgBoost: { value: 0 },
      uFlash: { value: new THREE.Vector3() },
      uExposure: { value: 1 },
      uContrast: { value: 1 },
      uSaturation: { value: 1 },
      uToneMap: { value: 0 },
      uVignette: { value: 0 },
      uVignetteSoft: { value: 0.5 },
      uGrain: { value: 0 },
      uFade: { value: 1 },
    })
    this.quad = new THREE.Mesh(geometry, this.compositeMat)
    this.quad.frustumCulled = false
    this.quadScene.add(this.quad)
  }

  private createTarget(w: number, h: number, samples: number) {
    return new THREE.WebGLRenderTarget(w, h, {
      type: this.type,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      samples,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      generateMipmaps: false,
    })
  }

  setSize(width: number, height: number, msaa: boolean) {
    const w = Math.max(1, Math.floor(width))
    const h = Math.max(1, Math.floor(height))
    if (w === this.width && h === this.height && msaa === this.msaa) return
    this.width = w
    this.height = h
    if (msaa !== this.msaa) {
      this.sceneRT.dispose()
      this.sceneRT = this.createTarget(w, h, msaa ? 4 : 0)
      this.msaa = msaa
    } else {
      this.sceneRT.setSize(w, h)
    }
    this.feedbackRT?.forEach((rt) => rt.setSize(w, h))
    this.mipConfig = ''
  }

  private ensureMips(levels: number, resolution: 'half' | 'quarter') {
    const key = `${this.width}x${this.height}|${levels}|${resolution}`
    if (key === this.mipConfig) return
    this.releaseMips()
    let w = Math.max(1, Math.floor(this.width / (resolution === 'half' ? 2 : 4)))
    let h = Math.max(1, Math.floor(this.height / (resolution === 'half' ? 2 : 4)))
    for (let i = 0; i < levels; i++) {
      this.mips.push(this.createTarget(w, h, 0))
      w = Math.max(1, Math.floor(w / 2))
      h = Math.max(1, Math.floor(h / 2))
    }
    this.mipConfig = key
  }

  private releaseMips() {
    this.mips.forEach((rt) => rt.dispose())
    this.mips = []
    this.mipConfig = ''
  }

  private pass(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null, clear = true) {
    this.quad.material = material
    this.renderer.setRenderTarget(target)
    if (clear) this.renderer.clear(true, false, false)
    this.renderer.render(this.quadScene, this.quadCamera)
  }

  render(scene: THREE.Scene, camera: THREE.Camera, settings: Settings, f: EffectsFrame) {
    const r = this.renderer
    const fx = settings.effects
    const perf = settings.performance
    const aspect = this.width / this.height

    r.setClearColor(0x000000, 0)
    r.setRenderTarget(this.sceneRT)
    r.clear(true, false, false)
    r.render(scene, camera)
    let source: THREE.Texture = this.sceneRT.texture

    // Trails / feedback.
    const useFeedback = fx.trails.enabled || fx.feedback.enabled
    if (useFeedback) {
      if (!this.feedbackRT) {
        this.feedbackRT = [this.createTarget(this.width, this.height, 0), this.createTarget(this.width, this.height, 0)]
        for (const rt of this.feedbackRT) {
          r.setRenderTarget(rt)
          r.clear(true, false, false)
        }
      }
      const read = this.feedbackRT[this.feedbackIndex]
      const write = this.feedbackRT[1 - this.feedbackIndex]
      const u = this.feedbackMat.uniforms
      const rate = Math.min(3, f.dt * 60)
      const persistence = fx.trails.enabled ? fx.trails.persistence : 0.86
      u.tScene.value = source
      u.tPrev.value = read.texture
      u.uPersistence.value = Math.pow(persistence, rate)
      u.uZoom.value = fx.feedback.enabled ? fx.feedback.zoom * rate * f.motion : 0
      u.uRotate.value = fx.feedback.enabled ? fx.feedback.rotation * rate * f.motion : 0
      u.uHueShift.value = fx.feedback.enabled ? fx.feedback.hueShift * rate : 0
      u.uAspect.value = aspect
      this.pass(this.feedbackMat, write)
      this.feedbackIndex = 1 - this.feedbackIndex
      source = write.texture
    } else if (this.feedbackRT) {
      this.feedbackRT.forEach((rt) => rt.dispose())
      this.feedbackRT = null
    }

    // Bloom.
    let bloom: THREE.Texture | null = null
    if (fx.bloom.enabled && fx.bloom.intensity > 0) {
      this.ensureMips(perf.bloomLevels, perf.bloomResolution)
      const d = this.downMat.uniforms
      d.uThreshold.value = fx.bloom.threshold
      d.uKnee.value = Math.max(0.05, fx.bloom.threshold * 0.6)
      let srcTex = source
      let srcW = this.width
      let srcH = this.height
      for (let i = 0; i < this.mips.length; i++) {
        d.tSource.value = srcTex
        ;(d.uTexel.value as THREE.Vector2).set(1 / srcW, 1 / srcH)
        d.uPrefilter.value = i === 0 ? 1 : 0
        this.pass(this.downMat, this.mips[i])
        srcTex = this.mips[i].texture
        srcW = this.mips[i].width
        srcH = this.mips[i].height
      }
      const up = this.upMat.uniforms
      up.uRadius.value = 1
      for (let i = this.mips.length - 1; i > 0; i--) {
        up.tSource.value = this.mips[i].texture
        ;(up.uTexel.value as THREE.Vector2).set(1 / this.mips[i].width, 1 / this.mips[i].height)
        up.uWeight.value = 0.35 + 0.65 * fx.bloom.radius
        this.pass(this.upMat, this.mips[i - 1], false)
      }
      bloom = this.mips[0]?.texture ?? null
    } else if (this.mips.length) {
      this.releaseMips()
    }

    // Shockwaves triggered by strong low-frequency beats.
    if (f.beatCount !== this.lastBeatCount) {
      if (fx.shockwave.enabled && f.motion > 0 && f.beatStrength > 0.2) {
        this.shocks.push({ start: f.time, strength: f.beatStrength })
        if (this.shocks.length > 4) this.shocks.shift()
      }
      this.lastBeatCount = f.beatCount
    }
    const life = 1.8 / Math.max(0.2, fx.shockwave.speed)
    this.shocks = this.shocks.filter((s) => f.time - s.start < life)
    const shockU = this.compositeMat.uniforms.uShock.value as THREE.Vector4[]
    for (let i = 0; i < 4; i++) {
      const s = this.shocks[i]
      if (s && fx.shockwave.enabled) {
        const age = f.time - s.start
        const fade = 1 - age / life
        shockU[i].set(age * fx.shockwave.speed * 0.7, s.strength * fx.shockwave.strength * fade * fade * 0.35, 0, 0)
      } else shockU[i].set(0, 0, 0, 0)
    }

    this.kaleidoRotation += fx.kaleidoscope.rotationSpeed * f.dt * f.motion
    this.wavePhase += fx.waveDistortion.speed * f.dt * f.motion * Math.PI * 2

    const c = this.compositeMat.uniforms
    c.tScene.value = source
    c.tBloom.value = bloom
    c.uTime.value = f.time
    c.uAspect.value = aspect
    ;(c.uResolution.value as THREE.Vector2).set(this.width, this.height)
    c.uKaleido.value = fx.kaleidoscope.enabled ? 1 : 0
    c.uKaleidoSegments.value = fx.kaleidoscope.segments
    c.uKaleidoRotation.value = this.kaleidoRotation
    c.uRadial.value = fx.radialDistortion.enabled
      ? fx.radialDistortion.amount * (1 + fx.radialDistortion.reactivity * f.bass * 2 * f.motion) * 0.6
      : 0
    c.uWaveAmount.value = fx.waveDistortion.enabled ? fx.waveDistortion.amount * (0.5 + f.overall) : 0
    c.uWaveFreq.value = fx.waveDistortion.frequency
    c.uWavePhase.value = this.wavePhase
    c.uChroma.value = fx.chromaticAberration.enabled
      ? fx.chromaticAberration.amount * 0.025 * (1 + fx.chromaticAberration.reactivity * f.overall * 2)
      : 0
    c.uBloom.value = bloom ? fx.bloom.intensity : 0

    const bg = settings.background
    const key = `${bg.colorA}|${bg.colorB}`
    if (key !== this.bgKey) {
      this.bgA.set(...hexToLinear(bg.colorA))
      this.bgB.set(...hexToLinear(bg.colorB))
      this.bgKey = key
    }
    c.uBgStyle.value = BG_STYLE[bg.style]
    const angle = (bg.angle * Math.PI) / 180
    ;(c.uBgDir.value as THREE.Vector2).set(Math.cos(angle), Math.sin(angle))
    c.uBgBoost.value = bg.reactivity * f.bass * 1.5
    const flash = fx.beatFlash.enabled ? fx.beatFlash.intensity * f.beat * f.motion * 0.25 : 0
    if (fx.beatFlash.color !== this.flashKey) {
      this.flashColor.set(...hexToLinear(fx.beatFlash.color))
      this.flashKey = fx.beatFlash.color
    }
    ;(c.uFlash.value as THREE.Vector3).copy(this.flashColor).multiplyScalar(flash)
    c.uExposure.value = settings.tone.exposure
    c.uContrast.value = settings.tone.contrast
    c.uSaturation.value = settings.tone.saturation
    c.uToneMap.value = TONE_MAP[settings.tone.toneMapping]
    c.uVignette.value = fx.vignette.enabled ? fx.vignette.amount : 0
    c.uVignetteSoft.value = fx.vignette.softness
    c.uGrain.value = fx.grain.enabled ? fx.grain.amount : 0
    this.pass(this.compositeMat, null)
  }

  dispose() {
    this.sceneRT.dispose()
    this.feedbackRT?.forEach((rt) => rt.dispose())
    this.releaseMips()
    this.feedbackMat.dispose()
    this.downMat.dispose()
    this.upMat.dispose()
    this.compositeMat.dispose()
    this.quad.geometry.dispose()
  }
}
