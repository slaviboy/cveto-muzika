/** Full-screen post-processing shaders. three compiles ShaderMaterial as GLSL ES 3.00 and aliases gl_FragColor. */

export const fullscreenVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

/** Trails / feedback: max(scene, transformed previous frame × persistence), optional hue drift. */
export const feedbackFrag = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tPrev;
uniform float uPersistence;
uniform float uZoom;
uniform float uRotate;
uniform float uHueShift;
uniform float uAspect;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float c = cos(uRotate);
  float s = sin(uRotate);
  p = mat2(c, s, -s, c) * p / (1.0 + uZoom);
  vec2 uv = p / vec2(uAspect, 1.0) + 0.5;
  vec4 prev = texture(tPrev, uv);
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) prev = vec4(0.0);
  vec3 pc = prev.rgb;
  if (abs(uHueShift) > 0.0) pc = hueRotate(pc, uHueShift);
  vec4 scene = texture(tScene, vUv);
  vec3 col = max(scene.rgb, pc * uPersistence);
  gl_FragColor = vec4(col, max(scene.a, prev.a * uPersistence));
}
`

/** 13-tap downsample (Jimenez 2014). The first pass also applies a soft-knee threshold. */
export const bloomDownFrag = /* glsl */ `
uniform sampler2D tSource;
uniform vec2 uTexel;
uniform float uPrefilter;
uniform float uThreshold;
uniform float uKnee;
varying vec2 vUv;

vec3 prefilter(vec3 c) {
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-5);
  float contrib = max(soft, br - uThreshold) / max(br, 1e-5);
  return c * contrib;
}

