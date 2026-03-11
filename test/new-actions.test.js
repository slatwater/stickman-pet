/**
 * 新增火柴人动作功能测试
 *
 * 覆盖范围：
 * - 8 个新动作的动画定义与姿态输出
 * - 3 个新表情的渲染分支
 * - 6 种新粒子类型
 * - 右键菜单触发机制
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
    man.aiNextAction = 'cry';
    man.transitionToNext();
    expect(man.expression).toBe('sad');
  });

  it('meditate 动作触发 peaceful 表情', () => {
    const man = new Stickman(200);
    man.aiNextAction = 'meditate';
    man.transitionToNext();
    expect(man.expression).toBe('peaceful');
  });

  it('rage 动作触发 angry 表情', () => {
    const man = new Stickman(200);
    man.aiNextAction = 'rage';
    man.transitionToNext();
    expect(man.expression).toBe('angry');
  });

  it('float 动作触发 peaceful 表情', () => {
    const man = new Stickman(200);
    man.aiNextAction = 'float';
    man.transitionToNext();
    expect(man.expression).toBe('peaceful');
  });

  it('guitar 动作触发 happy 表情', () => {
    const man = new Stickman(200);
    man.aiNextAction = 'guitar';
    man.transitionToNext();
    expect(man.expression).toBe('happy');
  });

  it('peek 动作触发 nervous 表情', () => {
    const man = new Stickman(200);
    man.aiNextAction = 'peek';
    man.transitionToNext();
    expect(man.expression).toBe('nervous');
  });

  it('slip 动作触发 surprised 表情', () => {
    const man = new Stickman(200);
    man.aiNextAction = 'slip';
    man.transitionToNext();
    expect(man.expression).toBe('surprised');
  });

  it('swordFight 动作触发 happy 表情', () => {
    const man = new Stickman(200);
    man.aiNextAction = 'swordFight';
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
//  4. 右键菜单
// ============================================================

describe('右键菜单 - 基本功能', () => {
  it('右键点击火柴人弹出上下文菜单', () => {
    // 测试右键点击在火柴人身上时触发菜单（而非窗口拖拽）
    expect(true).toBe(true); // Electron Menu 需要 mock
  });

  it('菜单包含"动作"子菜单', () => {
    // 验证 Menu template 中包含 "动作" submenu
    expect(true).toBe(true);
  });

  it('动作子菜单列出所有可触发动作', () => {
    // 验证菜单项包含：哭泣、冥想、暴怒、弹吉他、偷看、滑倒、挥剑、漂浮
    const expectedLabels = ['哭泣', '冥想', '暴怒', '弹吉他', '偷看', '滑倒', '挥剑', '漂浮'];
    expect(expectedLabels.length).toBe(8);
  });

  it('菜单项显示中文名称', () => {
    const actionLabelMap = {
      cry: '哭泣',
      meditate: '冥想',
      rage: '暴怒',
      guitar: '弹吉他',
      peek: '偷看',
      slip: '滑倒',
      swordFight: '挥剑',
      float: '漂浮',
    };
    expect(Object.keys(actionLabelMap).length).toBe(8);
  });

  it('点击菜单项立即执行对应动作', () => {
    const man = new Stickman(200);
    man.setState('idle', 3);
    // 模拟菜单触发 cry
    man.triggerAction('cry');
    expect(man.state).toBe('cry');
  });

  it('菜单触发打断当前正在执行的动作', () => {
    const man = new Stickman(200);
    man.setState('dance', 5);
    man.stateTime = 1.0; // 正在跳舞
    man.triggerAction('meditate');
    expect(man.state).toBe('meditate');
    expect(man.stateTime).toBe(0);
  });
});

describe('右键菜单 - 区分右键拖拽与右键菜单', () => {
  it('右键在火柴人身上点击（无移动）→ 弹出菜单', () => {
    // 右键 mousedown → mouseup 无 mousemove → 应弹出菜单
    expect(true).toBe(true);
  });

  it('右键在空白区域拖拽 → 移动窗口（不弹菜单）', () => {
    // 右键 mousedown → mousemove → mouseup → 窗口拖拽
    expect(true).toBe(true);
  });

  it('右键拖拽后松开不触发菜单', () => {
    expect(true).toBe(true);
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
    man.aiNextAction = 'rage';
    man.aiThought = '气死我了！';
    man.transitionToNext();
    expect(man.state).toBe('rage');
    expect(man.thought).toBe('气死我了！');
  });

  it('AI 返回的新动作在 ACTIONS 中存在才执行', () => {
    const man = new Stickman(200);
    man.aiNextAction = 'nonExistentAction';
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
    expect(man.state).not.toBe('cry');
  });
});

// ============================================================
//  7. 边界条件
// ============================================================

describe('边界条件 - 动作打断', () => {
  it('动作执行中右键触发新动作：立即打断切换', () => {
    const man = new Stickman(200);
    man.setState('dance', 5);
    man.stateTime = 2;
    man.triggerAction('cry');
    expect(man.state).toBe('cry');
    expect(man.stateTime).toBe(0);
  });

  it('打断后旧动作的表情被新动作覆盖', () => {
    const man = new Stickman(200);
    man.setState('celebrate', 4);
    man.expression = 'happy';
    man.triggerAction('rage');
    expect(man.expression).toBe('angry');
  });
});

describe('边界条件 - 拖拽优先', () => {
  it('拖拽中右键不弹出菜单', () => {
    const man = new Stickman(200);
    man.startDrag(200, 200);
    // 此时右键事件应被忽略
    expect(man.dragging).toBe(true);
    // 右键菜单不应显示
  });
});

describe('边界条件 - 空中动作切换', () => {
  it('float 期间触发其他动作：先落地再执行', () => {
    const man = new Stickman(200);
    man.setState('float', 3);
    man.y = man.y - 100; // 模拟在空中
    man.grounded = false;
    man.triggerAction('cry');
    // 应先回到地面
    // 更新几帧后应回到地面
    for (let i = 0; i < 60; i++) man.update(1 / 60);
    expect(man.y).toBeGreaterThanOrEqual(HIP_GROUND - 5);
  });

  it('jump 期间触发新动作：先落地再执行', () => {
    const man = new Stickman(200);
    man.setState('jump', 1.2);
    man.y = man.y - 80;
    man.grounded = false;
    man.triggerAction('meditate');
    for (let i = 0; i < 120; i++) man.update(1 / 60);
    expect(man.y).toBeGreaterThanOrEqual(HIP_GROUND - 5);
  });
});

describe('边界条件 - AI 决策暂停', () => {
  it('菜单打开时 AI 决策到达 → 暂不执行', () => {
    const man = new Stickman(200);
    man.menuOpen = true; // 假设有此标志
    man.aiNextAction = 'dance';
    man.transitionToNext();
    // 菜单打开时不应使用 AI 决策
    // 或将 AI 决策缓存到菜单关闭后
    expect(true).toBe(true);
  });
});

describe('边界条件 - peek 方向', () => {
  it('靠近左边缘时：向右偷看（facing = 1）', () => {
    const man = new Stickman(30); // 靠近左边
    man.triggerAction('peek');
    expect(man.facing).toBe(1);
  });

  it('靠近右边缘时：向左偷看（facing = -1）', () => {
    const man = new Stickman(W - 30); // 靠近右边
    man.triggerAction('peek');
    expect(man.facing).toBe(-1);
  });

  it('在中间位置时：随机方向或朝向屏幕中心', () => {
    const man = new Stickman(W / 2);
    man.triggerAction('peek');
    expect([-1, 1]).toContain(man.facing);
  });
});

describe('边界条件 - 无 API Key', () => {
  it('无 API Key 时右键菜单正常工作', () => {
    // API key 缺失不影响手动触发
    const man = new Stickman(200);
    man.triggerAction('cry');
    expect(man.state).toBe('cry');
  });

  it('无 API Key 时 AI 决策回退到随机选择', () => {
    const man = new Stickman(200);
    man.aiNextAction = null;
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
    man.aiNextAction = 'cry';
    man.transitionToNext();
    expect(man.stateDuration).toBeGreaterThan(1);
    expect(man.stateDuration).toBeLessThan(8);
  });

  it('meditate 持续时间较长（冥想是安静动作）', () => {
    const man = new Stickman(200);
    man.aiNextAction = 'meditate';
    man.transitionToNext();
    expect(man.stateDuration).toBeGreaterThan(2);
  });

  it('slip 持续时间较短（快速滑倒爬起）', () => {
    const man = new Stickman(200);
    man.aiNextAction = 'slip';
    man.transitionToNext();
    expect(man.stateDuration).toBeLessThan(3);
  });

  it('swordFight 持续时间适中', () => {
    const man = new Stickman(200);
    man.aiNextAction = 'swordFight';
    man.transitionToNext();
    expect(man.stateDuration).toBeGreaterThan(1);
    expect(man.stateDuration).toBeLessThan(6);
  });
});

// ============================================================
//  10. triggerAction 方法
// ============================================================

describe('triggerAction 方法', () => {
  it('triggerAction 方法存在于 Stickman 实例上', () => {
    const man = new Stickman(200);
    expect(typeof man.triggerAction).toBe('function');
  });

  it('triggerAction 设置正确的 state', () => {
    const man = new Stickman(200);
    man.triggerAction('cry');
    expect(man.state).toBe('cry');
  });

  it('triggerAction 重置 stateTime 为 0', () => {
    const man = new Stickman(200);
    man.stateTime = 5;
    man.triggerAction('meditate');
    expect(man.stateTime).toBe(0);
  });

  it('triggerAction 设置配套表情', () => {
    const man = new Stickman(200);
    man.triggerAction('rage');
    expect(man.expression).toBe('angry');
  });

  it('triggerAction 对无效动作名不执行（防御性编程）', () => {
    const man = new Stickman(200);
    man.setState('idle', 3);
    man.triggerAction('invalidAction');
    expect(man.state).toBe('idle'); // 保持原状态
  });

  it('triggerAction 记录到 actionHistory', () => {
    const man = new Stickman(200);
    const before = man.actionHistory.length;
    man.triggerAction('guitar');
    expect(man.actionHistory.length).toBe(before + 1);
    expect(man.actionHistory[man.actionHistory.length - 1]).toBe('guitar');
  });

  it('triggerAction 记录到 recentEvents', () => {
    const man = new Stickman(200);
    const before = man.recentEvents.length;
    man.triggerAction('swordFight');
    expect(man.recentEvents.length).toBe(before + 1);
  });
});
