import './index.css';
import { Resizer } from './resizer'
const REGL = require("regl");

const initialGraphX = 0;
const initialGraphY = 0;
const initialZoom = .4;


document.addEventListener('DOMContentLoaded', function () {
    const canvas = document.getElementById("regl-canvas");
    if (!canvas) {
        console.error("Canvas element not found");
        return;
    }

    const regl = REGL({
        canvas: canvas,
        //extensions: ['OES_texture_float'],
        // optionalExtensions: ['oes_texture_float_linear'],
    });

    const urlParams = new URLSearchParams(window.location.search);
    let graphX = initialGraphX;
    let graphY = initialGraphY;
    let graphZoom = initialZoom;

    const resizer = new Resizer(window, canvas, 2 / graphZoom);
    resizer.onResize = () => {
        regl.poll();
    }
    regl.poll();

    const draw = regl({
        frag: `
            // override default, see basic_julia.glsl
            #define MAX_ITERATIONS 120
        ` + require('./basic_julia.glsl'),

        vert: `
            precision highp float;
            attribute vec2 position;
            varying vec2 uv;
            void main() {
                uv = position / 2.;
                gl_Position = vec4(position, 0, 1);
            }
        `,

        attributes: {
            position: regl.buffer([
                [-1, -1],
                [1, -1],
                [-1, 1],
                [1, 1]
            ])
        },

        uniforms: {
            graphWidth: (context, props) => (props as any).graphWidth,
            graphHeight: (context, props) => (props as any).graphHeight,
            graphX: (context, props) => (props as any).graphX,
            graphY: (context, props) => (props as any).graphY,
        },

        depth: { enable: false },

        count: 4,

        primitive: 'triangle strip'
    })

    //let seenFocus = false;
    let lastTime = performance.now();
    regl.frame(() => {
        const thisTime = performance.now();

        // dTime always assumes between 1 and 144 fps
        const dTime = Math.min(1000, Math.max(1000 / 144, thisTime - lastTime));

        lastTime = thisTime;

        // It burns a lot of juice running this thing so cool it while it's not in the very foreground
        // if (document.hasFocus() && document.visibilityState == "visible") {
        //     seenFocus = true;
        // } else if (seenFocus) {
        //     // only skip rendering if focus has been confirmed at least once
        //     return;
        // }

        draw({
            graphWidth: resizer.graphWidth,
            graphHeight: resizer.graphHeight,
            graphX: graphX,
            graphY: graphY
        })
    })
}, false);
