/** 硬编码常量（物理定律） */
const MIN_STABLE_ROUNDS = 5;
const MAX_EVAL_WINDOW = 30;
const VARIANCE_THRESHOLD = 0.01;
const DIRECTION_THRESHOLD = 0.7;

/**
 * 计算单个参数的稳定性指标。
 * @param {number[]} values - 按时间降序排列的值数组（最新在前）
 * @returns {{ stable: boolean, stableRounds: number, variance: number, directionConsistency: number, summary: string }}
 */
function computeStability(values) {
  if (!values || values.length < MIN_STABLE_ROUNDS) {
    return { stable: false, stableRounds: 0, variance: Infinity, directionConsistency: 0, summary: '数据不足' };
  }

  // 标准差计算
  function stddev(arr) {
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
    return Math.sqrt(variance);
  }

  // 从最小窗口开始，向外扩展找最长稳定段
  let window = MIN_STABLE_ROUNDS;
  const maxWindow = Math.min(values.length, MAX_EVAL_WINDOW);

  while (window <= maxWindow) {
    const slice = values.slice(0, window);
    const sd = stddev(slice);
    if (sd > VARIANCE_THRESHOLD) break;
    window++;
  }

  const stableRounds = window - 1;

  if (stableRounds < MIN_STABLE_ROUNDS) {
    const sd = stddev(values.slice(0, MIN_STABLE_ROUNDS));
    return { stable: false, stableRounds, variance: sd, directionConsistency: 0, summary: `标准差 ${sd.toFixed(4)} 超过阈值` };
  }

  // 方向一致性：连续差分中同符号（含零）的比例
  const stableSlice = values.slice(0, stableRounds);
  const diffs = [];
  for (let i = 0; i < stableSlice.length - 1; i++) {
    diffs.push(stableSlice[i] - stableSlice[i + 1]);
  }

  const DIFF_EPSILON = 0.0011; // 略大于 0.001 以避免浮点精度问题
  const nonZeroDiffs = diffs.filter(d => Math.abs(d) > DIFF_EPSILON);
  let directionConsistency;

  if (nonZeroDiffs.length === 0) {
    directionConsistency = 1.0; // 完全静止=完全一致
  } else {
    const positives = nonZeroDiffs.filter(d => d > DIFF_EPSILON).length;
    const negatives = nonZeroDiffs.filter(d => d < -DIFF_EPSILON).length;
    directionConsistency = Math.max(positives, negatives) / nonZeroDiffs.length;
  }

  const variance = stddev(stableSlice);
  const stable = directionConsistency >= DIRECTION_THRESHOLD;

  const summary = `连续 ${stableRounds} 轮稳定，标准差 ${variance.toFixed(4)}，方向一致性 ${directionConsistency.toFixed(2)}`;

  return { stable, stableRounds, variance, directionConsistency, summary };
}

/**
 * 评估所有 mutable 参数，返回应冻结的参数列表。
 * @param {object} history - bone-state.json 中的 history 对象
 * @param {Set<string>} frozenParams - 已冻结参数名 Set（跳过评估）
 * @returns {Array<{ param: string, contextSummary: string }>}
 */
function evaluate(history, frozenParams) {
  const decisions = [];

  for (const [param, entries] of Object.entries(history)) {
    if (frozenParams.has(param)) continue;

    // 提取值数组（history 已按降序存储，最新在前）
    const values = entries.map(e => e.value);

    const result = computeStability(values);
    if (result.stable) {
      decisions.push({ param, contextSummary: result.summary });
    }
  }

  return decisions;
}

module.exports = {
  evaluate,
  computeStability,
  MIN_STABLE_ROUNDS,
  MAX_EVAL_WINDOW,
  VARIANCE_THRESHOLD,
  DIRECTION_THRESHOLD,
};
