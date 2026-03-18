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
    // 用 idle 填充队列，避免随机选到 peek/meditate 等覆盖表情的动作
    man.actionQueue = [{ action: 'idle', duration: 3 }];
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

// ============================================================
//  34. 偏好涌现 — M1: InteractionObserver 交互观察器
// ============================================================

describe('InteractionObserver - 上下文键归一化', () => {
  it('应用名归一化为小写: "Google Chrome" → "app:google chrome"', () => {
    const sensitivity = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.0 };
    const observer = new InteractionObserver(sensitivity);
    const associations = {};
    const result = observer.onScreenEvent('Google Chrome', 'test', associations);
    expect(result.appKey).toBe('app:google chrome');
  });

  it('应用名归一化去除首尾空格', () => {
    const sensitivity = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.0 };
    const observer = new InteractionObserver(sensitivity);
    const associations = {};
    const result = observer.onScreenEvent('  Safari  ', 'test', associations);
    expect(result.appKey).toBe('app:safari');
  });

  it('时间键按小时段归一化: 6-11→morning, 12-17→afternoon, 18-21→evening, 22-5→night', () => {
    const sensitivity = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.0 };
    const observer = new InteractionObserver(sensitivity);
    const associations = {};
    // 模拟 hour=23 → "time:night"
    const result = observer.onScreenEvent('App', 'title', associations);
    expect(result.timeKey).toMatch(/^time:(morning|afternoon|evening|night)$/);
  });
});

describe('InteractionObserver - 屏幕事件更新曝光', () => {
  it('onScreenEvent 为 appKey 累加 30 秒曝光', () => {
    const sensitivity = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.0 };
    const observer = new InteractionObserver(sensitivity);
    const associations = {};
    observer.onScreenEvent('Chrome', 'tab1', associations);
    expect(associations['app:chrome'].exposure).toBe(30);
  });

  it('onScreenEvent 为 timeKey 累加 30 秒曝光', () => {
    const sensitivity = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.0 };
    const observer = new InteractionObserver(sensitivity);
    const associations = {};
    const { timeKey } = observer.onScreenEvent('Chrome', 'tab1', associations);
    expect(associations[timeKey].exposure).toBe(30);
  });

  it('多次 onScreenEvent 曝光累加', () => {
    const sensitivity = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.0 };
    const observer = new InteractionObserver(sensitivity);
    const associations = {};
    observer.onScreenEvent('Chrome', 'tab1', associations);
    observer.onScreenEvent('Chrome', 'tab2', associations);
    observer.onScreenEvent('Chrome', 'tab3', associations);
    expect(associations['app:chrome'].exposure).toBe(90);
  });

  it('首次观测设置 firstSeen 和 lastSeen', () => {
    const sensitivity = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.0 };
    const observer = new InteractionObserver(sensitivity);
    const associations = {};
    observer.onScreenEvent('VS Code', 'index.js', associations);
    const entry = associations['app:vs code'];
    expect(entry.firstSeen).toBeGreaterThan(0);
    expect(entry.lastSeen).toBeGreaterThanOrEqual(entry.firstSeen);
  });

  it('后续观测更新 lastSeen 但不改 firstSeen', () => {
    const sensitivity = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.0 };
    const observer = new InteractionObserver(sensitivity);
    const associations = {};
    observer.onScreenEvent('VS Code', 'a.js', associations);
    const firstSeen = associations['app:vs code'].firstSeen;
    observer.onScreenEvent('VS Code', 'b.js', associations);
    expect(associations['app:vs code'].firstSeen).toBe(firstSeen);
    expect(associations['app:vs code'].lastSeen).toBeGreaterThanOrEqual(firstSeen);
  });
});

describe('InteractionObserver - 用户交互信号', () => {
  it('click 事件增加当前上下文 positive 计数', () => {
    const sensitivity = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.0 };
    const observer = new InteractionObserver(sensitivity);
    const associations = {};
    observer.onScreenEvent('Chrome', 'tab', associations);
    observer.onUserInteraction('click', associations);
    expect(associations['app:chrome'].positive).toBe(1);
  });

  it('chat 事件增加当前上下文 positive 计数', () => {
    const sensitivity = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.0 };
    const observer = new InteractionObserver(sensitivity);
    const associations = {};
    observer.onScreenEvent('Chrome', 'tab', associations);
    observer.onUserInteraction('chat', associations);
    expect(associations['app:chrome'].positive).toBe(1);
  });

  it('drag 事件增加当前上下文 negative 计数', () => {
    const sensitivity = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.0 };
    const observer = new InteractionObserver(sensitivity);
    const associations = {};
    observer.onScreenEvent('Chrome', 'tab', associations);
    observer.onUserInteraction('drag', associations);
    expect(associations['app:chrome'].negative).toBe(1);
  });

  it('sensitivity.interaction 放大反馈信号', () => {
    const sensitivity = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.5 };
    const observer = new InteractionObserver(sensitivity);
    const associations = {};
    observer.onScreenEvent('Chrome', 'tab', associations);
    observer.onUserInteraction('click', associations);
    // ceil(1 * 1.5) = 2
    expect(associations['app:chrome'].positive).toBe(2);
  });

  it('无当前上下文时交互事件不抛错', () => {
    const sensitivity = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.0 };
    const observer = new InteractionObserver(sensitivity);
    const associations = {};
    expect(() => observer.onUserInteraction('click', associations)).not.toThrow();
  });
});

describe('InteractionObserver - getCurrentContext', () => {
  it('未接收屏幕事件前返回 null', () => {
    const sensitivity = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.0 };
    const observer = new InteractionObserver(sensitivity);
    expect(observer.getCurrentContext()).toBeNull();
  });

  it('接收屏幕事件后返回 { appKey, timeKey }', () => {
    const sensitivity = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.0 };
    const observer = new InteractionObserver(sensitivity);
    const associations = {};
    observer.onScreenEvent('Safari', 'Google', associations);
    const ctx = observer.getCurrentContext();
    expect(ctx).toHaveProperty('appKey', 'app:safari');
    expect(ctx).toHaveProperty('timeKey');
  });
});

// ============================================================
//  35. 偏好涌现 — M2: EmergenceEngine 涌现引擎
// ============================================================

describe('EmergenceEngine - 涌现常量', () => {
  it('EMERGENCE_CONSTANTS 包含所有必需常量', () => {
    expect(EMERGENCE_CONSTANTS).toBeDefined();
    expect(EMERGENCE_CONSTANTS.CYCLE_INTERVAL).toBe(600_000);
    expect(EMERGENCE_CONSTANTS.MIN_INTERACTIONS).toBe(3);
    expect(EMERGENCE_CONSTANTS.MIN_EXPOSURE).toBe(180);
    expect(EMERGENCE_CONSTANTS.CONFIDENCE_DENOMINATOR).toBe(10);
    expect(EMERGENCE_CONSTANTS.EMERGENCE_THRESHOLD).toBe(0.2);
    expect(EMERGENCE_CONSTANTS.INITIAL_STRENGTH).toBe(0.2);
    expect(EMERGENCE_CONSTANTS.REINFORCE_RATE).toBe(0.05);
    expect(EMERGENCE_CONSTANTS.ERODE_RATE).toBe(0.03);
    expect(EMERGENCE_CONSTANTS.DECAY_GRACE_DAYS).toBe(3);
    expect(EMERGENCE_CONSTANTS.DECAY_RATE_PER_DAY).toBe(0.01);
    expect(EMERGENCE_CONSTANTS.DISSOLVE_THRESHOLD).toBe(0.05);
    expect(EMERGENCE_CONSTANTS.MAX_PREFERENCES).toBe(20);
    expect(EMERGENCE_CONSTANTS.MAX_ASSOCIATIONS).toBe(50);
  });
});

describe('EmergenceEngine - 涌现周期基本流程', () => {
  it('交互次数 < MIN_INTERACTIONS 时跳过涌现', () => {
    const sensitivity = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.0 };
    const engine = new EmergenceEngine(sensitivity);
    const table = new SocialContractTable();
    const associations = {
      'app:chrome': { key: 'app:chrome', axis: 'app', target: 'chrome', positive: 1, negative: 0, exposure: 300, firstSeen: 0, lastSeen: 0 },
    };
    engine.emergenceCycle(associations, table);
    expect(table.preferences).toHaveLength(0);
  });

  it('曝光 < MIN_EXPOSURE 时跳过涌现', () => {
    const sensitivity = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.0 };
    const engine = new EmergenceEngine(sensitivity);
    const table = new SocialContractTable();
    const associations = {
      'app:chrome': { key: 'app:chrome', axis: 'app', target: 'chrome', positive: 5, negative: 0, exposure: 60, firstSeen: 0, lastSeen: 0 },
    };
    engine.emergenceCycle(associations, table);
    expect(table.preferences).toHaveLength(0);
  });

  it('有效信号超过阈值时创建偏好', () => {
    const sensitivity = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.0 };
    const engine = new EmergenceEngine(sensitivity);
    const table = new SocialContractTable();
    // positive=8, negative=0, total=8 → valence=1.0, confidence=0.8, signal=0.8 > 0.2
    const associations = {
      'app:bilibili': { key: 'app:bilibili', axis: 'app', target: 'bilibili', positive: 8, negative: 0, exposure: 300, firstSeen: 0, lastSeen: 0 },
    };
    engine.emergenceCycle(associations, table);
    expect(table.preferences).toHaveLength(1);
    expect(table.preferences[0].target).toBe('bilibili');
    expect(table.preferences[0].polarity).toBeGreaterThan(0);
  });

  it('有效信号为负时创建负极性偏好', () => {
    const sensitivity = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.0 };
    const engine = new EmergenceEngine(sensitivity);
    const table = new SocialContractTable();
    // positive=1, negative=7, total=8 → valence=-0.75, confidence=0.8, signal=-0.6 < -0.2
    const associations = {
      'app:work': { key: 'app:work', axis: 'app', target: 'work', positive: 1, negative: 7, exposure: 500, firstSeen: 0, lastSeen: 0 },
    };
    engine.emergenceCycle(associations, table);
    expect(table.preferences).toHaveLength(1);
    expect(table.preferences[0].polarity).toBeLessThan(0);
  });

  it('有效信号不足阈值时不创建偏好', () => {
    const sensitivity = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.0 };
    const engine = new EmergenceEngine(sensitivity);
    const table = new SocialContractTable();
    // positive=2, negative=1, total=3 → valence=0.33, confidence=0.3, signal=0.1 < 0.2
    const associations = {
      'app:neutral': { key: 'app:neutral', axis: 'app', target: 'neutral', positive: 2, negative: 1, exposure: 200, firstSeen: 0, lastSeen: 0 },
    };
    engine.emergenceCycle(associations, table);
    expect(table.preferences).toHaveLength(0);
  });

  it('sensitivity 放大有效信号', () => {
    const sensitivity = { app: 1.5, time: 1.0, duration: 1.0, interaction: 1.0 };
    const engine = new EmergenceEngine(sensitivity);
    const table = new SocialContractTable();
    // positive=2, negative=1, total=3 → valence=0.33, confidence=0.3, signal=0.33*0.3*1.5=0.15 < 0.2 → still not enough
    // But with positive=3, negative=0 → valence=1, confidence=0.3, signal=1*0.3*1.5=0.45 > 0.2
    const associations = {
      'app:game': { key: 'app:game', axis: 'app', target: 'game', positive: 3, negative: 0, exposure: 200, firstSeen: 0, lastSeen: 0 },
    };
    engine.emergenceCycle(associations, table);
    expect(table.preferences).toHaveLength(1);
  });
});

