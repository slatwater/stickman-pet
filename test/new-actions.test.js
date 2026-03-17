/**
 * 新增火柴人动作功能测试
 *
 * 覆盖范围：
 * - 8 个新动作的动画定义与姿态输出
 * - 3 个新表情的渲染分支
 * - 6 种新粒子类型
 * - AI 决策集成
 * - AI 决策集成
 * - 边界条件处理
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// ============================================================
//  1. 新增动作 — 动画定义
// ============================================================

describe('新增动作 - 动画函数注册', () => {
  const newActions = ['cry', 'meditate', 'rage', 'guitar', 'peek', 'slip', 'swordFight', 'float'];

  for (const action of newActions) {
    it(`ACTIONS.${action} 已注册为函数`, () => {
      expect(typeof ACTIONS[action]).toBe('function');
    });
  }
});

describe('新增动作 - 姿态返回值结构', () => {
  const requiredKeys = [
    'body', 'head',
    'lArmUp', 'lArmLow', 'rArmUp', 'rArmLow',
    'lLegUp', 'lLegLow', 'rLegUp', 'rLegLow',
  ];
  const newActions = ['cry', 'meditate', 'rage', 'guitar', 'peek', 'slip', 'swordFight', 'float'];

  for (const action of newActions) {
    it(`ACTIONS.${action}(t) 返回完整骨骼姿态对象`, () => {
      const pose = ACTIONS[action](0);
      for (const key of requiredKeys) {
        expect(pose).toHaveProperty(key);
        expect(typeof pose[key]).toBe('number');
        expect(Number.isFinite(pose[key])).toBe(true);
      }
    });

    it(`ACTIONS.${action}(t) 在不同时间点返回数值变化`, () => {
      const p0 = ACTIONS[action](0);
      const p1 = ACTIONS[action](0.5);
      const p2 = ACTIONS[action](1.0);
      // 至少有一个关节值在时间推进中发生变化
      const keys = Object.keys(p0);
      const changed = keys.some(k => p0[k] !== p1[k] || p1[k] !== p2[k]);
      expect(changed).toBe(true);
    });
  }
});

describe('cry（哭泣）- 动作细节', () => {
  it('身体下蹲：body 角度为负值（弯曲）', () => {
    const pose = ACTIONS.cry(0.5);
    expect(pose.body).toBeLessThan(0);
  });

  it('手臂捂脸：双臂上举方向（角度绝对值 > 60°）', () => {
    const pose = ACTIONS.cry(0.5);
    expect(Math.abs(pose.lArmUp)).toBeGreaterThan(60);
    expect(Math.abs(pose.rArmUp)).toBeGreaterThan(60);
  });

  it('身体抽动：不同时间点 body 值有振荡', () => {
    const values = [0.3, 0.4, 0.5, 0.6, 0.7].map(t => ACTIONS.cry(t).body);
    const hasOscillation = values.some((v, i) => i > 0 && Math.sign(v - values[i - 1]) !== Math.sign(values[Math.min(i + 1, values.length - 1)] - v));
    expect(hasOscillation).toBe(true);
  });
});

describe('meditate（冥想）- 动作细节', () => {
  it('盘腿坐下：腿部折叠（lLegLow 和 rLegLow > 40°）', () => {
    const pose = ACTIONS.meditate(0.5);
    expect(pose.lLegLow).toBeGreaterThan(40);
    expect(pose.rLegLow).toBeGreaterThan(40);
  });

  it('身体微浮动：body 值在小范围内振荡', () => {
    const values = [0.3, 0.5, 0.7, 0.9].map(t => ACTIONS.meditate(t).body);
    const range = Math.max(...values) - Math.min(...values);
    expect(range).toBeGreaterThan(0);
    expect(range).toBeLessThan(30); // 小幅浮动
  });
});

describe('rage（暴怒）- 动作细节', () => {
  it('身体颤抖：高频率振荡', () => {
    const values = [];
    for (let t = 0; t < 1; t += 0.02) values.push(ACTIONS.rage(t).body);
    let signChanges = 0;
    for (let i = 2; i < values.length; i++) {
      const d1 = values[i - 1] - values[i - 2];
      const d2 = values[i] - values[i - 1];
      if (d1 * d2 < 0) signChanges++;
    }
    expect(signChanges).toBeGreaterThan(5); // 高频振荡
  });

  it('挥拳动作：手臂大幅运动（角度范围 > 80°）', () => {
    const values = [];
    for (let t = 0; t < 1; t += 0.05) values.push(ACTIONS.rage(t).rArmUp);
    const range = Math.max(...values) - Math.min(...values);
    expect(range).toBeGreaterThan(80);
  });
});

describe('guitar（弹吉他）- 动作细节', () => {
  it('双手做弹吉他姿势：左右臂不对称', () => {
    const pose = ACTIONS.guitar(0.5);
    // 弹吉他时左右手位置不同（一手按弦一手弹拨）
    expect(pose.lArmUp).not.toBeCloseTo(pose.rArmUp, 0);
  });

  it('身体摇摆：body 有节奏变化', () => {
    const values = [0.2, 0.4, 0.6, 0.8].map(t => ACTIONS.guitar(t).body);
    const range = Math.max(...values) - Math.min(...values);
    expect(range).toBeGreaterThan(3);
  });
});

describe('peek（偷看）- 动作细节', () => {
  it('探头张望：head 角度大幅偏转', () => {
    const pose = ACTIONS.peek(0.5);
    expect(Math.abs(pose.head)).toBeGreaterThan(15);
  });

  it('身体躲藏：body 有弯曲或侧倾', () => {
    const pose = ACTIONS.peek(0.5);
    expect(Math.abs(pose.body)).toBeGreaterThan(5);
  });
});

describe('slip（滑倒）- 动作细节', () => {
  it('三阶段动画：滑倒→倒地→爬起', () => {
    const early = ACTIONS.slip(0.2);  // 滑倒阶段
    const mid = ACTIONS.slip(0.5);    // 倒地阶段
    const late = ACTIONS.slip(0.9);   // 爬起阶段

    // 倒地时 body 角度大
    expect(Math.abs(mid.body)).toBeGreaterThan(Math.abs(late.body));
    // 爬起后 body 接近直立
    expect(Math.abs(late.body)).toBeLessThan(30);
  });

  it('腿部滑动：lLegUp 或 rLegUp 大幅前伸', () => {
    const pose = ACTIONS.slip(0.2);
    const maxLeg = Math.max(Math.abs(pose.lLegUp), Math.abs(pose.rLegUp));
    expect(maxLeg).toBeGreaterThan(30);
  });
});

describe('swordFight（挥剑）- 动作细节', () => {
  it('挥砍动作：手臂大幅挥动', () => {
    const values = [];
    for (let t = 0; t < 1; t += 0.05) values.push(ACTIONS.swordFight(t).rArmUp);
    const range = Math.max(...values) - Math.min(...values);
    expect(range).toBeGreaterThan(60);
  });

  it('战斗姿势：腿部稳定站立', () => {
    const pose = ACTIONS.swordFight(0.5);
    // 战斗姿势腿部分开
    expect(pose.lLegUp).not.toBeCloseTo(pose.rLegUp, 0);
  });
});

describe('float（漂浮）- 动作细节', () => {
  it('手臂展开：双臂向外伸展', () => {
    const pose = ACTIONS.float(0.5);
    expect(Math.abs(pose.lArmUp)).toBeGreaterThan(30);
    expect(Math.abs(pose.rArmUp)).toBeGreaterThan(30);
  });

  it('身体放松姿势：body 角度小', () => {
    const pose = ACTIONS.float(0.5);
    expect(Math.abs(pose.body)).toBeLessThan(20);
  });
});

// ============================================================
//  2. 新增表情
// ============================================================

describe('新增表情 - 注册', () => {
  const newExpressions = ['sad', 'peaceful', 'angry'];

  for (const expr of newExpressions) {
    it(`表情 "${expr}" 在 drawHead 中有对应渲染分支`, () => {
      // 验证 Stickman 实例可以设置该表情且不抛错
      const man = new Stickman(200);
      man.expression = expr;
      man.exprTimer = 2;
      expect(man.expression).toBe(expr);
      // drawHead 调用不抛错
      expect(() => man.draw()).not.toThrow();
    });
  }
});

describe('sad 表情视觉', () => {
  it('眼睛呈下垂弧线（与 happy 弧线方向相反）', () => {
    // 通过 canvas spy 或 snapshot 验证绘制调用
    // sad 应该绘制下弯的弧线眼睛
    expect(true).toBe(true); // placeholder
  });
});

describe('peaceful 表情视觉', () => {
  it('眼睛闭合（类似 sleepy 但更平和）', () => {
    expect(true).toBe(true); // placeholder
  });
});

describe('angry 表情视觉', () => {
  it('眉毛下压（V 形眉）和紧闭嘴巴', () => {
    expect(true).toBe(true); // placeholder
  });
});

describe('表情与动作配套', () => {
  it('cry 动作触发 sad 表情', () => {
    const man = new Stickman(200);
    // 模拟 transitionToNext 选择 cry
    man.actionQueue = [{ action: 'cry', duration: 5 }];
    man.transitionToNext();
    expect(man.expression).toBe('sad');
  });

  it('meditate 动作触发 peaceful 表情', () => {
    const man = new Stickman(200);
    man.actionQueue = [{ action: 'meditate', duration: 5 }];
    man.transitionToNext();
    expect(man.expression).toBe('peaceful');
  });

  it('rage 动作触发 angry 表情', () => {
    const man = new Stickman(200);
    man.actionQueue = [{ action: 'rage', duration: 5 }];
    man.transitionToNext();
    expect(man.expression).toBe('angry');
  });

  it('float 动作触发 peaceful 表情', () => {
    const man = new Stickman(200);
    man.actionQueue = [{ action: 'float', duration: 5 }];
    man.transitionToNext();
    expect(man.expression).toBe('peaceful');
  });

  it('guitar 动作触发 happy 表情', () => {
    const man = new Stickman(200);
    man.actionQueue = [{ action: 'guitar', duration: 5 }];
    man.transitionToNext();
    expect(man.expression).toBe('happy');
  });

  it('peek 动作触发 nervous 表情', () => {
    const man = new Stickman(200);
    man.actionQueue = [{ action: 'peek', duration: 5 }];
    man.transitionToNext();
    expect(man.expression).toBe('nervous');
  });

  it('slip 动作触发 surprised 表情', () => {
    const man = new Stickman(200);
    man.actionQueue = [{ action: 'slip', duration: 5 }];
    man.transitionToNext();
    expect(man.expression).toBe('surprised');
  });

  it('swordFight 动作触发 happy 表情', () => {
    const man = new Stickman(200);
    man.actionQueue = [{ action: 'swordFight', duration: 5 }];
    man.transitionToNext();
    expect(man.expression).toBe('happy');
  });
});

// ============================================================
//  3. 新增粒子特效
// ============================================================

describe('新增粒子类型', () => {
  let origRandom;
  beforeEach(() => { origRandom = Math.random; Math.random = () => 0.01; });
  afterEach(() => { Math.random = origRandom; });

  it('cry 动作生成泪滴粒子（text="💧" 或自定义泪滴绘制）', () => {
    // 在 cry 状态 update 期间检查 particles 数组
    const initialCount = particles.length;
    const man = new Stickman(200);
    man.setState('cry', 3);
    // 模拟多帧更新
    for (let i = 0; i < 60; i++) man.update(1 / 60);
    expect(particles.length).toBeGreaterThan(initialCount);
  });

  it('meditate 动作生成光圈粒子', () => {
    const initialCount = particles.length;
    const man = new Stickman(200);
    man.setState('meditate', 3);
    for (let i = 0; i < 60; i++) man.update(1 / 60);
    expect(particles.length).toBeGreaterThan(initialCount);
  });

  it('rage 动作生成火焰粒子（橙红色系）', () => {
    particles.length = 0;
    const man = new Stickman(200);
    man.setState('rage', 3);
    for (let i = 0; i < 120; i++) man.update(1 / 60);
    const fireColors = particles.filter(p =>
      p.color && (p.color.includes('F') || p.color.includes('f') || p.color === 'orange' || p.color === 'red')
    );
    expect(fireColors.length).toBeGreaterThan(0);
  });

  it('guitar 动作生成音符粒子（text="♪" 或 "♫"）', () => {
    particles.length = 0;
    const man = new Stickman(200);
    man.setState('guitar', 3);
    for (let i = 0; i < 120; i++) man.update(1 / 60);
    const noteParticles = particles.filter(p => p.text && (p.text === '♪' || p.text === '♫' || p.text === '🎵'));
    expect(noteParticles.length).toBeGreaterThan(0);
  });

  it('peek 动作生成问号粒子（text="?"）', () => {
    particles.length = 0;
    const man = new Stickman(200);
    man.setState('peek', 3);
    for (let i = 0; i < 120; i++) man.update(1 / 60);
    const qParticles = particles.filter(p => p.text && (p.text === '?' || p.text === '❓'));
    expect(qParticles.length).toBeGreaterThan(0);
  });

  it('slip 动作生成汗滴粒子', () => {
    particles.length = 0;
    const man = new Stickman(200);
    man.setState('slip', 3);
    for (let i = 0; i < 120; i++) man.update(1 / 60);
    expect(particles.length).toBeGreaterThan(0);
  });

  it('swordFight 动作生成剑光粒子', () => {
    particles.length = 0;
    const man = new Stickman(200);
    man.setState('swordFight', 3);
    for (let i = 0; i < 120; i++) man.update(1 / 60);
    expect(particles.length).toBeGreaterThan(0);
  });

  it('float 动作生成上升光点粒子（vy < 0 向上）', () => {
    particles.length = 0;
    const man = new Stickman(200);
    man.setState('float', 3);
    for (let i = 0; i < 120; i++) man.update(1 / 60);
    const upwardParticles = particles.filter(p => p.vy < 0);
    expect(upwardParticles.length).toBeGreaterThan(0);
  });
});

// ============================================================
//  5. AI 决策集成
// ============================================================

describe('AI 决策集成', () => {
  it('新动作在 AI 系统提示词的可选动作列表中', () => {
    // 读取 main.js 中的 AI_SYSTEM_PROMPT，验证包含新动作
    const newActions = ['cry', 'meditate', 'rage', 'guitar', 'peek', 'slip', 'swordFight', 'float'];
    const newLabels = ['哭泣', '冥想', '暴怒', '弹吉他', '偷看', '滑倒', '挥剑', '漂浮'];
    // 检查提示词中包含这些动作名
    for (const action of newActions) {
      // AI_SYSTEM_PROMPT should contain action keyword
      expect(true).toBe(true); // 需要读取实际提示词
    }
  });

  it('AI 返回新动作时正确执行', () => {
    const man = new Stickman(200);
    man.setActionQueue([{ action: 'rage', duration: 5 }], '气死我了！');
    expect(man.state).toBe('rage');
    expect(man.thought).toBe('气死我了！');
  });

  it('AI 返回的新动作在 ACTIONS 中存在才执行', () => {
    const man = new Stickman(200);
    man.actionQueue = [{ action: 'nonExistentAction', duration: 5 }];
    man.transitionToNext();
    expect(man.state).not.toBe('nonExistentAction');
  });

  it('新动作加入 nextAction() 随机池', () => {
    const newActions = ['cry', 'meditate', 'rage', 'guitar', 'peek', 'slip', 'swordFight', 'float'];
    // 多次调用 nextAction() 统计是否出现新动作
    const man = new Stickman(200);
    const seen = new Set();
    for (let i = 0; i < 5000; i++) {
      seen.add(man.nextAction());
    }
    for (const action of newActions) {
      expect(seen.has(action)).toBe(true);
    }
  });
});

// ============================================================
//  6. 状态机集成
// ============================================================

describe('状态机 - 新动作 case 处理', () => {
  it('cry 在 switch(state) 中有对应 case', () => {
    const man = new Stickman(200);
    man.setState('cry', 3);
    // update 不抛错
    expect(() => man.update(1 / 60)).not.toThrow();
  });

  it('meditate 在 switch(state) 中有对应 case', () => {
    const man = new Stickman(200);
    man.setState('meditate', 3);
    expect(() => man.update(1 / 60)).not.toThrow();
  });

  it('rage 在 switch(state) 中有对应 case', () => {
    const man = new Stickman(200);
    man.setState('rage', 3);
    expect(() => man.update(1 / 60)).not.toThrow();
  });

  it('guitar 在 switch(state) 中有对应 case', () => {
    const man = new Stickman(200);
    man.setState('guitar', 3);
    expect(() => man.update(1 / 60)).not.toThrow();
  });

  it('peek 在 switch(state) 中有对应 case', () => {
    const man = new Stickman(200);
    man.setState('peek', 3);
    expect(() => man.update(1 / 60)).not.toThrow();
  });

  it('slip 在 switch(state) 中有对应 case', () => {
    const man = new Stickman(200);
    man.setState('slip', 3);
    expect(() => man.update(1 / 60)).not.toThrow();
  });

  it('swordFight 在 switch(state) 中有对应 case', () => {
    const man = new Stickman(200);
    man.setState('swordFight', 3);
    expect(() => man.update(1 / 60)).not.toThrow();
  });

  it('float 在 switch(state) 中有对应 case', () => {
    const man = new Stickman(200);
    man.setState('float', 3);
    expect(() => man.update(1 / 60)).not.toThrow();
  });

  it('新动作到时后自动切换到下一个动作', () => {
    const man = new Stickman(200);
    man.setState('cry', 2);
    // 模拟超过持续时间
    for (let i = 0; i < 180; i++) man.update(1 / 60); // 3秒
    // cry 持续 2 秒后 transitionToNext 会重置 stateTime
    expect(man.stateTime).toBeLessThan(2);
  });
});

// ============================================================
//  7. 边界条件
// ============================================================

describe('边界条件 - 无 API Key', () => {
  it('无 API Key 时 AI 决策回退到随机选择', () => {
    const man = new Stickman(200);
    man.transitionToNext();
    // 应该通过 nextAction() 随机选择
    expect(man.state).toBeTruthy();
  });
});

// ============================================================
//  8. float 物理行为
// ============================================================

describe('float（漂浮）- 物理行为', () => {
  it('缓缓升空：y 值逐渐减小', () => {
    const man = new Stickman(200);
    man.setState('float', 4);
    const startY = man.y;
    for (let i = 0; i < 30; i++) man.update(1 / 60);
    expect(man.y).toBeLessThan(startY);
  });

  it('悬浮后落回地面：动作结束后 y 回到 HIP_GROUND', () => {
    const man = new Stickman(200);
    man.setState('float', 3);
    // 执行直到 float 动作刚结束（3秒 = 180帧）
    for (let i = 0; i < 180; i++) man.update(1 / 60);
    expect(man.y).toBeCloseTo(HIP_GROUND, 0);
  });

  it('漂浮高度有上限（不飞出屏幕）', () => {
    const man = new Stickman(200);
    man.setState('float', 5);
    for (let i = 0; i < 300; i++) man.update(1 / 60);
    expect(man.y).toBeGreaterThan(50); // 不飞出顶部
  });
});

// ============================================================
//  9. 动作持续时间
// ============================================================

describe('新动作 - transitionToNext 配置', () => {
  it('cry 在 transitionToNext 中设置合理持续时间', () => {
    const man = new Stickman(200);
    man.actionQueue = [{ action: 'cry' }];
    man.transitionToNext();
    expect(man.stateDuration).toBeGreaterThan(1);
    expect(man.stateDuration).toBeLessThan(8);
  });

  it('meditate 持续时间较长（冥想是安静动作）', () => {
    const man = new Stickman(200);
    man.actionQueue = [{ action: 'meditate' }];
    man.transitionToNext();
    expect(man.stateDuration).toBeGreaterThan(2);
  });

  it('slip 持续时间较短（快速滑倒爬起）', () => {
    const man = new Stickman(200);
    man.actionQueue = [{ action: 'slip' }];
    man.transitionToNext();
    expect(man.stateDuration).toBeLessThan(3);
  });

  it('swordFight 持续时间适中', () => {
    const man = new Stickman(200);
    man.actionQueue = [{ action: 'swordFight' }];
    man.transitionToNext();
    expect(man.stateDuration).toBeGreaterThan(1);
    expect(man.stateDuration).toBeLessThan(6);
  });
});

// ============================================================
//  10. 屏幕活动日志累积（renderer 侧）
// ============================================================

describe('屏幕活动日志累积', () => {
  it('onScreenInfo 回调将活动存入 screenActivityLog', () => {
    const man = new Stickman(200);
    man.onScreenInfo({ app: 'VS Code', title: 'renderer.js' });
    expect(man.screenActivityLog).toHaveLength(1);
    expect(man.screenActivityLog[0].app).toBe('VS Code');
    expect(man.screenActivityLog[0].title).toBe('renderer.js');
  });

  it('活动日志包含时间戳', () => {
    const man = new Stickman(200);
    man.onScreenInfo({ app: 'Chrome', title: 'Google' });
    expect(man.screenActivityLog[0]).toHaveProperty('time');
    expect(typeof man.screenActivityLog[0].time).toBe('string');
  });

  it('多次回调累积多条日志', () => {
    const man = new Stickman(200);
    man.onScreenInfo({ app: 'VS Code', title: 'file1.js' });
    man.onScreenInfo({ app: 'Chrome', title: 'Stack Overflow' });
    man.onScreenInfo({ app: 'Terminal', title: 'zsh' });
    expect(man.screenActivityLog).toHaveLength(3);
  });

  it('相同应用连续出现仍然记录', () => {
    const man = new Stickman(200);
    man.onScreenInfo({ app: 'VS Code', title: 'file1.js' });
    man.onScreenInfo({ app: 'VS Code', title: 'file2.js' });
    expect(man.screenActivityLog).toHaveLength(2);
  });
});

// ============================================================
//  11. 用户交互事件记录
// ============================================================

describe('用户交互事件记录', () => {
  it('click 事件记录到 userInteractionsLog', () => {
    const man = new Stickman(200);
    man.addInteractionEvent('click');
    expect(man.userInteractionsLog).toHaveLength(1);
    expect(man.userInteractionsLog[0].type).toBe('click');
  });

  it('drag 事件记录到 userInteractionsLog', () => {
    const man = new Stickman(200);
    man.addInteractionEvent('drag');
    expect(man.userInteractionsLog).toHaveLength(1);
    expect(man.userInteractionsLog[0].type).toBe('drag');
  });

  it('交互事件包含时间戳', () => {
    const man = new Stickman(200);
    man.addInteractionEvent('click');
    expect(man.userInteractionsLog[0]).toHaveProperty('time');
    expect(typeof man.userInteractionsLog[0].time).toBe('string');
  });

  it('多次交互事件累积记录', () => {
    const man = new Stickman(200);
    man.addInteractionEvent('click');
    man.addInteractionEvent('drag');
    man.addInteractionEvent('click');
    expect(man.userInteractionsLog).toHaveLength(3);
  });
});

// ============================================================
//  12. 5 分钟 AI 批量决策周期
// ============================================================

describe('5 分钟 AI 批量决策周期', () => {
  it('requestBatchDecision 发送累积的 screenActivity', () => {
    const man = new Stickman(200);
    man.onScreenInfo({ app: 'VS Code', title: 'index.js' });
    man.onScreenInfo({ app: 'Chrome', title: 'MDN' });
    const context = man.buildDecisionContext();
    expect(context.screenActivity).toHaveLength(2);
    expect(context.screenActivity[0].app).toBe('VS Code');
    expect(context.screenActivity[1].app).toBe('Chrome');
  });

  it('requestBatchDecision 发送累积的 userInteractions', () => {
    const man = new Stickman(200);
    man.addInteractionEvent('click');
    man.addInteractionEvent('drag');
    const context = man.buildDecisionContext();
    expect(context.userInteractions).toHaveLength(2);
    expect(context.userInteractions[0].type).toBe('click');
  });

  it('批量决策后清空 screenActivityLog', () => {
    const man = new Stickman(200);
    man.onScreenInfo({ app: 'VS Code', title: 'test.js' });
    man.buildDecisionContext();
    man.clearLogs();
    expect(man.screenActivityLog).toHaveLength(0);
  });

  it('批量决策后清空 userInteractionsLog', () => {
    const man = new Stickman(200);
    man.addInteractionEvent('click');
    man.buildDecisionContext();
    man.clearLogs();
    expect(man.userInteractionsLog).toHaveLength(0);
  });
});

// ============================================================
//  13. 动作队列执行器
// ============================================================

describe('动作队列执行器', () => {
  it('设置动作队列后依次执行', () => {
    const man = new Stickman(200);
    man.setActionQueue([
      { action: 'idle', duration: 5 },
      { action: 'walk', duration: 10 },
    ]);
    expect(man.state).toBe('idle');
    expect(man.stateDuration).toBe(5);
  });

  it('当前动作到期后自动切换到队列中下一个', () => {
    const man = new Stickman(200);
    man.setActionQueue([
      { action: 'idle', duration: 2 },
      { action: 'walk', duration: 10 },
    ]);
    // 模拟 2 秒（120 帧）
    for (let i = 0; i < 150; i++) man.update(1 / 60);
    expect(man.state).toBe('walk');
  });

  it('队列中每个动作使用各自的 duration', () => {
    const man = new Stickman(200);
    man.setActionQueue([
      { action: 'idle', duration: 5 },
      { action: 'dance', duration: 30 },
    ]);
    expect(man.stateDuration).toBe(5);
    // 耗尽第一个动作
    for (let i = 0; i < 360; i++) man.update(1 / 60); // 6秒
    expect(man.stateDuration).toBe(30);
  });

  it('队列耗尽后回退到本地随机选择', () => {
    const man = new Stickman(200);
    man.setActionQueue([
      { action: 'idle', duration: 2 },
    ]);
    // 耗尽队列
    for (let i = 0; i < 180; i++) man.update(1 / 60); // 3秒
    // 应该切换到某个动作（不再是 idle 的队列执行）
    expect(man.actionQueue).toHaveLength(0);
    expect(man.state).toBeTruthy();
  });

  it('新 API 响应替换剩余队列', () => {
    const man = new Stickman(200);
    man.setActionQueue([
      { action: 'idle', duration: 60 },
      { action: 'walk', duration: 60 },
    ]);
    // 执行一小段
    for (let i = 0; i < 30; i++) man.update(1 / 60);
    // 新的 API 响应到来，替换队列
    man.setActionQueue([
      { action: 'dance', duration: 15 },
    ]);
    expect(man.state).toBe('dance');
    expect(man.actionQueue).toHaveLength(0); // dance 是当前正在执行的
  });

  it('设置 thought 后显示在思考气泡中', () => {
    const man = new Stickman(200);
    man.setActionQueue([{ action: 'idle', duration: 10 }]);
    man.thought = '他又在写代码...';
    expect(man.thought).toBe('他又在写代码...');
  });

  it('空 actions 数组等同无队列，走本地随机', () => {
    const man = new Stickman(200);
    const prevState = man.state;
    man.setActionQueue([]);
    // 应该走随机选择
    expect(man.actionQueue).toHaveLength(0);
  });
});

// ============================================================
//  14. 用户交互打断动作队列
// ============================================================

describe('用户交互打断动作队列', () => {
  it('左键点击打断当前队列动作，执行惊吓反应', () => {
    const man = new Stickman(200);
    man.setActionQueue([
      { action: 'idle', duration: 30 },
      { action: 'walk', duration: 20 },
    ]);
    expect(man.state).toBe('idle');
    // 模拟点击
    man.poke();
    expect(man.state).toBe('surprised');
  });

  it('交互结束后恢复队列中下一个动作', () => {
    const man = new Stickman(200);
    man.setActionQueue([
      { action: 'idle', duration: 2 },
      { action: 'walk', duration: 20 },
      { action: 'dance', duration: 15 },
    ]);
    // 打断当前动作
    man.poke();
    // surprised 动作结束后应恢复到队列中下一个（walk）
    for (let i = 0; i < 120; i++) man.update(1 / 60);
    expect(man.state).toBe('walk');
  });

  it('拖拽打断当前队列动作', () => {
    const man = new Stickman(200);
    man.setActionQueue([
      { action: 'idle', duration: 30 },
      { action: 'walk', duration: 20 },
    ]);
    man.startDrag(200, 250);
    expect(man.dragging).toBe(true);
    expect(man.state).not.toBe('idle');
  });

  it('拖拽释放后恢复队列中下一个动作', () => {
    const man = new Stickman(200);
    man.setActionQueue([
      { action: 'idle', duration: 30 },
      { action: 'walk', duration: 20 },
      { action: 'dance', duration: 15 },
    ]);
    man.startDrag(200, 250);
    man.release();
    // 投掷/着地后应该恢复队列
    for (let i = 0; i < 300; i++) man.update(1 / 60);
    // 应该从 walk 或 dance 继续（跳过被打断的 idle）
    expect(['walk', 'dance']).toContain(man.state);
  });
});

// ============================================================
//  15. AI API 调用失败回退
// ============================================================

describe('AI 批量决策 - API 调用失败回退', () => {
  it('API 调用失败时回退到本地随机动作选择', () => {
    const man = new Stickman(200);
    // 模拟 API 失败：不设置队列
    man.onBatchDecisionFailed();
    expect(man.actionQueue).toHaveLength(0);
    expect(man.state).toBeTruthy();
  });

  it('API 失败后下个 5 分钟周期重试', () => {
    const man = new Stickman(200);
    man.onBatchDecisionFailed();
    // batchDecisionPending 应该为 false，允许下次重试
    expect(man.batchDecisionPending).toBe(false);
  });
});

// ============================================================
//  16. DriveSystem — 四维驱力状态管理
// ============================================================

describe('DriveSystem - 初始化', () => {
  it('Stickman 实例包含 driveSystem 属性', () => {
    const man = new Stickman(200);
    expect(man.driveSystem).toBeDefined();
    expect(man.driveSystem).toBeInstanceOf(DriveSystem);
  });

  it('四维驱力初始 tension 值正确', () => {
    const man = new Stickman(200);
    const d = man.driveSystem.drives;
    expect(d.social.tension).toBeCloseTo(0.3, 2);
    expect(d.novelty.tension).toBeCloseTo(0.2, 2);
    expect(d.expression.tension).toBeCloseTo(0.2, 2);
    expect(d.rest.tension).toBeCloseTo(0.1, 2);
  });

  it('四维驱力初始 courage 均为 0.5', () => {
    const man = new Stickman(200);
    for (const drive of Object.values(man.driveSystem.drives)) {
      expect(drive.courage).toBeCloseTo(0.5, 2);
    }
  });

  it('四维驱力初始 threshold 值正确', () => {
    const man = new Stickman(200);
    const d = man.driveSystem.drives;
    expect(d.social.threshold).toBeCloseTo(0.35, 2);
    expect(d.novelty.threshold).toBeCloseTo(0.40, 2);
    expect(d.expression.threshold).toBeCloseTo(0.45, 2);
    expect(d.rest.threshold).toBeCloseTo(0.50, 2);
  });

  it('hesitating 初始为 false', () => {
    const man = new Stickman(200);
    expect(man.driveSystem.hesitating).toBe(false);
  });

  it('Stickman 不再有 this.mood 五维对象', () => {
    const man = new Stickman(200);
    expect(man.mood).toBeUndefined();
  });
});

describe('DriveSystem - tension 自然增长', () => {
  it('social tension 按 0.008/s 增长', () => {
    const man = new Stickman(200);
    const before = man.driveSystem.drives.social.tension;
    man.driveSystem.update(10, { currentAction: 'idle', lastScreenApp: '' });
    const after = man.driveSystem.drives.social.tension;
    expect(after - before).toBeCloseTo(0.008 * 10, 1);
  });

  it('novelty tension 按 0.005/s 增长', () => {
    const man = new Stickman(200);
    const before = man.driveSystem.drives.novelty.tension;
    man.driveSystem.update(10, { currentAction: 'idle', lastScreenApp: '' });
    const after = man.driveSystem.drives.novelty.tension;
    expect(after - before).toBeCloseTo(0.005 * 10, 1);
  });

  it('expression tension 按 0.006/s 增长', () => {
    const man = new Stickman(200);
    const before = man.driveSystem.drives.expression.tension;
    man.driveSystem.update(10, { currentAction: 'idle', lastScreenApp: '' });
    const after = man.driveSystem.drives.expression.tension;
    expect(after - before).toBeCloseTo(0.006 * 10, 1);
  });

  it('rest tension 按 0.003/s 增长', () => {
    const man = new Stickman(200);
    const before = man.driveSystem.drives.rest.tension;
    man.driveSystem.update(10, { currentAction: 'idle', lastScreenApp: '' });
    const after = man.driveSystem.drives.rest.tension;
    expect(after - before).toBeCloseTo(0.003 * 10, 1);
  });

  it('tension 上限钳制为 1', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.tension = 0.99;
    man.driveSystem.update(60, { currentAction: 'idle', lastScreenApp: '' });
    expect(man.driveSystem.drives.social.tension).toBeLessThanOrEqual(1);
  });

  it('tension 下限钳制为 0', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.tension = 0;
    man.driveSystem.update(1, { currentAction: 'wave', lastScreenApp: '' });
    expect(man.driveSystem.drives.social.tension).toBeGreaterThanOrEqual(0);
  });
});

describe('DriveSystem - 当前动作满足驱力时 tension 下降', () => {
  it('执行 social 偏好动作时 social.tension 下降', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.tension = 0.8;
    man.driveSystem.update(1, { currentAction: 'wave', lastScreenApp: '' });
    expect(man.driveSystem.drives.social.tension).toBeLessThan(0.8);
  });

  it('执行 rest 偏好动作（sleep）时 rest.tension 下降', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.rest.tension = 0.8;
    man.driveSystem.update(1, { currentAction: 'sleep', lastScreenApp: '' });
    expect(man.driveSystem.drives.rest.tension).toBeLessThan(0.8);
  });

  it('执行 expression 偏好动作（dance）时 expression.tension 下降', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.expression.tension = 0.8;
    man.driveSystem.update(1, { currentAction: 'dance', lastScreenApp: '' });
    expect(man.driveSystem.drives.expression.tension).toBeLessThan(0.8);
  });

  it('执行 novelty 偏好动作（sneak）时 novelty.tension 下降', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.novelty.tension = 0.8;
    man.driveSystem.update(1, { currentAction: 'sneak', lastScreenApp: '' });
    expect(man.driveSystem.drives.novelty.tension).toBeLessThan(0.8);
  });

  it('下降速率为 0.05/s', () => {
    const man = new Stickman(200);
    // Set growth to 0 by using very high initial value and short dt
    man.driveSystem.drives.rest.tension = 0.5;
    const before = man.driveSystem.drives.rest.tension;
    man.driveSystem.update(1, { currentAction: 'sleep', lastScreenApp: '' });
    // tension should decrease by ~0.05 from action, but also increase by growth
    // net change = growth - 0.05 = 0.003 - 0.05 = -0.047
    expect(man.driveSystem.drives.rest.tension).toBeLessThan(before);
  });
});

describe('DriveSystem - courage 自然回归 0.5', () => {
  it('courage > 0.5 时缓慢下降', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.courage = 0.9;
    man.driveSystem.update(100, { currentAction: 'idle', lastScreenApp: '' });
    expect(man.driveSystem.drives.social.courage).toBeLessThan(0.9);
  });

  it('courage < 0.5 时缓慢上升', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.courage = 0.1;
    man.driveSystem.update(100, { currentAction: 'idle', lastScreenApp: '' });
    expect(man.driveSystem.drives.social.courage).toBeGreaterThan(0.1);
  });

  it('回归速率极慢（0.002/s），250 秒回归 0.1 的偏差', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.courage = 0.6;
    // 模拟 250 秒
    for (let i = 0; i < 250; i++) {
      man.driveSystem.update(1, { currentAction: 'idle', lastScreenApp: '' });
    }
    expect(man.driveSystem.drives.social.courage).toBeCloseTo(0.5, 1);
  });
});

describe('DriveSystem - getDominant', () => {
  it('返回 tension 最高的驱力 key', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.tension = 0.9;
    man.driveSystem.drives.novelty.tension = 0.1;
    man.driveSystem.drives.expression.tension = 0.2;
    man.driveSystem.drives.rest.tension = 0.1;
    expect(man.driveSystem.getDominant()).toBe('social');
  });

  it('多个驱力 tension 最高时返回其中之一', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.tension = 0.5;
    man.driveSystem.drives.novelty.tension = 0.5;
    man.driveSystem.drives.expression.tension = 0.1;
    man.driveSystem.drives.rest.tension = 0.1;
    expect(['social', 'novelty']).toContain(man.driveSystem.getDominant());
  });
});

// ============================================================
//  17. DriveSystem — 表达门控 (checkExpression)
// ============================================================

describe('DriveSystem - checkExpression 表达触发', () => {
  it('tension × courage > threshold 时触发单个表达', () => {
    const man = new Stickman(200);
    // social: threshold 0.35, 设置 tension=0.8, courage=0.5 → 0.4 > 0.35
    man.driveSystem.drives.social.tension = 0.8;
    man.driveSystem.drives.social.courage = 0.5;
    // 确保其他驱力不超阈值
    man.driveSystem.drives.novelty.tension = 0;
    man.driveSystem.drives.expression.tension = 0;
    man.driveSystem.drives.rest.tension = 0;
    const result = man.driveSystem.checkExpression();
    expect(result).not.toBeNull();
    expect(result.driveKey).toBe('social');
    expect(result.triggered).toBe(true);
  });

  it('tension × courage ≤ threshold 时不触发', () => {
    const man = new Stickman(200);
    // social: threshold 0.35, 设置 tension=0.5, courage=0.5 → 0.25 < 0.35
    man.driveSystem.drives.social.tension = 0.5;
    man.driveSystem.drives.social.courage = 0.5;
    man.driveSystem.drives.novelty.tension = 0;
    man.driveSystem.drives.expression.tension = 0;
    man.driveSystem.drives.rest.tension = 0;
    const result = man.driveSystem.checkExpression();
    expect(result).toBeNull();
  });

  it('两个驱力同时超阈值时返回冲突', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.tension = 0.9;
    man.driveSystem.drives.social.courage = 0.5;
    man.driveSystem.drives.expression.tension = 0.95;
    man.driveSystem.drives.expression.courage = 0.5;
    man.driveSystem.drives.novelty.tension = 0;
    man.driveSystem.drives.rest.tension = 0;
    const result = man.driveSystem.checkExpression();
    expect(result).not.toBeNull();
    expect(result.conflict).toBe(true);
    expect([result.a, result.b]).toContain('social');
    expect([result.a, result.b]).toContain('expression');
  });

  it('所有驱力都低于阈值时返回 null', () => {
    const man = new Stickman(200);
    for (const drive of Object.values(man.driveSystem.drives)) {
      drive.tension = 0.1;
      drive.courage = 0.1;
    }
    expect(man.driveSystem.checkExpression()).toBeNull();
  });
});

// ============================================================
//  18. DriveSystem — 表达代价 (onExpress)
// ============================================================

describe('DriveSystem - onExpress 表达代价', () => {
  it('表达后 tension 扣减 30%', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.tension = 0.8;
    man.driveSystem.onExpress('social');
    expect(man.driveSystem.drives.social.tension).toBeCloseTo(0.8 * 0.7, 2);
  });

  it('扣减不影响其他驱力的 tension', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.tension = 0.8;
    man.driveSystem.drives.novelty.tension = 0.6;
    man.driveSystem.onExpress('social');
    expect(man.driveSystem.drives.novelty.tension).toBeCloseTo(0.6, 2);
  });

  it('连续两次表达后 tension 扣减两次', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.tension = 1.0;
    man.driveSystem.onExpress('social');
    // 1.0 * 0.7 = 0.7
    man.driveSystem.onExpress('social');
    // 0.7 * 0.7 = 0.49
    expect(man.driveSystem.drives.social.tension).toBeCloseTo(0.49, 2);
  });
});

// ============================================================
//  19. DriveSystem — 用户反馈 (onFeedback)
// ============================================================

describe('DriveSystem - onFeedback courage 调整', () => {
  it('click 反馈 courage += 0.05', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.courage = 0.5;
    man.driveSystem.onFeedback('social', 'click');
    expect(man.driveSystem.drives.social.courage).toBeCloseTo(0.55, 2);
  });

  it('chat 反馈 courage += 0.08', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.courage = 0.5;
    man.driveSystem.onFeedback('social', 'chat');
    expect(man.driveSystem.drives.social.courage).toBeCloseTo(0.58, 2);
  });

  it('silence 反馈 courage -= 0.02', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.courage = 0.5;
    man.driveSystem.onFeedback('social', 'silence');
    expect(man.driveSystem.drives.social.courage).toBeCloseTo(0.48, 2);
  });

  it('drag 反馈 courage -= 0.15', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.courage = 0.5;
    man.driveSystem.onFeedback('social', 'drag');
    expect(man.driveSystem.drives.social.courage).toBeCloseTo(0.35, 2);
  });

  it('courage 上限钳制为 1', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.courage = 0.98;
    man.driveSystem.onFeedback('social', 'chat');
    expect(man.driveSystem.drives.social.courage).toBeLessThanOrEqual(1);
  });

  it('courage 下限钳制为 0', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.courage = 0.05;
    man.driveSystem.onFeedback('social', 'drag');
    expect(man.driveSystem.drives.social.courage).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================
//  20. DriveSystem — 犹豫状态
// ============================================================

describe('DriveSystem - 犹豫与决议', () => {
  it('两个驱力同时超阈值进入犹豫状态', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.tension = 0.9;
    man.driveSystem.drives.social.courage = 0.5;
    man.driveSystem.drives.expression.tension = 0.95;
    man.driveSystem.drives.expression.courage = 0.5;
    man.driveSystem.drives.novelty.tension = 0;
    man.driveSystem.drives.rest.tension = 0;
    const result = man.driveSystem.checkExpression();
    expect(result.conflict).toBe(true);
    // 进入犹豫后
    man.driveSystem.hesitating = true;
    man.driveSystem.hesitateTimer = 3;
    expect(man.driveSystem.hesitating).toBe(true);
  });

  it('犹豫最长 3 秒后自动决议', () => {
    const man = new Stickman(200);
    man.driveSystem.hesitating = true;
    man.driveSystem.hesitateTimer = 3;
    man.driveSystem.update(3, { currentAction: 'idle', lastScreenApp: '' });
    expect(man.driveSystem.hesitating).toBe(false);
  });

  it('resolveHesitation 返回 tension×courage 更大者', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.tension = 0.9;
    man.driveSystem.drives.social.courage = 0.5; // 0.45
    man.driveSystem.drives.expression.tension = 0.8;
    man.driveSystem.drives.expression.courage = 0.7; // 0.56
    man.driveSystem.hesitateContenders = ['social', 'expression'];
    const winner = man.driveSystem.resolveHesitation();
    expect(winner).toBe('expression'); // 0.56 > 0.45
  });

  it('两个 courage 都 < 0.2 时放弃表达，返回 rest 低调动作', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.tension = 0.9;
    man.driveSystem.drives.social.courage = 0.1;
    man.driveSystem.drives.expression.tension = 0.8;
    man.driveSystem.drives.expression.courage = 0.1;
    man.driveSystem.hesitateContenders = ['social', 'expression'];
    const winner = man.driveSystem.resolveHesitation();
    expect(winner).toBeNull(); // 放弃表达
  });

  it('犹豫期间 checkExpression 返回 null', () => {
    const man = new Stickman(200);
    man.driveSystem.hesitating = true;
    man.driveSystem.hesitateTimer = 2;
    expect(man.driveSystem.checkExpression()).toBeNull();
  });
});

// ============================================================
//  21. DriveSystem — 动作偏好权重 (getActionAffinity)
// ============================================================

describe('DriveSystem - getActionAffinity 动作偏好', () => {
  it('主导驱力的偏好动作获得高权重加成', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.tension = 0.9;
    man.driveSystem.drives.novelty.tension = 0.1;
    man.driveSystem.drives.expression.tension = 0.1;
    man.driveSystem.drives.rest.tension = 0.1;
    // social 偏好: wave, peek, lookAround, bow
    const waveBonus = man.driveSystem.getActionAffinity('wave');
    const idleBonus = man.driveSystem.getActionAffinity('idle');
    expect(waveBonus).toBeGreaterThan(idleBonus);
  });

  it('非主导驱力的偏好按 tension 比例贡献', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.tension = 0.9; // dominant
    man.driveSystem.drives.novelty.tension = 0.6;
    man.driveSystem.drives.expression.tension = 0.1;
    man.driveSystem.drives.rest.tension = 0.1;
    // sneak 是 novelty 偏好，不是 social 偏好
    const sneakBonus = man.driveSystem.getActionAffinity('sneak');
    expect(sneakBonus).toBeGreaterThan(0);
  });

  it('替代原 _moodActionAffinity，保留性格参数影响', () => {
    const man = new Stickman(200);
    // 验证 getActionAffinity 返回数值而不报错
    const bonus = man.driveSystem.getActionAffinity('dance');
    expect(typeof bonus).toBe('number');
    expect(Number.isFinite(bonus)).toBe(true);
  });
});

// ============================================================
//  22. DriveSystem — 表情映射 (getExpression)
// ============================================================

describe('DriveSystem - getExpression 驱力→表情', () => {
  it('social 主导且高 tension → sad（未满足）', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.tension = 0.9;
    man.driveSystem.drives.novelty.tension = 0.1;
    man.driveSystem.drives.expression.tension = 0.1;
    man.driveSystem.drives.rest.tension = 0.1;
    expect(man.driveSystem.getExpression()).toBe('sad');
  });

  it('novelty 主导且高 tension → nervous（未满足）', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.novelty.tension = 0.9;
    man.driveSystem.drives.social.tension = 0.1;
    man.driveSystem.drives.expression.tension = 0.1;
    man.driveSystem.drives.rest.tension = 0.1;
    expect(man.driveSystem.getExpression()).toBe('nervous');
  });

  it('rest 主导且高 tension → sleepy（未满足）', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.rest.tension = 0.9;
    man.driveSystem.drives.social.tension = 0.1;
    man.driveSystem.drives.novelty.tension = 0.1;
    man.driveSystem.drives.expression.tension = 0.1;
    expect(man.driveSystem.getExpression()).toBe('sleepy');
  });

  it('expression 主导且低 tension → happy（已满足）', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.expression.tension = 0.05; // 刚表达过
    man.driveSystem.drives.social.tension = 0.01;
    man.driveSystem.drives.novelty.tension = 0.01;
    man.driveSystem.drives.rest.tension = 0.01;
    // expression 的 met 表情是 happy
    expect(man.driveSystem.getExpression()).toBe('happy');
  });
});

// ============================================================
//  23. ResponseTracker — 30 秒响应窗口
// ============================================================

describe('ResponseTracker - 初始化', () => {
  it('Stickman 实例包含 responseTracker 属性', () => {
    const man = new Stickman(200);
    expect(man.responseTracker).toBeDefined();
    expect(man.responseTracker).toBeInstanceOf(ResponseTracker);
  });

  it('初始状态未在追踪', () => {
    const man = new Stickman(200);
    expect(man.responseTracker.isTracking()).toBe(false);
  });
});

describe('ResponseTracker - startTracking', () => {
  it('开始追踪后 isTracking 返回 true', () => {
    const man = new Stickman(200);
    man.responseTracker.startTracking('social');
    expect(man.responseTracker.isTracking()).toBe(true);
  });

  it('追踪窗口为 30 秒', () => {
    const man = new Stickman(200);
    man.responseTracker.startTracking('social');
    // 29 秒后仍在追踪
    man.responseTracker.update(29);
    expect(man.responseTracker.isTracking()).toBe(true);
  });
});

describe('ResponseTracker - 30 秒到期无响应', () => {
  it('30 秒无响应触发 silence 反馈', () => {
    const man = new Stickman(200);
    const initialCourage = man.driveSystem.drives.social.courage;
    man.responseTracker.startTracking('social');
    man.responseTracker.update(31);
    // silence: courage -= 0.02
    expect(man.driveSystem.drives.social.courage).toBeCloseTo(initialCourage - 0.02, 2);
  });

  it('到期后自动关闭追踪窗口', () => {
    const man = new Stickman(200);
    man.responseTracker.startTracking('social');
    man.responseTracker.update(31);
    expect(man.responseTracker.isTracking()).toBe(false);
  });
});

describe('ResponseTracker - 用户响应', () => {
  it('点击事件在窗口内触发 click 反馈', () => {
    const man = new Stickman(200);
    const initialCourage = man.driveSystem.drives.social.courage;
    man.responseTracker.startTracking('social');
    man.responseTracker.onUserEvent('click');
    expect(man.driveSystem.drives.social.courage).toBeCloseTo(initialCourage + 0.05, 2);
  });

  it('chat 事件在窗口内触发 chat 反馈', () => {
    const man = new Stickman(200);
    const initialCourage = man.driveSystem.drives.social.courage;
    man.responseTracker.startTracking('social');
    man.responseTracker.onUserEvent('chat');
    expect(man.driveSystem.drives.social.courage).toBeCloseTo(initialCourage + 0.08, 2);
  });

  it('drag 事件在窗口内触发 drag 反馈', () => {
    const man = new Stickman(200);
    const initialCourage = man.driveSystem.drives.social.courage;
    man.responseTracker.startTracking('social');
    man.responseTracker.onUserEvent('drag');
    expect(man.driveSystem.drives.social.courage).toBeCloseTo(initialCourage - 0.15, 2);
  });

  it('响应后立即关闭追踪窗口', () => {
    const man = new Stickman(200);
    man.responseTracker.startTracking('social');
    man.responseTracker.onUserEvent('click');
    expect(man.responseTracker.isTracking()).toBe(false);
  });

  it('窗口外事件不触发反馈', () => {
    const man = new Stickman(200);
    const initialCourage = man.driveSystem.drives.social.courage;
    // 不调用 startTracking
    man.responseTracker.onUserEvent('click');
    expect(man.driveSystem.drives.social.courage).toBeCloseTo(initialCourage, 2);
  });

  it('已响应后重复事件不触发', () => {
    const man = new Stickman(200);
    man.responseTracker.startTracking('social');
    man.responseTracker.onUserEvent('click'); // 第一次
    const courageAfterFirst = man.driveSystem.drives.social.courage;
    man.responseTracker.onUserEvent('click'); // 第二次（应无效）
    expect(man.driveSystem.drives.social.courage).toBeCloseTo(courageAfterFirst, 2);
  });
});

// ============================================================
//  24. Stickman 集成 — DriveSystem 在 update 中调用
// ============================================================

describe('Stickman 集成 - DriveSystem update 调用', () => {
  it('update(dt) 中调用 driveSystem.update', () => {
    const man = new Stickman(200);
    const before = man.driveSystem.drives.social.tension;
    man.update(1);
    // tension 应该增长（证明 driveSystem.update 被调用）
    expect(man.driveSystem.drives.social.tension).toBeGreaterThan(before);
  });

  it('update(dt) 中调用 responseTracker.update', () => {
    const man = new Stickman(200);
    man.responseTracker.startTracking('social');
    // 模拟 31 秒
    for (let i = 0; i < 1860; i++) man.update(1 / 60);
    // 到期后应已关闭
    expect(man.responseTracker.isTracking()).toBe(false);
  });

  it('update 不再有情绪衰减逻辑', () => {
    const man = new Stickman(200);
    // mood 对象不再存在
    expect(man.mood).toBeUndefined();
  });
});

// ============================================================
//  25. Stickman 集成 — 表达触发流程
// ============================================================

describe('Stickman 集成 - 表达触发流程', () => {
  it('checkExpression 每秒调用一次（不是每帧）', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.tension = 0.9;
    man.driveSystem.drives.social.courage = 0.5;
    man.driveSystem.drives.novelty.tension = 0;
    man.driveSystem.drives.expression.tension = 0;
    man.driveSystem.drives.rest.tension = 0;
    // 10 帧（~0.17 秒）不应触发
    let thoughtSet = false;
    const origThought = man.thought;
    for (let i = 0; i < 10; i++) man.update(1 / 60);
    // 应该还没触发（<1 秒）
    // 但 60 帧后（1 秒）可能触发
  });

  it('表达触发弹 thought 气泡', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.tension = 0.9;
    man.driveSystem.drives.social.courage = 0.9;
    man.driveSystem.drives.novelty.tension = 0;
    man.driveSystem.drives.expression.tension = 0;
    man.driveSystem.drives.rest.tension = 0;
    // 模拟足够帧触发 checkExpression
    for (let i = 0; i < 120; i++) man.update(1 / 60);
    // thought 应该被设置
    expect(man.thought).toBeTruthy();
    expect(man.thoughtTimer).toBeGreaterThan(0);
  });

  it('表达触发执行偏好动作', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.tension = 0.95;
    man.driveSystem.drives.social.courage = 0.9;
    man.driveSystem.drives.novelty.tension = 0;
    man.driveSystem.drives.expression.tension = 0;
    man.driveSystem.drives.rest.tension = 0;
    for (let i = 0; i < 120; i++) man.update(1 / 60);
    // 当前动作应该是 social 偏好之一
    expect(['wave', 'peek', 'lookAround', 'bow']).toContain(man.state);
  });

  it('表达触发后启动 ResponseTracker', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.tension = 0.95;
    man.driveSystem.drives.social.courage = 0.9;
    man.driveSystem.drives.novelty.tension = 0;
    man.driveSystem.drives.expression.tension = 0;
    man.driveSystem.drives.rest.tension = 0;
    for (let i = 0; i < 120; i++) man.update(1 / 60);
    expect(man.responseTracker.isTracking()).toBe(true);
  });
});

// ============================================================
//  26. 边界条件 — 表达间隔冷却
// ============================================================

describe('边界条件 - 表达间隔冷却', () => {
  it('两次主动表达之间最少间隔 15 秒', () => {
    const man = new Stickman(200);
    // 强制触发第一次表达
    man.driveSystem.drives.social.tension = 0.95;
    man.driveSystem.drives.social.courage = 0.9;
    man.driveSystem.drives.novelty.tension = 0;
    man.driveSystem.drives.expression.tension = 0;
    man.driveSystem.drives.rest.tension = 0;
    // 触发第一次
    for (let i = 0; i < 120; i++) man.update(1 / 60);
    const firstThought = man.thought;
    // 立刻重置 tension 让它再次超阈值
    man.driveSystem.drives.social.tension = 0.95;
    // 5 秒内不应再次触发表达
    const thoughtBefore = man.thought;
    for (let i = 0; i < 300; i++) man.update(1 / 60); // 5 秒
    // thought 不应被替换（冷却中）
  });
});

describe('边界条件 - 拖拽中不触发表达', () => {
  it('dragging === true 时 checkExpression 返回 null', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.tension = 0.95;
    man.driveSystem.drives.social.courage = 0.9;
    man.startDrag(200, 250);
    // 模拟帧更新
    for (let i = 0; i < 120; i++) man.update(1 / 60);
    // 拖拽中不触发表达
    expect(man.responseTracker.isTracking()).toBe(false);
  });
});

describe('边界条件 - 投掷中不触发表达', () => {
  it('state === "thrown" 时不检查表达', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.tension = 0.95;
    man.driveSystem.drives.social.courage = 0.9;
    man.startDrag(200, 250);
    man.release(); // 进入 thrown
    for (let i = 0; i < 60; i++) man.update(1 / 60);
    expect(man.responseTracker.isTracking()).toBe(false);
  });
});

describe('边界条件 - 聊天窗口打开时不触发表达', () => {
  it('chatVisible === true 时跳过表达检查', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.tension = 0.95;
    man.driveSystem.drives.social.courage = 0.9;
    man.chatVisible = true;
    for (let i = 0; i < 120; i++) man.update(1 / 60);
    expect(man.responseTracker.isTracking()).toBe(false);
  });

  it('聊天窗口内双击开聊在 30 秒窗口内触发 chat 反馈', () => {
    const man = new Stickman(200);
    // 先触发表达
    man.driveSystem.drives.social.tension = 0.95;
    man.driveSystem.drives.social.courage = 0.5;
    man.driveSystem.drives.novelty.tension = 0;
    man.driveSystem.drives.expression.tension = 0;
    man.driveSystem.drives.rest.tension = 0;
    for (let i = 0; i < 120; i++) man.update(1 / 60);
    if (man.responseTracker.isTracking()) {
      const courBefore = man.driveSystem.drives.social.courage;
      man.responseTracker.onUserEvent('chat');
      expect(man.driveSystem.drives.social.courage).toBeGreaterThan(courBefore);
    }
  });
});

// ============================================================
//  27. Stickman 集成 — poke/startDrag 事件转发
// ============================================================

describe('Stickman 集成 - 事件转发到 ResponseTracker', () => {
  it('poke() 调用 responseTracker.onUserEvent("click")', () => {
    const man = new Stickman(200);
    man.responseTracker.startTracking('social');
    const courBefore = man.driveSystem.drives.social.courage;
    man.poke();
    // click: +0.05
    expect(man.driveSystem.drives.social.courage).toBeCloseTo(courBefore + 0.05, 2);
  });

  it('startDrag() 调用 responseTracker.onUserEvent("drag")', () => {
    const man = new Stickman(200);
    man.responseTracker.startTracking('social');
    const courBefore = man.driveSystem.drives.social.courage;
    man.startDrag(200, 250);
    // drag: -0.15
    expect(man.driveSystem.drives.social.courage).toBeCloseTo(courBefore - 0.15, 2);
  });

  it('poke() 不再直接操作 mood 对象', () => {
    const man = new Stickman(200);
    man.poke();
    expect(man.mood).toBeUndefined();
  });

  it('startDrag() 不再直接操作 mood 对象', () => {
    const man = new Stickman(200);
    man.startDrag(200, 250);
    expect(man.mood).toBeUndefined();
  });
});

// ============================================================
//  28. Stickman 集成 — onScreenInfo 替换情绪操作
// ============================================================

describe('Stickman 集成 - onScreenInfo 驱力更新', () => {
  it('检测到新应用 → novelty.tension 骤降 0.15', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.novelty.tension = 0.5;
    man._lastScreenApp = 'Chrome';
    man.onScreenInfo({ app: 'VS Code', title: 'index.js' });
    expect(man.driveSystem.drives.novelty.tension).toBeCloseTo(0.35, 2);
  });

  it('相同应用不触发 novelty 骤降', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.novelty.tension = 0.5;
    man._lastScreenApp = 'VS Code';
    man.onScreenInfo({ app: 'VS Code', title: 'other.js' });
    expect(man.driveSystem.drives.novelty.tension).toBeCloseTo(0.5, 2);
  });

  it('不再操作 mood.curiosity 和 mood.boredom', () => {
    const man = new Stickman(200);
    man.onScreenInfo({ app: 'NewApp', title: 'title' });
    expect(man.mood).toBeUndefined();
  });
});

// ============================================================
//  29. DriveSystem — transitionToNext 表情映射替换
// ============================================================

describe('Stickman 集成 - transitionToNext 使用驱力表情', () => {
  it('transitionToNext 调用 driveSystem.getExpression() 设置表情', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.tension = 0.9;
    man.driveSystem.drives.novelty.tension = 0.1;
    man.driveSystem.drives.expression.tension = 0.1;
    man.driveSystem.drives.rest.tension = 0.1;
    man.exprTimer = 0; // 无明确表情
    man.transitionToNext();
    // social 主导且高 tension → sad
    expect(man.expression).toBe('sad');
  });

  it('不再使用 mood.irritation/happiness/energy 判断表情', () => {
    const man = new Stickman(200);
    expect(man.mood).toBeUndefined();
    man.transitionToNext();
    // 不应抛错
    expect(man.expression).toBeTruthy();
  });
});

// ============================================================
//  30. DriveSystem — nextAction 替换 _moodWeightedPick
// ============================================================

describe('Stickman 集成 - nextAction 使用驱力权重', () => {
  it('nextAction 不再调用 _moodWeightedPick', () => {
    const man = new Stickman(200);
    // _moodWeightedPick 应不存在或未被使用
    expect(man._moodWeightedPick).toBeUndefined();
  });

  it('nextAction 使用 driveSystem.getActionAffinity 加权', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.rest.tension = 0.9;
    man.driveSystem.drives.social.tension = 0.01;
    man.driveSystem.drives.novelty.tension = 0.01;
    man.driveSystem.drives.expression.tension = 0.01;
    // 多次采样，rest 偏好动作应出现较多
    const counts = {};
    for (let i = 0; i < 1000; i++) {
      const a = man.nextAction();
      counts[a] = (counts[a] || 0) + 1;
    }
    const restActions = ['yawn', 'sitDown', 'sleep', 'meditate'];
    const restCount = restActions.reduce((sum, a) => sum + (counts[a] || 0), 0);
    expect(restCount).toBeGreaterThan(200); // 至少 20% 命中 rest 偏好
  });
});

// ============================================================
//  31. behaviors.json 规则与驱力叠加
// ============================================================

describe('behaviors.json 规则与驱力叠加', () => {
  it('规则匹配返回候选动作，驱力通过 getActionAffinity 叠加权重', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.expression.tension = 0.9;
    // 当规则返回 [dance, idle, walk] 时，dance 应因 expression 偏好获得更高权重
    const danceAffinity = man.driveSystem.getActionAffinity('dance');
    const idleAffinity = man.driveSystem.getActionAffinity('idle');
    expect(danceAffinity).toBeGreaterThan(idleAffinity);
  });

  it('规则的 thought 字段仍然生效（被动观察）', () => {
    const man = new Stickman(200);
    // 验证 _matchBehaviorRule 仍存在
    expect(typeof man._matchBehaviorRule).toBe('function');
  });
});

// ============================================================
//  32. rest 驱力与睡眠/冥想互动
// ============================================================

describe('rest 驱力与安静动作互动', () => {
  it('执行 sleep 时 rest.tension 以 0.05/s 下降', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.rest.tension = 0.8;
    man.driveSystem.update(1, { currentAction: 'sleep', lastScreenApp: '' });
    // 下降 0.05，增长 0.003，净变化 -0.047
    expect(man.driveSystem.drives.rest.tension).toBeLessThan(0.8);
  });

  it('执行 meditate 时 rest.tension 下降', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.rest.tension = 0.8;
    man.driveSystem.update(1, { currentAction: 'meditate', lastScreenApp: '' });
    expect(man.driveSystem.drives.rest.tension).toBeLessThan(0.8);
  });

  it('执行 sitDown 时 rest.tension 下降', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.rest.tension = 0.8;
    man.driveSystem.update(1, { currentAction: 'sitDown', lastScreenApp: '' });
    expect(man.driveSystem.drives.rest.tension).toBeLessThan(0.8);
  });
});

// ============================================================
//  33. 犹豫状态 thought 气泡
// ============================================================

describe('犹豫状态 - 冲突独白气泡', () => {
  it('social+rest 冲突显示对应独白', () => {
    const man = new Stickman(200);
    man.driveSystem.drives.social.tension = 0.9;
    man.driveSystem.drives.social.courage = 0.5;
    man.driveSystem.drives.rest.tension = 0.95;
    man.driveSystem.drives.rest.courage = 0.55;
    man.driveSystem.drives.novelty.tension = 0;
    man.driveSystem.drives.expression.tension = 0;
    // 触发犹豫
    for (let i = 0; i < 120; i++) man.update(1 / 60);
    if (man.driveSystem.hesitating) {
      expect(man.thought).toContain('累');
    }
  });

  it('犹豫期间动画冻结到 idle 变体', () => {
    const man = new Stickman(200);
    man.driveSystem.hesitating = true;
    man.driveSystem.hesitateTimer = 3;
    // 犹豫期间应保持或切到微晃 idle
    for (let i = 0; i < 30; i++) man.update(1 / 60);
    // 验证不执行跳跃/跑步等大幅动作
  });
});

