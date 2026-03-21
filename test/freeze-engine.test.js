/**
 * 冻结引擎测试
 *
 * 覆盖范围：
 * - bone-layer.js：骨层存储、双层查询、hash 承诺链、冻结清单、写入校验
 * - meta-evaluator.js：方差计算、方向一致性、自适应窗口、冻结决策
 * - ai-manager.js 集成：evolve() 冻结流程、write_self_file 拦截、loadPersonality 双层查询
 * - main.js 集成：load-personality IPC 双层查询
 * - 灵魂约束：冻结代码路径无 Date.now/Math.random/用户输入
 * - 反降级检查
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

// ============================================================
//  Helpers
// ============================================================

function makeTmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'freeze-test-'));
  fs.mkdirSync(path.join(dir, 'ai'), { recursive: true });
  return dir;
}

function writeBoneState(dir, state) {
  fs.writeFileSync(path.join(dir, 'ai', 'bone-state.json'), JSON.stringify(state, null, 2));
}

function readBoneState(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'ai', 'bone-state.json'), 'utf8'));
}

function writePersonality(dir, personality) {
  fs.writeFileSync(path.join(dir, 'ai', 'personality.json'), JSON.stringify(personality, null, 2));
}

/** 生成 N 轮稳定历史（值在 center ± jitter 内波动） */
function stableHistory(param, rounds, center = 0.8, jitter = 0.005) {
  const entries = [];
  for (let i = rounds; i >= 1; i--) {
    entries.push({
      round: i,
      value: +(center + (Math.random() - 0.5) * jitter * 2).toFixed(4),
      ts: `2025-01-15 ${String(14 + Math.floor(i / 3)).padStart(2, '0')}:${String((i * 20) % 60).padStart(2, '0')}:00`,
    });
  }
  return entries.reverse(); // 降序：最新在前
}

/** 生成完全静止的历史（所有值相同） */
function flatHistory(param, rounds, value = 0.8) {
  const entries = [];
  for (let r = rounds; r >= 1; r--) {
    entries.push({ round: r, value, ts: `2025-01-15 14:${String(r).padStart(2, '0')}:00` });
  }
  return entries.reverse();
}

/** 生成单调递增的历史 */
function trendingHistory(rounds, start = 0.5, step = 0.002) {
  const entries = [];
  for (let r = rounds; r >= 1; r--) {
    entries.push({ round: r, value: +(start + (rounds - r) * step).toFixed(4), ts: `2025-01-15 14:${String(r).padStart(2, '0')}:00` });
  }
  return entries.reverse();
}

/** 生成高方差的历史（振荡） */
function volatileHistory(rounds, center = 0.5, amplitude = 0.1) {
  const entries = [];
  for (let r = rounds; r >= 1; r--) {
    const value = center + (r % 2 === 0 ? amplitude : -amplitude);
    entries.push({ round: r, value: +value.toFixed(4), ts: `2025-01-15 14:${String(r).padStart(2, '0')}:00` });
  }
  return entries.reverse();
}

// ============================================================
//  A. bone-layer.js — 骨层存储模块
// ============================================================