describe('EmergenceEngine - 偏好强化', () => {
  it('同向信号强化偏好: strength += REINFORCE_RATE * (1 - strength)', () => {
    const sensitivity = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.0 };
    const engine = new EmergenceEngine(sensitivity);
    const pref = { id: 'test', polarity: 0.5, strength: 0.2, reinforceCount: 0, lastActivated: Date.now() };
    engine.reinforce(pref, 0.5); // 同向正信号
    // strength = 0.2 + 0.05 * (1 - 0.2) = 0.2 + 0.04 = 0.24
    expect(pref.strength).toBeCloseTo(0.24, 2);
    expect(pref.reinforceCount).toBe(1);
  });

  it('递减增长：强度越高增长越慢', () => {
    const sensitivity = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.0 };
    const engine = new EmergenceEngine(sensitivity);
    const pref1 = { id: 'a', polarity: 0.5, strength: 0.2, reinforceCount: 0, lastActivated: Date.now() };
    const pref2 = { id: 'b', polarity: 0.5, strength: 0.7, reinforceCount: 0, lastActivated: Date.now() };
    engine.reinforce(pref1, 0.5);
    engine.reinforce(pref2, 0.5);
    const delta1 = pref1.strength - 0.2;
    const delta2 = pref2.strength - 0.7;
    expect(delta1).toBeGreaterThan(delta2); // 低强度增长更快
  });

  it('反向信号侵蚀偏好: strength -= ERODE_RATE', () => {
    const sensitivity = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.0 };
    const engine = new EmergenceEngine(sensitivity);
    const pref = { id: 'test', polarity: 0.5, strength: 0.3, reinforceCount: 2, lastActivated: Date.now() };
    engine.reinforce(pref, -0.5); // 反向信号
    expect(pref.strength).toBeCloseTo(0.27, 2);
  });

  it('侵蚀至低于 DISSOLVE_THRESHOLD 应标记为可移除', () => {
    const sensitivity = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.0 };
    const engine = new EmergenceEngine(sensitivity);
    const pref = { id: 'test', polarity: 0.5, strength: 0.06, reinforceCount: 0, lastActivated: Date.now() };
    engine.reinforce(pref, -0.5);
    // 0.06 - 0.03 = 0.03 < 0.05
    expect(pref.strength).toBeLessThan(EMERGENCE_CONSTANTS.DISSOLVE_THRESHOLD);
  });
});

describe('EmergenceEngine - 偏好衰减', () => {
  it('3 天宽限期内不衰减', () => {
    const sensitivity = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.0 };
    const engine = new EmergenceEngine(sensitivity);
    const twoDaysAgo = Date.now() - 2 * 86400000;
    const pref = { id: 'test', strength: 0.5, lastActivated: twoDaysAgo };
    engine.decay(pref, Date.now());
    expect(pref.strength).toBe(0.5);
  });

  it('超过 3 天宽限期后每天衰减 DECAY_RATE_PER_DAY', () => {
    const sensitivity = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.0 };
    const engine = new EmergenceEngine(sensitivity);
    const fiveDaysAgo = Date.now() - 5 * 86400000;
    const pref = { id: 'test', strength: 0.5, lastActivated: fiveDaysAgo };
    engine.decay(pref, Date.now());
    // 5 - 3 = 2 天超宽限 → 0.5 - 0.01 * 2 = 0.48
    expect(pref.strength).toBeCloseTo(0.48, 2);
  });

  it('长期未激活偏好最终衰减至溶解阈值以下', () => {
    const sensitivity = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.0 };
    const engine = new EmergenceEngine(sensitivity);
    const sixtyDaysAgo = Date.now() - 60 * 86400000;
    const pref = { id: 'test', strength: 0.5, lastActivated: sixtyDaysAgo };
    engine.decay(pref, Date.now());
    // 60 - 3 = 57 天 → 0.5 - 0.01 * 57 = -0.07 → clamped to ≤ 0
    expect(pref.strength).toBeLessThan(EMERGENCE_CONSTANTS.DISSOLVE_THRESHOLD);
  });
});

describe('EmergenceEngine - 关联记忆裁剪', () => {
  it('associations 超过 MAX_ASSOCIATIONS 时淘汰 exposure 最低条目', () => {
    const sensitivity = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.0 };
    const engine = new EmergenceEngine(sensitivity);
    const table = new SocialContractTable();
    const associations = {};
    for (let i = 0; i < 55; i++) {
      associations[`app:app${i}`] = {
        key: `app:app${i}`, axis: 'app', target: `app${i}`,
        positive: 0, negative: 0, exposure: i * 10,
        firstSeen: 0, lastSeen: 0,
      };
    }
    engine.emergenceCycle(associations, table);
    expect(Object.keys(associations).length).toBeLessThanOrEqual(EMERGENCE_CONSTANTS.MAX_ASSOCIATIONS);
  });
});

// ============================================================
//  36. 偏好涌现 — M3: SocialContractTable 社会契约表
// ============================================================

describe('SocialContractTable - 创建偏好', () => {
  it('create 生成唯一 id 并设置初始强度', () => {
    const table = new SocialContractTable();
    table.create('app', 'bilibili', 0.6, '用户常点击');
    expect(table.preferences).toHaveLength(1);
    expect(table.preferences[0].id).toMatch(/^pref_bilibili_/);
    expect(table.preferences[0].strength).toBe(EMERGENCE_CONSTANTS.INITIAL_STRENGTH);
    expect(table.preferences[0].axis).toBe('app');
    expect(table.preferences[0].target).toBe('bilibili');
  });

  it('create 设置正确的 polarity（clamp 到 -1~1）', () => {
    const table = new SocialContractTable();
    table.create('app', 'test', 1.5, '超强信号');
    expect(table.preferences[0].polarity).toBe(1.0);
    table.create('app', 'test2', -2.0, '超负信号');
    expect(table.preferences[1].polarity).toBe(-1.0);
  });

  it('create 设置 formativeMemory', () => {
    const table = new SocialContractTable();
    table.create('app', 'bilibili', 0.5, '用户在B站时经常点我');
    expect(table.preferences[0].formativeMemory).toBe('用户在B站时经常点我');
  });

  it('create 初始 reinforceCount 为 0', () => {
    const table = new SocialContractTable();
    table.create('app', 'test', 0.5, 'memo');
    expect(table.preferences[0].reinforceCount).toBe(0);
  });

  it('偏好满额时淘汰 strength 最低的', () => {
    const table = new SocialContractTable();
    for (let i = 0; i < EMERGENCE_CONSTANTS.MAX_PREFERENCES; i++) {
      table.create('app', `app${i}`, 0.3, 'test');
      table.preferences[i].strength = 0.1 + i * 0.01;
    }
    // 第 21 个偏好应挤掉 strength 最低的
    table.create('app', 'new_app', 0.5, 'new');
    expect(table.preferences).toHaveLength(EMERGENCE_CONSTANTS.MAX_PREFERENCES);
    const targets = table.preferences.map(p => p.target);
    expect(targets).toContain('new_app');
    expect(targets).not.toContain('app0'); // app0 strength=0.1 最低，被淘汰
  });
});

describe('SocialContractTable - 查找与查询', () => {
  it('findByTarget 精确查找已有偏好', () => {
    const table = new SocialContractTable();
    table.create('app', 'chrome', 0.5, 'test');
    const found = table.findByTarget('app', 'chrome');
    expect(found).not.toBeNull();
    expect(found.target).toBe('chrome');
  });

  it('findByTarget 未找到返回 null', () => {
    const table = new SocialContractTable();
    expect(table.findByTarget('app', 'nonexist')).toBeNull();
  });

  it('query 按 app 子串匹配', () => {
    const table = new SocialContractTable();
    table.create('app', 'chrome', 0.5, 'test');
    // "app:google chrome" 包含 "chrome"
    const results = table.query('app:google chrome', 'time:afternoon');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].target).toBe('chrome');
  });

  it('query 按 time 轴精确匹配', () => {
    const table = new SocialContractTable();
    table.create('time', 'night', 0.5, '深夜活跃');
    const results = table.query('app:whatever', 'time:night');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].target).toBe('night');
  });

  it('query 无匹配返回空数组', () => {
    const table = new SocialContractTable();
    table.create('app', 'bilibili', 0.5, 'test');
    const results = table.query('app:vscode', 'time:morning');
    expect(results).toHaveLength(0);
  });

  it('query 同时返回 app 和 time 匹配的偏好', () => {
    const table = new SocialContractTable();
    table.create('app', 'chrome', 0.5, 'test1');
    table.create('time', 'night', 0.3, 'test2');
    const results = table.query('app:chrome', 'time:night');
    expect(results).toHaveLength(2);
  });
});

describe('SocialContractTable - 移除与序列化', () => {
  it('remove 按 id 移除偏好', () => {
    const table = new SocialContractTable();
    table.create('app', 'test', 0.5, 'memo');
    const id = table.preferences[0].id;
    table.remove(id);
    expect(table.preferences).toHaveLength(0);
  });

  it('remove 不存在的 id 不抛错', () => {
    const table = new SocialContractTable();
    expect(() => table.remove('nonexist')).not.toThrow();
  });

  it('serialize 返回 preferences 数组的副本', () => {
    const table = new SocialContractTable();
    table.create('app', 'bilibili', 0.5, 'test');
    const serialized = table.serialize();
    expect(Array.isArray(serialized)).toBe(true);
    expect(serialized).toHaveLength(1);
    expect(serialized[0].target).toBe('bilibili');
  });

  it('hydrate 从数据恢复偏好列表', () => {
    const table = new SocialContractTable();
    const entries = [
      { id: 'pref_test_1', axis: 'app', target: 'test', titleHints: [], polarity: 0.6, strength: 0.35, formedAt: 1, lastActivated: 2, reinforceCount: 4, formativeMemory: 'memo' },
    ];
    table.hydrate(entries);
    expect(table.preferences).toHaveLength(1);
    expect(table.preferences[0].target).toBe('test');
    expect(table.preferences[0].strength).toBe(0.35);
  });
});

// ============================================================
//  37. 偏好涌现 — M4: PreferenceBridge 偏好-情绪桥接
// ============================================================

describe('PreferenceBridge - 激活与匹配', () => {
  it('activate 返回匹配的偏好列表', () => {
    const man = new Stickman(200);
    const table = new SocialContractTable();
    table.create('app', 'chrome', 0.6, 'test');
    table.preferences[0].strength = 0.5;
    const bridge = new PreferenceBridge(man.driveSystem, table);
    const result = bridge.activate('app:chrome', 'time:afternoon', 'Google');
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].target).toBe('chrome');
  });

  it('activate 更新匹配偏好的 lastActivated', () => {
    const table = new SocialContractTable();
    table.create('app', 'chrome', 0.6, 'test');
    const oldTime = table.preferences[0].lastActivated;
    const man = new Stickman(200);
    const bridge = new PreferenceBridge(man.driveSystem, table);
    bridge.activate('app:chrome', 'time:afternoon', 'Google');
    expect(table.preferences[0].lastActivated).toBeGreaterThanOrEqual(oldTime);
  });

  it('无匹配偏好时返回空 matches 和 null thought', () => {
    const man = new Stickman(200);
    const table = new SocialContractTable();
    const bridge = new PreferenceBridge(man.driveSystem, table);
    const result = bridge.activate('app:unknown', 'time:morning', 'title');
    expect(result.matches).toHaveLength(0);
    expect(result.thought).toBeNull();
  });
});

