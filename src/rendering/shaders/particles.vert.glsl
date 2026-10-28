// Stateless GPU particles: positions are a pure function of seed and time, so nothing is updated on the CPU.
attribute vec4 aSeed;

uniform float uTime;
uniform vec2 uExtent;      // half width/height of the field (world)
uniform float uDepth;
uniform float uSize;       // pixels
uniform float uPixelRatio;
uniform float uSpeed;
uniform float uBass;
uniform float uEnergy;
uniform float uReact;
uniform float uAmount;
uniform sampler2D uLut;

varying vec3 vColor;
varying float vAlpha;

void main() {
  float t = uTime * uSpeed;
  vec2 base = (aSeed.xy * 2.0 - 1.0) * uExtent;
  vec2 drift = vec2(
    sin(t * 0.13 + aSeed.w * TAU + base.y * 1.7),
    cos(t * 0.11 + aSeed.z * TAU + base.x * 1.3)
  ) * 0.18;
  drift += vec2(t * 0.012 * (aSeed.z - 0.5), t * 0.02 * (0.4 + aSeed.w));
  vec2 p = mod(base + drift + uExtent, uExtent * 2.0) - uExtent;
  float r = length(p);
  p += (r > 1e-4 ? p / r : vec2(0.0)) * uBass * uReact * 0.06 * (0.5 + aSeed.z);
  float z = (aSeed.z - 0.5) * uDepth;

  vec4 mv = modelViewMatrix * vec4(p, z, 1.0);
  gl_Position = projectionMatrix * mv;
  float twinkle = 0.55 + 0.45 * sin(uTime * (1.2 + aSeed.w * 2.5) + aSeed.x * 40.0);
  gl_PointSize = uSize * uPixelRatio * (0.5 + aSeed.w) * (1.0 + uBass * uReact * 0.6);
  vColor = mix(texture(uLut, vec2(aSeed.y, 0.5)).rgb, vec3(0.9), 0.35);
  float edge = smoothstep(uExtent.x, uExtent.x * 0.7, abs(p.x)) * smoothstep(uExtent.y, uExtent.y * 0.7, abs(p.y));
  vAlpha = uAmount * twinkle * edge * (0.12 + uEnergy * uReact * 0.9) * step(aSeed.z, uAmount * 1.2 + 0.05);
}