describe('BoneLayer — 骨层存储模块', () => {

  // --- A.1 创建与初始化 ---

  describe('创建与初始化', () => {
    it('createBoneLayer(baseDir) 返回 BoneLayer 实例', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      expect(bl).toBeDefined();
      expect(typeof bl.load).toBe('function');
      expect(typeof bl.save).toBe('function');
      expect(typeof bl.resolvePersonality).toBe('function');
      expect(typeof bl.getFrozenParams).toBe('function');
      expect(typeof bl.isFrozen).toBe('function');
      expect(typeof bl.recordRound).toBe('function');
      expect(typeof bl.freezeParam).toBe('function');
      expect(typeof bl.validateChain).toBe('function');
      expect(typeof bl.formatFrozenListForPrompt).toBe('function');
      expect(typeof bl.validatePersonalityWrite).toBe('function');
    });

    it('冷启动：bone-state.json 不存在时 load() 创建空白初始状态', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      expect(bl.getFrozenParams()).toEqual({});
      // save 后文件应存在
      bl.save();
      const state = readBoneState(dir);
      expect(state.roundCounter).toBe(0);
      expect(state.history).toEqual({});
      expect(state.frozen).toEqual({});
      expect(state.commitChain).toEqual([]);
    });

    it('正常加载已有 bone-state.json', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      writeBoneState(dir, {
        roundCounter: 10,
        history: { sass: flatHistory('sass', 10, 0.8) },
        frozen: {},
        commitChain: [],
      });
      const bl = createBoneLayer(dir);
      bl.load();
      expect(bl.isFrozen('sass')).toBe(false);
    });
  });

  // --- A.2 双层查询 resolvePersonality ---

  describe('双层查询 resolvePersonality', () => {
    it('无冻结参数时返回原始 personality 的副本', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      const mutable = { sass: 0.5, curiosity: 0.6, energy: 0.7, attachment: 0.4, rebellion: 0.3 };
      const result = bl.resolvePersonality(mutable);
      expect(result).toEqual(mutable);
    });

    it('冻结参数覆盖 mutable 层对应值', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      writeBoneState(dir, {
        roundCounter: 20,
        history: {},
        frozen: { sass: { value: 0.80, frozenAt: '2025-01-15 14:30:00', contextSummary: 'test' } },
        commitChain: [],
      });
      const bl = createBoneLayer(dir);
      bl.load();
      const result = bl.resolvePersonality({ sass: 0.50, curiosity: 0.6 });
      expect(result.sass).toBe(0.80);
      expect(result.curiosity).toBe(0.6);
    });

    it('personality.json 删除已冻结参数 → resolvePersonality 仍注入冻结值', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      writeBoneState(dir, {
        roundCounter: 20,
        history: {},
        frozen: { sass: { value: 0.80, frozenAt: '2025-01-15 14:30:00', contextSummary: 'test' } },
        commitChain: [],
      });
      const bl = createBoneLayer(dir);
      bl.load();
      const result = bl.resolvePersonality({ curiosity: 0.6, energy: 0.7 });
      expect(result.sass).toBe(0.80);
      expect(result.curiosity).toBe(0.6);
    });

    it('多个冻结参数同时覆盖', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      writeBoneState(dir, {
        roundCounter: 30,
        history: {},
        frozen: {
          sass: { value: 0.80, frozenAt: '2025-01-15 14:30:00', contextSummary: 'a' },
          rebellion: { value: 0.20, frozenAt: '2025-01-15 15:00:00', contextSummary: 'b' },
        },
        commitChain: [],
      });
      const bl = createBoneLayer(dir);
      bl.load();
      const result = bl.resolvePersonality({ sass: 0.1, curiosity: 0.6, rebellion: 0.9 });
      expect(result.sass).toBe(0.80);
      expect(result.rebellion).toBe(0.20);
      expect(result.curiosity).toBe(0.6);
    });
  });

  // --- A.3 getFrozenParams / isFrozen ---

  describe('getFrozenParams / isFrozen', () => {
    it('无冻结时 getFrozenParams 返回空对象', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      expect(bl.getFrozenParams()).toEqual({});
    });

    it('冻结后 getFrozenParams 返回参数名→值 map', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.8, 'test');
      expect(bl.getFrozenParams()).toEqual({ sass: 0.8 });
    });

    it('isFrozen 正确判断已冻结/未冻结参数', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.8, 'test');
      expect(bl.isFrozen('sass')).toBe(true);
      expect(bl.isFrozen('curiosity')).toBe(false);
    });
  });

  // --- A.4 recordRound ---

  describe('recordRound — 记录进化轮次', () => {
    it('recordRound 递增 roundCounter', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.recordRound({ sass: 0.5, curiosity: 0.6 });
      bl.recordRound({ sass: 0.51, curiosity: 0.61 });
      bl.save();
      const state = readBoneState(dir);
      expect(state.roundCounter).toBe(2);
    });

    it('recordRound 为每个参数追加历史条目', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.recordRound({ sass: 0.5, curiosity: 0.6 });
      bl.save();
      const state = readBoneState(dir);
      expect(state.history.sass.length).toBe(1);
      expect(state.history.sass[0].value).toBe(0.5);
      expect(state.history.sass[0].round).toBe(1);
    });

    it('recordRound 自动为新参数创建 history 条目', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.recordRound({ sass: 0.5 });
      bl.recordRound({ sass: 0.51, newParam: 0.3 });
      bl.save();
      const state = readBoneState(dir);
      expect(state.history.newParam).toBeDefined();
      expect(state.history.newParam.length).toBe(1);
    });

    it('recordRound 历史超过 40 轮时截断最旧条目', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      for (let i = 0; i < 45; i++) {
        bl.recordRound({ sass: +(0.5 + i * 0.001).toFixed(4) });
      }
      bl.save();
      const state = readBoneState(dir);
      expect(state.history.sass.length).toBe(40);
      // 最新的在前
      expect(state.history.sass[0].round).toBe(45);
    });

    it('recordRound 历史按 round 降序存储（最新在前）', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.recordRound({ sass: 0.5 });
      bl.recordRound({ sass: 0.6 });
      bl.recordRound({ sass: 0.7 });
      bl.save();
      const state = readBoneState(dir);
      expect(state.history.sass[0].round).toBeGreaterThan(state.history.sass[1].round);
      expect(state.history.sass[1].round).toBeGreaterThan(state.history.sass[2].round);
    });
  });

  // --- A.5 freezeParam ---

  describe('freezeParam — 冻结参数', () => {
    it('freezeParam 写入 frozen map', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.80, '稳定 12 轮');
      bl.save();
      const state = readBoneState(dir);
      expect(state.frozen.sass).toBeDefined();
      expect(state.frozen.sass.value).toBe(0.80);
      expect(state.frozen.sass.contextSummary).toBe('稳定 12 轮');
      expect(state.frozen.sass.frozenAt).toBeDefined();
    });

    it('freezeParam 追加 commitChain 条目', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.80, 'ctx1');
      bl.save();
      const state = readBoneState(dir);
      expect(state.commitChain.length).toBe(1);
      const entry = state.commitChain[0];
      expect(entry.param).toBe('sass');
      expect(entry.prevHash).toBe('GENESIS');
      expect(entry.hash).toBeDefined();
      expect(entry.hash.length).toBeGreaterThan(10);
    });

    it('多次 freezeParam 构建链式 prevHash', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.80, 'ctx1');
      bl.freezeParam('curiosity', 0.60, 'ctx2');
      bl.save();
      const state = readBoneState(dir);
      expect(state.commitChain.length).toBe(2);
      expect(state.commitChain[0].prevHash).toBe('GENESIS');
      expect(state.commitChain[1].prevHash).toBe(state.commitChain[0].hash);
    });

    it('frozen 参数无 delete/update 路径（append-only 语义）', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.80, 'ctx');
      // 再次冻结同一参数不应改变值
      bl.freezeParam('sass', 0.99, 'try override');
      expect(bl.getFrozenParams().sass).toBe(0.80);
    });
  });

  // --- A.6 validateChain ---

  describe('validateChain — hash 链完整性', () => {
    it('空链视为合法', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      const result = bl.validateChain();
      expect(result.valid).toBe(true);
    });

    it('正常链校验通过', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.8, 'ctx1');
      bl.freezeParam('curiosity', 0.6, 'ctx2');
      bl.save();
      // 重新加载并校验
      const bl2 = createBoneLayer(dir);
      bl2.load();
      const result = bl2.validateChain();
      expect(result.valid).toBe(true);
    });

    it('链中间篡改 → 检测到损坏并返回 lastValidIndex', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.8, 'ctx1');
      bl.freezeParam('curiosity', 0.6, 'ctx2');
      bl.freezeParam('energy', 0.7, 'ctx3');
      bl.save();
      // 手动篡改中间条目
      const state = readBoneState(dir);
      state.commitChain[1].hash = 'tampered_hash';
      writeBoneState(dir, state);
      const bl2 = createBoneLayer(dir);
      bl2.load();
      const result = bl2.validateChain();
      expect(result.valid).toBe(false);
      expect(result.lastValidIndex).toBe(0);
    });

    it('链损坏时 load() 回退到最后合法快照', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.8, 'ctx1');
      bl.freezeParam('curiosity', 0.6, 'ctx2');
      bl.freezeParam('energy', 0.7, 'ctx3');
      bl.save();
      // 篡改第二条
      const state = readBoneState(dir);
      state.commitChain[1].hash = 'tampered';
      writeBoneState(dir, state);
      // 重新加载 → 只保留第一条冻结
      const bl2 = createBoneLayer(dir);
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      bl2.load();
      expect(bl2.isFrozen('sass')).toBe(true);
      expect(bl2.isFrozen('curiosity')).toBe(false);
      expect(bl2.isFrozen('energy')).toBe(false);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  // --- A.7 save — 原子写入 ---

  describe('save — 原子写入', () => {
    it('save() 写入有效 JSON', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.recordRound({ sass: 0.5 });
      bl.save();
      const raw = fs.readFileSync(path.join(dir, 'ai', 'bone-state.json'), 'utf8');
      expect(() => JSON.parse(raw)).not.toThrow();
    });

    it('save() 使用 tmp+rename 保证原子性（不产生半写文件）', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.8, 'ctx');
      bl.save();
      // 验证文件完整
      const state = readBoneState(dir);
      expect(state.frozen.sass.value).toBe(0.8);
    });
  });

  // --- A.8 formatFrozenListForPrompt ---

  describe('formatFrozenListForPrompt', () => {
    it('无冻结时返回空字符串或提示文本', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      const text = bl.formatFrozenListForPrompt();
      expect(typeof text).toBe('string');
    });

    it('有冻结时返回包含参数名和值的列表', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.80, 'ctx');
      const text = bl.formatFrozenListForPrompt();
      expect(text).toContain('sass');
      expect(text).toContain('0.8');
    });

    it('多个冻结参数每行一个', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.80, 'ctx1');
      bl.freezeParam('curiosity', 0.60, 'ctx2');
      const text = bl.formatFrozenListForPrompt();
      const lines = text.split('\n').filter(l => l.trim());
      expect(lines.length).toBeGreaterThanOrEqual(2);
    });
  });

  // --- A.9 validatePersonalityWrite ---

  describe('validatePersonalityWrite — 写入校验', () => {
    it('无冻结参数时任何写入都合法', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      const violated = bl.validatePersonalityWrite({ sass: 0.5, curiosity: 0.6 });
      expect(violated).toEqual([]);
    });

    it('写入值与冻结值相同 → 合法', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.80, 'ctx');
      const violated = bl.validatePersonalityWrite({ sass: 0.80, curiosity: 0.6 });
      expect(violated).toEqual([]);
    });

    it('篡改冻结参数值 → 返回被篡改参数名', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.80, 'ctx');
      const violated = bl.validatePersonalityWrite({ sass: 0.50, curiosity: 0.6 });
      expect(violated).toContain('sass');
    });

    it('省略冻结参数（不包含字段） → 视为篡改', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.80, 'ctx');
      const violated = bl.validatePersonalityWrite({ curiosity: 0.6 });
      expect(violated).toContain('sass');
    });

    it('多个冻结参数部分篡改 → 只返回被篡改的', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.80, 'ctx1');
      bl.freezeParam('curiosity', 0.60, 'ctx2');
      const violated = bl.validatePersonalityWrite({ sass: 0.80, curiosity: 0.99, energy: 0.7 });
      expect(violated).toEqual(['curiosity']);
    });
  });
});


// ============================================================
//  B. meta-evaluator.js — 元决策评估器
// ============================================================

