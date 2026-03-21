const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const MAX_HISTORY_PER_PARAM = 40;

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

function localTimestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function emptyState() {
  return { roundCounter: 0, history: {}, frozen: {}, commitChain: [] };
}

/**
 * 创建骨层实例。
 * @param {string} baseDir - 项目根目录
 * @returns {BoneLayer}
 */
function createBoneLayer(baseDir) {
  const filePath = path.join(baseDir, 'ai', 'bone-state.json');
  let state = emptyState();

  return {
    /** 内部状态访问（供集成使用） */
    get history() { return state.history; },
    get frozen() { return state.frozen; },

    load() {
      if (!fs.existsSync(filePath)) {
        state = emptyState();
        return;
      }
      try {
        state = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch (_) {
        state = emptyState();
        return;
      }
      // 校验 hash 链，损坏时回退 frozen map 到最后合法快照
      const { valid, lastValidIndex } = this.validateChain();
      if (!valid) {
        console.warn(`[BoneLayer] commitChain 损坏，回退到 lastValidIndex=${lastValidIndex}`);
        // 收集合法冻结的参数名（只取 0..lastValidIndex 的条目）
        const validParams = new Set();
        for (let i = 0; i <= lastValidIndex; i++) {
          validParams.add(state.commitChain[i].param);
        }
        // 从 frozen 中移除不合法的
        const newFrozen = {};
        for (const p of validParams) {
          if (state.frozen[p]) newFrozen[p] = state.frozen[p];
        }
        state.frozen = newFrozen;
      }
    },

    save() {
      const tmpPath = filePath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf8');
      fs.renameSync(tmpPath, filePath);
    },

    resolvePersonality(mutablePersonality) {
      const result = { ...mutablePersonality };
      for (const [param, entry] of Object.entries(state.frozen)) {
        result[param] = entry.value;
      }
      return result;
    },

    getFrozenParams() {
      const map = {};
      for (const [param, entry] of Object.entries(state.frozen)) {
        map[param] = entry.value;
      }
      return map;
    },

    isFrozen(paramName) {
      return paramName in state.frozen;
    },

    recordRound(personality) {
      state.roundCounter++;
      const round = state.roundCounter;
      const ts = localTimestamp();
      for (const [param, value] of Object.entries(personality)) {
        if (!state.history[param]) state.history[param] = [];
        // 插入到最前面（降序，最新在前）
        state.history[param].unshift({ round, value, ts });
        // 截断超过 40 轮的
        if (state.history[param].length > MAX_HISTORY_PER_PARAM) {
          state.history[param] = state.history[param].slice(0, MAX_HISTORY_PER_PARAM);
        }
      }
    },

    freezeParam(paramName, currentValue, contextSummary) {
      // append-only：已冻结的参数不可更新
      if (state.frozen[paramName]) return;

      const frozenAt = localTimestamp();
      state.frozen[paramName] = { value: currentValue, frozenAt, contextSummary, monologue: '', principles: [], preferActions: [], avoidActions: [] };

      // 构建 commitChain 条目
      const valueHash = sha256(currentValue.toString());
      const contextHash = sha256(contextSummary);
      const prevHash = state.commitChain.length > 0
        ? state.commitChain[state.commitChain.length - 1].hash
        : 'GENESIS';
      const hash = sha256(`${paramName}|${valueHash}|${frozenAt}|${contextHash}|${prevHash}`);

      state.commitChain.push({ param: paramName, valueHash, frozenAt, contextHash, prevHash, hash });
    },

    validateChain() {
      if (state.commitChain.length === 0) return { valid: true, lastValidIndex: -1 };

      for (let i = 0; i < state.commitChain.length; i++) {
        const entry = state.commitChain[i];
        const expectedPrevHash = i === 0 ? 'GENESIS' : state.commitChain[i - 1].hash;
        if (entry.prevHash !== expectedPrevHash) {
          return { valid: false, lastValidIndex: i - 1 };
        }
        const expectedHash = sha256(`${entry.param}|${entry.valueHash}|${entry.frozenAt}|${entry.contextHash}|${entry.prevHash}`);
        if (entry.hash !== expectedHash) {
          return { valid: false, lastValidIndex: i - 1 };
        }
      }
      return { valid: true, lastValidIndex: state.commitChain.length - 1 };
    },

    formatFrozenListForPrompt() {
      const entries = Object.entries(state.frozen);
      if (entries.length === 0) return '';
      return entries.map(([param, e]) => `- ${param}: ${e.value}（冻结于 ${e.frozenAt}）`).join('\n');
    },

    validatePersonalityWrite(newPersonality) {
      const violated = [];
      for (const [param, entry] of Object.entries(state.frozen)) {
        if (!(param in newPersonality) || newPersonality[param] !== entry.value) {
          violated.push(param);
        }
      }
      return violated;
    },

    saveMonologue(paramName, monologue) {
      if (state.frozen[paramName]) {
        state.frozen[paramName].monologue = monologue;
      }
    },

    savePrinciples(paramName, principles) {
      if (state.frozen[paramName]) {
        if (Array.isArray(principles)) {
          state.frozen[paramName].principles = principles;
        } else {
          state.frozen[paramName].principles = principles.principles || [];
          state.frozen[paramName].preferActions = principles.preferActions || [];
          state.frozen[paramName].avoidActions = principles.avoidActions || [];
        }
      }
    },

    formatPrinciplesForPrompt() {
      const entries = Object.entries(state.frozen).filter(([, e]) => e.principles && e.principles.length > 0);
      if (entries.length === 0) return '';
      let text = '【不可动摇的信念】\n';
      for (const [param, e] of entries) {
        text += `- ${param} = ${e.value}（已固化）：${e.principles.join('；')}\n`;
      }
      text += '这些是你骨子里的东西，谈到相关话题时语气要笃定，不可妥协。';
      return text;
    },

    exportGraphData(mutablePersonality) {
      const frozen = {};
      for (const [param, e] of Object.entries(state.frozen)) {
        frozen[param] = {
          value: e.value,
          frozenAt: e.frozenAt,
          contextSummary: e.contextSummary,
          monologue: e.monologue || '',
          principles: e.principles || [],
          preferActions: e.preferActions || [],
          avoidActions: e.avoidActions || [],
        };
      }
      const mutable = {};
      if (mutablePersonality) {
        for (const [param, value] of Object.entries(mutablePersonality)) {
          if (!(param in state.frozen)) {
            mutable[param] = value;
          }
        }
      }
      const timeline = state.commitChain.map(c => {
        const f = state.frozen[c.param];
        return {
          param: c.param,
          value: f ? f.value : null,
          frozenAt: c.frozenAt,
          contextSummary: f ? f.contextSummary : '',
          monologue: f ? (f.monologue || '') : '',
        };
      });
      return { frozen, mutable, timeline };
    },
  };
}

module.exports = { createBoneLayer };
