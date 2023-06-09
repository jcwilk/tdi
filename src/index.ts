import './index.css';
import { Resizer } from './resizer'
import { WordCounter } from './word_counter'
const REGL = require("regl");

const initialGraphX = 0;
const initialGraphY = 0;
const initialZoom = .4;

document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById("regl-canvas");
  if (!canvas) {
    console.error("Canvas element not found");
    return;
  }

  const regl = REGL({
    canvas: canvas,
  });

  let graphX = initialGraphX;
  let graphY = initialGraphY;
  let graphZoom = initialZoom;
  let needsResize = true;

  const resizer = new Resizer(window, canvas, 2 / graphZoom);
  resizer.onResize = () => {
    needsResize = true;
  }

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
      cX: (context, props) => (props as any).cX,
      cY: (context, props) => (props as any).cY,
    },

    depth: { enable: false },

    count: 4,

    primitive: 'triangle strip',

    viewport: {
      x: 0,
      y: 0,
      width: regl.context('drawingBufferWidth'),
      height: regl.context('drawingBufferHeight'),
    },
  })

  let lastTime = performance.now();
  let wordCounter;
  let lastCoord;
  regl.frame(() => {
    const thisTime = performance.now();
    const dTime = Math.min(1000, Math.max(1000 / 144, thisTime - lastTime));
    lastTime = thisTime;
    let cX = 0.0;
    let cY = 0.0;

    const element = document.getElementById('text-input-form');
    if (element) {
      if (!wordCounter) wordCounter = new WordCounter(element);
      const coordinate = wordCounter.getCoordinate();
      cX = coordinate.x;
      cY = coordinate.y;

      if (needsResize || !lastCoord || coordinate.x != lastCoord.x || coordinate.y != lastCoord.y) {
        needsResize = false;

        draw({
          graphWidth: resizer.graphWidth,
          graphHeight: resizer.graphHeight,
          graphX: graphX,
          graphY: graphY,
          cX: cX,
          cY: cY
        })
      }
      lastCoord = coordinate;
    }
  })
}, false);