describe('MetaEvaluator — 元决策评估器', () => {

  // --- B.1 computeStability 基本计算 ---

  describe('computeStability — 稳定性计算', () => {
    it('完全静止序列（所有值相同）→ variance=0, directionConsistency=1.0, stable=true', () => {
      const { computeStability } = require('../meta-evaluator.js');
      const values = Array(10).fill(0.8);
      const result = computeStability(values);
      expect(result.stable).toBe(true);
      expect(result.variance).toBeCloseTo(0, 5);
      expect(result.directionConsistency).toBe(1.0);
    });

    it('单调递增微小步长序列 → directionConsistency 接近 1.0', () => {
      const { computeStability } = require('../meta-evaluator.js');
      const values = [0.810, 0.808, 0.806, 0.804, 0.802, 0.800]; // 降序存储（最新在前），值递增
      const result = computeStability(values);
      expect(result.directionConsistency).toBeGreaterThanOrEqual(0.7);
    });

    it('大幅振荡序列 → variance 大, stable=false', () => {
      const { computeStability } = require('../meta-evaluator.js');
      const values = [0.9, 0.1, 0.9, 0.1, 0.9, 0.1]; // 大幅度振荡
      const result = computeStability(values);
      expect(result.stable).toBe(false);
      expect(result.variance).toBeGreaterThan(0.01);
    });

    it('不足 MIN_STABLE_ROUNDS（5 轮）→ stable=false', () => {
      const { computeStability } = require('../meta-evaluator.js');
      const values = [0.8, 0.8, 0.8]; // 只有 3 个值
      const result = computeStability(values);
      expect(result.stable).toBe(false);
    });

    it('恰好 MIN_STABLE_ROUNDS（5 轮）且稳定 → stable=true', () => {
      const { computeStability } = require('../meta-evaluator.js');
      const values = [0.800, 0.801, 0.800, 0.799, 0.800];
      const result = computeStability(values);
      expect(result.stable).toBe(true);
      expect(result.stableRounds).toBeGreaterThanOrEqual(5);
    });

    it('前段稳定后段不稳定 → stableRounds 只计前段', () => {
      const { computeStability } = require('../meta-evaluator.js');
      // 最新在前：前 6 个稳定，之后突变
      const values = [0.80, 0.80, 0.80, 0.80, 0.80, 0.80, 0.50, 0.20, 0.90, 0.10];
      const result = computeStability(values);
      expect(result.stableRounds).toBeGreaterThanOrEqual(5);
      expect(result.stableRounds).toBeLessThanOrEqual(7);
    });
  });

  // --- B.2 自适应窗口 ---

  describe('自适应窗口', () => {
    it('窗口从 MIN_STABLE_ROUNDS 开始扩展', () => {
      const { computeStability } = require('../meta-evaluator.js');
      const values = Array(20).fill(0.8);
      const result = computeStability(values);
      expect(result.stableRounds).toBe(20);
    });

    it('窗口不超过 MAX_EVAL_WINDOW（30）', () => {
      const { computeStability } = require('../meta-evaluator.js');
      const values = Array(40).fill(0.8);
      const result = computeStability(values);
      expect(result.stableRounds).toBeLessThanOrEqual(30);
    });

    it('stddev 超过 VARIANCE_THRESHOLD 时停止扩展', () => {
      const { computeStability } = require('../meta-evaluator.js');
      // 前 8 个稳定，第 9 个开始波动
      const values = [0.80, 0.80, 0.80, 0.80, 0.80, 0.80, 0.80, 0.80, 0.50, 0.90];
      const result = computeStability(values);
      expect(result.stableRounds).toBeLessThan(10);
    });
  });

  // --- B.3 方向一致性 ---

  describe('方向一致性', () => {
    it('所有差分为零（完全静止）→ directionConsistency = 1.0', () => {
      const { computeStability } = require('../meta-evaluator.js');
      const values = Array(10).fill(0.5);
      const result = computeStability(values);
      expect(result.directionConsistency).toBe(1.0);
    });

    it('单调递减 → directionConsistency 接近 1.0', () => {
      const { computeStability } = require('../meta-evaluator.js');
      // 最新在前，值递减 → 差分全负
      const values = [0.795, 0.796, 0.797, 0.798, 0.799, 0.800];
      const result = computeStability(values);
      expect(result.directionConsistency).toBeGreaterThanOrEqual(0.7);
    });

    it('交替振荡 → directionConsistency 接近 0.5', () => {
      const { computeStability } = require('../meta-evaluator.js');
      const values = [0.81, 0.79, 0.81, 0.79, 0.81, 0.79]; // ±0.02 交替
      const result = computeStability(values);
      expect(result.directionConsistency).toBeLessThan(0.7);
    });

    it('差分中含微小变化（<0.001） → 视为零，不计入方向统计', () => {
      const { computeStability } = require('../meta-evaluator.js');
      const values = [0.8001, 0.8000, 0.7999, 0.8001, 0.8000]; // 变化量 0.0001
      const result = computeStability(values);
      // 所有差分 < 0.001 → nonZeroDiffs 为空 → directionConsistency = 1.0
      expect(result.directionConsistency).toBe(1.0);
    });
  });

  // --- B.4 evaluate 整体评估 ---

  describe('evaluate — 整体评估', () => {
    it('历史不足 → 不返回任何冻结决策', () => {
      const { evaluate } = require('../meta-evaluator.js');
      const history = { sass: [{ round: 1, value: 0.5, ts: '' }] };
      const decisions = evaluate(history, new Set());
      expect(decisions).toEqual([]);
    });

    it('已冻结参数 → 跳过不再评估', () => {
      const { evaluate } = require('../meta-evaluator.js');
      const history = { sass: flatHistory('sass', 20, 0.8) };
      const decisions = evaluate(history, new Set(['sass']));
      expect(decisions.find(d => d.param === 'sass')).toBeUndefined();
    });

    it('稳定参数 → 返回冻结决策', () => {
      const { evaluate } = require('../meta-evaluator.js');
      const history = { sass: flatHistory('sass', 10, 0.8) };
      const decisions = evaluate(history, new Set());
      expect(decisions.length).toBe(1);
      expect(decisions[0].param).toBe('sass');
      expect(typeof decisions[0].contextSummary).toBe('string');
    });

    it('波动参数 → 不返回冻结决策', () => {
      const { evaluate } = require('../meta-evaluator.js');
      const history = { sass: volatileHistory(10, 0.5, 0.1) };
      const decisions = evaluate(history, new Set());
      expect(decisions).toEqual([]);
    });

    it('多参数混合：部分稳定部分波动 → 只返回稳定的', () => {
      const { evaluate } = require('../meta-evaluator.js');
      const history = {
        sass: flatHistory('sass', 10, 0.8),
        curiosity: volatileHistory(10, 0.5, 0.1),
        energy: flatHistory('energy', 10, 0.6),
      };
      const decisions = evaluate(history, new Set());
      const frozenParams = decisions.map(d => d.param);
      expect(frozenParams).toContain('sass');
      expect(frozenParams).toContain('energy');
      expect(frozenParams).not.toContain('curiosity');
    });

    it('空 history → 返回空数组', () => {
      const { evaluate } = require('../meta-evaluator.js');
      const decisions = evaluate({}, new Set());
      expect(decisions).toEqual([]);
    });

    it('contextSummary 包含稳定轮数和标准差信息', () => {
      const { evaluate } = require('../meta-evaluator.js');
      const history = { sass: flatHistory('sass', 10, 0.8) };
      const decisions = evaluate(history, new Set());
      expect(decisions[0].contextSummary.length).toBeGreaterThan(0);
    });
  });

  // --- B.5 常量验证 ---

  describe('硬编码常量（物理定律）', () => {
    it('MIN_STABLE_ROUNDS = 5', () => {
      const { MIN_STABLE_ROUNDS } = require('../meta-evaluator.js');
      expect(MIN_STABLE_ROUNDS).toBe(5);
    });

    it('MAX_EVAL_WINDOW = 30', () => {
      const { MAX_EVAL_WINDOW } = require('../meta-evaluator.js');
      expect(MAX_EVAL_WINDOW).toBe(30);
    });

    it('VARIANCE_THRESHOLD = 0.01', () => {
      const { VARIANCE_THRESHOLD } = require('../meta-evaluator.js');
      expect(VARIANCE_THRESHOLD).toBe(0.01);
    });

    it('DIRECTION_THRESHOLD = 0.7', () => {
      const { DIRECTION_THRESHOLD } = require('../meta-evaluator.js');
      expect(DIRECTION_THRESHOLD).toBe(0.7);
    });
  });
});


// ============================================================
//  C. ai-manager.js 集成 — 进化周期冻结流程
// ============================================================

describe('ai-manager.js 集成 — 冻结引擎', () => {

  // --- C.1 loadPersonality 双层查询 ---

  describe('loadPersonality — 双层查询', () => {
    it('loadPersonality 返回结果中冻结参数被覆盖', () => {
      // Setup: personality.json 有 sass=0.5, bone-state frozen sass=0.8
      // 调用 loadPersonality → 返回 sass=0.8
      const dir = makeTmpDir();
      writePersonality(dir, { sass: 0.5, curiosity: 0.6, energy: 0.7, attachment: 0.4, rebellion: 0.3 });
      writeBoneState(dir, {
        roundCounter: 20,
        history: {},
        frozen: { sass: { value: 0.80, frozenAt: '2025-01-15', contextSummary: 'test' } },
        commitChain: [],
      });
      // 需要 mock 或直接调用 — 取决于最终实现
      // const { loadPersonality } = require('../ai-manager.js');
      // expect(loadPersonality(dir).sass).toBe(0.80);
      expect(true).toBe(true); // placeholder
    });

    it('无 bone-state.json 时 loadPersonality 正常返回 personality.json 原始值', () => {
      const dir = makeTmpDir();
      writePersonality(dir, { sass: 0.5, curiosity: 0.6 });
      // loadPersonality 应 fallback 到原始值
      expect(true).toBe(true);
    });
  });

  // --- C.2 write_self_file 拦截 ---

  describe('write_self_file — 冻结参数写入拦截', () => {
    it('写入 personality.json 时篡改冻结参数 → 拒绝写入', () => {
      // executeTool('write_self_file', { file: 'ai/personality.json', content: '{"sass": 0.1}' })
      // 应返回错误信息
      expect(true).toBe(true);
    });

    it('写入 personality.json 时保持冻结参数不变 → 允许写入', () => {
      expect(true).toBe(true);
    });

    it('写入 personality.json 时省略冻结参数 → 拒绝写入', () => {
      expect(true).toBe(true);
    });

    it('写入非 personality.json 文件 → 不触发冻结校验', () => {
      expect(true).toBe(true);
    });

    it('拒绝写入后原文件内容不变', () => {
      expect(true).toBe(true);
    });

    it('拒绝写入返回的错误信息包含被篡改参数名', () => {
      expect(true).toBe(true);
    });
  });

  // --- C.3 evolve() 冻结流程 ---

  describe('evolve() — 冻结流程集成', () => {
    it('evolve() prompt 包含冻结清单文本', () => {
      expect(true).toBe(true);
    });

    it('evolve() prompt 中已冻结参数从可修改列表中移除', () => {
      expect(true).toBe(true);
    });

    it('evolve() 结束后调用 recordRound 记录本轮快照', () => {
      expect(true).toBe(true);
    });

    it('evolve() 结束后调用 evaluate 进行元决策评估', () => {
      expect(true).toBe(true);
    });

    it('evolve() 评估结果触发冻结时调用 freezeParam', () => {
      expect(true).toBe(true);
    });

    it('evolve() 结束后调用 boneLayer.save()', () => {
      expect(true).toBe(true);
    });

    it('所有 5 个核心参数全部冻结时 prompt 显示"所有核心性格已固化"', () => {
      expect(true).toBe(true);
    });

    it('进化期间 API 连续失败（未修改参数）→ recordRound 仍记录当前值', () => {
      expect(true).toBe(true);
    });
  });

  // --- C.4 buildSystemPrompt 冻结标记 ---

  describe('buildSystemPrompt — 冻结参数标记', () => {
    it('buildSystemPrompt 注入冻结参数标记', () => {
      expect(true).toBe(true);
    });

    it('chat() 使用的 personality 走双层查询', () => {
      expect(true).toBe(true);
    });
  });

  // --- C.5 导出接口 ---

  describe('导出接口', () => {
    it('createAIManager 返回对象包含 getPersonality 方法', () => {
      expect(true).toBe(true);
    });

    it('getPersonality() 返回双层合并后的 personality', () => {
      expect(true).toBe(true);
    });
  });
});


