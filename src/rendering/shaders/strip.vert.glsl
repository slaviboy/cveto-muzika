// Instanced closed strip: one instance = one ring / square outline.
attribute float aU;     // perimeter position 0..1
attribute float aSide;  // -1 inner edge, +1 outer edge

attribute vec4 iGeom;   // radius (unit space), thickness (unit), rotation multiplier, z
attribute vec4 iColA;   // base rgb, opacity
attribute vec4 iColB;   // energy rgb, frequency position 0..1
attribute vec4 iColG;   // glow rgb, glow strength
attribute vec4 iMisc;   // additivity, phase, normalized index, rotation offset (radians)
attribute vec4 iDyn;    // intensity, peak, -, -

uniform float uTime;
uniform float uScale;
uniform float uPixel;
uniform float uRotation;
uniform float uShape;          // 0 circle, 1 square
uniform float uMirror;
uniform float uDistortion;
uniform float uLobes;
uniform float uDistPhase;
uniform float uSpectrumWarp;
uniform sampler2D uSpectrum;
uniform float uRadiusReact;
uniform float uThickReact;
uniform float uOpacityReact;
uniform float uGlowWidth;
uniform float uColorStyle;     // 0 channel/radial (CPU), 2 angular palette, 3 energy palette
uniform sampler2D uLut;
uniform float uEnergyMix;
uniform float uGlowTint;
uniform float uPeakPass;
uniform float uDisplace;
uniform float uDisplaceScale;
uniform float uPulse;

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

vec2 shapePoint(float u) {
  if (uShape < 0.5) {
    float a = u * TAU;
    return vec2(cos(a), sin(a));
  }
  float s = fract(u) * 4.0;
  float side = floor(s);
  float t = fract(s) * 2.0 - 1.0;
  if (side < 0.5) return vec2(1.0, t);
  if (side < 1.5) return vec2(-t, 1.0);
  if (side < 2.5) return vec2(-1.0, -t);
  return vec2(t, -1.0);
}

void main() {
  float intensity = iDyn.x;
  float lvl = uPeakPass > 0.5 ? iDyn.y : intensity;
  float clvl = clamp(lvl, 0.0, 1.5);

  float u = aU;
  float su = uMirror > 0.5 ? 1.0 - abs(2.0 * fract(u + 0.25) - 1.0) : fract(u);
  float specPos = clamp(iColB.w + (su - 0.5) * 0.35, 0.0, 1.0);
  float spec = texture(uSpectrum, vec2(specPos, 0.5)).r;

  float angle = (uMirror > 0.5 ? su * 0.5 : u) * TAU;
  float wobble = sin(uLobes * angle + uDistPhase * (1.0 + iMisc.z * 0.6) + iMisc.y);
  float distort = uDistortion * (0.2 + clvl) * wobble;
  float warp = uSpectrumWarp * spec * (0.35 + clvl);

  float radius = (iGeom.x + uRadiusReact * clvl) * (1.0 + uPulse);
  float r = max(0.0, radius + distort + warp);

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
  float cr = cos(rot);
  float sr = sin(rot);
  vec2 dir = shapePoint(u);
  vec2 p = dir * (r * uScale + aSide * halfTotal);
  p = vec2(cr * p.x - sr * p.y, sr * p.x + cr * p.y);

  if (uDisplace > 0.0) {
    vec2 q = p * uDisplaceScale;
    vec2 n = vec2(valueNoise(q + uTime * 0.31), valueNoise(q - uTime * 0.27 + 17.3)) - 0.5;
    p += n * uDisplace * (0.3 + clvl) * uScale;
  }

  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, iGeom.w, 1.0);

  vec3 col = iColA.rgb;
  if (uColorStyle > 2.5) {
    col = texture(uLut, vec2(clamp(clvl, 0.0, 1.0) * 0.98 + 0.01, 0.5)).rgb;
  } else if (uColorStyle > 1.5) {
    col = texture(uLut, vec2(fract(u + rot / TAU), 0.5)).rgb;
  }
  col = mixOklab(col, iColB.rgb, clamp(clvl, 0.0, 1.0) * uEnergyMix);

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
