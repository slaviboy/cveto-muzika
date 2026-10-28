uniform float uBandMode;     // 0 touching rings, 1 merged
uniform float uGap;          // separator width between touching rings (fraction of the band)
uniform float uBandGain;
uniform float uOpacityReact;

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
  float t = clamp(vT, 0.0, 1.0);
  float w = max(fwidth(vT), 1e-4) * 1.2;

  // Touching rings switch color at the midpoint between centres; merged rings blend smoothly
  // from one centre to the next, so the color follows the distance from the centre.
  float k = uBandMode < 0.5 ? smoothstep(0.5 - w, 0.5 + w, t) : t * t * (3.0 - 2.0 * t);
  vec3 col = mixOklab(vColA, vColB, k);
  float lvl = mix(vLvlA, vLvlB, k);
  float alpha = mix(vAlphaA, vAlphaB, k) * mix(1.0, clamp(lvl * 1.3 + 0.15, 0.0, 1.0), uOpacityReact * 0.5);
  float lum = (0.05 + 0.8 * lvl) * uBandGain;

  if (uBandMode > 0.5) {
    // A gentle crest at each ring centre keeps the individual rings legible inside the blend.
    float crest = 1.0 - 4.0 * t * (1.0 - t);
    lum *= 0.82 + 0.3 * crest;
    if (vCenter > 0.5) lum *= mix(0.55, 1.0, t);
    if (vOuter > 0.5) alpha *= 1.0 - smoothstep(0.0, 1.0, t);
  } else {
    // Each ring is a softly shaded tube: brightest at its own centre line.
    float own = vCenter > 0.5 ? 1.0 - t : vOuter > 0.5 ? t : min(t, 1.0 - t);
    lum *= 1.0 - 0.38 * smoothstep(0.0, 0.5, own);
    if (vSep > 0.5) {
      float g = uGap * 0.5;
      alpha *= smoothstep(g, g + w, abs(t - 0.5));
    }
    if (vOuter > 0.5) alpha *= 1.0 - smoothstep(1.0 - w, 1.0, t);
  }
  gl_FragColor = vec4(col * lum * alpha, alpha * (1.0 - vAdd));
}