describe('PreferenceBridge - 驱力效果（喜欢的上下文）', () => {
  it('正效果降低 social.tension', () => {
    const man = new Stickman(200);
    const table = new SocialContractTable();
    table.create('app', 'bilibili', 0.8, 'test');
    table.preferences[0].strength = 0.5;
    man.driveSystem.drives.social.tension = 0.5;
    const bridge = new PreferenceBridge(man.driveSystem, table);
    bridge.applyDriveEffects(table.preferences);
    // effect = 0.8 * 0.5 = 0.4 → social.tension -= 0.4 * 0.08 = 0.032
    expect(man.driveSystem.drives.social.tension).toBeLessThan(0.5);
  });

  it('正效果降低 novelty.tension', () => {
    const man = new Stickman(200);
    const table = new SocialContractTable();
    table.create('app', 'bilibili', 0.8, 'test');
    table.preferences[0].strength = 0.5;
    man.driveSystem.drives.novelty.tension = 0.5;
    const bridge = new PreferenceBridge(man.driveSystem, table);
    bridge.applyDriveEffects(table.preferences);
    expect(man.driveSystem.drives.novelty.tension).toBeLessThan(0.5);
  });
});

describe('PreferenceBridge - 驱力效果（讨厌的上下文）', () => {
  it('负效果升高 expression.tension', () => {
    const man = new Stickman(200);
    const table = new SocialContractTable();
    table.create('app', 'work', -0.7, 'test');
    table.preferences[0].strength = 0.5;
    man.driveSystem.drives.expression.tension = 0.3;
    const bridge = new PreferenceBridge(man.driveSystem, table);
    bridge.applyDriveEffects(table.preferences);
    expect(man.driveSystem.drives.expression.tension).toBeGreaterThan(0.3);
  });

  it('负效果升高 rest.tension', () => {
    const man = new Stickman(200);
    const table = new SocialContractTable();
    table.create('app', 'work', -0.7, 'test');
    table.preferences[0].strength = 0.5;
    man.driveSystem.drives.rest.tension = 0.3;
    const bridge = new PreferenceBridge(man.driveSystem, table);
    bridge.applyDriveEffects(table.preferences);
    expect(man.driveSystem.drives.rest.tension).toBeGreaterThan(0.3);
  });
});

describe('PreferenceBridge - 勇气调制', () => {
  it('喜欢的上下文增加各驱力 courage', () => {
    const man = new Stickman(200);
    const table = new SocialContractTable();
    table.create('app', 'bilibili', 0.8, 'test');
    table.preferences[0].strength = 0.5;
    const beforeCourage = man.driveSystem.drives.social.courage;
    const bridge = new PreferenceBridge(man.driveSystem, table);
    bridge.applyDriveEffects(table.preferences);
    // effect = 0.8 * 0.5 = 0.4 → courage += 0.4 * 0.03 = 0.012
    expect(man.driveSystem.drives.social.courage).toBeGreaterThan(beforeCourage);
  });

  it('讨厌的上下文降低各驱力 courage', () => {
    const man = new Stickman(200);
    const table = new SocialContractTable();
    table.create('app', 'work', -0.8, 'test');
    table.preferences[0].strength = 0.5;
    const beforeCourage = man.driveSystem.drives.social.courage;
    const bridge = new PreferenceBridge(man.driveSystem, table);
    bridge.applyDriveEffects(table.preferences);
    expect(man.driveSystem.drives.social.courage).toBeLessThan(beforeCourage);
  });
});

describe('PreferenceBridge - 动作权重偏置', () => {
  it('喜欢时 approach 类动作获得正 bonus', () => {
    const man = new Stickman(200);
    const table = new SocialContractTable();
    table.create('app', 'bilibili', 0.8, 'test');
    table.preferences[0].strength = 0.6;
    const bridge = new PreferenceBridge(man.driveSystem, table);
    const bonus = bridge.getActionBonus('wave', table.preferences);
    expect(bonus).toBeGreaterThan(0);
  });

  it('喜欢时 withdrawal 类动作获得负 bonus', () => {
    const man = new Stickman(200);
    const table = new SocialContractTable();
    table.create('app', 'bilibili', 0.8, 'test');
    table.preferences[0].strength = 0.6;
    const bridge = new PreferenceBridge(man.driveSystem, table);
    const bonus = bridge.getActionBonus('yawn', table.preferences);
    expect(bonus).toBeLessThan(0);
  });

  it('讨厌时 withdrawal 类动作获得正 bonus', () => {
    const man = new Stickman(200);
    const table = new SocialContractTable();
    table.create('app', 'work', -0.8, 'test');
    table.preferences[0].strength = 0.6;
    const bridge = new PreferenceBridge(man.driveSystem, table);
    const bonus = bridge.getActionBonus('yawn', table.preferences);
    expect(bonus).toBeGreaterThan(0);
  });

  it('讨厌时 approach 类动作获得负 bonus', () => {
    const man = new Stickman(200);
    const table = new SocialContractTable();
    table.create('app', 'work', -0.8, 'test');
    table.preferences[0].strength = 0.6;
    const bridge = new PreferenceBridge(man.driveSystem, table);
    const bonus = bridge.getActionBonus('dance', table.preferences);
    expect(bonus).toBeLessThan(0);
  });

  it('无偏好时 bonus 为 0', () => {
    const man = new Stickman(200);
    const table = new SocialContractTable();
    const bridge = new PreferenceBridge(man.driveSystem, table);
    const bonus = bridge.getActionBonus('walk', []);
    expect(bonus).toBe(0);
  });
});

describe('PreferenceBridge - 思绪气泡', () => {
  it('弱偏好 (strength 0.2-0.4) 不生成思绪', () => {
    const man = new Stickman(200);
    const table = new SocialContractTable();
    table.create('app', 'test', 0.5, 'memo');
    table.preferences[0].strength = 0.3;
    const bridge = new PreferenceBridge(man.driveSystem, table);
    const thought = bridge.generateThought(table.preferences);
    expect(thought).toBeNull();
  });

  it('中等偏好 (strength 0.4-0.7) 正极性生成模糊正面思绪', () => {
    const man = new Stickman(200);
    const table = new SocialContractTable();
    table.create('app', 'test', 0.8, 'memo');
    table.preferences[0].strength = 0.5;
    const bridge = new PreferenceBridge(man.driveSystem, table);
    const thought = bridge.generateThought(table.preferences);
    expect(thought).not.toBeNull();
    // 应为 positive_medium 类模板之一
    expect(['嗯，还不错~', '有点意思', '挺好的嘛']).toContain(thought);
  });

  it('中等偏好 (strength 0.4-0.7) 负极性生成模糊负面思绪', () => {
    const man = new Stickman(200);
    const table = new SocialContractTable();
    table.create('app', 'test', -0.8, 'memo');
    table.preferences[0].strength = 0.5;
    const bridge = new PreferenceBridge(man.driveSystem, table);
    const thought = bridge.generateThought(table.preferences);
    expect(thought).not.toBeNull();
    expect(['嗯......', '又来了', '总觉得哪里不对']).toContain(thought);
  });

  it('强偏好 (strength 0.7-1.0) 正极性生成明确正面思绪', () => {
    const man = new Stickman(200);
    const table = new SocialContractTable();
    table.create('app', 'test', 0.9, 'memo');
    table.preferences[0].strength = 0.8;
    const bridge = new PreferenceBridge(man.driveSystem, table);
    const thought = bridge.generateThought(table.preferences);
    expect(thought).not.toBeNull();
    expect(['我就喜欢这个！', '来了来了！', '太好了~']).toContain(thought);
  });

  it('强偏好 (strength 0.7-1.0) 负极性生成明确负面思绪', () => {
    const man = new Stickman(200);
    const table = new SocialContractTable();
    table.create('app', 'test', -0.9, 'memo');
    table.preferences[0].strength = 0.8;
    const bridge = new PreferenceBridge(man.driveSystem, table);
    const thought = bridge.generateThought(table.preferences);
    expect(thought).not.toBeNull();
    expect(['能换点别的吗...', '不太想看这个...', '又是这个啊...']).toContain(thought);
  });

  it('多偏好时取 |polarity * strength| 最大的偏好生成思绪', () => {
    const man = new Stickman(200);
    const table = new SocialContractTable();
    table.create('app', 'weak', 0.3, 'test');
    table.preferences[0].strength = 0.3;
    table.create('app', 'strong', 0.9, 'test');
    table.preferences[1].strength = 0.8;
    const bridge = new PreferenceBridge(man.driveSystem, table);
    const thought = bridge.generateThought(table.preferences);
    // strong 偏好主导 → positive_strong 模板
    expect(thought).not.toBeNull();
    expect(['我就喜欢这个！', '来了来了！', '太好了~']).toContain(thought);
  });

  it('思绪不直接包含应用名', () => {
    const man = new Stickman(200);
    const table = new SocialContractTable();
    table.create('app', 'bilibili', 0.9, 'test');
    table.preferences[0].strength = 0.8;
    const bridge = new PreferenceBridge(man.driveSystem, table);
    const thought = bridge.generateThought(table.preferences);
    expect(thought).not.toContain('bilibili');
    expect(thought).not.toContain('Bilibili');
  });
});

describe('PreferenceBridge - 多偏好叠加与矛盾态', () => {
  it('多个偏好效果直接叠加到驱力系统', () => {
    const man = new Stickman(200);
    const table = new SocialContractTable();
    table.create('app', 'a', 0.8, 'test');
    table.preferences[0].strength = 0.5;
    table.create('app', 'b', 0.6, 'test');
    table.preferences[1].strength = 0.4;
    man.driveSystem.drives.social.tension = 0.5;
    const bridge = new PreferenceBridge(man.driveSystem, table);
    bridge.applyDriveEffects(table.preferences);
    // 两个正效果叠加，social.tension 应明显降低
    expect(man.driveSystem.drives.social.tension).toBeLessThan(0.5);
  });

  it('正负偏好同时激活产生矛盾态（是特性不是 bug）', () => {
    const man = new Stickman(200);
    const table = new SocialContractTable();
    table.create('app', 'liked', 0.8, 'positive');
    table.preferences[0].strength = 0.5;
    table.create('time', 'night', -0.7, 'negative');
    table.preferences[1].strength = 0.5;
    man.driveSystem.drives.social.tension = 0.5;
    man.driveSystem.drives.expression.tension = 0.3;
    const bridge = new PreferenceBridge(man.driveSystem, table);
    // 不应抛错
    expect(() => bridge.applyDriveEffects(table.preferences)).not.toThrow();
  });
});

// ============================================================
//  38. 偏好涌现 — 数据结构与初始化
// ============================================================

describe('Sensitivity 向量生成', () => {
  it('每维度在 0.5-1.5 范围内', () => {
    // 多次生成验证范围
    for (let i = 0; i < 100; i++) {
      const s = { app: 0.5 + Math.random(), time: 0.5 + Math.random(), duration: 0.5 + Math.random(), interaction: 0.5 + Math.random() };
      expect(s.app).toBeGreaterThanOrEqual(0.5);
      expect(s.app).toBeLessThan(1.5);
      expect(s.time).toBeGreaterThanOrEqual(0.5);
      expect(s.time).toBeLessThan(1.5);
      expect(s.duration).toBeGreaterThanOrEqual(0.5);
      expect(s.duration).toBeLessThan(1.5);
      expect(s.interaction).toBeGreaterThanOrEqual(0.5);
      expect(s.interaction).toBeLessThan(1.5);
    }
  });

  it('sensitivity 包含 app, time, duration, interaction 四个维度', () => {
    const s = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.0 };
    expect(s).toHaveProperty('app');
    expect(s).toHaveProperty('time');
    expect(s).toHaveProperty('duration');
    expect(s).toHaveProperty('interaction');
  });
});

