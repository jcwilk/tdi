precision highp float;
uniform float graphWidth;
uniform float graphHeight;
uniform float graphX;
uniform float graphY;
uniform int maxIterations;
varying vec2 uv;

// Default - overridable by prepending a matching define
#ifndef MAX_ITERATIONS
#define MAX_ITERATIONS 100
#endif

const float COLOR_CYCLES = 2.0;
// used for scaling iterations into colors

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

int julia(vec2 c, vec2 orbit) {
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
    // These transformations can hypothetically happen in the vertex, but that means when you're running up against the
    // lower bounds of floats you'll get the edges wobbling back and forth as you zoom because the rounding errors are
    // happening during the plane interpolation step. Keeping the vertex ranging from -0.5 to 0.5 dodges that issue.
    vec2 start = vec2(graphX, graphY) + uv * vec2(graphWidth, graphHeight);
    int iterations = julia(vec2(0.75,0.25), start);

    // if still alive...
    if (iterations < 0) {
        gl_FragColor = vec4(0., 1., 0., 1.);
        return;
    }

    float scaled=log(float(iterations))/log(float(MAX_ITERATIONS));
    gl_FragColor = vec4(
        hsv2rgb(
            vec3(
                mod(scaled, 1./COLOR_CYCLES) * COLOR_CYCLES,
                .2+scaled*1.5, // tops out at 1
                scaled*1.5
            )
        ), 1.0
    );
}
