import * as THREE from 'three'
import { createParticleMaterial } from '../rendering/ShaderMaterials'

/** Deterministic PRNG so the dust field keeps its layout across rebuilds. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Luminous dust: GPU-animated points tinted from the frequency palette. */
export class ParticleField {
  readonly points: THREE.Points
  private geometry = new THREE.BufferGeometry()
  private material: ReturnType<typeof createParticleMaterial>
  private count = 0

  constructor(lut: THREE.Texture) {
    this.material = createParticleMaterial(lut)
    this.points = new THREE.Points(this.geometry, this.material)
    this.points.frustumCulled = false
    this.points.renderOrder = 0
  }

  setCount(count: number) {
    const n = Math.max(0, Math.floor(count))
    if (n === this.count) return
    this.count = n
    const rand = mulberry32(1337)
    const seeds = new Float32Array(Math.max(1, n) * 4)
    for (let i = 0; i < seeds.length; i++) seeds[i] = rand()
    this.geometry.dispose()
    this.geometry = new THREE.BufferGeometry()
    this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(Math.max(1, n) * 3), 3))
    this.geometry.setDrawRange(0, n)
    this.points.geometry = this.geometry
  }

  update(opts: {
    time: number
    width: number
    height: number
    depth: number
    size: number
    pixelRatio: number
    speed: number
    bass: number
    energy: number
    reactivity: number
    amount: number
  }) {
    const u = this.material.uniforms
    u.uTime.value = opts.time
    ;(u.uExtent.value as THREE.Vector2).set(opts.width / 2 + 0.05, opts.height / 2 + 0.05)
    u.uDepth.value = opts.depth
    u.uSize.value = opts.size * 2.2
    u.uPixelRatio.value = opts.pixelRatio
    u.uSpeed.value = opts.speed
    u.uBass.value = opts.bass
    u.uEnergy.value = opts.energy
    u.uReact.value = opts.reactivity
    u.uAmount.value = opts.amount
    this.points.visible = this.count > 0 && opts.amount > 0
  }

  dispose() {
    this.geometry.dispose()
    this.material.dispose()
  }
}
