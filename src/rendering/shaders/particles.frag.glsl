varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  float a = exp(-d * 4.0) * vAlpha;
  gl_FragColor = vec4(vColor * a, 0.0);
}
