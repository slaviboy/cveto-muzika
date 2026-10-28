import * as THREE from 'three'
import { createOrbMaterial } from '../rendering/ShaderMaterials'

/** Luminous centre piece for the ring mode: a breathing orb or emanating pulse rings. */
export class CenterOrb {
  readonly mesh: THREE.Mesh
  private material = createOrbMaterial()
  private geometry = new THREE.PlaneGeometry(1, 1)

  constructor() {
    this.mesh = new THREE.Mesh(this.geometry, this.material)
    this.mesh.frustumCulled = false
  }

  update(opts: {
    style: 'orb' | 'pulse'
    radius: number
    level: number
    beat: number
    time: number
    pixel: number
    colorA: [number, number, number]
    colorB: [number, number, number]
  }) {
    const u = this.material.uniforms
    u.uStyle.value = opts.style === 'orb' ? 1 : 2
    u.uRadius.value = opts.radius
    u.uExtent.value = opts.radius * (opts.style === 'orb' ? 3.2 : 2.4)
    u.uLevel.value = opts.level
    u.uBeat.value = opts.beat
    u.uTime.value = opts.time
    u.uPixel.value = opts.pixel
    ;(u.uColorA.value as THREE.Color).setRGB(...opts.colorA)
    ;(u.uColorB.value as THREE.Color).setRGB(...opts.colorB)
  }

  dispose() {
    this.geometry.dispose()
    this.material.dispose()
  }
}