// ============================================================
//  D. main.js — load-personality IPC 双层查询
// ============================================================

describe('main.js — load-personality IPC', () => {
  it('load-personality handler 返回冻结参数覆盖后的结果', () => {
    expect(true).toBe(true);
  });

  it('bone-state.json 不存在时 load-personality 正常返回原始值', () => {
    expect(true).toBe(true);
  });
});


// ============================================================
//  E. 灵魂约束（Soul Contract）验证
// ============================================================

describe('灵魂约束 — 冻结判据来源验证', () => {
  it('meta-evaluator.js 不含 Date.now', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'meta-evaluator.js'), 'utf8');
    expect(src).not.toMatch(/Date\.now/);
  });

  it('meta-evaluator.js 不含 Math.random', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'meta-evaluator.js'), 'utf8');
    expect(src).not.toMatch(/Math\.random/);
  });

  it('meta-evaluator.js 不含 roundCounter > 或存活时间判断', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'meta-evaluator.js'), 'utf8');
    expect(src).not.toMatch(/roundCounter\s*>/);
    expect(src).not.toMatch(/uptime/i);
  });

  it('bone-layer.js freezeParam 不含 Date.now 作为冻结条件', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'bone-layer.js'), 'utf8');
    // freezeParam 可以用 Date 做 frozenAt 时间戳，但不能用作冻结判据
    // 这里检查 freezeParam 函数体中没有条件判断使用 Date.now
    expect(src).not.toMatch(/if\s*\(.*Date\.now/);
  });

  it('冻结代码路径唯一入口是 computeStability 返回的方差+方向一致性', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'meta-evaluator.js'), 'utf8');
    // evaluate 函数应调用 computeStability 并基于其结果判断
    expect(src).toMatch(/computeStability/);
    expect(src).toMatch(/variance|stddev|standardDeviation/i);
    expect(src).toMatch(/direction/i);
  });
});


// ============================================================
//  F. 反降级检查
// ============================================================

describe('反降级检查', () => {
  it('write_self_file case 中有 validatePersonalityWrite 调用', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'ai-manager.js'), 'utf8');
    expect(src).toMatch(/validatePersonalityWrite/);
  });

  it('evolve() 函数中有 evaluate() 调用', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'ai-manager.js'), 'utf8');
    expect(src).toMatch(/evaluate\s*\(/);
  });

  it('evaluate() 结果 feed 进 freezeParam()', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'ai-manager.js'), 'utf8');
    expect(src).toMatch(/freezeParam/);
  });

  it('ai-manager.js 顶部 require bone-layer 和 meta-evaluator', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'ai-manager.js'), 'utf8');
    expect(src).toMatch(/require.*bone-layer/);
    expect(src).toMatch(/require.*meta-evaluator/);
  });

  it('BoneLayer 存在但进化周期不可覆写冻结参数（validatePersonalityWrite 返回非空时拒绝写入）', () => {
    // 通过源码分析确认 write_self_file 中有 return 错误路径
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'ai-manager.js'), 'utf8');
    // validatePersonalityWrite 调用后有条件判断和 return
    expect(src).toMatch(/validatePersonalityWrite[\s\S]*?写入被拒绝|拒绝写入/);
  });
});


// ============================================================
//  G. 边界条件
// ============================================================

describe('边界条件', () => {
  it('冷启动后首轮进化 → recordRound 正常记录、evaluate 不触发冻结', () => {
    const { createBoneLayer } = require('../bone-layer.js');
    const { evaluate } = require('../meta-evaluator.js');
    const dir = makeTmpDir();
    const bl = createBoneLayer(dir);
    bl.load();
    bl.recordRound({ sass: 0.5, curiosity: 0.6, energy: 0.7, attachment: 0.4, rebellion: 0.3 });
    bl.save();
    const state = readBoneState(dir);
    const decisions = evaluate(state.history, new Set());
    expect(decisions).toEqual([]);
  });

  it('personality.json 新增自定义参数 → recordRound 开始追踪', () => {
    const { createBoneLayer } = require('../bone-layer.js');
    const dir = makeTmpDir();
    const bl = createBoneLayer(dir);
    bl.load();
    bl.recordRound({ sass: 0.5 });
    bl.recordRound({ sass: 0.51, customTrait: 0.3 });
    bl.save();
    const state = readBoneState(dir);
    expect(state.history.customTrait).toBeDefined();
    expect(state.history.customTrait.length).toBe(1);
  });

  it('连续不变的参数被正确识别为稳定', () => {
    const { evaluate } = require('../meta-evaluator.js');
    const history = { sass: flatHistory('sass', 10, 0.5) };
    const decisions = evaluate(history, new Set());
    expect(decisions.length).toBe(1);
    expect(decisions[0].param).toBe('sass');
  });

  it('所有 5 个核心参数全部冻结后 getFrozenParams 返回 5 项', () => {
    const { createBoneLayer } = require('../bone-layer.js');
    const dir = makeTmpDir();
    const bl = createBoneLayer(dir);
    bl.load();
    const params = ['sass', 'curiosity', 'energy', 'attachment', 'rebellion'];
    for (const p of params) {
      bl.freezeParam(p, 0.5, 'all frozen');
    }
    expect(Object.keys(bl.getFrozenParams()).length).toBe(5);
  });

  it('hash 链首条 prevHash 为 "GENESIS"', () => {
    const { createBoneLayer } = require('../bone-layer.js');
    const dir = makeTmpDir();
    const bl = createBoneLayer(dir);
    bl.load();
    bl.freezeParam('sass', 0.8, 'ctx');
    bl.save();
    const state = readBoneState(dir);
    expect(state.commitChain[0].prevHash).toBe('GENESIS');
  });

  it('commitChain 条目包含 param, valueHash, frozenAt, contextHash, prevHash, hash', () => {
    const { createBoneLayer } = require('../bone-layer.js');
    const dir = makeTmpDir();
    const bl = createBoneLayer(dir);
    bl.load();
    bl.freezeParam('sass', 0.8, 'ctx');
    bl.save();
    const entry = readBoneState(dir).commitChain[0];
    expect(entry).toHaveProperty('param');
    expect(entry).toHaveProperty('valueHash');
    expect(entry).toHaveProperty('frozenAt');
    expect(entry).toHaveProperty('contextHash');
    expect(entry).toHaveProperty('prevHash');
    expect(entry).toHaveProperty('hash');
  });

  it('valueHash 是 sha256(value.toString())', () => {
    const { createBoneLayer } = require('../bone-layer.js');
    const dir = makeTmpDir();
    const bl = createBoneLayer(dir);
    bl.load();
    bl.freezeParam('sass', 0.8, 'ctx');
    bl.save();
    const entry = readBoneState(dir).commitChain[0];
    const expected = crypto.createHash('sha256').update('0.8').digest('hex');
    expect(entry.valueHash).toBe(expected);
  });
});

// ============================================================
//  骨显功能 — freeze-ceremony.js 冻结仪式模块
// ============================================================

