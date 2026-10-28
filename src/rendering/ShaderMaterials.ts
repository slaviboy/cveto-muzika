import * as THREE from 'three'
import common from './shaders/common.glsl?raw'
import stripVert from './shaders/strip.vert.glsl?raw'
import stripFrag from './shaders/strip.frag.glsl?raw'
import cellVert from './shaders/cell.vert.glsl?raw'
import cellFrag from './shaders/cell.frag.glsl?raw'
import particlesVert from './shaders/particles.vert.glsl?raw'
import particlesFrag from './shaders/particles.frag.glsl?raw'
import orbVert from './shaders/orb.vert.glsl?raw'
import orbFrag from './shaders/orb.frag.glsl?raw'

/**
 * Premultiplied-alpha blending: out = src + dst·(1 − srcα). A fragment writing α = 0 is purely
 * additive, α = coverage is normal "over" — so per-instance blend modes share one draw call.
 */
function premultipliedBlend(material: THREE.ShaderMaterial) {
  material.blending = THREE.CustomBlending
  material.blendEquation = THREE.AddEquation
  material.blendSrc = THREE.OneFactor
  material.blendDst = THREE.OneMinusSrcAlphaFactor
  material.blendSrcAlpha = THREE.OneFactor
  material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor
  material.transparent = true
  material.depthWrite = false
  material.depthTest = false
  return material
}

const u = <T>(value: T) => ({ value })

export function createStripMaterial(spectrum: THREE.Texture, lut: THREE.Texture) {
  return premultipliedBlend(
    new THREE.ShaderMaterial({
      vertexShader: common + stripVert,
      fragmentShader: common + stripFrag,
      uniforms: {
        uTime: u(0),
        uScale: u(1),
        uPixel: u(0.002),
        uRotation: u(0),
        uShape: u(0),
        uMirror: u(0),
        uDistortion: u(0),
        uLobes: u(0),
        uDistPhase: u(0),
        uSpectrumWarp: u(0),
        uSpectrum: u(spectrum),
        uRadiusReact: u(0),
        uThickReact: u(0),
        uOpacityReact: u(0),
        uGlowWidth: u(0),
        uColorStyle: u(0),
        uLut: u(lut),
        uEnergyMix: u(0),
        uGlowTint: u(0),
        uPeakPass: u(0),
        uGlowNorm: u(1),
        uDisplace: u(0),
        uDisplaceScale: u(4),
        uPulse: u(0),
      },
    }),
  )
}

export type StripMaterial = ReturnType<typeof createStripMaterial>

export function createCellMaterial() {
  return premultipliedBlend(
    new THREE.ShaderMaterial({
      vertexShader: common + cellVert,
      fragmentShader: common + cellFrag,
      uniforms: {
        uTime: u(0),
        uPixel: u(0.002),
        uRotation: u(0),
        uHalo: u(0.5),
        uEnergyMix: u(0),
        uGlowTint: u(0),
        uRainbow: u(0),
        uDisplace: u(0),
        uDisplaceScale: u(4),
        uPulse: u(0),
        uShape: u(0),
        uFillMode: u(0),
        uUnlit: u(0.04),
        uLens: u(0),
      },
    }),
  )
}

export type CellMaterial = ReturnType<typeof createCellMaterial>

export function createParticleMaterial(lut: THREE.Texture) {
  const m = new THREE.ShaderMaterial({
    vertexShader: common + particlesVert,
    fragmentShader: common + particlesFrag,
    uniforms: {
      uTime: u(0),
      uExtent: u(new THREE.Vector2(1, 1)),
      uDepth: u(0),
      uSize: u(2),
      uPixelRatio: u(1),
      uSpeed: u(1),
      uBass: u(0),
      uEnergy: u(0),
      uReact: u(1),
      uAmount: u(0.5),
      uLut: u(lut),
    },
  })
  return premultipliedBlend(m)
}

export function createOrbMaterial() {
  return premultipliedBlend(
    new THREE.ShaderMaterial({
      vertexShader: common + orbVert,
      fragmentShader: common + orbFrag,
      uniforms: {
        uExtent: u(0.3),
        uTime: u(0),
        uLevel: u(0),
        uBeat: u(0),
        uStyle: u(1),
        uRadius: u(0.1),
        uColorA: u(new THREE.Color(1, 1, 1)),
        uColorB: u(new THREE.Color(1, 1, 1)),
        uPixel: u(0.002),
      },
    }),
  )
}

/** Full-screen pass material (no blending unless requested). */
export function createPassMaterial(vertexShader: string, fragmentShader: string, uniforms: Record<string, THREE.IUniform>, additive = false) {
  const m = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: common + fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
  })
  if (additive) {
    m.blending = THREE.AdditiveBlending
    m.transparent = true
  } else {
    m.blending = THREE.NoBlending
  }
  return m
}

/** 1D half-float texture for spectra / LUTs (linear filtering is always supported for half floats). */
export function createDataTexture1D(width: number, channels: 1 | 4) {
  const data = new Uint16Array(width * channels)
  const format = channels === 1 ? THREE.RedFormat : THREE.RGBAFormat
  const tex = new THREE.DataTexture(data, width, 1, format, THREE.HalfFloatType)
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}

export function writeHalfFloat(tex: THREE.DataTexture, values: ArrayLike<number>) {
  const data = tex.image.data as Uint16Array
  const n = Math.min(data.length, values.length)
  for (let i = 0; i < n; i++) data[i] = THREE.DataUtils.toHalfFloat(values[i])
  tex.needsUpdate = true
}