void main() {
  vec2 t = uTexel;
  vec3 a = texture(tSource, vUv + t * vec2(-2.0, 2.0)).rgb;
  vec3 b = texture(tSource, vUv + t * vec2(0.0, 2.0)).rgb;
  vec3 c = texture(tSource, vUv + t * vec2(2.0, 2.0)).rgb;
  vec3 d = texture(tSource, vUv + t * vec2(-2.0, 0.0)).rgb;
  vec3 e = texture(tSource, vUv).rgb;
  vec3 f = texture(tSource, vUv + t * vec2(2.0, 0.0)).rgb;
  vec3 g = texture(tSource, vUv + t * vec2(-2.0, -2.0)).rgb;
  vec3 h = texture(tSource, vUv + t * vec2(0.0, -2.0)).rgb;
  vec3 i = texture(tSource, vUv + t * vec2(2.0, -2.0)).rgb;
  vec3 j = texture(tSource, vUv + t * vec2(-1.0, 1.0)).rgb;
  vec3 k = texture(tSource, vUv + t * vec2(1.0, 1.0)).rgb;
  vec3 l = texture(tSource, vUv + t * vec2(-1.0, -1.0)).rgb;
  vec3 m = texture(tSource, vUv + t * vec2(1.0, -1.0)).rgb;
  vec3 col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  if (uPrefilter > 0.5) {
    col = prefilter(col);
    // Karis-style luma weighting suppresses single-pixel fireflies.
    col /= 1.0 + luma(col) * 0.25;
  }
  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
}
`

/** 9-tap tent upsample, blended additively into the next larger mip. */
export const bloomUpFrag = /* glsl */ `
uniform sampler2D tSource;
uniform vec2 uTexel;
uniform float uRadius;
uniform float uWeight;
varying vec2 vUv;
void main() {
  vec2 t = uTexel * uRadius;
  vec3 s = texture(tSource, vUv).rgb * 4.0;
  s += texture(tSource, vUv + vec2(-t.x, 0.0)).rgb * 2.0;
  s += texture(tSource, vUv + vec2(t.x, 0.0)).rgb * 2.0;
  s += texture(tSource, vUv + vec2(0.0, -t.y)).rgb * 2.0;
  s += texture(tSource, vUv + vec2(0.0, t.y)).rgb * 2.0;
  s += texture(tSource, vUv + vec2(-t.x, -t.y)).rgb;
  s += texture(tSource, vUv + vec2(t.x, -t.y)).rgb;
  s += texture(tSource, vUv + vec2(-t.x, t.y)).rgb;
  s += texture(tSource, vUv + vec2(t.x, t.y)).rgb;
  gl_FragColor = vec4(s / 16.0 * uWeight, 1.0);
}
`

/**
 * Final composite: UV effects (kaleidoscope, radial/wave distortion, shockwaves) → chromatic
 * aberration → bloom → background under the premultiplied scene → flash → exposure, tone mapping,
 * contrast/saturation → vignette → grain → sRGB encode → dither.
 */
export const compositeFrag = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float uTime;
uniform float uAspect;
uniform vec2 uResolution;

uniform float uKaleido;
uniform float uKaleidoSegments;
uniform float uKaleidoRotation;
uniform float uRadial;
uniform float uWaveAmount;
uniform float uWaveFreq;
uniform float uWavePhase;
uniform vec4 uShock[4];
uniform float uChroma;
uniform float uBloom;
uniform float uBgStyle;
uniform vec3 uBgA;
uniform vec3 uBgB;
uniform vec2 uBgDir;
uniform float uBgBoost;
uniform vec3 uFlash;
uniform float uExposure;
uniform float uContrast;
uniform float uSaturation;
uniform float uToneMap;
uniform float uVignette;
uniform float uVignetteSoft;
uniform float uGrain;
uniform float uFade;
varying vec2 vUv;

vec3 agx(vec3 c) {
  // Minimal AgX fit (Benjamin Wrensch), base contrast, followed by the inverse outset.
  const mat3 inset = mat3(0.842479062253094, 0.0423282422610123, 0.0423756549057051,
                          0.0784335999999992, 0.878468636469772, 0.0784336,
                          0.0792237451477643, 0.0791661274605434, 0.879142973793104);
  const mat3 outset = mat3(1.19687900512017, -0.0528968517574562, -0.0529716355144438,
                           -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
                           -0.0990297440797205, -0.0989611768448433, 1.15107367264116);
  c = inset * max(c, vec3(1e-10));
  c = clamp((log2(c) + 12.47393) / 16.5, 0.0, 1.0);
  vec3 x2 = c * c;
  vec3 x4 = x2 * x2;
  c = 15.5 * x4 * x2 - 40.14 * x4 * c + 31.96 * x4 - 6.868 * x2 * c + 0.4298 * x2 + 0.1191 * c - 0.00232;
  c = outset * c;
  return pow(max(c, vec3(0.0)), vec3(2.2));
}

vec3 aces(vec3 x) {
  x *= 0.6;
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

/**
 * Hue-preserving filmic curve for emissive neon: compresses the brightest channel and scales the
 * others with it, so saturated light stays saturated; only very hot cores bleach toward white.
 */
vec3 neon(vec3 c) {
  float m = max(c.r, max(c.g, c.b));
  if (m <= 1e-5) return vec3(0.0);
  float t = 1.0 - exp(-m * 1.15);
  vec3 hue = c / m;
  vec3 white = vec3(1.0);
  float bleach = smoothstep(1.4, 5.0, m) * 0.55;
  return mix(hue, white, bleach) * t;
}

vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);

  if (uKaleido > 0.5) {
    float r = length(p);
    float a = atan(p.y, p.x) + uKaleidoRotation;
    float seg = TAU / uKaleidoSegments;
    a = mod(a, seg);
    a = abs(a - seg * 0.5);
    p = r * vec2(cos(a), sin(a));
  }
  if (abs(uRadial) > 0.0) {
    float r2 = dot(p, p);
    p *= 1.0 + uRadial * r2;
  }
  if (uWaveAmount > 0.0) {
    p += vec2(sin(p.y * uWaveFreq + uWavePhase), cos(p.x * uWaveFreq * 0.9 + uWavePhase * 0.8)) * uWaveAmount;
  }
  for (int i = 0; i < 4; i++) {
    vec4 s = uShock[i];
    if (s.y <= 0.0) continue;
    float r = length(p);
    float d = r - s.x;
    float w = 0.05 + s.x * 0.06;
    float k = exp(-(d * d) / (w * w)) * s.y;
    if (r > 1e-4) p -= (p / r) * d * k * 0.9;
  }
  vec2 uv = p / vec2(uAspect, 1.0) + 0.5;

  vec4 scene;
  if (uChroma > 0.0) {
    vec2 dir = (uv - 0.5) * uChroma;
    vec4 g = texture(tScene, uv);
    scene = vec4(texture(tScene, uv + dir).r, g.g, texture(tScene, uv - dir).b, g.a);
  } else {
    scene = texture(tScene, uv);
  }
  vec3 hdr = scene.rgb;
  if (uBloom > 0.0) hdr += texture(tBloom, uv).rgb * uBloom;

  vec3 bg = uBgA;
  vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);
  if (uBgStyle > 1.5) {
    bg = mix(uBgA, uBgB, smoothstep(0.0, 1.0, length(q) / max(uAspect, 1.0) * 1.4));
  } else if (uBgStyle > 0.5) {
    bg = mix(uBgA, uBgB, clamp(dot(q, uBgDir) / max(uAspect, 1.0) + 0.5, 0.0, 1.0));
  }
  bg *= 1.0 + uBgBoost;
  vec3 col = bg * (1.0 - clamp(scene.a, 0.0, 1.0)) + hdr;
  col += uFlash;
  col *= uExposure;

  if (uToneMap > 3.5) col = neon(col);
  else if (uToneMap > 2.5) col = clamp(col, 0.0, 1.0);
  else if (uToneMap > 1.5) col = col / (1.0 + luma(col));
  else if (uToneMap > 0.5) col = aces(col);
  else col = agx(col);

  float l = luma(col);
  col = mix(vec3(l), col, uSaturation);
  col = max((col - 0.18) * uContrast + 0.18, vec3(0.0));

  if (uVignette > 0.0) {
    float v = smoothstep(0.85 + uVignetteSoft * 0.5, 0.15 - uVignetteSoft * 0.25, length(q / vec2(uAspect, 1.0)) * 1.25);
    col *= mix(1.0, v, uVignette);
  }
  vec3 outc = toSrgb(col * uFade);
  if (uGrain > 0.0) {
    float n = hash12(vUv * uResolution + fract(uTime * 13.7) * 311.0) - 0.5;
    outc += n * uGrain * 0.12 * (1.0 - luma(outc) * 0.6);
  }
  float dither = hash12(vUv * uResolution + 0.37 * fract(uTime)) - 0.5;
  outc += dither / 255.0;
  gl_FragColor = vec4(outc, 1.0);
}
`