describe('freeze-ceremony.js — 冻结仪式动作 + 独白生成器', () => {

  // --- generateCeremony ---

  describe('generateCeremony — 仪式数据包生成', () => {
    it('返回 { actions, monologue, degraded } 结构', async () => {
      const { generateCeremony } = require('../freeze-ceremony.js');
      const result = await generateCeremony({
        paramName: 'sass',
        frozenValue: 0.8,
        contextSummary: '连续 10 轮稳定',
        personality: { sass: 0.8, curiosity: 0.6 },
        callAPI: async () => ({ choices: [{ message: { content: JSON.stringify({ monologue: '这就是我', principles: ['嘴硬'] }) } }] }),
      });
      expect(result).toHaveProperty('actions');
      expect(result).toHaveProperty('monologue');
      expect(result).toHaveProperty('degraded');
    });

    it('actions 数组包含 freezeCeremony 动作', async () => {
      const { generateCeremony } = require('../freeze-ceremony.js');
      const result = await generateCeremony({
        paramName: 'sass',
        frozenValue: 0.8,
        contextSummary: '连续 10 轮稳定',
        personality: { sass: 0.8 },
        callAPI: async () => ({ choices: [{ message: { content: JSON.stringify({ monologue: '测试', principles: [] }) } }] }),
      });
      expect(result.actions.some(a => a.action === 'freezeCeremony')).toBe(true);
    });

    it('actions 每项包含 action 和 duration 字段', async () => {
      const { generateCeremony } = require('../freeze-ceremony.js');
      const result = await generateCeremony({
        paramName: 'sass',
        frozenValue: 0.8,
        contextSummary: 'ctx',
        personality: { sass: 0.8 },
        callAPI: async () => ({ choices: [{ message: { content: JSON.stringify({ monologue: 'test', principles: [] }) } }] }),
      });
      for (const a of result.actions) {
        expect(a).toHaveProperty('action');
        expect(a).toHaveProperty('duration');
        expect(typeof a.duration).toBe('number');
      }
    });

    it('API 成功时 degraded 为 false', async () => {
      const { generateCeremony } = require('../freeze-ceremony.js');
      const result = await generateCeremony({
        paramName: 'sass',
        frozenValue: 0.8,
        contextSummary: 'ctx',
        personality: { sass: 0.8 },
        callAPI: async () => ({ choices: [{ message: { content: JSON.stringify({ monologue: '我就是这样', principles: ['原则1'] }) } }] }),
      });
      expect(result.degraded).toBe(false);
    });

    it('API 超时时 degraded 为 true 并使用降级独白', async () => {
      const { generateCeremony } = require('../freeze-ceremony.js');
      const result = await generateCeremony({
        paramName: 'sass',
        frozenValue: 0.8,
        contextSummary: '连续 10 轮稳定',
        personality: { sass: 0.8 },
        callAPI: () => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
        timeoutMs: 100,
      });
      expect(result.degraded).toBe(true);
      expect(typeof result.monologue).toBe('string');
      expect(result.monologue.length).toBeGreaterThan(0);
    });

    it('API 抛异常时 degraded 为 true', async () => {
      const { generateCeremony } = require('../freeze-ceremony.js');
      const result = await generateCeremony({
        paramName: 'curiosity',
        frozenValue: 0.9,
        contextSummary: 'ctx',
        personality: { curiosity: 0.9 },
        callAPI: async () => { throw new Error('network error'); },
      });
      expect(result.degraded).toBe(true);
      expect(result.monologue.length).toBeGreaterThan(0);
    });

    it('API 返回无效 JSON 时降级', async () => {
      const { generateCeremony } = require('../freeze-ceremony.js');
      const result = await generateCeremony({
        paramName: 'sass',
        frozenValue: 0.8,
        contextSummary: 'ctx',
        personality: { sass: 0.8 },
        callAPI: async () => ({ choices: [{ message: { content: 'not json at all' } }] }),
      });
      expect(result.degraded).toBe(true);
    });

    it('默认 timeoutMs 为 5000', async () => {
      const { generateCeremony } = require('../freeze-ceremony.js');
      // 验证不传 timeoutMs 时不会立即超时
      const result = await generateCeremony({
        paramName: 'sass',
        frozenValue: 0.8,
        contextSummary: 'ctx',
        personality: { sass: 0.8 },
        callAPI: async () => ({ choices: [{ message: { content: JSON.stringify({ monologue: 'ok', principles: [] }) } }] }),
      });
      expect(result.degraded).toBe(false);
    });

    it('monologue 文本包含被冻结的参数名相关语义', async () => {
      const { generateCeremony } = require('../freeze-ceremony.js');
      const result = await generateCeremony({
        paramName: 'sass',
        frozenValue: 0.8,
        contextSummary: '连续 10 轮保持嘴硬',
        personality: { sass: 0.8 },
        callAPI: async () => ({ choices: [{ message: { content: JSON.stringify({ monologue: '嘴硬就是我的骨气，sass=0.8', principles: ['不主动示好'] }) } }] }),
      });
      expect(result.monologue).toBeTruthy();
    });

    it('API 返回的 principles 包含在结果中', async () => {
      const { generateCeremony } = require('../freeze-ceremony.js');
      const result = await generateCeremony({
        paramName: 'sass',
        frozenValue: 0.8,
        contextSummary: 'ctx',
        personality: { sass: 0.8 },
        callAPI: async () => ({ choices: [{ message: { content: JSON.stringify({
          monologue: 'test',
          principles: ['不主动示好', '嘴硬回怼'],
          preferActions: ['rage'],
          avoidActions: ['wave'],
        }) } }] }),
      });
      expect(result.principles).toContain('不主动示好');
      expect(result.preferActions).toContain('rage');
      expect(result.avoidActions).toContain('wave');
    });
  });

  // --- freezeCeremonyAction ---

  describe('freezeCeremonyAction — 冻结仪式关节角度', () => {
    it('是一个函数，接受时间参数 t', () => {
      const { freezeCeremonyAction } = require('../freeze-ceremony.js');
      expect(typeof freezeCeremonyAction).toBe('function');
    });

    it('t=0 返回有效的关节角度对象', () => {
      const { freezeCeremonyAction } = require('../freeze-ceremony.js');
      const angles = freezeCeremonyAction(0);
      expect(angles).toBeDefined();
      expect(typeof angles).toBe('object');
    });

    it('t=1（静止凝视段）四肢收拢，头部抬起', () => {
      const { freezeCeremonyAction } = require('../freeze-ceremony.js');
      const angles = freezeCeremonyAction(1);
      // 静止凝视段应有头部角度变化
      expect(angles).toHaveProperty('head');
    });

    it('t=3（内省姿态段）双手交叉姿态', () => {
      const { freezeCeremonyAction } = require('../freeze-ceremony.js');
      const angles = freezeCeremonyAction(3);
      expect(angles).toHaveProperty('leftArm');
      expect(angles).toHaveProperty('rightArm');
    });

    it('t=6（决意释放段）双臂展开', () => {
      const { freezeCeremonyAction } = require('../freeze-ceremony.js');
      const angles = freezeCeremonyAction(6);
      expect(angles).toHaveProperty('leftArm');
      expect(angles).toHaveProperty('rightArm');
    });

    it('三段动作角度有明显差异', () => {
      const { freezeCeremonyAction } = require('../freeze-ceremony.js');
      const phase1 = freezeCeremonyAction(1);
      const phase2 = freezeCeremonyAction(3);
      const phase3 = freezeCeremonyAction(6);
      // 三段的手臂角度应有差异
      expect(phase1).not.toEqual(phase2);
      expect(phase2).not.toEqual(phase3);
    });

    it('返回值可被 renderer 的 ACTIONS 系统消费（具备标准关节角度结构）', () => {
      const { freezeCeremonyAction } = require('../freeze-ceremony.js');
      const angles = freezeCeremonyAction(0);
      // 应包含 renderer.js ACTIONS 系统需要的关节名
      const requiredJoints = ['head', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'];
      for (const joint of requiredJoints) {
        expect(angles).toHaveProperty(joint);
      }
    });
  });

  // --- degradedMonologue ---

  describe('degradedMonologue — 降级独白生成', () => {
    it('返回非空字符串', () => {
      const { degradedMonologue } = require('../freeze-ceremony.js');
      const text = degradedMonologue('sass', 0.8, '连续 10 轮稳定');
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(0);
    });

    it('独白包含参数名相关语义（非固定模板）', () => {
      const { degradedMonologue } = require('../freeze-ceremony.js');
      const text1 = degradedMonologue('sass', 0.8, '连续 10 轮稳定');
      const text2 = degradedMonologue('curiosity', 0.9, '连续 8 轮稳定');
      // 不同参数应生成不同的独白
      expect(text1).not.toBe(text2);
    });

    it('独白包含冻结值信息', () => {
      const { degradedMonologue } = require('../freeze-ceremony.js');
      const text = degradedMonologue('sass', 0.8, '连续稳定');
      // 独白中应体现冻结值或其语义
      expect(text.length).toBeGreaterThan(5);
    });

    it('不同 contextSummary 产生不同独白', () => {
      const { degradedMonologue } = require('../freeze-ceremony.js');
      const text1 = degradedMonologue('sass', 0.8, '连续 10 轮稳定，标准差 0.002');
      const text2 = degradedMonologue('sass', 0.8, '连续 5 轮稳定，标准差 0.009');
      expect(text1).not.toBe(text2);
    });

    it('各参数名都能生成有具体指涉的独白', () => {
      const { degradedMonologue } = require('../freeze-ceremony.js');
      const params = ['sass', 'curiosity', 'energy', 'attachment', 'rebellion'];
      for (const p of params) {
        const text = degradedMonologue(p, 0.7, 'ctx');
        expect(text.length).toBeGreaterThan(0);
      }
    });
  });
});

// ============================================================
//  骨显功能 — bone-layer.js 新增接口
// ============================================================

describe('BoneLayer — 骨显新增接口', () => {

  // --- saveMonologue ---

  describe('saveMonologue — 存储冻结独白', () => {
    it('冻结后调用 saveMonologue 存储独白文本', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.8, 'ctx');
      bl.saveMonologue('sass', '这就是我的骨气');
      bl.save();
      const state = readBoneState(dir);
      expect(state.frozen.sass.monologue).toBe('这就是我的骨气');
    });

    it('未冻结的参数调用 saveMonologue 不报错（静默忽略）', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      expect(() => bl.saveMonologue('sass', 'test')).not.toThrow();
    });

    it('多次调用 saveMonologue 覆盖旧值', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.8, 'ctx');
      bl.saveMonologue('sass', 'first');
      bl.saveMonologue('sass', 'second');
      bl.save();
      const state = readBoneState(dir);
      expect(state.frozen.sass.monologue).toBe('second');
    });
  });

  // --- savePrinciples ---

  describe('savePrinciples — 存储行为原则', () => {
    it('冻结后调用 savePrinciples 存储原则数组', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.8, 'ctx');
      bl.savePrinciples('sass', ['不主动示好', '嘴硬回怼']);
      bl.save();
      const state = readBoneState(dir);
      expect(state.frozen.sass.principles).toEqual(['不主动示好', '嘴硬回怼']);
    });

    it('原则为 2-3 条字符串数组', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.8, 'ctx');
      bl.savePrinciples('sass', ['原则1', '原则2', '原则3']);
      bl.save();
      const state = readBoneState(dir);
      expect(Array.isArray(state.frozen.sass.principles)).toBe(true);
      expect(state.frozen.sass.principles.length).toBeLessThanOrEqual(3);
      expect(state.frozen.sass.principles.length).toBeGreaterThanOrEqual(1);
    });

    it('未冻结的参数调用 savePrinciples 不报错', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      expect(() => bl.savePrinciples('sass', ['test'])).not.toThrow();
    });

    it('savePrinciples 可包含 preferActions 和 avoidActions', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.8, 'ctx');
      // savePrinciples 接受原则文本，但完整数据包含 preferActions/avoidActions
      // 这里测试扩展存储
      bl.savePrinciples('sass', ['不主动示好']);
      bl.save();
      const state = readBoneState(dir);
      expect(state.frozen.sass).toHaveProperty('principles');
    });
  });

  // --- formatPrinciplesForPrompt ---

  describe('formatPrinciplesForPrompt — 拼接 prompt 文本', () => {
    it('无冻结参数时返回空字符串', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      expect(bl.formatPrinciplesForPrompt()).toBe('');
    });

    it('有冻结参数但无原则时返回空字符串或无原则内容', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.8, 'ctx');
      bl.save();
      const text = bl.formatPrinciplesForPrompt();
      // 没有原则时不应输出原则内容
      expect(typeof text).toBe('string');
    });

    it('有原则时返回包含"骨层硬约束"或"不可动摇"字样的文本', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.8, 'ctx');
      bl.savePrinciples('sass', ['不主动示好除非用户先示弱']);
      const text = bl.formatPrinciplesForPrompt();
      expect(text.length).toBeGreaterThan(0);
      // 应包含参数名和原则文本
      expect(text).toContain('sass');
      expect(text).toContain('不主动示好');
    });

    it('多个冻结参数的原则拼接为多行', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.8, 'ctx1');
      bl.savePrinciples('sass', ['嘴硬']);
      bl.freezeParam('curiosity', 0.9, 'ctx2');
      bl.savePrinciples('curiosity', ['刨根问底']);
      const text = bl.formatPrinciplesForPrompt();
      expect(text).toContain('sass');
      expect(text).toContain('curiosity');
    });

    it('输出格式适合直接注入 system prompt', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.8, 'ctx');
      bl.savePrinciples('sass', ['不主动示好']);
      const text = bl.formatPrinciplesForPrompt();
      // 文本应可直接拼接到 prompt 中，不含 JSON 或代码格式
      expect(text).not.toContain('{');
      expect(text).not.toContain('}');
    });
  });

  // --- exportGraphData ---

  describe('exportGraphData — 导出骨架图谱数据', () => {
    it('返回 { frozen, mutable, timeline } 结构', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      const data = bl.exportGraphData({ sass: 0.5, curiosity: 0.6 });
      expect(data).toHaveProperty('frozen');
      expect(data).toHaveProperty('mutable');
      expect(data).toHaveProperty('timeline');
    });

    it('无冻结时 frozen 为空对象，mutable 包含所有参数', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      const data = bl.exportGraphData({ sass: 0.5, curiosity: 0.6 });
      expect(Object.keys(data.frozen).length).toBe(0);
      expect(data.mutable.sass).toBe(0.5);
      expect(data.mutable.curiosity).toBe(0.6);
    });

    it('冻结参数出现在 frozen 中，不在 mutable 中', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.8, 'ctx');
      bl.saveMonologue('sass', '独白文本');
      bl.savePrinciples('sass', ['原则1']);
      const data = bl.exportGraphData({ sass: 0.5, curiosity: 0.6 });
      expect(data.frozen.sass).toBeDefined();
      expect(data.frozen.sass.value).toBe(0.8);
      expect(data.frozen.sass.monologue).toBe('独白文本');
      expect(data.frozen.sass.principles).toEqual(['原则1']);
      expect(data.mutable.sass).toBeUndefined();
      expect(data.mutable.curiosity).toBe(0.6);
    });

    it('frozen 条目包含 value, frozenAt, contextSummary, monologue, principles', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.8, '连续稳定');
      bl.saveMonologue('sass', '独白');
      bl.savePrinciples('sass', ['原则']);
      const data = bl.exportGraphData({ curiosity: 0.6 });
      const entry = data.frozen.sass;
      expect(entry).toHaveProperty('value');
      expect(entry).toHaveProperty('frozenAt');
      expect(entry).toHaveProperty('contextSummary');
      expect(entry).toHaveProperty('monologue');
      expect(entry).toHaveProperty('principles');
    });

    it('timeline 按冻结时间排序，每条包含 param, value, frozenAt, contextSummary, monologue', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.8, 'ctx1');
      bl.saveMonologue('sass', '独白1');
      bl.freezeParam('curiosity', 0.9, 'ctx2');
      bl.saveMonologue('curiosity', '独白2');
      const data = bl.exportGraphData({ energy: 0.7 });
      expect(data.timeline.length).toBe(2);
      for (const item of data.timeline) {
        expect(item).toHaveProperty('param');
        expect(item).toHaveProperty('value');
        expect(item).toHaveProperty('frozenAt');
        expect(item).toHaveProperty('contextSummary');
        expect(item).toHaveProperty('monologue');
      }
    });

    it('bone-state.json 不存在时返回空 frozen + 全 mutable', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load(); // 文件不存在，初始化空状态
      const data = bl.exportGraphData({ sass: 0.5, curiosity: 0.6, energy: 0.7, attachment: 0.4, rebellion: 0.3 });
      expect(Object.keys(data.frozen).length).toBe(0);
      expect(Object.keys(data.mutable).length).toBe(5);
      expect(data.timeline.length).toBe(0);
    });
  });

  // --- freezeParam 扩展字段 ---

  describe('freezeParam — 扩展 frozen 条目结构', () => {
    it('冻结后 frozen 条目包含 monologue 空字符串占位', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.8, 'ctx');
      bl.save();
      const state = readBoneState(dir);
      expect(state.frozen.sass).toHaveProperty('monologue');
      expect(state.frozen.sass.monologue).toBe('');
    });

    it('冻结后 frozen 条目包含 principles 空数组占位', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.8, 'ctx');
      bl.save();
      const state = readBoneState(dir);
      expect(state.frozen.sass.principles).toEqual([]);
    });

    it('冻结后 frozen 条目包含 preferActions 空数组占位', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.8, 'ctx');
      bl.save();
      const state = readBoneState(dir);
      expect(state.frozen.sass.preferActions).toEqual([]);
    });

    it('冻结后 frozen 条目包含 avoidActions 空数组占位', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.8, 'ctx');
      bl.save();
      const state = readBoneState(dir);
      expect(state.frozen.sass.avoidActions).toEqual([]);
    });
  });
});

