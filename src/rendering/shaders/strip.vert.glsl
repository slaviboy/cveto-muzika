// Instanced closed strip: one instance = one ring / square outline (ring.glsl is prepended).
attribute float aU;     // perimeter position 0..1
attribute float aSide;  // -1 inner edge, +1 outer edge

attribute vec4 iGeom;   // radius (unit space), thickness (unit), rotation multiplier, z
attribute vec4 iColA;   // base rgb, opacity
attribute vec4 iColB;   // energy rgb, frequency position 0..1
attribute vec4 iColG;   // glow rgb, glow strength
attribute vec4 iMisc;   // additivity, phase, normalized index, rotation offset (radians)
attribute vec4 iDyn;    // intensity, peak, -, -

uniform float uThickReact;
uniform float uOpacityReact;
uniform float uGlowWidth;
uniform float uGlowTint;
uniform float uPeakPass;

varying float vSide;
varying float vHalfCore;
varying float vHalfTotal;
varying float vCoreFade;
varying vec3 vColor;
varying vec3 vGlowColor;
varying float vAlpha;
varying float vLevel;
varying float vGlow;
varying float vAdd;

void main() {
  float lvl = uPeakPass > 0.5 ? iDyn.y : iDyn.x;
  float clvl = clamp(lvl, 0.0, 1.5);
  float u = aU;
  float r = ringRadius(iGeom.x, clvl, u, iMisc.y, iMisc.z, iColB.w);

  float thick = iGeom.y * (1.0 + uThickReact * clvl);
  float glowW = uGlowWidth * iColG.w * (0.35 + clvl * 0.55);
  if (uPeakPass > 0.5) {
    thick = iGeom.y * 0.55;
    glowW *= 0.35;
  }
  float halfCoreActual = 0.5 * thick * uScale;
  float aa = uPixel;
  float halfCore = max(halfCoreActual, aa * 0.5);
  float halfTotal = halfCore + glowW * uScale + aa * 1.5;

  float rot = uRotation * iGeom.z + iMisc.w;
  vec2 p = ringPoint(u, r * uScale + aSide * halfTotal, rot, clvl);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, iGeom.w, 1.0);

  vec3 col = ringColor(iColA.rgb, iColB.rgb, clvl, u, rot);
  vSide = aSide;
  vHalfCore = halfCore;
  vHalfTotal = halfTotal;
  vCoreFade = clamp(halfCoreActual / max(aa * 0.5, 1e-6), 0.15, 1.0);
  vColor = col;
  vGlowColor = mixOklab(col, iColG.rgb, uGlowTint);
  vAlpha = iColA.a * mix(1.0, clamp(clvl * 1.3 + 0.1, 0.0, 1.0), uOpacityReact);
  vLevel = lvl;
  vGlow = iColG.w;
  vAdd = iMisc.x;
}
