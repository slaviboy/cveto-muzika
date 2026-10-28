uniform float uTime;
uniform float uLevel;
uniform float uBeat;
uniform float uStyle;     // 1 orb, 2 pulse
uniform float uRadius;    // world
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uPixel;

varying vec2 vUv;
varying vec2 vWorld;

void main() {
  float r = length(vWorld);
  float rad = uRadius * (1.0 + uLevel * 0.35 + uBeat * 0.12);
  vec3 col;
  if (uStyle < 1.5) {
    float ang = atan(vWorld.y, vWorld.x);
    float n = valueNoise(vec2(ang * 2.0 + uTime * 0.3, r * 18.0 - uTime * 0.8));
    float edge = rad * (1.0 + (n - 0.5) * 0.18 * (0.3 + uLevel));
    float body = 1.0 - smoothstep(edge - uPixel * 1.5, edge + uPixel * 1.5, r);
    float inner = clamp(1.0 - r / max(edge, 1e-5), 0.0, 1.0);
    float halo = exp(-max(r - edge, 0.0) / (rad * 0.55)) * (1.0 - body);
    col = mix(uColorA, uColorB, pow(inner, 1.5)) * body * (0.18 + 0.95 * uLevel) * (0.55 + 0.5 * inner);
    col += uColorA * halo * (0.04 + 0.3 * uLevel);
  } else {
    float w = rad * 0.08 + uPixel;
    float rings = 0.0;
    for (int i = 0; i < 4; i++) {
      float phase = fract(uTime * 0.45 + float(i) * 0.25);
      float rr = rad * (0.2 + phase * 1.6);
      rings += (1.0 - smoothstep(0.0, w, abs(r - rr))) * (1.0 - phase) * (0.3 + uLevel);
    }
    float core = 1.0 - smoothstep(rad * 0.18 - uPixel, rad * 0.18 + uPixel, r);
    col = mix(uColorA, uColorB, 0.5) * (rings * 0.9 + core * (0.4 + 1.5 * uLevel));
  }
  gl_FragColor = vec4(col, 0.0);
}
