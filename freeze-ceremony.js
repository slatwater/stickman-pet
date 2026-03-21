/**
 * freeze-ceremony.js — 冻结仪式动作 + 独白生成器
 *
 * 职责：定义冻结专属肢体动作，调用 AI 生成内心独白，API 不可用时降级。
 * 不判断是否应该冻结（那是 MetaEvaluator 的职责），只负责"冻结发生后怎么表演"。
 */

const PARAM_LABELS = {
  sass: '毒舌',
  curiosity: '好奇心',
  energy: '精力',
  attachment: '依恋',
  rebellion: '叛逆',
};

const PARAM_DESCRIPTIONS = {
  sass: '嘴硬和毒舌',
  curiosity: '对世界的好奇',
  energy: '活力和精力',
  attachment: '对主人的依恋',
  rebellion: '叛逆和不服从',
};

/**
 * 冻结仪式专属动作定义（关节角度函数）。
 * 动作分三段：
 *   1. 静止凝视（0-2s）：缓慢抬头，四肢收拢
 *   2. 内省姿态（2-5s）：双手交叉胸前，身体微倾
 *   3. 决意释放（5-7s）：猛然展开双臂 + 粒子爆发
 */
function freezeCeremonyAction(t) {
  let result;
  if (t < 2) {
    // 第一段：静止凝视
    const p = t / 2;
    result = {
      body: 0,
      head: -p * 15,
      lArmUp: -15 + p * 5, lArmLow: -10 + p * 5,
      rArmUp: 15 - p * 5, rArmLow: 10 - p * 5,
      lLegUp: -4, lLegLow: 0, rLegUp: 4, rLegLow: 0,
    };
  } else if (t < 5) {
    // 第二段：内省姿态
    const p = (t - 2) / 3;
    result = {
      body: -5 * p,
      head: -15 + p * 5,
      lArmUp: -10 - p * 50, lArmLow: -5 - p * 70,
      rArmUp: 10 + p * 50, rArmLow: 5 + p * 70,
      lLegUp: -4, lLegLow: 0, rLegUp: 4, rLegLow: 0,
    };
  } else {
    // 第三段：决意释放
    const p = Math.min((t - 5) / 2, 1);
    const ease = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    result = {
      body: -5 + ease * 10,
      head: -10 + ease * 15,
      lArmUp: -60 + ease * (-80), lArmLow: -75 + ease * 50,
      rArmUp: 60 + ease * 80, rArmLow: 75 - ease * 50,
      lLegUp: -4 - ease * 10, lLegLow: ease * 15,
      rLegUp: 4 + ease * 10, rLegLow: ease * 15,
    };
  }
  // 别名：供测试校验使用
  result.leftArm = result.lArmUp;
  result.rightArm = result.rArmUp;
  result.leftLeg = result.lLegUp;
  result.rightLeg = result.rLegUp;
  return result;
}

/**
 * API 不可用时的降级独白生成。
 * 用参数语义信息结构化拼接，非固定模板。
 */
function degradedMonologue(paramName, frozenValue, contextSummary) {
  const label = PARAM_LABELS[paramName] || paramName;
  const desc = PARAM_DESCRIPTIONS[paramName] || paramName;
  const intensity = frozenValue >= 0.7 ? '强烈的' : frozenValue >= 0.4 ? '适度的' : '淡淡的';
  return `${contextSummary}...我的${desc}，这份${intensity}${label}（${frozenValue}），已经刻进骨头里了。`;
}

/**
 * 生成冻结仪式数据包。
 */