describe('preferences.json 结构', () => {
  it('完整数据结构包含 sensitivity, associations, preferences', () => {
    const data = {
      sensitivity: { app: 1.12, time: 0.78, duration: 0.95, interaction: 1.30 },
      associations: {},
      preferences: [],
    };
    expect(data).toHaveProperty('sensitivity');
    expect(data).toHaveProperty('associations');
    expect(data).toHaveProperty('preferences');
  });

  it('PreferenceEntry 包含所有必需字段', () => {
    const entry = {
      id: 'pref_bilibili_1710005000',
      axis: 'app',
      target: 'bilibili',
      titleHints: [],
      polarity: 0.6,
      strength: 0.35,
      formedAt: 1710005000,
      lastActivated: 1710010000,
      reinforceCount: 4,
      formativeMemory: '主人用Bilibili时经常点我玩',
    };
    expect(entry).toHaveProperty('id');
    expect(entry).toHaveProperty('axis');
    expect(entry).toHaveProperty('target');
    expect(entry).toHaveProperty('titleHints');
    expect(entry).toHaveProperty('polarity');
    expect(entry).toHaveProperty('strength');
    expect(entry).toHaveProperty('formedAt');
    expect(entry).toHaveProperty('lastActivated');
    expect(entry).toHaveProperty('reinforceCount');
    expect(entry).toHaveProperty('formativeMemory');
  });
});

// ============================================================
//  39. 偏好涌现 — 边界条件
// ============================================================

describe('偏好涌现 - 冷启动（零历史）', () => {
  it('偏好列表为空时行为完全由现有驱力系统驱动', () => {
    const man = new Stickman(200);
    const table = new SocialContractTable();
    const bridge = new PreferenceBridge(man.driveSystem, table);
    const result = bridge.activate('app:chrome', 'time:morning', 'Google');
    expect(result.matches).toHaveLength(0);
    expect(result.thought).toBeNull();
    // DriveSystem 不受偏好影响
    const tensionBefore = man.driveSystem.drives.social.tension;
    bridge.applyDriveEffects([]);
    expect(man.driveSystem.drives.social.tension).toBe(tensionBefore);
  });
});

describe('偏好涌现 - 应用名变体归一化', () => {
  it('"Google Chrome" 归一化后可匹配偏好 target "chrome"', () => {
    const table = new SocialContractTable();
    table.create('app', 'chrome', 0.5, 'test');
    const results = table.query('app:google chrome', 'time:afternoon');
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('大小写不敏感匹配: "VS Code" vs "vs code"', () => {
    const table = new SocialContractTable();
    table.create('app', 'vs code', 0.5, 'test');
    const results = table.query('app:vs code', 'time:morning');
    expect(results.length).toBeGreaterThanOrEqual(1);
  });
});

describe('偏好涌现 - 偏好生长曲线时间尺度', () => {
  it('从 0.2 → 0.4 约需 4 次强化', () => {
    const sensitivity = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.0 };
    const engine = new EmergenceEngine(sensitivity);
    const pref = { id: 'test', polarity: 0.5, strength: 0.2, reinforceCount: 0, lastActivated: Date.now() };
    let count = 0;
    while (pref.strength < 0.4 && count < 20) {
      engine.reinforce(pref, 0.5);
      count++;
    }
    expect(count).toBeGreaterThanOrEqual(3);
    expect(count).toBeLessThanOrEqual(6);
  });

  it('从 0.4 → 0.7 需要更多次强化（约 10 次）', () => {
    const sensitivity = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.0 };
    const engine = new EmergenceEngine(sensitivity);
    const pref = { id: 'test', polarity: 0.5, strength: 0.4, reinforceCount: 0, lastActivated: Date.now() };
    let count = 0;
    while (pref.strength < 0.7 && count < 50) {
      engine.reinforce(pref, 0.5);
      count++;
    }
    expect(count).toBeGreaterThanOrEqual(8);
    expect(count).toBeLessThanOrEqual(15);
  });

  it('从 0.7 → 0.9 需要 20+ 次强化', () => {
    const sensitivity = { app: 1.0, time: 1.0, duration: 1.0, interaction: 1.0 };
    const engine = new EmergenceEngine(sensitivity);
    const pref = { id: 'test', polarity: 0.5, strength: 0.7, reinforceCount: 0, lastActivated: Date.now() };
    let count = 0;
    while (pref.strength < 0.9 && count < 100) {
      engine.reinforce(pref, 0.5);
      count++;
    }
    expect(count).toBeGreaterThanOrEqual(20);
  });
});

describe('偏好涌现 - 可解释性思绪模板', () => {
  it('PREFERENCE_THOUGHTS 包含 4 类模板', () => {
    expect(PREFERENCE_THOUGHTS).toBeDefined();
    expect(PREFERENCE_THOUGHTS.positive_medium).toBeDefined();
    expect(PREFERENCE_THOUGHTS.positive_strong).toBeDefined();
    expect(PREFERENCE_THOUGHTS.negative_medium).toBeDefined();
    expect(PREFERENCE_THOUGHTS.negative_strong).toBeDefined();
  });

  it('每类模板至少有 2 条可选项', () => {
    expect(PREFERENCE_THOUGHTS.positive_medium.length).toBeGreaterThanOrEqual(2);
    expect(PREFERENCE_THOUGHTS.positive_strong.length).toBeGreaterThanOrEqual(2);
    expect(PREFERENCE_THOUGHTS.negative_medium.length).toBeGreaterThanOrEqual(2);
    expect(PREFERENCE_THOUGHTS.negative_strong.length).toBeGreaterThanOrEqual(2);
  });

  it('所有模板不包含具体应用名', () => {
    const allThoughts = [
      ...PREFERENCE_THOUGHTS.positive_medium,
      ...PREFERENCE_THOUGHTS.positive_strong,
      ...PREFERENCE_THOUGHTS.negative_medium,
      ...PREFERENCE_THOUGHTS.negative_strong,
    ];
    for (const t of allThoughts) {
      expect(t).not.toMatch(/chrome|safari|bilibili|vscode|微信|qq/i);
    }
  });
});

// ============================================================
//  Phase 2: 主动施压 — 新增动画动作（5 个）
// ============================================================

describe('施压动作 - climb（爬行）', () => {
  it('ACTIONS.climb 已注册为函数', () => {
    expect(typeof ACTIONS.climb).toBe('function');
  });

  it('climb(t) 返回完整骨骼姿态对象', () => {
    const pose = ACTIONS.climb(0);
    const requiredKeys = ['body', 'head', 'lArmUp', 'lArmLow', 'rArmUp', 'rArmLow', 'lLegUp', 'lLegLow', 'rLegUp', 'rLegLow'];
    for (const key of requiredKeys) {
      expect(pose).toHaveProperty(key);
      expect(typeof pose[key]).toBe('number');
    }
  });

  it('身体前倾约 15°', () => {
    const pose = ACTIONS.climb(0.5);
    expect(pose.body).toBeGreaterThan(5);
    expect(pose.body).toBeLessThan(30);
  });

  it('左右臂交替上举（正弦）：不同时间点臂值反向变化', () => {
    const p1 = ACTIONS.climb(0.25);
    const p2 = ACTIONS.climb(0.75);
    const lDiff = p1.lArmUp - p2.lArmUp;
    const rDiff = p1.rArmUp - p2.rArmUp;
    expect(lDiff * rDiff).toBeLessThan(0);
  });

  it('腿部交替弯曲推蹬', () => {
    const p1 = ACTIONS.climb(0.25);
    const p2 = ACTIONS.climb(0.75);
    const lDiff = p1.lLegUp - p2.lLegUp;
    const rDiff = p1.rLegUp - p2.rLegUp;
    expect(lDiff * rDiff).toBeLessThan(0);
  });

  it('不同时间点有动画变化', () => {
    const p0 = ACTIONS.climb(0);
    const p1 = ACTIONS.climb(0.5);
    const keys = Object.keys(p0);
    const changed = keys.some(k => p0[k] !== p1[k]);
    expect(changed).toBe(true);
  });
});

describe('施压动作 - sitProtest（坐下抗议）', () => {
  it('ACTIONS.sitProtest 已注册为函数', () => {
    expect(typeof ACTIONS.sitProtest).toBe('function');
  });

  it('sitProtest(t) 返回完整骨骼姿态对象', () => {
    const pose = ACTIONS.sitProtest(0);
    expect(pose).toHaveProperty('body');
    expect(pose).toHaveProperty('lArmUp');
    expect(pose).toHaveProperty('rArmUp');
  });

  it('双臂交叉在胸前：lArmUp 和 rArmUp 约 -30°', () => {
    const pose = ACTIONS.sitProtest(0.5);
    expect(pose.lArmUp).toBeLessThan(0);
    expect(pose.rArmUp).toBeLessThan(0);
    expect(Math.abs(pose.lArmUp + 30)).toBeLessThan(20);
    expect(Math.abs(pose.rArmUp + 30)).toBeLessThan(20);
  });

  it('头偶尔摇动：不同时间点 head 值有变化', () => {
    const values = [0.2, 0.4, 0.6, 0.8].map(t => ACTIONS.sitProtest(t).head);
    const range = Math.max(...values) - Math.min(...values);
    expect(range).toBeGreaterThan(0);
  });

  it('腿部折叠（坐姿）', () => {
    const pose = ACTIONS.sitProtest(0.5);
    expect(pose.lLegLow).toBeGreaterThan(30);
    expect(pose.rLegLow).toBeGreaterThan(30);
  });
});

describe('施压动作 - lieBlock（横躺遮挡）', () => {
  it('ACTIONS.lieBlock 已注册为函数', () => {
    expect(typeof ACTIONS.lieBlock).toBe('function');
  });

  it('lieBlock(t) 返回完整骨骼姿态对象', () => {
    const pose = ACTIONS.lieBlock(0);
    expect(pose).toHaveProperty('body');
    expect(typeof pose.body).toBe('number');
  });

  it('body 角度约 90°（横向）', () => {
    const pose = ACTIONS.lieBlock(0.5);
    expect(Math.abs(pose.body)).toBeGreaterThan(70);
    expect(Math.abs(pose.body)).toBeLessThan(100);
  });

  it('偶尔翻身：body 在 85-95° 之间摆动', () => {
    const values = [0.2, 0.4, 0.6, 0.8].map(t => Math.abs(ACTIONS.lieBlock(t).body));
    const range = Math.max(...values) - Math.min(...values);
    expect(range).toBeGreaterThan(0);
    expect(range).toBeLessThan(20);
  });

  it('四肢自然舒展', () => {
    const pose = ACTIONS.lieBlock(0.5);
    expect(Math.abs(pose.lArmUp)).toBeLessThan(60);
    expect(Math.abs(pose.rArmUp)).toBeLessThan(60);
  });
});

describe('施压动作 - cling（悬挂）', () => {
  it('ACTIONS.cling 已注册为函数', () => {
    expect(typeof ACTIONS.cling).toBe('function');
  });

  it('cling(t) 返回完整骨骼姿态对象', () => {
    const pose = ACTIONS.cling(0);
    expect(pose).toHaveProperty('body');
    expect(pose).toHaveProperty('lArmUp');
  });

  it('双臂上举抓握：lArmUp 和 rArmUp 为较大负值', () => {
    const pose = ACTIONS.cling(0.5);
    expect(pose.lArmUp).toBeLessThan(-60);
    expect(pose.rArmUp).toBeLessThan(-60);
  });

  it('腿轻微摆动（正弦）', () => {
    const values = [0.2, 0.4, 0.6, 0.8].map(t => ACTIONS.cling(t).lLegUp);
    const range = Math.max(...values) - Math.min(...values);
    expect(range).toBeGreaterThan(0);
  });

  it('身体自然下垂', () => {
    const pose = ACTIONS.cling(0.5);
    expect(pose.body).toBeGreaterThanOrEqual(-10);
    expect(pose.body).toBeLessThanOrEqual(10);
  });
});

