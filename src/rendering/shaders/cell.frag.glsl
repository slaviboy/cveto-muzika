uniform float uPixel;
uniform float uShape;     // 0 rounded rect, 1 circle, 2 diamond
uniform float uFillMode;  // 0 brightness, 1 fill from bottom, 2 fill from centre
uniform float uUnlit;
uniform float uLens;

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

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + vec2(r);
  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

void main() {
  float d;
  if (uShape > 1.5) {
    d = (abs(vLocal.x) / max(vHalf.x, 1e-6) + abs(vLocal.y) / max(vHalf.y, 1e-6) - 1.0) * min(vHalf.x, vHalf.y) * 0.7071;
  } else if (uShape > 0.5) {
    d = length(vLocal) - min(vHalf.x, vHalf.y);
  } else {
    d = sdRoundBox(vLocal, vHalf, min(vRadius, min(vHalf.x, vHalf.y)));
  }
  float aa = uPixel * 0.85;
  float cover = 1.0 - smoothstep(-aa, aa, d);
  float g = clamp(max(d, 0.0) / max(vHaloW, 1e-5), 0.0, 1.0);
  float halo = pow(1.0 - g, 2.6) * (1.0 - cover * 0.6);

  float lvl = max(vLevel, 0.0);
  float lit = 1.0;
  if (uFillMode > 1.5) {
    float edge = vFill * vHalf.y;
    lit = 1.0 - smoothstep(edge - aa, edge + aa, abs(vLocal.y));
    lvl = mix(0.0, max(lvl, 0.35), lit);
  } else if (uFillMode > 0.5) {
    float edge = -vHalf.y + 2.0 * vHalf.y * vFill;
    lit = 1.0 - smoothstep(edge - aa, edge + aa, vLocal.y);
    lvl = mix(0.0, max(lvl, 0.35), lit);
  }

  // Lens shading: brighter centre like a diffused LED.
  float r = length(vLocal / max(vHalf, vec2(1e-6)));
  float lens = mix(1.0, 1.25 - 0.45 * clamp(r, 0.0, 1.0), uLens);
  vec3 hot = mix(vColor, vec3(1.0), clamp(lvl - 0.9, 0.0, 0.6) * 0.3);
  float coreLum = uUnlit + 1.3 * lvl;
  float glowLum = 0.6 * lvl * vGlow * (uFillMode > 0.5 ? max(lit, 0.0) : 1.0);
  vec3 emission = hot * cover * coreLum * lens + vGlowColor * halo * glowLum;
  float alpha = clamp(max(cover, halo * lvl * 0.5), 0.0, 1.0) * vAlpha;
  gl_FragColor = vec4(emission * vAlpha, alpha * (1.0 - vAdd));
}
