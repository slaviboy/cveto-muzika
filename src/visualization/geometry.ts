import * as THREE from 'three'

/**
 * Closed strip with `segments` quads around a perimeter. Each vertex carries its perimeter
 * position `aU` (0..1) and side `aSide` (±1); the strip shader turns those into a circle or a
 * constant-thickness square. `segments` is rounded to a multiple of 4 so square corners land
 * exactly on vertices.
 */
export function createLoopStripGeometry(segments: number): THREE.InstancedBufferGeometry {
  const s = Math.max(16, Math.ceil(segments / 4) * 4)
  const g = new THREE.InstancedBufferGeometry()
  const verts = (s + 1) * 2
  const aU = new Float32Array(verts)
  const aSide = new Float32Array(verts)
  for (let i = 0; i <= s; i++) {
    aU[i * 2] = i / s
    aU[i * 2 + 1] = i / s
    aSide[i * 2] = -1
    aSide[i * 2 + 1] = 1
  }
  const index: number[] = []
  for (let i = 0; i < s; i++) {
    const a = i * 2
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  g.setIndex(index)
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3))
  g.setAttribute('aU', new THREE.BufferAttribute(aU, 1))
  g.setAttribute('aSide', new THREE.BufferAttribute(aSide, 1))
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)
  return g
}

/** Unit quad (-0.5..0.5) for instanced cells. */
export function createQuadGeometry(): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry()
  const plane = new THREE.PlaneGeometry(1, 1)
  g.index = plane.index
  g.setAttribute('position', plane.getAttribute('position'))
  g.setAttribute('uv', plane.getAttribute('uv'))
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)
  return g
}

export interface InstanceAttributes {
  [name: string]: THREE.InstancedBufferAttribute
}

/** Adds vec4 instance attributes (static ones get StaticDraw, dynamic ones DynamicDraw). */
export function addInstanceAttributes(
  g: THREE.InstancedBufferGeometry,
  count: number,
  staticNames: string[],
  dynamicNames: string[],
): InstanceAttributes {
  const out: InstanceAttributes = {}
  for (const name of staticNames) {
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 4), 4)
    g.setAttribute(name, attr)
    out[name] = attr
  }
  for (const name of dynamicNames) {
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 4), 4)
    attr.setUsage(THREE.DynamicDrawUsage)
    g.setAttribute(name, attr)
    out[name] = attr
  }
  g.instanceCount = count
  return out
}