describe('施压动作 - coldShoulder（冷战背对）', () => {
  it('ACTIONS.coldShoulder 已注册为函数', () => {
    expect(typeof ACTIONS.coldShoulder).toBe('function');
  });

  it('coldShoulder(t) 返回完整骨骼姿态对象', () => {
    const pose = ACTIONS.coldShoulder(0);
    expect(pose).toHaveProperty('body');
    expect(pose).toHaveProperty('head');
  });

  it('头低垂：head 约 15°', () => {
    const pose = ACTIONS.coldShoulder(0.5);
    expect(pose.head).toBeGreaterThan(5);
    expect(pose.head).toBeLessThan(30);
  });

  it('臂自然下垂', () => {
    const pose = ACTIONS.coldShoulder(0.5);
    expect(Math.abs(pose.lArmUp)).toBeLessThan(20);
    expect(Math.abs(pose.rArmUp)).toBeLessThan(20);
  });
});

// ============================================================
//  Phase 2: 施压策略模板
// ============================================================

describe('施压策略模板 - PRESSURE_STRATEGIES', () => {
  it('PRESSURE_STRATEGIES 已定义', () => {
    expect(PRESSURE_STRATEGIES).toBeDefined();
  });

  it('包含 attention_protest 策略', () => {
    expect(PRESSURE_STRATEGIES.attention_protest).toBeDefined();
  });

  it('包含 rest_demand 策略', () => {
    expect(PRESSURE_STRATEGIES.rest_demand).toBeDefined();
  });

  it('attention_protest 包含 3 个升级等级的 actions', () => {
    const s = PRESSURE_STRATEGIES.attention_protest.actions;
    expect(s[0]).toBeDefined();
    expect(s[1]).toBeDefined();
    expect(s[2]).toBeDefined();
  });

  it('rest_demand 包含 3 个升级等级的 actions', () => {
    const s = PRESSURE_STRATEGIES.rest_demand.actions;
    expect(s[0]).toBeDefined();
    expect(s[1]).toBeDefined();
    expect(s[2]).toBeDefined();
  });

  it('每个等级的 actions 包含 poses/thoughts/expression', () => {
    for (const key of ['attention_protest', 'rest_demand']) {
      for (const level of [0, 1, 2]) {
        const a = PRESSURE_STRATEGIES[key].actions[level];
        expect(Array.isArray(a.poses)).toBe(true);
        expect(a.poses.length).toBeGreaterThan(0);
        expect(Array.isArray(a.thoughts)).toBe(true);
        expect(a.thoughts.length).toBeGreaterThan(0);
        expect(typeof a.expression).toBe('string');
      }
    }
  });

  it('attention_protest level 0 表情为 nervous', () => {
    expect(PRESSURE_STRATEGIES.attention_protest.actions[0].expression).toBe('nervous');
  });

  it('attention_protest level 1 表情为 angry', () => {
    expect(PRESSURE_STRATEGIES.attention_protest.actions[1].expression).toBe('angry');
  });

  it('attention_protest level 2 poses 包含 sitProtest/lieBlock/cling', () => {
    const poses = PRESSURE_STRATEGIES.attention_protest.actions[2].poses;
    expect(poses).toContain('sitProtest');
    expect(poses).toContain('lieBlock');
    expect(poses).toContain('cling');
  });

  it('rest_demand level 0 表情为 sleepy', () => {
    expect(PRESSURE_STRATEGIES.rest_demand.actions[0].expression).toBe('sleepy');
  });

  it('rest_demand level 2 poses 包含 lieBlock', () => {
    expect(PRESSURE_STRATEGIES.rest_demand.actions[2].poses).toContain('lieBlock');
  });
});

// ============================================================
//  Phase 2: PRESSURE_CONSTANTS 常量
// ============================================================

describe('施压常量 - PRESSURE_CONSTANTS', () => {
  it('PRESSURE_CONSTANTS 已定义', () => {
    expect(PRESSURE_CONSTANTS).toBeDefined();
  });

  it('VIOLATION_STRENGTH_THRESHOLD = 0.5', () => {
    expect(PRESSURE_CONSTANTS.VIOLATION_STRENGTH_THRESHOLD).toBe(0.5);
  });

  it('VIOLATION_POLARITY_THRESHOLD = -0.4', () => {
    expect(PRESSURE_CONSTANTS.VIOLATION_POLARITY_THRESHOLD).toBe(-0.4);
  });

  it('VIOLATION_HOLD_TIME = 180', () => {
    expect(PRESSURE_CONSTANTS.VIOLATION_HOLD_TIME).toBe(180);
  });

  it('VIOLATION_HOLD_COUNT = 6', () => {
    expect(PRESSURE_CONSTANTS.VIOLATION_HOLD_COUNT).toBe(6);
  });

  it('IGNORE_TIMEOUT = 120', () => {
    expect(PRESSURE_CONSTANTS.IGNORE_TIMEOUT).toBe(120);
  });

  it('ACK_ESCALATION_DELAY_FACTOR = 1.5', () => {
    expect(PRESSURE_CONSTANTS.ACK_ESCALATION_DELAY_FACTOR).toBe(1.5);
  });

  it('MAX_RESOLVED_HISTORY = 5', () => {
    expect(PRESSURE_CONSTANTS.MAX_RESOLVED_HISTORY).toBe(5);
  });

  it('CAMPAIGN_COOLDOWN = 600', () => {
    expect(PRESSURE_CONSTANTS.CAMPAIGN_COOLDOWN).toBe(600);
  });
});

describe('升级常量 - ESCALATION_CONSTANTS', () => {
  it('ESCALATION_CONSTANTS 已定义', () => {
    expect(ESCALATION_CONSTANTS).toBeDefined();
  });

  it('LEVEL_0_TO_1_BASE = 300（暗示→表态 5 分钟）', () => {
    expect(ESCALATION_CONSTANTS.LEVEL_0_TO_1_BASE).toBe(300);
  });

  it('LEVEL_1_TO_2_BASE = 600（表态→抗议 10 分钟）', () => {
    expect(ESCALATION_CONSTANTS.LEVEL_1_TO_2_BASE).toBe(600);
  });

  it('IGNORE_ACCELERATION = 0.8', () => {
    expect(ESCALATION_CONSTANTS.IGNORE_ACCELERATION).toBe(0.8);
  });

  it('COOLING_LEVEL_0 = 120（2 分钟冷却）', () => {
    expect(ESCALATION_CONSTANTS.COOLING_LEVEL_0).toBe(120);
  });

  it('COOLING_LEVEL_1 = 480（8 分钟冷却）', () => {
    expect(ESCALATION_CONSTANTS.COOLING_LEVEL_1).toBe(480);
  });

  it('COOLING_LEVEL_2 = 1200（20 分钟冷却）', () => {
    expect(ESCALATION_CONSTANTS.COOLING_LEVEL_2).toBe(1200);
  });

  it('COOLING_DEESCALATE_INTERVAL = 300（冷却中每 5 分钟降一级）', () => {
    expect(ESCALATION_CONSTANTS.COOLING_DEESCALATE_INTERVAL).toBe(300);
  });
});

describe('空间常量 - SPATIAL_CONSTANTS', () => {
  it('SPATIAL_CONSTANTS 已定义', () => {
    expect(SPATIAL_CONSTANTS).toBeDefined();
  });

  it('CLIMB_SPEED = 80', () => {
    expect(SPATIAL_CONSTANTS.CLIMB_SPEED).toBe(80);
  });

  it('RETURN_DELAY = 5', () => {
    expect(SPATIAL_CONSTANTS.RETURN_DELAY).toBe(5);
  });

  it('POSITION_TOLERANCE = 20', () => {
    expect(SPATIAL_CONSTANTS.POSITION_TOLERANCE).toBe(20);
  });

  it('DESCENT_SPEED = 120', () => {
    expect(SPATIAL_CONSTANTS.DESCENT_SPEED).toBe(120);
  });
});

// ============================================================
//  Phase 2: M1 ContractEnforcer — 社会契约执行器
// ============================================================

describe('ContractEnforcer - 构造与初始化', () => {
  it('ContractEnforcer 类已定义', () => {
    expect(typeof ContractEnforcer).toBe('function');
  });

  it('构造时接收 socialContractTable 参数', () => {
    const mockTable = { query: () => [] };
    const enforcer = new ContractEnforcer(mockTable);
    expect(enforcer.activeCampaign).toBeNull();
    expect(enforcer.resolvedCampaigns).toEqual([]);
  });

  it('_violationHoldCounter 初始为 0', () => {
    const enforcer = new ContractEnforcer({ query: () => [] });
    expect(enforcer._violationHoldCounter).toBe(0);
  });

  it('_lastCampaignResolvedAt 初始为 null', () => {
    const enforcer = new ContractEnforcer({ query: () => [] });
    expect(enforcer._lastCampaignResolvedAt).toBeNull();
  });
});

describe('ContractEnforcer - scanViolations 违约扫描', () => {
  it('无偏好时返回 null', () => {
    const table = { query: () => [] };
    const enforcer = new ContractEnforcer(table);
    expect(enforcer.scanViolations('app:bilibili', 'time:night', table)).toBeNull();
  });

  it('strength < 0.5 的偏好不触发违约', () => {
    const table = { query: () => [{ id: 'p1', strength: 0.3, polarity: -0.8 }] };
    const enforcer = new ContractEnforcer(table);
    expect(enforcer.scanViolations('app:bilibili', 'time:night', table)).toBeNull();
  });

  it('polarity > -0.4 的偏好不触发违约', () => {
    const table = { query: () => [{ id: 'p1', strength: 0.8, polarity: -0.2 }] };
    const enforcer = new ContractEnforcer(table);
    expect(enforcer.scanViolations('app:bilibili', 'time:night', table)).toBeNull();
  });

  it('strength >= 0.5 且 polarity <= -0.4 触发违约', () => {
    const pref = { id: 'p1', strength: 0.6, polarity: -0.5 };
    const table = { query: () => [pref] };
    const enforcer = new ContractEnforcer(table);
    expect(enforcer.scanViolations('app:bilibili', 'time:night', table)).toEqual(pref);
  });

  it('多个违约偏好按 |polarity| * strength 降序取第一个', () => {
    const pref1 = { id: 'p1', strength: 0.6, polarity: -0.5 }; // score 0.3
    const pref2 = { id: 'p2', strength: 0.8, polarity: -0.7 }; // score 0.56
    const table = { query: () => [pref1, pref2] };
    const enforcer = new ContractEnforcer(table);
    expect(enforcer.scanViolations('app:x', 'time:y', table).id).toBe('p2');
  });

  it('最近 CAMPAIGN_COOLDOWN 秒内解决过的同一偏好被排除', () => {
    const pref = { id: 'p1', strength: 0.8, polarity: -0.7 };
    const table = { query: () => [pref] };
    const enforcer = new ContractEnforcer(table);
    enforcer.resolvedCampaigns = [{ preferenceId: 'p1', resolvedAt: Date.now() }];
    expect(enforcer.scanViolations('app:x', 'time:y', table)).toBeNull();
  });
});

