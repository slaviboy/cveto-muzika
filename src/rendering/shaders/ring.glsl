// Shared ring geometry for the line and band shaders. Both evaluate the same functions with the
// same per-ring parameters, so a band's edge lands exactly on the ring it touches.
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
uniform float uPulse;
uniform float uDisplace;
uniform float uDisplaceScale;
uniform float uColorStyle;     // 0 channel/radial (CPU), 2 angular palette, 3 energy palette
uniform sampler2D uLut;
uniform float uEnergyMix;

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

/** Ring radius in unit space at perimeter position u, including reaction, distortion and spectrum warp. */
float ringRadius(float baseR, float lvl, float u, float phase, float idxNorm, float freqPos) {
  float su = uMirror > 0.5 ? 1.0 - abs(2.0 * fract(u + 0.25) - 1.0) : fract(u);
  float spec = texture(uSpectrum, vec2(clamp(freqPos + (su - 0.5) * 0.35, 0.0, 1.0), 0.5)).r;
  float angle = (uMirror > 0.5 ? su * 0.5 : u) * TAU;
  float wobble = sin(uLobes * angle + uDistPhase * (1.0 + idxNorm * 0.6) + phase);
  float distort = uDistortion * (0.2 + lvl) * wobble;
  float warp = uSpectrumWarp * spec * (0.35 + lvl);
  float radius = (baseR + uRadiusReact * lvl) * (1.0 + uPulse);
  return max(0.0, radius + distort + warp);
}

/** World position of perimeter point u on a ring of world radius rWorld, rotated and displaced. */
vec2 ringPoint(float u, float rWorld, float rot, float lvl) {
  vec2 p = shapePoint(u) * rWorld;
  float c = cos(rot);
  float s = sin(rot);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  if (uDisplace > 0.0) {
    vec2 q = p * uDisplaceScale;
    vec2 n = vec2(valueNoise(q + uTime * 0.31), valueNoise(q - uTime * 0.27 + 17.3)) - 0.5;
    p += n * uDisplace * (0.3 + lvl) * uScale;
  }
  return p;
}

/** Ring color: CPU base color or a palette lookup, pulled toward the energy color as it gets louder. */
vec3 ringColor(vec3 base, vec3 energy, float lvl, float u, float rot) {
  vec3 col = base;
  if (uColorStyle > 2.5) {
    col = texture(uLut, vec2(clamp(lvl, 0.0, 1.0) * 0.98 + 0.01, 0.5)).rgb;
  } else if (uColorStyle > 1.5) {
    col = texture(uLut, vec2(fract(u + rot / TAU), 0.5)).rgb;
  }
  return mixOklab(col, energy, clamp(lvl, 0.0, 1.0) * uEnergyMix);
}