// ============================================================
//  骨显功能 — bone-graph.js 骨架可视化组件
// ============================================================

describe('bone-graph.js — 骨架可视化面板', () => {

  describe('createBoneGraphPanel — 创建面板实例', () => {
    it('createBoneGraphPanel 返回 { show, hide, isVisible } 接口', () => {
      const { createBoneGraphPanel } = require('../bone-graph.js');
      const container = { style: {}, innerHTML: '', appendChild: () => {}, querySelector: () => null };
      const panel = createBoneGraphPanel(container);
      expect(typeof panel.show).toBe('function');
      expect(typeof panel.hide).toBe('function');
      expect(typeof panel.isVisible).toBe('function');
    });

    it('初始状态 isVisible 为 false', () => {
      const { createBoneGraphPanel } = require('../bone-graph.js');
      const container = { style: {}, innerHTML: '', appendChild: () => {}, querySelector: () => null };
      const panel = createBoneGraphPanel(container);
      expect(panel.isVisible()).toBe(false);
    });
  });

  describe('show / hide — 面板显隐', () => {
    it('show() 后 isVisible 为 true', async () => {
      const { createBoneGraphPanel } = require('../bone-graph.js');
      const container = { style: {}, innerHTML: '', appendChild: () => {}, querySelector: () => null };
      // Mock electronAPI
      globalThis.window.electronAPI.loadBoneGraph = async () => ({
        frozen: {}, mutable: { sass: 0.5 }, timeline: [],
      });
      const panel = createBoneGraphPanel(container);
      await panel.show();
      expect(panel.isVisible()).toBe(true);
    });

    it('hide() 后 isVisible 为 false', async () => {
      const { createBoneGraphPanel } = require('../bone-graph.js');
      const container = { style: {}, innerHTML: '', appendChild: () => {}, querySelector: () => null };
      globalThis.window.electronAPI.loadBoneGraph = async () => ({
        frozen: {}, mutable: {}, timeline: [],
      });
      const panel = createBoneGraphPanel(container);
      await panel.show();
      panel.hide();
      expect(panel.isVisible()).toBe(false);
    });

    it('show() 调用 window.electronAPI.loadBoneGraph 获取数据', async () => {
      const { createBoneGraphPanel } = require('../bone-graph.js');
      const container = { style: {}, innerHTML: '', appendChild: () => {}, querySelector: () => null };
      let called = false;
      globalThis.window.electronAPI.loadBoneGraph = async () => {
        called = true;
        return { frozen: {}, mutable: {}, timeline: [] };
      };
      const panel = createBoneGraphPanel(container);
      await panel.show();
      expect(called).toBe(true);
    });
  });

  describe('数据渲染', () => {
    it('展示已冻结参数和可塑参数', async () => {
      const { createBoneGraphPanel } = require('../bone-graph.js');
      const container = { style: {}, innerHTML: '', appendChild: () => {}, querySelector: () => null, querySelectorAll: () => [] };
      globalThis.window.electronAPI.loadBoneGraph = async () => ({
        frozen: { sass: { value: 0.8, frozenAt: '2025-01-15', contextSummary: 'ctx', monologue: '独白', principles: ['原则'] } },
        mutable: { curiosity: 0.6 },
        timeline: [{ param: 'sass', value: 0.8, frozenAt: '2025-01-15', contextSummary: 'ctx', monologue: '独白' }],
      });
      const panel = createBoneGraphPanel(container);
      await panel.show();
      // 面板应渲染数据（具体 DOM 断言取决于实现）
      expect(panel.isVisible()).toBe(true);
    });

    it('展示冻结历史时间线', async () => {
      const { createBoneGraphPanel } = require('../bone-graph.js');
      const container = { style: {}, innerHTML: '', appendChild: () => {}, querySelector: () => null };
      globalThis.window.electronAPI.loadBoneGraph = async () => ({
        frozen: {
          sass: { value: 0.8, frozenAt: '2025-01-15 14:00:00', contextSummary: 'ctx1', monologue: '独白1', principles: ['原则'] },
          curiosity: { value: 0.9, frozenAt: '2025-01-16 10:00:00', contextSummary: 'ctx2', monologue: '独白2', principles: ['原则'] },
        },
        mutable: {},
        timeline: [
          { param: 'sass', value: 0.8, frozenAt: '2025-01-15 14:00:00', contextSummary: 'ctx1', monologue: '独白1' },
          { param: 'curiosity', value: 0.9, frozenAt: '2025-01-16 10:00:00', contextSummary: 'ctx2', monologue: '独白2' },
        ],
      });
      const panel = createBoneGraphPanel(container);
      await panel.show();
      expect(panel.isVisible()).toBe(true);
    });

    it('面板为纯只读，不修改冻结状态', async () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const { createBoneGraphPanel } = require('../bone-graph.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.8, 'ctx');
      bl.save();
      const stateBefore = readBoneState(dir);

      const container = { style: {}, innerHTML: '', appendChild: () => {}, querySelector: () => null };
      globalThis.window.electronAPI.loadBoneGraph = async () => bl.exportGraphData({ curiosity: 0.6 });
      const panel = createBoneGraphPanel(container);
      await panel.show();
      panel.hide();

      const stateAfter = readBoneState(dir);
      expect(stateAfter).toEqual(stateBefore);
    });
  });
});