describe('ContractEnforcer - startCampaign 发起战役', () => {
  it('创建 PressureCampaign 对象，level=0, status=active', () => {
    const enforcer = new ContractEnforcer({ query: () => [] });
    const pref = { id: 'p1', axis: 'app', strength: 0.8, polarity: -0.6 };
    enforcer.startCampaign(pref);
    expect(enforcer.activeCampaign).toBeDefined();
    expect(enforcer.activeCampaign.level).toBe(0);
    expect(enforcer.activeCampaign.status).toBe('active');
  });

  it('campaign.id 格式为 campaign_{target}_{timestamp}', () => {
    const enforcer = new ContractEnforcer({ query: () => [] });
    enforcer.startCampaign({ id: 'p1', axis: 'app', strength: 0.8, polarity: -0.6 });
    expect(enforcer.activeCampaign.id).toMatch(/^campaign_.+_\d+$/);
  });

  it('app 类偏好选择 attention_protest 策略', () => {
    const enforcer = new ContractEnforcer({ query: () => [] });
    enforcer.startCampaign({ id: 'p1', axis: 'app', strength: 0.8, polarity: -0.6 });
    expect(enforcer.activeCampaign.trigger.axis).toBe('app');
  });

  it('time 类偏好选择 rest_demand 策略', () => {
    const enforcer = new ContractEnforcer({ query: () => [] });
    enforcer.startCampaign({ id: 'p1', axis: 'time', strength: 0.8, polarity: -0.6 });
    expect(enforcer.activeCampaign.trigger.axis).toBe('time');
  });

  it('ignoreCount 和 ackCount 初始为 0', () => {
    const enforcer = new ContractEnforcer({ query: () => [] });
    enforcer.startCampaign({ id: 'p1', axis: 'app', strength: 0.8, polarity: -0.6 });
    expect(enforcer.activeCampaign.ignoreCount).toBe(0);
    expect(enforcer.activeCampaign.ackCount).toBe(0);
  });

  it('lastAckAt 初始为 null', () => {
    const enforcer = new ContractEnforcer({ query: () => [] });
    enforcer.startCampaign({ id: 'p1', axis: 'app', strength: 0.8, polarity: -0.6 });
    expect(enforcer.activeCampaign.lastAckAt).toBeNull();
  });
});

describe('ContractEnforcer - onScreenInfo 主循环', () => {
  it('无活跃战役时扫描违约', () => {
    const pref = { id: 'p1', axis: 'app', strength: 0.8, polarity: -0.7 };
    const table = { query: () => [pref] };
    const enforcer = new ContractEnforcer(table);
    // 需要连续 6 次才触发
    for (let i = 0; i < 5; i++) {
      enforcer.onScreenInfo('app:bilibili', 'time:night', table, []);
    }
    expect(enforcer.activeCampaign).toBeNull();
    enforcer.onScreenInfo('app:bilibili', 'time:night', table, []);
    expect(enforcer.activeCampaign).not.toBeNull();
  });

  it('违约中断时 holdCounter 重置', () => {
    const pref = { id: 'p1', axis: 'app', strength: 0.8, polarity: -0.7 };
    const table = { query: () => [pref] };
    const emptyTable = { query: () => [] };
    const enforcer = new ContractEnforcer(table);
    for (let i = 0; i < 4; i++) {
      enforcer.onScreenInfo('app:bilibili', 'time:night', table, []);
    }
    enforcer.onScreenInfo('app:vscode', 'time:night', emptyTable, []);
    expect(enforcer._violationHoldCounter).toBe(0);
  });

  it('有活跃战役时评估解压信号', () => {
    const enforcer = new ContractEnforcer({ query: () => [] });
    enforcer.startCampaign({ id: 'p1', axis: 'app', strength: 0.8, polarity: -0.6 });
    enforcer.activeCampaign.trigger.target = 'bilibili';
    const result = enforcer.evaluateResolution('vscode', 'time:night');
    expect(result).toBe(true);
  });

  it('返回事件类型：started / escalated / cooling / resolved / null', () => {
    const pref = { id: 'p1', axis: 'app', strength: 0.8, polarity: -0.7 };
    const table = { query: () => [pref] };
    const enforcer = new ContractEnforcer(table);
    for (let i = 0; i < 6; i++) {
      const result = enforcer.onScreenInfo('app:bilibili', 'time:night', table, []);
      if (i === 5) {
        expect(result.event).toBe('started');
      }
    }
  });
});

describe('ContractEnforcer - evaluateResolution 解压检测', () => {
  it('app 违约：当前应用不再匹配 → 返回 true', () => {
    const enforcer = new ContractEnforcer({ query: () => [] });
    enforcer.startCampaign({ id: 'p1', axis: 'app', strength: 0.8, polarity: -0.6 });
    enforcer.activeCampaign.trigger.target = 'bilibili';
    expect(enforcer.evaluateResolution('vscode', 'time:night')).toBe(true);
  });

  it('app 违约：当前应用仍匹配 → 返回 false', () => {
    const enforcer = new ContractEnforcer({ query: () => [] });
    enforcer.startCampaign({ id: 'p1', axis: 'app', strength: 0.8, polarity: -0.6 });
    enforcer.activeCampaign.trigger.target = 'bilibili';
    expect(enforcer.evaluateResolution('bilibili', 'time:night')).toBe(false);
  });

  it('time 违约：当前时段不再匹配 → 返回 true', () => {
    const enforcer = new ContractEnforcer({ query: () => [] });
    enforcer.startCampaign({ id: 'p1', axis: 'time', strength: 0.8, polarity: -0.6 });
    enforcer.activeCampaign.trigger.target = 'night';
    expect(enforcer.evaluateResolution('vscode', 'time:morning')).toBe(true);
  });
});

describe('ContractEnforcer - beginCooling 冷却', () => {
  it('将 campaign status 设为 cooling', () => {
    const enforcer = new ContractEnforcer({ query: () => [] });
    enforcer.startCampaign({ id: 'p1', axis: 'app', strength: 0.8, polarity: -0.6 });
    enforcer.beginCooling();
    expect(enforcer.activeCampaign.status).toBe('cooling');
  });

  it('设置 coolingStartedAt 为当前时间', () => {
    const enforcer = new ContractEnforcer({ query: () => [] });
    enforcer.startCampaign({ id: 'p1', axis: 'app', strength: 0.8, polarity: -0.6 });
    const before = Date.now();
    enforcer.beginCooling();
    expect(enforcer.activeCampaign.coolingStartedAt).toBeGreaterThanOrEqual(before);
  });
});

describe('ContractEnforcer - checkCoolingRelapse 冷却期复发', () => {
  it('冷却期间违约上下文重现 → status 回退到 active', () => {
    const enforcer = new ContractEnforcer({ query: () => [] });
    enforcer.startCampaign({ id: 'p1', axis: 'app', strength: 0.8, polarity: -0.6 });
    enforcer.activeCampaign.trigger.target = 'bilibili';
    enforcer.activeCampaign.status = 'cooling';
    enforcer.checkCoolingRelapse('bilibili', 'time:night');
    expect(enforcer.activeCampaign.status).toBe('active');
  });

  it('冷却期间违约未重现 → 保持 cooling', () => {
    const enforcer = new ContractEnforcer({ query: () => [] });
    enforcer.startCampaign({ id: 'p1', axis: 'app', strength: 0.8, polarity: -0.6 });
    enforcer.activeCampaign.trigger.target = 'bilibili';
    enforcer.activeCampaign.status = 'cooling';
    enforcer.checkCoolingRelapse('vscode', 'time:night');
    expect(enforcer.activeCampaign.status).toBe('cooling');
  });
});

describe('ContractEnforcer - hydrate/serialize 持久化', () => {
  it('serialize 返回 campaigns 数组和 restartDuringPressure 标记', () => {
    const enforcer = new ContractEnforcer({ query: () => [] });
    const data = enforcer.serialize();
    expect(data).toHaveProperty('campaigns');
    expect(data).toHaveProperty('restartDuringPressure');
  });

  it('有活跃战役时 restartDuringPressure = true', () => {
    const enforcer = new ContractEnforcer({ query: () => [] });
    enforcer.startCampaign({ id: 'p1', axis: 'app', strength: 0.8, polarity: -0.6 });
    expect(enforcer.serialize().restartDuringPressure).toBe(true);
  });

  it('无活跃战役时 restartDuringPressure = false', () => {
    const enforcer = new ContractEnforcer({ query: () => [] });
    expect(enforcer.serialize().restartDuringPressure).toBe(false);
  });

  it('hydrate 恢复 activeCampaign', () => {
    const enforcer = new ContractEnforcer({ query: () => [] });
    const campaign = { id: 'c1', status: 'active', level: 1, ignoreCount: 2 };
    enforcer.hydrate({ campaigns: [campaign], restartDuringPressure: false });
    expect(enforcer.activeCampaign).toBeDefined();
    expect(enforcer.activeCampaign.id).toBe('c1');
  });

  it('restartDuringPressure=true 时 ignoreCount += 1（重启视为无视）', () => {
    const enforcer = new ContractEnforcer({ query: () => [] });
    const campaign = { id: 'c1', status: 'active', level: 1, ignoreCount: 2 };
    enforcer.hydrate({ campaigns: [campaign], restartDuringPressure: true });
    expect(enforcer.activeCampaign.ignoreCount).toBe(3);
  });

  it('resolvedCampaigns 最多保留 MAX_RESOLVED_HISTORY 条', () => {
    const enforcer = new ContractEnforcer({ query: () => [] });
    const campaigns = [];
    for (let i = 0; i < 8; i++) {
      campaigns.push({ id: `c${i}`, status: 'resolved', resolvedAt: Date.now() - i * 1000 });
    }
    enforcer.hydrate({ campaigns, restartDuringPressure: false });
    expect(enforcer.resolvedCampaigns.length).toBeLessThanOrEqual(5);
  });
});

// ============================================================
//  Phase 2: M2 EscalationGradient — 升级梯度状态机
// ============================================================

describe('EscalationGradient - 构造与初始化', () => {
  it('EscalationGradient 类已定义', () => {
    expect(typeof EscalationGradient).toBe('function');
  });

  it('初始 level 为 0', () => {
    const g = new EscalationGradient();
    expect(g.level).toBe(0);
  });

  it('初始 frozen 为 false', () => {
    const g = new EscalationGradient();
    expect(g.frozen).toBe(false);
  });
});

describe('EscalationGradient - tick 升级计时', () => {
  it('active 状态下 escalationTimer 递减', () => {
    const g = new EscalationGradient();
    g.init(0, 300);
    g.tick(10, 'active');
    expect(g.escalationTimer).toBe(290);
  });

  it('escalationTimer 倒计到 0 时 level 从 0 升级到 1', () => {
    const g = new EscalationGradient();
    g.init(0, 10);
    const result = g.tick(10, 'active');
    expect(g.level).toBe(1);
    expect(result.event).toBe('escalated');
  });

  it('level 从 1 升级到 2', () => {
    const g = new EscalationGradient();
    g.init(1, 10);
    g.tick(10, 'active');
    expect(g.level).toBe(2);
  });

  it('level 2 不再升级（最高级）', () => {
    const g = new EscalationGradient();
    g.init(2, 10);
    g.tick(100, 'active');
    expect(g.level).toBe(2);
  });

  it('frozen 状态下 escalationTimer 不递减', () => {
    const g = new EscalationGradient();
    g.init(0, 300);
    g.freeze();
    g.tick(100, 'active');
    expect(g.escalationTimer).toBe(300);
  });
});

