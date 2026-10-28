// Instanced SDF cell: LEDs, bars, bar segments, tiles and matrix dots.
attribute vec4 iRect;   // center xy (world), size xy (world)
attribute vec4 iColA;   // base rgb, opacity
attribute vec4 iColB;   // energy rgb, angular/spatial coordinate 0..1 (rainbow)
attribute vec4 iColG;   // glow rgb, glow strength
attribute vec4 iMisc;   // additivity, corner radius (0..0.5 of min size), cell rotation, layout-rotation multiplier
attribute vec4 iDyn;    // intensity, fill 0..1, scale multiplier, peak marker flag

uniform float uTime;
uniform float uPixel;
uniform float uRotation;
uniform float uHalo;
uniform float uEnergyMix;
uniform float uGlowTint;
uniform float uRainbow;
uniform float uDisplace;
uniform float uDisplaceScale;
uniform float uPulse;

varying vec2 vLocal;
varying vec2 vHalf;
varying float vRadius;
varying vec3 vColor;
varying vec3 vGlowColor;
varying float vAlpha;
varying float vLevel;
varying float vFill;
varying float vGlow;
varying float vAdd;
varying float vHaloW;

void main() {
  float lvl = iDyn.x;
  float scale = iDyn.z * (1.0 + uPulse);
  vec2 halfSize = 0.5 * iRect.zw * scale;
  float minHalf = min(halfSize.x, halfSize.y);
  float haloW = uHalo * minHalf * 2.0 * iColG.w + uPixel * 1.5;
  vec2 ext = halfSize + vec2(haloW);
  vec2 local = position.xy * 2.0 * ext;

  float cr = cos(iMisc.z);
  float sr = sin(iMisc.z);
  vec2 p = vec2(cr * local.x - sr * local.y, sr * local.x + cr * local.y) + iRect.xy;

  if (uDisplace > 0.0) {
    vec2 q = iRect.xy * uDisplaceScale;
    vec2 n = vec2(valueNoise(q + uTime * 0.35), valueNoise(q - uTime * 0.29 + 7.7)) - 0.5;
    p += n * uDisplace * (0.25 + clamp(lvl, 0.0, 1.5));
  }

  float rot = uRotation * iMisc.w;
  float c = cos(rot);
  float s = sin(rot);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 0.0, 1.0);

  vec3 col = mixOklab(iColA.rgb, iColB.rgb, clamp(lvl, 0.0, 1.0) * uEnergyMix);
  if (uRainbow > 0.0) col = hueRotate(col, uRainbow * TAU * iColB.w);
  vLocal = local;
  vHalf = halfSize;
  vRadius = iMisc.y * 2.0 * minHalf;
  vColor = col;
  vGlowColor = mixOklab(col, iColG.rgb, uGlowTint);
  vAlpha = iColA.a;
  vLevel = lvl;
  vFill = iDyn.y;
  vGlow = iColG.w;
  vAdd = iMisc.x;
  vHaloW = haloW;
}
