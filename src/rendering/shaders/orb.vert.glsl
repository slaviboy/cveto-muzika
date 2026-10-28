uniform float uExtent;

varying vec2 vUv;
varying vec2 vWorld;

void main() {
  vUv = uv;
  vec2 p = position.xy * 2.0 * uExtent;
  vWorld = p;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 0.0, 1.0);
}
