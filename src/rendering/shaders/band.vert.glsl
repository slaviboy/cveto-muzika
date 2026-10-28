// Instanced filled band between two neighbouring rings A (inner) and B (outer); ring.glsl is prepended.
attribute float aU;     // perimeter position 0..1
attribute float aSide;  // -1 = ring A edge, +1 = ring B edge

attribute vec4 iRingA;  // base radius, rotation multiplier, phase, normalized index
attribute vec4 iRingB;
attribute vec4 iColA;   // base rgb, opacity
attribute vec4 iColB;
attribute vec4 iEngA;   // energy rgb, frequency position
attribute vec4 iEngB;
attribute vec4 iMisc;   // additivity, z of A, z of B, separator (1 between two real rings)
attribute vec4 iDyn;    // intensity A, intensity B, centre-fill flag, outer-edge flag

varying float vT;
varying vec3 vColA;
varying vec3 vColB;
varying float vLvlA;
varying float vLvlB;
varying float vAlphaA;
varying float vAlphaB;
varying float vSep;
varying float vCenter;
varying float vOuter;
varying float vAdd;

void main() {
  bool atB = aSide > 0.0;
  float lvlA = clamp(iDyn.x, 0.0, 1.5);
  float lvlB = clamp(iDyn.y, 0.0, 1.5);
  vec4 ring = atB ? iRingB : iRingA;
  float lvl = atB ? lvlB : lvlA;
  float freqPos = atB ? iEngB.w : iEngA.w;
  float rot = uRotation * ring.y;

  // The centre fill collapses its inner edge to a point; every other edge follows its ring exactly.
  float r = (!atB && iDyn.z > 0.5) ? 0.0 : ringRadius(ring.x, lvl, aU, ring.z, ring.w, freqPos);
  vec2 p = ringPoint(aU, r * uScale, rot, lvl);
  float z = atB ? iMisc.z : iMisc.y;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, z, 1.0);

  vColA = ringColor(iColA.rgb, iEngA.rgb, lvlA, aU, uRotation * iRingA.y);
  vColB = ringColor(iColB.rgb, iEngB.rgb, lvlB, aU, uRotation * iRingB.y);
  vLvlA = lvlA;
  vLvlB = lvlB;
  vAlphaA = iColA.a;
  vAlphaB = iColB.a;
  vT = atB ? 1.0 : 0.0;
  vSep = iMisc.w;
  vCenter = iDyn.z;
  vOuter = iDyn.w;
  vAdd = iMisc.x;
}
