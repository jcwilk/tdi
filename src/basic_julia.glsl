precision highp float;
uniform float graphWidth;
uniform float graphHeight;
uniform float graphX;
uniform float graphY;
uniform float cX;
uniform float cY;
uniform int maxIterations;
varying vec2 uv;

// Default - overridable by prepending a matching define
#ifndef MAX_ITERATIONS
#define MAX_ITERATIONS 100
#endif

const float COLOR_CYCLES = 2.0;
// used for scaling iterations into colors

// Function to convert HSV color to RGB color
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// Julia set function
int julia(vec2 c, inout vec2 orbit) {
  for(int i=0; i <= MAX_ITERATIONS; i++) {
    orbit = vec2(
      orbit.x*orbit.x - orbit.y*orbit.y + c.x,
      2.*orbit.x*orbit.y + c.y
    );
    if (abs(orbit.x) > 2. || abs(orbit.y) > 2.) return i;
  }

  return -1; // indicate unfinished
}

void main() {
  // Transformations to avoid rounding errors and wobbling at edges
  vec2 start = vec2(graphX, graphY) + uv * vec2(graphWidth, graphHeight);
  vec2 orbit = start;
  int iterations = julia(vec2(cX,cY), orbit);

  // if still alive...
  if (iterations <= 0) {
    gl_FragColor = vec4(0., 0., 0., 1.);
    return;
  }

  // Calculate distance estimate
  float dist = length(start) * log(length(start)) / length(orbit);
  float scaled = iterations == 0 ? 0.0 : dist;

  gl_FragColor = vec4(
    hsv2rgb(
      vec3(
        scaled*20.,
        .8+scaled*1.5, // tops out at 1
        .2+scaled*1.5
      )
    ), 1.0
  );
}
