/**
 * 删除右键动作选择菜单 — 功能测试
 *
 * 覆盖范围：
 * - 右键单击不弹出任何菜单（含自定义菜单和浏览器默认菜单）
 * - 右键拖拽移动窗口功能不受影响
 * - 菜单相关 DOM / CSS / IPC / 事件监听已移除
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ---- 沙箱化加载 renderer.js ----

function loadRenderer() {
  const listeners = {};

  const mockCtx = new Proxy({}, {
    get(target, prop) {
      if (typeof prop === 'symbol') return undefined;
      if (prop === 'measureText') return () => ({ width: 50 });
      if (!(prop in target)) target[prop] = vi.fn();
      return target[prop];
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });

  const mockCanvas = {
    width: 400,
    height: 500,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 500 }),
    getContext: () => mockCtx,
    addEventListener(type, fn) { (listeners[type] ??= []).push(fn); },
  };

  const dragWindow = vi.fn();
  const aiDecide = vi.fn(() => Promise.resolve(null));
  const electronAPI = { dragWindow, aiDecide };

  const ctx = createContext({
    document: { getElementById: () => mockCanvas },
    window: { electronAPI },
    performance: { now: () => Date.now() },
    requestAnimationFrame: vi.fn(),
    Math, console,
  });

  const code = readFileSync(resolve(ROOT, 'renderer.js'), 'utf8');
  const result = runInContext(code + '\n({ Stickman, man })', ctx);

  return { ...result, listeners, dragWindow, electronAPI };
}

function fire(listeners, type, props = {}) {
  const event = { preventDefault: vi.fn(), ...props };
  for (const fn of (listeners[type] || [])) fn(event);
  return event;
}

// ============================================================
//  1. 右键单击 — 无菜单弹出
// ============================================================

describe('右键单击 - 不弹出任何菜单', () => {
  let env;
  beforeEach(() => { env = loadRenderer(); });

  it('右键单击火柴人身上不触发 showContextMenu IPC 调用', () => {
    fire(env.listeners, 'mousedown', { button: 2, clientX: 200, clientY: 250 });
    fire(env.listeners, 'mouseup', { button: 2, clientX: 200, clientY: 250 });
    expect(env.electronAPI.showContextMenu).toBeUndefined();
  });

  it('右键单击空白区域不触发 showContextMenu IPC 调用', () => {
    fire(env.listeners, 'mousedown', { button: 2, clientX: 10, clientY: 10 });
    fire(env.listeners, 'mouseup', { button: 2, clientX: 10, clientY: 10 });
    expect(env.electronAPI.showContextMenu).toBeUndefined();
  });

  it('右键单击后 man.menuOpen 始终为 false', () => {
    fire(env.listeners, 'mousedown', { button: 2, clientX: 200, clientY: 250 });
    fire(env.listeners, 'mouseup', { button: 2, clientX: 200, clientY: 250 });
    expect(env.man.menuOpen).toBeFalsy();
  });

  it('浏览器默认右键菜单被阻止（contextmenu 事件 preventDefault）', () => {
    const event = fire(env.listeners, 'contextmenu', {});
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it('连续多次右键单击均不弹出菜单', () => {
    for (let i = 0; i < 3; i++) {
      fire(env.listeners, 'mousedown', { button: 2, clientX: 200, clientY: 250 });
      fire(env.listeners, 'mouseup', { button: 2, clientX: 200, clientY: 250 });
    }
    expect(env.electronAPI.showContextMenu).toBeUndefined();
  });
});

// ============================================================
//  2. 右键拖拽 — 移动窗口功能保持不变
// ============================================================

describe('右键拖拽 - 窗口移动功能不受影响', () => {
  let env;
  beforeEach(() => { env = loadRenderer(); });

  it('右键拖拽调用 electronAPI.dragWindow 传递位移量', () => {
    fire(env.listeners, 'mousedown', { button: 2, clientX: 100, clientY: 100 });
    fire(env.listeners, 'mousemove', { clientX: 110, clientY: 115, movementX: 10, movementY: 15 });
    expect(env.dragWindow).toHaveBeenCalledWith(10, 15);
    fire(env.listeners, 'mouseup', { button: 2 });
  });

  it('右键拖拽过程中每次 mousemove 都触发 dragWindow', () => {
    fire(env.listeners, 'mousedown', { button: 2, clientX: 100, clientY: 100 });
    fire(env.listeners, 'mousemove', { clientX: 105, clientY: 105, movementX: 5, movementY: 5 });
    fire(env.listeners, 'mousemove', { clientX: 110, clientY: 110, movementX: 5, movementY: 5 });
    fire(env.listeners, 'mousemove', { clientX: 115, clientY: 115, movementX: 5, movementY: 5 });
    expect(env.dragWindow).toHaveBeenCalledTimes(3);
    fire(env.listeners, 'mouseup', { button: 2 });
  });

  it('右键拖拽结束后不触发 showContextMenu', () => {
    fire(env.listeners, 'mousedown', { button: 2, clientX: 100, clientY: 100 });
    fire(env.listeners, 'mousemove', { clientX: 120, clientY: 120, movementX: 20, movementY: 20 });
    fire(env.listeners, 'mouseup', { button: 2 });
    expect(env.electronAPI.showContextMenu).toBeUndefined();
  });

  it('右键拖拽结束后 man.menuOpen 为 false', () => {
    fire(env.listeners, 'mousedown', { button: 2, clientX: 100, clientY: 100 });
    fire(env.listeners, 'mousemove', { clientX: 110, clientY: 110, movementX: 10, movementY: 10 });
    fire(env.listeners, 'mouseup', { button: 2 });
    expect(env.man.menuOpen).toBeFalsy();
  });

  it('极小位移的右键拖拽仍视为拖拽（不弹菜单）', () => {
    fire(env.listeners, 'mousedown', { button: 2, clientX: 100, clientY: 100 });
    fire(env.listeners, 'mousemove', { clientX: 101, clientY: 101, movementX: 1, movementY: 1 });
    fire(env.listeners, 'mouseup', { button: 2 });
    expect(env.dragWindow).toHaveBeenCalledWith(1, 1);
    expect(env.electronAPI.showContextMenu).toBeUndefined();
  });
});

// ============================================================
//  3. 菜单相关代码已移除
// ============================================================

describe('菜单相关代码清理', () => {
  it('window.electronAPI 上不存在 showContextMenu 方法', () => {
    const env = loadRenderer();
    expect(env.electronAPI.showContextMenu).toBeUndefined();
  });

  it('Stickman 实例上不存在 menuOpen 属性', () => {
    const env = loadRenderer();
    expect('menuOpen' in env.man).toBe(false);
  });

  it('Stickman 实例上不存在 triggerAction 方法', () => {
    const env = loadRenderer();
    expect(typeof env.man.triggerAction).toBe('undefined');
  });

  it('renderer.js 中无 showContextMenu 调用痕迹', () => {
    const src = readFileSync(resolve(ROOT, 'renderer.js'), 'utf8');
    expect(src).not.toContain('showContextMenu');
  });

  it('main.js 中无 show-context-menu IPC handler', () => {
    const src = readFileSync(resolve(ROOT, 'main.js'), 'utf8');
    expect(src).not.toContain('show-context-menu');
  });

  it('preload.js 中无 showContextMenu 暴露', () => {
    const src = readFileSync(resolve(ROOT, 'preload.js'), 'utf8');
    expect(src).not.toContain('showContextMenu');
  });
});

// ============================================================
//  4. 左键交互不受影响（回归）
// ============================================================

describe('左键交互 - 回归验证', () => {
  let env;
  beforeEach(() => { env = loadRenderer(); });

  it('左键点击火柴人仍触发 poke 惊吓反应', () => {
    const pokeSpy = vi.spyOn(env.man, 'poke');
    // 直接触发 click（不经过 mousedown/mouseup 避免进入拖拽流程）
    fire(env.listeners, 'click', { button: 0, clientX: env.man.x, clientY: env.man.y });
    expect(pokeSpy).toHaveBeenCalled();
  });

  it('左键拖拽火柴人仍可抓起并投掷', () => {
    const startDragSpy = vi.spyOn(env.man, 'startDrag');
    const releaseSpy = vi.spyOn(env.man, 'release');

    fire(env.listeners, 'mousedown', { button: 0, clientX: env.man.x, clientY: env.man.y });
    expect(startDragSpy).toHaveBeenCalled();
    expect(env.man.dragging).toBe(true);

    fire(env.listeners, 'mouseup', { button: 0 });
    expect(releaseSpy).toHaveBeenCalled();
    expect(env.man.dragging).toBe(false);
  });

  it('右键操作不干扰左键拖拽状态', () => {
    fire(env.listeners, 'mousedown', { button: 0, clientX: env.man.x, clientY: env.man.y });
    expect(env.man.dragging).toBe(true);

    // 拖拽中触发右键
    fire(env.listeners, 'mousedown', { button: 2, clientX: 100, clientY: 100 });
    fire(env.listeners, 'mouseup', { button: 2 });

    expect(env.man.dragging).toBe(true);

    fire(env.listeners, 'mouseup', { button: 0 });
    expect(env.man.dragging).toBe(false);
  });
});
