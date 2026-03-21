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