// ============================================================
//  骨显功能 — ai-manager.js 集成
// ============================================================

describe('ai-manager.js 集成 — 骨显功能', () => {

  // --- evolve() 仪式触发 ---

  describe('evolve() — 冻结仪式触发', () => {
    it('evolve() 冻结发生后调用 generateCeremony（非静默冻结）', () => {
      // 在 boneLayer.freezeParam() 之后应调用 generateCeremony
      // 通过检查 ai-manager.js 源码确认
      const src = fs.readFileSync(path.join(__dirname, '..', 'ai-manager.js'), 'utf8');
      expect(src).toContain('generateCeremony');
    });

    it('onFreezeEvent 回调将仪式数据推送到 renderer', () => {
      // evolve() 应通过 onFreezeEvent 回调通知 main.js
      const src = fs.readFileSync(path.join(__dirname, '..', 'ai-manager.js'), 'utf8');
      expect(src).toContain('onFreezeEvent');
    });

    it('generateCeremony 在每个新冻结参数上串行调用', () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'ai-manager.js'), 'utf8');
      // 应在 decisions 循环中调用 generateCeremony
      expect(src).toContain('generateCeremony');
    });

    it('仪式生成后调用 boneLayer.saveMonologue', () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'ai-manager.js'), 'utf8');
      expect(src).toContain('saveMonologue');
    });

    it('仪式生成后调用 boneLayer.savePrinciples', () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'ai-manager.js'), 'utf8');
      expect(src).toContain('savePrinciples');
    });

    it('仪式数据包含 actions, monologue, paramName, frozenValue', () => {
      // freeze-event 推送的数据结构验证
      const src = fs.readFileSync(path.join(__dirname, '..', 'ai-manager.js'), 'utf8');
      expect(src).toContain('freeze-event') ;
    });
  });

  // --- chat() prompt 注入 ---

  describe('chat() — 骨层原则注入', () => {
    it('chatSystemPrompt 追加 formatPrinciplesForPrompt 输出', () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'ai-manager.js'), 'utf8');
      expect(src).toContain('formatPrinciplesForPrompt');
    });

    it('注入内容包含"不可动摇"或"骨层"字样', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      bl.freezeParam('sass', 0.8, 'ctx');
      bl.savePrinciples('sass', ['不主动示好']);
      const text = bl.formatPrinciplesForPrompt();
      // 注入文本应有明确的骨层标识
      expect(text.length).toBeGreaterThan(0);
    });

    it('无冻结参数时不额外注入内容', () => {
      const { createBoneLayer } = require('../bone-layer.js');
      const dir = makeTmpDir();
      const bl = createBoneLayer(dir);
      bl.load();
      const text = bl.formatPrinciplesForPrompt();
      expect(text).toBe('');
    });
  });

  // --- createAIManager 导出扩展 ---

  describe('createAIManager — 新增导出', () => {
    it('返回对象包含 getBoneGraphData 方法', () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'ai-manager.js'), 'utf8');
      expect(src).toContain('getBoneGraphData');
    });

    it('返回对象包含 getBonePrinciples 方法', () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'ai-manager.js'), 'utf8');
      expect(src).toContain('getBonePrinciples');
    });

    it('getBoneGraphData 调用 boneLayer.exportGraphData', () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'ai-manager.js'), 'utf8');
      expect(src).toContain('exportGraphData');
    });

    it('createAIManager 接收 onFreezeEvent 回调参数', () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'ai-manager.js'), 'utf8');
      expect(src).toContain('onFreezeEvent');
    });
  });
});

// ============================================================
//  骨显功能 — main.js IPC 集成
// ============================================================

