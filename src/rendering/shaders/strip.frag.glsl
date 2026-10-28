uniform float uPixel;
uniform float uPeakPass;
uniform float uGlowNorm;

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
  float d = abs(vSide) * vHalfTotal;
  float aa = uPixel * 0.75;
  float core = 1.0 - smoothstep(vHalfCore - aa, vHalfCore + aa, d);
  float g = clamp((d - vHalfCore) / max(vHalfTotal - vHalfCore - uPixel, 1e-5), 0.0, 1.0);
  float glow = pow(1.0 - g, 2.4);

  float lvl = max(vLevel, 0.0);
  // A white-hot core at high energy reads as emitted light rather than flat paint.
  vec3 hot = mix(vColor, vec3(1.0), clamp(lvl - 0.9, 0.0, 0.6) * 0.3);
  float coreLum = (0.1 + 1.35 * lvl) * vCoreFade;
  float glowLum = (0.02 + 0.5 * lvl) * vGlow * uGlowNorm;
  if (uPeakPass > 0.5) {
    coreLum *= 0.32;
    glowLum *= 0.25;
  }
  vec3 emission = hot * core * coreLum + vGlowColor * glow * glowLum;
  float alpha = clamp(max(core * vCoreFade, glow * 0.6), 0.0, 1.0) * vAlpha;
  gl_FragColor = vec4(emission * vAlpha, alpha * (1.0 - vAdd));
}