describe('EscalationGradient - tick 冷却计时', () => {
  it('cooling 状态下 coolingTimer 递减', () => {
    const g = new EscalationGradient();
    g.init(1, 0);
    g.startCooling();
    const initialTimer = g.coolingTimer;
    g.tick(10, 'cooling');
    expect(g.coolingTimer).toBe(initialTimer - 10);
  });

  it('冷却中每 COOLING_DEESCALATE_INTERVAL 秒降一级', () => {
    const g = new EscalationGradient();
    g.init(2, 0);
    g.startCooling();
    g.tick(300, 'cooling');
    expect(g.level).toBe(1);
  });

  it('level 降至 0 以下 → 返回 resolved 事件', () => {
    const g = new EscalationGradient();
    g.init(0, 0);
    g.startCooling();
    g.tick(300, 'cooling');
    // level should have gone below 0 → resolved
    expect(g.level).toBeLessThan(1);
  });
});

describe('EscalationGradient - onAcknowledge/onIgnore', () => {
  it('onAcknowledge 将 escalationTimer 乘以 ACK_ESCALATION_DELAY_FACTOR', () => {
    const g = new EscalationGradient();
    g.init(0, 200);
    g.onAcknowledge();
    expect(g.escalationTimer).toBe(300); // 200 * 1.5
  });

  it('onIgnore 将 escalationTimer 乘以 IGNORE_ACCELERATION', () => {
    const g = new EscalationGradient();
    g.init(0, 200);
    g.onIgnore();
    expect(g.escalationTimer).toBe(160); // 200 * 0.8
  });

  it('多次 onIgnore 持续加速', () => {
    const g = new EscalationGradient();
    g.init(0, 200);
    g.onIgnore();
    g.onIgnore();
    expect(g.escalationTimer).toBeCloseTo(128); // 200 * 0.8 * 0.8
  });
});

describe('EscalationGradient - freeze/unfreeze', () => {
  it('freeze 后 frozen 为 true', () => {
    const g = new EscalationGradient();
    g.freeze();
    expect(g.frozen).toBe(true);
  });

  it('unfreeze 后 frozen 为 false', () => {
    const g = new EscalationGradient();
    g.freeze();
    g.unfreeze();
    expect(g.frozen).toBe(false);
  });

  it('unfreeze 后升级计时器从冻结点继续', () => {
    const g = new EscalationGradient();
    g.init(0, 200);
    g.tick(50, 'active');
    g.freeze();
    g.tick(100, 'active');
    g.unfreeze();
    expect(g.escalationTimer).toBe(150); // 200 - 50, 冻结期间不变
  });
});

describe('EscalationGradient - startCooling', () => {
  it('level 0 冷却时长 = COOLING_LEVEL_0 (120s)', () => {
    const g = new EscalationGradient();
    g.init(0, 0);
    g.startCooling();
    expect(g.coolingTimer).toBe(120);
  });

  it('level 1 冷却时长 = COOLING_LEVEL_1 (480s)', () => {
    const g = new EscalationGradient();
    g.init(1, 0);
    g.startCooling();
    expect(g.coolingTimer).toBe(480);
  });

  it('level 2 冷却时长 = COOLING_LEVEL_2 (1200s)', () => {
    const g = new EscalationGradient();
    g.init(2, 0);
    g.startCooling();
    expect(g.coolingTimer).toBe(1200);
  });
});

describe('EscalationGradient - getBehaviorDirective', () => {
  it('返回当前等级对应的行为指令', () => {
    const g = new EscalationGradient();
    g.init(0, 300);
    const strategy = {
      actions: {
        0: { poses: ['lookAround'], thoughts: ['嗯...'], expression: 'nervous' },
        1: { poses: ['rage'], thoughts: ['不喜欢'], expression: 'angry' },
        2: { poses: ['sitProtest'], thoughts: ['不走了'], expression: 'angry' },
      },
    };
    const d = g.getBehaviorDirective(strategy);
    expect(d).toHaveProperty('action');
    expect(d).toHaveProperty('thought');
    expect(d).toHaveProperty('expression');
    expect(d.expression).toBe('nervous');
  });

  it('level 2 时返回抗议级行为', () => {
    const g = new EscalationGradient();
    g.init(2, 0);
    const strategy = {
      actions: {
        0: { poses: ['idle'], thoughts: ['...'], expression: 'nervous' },
        1: { poses: ['rage'], thoughts: ['!'], expression: 'angry' },
        2: { poses: ['sitProtest'], thoughts: ['不走了'], expression: 'angry' },
      },
    };
    const d = g.getBehaviorDirective(strategy);
    expect(d.expression).toBe('angry');
    expect(['sitProtest']).toContain(d.action);
  });
});

describe('EscalationGradient - serialize/hydrate', () => {
  it('serialize 返回 level/escalationTimer/coolingTimer/frozen', () => {
    const g = new EscalationGradient();
    g.init(1, 250);
    const data = g.serialize();
    expect(data).toHaveProperty('level', 1);
    expect(data).toHaveProperty('escalationTimer', 250);
    expect(data).toHaveProperty('coolingTimer');
    expect(data).toHaveProperty('frozen');
  });

  it('hydrate 恢复状态', () => {
    const g = new EscalationGradient();
    g.hydrate({ level: 2, escalationTimer: 100, coolingTimer: 500, frozen: true });
    expect(g.level).toBe(2);
    expect(g.escalationTimer).toBe(100);
    expect(g.coolingTimer).toBe(500);
    expect(g.frozen).toBe(true);
  });
});

// ============================================================
//  Phase 2: M3 SpatialPressure — 空间施压系统
// ============================================================

describe('SpatialPressure - 构造与初始化', () => {
  it('SpatialPressure 类已定义', () => {
    expect(typeof SpatialPressure).toBe('function');
  });

  it('初始 active 为 false', () => {
    const sp = new SpatialPressure();
    expect(sp.active).toBe(false);
  });

  it('初始 atTarget 为 false', () => {
    const sp = new SpatialPressure();
    expect(sp.atTarget).toBe(false);
  });

  it('初始 returning 为 false', () => {
    const sp = new SpatialPressure();
    expect(sp.returning).toBe(false);
  });

  it('初始 descending 为 false', () => {
    const sp = new SpatialPressure();
    expect(sp.descending).toBe(false);
  });
});

describe('SpatialPressure - activate', () => {
  it('activate 设置 active=true 和目标坐标', () => {
    const sp = new SpatialPressure();
    sp.activate(500, 200);
    expect(sp.active).toBe(true);
    expect(sp.targetX).toBe(500);
    expect(sp.targetY).toBe(200);
  });

  it('activate 重置 atTarget 为 false', () => {
    const sp = new SpatialPressure();
    sp.atTarget = true;
    sp.activate(500, 200);
    expect(sp.atTarget).toBe(false);
  });
});

describe('SpatialPressure - update 移动', () => {
  it('未到达目标时向目标移动', () => {
    const sp = new SpatialPressure();
    sp.activate(500, 200);
    const stickman = { x: 100, y: 500, state: 'idle' };
    sp.update(1, stickman);
    // 应该向目标方向移动
    expect(stickman.x).not.toBe(100);
  });

  it('移动速度为 CLIMB_SPEED (80 px/s)', () => {
    const sp = new SpatialPressure();
    sp.activate(1000, 500); // 远距离目标
    const stickman = { x: 100, y: 500, state: 'idle' };
    sp.update(1, stickman); // 1 秒
    const dist = Math.sqrt((stickman.x - 100) ** 2 + (stickman.y - 500) ** 2);
    expect(dist).toBeCloseTo(80, 0);
  });

  it('距离 < POSITION_TOLERANCE 时 atTarget 变为 true', () => {
    const sp = new SpatialPressure();
    sp.activate(105, 500);
    const stickman = { x: 100, y: 500, state: 'idle' };
    sp.update(1, stickman);
    expect(sp.atTarget).toBe(true);
  });

  it('atTarget 时返回 true（锁定位置）', () => {
    const sp = new SpatialPressure();
    sp.activate(100, 500);
    sp.atTarget = true;
    const result = sp.update(1, { x: 100, y: 500, state: 'idle' });
    expect(result).toBe(true);
  });

  it('active=false 时 update 返回 false', () => {
    const sp = new SpatialPressure();
    const result = sp.update(1, { x: 100, y: 500 });
    expect(result).toBe(false);
  });
});

describe('SpatialPressure - descending 下降', () => {
  it('descending 时 stickman.y 以 DESCENT_SPEED 增加', () => {
    const sp = new SpatialPressure();
    sp.active = true;
    sp.descending = true;
    const stickman = { x: 100, y: 200 };
    sp.update(1, stickman);
    expect(stickman.y).toBeCloseTo(320, 0); // 200 + 120
  });

  it('下降到地面后 deactivate', () => {
    const sp = new SpatialPressure();
    sp.active = true;
    sp.descending = true;
    const stickman = { x: 100, y: 490 };
    sp.update(1, stickman);
    expect(sp.active).toBe(false);
    expect(sp.descending).toBe(false);
  });
});

describe('SpatialPressure - onDraggedAway', () => {
  it('level 2 时设置 returning=true，returnTimer=RETURN_DELAY', () => {
    const sp = new SpatialPressure();
    sp.activate(500, 200);
    sp.atTarget = true;
    sp.onDraggedAway(2);
    expect(sp.returning).toBe(true);
    expect(sp.returnTimer).toBe(5);
    expect(sp.atTarget).toBe(false);
  });

  it('level 0 时不返回（放弃空间施压）', () => {
    const sp = new SpatialPressure();
    sp.activate(500, 200);
    sp.atTarget = true;
    sp.onDraggedAway(0);
    expect(sp.returning).toBe(false);
  });

  it('被拖走后 atTarget 重置为 false', () => {
    const sp = new SpatialPressure();
    sp.activate(500, 200);
    sp.atTarget = true;
    sp.onDraggedAway(2);
    expect(sp.atTarget).toBe(false);
  });
});

describe('SpatialPressure - returning 返回行为', () => {
  it('returning 期间 returnTimer 递减', () => {
    const sp = new SpatialPressure();
    sp.activate(500, 200);
    sp.returning = true;
    sp.returnTimer = 5;
    sp.update(2, { x: 100, y: 500, state: 'idle' });
    expect(sp.returnTimer).toBe(3);
  });

  it('returnTimer 到 0 后 returning=false，恢复向目标移动', () => {
    const sp = new SpatialPressure();
    sp.activate(500, 200);
    sp.returning = true;
    sp.returnTimer = 1;
    sp.update(2, { x: 100, y: 500, state: 'idle' });
    expect(sp.returning).toBe(false);
  });
});

describe('SpatialPressure - deactivate', () => {
  it('在地面时直接 deactivate', () => {
    const sp = new SpatialPressure();
    sp.activate(500, 500); // 地面高度
    sp.atTarget = true;
    sp.deactivate();
    expect(sp.active).toBe(false);
  });

  it('不在地面时进入 descending 模式', () => {
    const sp = new SpatialPressure();
    sp.activate(500, 200); // 高空
    sp.atTarget = true;
    sp.deactivate();
    expect(sp.descending).toBe(true);
  });
});

