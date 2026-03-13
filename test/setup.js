import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Minimal canvas context mock
const noop = () => {};
const mockCtx = {
  save: noop, restore: noop, beginPath: noop, moveTo: noop, lineTo: noop,
  stroke: noop, fill: noop, arc: noop, closePath: noop, clearRect: noop,
  fillText: noop, measureText: () => ({ width: 0 }), setLineDash: noop,
  quadraticCurveTo: noop, roundRect: noop, ellipse: noop,
  scale: noop, translate: noop,
  fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', lineJoin: '',
  globalAlpha: 1, font: '', textAlign: '', textBaseline: '',
};

const mockCanvas = {
  width: 400,
  height: 500,
  getContext: () => mockCtx,
  getBoundingClientRect: () => ({ left: 0, top: 0, right: 400, bottom: 500, width: 400, height: 500 }),
  addEventListener: noop,
};

// Mock chat input
const mockChatInput = {
  style: {},
  value: '',
  focus: noop,
  blur: noop,
  addEventListener: noop,
};

const mockChatContainer = {
  style: {},
};

// Mock DOM
globalThis.document = {
  getElementById: (id) => {
    if (id === 'canvas') return mockCanvas;
    if (id === 'chat-input') return mockChatInput;
    if (id === 'chat-container') return mockChatContainer;
    return null;
  },
};

// Mock browser APIs
globalThis.window = globalThis;
globalThis.window.innerWidth = 0; // 0 prevents renderer from resizing canvas
globalThis.window.innerHeight = 0;
globalThis.window.electronAPI = {
  dragWindow: noop,
  aiDecide: () => Promise.resolve(null),
  setIgnoreMouse: noop,
};
globalThis.requestAnimationFrame = noop;
if (!globalThis.performance) {
  globalThis.performance = { now: () => Date.now() };
}

// Load renderer.js — exposes ACTIONS, Stickman, particles, etc. via globalThis
const code = readFileSync(resolve(__dirname, '..', 'renderer.js'), 'utf8');
vm.runInThisContext(code, { filename: 'renderer.js' });