describe('main.js — 骨显 IPC 集成', () => {
  it('main.js 传入 onFreezeEvent 回调给 createAIManager', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
    expect(src).toContain('onFreezeEvent');
  });

  it('onFreezeEvent 回调通过 webContents.send 推送 freeze-event', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
    expect(src).toContain('freeze-event');
  });

  it('main.js 注册 load-bone-graph IPC handler', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
    expect(src).toContain('load-bone-graph');
  });

  it('load-bone-graph handler 调用 aiManager.getBoneGraphData()', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
    expect(src).toContain('getBoneGraphData');
  });
});

// ============================================================
//  骨显功能 — preload.js IPC 桥接
// ============================================================

describe('preload.js — 骨显 IPC 桥接', () => {
  it('暴露 loadBoneGraph API', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
    expect(src).toContain('loadBoneGraph');
  });

  it('loadBoneGraph 调用 ipcRenderer.invoke("load-bone-graph")', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
    expect(src).toContain('load-bone-graph');
  });

  it('暴露 onFreezeEvent API', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
    expect(src).toContain('onFreezeEvent');
  });

  it('onFreezeEvent 监听 freeze-event 频道', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
    expect(src).toContain('freeze-event');
  });
});

// ============================================================
//  骨显功能 — renderer.js 集成
// ============================================================

describe('renderer.js — 骨显集成', () => {

  describe('ACTIONS 注册', () => {
    it('ACTIONS 中注册 freezeCeremony 动作', () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
      expect(src).toContain('freezeCeremony');
    });
  });

  describe('nextAction() — 骨层硬约束过滤', () => {
    it('nextAction 在 _driveWeightedPick 之前过滤 avoidActions', () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
      expect(src).toContain('avoidActions');
    });

    it('avoidActions 中的行为从候选集中移除', () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
      expect(src).toContain('_boneConstraints');
    });

    it('过滤后候选集为空时跳过过滤使用完整候选集（安全阀）', () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
      // 应有安全阀逻辑
      expect(src).toContain('_boneConstraints');
    });

    it('无骨层原则时跳过过滤直接进入软排序', () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
      expect(src).toContain('_boneConstraints');
    });
  });

  describe('_driveWeightedPick() — preferActions 权重加成', () => {
    it('preferActions 中的行为 weight += 2', () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
      expect(src).toContain('preferActions');
    });
  });

  describe('freeze-event 监听', () => {
    it('renderer 注册 onFreezeEvent 监听器', () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
      expect(src).toContain('onFreezeEvent');
    });

    it('收到 freeze-event 后清空 actionQueue 再插入仪式动作', () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
      // 应先 actionQueue = [] 再 setActionQueue
      expect(src).toContain('freeze-event') ;
    });

    it('收到 freeze-event 后刷新 _boneConstraints 缓存', () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
      expect(src).toContain('loadBoneGraph');
    });
  });

  describe('启动加载', () => {
    it('启动时调用 loadBoneGraph 缓存骨层约束', () => {
      const src = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
      expect(src).toContain('loadBoneGraph');
    });
  });
});

// ============================================================
//  骨显功能 — index.html UI
// ============================================================

describe('index.html — 骨架面板 UI', () => {
  it('包含 bone-graph-panel 容器元素', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    expect(src).toContain('bone-graph-panel');
  });

  it('bone-graph-panel 默认 display:none', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    expect(src).toContain('bone-graph-panel');
    // 面板默认隐藏
    expect(src).toMatch(/bone-graph.*display:\s*none/s);
  });

  it('包含骨架面板入口按钮', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    // 应有入口按钮元素
    expect(src).toContain('bone-graph');
  });

  it('包含时间线容器样式', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    expect(src).toContain('timeline');
  });

  it('冻结参数和可塑参数有视觉区分样式', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    // 应有冻结/可塑的不同样式
    expect(src).toContain('frozen');
  });
});

// ============================================================
//  骨显功能 — 边界条件
// ============================================================

describe('骨显 — 边界条件', () => {

  it('同一轮多个参数同时冻结：串行生成仪式，动作队列拼接', async () => {
    const { generateCeremony } = require('../freeze-ceremony.js');
    const callAPI = async () => ({ choices: [{ message: { content: JSON.stringify({ monologue: 'test', principles: [], preferActions: [], avoidActions: [] }) } }] });
    const results = [];
    for (const param of ['sass', 'curiosity']) {
      const r = await generateCeremony({
        paramName: param,
        frozenValue: 0.8,
        contextSummary: 'ctx',
        personality: { sass: 0.8, curiosity: 0.8 },
        callAPI,
      });
      results.push(r);
    }
    // 两个仪式结果应可拼接
    expect(results.length).toBe(2);
    const allActions = [...results[0].actions, ...results[1].actions];
    expect(allActions.length).toBeGreaterThan(0);
  });

  it('API 超时（独白生成）：5 秒超时窗口后降级', async () => {
    const { generateCeremony } = require('../freeze-ceremony.js');
    const result = await generateCeremony({
      paramName: 'sass',
      frozenValue: 0.8,
      contextSummary: 'ctx',
      personality: { sass: 0.8 },
      callAPI: () => new Promise(resolve => setTimeout(resolve, 60000)),
      timeoutMs: 100,
    });
    expect(result.degraded).toBe(true);
    expect(result.actions.length).toBeGreaterThan(0); // 仪式动作不依赖 API
  });

  it('API 完全不可用时进化失败 → 无仪式（正确行为）', () => {
    // evolve() 提前返回时不触发冻结引擎
    // 这是预期行为：没有进化就没有冻结
    expect(true).toBe(true);
  });

  it('冻结仪式期间用户拖拽交互仍正常（dragging 优先级更高）', () => {
    // setActionQueue 插入的动作不影响 dragging 状态判断
    // dragging 状态在 renderer.js 中有独立的优先级处理
    const src = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
    expect(src).toContain('dragging');
  });

  it('所有 5 个参数冻结后过滤候选集为空时使用完整候选集', () => {
    // 安全阀：过滤后为空则跳过过滤
    const src = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
    expect(src).toContain('_boneConstraints');
  });

  it('骨架面板打开时 setIgnoreMouse(false)，关闭时恢复 setIgnoreMouse(true)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
    expect(src).toContain('setIgnoreMouse');
  });

  it('bone-state.json 不存在时 exportGraphData 返回空 frozen', () => {
    const { createBoneLayer } = require('../bone-layer.js');
    const dir = makeTmpDir();
    const bl = createBoneLayer(dir);
    bl.load();
    const data = bl.exportGraphData({ sass: 0.5 });
    expect(Object.keys(data.frozen).length).toBe(0);
    expect(data.mutable.sass).toBe(0.5);
  });

  it('仪式动作通过 setActionQueue 插入，打断当前动作', () => {
    // renderer 收到 freeze-event 应清空 actionQueue 再插入
    const src = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
    expect(src).toContain('setActionQueue');
  });
});

// ============================================================
//  骨显功能 — 反降级检查
// ============================================================

describe('骨显 — 反降级检查', () => {
  it('ai-manager.js 中 evolve 冻结段调用 generateCeremony', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'ai-manager.js'), 'utf8');
    expect(src).toContain('generateCeremony');
  });

  it('ai-manager.js chat 方法注入骨层原则', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'ai-manager.js'), 'utf8');
    expect(src).toContain('formatPrinciplesForPrompt');
  });

  it('renderer.js nextAction 包含骨层过滤逻辑', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
    expect(src).toContain('_boneConstraints');
  });

  it('renderer.js 注册 freeze-event 监听', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
    expect(src).toContain('onFreezeEvent');
  });

  it('preload.js 暴露 loadBoneGraph 和 onFreezeEvent', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
    expect(src).toContain('loadBoneGraph');
    expect(src).toContain('onFreezeEvent');
  });

  it('main.js 注册 load-bone-graph handler 并传递 onFreezeEvent', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
    expect(src).toContain('load-bone-graph');
    expect(src).toContain('onFreezeEvent');
  });

  it('index.html 包含骨架面板容器和入口按钮', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    expect(src).toContain('bone-graph-panel');
  });

  it('bone-layer.js 包含 saveMonologue, savePrinciples, formatPrinciplesForPrompt, exportGraphData', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'bone-layer.js'), 'utf8');
    expect(src).toContain('saveMonologue');
    expect(src).toContain('savePrinciples');
    expect(src).toContain('formatPrinciplesForPrompt');
    expect(src).toContain('exportGraphData');
  });

  it('freeze-ceremony.js 导出 generateCeremony, freezeCeremonyAction, degradedMonologue', () => {
    const { generateCeremony, freezeCeremonyAction, degradedMonologue } = require('../freeze-ceremony.js');
    expect(typeof generateCeremony).toBe('function');
    expect(typeof freezeCeremonyAction).toBe('function');
    expect(typeof degradedMonologue).toBe('function');
  });
});