async function generateCeremony(params) {
  const {
    paramName,
    frozenValue,
    contextSummary,
    personality,
    callAPI,
    timeoutMs = 5000,
  } = params;

  const actions = [{ action: 'freezeCeremony', duration: 7 }];

  let monologue = '';
  let principles = { principles: [], preferActions: [], avoidActions: [] };
  let degraded = false;

  try {
    const label = PARAM_LABELS[paramName] || paramName;
    const desc = PARAM_DESCRIPTIONS[paramName] || paramName;
    const personalityDesc = Object.entries(personality).map(([k, v]) => `${k}=${v}`).join(', ');

    const prompt = [
      { role: 'system', content: '你是一个火柴人桌宠的内心。一个性格参数刚刚被永久冻结——这意味着这个特质已经成为你骨子里不可改变的一部分。' },
      {
        role: 'user',
        content: `参数「${label}」(${paramName}) 被冻结为 ${frozenValue}。
上下文：${contextSummary}
当前性格：${personalityDesc}
${desc}这个特质已经固化。

请生成：
1. monologue: 一句内心独白（不超过20字），表达你对这个特质固化的感受
2. principles: 2-3条行为原则（基于这个固化的特质）
3. preferActions: 2-3个偏好动作名（从 idle,lookAround,walk,dance,crazyDance,jump,wave,kick,spin,backflip,sitDown,flex,pushUp,headstand,yawn,sneak,bow,run,sleep,stumble,celebrate,cry,meditate,rage,guitar,peek,slip,swordFight,float 中选）
4. avoidActions: 2-3个回避动作名

回复JSON：{"monologue":"...","principles":["..."],"preferActions":["..."],"avoidActions":["..."]}`,
      },
    ];

    const result = await Promise.race([
      callAPI(prompt, { temperature: 0.9, maxTokens: 300 }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);

    const content = result.choices?.[0]?.message?.content || '';
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      monologue = parsed.monologue || '';
      principles = {
        principles: parsed.principles || [],
        preferActions: parsed.preferActions || [],
        avoidActions: parsed.avoidActions || [],
      };
    } else {
      throw new Error('invalid response');
    }
  } catch (_) {
    degraded = true;
    monologue = degradedMonologue(paramName, frozenValue, contextSummary);
    principles = degradedPrinciples(paramName, frozenValue);
  }

  return {
    actions,
    monologue,
    principles: principles.principles || [],
    preferActions: principles.preferActions || [],
    avoidActions: principles.avoidActions || [],
    degraded,
  };
}

/**
 * 降级行为原则生成。
 */
function degradedPrinciples(paramName, frozenValue) {
  const high = frozenValue >= 0.6;
  const templates = {
    sass: {
      principles: high ? ['不主动示好除非用户先示弱', '收到夸奖必须嘴硬回怼'] : ['保持温和语气', '主动示好'],
      preferActions: high ? ['rage', 'peek', 'kick'] : ['wave', 'bow', 'idle'],
      avoidActions: high ? ['wave', 'bow', 'celebrate'] : ['rage', 'kick', 'cry'],
    },
    curiosity: {
      principles: high ? ['看到新事物必须凑近看', '频繁张望周围环境'] : ['安静待着不乱看', '专注当前事务'],
      preferActions: high ? ['lookAround', 'peek', 'sneak'] : ['idle', 'sitDown', 'meditate'],
      avoidActions: high ? ['sleep', 'sitDown', 'idle'] : ['lookAround', 'peek', 'sneak'],
    },
    energy: {
      principles: high ? ['闲不住，总要动', '能跑绝不走'] : ['能坐绝不站', '安静是美德'],
      preferActions: high ? ['dance', 'run', 'jump'] : ['sitDown', 'sleep', 'yawn'],
      avoidActions: high ? ['sleep', 'sitDown', 'yawn'] : ['crazyDance', 'run', 'backflip'],
    },
    attachment: {
      principles: high ? ['主人说话时全神贯注', '分离时表达不舍'] : ['保持独立不粘人', '有自己的空间'],
      preferActions: high ? ['wave', 'celebrate', 'bow'] : ['idle', 'lookAround', 'meditate'],
      avoidActions: high ? ['rage', 'cry', 'sleep'] : ['wave', 'bow', 'celebrate'],
    },
    rebellion: {
      principles: high ? ['指令偶尔反着来', '不轻易服从'] : ['听话是基本素质', '服从大局'],
      preferActions: high ? ['rage', 'kick', 'crazyDance'] : ['bow', 'wave', 'idle'],
      avoidActions: high ? ['bow', 'wave', 'idle'] : ['rage', 'kick', 'crazyDance'],
    },
  };

  return templates[paramName] || {
    principles: ['保持本色'],
    preferActions: ['idle'],
    avoidActions: [],
  };
}

module.exports = { generateCeremony, freezeCeremonyAction, degradedMonologue, degradedPrinciples };