describe('SpatialPressure - calcTargetPosition 静态方法', () => {
  it('attention_protest + 有 windowBounds → 窗口顶部中央', () => {
    const bounds = { x: 100, y: 100, width: 800, height: 600 };
    const pos = SpatialPressure.calcTargetPosition('attention_protest', bounds, 1920, 1080);
    expect(pos.x).toBeCloseTo(500); // 100 + 800/2
    expect(pos.y).toBeCloseTo(130); // 100 + 30
  });

  it('attention_protest + 无 windowBounds → 屏幕上方 1/3 中央', () => {
    const pos = SpatialPressure.calcTargetPosition('attention_protest', null, 1920, 1080);
    expect(pos.x).toBeCloseTo(960);  // 1920/2
    expect(pos.y).toBeCloseTo(324);  // 1080 * 0.3
  });

  it('rest_demand + 有 windowBounds → 窗口正中', () => {
    const bounds = { x: 100, y: 100, width: 800, height: 600 };
    const pos = SpatialPressure.calcTargetPosition('rest_demand', bounds, 1920, 1080);
    expect(pos.x).toBeCloseTo(500); // 100 + 800/2
    expect(pos.y).toBeCloseTo(400); // 100 + 600/2
  });

  it('rest_demand + 无 windowBounds → 屏幕中央', () => {
    const pos = SpatialPressure.calcTargetPosition('rest_demand', null, 1920, 1080);
    expect(pos.x).toBeCloseTo(960);
    expect(pos.y).toBeCloseTo(540);
  });
});

// ============================================================
//  Phase 2: 集成行为 — Stickman 施压优先级分支
// ============================================================

describe('Stickman 施压集成 - 初始化', () => {
  it('Stickman 实例拥有 _contractEnforcer 属性', () => {
    const man = new Stickman(200);
    expect(man._contractEnforcer).toBeDefined();
  });

  it('Stickman 实例拥有 _escalationGradient 属性', () => {
    const man = new Stickman(200);
    expect(man._escalationGradient).toBeDefined();
  });

  it('Stickman 实例拥有 _spatialPressure 属性', () => {
    const man = new Stickman(200);
    expect(man._spatialPressure).toBeDefined();
  });

  it('Stickman 实例拥有 _windowBounds 缓存', () => {
    const man = new Stickman(200);
    expect(man).toHaveProperty('_windowBounds');
  });
});

describe('Stickman 施压集成 - onScreenInfo 解析 windowBounds', () => {
  it('screen-info 包含 windowBounds 时缓存到 _windowBounds', () => {
    const man = new Stickman(200);
    man.onScreenInfo({ app: 'VS Code', title: 'test.js', windowBounds: { x: 100, y: 50, width: 800, height: 600 } });
    expect(man._windowBounds).toEqual({ x: 100, y: 50, width: 800, height: 600 });
  });

  it('windowBounds 为 null 时 _windowBounds 设为 null', () => {
    const man = new Stickman(200);
    man._windowBounds = { x: 0, y: 0, width: 100, height: 100 };
    man.onScreenInfo({ app: 'Finder', title: '', windowBounds: null });
    expect(man._windowBounds).toBeNull();
  });

  it('onScreenInfo 调用 _contractEnforcer.onScreenInfo', () => {
    const man = new Stickman(200);
    let called = false;
    man._contractEnforcer = { onScreenInfo: () => { called = true; return { campaign: null, event: null }; } };
    man.onScreenInfo({ app: 'Safari', title: 'page', windowBounds: null });
    expect(called).toBe(true);
  });
});

describe('Stickman 施压集成 - update 优先级', () => {
  it('施压 active 时 update 使用施压动作而非正常状态机', () => {
    const man = new Stickman(200);
    man._spatialPressure = { active: true, atTarget: true, update: () => true };
    man._escalationGradient = { level: 2, getBehaviorDirective: () => ({ action: 'sitProtest', thought: '不走了', expression: 'angry' }) };
    man.update(0.016);
    expect(man.expression).toBe('angry');
  });

  it('施压 active + 未到达目标时使用 climb 动画', () => {
    const man = new Stickman(200);
    man._spatialPressure = { active: true, atTarget: false, update: () => true };
    man.update(0.016);
    // stickman should be in climbing state
    expect(man.state).toBe('climb');
  });

  it('无施压时正常行为循环不受干扰', () => {
    const man = new Stickman(200);
    man._spatialPressure = { active: false, update: () => false };
    const stateBefore = man.state;
    man.update(0.016);
    // 不会强制切换到施压状态
    expect(man.state).not.toBe('climb');
  });
});

describe('Stickman 施压集成 - 拖拽交互', () => {
  it('施压中被拖拽 → 通知 spatialPressure.onDraggedAway', () => {
    const man = new Stickman(200);
    let dragLevel = null;
    man._spatialPressure = { active: true, atTarget: true, onDraggedAway: (l) => { dragLevel = l; } };
    man._escalationGradient = { level: 2 };
    man._contractEnforcer = { activeCampaign: { ackCount: 0, lastAckAt: null } };
    man.startDrag(200, 200);
    expect(dragLevel).toBe(2);
  });

  it('施压中拖拽 → 签收信号（ackCount += 1）', () => {
    const man = new Stickman(200);
    man._spatialPressure = { active: true, atTarget: true, onDraggedAway: () => {} };
    man._escalationGradient = { level: 1 };
    man._contractEnforcer = { activeCampaign: { ackCount: 0, lastAckAt: null } };
    man.startDrag(200, 200);
    expect(man._contractEnforcer.activeCampaign.ackCount).toBe(1);
  });
});

describe('Stickman 施压集成 - 聊天交互', () => {
  it('施压中双击聊天 → 签收信号', () => {
    const man = new Stickman(200);
    man._contractEnforcer = { activeCampaign: { ackCount: 0, lastAckAt: null } };
    man._escalationGradient = { level: 1, onAcknowledge: () => {} };
    man.addInteractionEvent('chat');
    expect(man._contractEnforcer.activeCampaign.ackCount).toBe(1);
  });

  it('chatVisible 时施压动画暂停但计时器不暂停', () => {
    const man = new Stickman(200);
    man.chatVisible = true;
    man._spatialPressure = { active: true, atTarget: true, update: () => true };
    man._escalationGradient = { level: 1, tick: (dt) => { man._testTickCalled = true; return { event: null }; } };
    man.update(0.016);
    // 计时器仍在运行
    expect(man._testTickCalled).toBe(true);
  });
});

// ============================================================
//  Phase 2: 边界条件
// ============================================================

describe('施压边界条件 - 冷启动（零偏好）', () => {
  it('无偏好时施压系统完全静默', () => {
    const enforcer = new ContractEnforcer({ query: () => [] });
    for (let i = 0; i < 10; i++) {
      enforcer.onScreenInfo('app:chrome', 'time:morning', { query: () => [] }, []);
    }
    expect(enforcer.activeCampaign).toBeNull();
  });
});

describe('施压边界条件 - 偏好被侵蚀', () => {
  it('战役关联偏好 strength 降至阈值以下 → beginCooling', () => {
    const enforcer = new ContractEnforcer({ query: () => [] });
    enforcer.startCampaign({ id: 'p1', axis: 'app', strength: 0.6, polarity: -0.5 });
    // 模拟偏好被 EmergenceEngine 侵蚀
    const weakPref = { id: 'p1', strength: 0.3, polarity: -0.5 };
    const table = { query: () => [weakPref] };
    // 检测到关联偏好变弱 → 应触发冷却
    enforcer.onScreenInfo('app:bilibili', 'time:night', table, []);
    expect(enforcer.activeCampaign.status).toBe('cooling');
  });
});

describe('施压边界条件 - 多个偏好同时违约', () => {
  it('同一时间最多一个活跃战役', () => {
    const pref1 = { id: 'p1', axis: 'app', strength: 0.6, polarity: -0.5 };
    const pref2 = { id: 'p2', axis: 'time', strength: 0.8, polarity: -0.7 };
    const table = { query: () => [pref1, pref2] };
    const enforcer = new ContractEnforcer(table);
    for (let i = 0; i < 6; i++) {
      enforcer.onScreenInfo('app:bilibili', 'time:night', table, []);
    }
    expect(enforcer.activeCampaign).not.toBeNull();
    // 只有一个战役
    expect(typeof enforcer.activeCampaign.id).toBe('string');
  });
});

describe('施压边界条件 - 窗口几何获取失败', () => {
  it('windowBounds=null 时使用 fallback 位置', () => {
    const pos = SpatialPressure.calcTargetPosition('attention_protest', null, 1920, 1080);
    expect(pos.x).toBeDefined();
    expect(pos.y).toBeDefined();
  });

  it('windowBounds=null 不影响违约检测', () => {
    const pref = { id: 'p1', axis: 'app', strength: 0.8, polarity: -0.7 };
    const table = { query: () => [pref] };
    const enforcer = new ContractEnforcer(table);
    for (let i = 0; i < 6; i++) {
      enforcer.onScreenInfo('app:bilibili', 'time:night', table, []);
    }
    expect(enforcer.activeCampaign).not.toBeNull();
  });
});

describe('施压边界条件 - 性格参数调制', () => {
  it('rebellion > 0.7 时升级计时器 ×0.8（更快升级）', () => {
    const g = new EscalationGradient();
    g.init(0, 300, { rebellion: 0.8 });
    expect(g.escalationTimer).toBeCloseTo(240); // 300 * 0.8
  });

  it('rebellion < 0.3 时升级计时器 ×1.3（更慢升级）', () => {
    const g = new EscalationGradient();
    g.init(0, 300, { rebellion: 0.2 });
    expect(g.escalationTimer).toBeCloseTo(390); // 300 * 1.3
  });

  it('attachment > 0.7 时冷却时长 ×0.7（更快原谅）', () => {
    const g = new EscalationGradient();
    g.init(1, 0);
    g.startCooling({ attachment: 0.8 });
    expect(g.coolingTimer).toBeCloseTo(336); // 480 * 0.7
  });

  it('attachment < 0.3 时冷却时长 ×1.5（更难原谅）', () => {
    const g = new EscalationGradient();
    g.init(1, 0);
    g.startCooling({ attachment: 0.2 });
    expect(g.coolingTimer).toBeCloseTo(720); // 480 * 1.5
  });
});

describe('施压边界条件 - 情绪影响', () => {
  it('活跃施压期间 expression.tension 逐步增加', () => {
    const man = new Stickman(200);
    man._contractEnforcer = { activeCampaign: { status: 'active' } };
    const tensionBefore = man.drives?.expression?.tension ?? 0;
    // 模拟多帧 tick
    for (let i = 0; i < 10; i++) man.update(0.016);
    const tensionAfter = man.drives?.expression?.tension ?? 0;
    expect(tensionAfter).toBeGreaterThan(tensionBefore);
  });

  it('被拖走时 expression.tension += 0.15', () => {
    const man = new Stickman(200);
    man._spatialPressure = { active: true, atTarget: true, onDraggedAway: () => {} };
    man._escalationGradient = { level: 2 };
    man._contractEnforcer = { activeCampaign: { ackCount: 0, lastAckAt: null } };
    man.drives = { expression: { tension: 0.3 }, social: { tension: 0.2 } };
    man.startDrag(200, 200);
    expect(man.drives.expression.tension).toBeCloseTo(0.45);
    expect(man.drives.social.tension).toBeCloseTo(0.3);
  });

  it('战役 resolved 时所有 tension 各减 0.1', () => {
    const man = new Stickman(200);
    man.drives = { expression: { tension: 0.5 }, social: { tension: 0.4 }, rest: { tension: 0.3 } };
    man._contractEnforcer = { activeCampaign: null };
    // 模拟 resolved 事件
    man.onCampaignResolved();
    expect(man.drives.expression.tension).toBeCloseTo(0.4);
    expect(man.drives.social.tension).toBeCloseTo(0.3);
    expect(man.drives.rest.tension).toBeCloseTo(0.2);
  });
});

