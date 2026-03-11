// ============================================================
//  Stickman Pet - 桌面火柴人桌宠
// ============================================================

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;
const GROUND = H - 40;

// ==================== 工具函数 ====================
const deg = d => d * Math.PI / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => Math.random() * (b - a) + a;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

// ==================== 骨骼尺寸 ====================
const BONE = {
  body: 48, headR: 14,
  uArm: 26, lArm: 22,
  uLeg: 30, lLeg: 26,
};
const LEG_LEN = BONE.uLeg + BONE.lLeg;
const HIP_GROUND = GROUND - LEG_LEN;

// ==================== 粒子系统 ====================
const particles = [];

function spawnParticles(x, y, count, color, speed = 3) {
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2);
    const v = rand(speed * 0.5, speed * 1.5);
    particles.push({
      x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v - rand(1, 3),
      life: 1, decay: rand(0.02, 0.05), r: rand(2, 5), color,
    });
  }
}

function spawnStars(x, y, count) {
  for (let i = 0; i < count; i++) {
    const angle = rand(0, Math.PI * 2);
    const v = rand(2, 5);
    particles.push({
      x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v - 2,
      life: 1, decay: rand(0.015, 0.03), r: rand(3, 6), color: '#FFD700', star: true,
    });
  }
}

function spawnZzz(x, y) {
  particles.push({
    x: x + rand(-5, 5), y: y - 10,
    vx: rand(0.3, 1), vy: -rand(1, 2),
    life: 1, decay: 0.012, r: rand(8, 14),
    color: '#888', text: 'Z',
  });
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.15;
    p.life -= p.decay;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    if (p.text) {
      ctx.font = `bold ${Math.round(p.r)}px sans-serif`;
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    } else if (p.star) {
      drawStar(p.x, p.y, p.r);
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function drawStar(x, y, r) {
  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i * 72 - 90) * Math.PI / 180;
    const ax = x + Math.cos(a) * r;
    const ay = y + Math.sin(a) * r;
    const b = ((i * 72) + 36 - 90) * Math.PI / 180;
    const bx = x + Math.cos(b) * r * 0.4;
    const by = y + Math.sin(b) * r * 0.4;
    if (i === 0) ctx.moveTo(ax, ay);
    else ctx.lineTo(ax, ay);
    ctx.lineTo(bx, by);
  }
  ctx.closePath();
  ctx.fill();
}

// ==================== 动画定义（程序化） ====================
const ACTIONS = {
  idle: (t) => {
    const b = Math.sin(t * 2) * 3;
    return {
      body: b, head: Math.sin(t * 1.3) * 5,
      lArmUp: -15 + Math.sin(t * 1.1) * 5, lArmLow: -10,
      rArmUp: 15 + Math.sin(t * 1.1 + 1) * 5, rArmLow: 10,
      lLegUp: -4, lLegLow: 0, rLegUp: 4, rLegLow: 0,
    };
  },

  lookAround: (t) => {
    const h = Math.sin(t * 0.8) * 25;
    return {
      body: Math.sin(t * 1.5) * 2, head: h,
      lArmUp: -12, lArmLow: -8,
      rArmUp: 12, rArmLow: 8,
      lLegUp: -4, lLegLow: 0, rLegUp: 4, rLegLow: 0,
    };
  },

  walk: (t) => {
    const s = Math.sin(t * 7);
    const c = Math.cos(t * 7);
    return {
      body: s * 5, head: -s * 4,
      lArmUp: s * 30, lArmLow: -Math.abs(s) * 25,
      rArmUp: -s * 30, rArmLow: -Math.abs(s) * 25,
      lLegUp: -s * 35, lLegLow: clamp(c * 40, 0, 40),
      rLegUp: s * 35, rLegLow: clamp(-c * 40, 0, 40),
    };
  },

  dance: (t) => {
    const s1 = Math.sin(t * 10);
    const s2 = Math.sin(t * 8 + 1);
    const s3 = Math.sin(t * 12 + 2);
    return {
      body: s1 * 20, head: s2 * 25,
      lArmUp: s1 * 120, lArmLow: s3 * 80,
      rArmUp: -s2 * 120, rArmLow: -s3 * 80,
      lLegUp: s2 * 50, lLegLow: Math.abs(s1) * 40,
      rLegUp: -s2 * 50, rLegLow: Math.abs(s2) * 40,
    };
  },

  crazyDance: (t) => {
    const s1 = Math.sin(t * 14);
    const s2 = Math.cos(t * 11);
    const s3 = Math.sin(t * 17);
    return {
      body: s1 * 30, head: s2 * 35,
      lArmUp: s3 * 170, lArmLow: s1 * 120,
      rArmUp: -s1 * 170, rArmLow: -s2 * 120,
      lLegUp: s2 * 70, lLegLow: Math.abs(s3) * 60,
      rLegUp: -s1 * 70, rLegLow: Math.abs(s1) * 60,
    };
  },

  jump: (t) => {
    // 0-0.3: crouch, 0.3-0.7: air, 0.7-1: land
    if (t < 0.3) {
      const p = t / 0.3;
      return {
        body: -p * 8, head: -p * 5,
        lArmUp: -15 - p * 30, lArmLow: -10 - p * 20,
        rArmUp: 15 + p * 30, rArmLow: 10 + p * 20,
        lLegUp: -5 - p * 30, lLegLow: p * 50,
        rLegUp: 5 + p * 30, rLegLow: p * 50,
      };
    } else if (t < 0.7) {
      const p = (t - 0.3) / 0.4;
      return {
        body: 0, head: 5,
        lArmUp: -100 + p * 20, lArmLow: -30,
        rArmUp: 100 - p * 20, rArmLow: 30,
        lLegUp: -20 + p * 10, lLegLow: 10,
        rLegUp: 20 - p * 10, rLegLow: 10,
      };
    } else {
      const p = (t - 0.7) / 0.3;
      return {
        body: p * -5, head: 0,
        lArmUp: -80 + p * 65, lArmLow: -30 + p * 20,
        rArmUp: 80 - p * 65, rArmLow: 30 - p * 20,
        lLegUp: -10 - p * 20, lLegLow: 10 + p * 30,
        rLegUp: 10 + p * 20, rLegLow: 10 + p * 30,
      };
    }
  },

  wave: (t) => {
    const s = Math.sin(t * 12);
    return {
      body: Math.sin(t * 3) * 5, head: 10,
      lArmUp: -15, lArmLow: -10,
      rArmUp: -150 + s * 30, rArmLow: 90 + s * 20,
      lLegUp: -4, lLegLow: 0, rLegUp: 4, rLegLow: 0,
    };
  },

  kick: (t) => {
    const p = t < 0.4 ? t / 0.4 : 1 - (t - 0.4) / 0.6;
    const k = Math.sin(p * Math.PI);
    return {
      body: -k * 15, head: -k * 10,
      lArmUp: -40 * k, lArmLow: -20 * k,
      rArmUp: 40 * k, rArmLow: 20 * k,
      lLegUp: -5, lLegLow: 0,
      rLegUp: 80 * k, rLegLow: -30 * k,
    };
  },

  spin: (t) => {
    const angle = t * 720;
    const s = Math.sin(deg(angle));
    return {
      body: s * 15, head: s * 10,
      lArmUp: -90 + s * 30, lArmLow: 0,
      rArmUp: 90 - s * 30, rArmLow: 0,
      lLegUp: -20, lLegLow: 0,
      rLegUp: 20, rLegLow: 0,
    };
  },

  backflip: (t) => {
    const angle = t * 360;
    const r = deg(angle);
    const bodyA = -angle;
    return {
      body: bodyA % 360, head: 0,
      lArmUp: -120, lArmLow: -30,
      rArmUp: 120, rArmLow: 30,
      lLegUp: -30, lLegLow: 20,
      rLegUp: 30, rLegLow: 20,
    };
  },

  sitDown: (t) => {
    const p = Math.min(t / 0.3, 1);
    return {
      body: -p * 5, head: Math.sin(t * 2) * 8,
      lArmUp: -15 + p * 5, lArmLow: -10 - p * 20,
      rArmUp: 15 - p * 5, rArmLow: 10 + p * 20,
      lLegUp: -5 - p * 60, lLegLow: p * 80,
      rLegUp: 5 + p * 60, rLegLow: p * 80,
    };
  },

  flex: (t) => {
    const p = Math.sin(t * 4);
    return {
      body: 0, head: 5,
      lArmUp: -90 + p * 10, lArmLow: -130 + p * 10,
      rArmUp: 90 - p * 10, rArmLow: 130 - p * 10,
      lLegUp: -8, lLegLow: 0, rLegUp: 8, rLegLow: 0,
    };
  },

  pushUp: (t) => {
    const pump = Math.sin(t * 5);
    const bend = (1 + pump) / 2;
    return {
      body: 75, head: -30 + pump * 5,
      lArmUp: -75 + bend * 20, lArmLow: bend * 30,
      rArmUp: 75 - bend * 20, rArmLow: -bend * 30,
      lLegUp: 5, lLegLow: 0, rLegUp: -5, rLegLow: 0,
    };
  },

  headstand: (t) => {
    const sway = Math.sin(t * 2) * 8;
    return {
      body: 180 + sway, head: 0,
      lArmUp: -40 + sway, lArmLow: 30,
      rArmUp: 40 + sway, rArmLow: -30,
      lLegUp: -15 + Math.sin(t * 1.5) * 12, lLegLow: 0,
      rLegUp: 15 + Math.sin(t * 1.5 + 1) * 12, rLegLow: 0,
    };
  },

  yawn: (t) => {
    const p = Math.min(t / 3, 1);
    let armRaise, bodyStretch;
    if (p < 0.4) {
      armRaise = p / 0.4;
      bodyStretch = armRaise * 5;
    } else if (p < 0.7) {
      armRaise = 1;
      bodyStretch = 5 + Math.sin((p - 0.4) / 0.3 * Math.PI) * 3;
    } else {
      armRaise = 1 - (p - 0.7) / 0.3;
      bodyStretch = 5 * armRaise;
    }
    return {
      body: -bodyStretch, head: -10 * armRaise + Math.sin(t * 2) * 3,
      lArmUp: -15 - armRaise * 150, lArmLow: -10 - armRaise * 20,
      rArmUp: 15 + armRaise * 150, rArmLow: 10 + armRaise * 20,
      lLegUp: -4, lLegLow: 0, rLegUp: 4, rLegLow: 0,
    };
  },

  sneak: (t) => {
    const s = Math.sin(t * 4);
    const c = Math.cos(t * 4);
    return {
      body: -15 + s * 3, head: 20 + s * 5,
      lArmUp: -30 + s * 10, lArmLow: -60,
      rArmUp: 30 - s * 10, rArmLow: 60,
      lLegUp: -s * 25, lLegLow: clamp(c * 35, 0, 35),
      rLegUp: s * 25, rLegLow: clamp(-c * 35, 0, 35),
    };
  },

  bow: (t) => {
    const p = (t % 2) / 2;
    let bend;
    if (p < 0.3) bend = p / 0.3;
    else if (p < 0.6) bend = 1;
    else bend = 1 - (p - 0.6) / 0.4;
    return {
      body: bend * 50, head: bend * 20,
      lArmUp: -10 + bend * 10, lArmLow: -5,
      rArmUp: 10 - bend * 10, rArmLow: 5,
      lLegUp: -4, lLegLow: 0, rLegUp: 4, rLegLow: 0,
    };
  },

  run: (t) => {
    const s = Math.sin(t * 12);
    const c = Math.cos(t * 12);
    return {
      body: 15 + s * 5, head: -s * 6,
      lArmUp: s * 50, lArmLow: -Math.abs(s) * 40,
      rArmUp: -s * 50, rArmLow: -Math.abs(s) * 40,
      lLegUp: -s * 50, lLegLow: clamp(c * 55, 0, 55),
      rLegUp: s * 50, rLegLow: clamp(-c * 55, 0, 55),
    };
  },

  sleep: (t) => {
    const headDroop = Math.sin(t * 0.8) * 15 + 20;
    const sway = Math.sin(t * 0.5) * 5;
    return {
      body: sway, head: headDroop,
      lArmUp: -10 + sway, lArmLow: -5,
      rArmUp: 10 + sway, rArmLow: 5,
      lLegUp: -4, lLegLow: 0, rLegUp: 4, rLegLow: 0,
    };
  },

  stumble: (t) => {
    let body, head, armL, armR;
    if (t < 0.3) {
      const q = t / 0.3;
      body = q * 35; head = q * 15;
      armL = -q * 60; armR = q * 60;
    } else if (t < 0.6) {
      const q = (t - 0.3) / 0.3;
      body = 35 - q * 55; head = 15 - q * 30;
      armL = -60 + q * 100; armR = 60 - q * 100;
    } else {
      const q = (t - 0.6) / 0.4;
      body = -20 + q * 20; head = -15 + q * 15;
      armL = 40 - q * 55; armR = -40 + q * 55;
    }
    return {
      body, head,
      lArmUp: armL, lArmLow: -20,
      rArmUp: armR, rArmLow: 20,
      lLegUp: -5 + Math.sin(t * 25) * 15, lLegLow: 10,
      rLegUp: 5 - Math.sin(t * 25) * 15, rLegLow: 10,
    };
  },

  celebrate: (t) => {
    const bounce = Math.abs(Math.sin(t * 8));
    return {
      body: -bounce * 5, head: -10,
      lArmUp: -160 + Math.sin(t * 10) * 20, lArmLow: 10,
      rArmUp: 160 - Math.sin(t * 10 + 1) * 20, rArmLow: -10,
      lLegUp: -10, lLegLow: bounce * 20,
      rLegUp: 10, rLegLow: bounce * 20,
    };
  },

  // 反应动画
  surprised: (t) => {
    const bounce = Math.sin(t * 15) * Math.max(0, 1 - t * 2);
    return {
      body: bounce * 10, head: -15 + bounce * 5,
      lArmUp: -130 + bounce * 20, lArmLow: 10,
      rArmUp: 130 - bounce * 20, rArmLow: -10,
      lLegUp: -15, lLegLow: 0, rLegUp: 15, rLegLow: 0,
    };
  },

  nervous: (t) => {
    const shake = Math.sin(t * 20) * 5;
    return {
      body: shake, head: shake * 2,
      lArmUp: -30 + shake * 3, lArmLow: -40,
      rArmUp: 30 + shake * 3, rArmLow: 40,
      lLegUp: -8 + shake, lLegLow: 5, rLegUp: 8 + shake, rLegLow: 5,
    };
  },

  dangling: (t) => ({
    body: 160 + Math.sin(t * 3) * 15, head: Math.sin(t * 4) * 20,
    lArmUp: -20 + Math.sin(t * 5) * 30, lArmLow: 20 + Math.sin(t * 6) * 20,
    rArmUp: 20 + Math.sin(t * 5 + 1) * 30, rArmLow: -20 + Math.sin(t * 6 + 1) * 20,
    lLegUp: -10 + Math.sin(t * 4) * 20, lLegLow: 15,
    rLegUp: 10 + Math.sin(t * 4 + 1) * 20, rLegLow: 15,
  }),

  flying: (t) => ({
    body: Math.sin(t * 8) * 20, head: Math.sin(t * 10) * 30,
    lArmUp: -140 + Math.sin(t * 12) * 30, lArmLow: Math.sin(t * 15) * 40,
    rArmUp: 140 + Math.sin(t * 12) * 30, rArmLow: Math.sin(t * 15) * 40,
    lLegUp: -30 + Math.sin(t * 9) * 20, lLegLow: 20,
    rLegUp: 30 + Math.sin(t * 9 + 1) * 20, rLegLow: 20,
  }),

  splat: (t) => {
    const p = Math.min(t * 3, 1);
    return {
      body: 80 * p, head: 10,
      lArmUp: -90 * p, lArmLow: 0,
      rArmUp: 90 * p, rArmLow: 0,
      lLegUp: -70 * p, lLegLow: 30 * p,
      rLegUp: 70 * p, rLegLow: 30 * p,
    };
  },

  // ========== 新增动作 ==========

  cry: (t) => {
    const shake = Math.sin(t * 12) * 3;
    return {
      body: -15 + shake, head: -10 + Math.sin(t * 8) * 3,
      lArmUp: -80 + Math.sin(t * 6) * 10, lArmLow: -60,
      rArmUp: 80 + Math.sin(t * 6 + 1) * 10, rArmLow: 60,
      lLegUp: -5, lLegLow: 5,
      rLegUp: 5, rLegLow: 5,
    };
  },

  meditate: (t) => {
    const breathe = Math.sin(t * 2) * 5;
    return {
      body: -5 + breathe, head: -5 + Math.sin(t * 1.5) * 3,
      lArmUp: -30 + Math.sin(t) * 5, lArmLow: -50,
      rArmUp: 30 + Math.sin(t) * 5, rArmLow: 50,
      lLegUp: -40, lLegLow: 60,
      rLegUp: 40, rLegLow: 60,
    };
  },

  rage: (t) => {
    const tremble = Math.sin(t * 30) * 8;
    const punch = Math.sin(t * 6);
    return {
      body: tremble, head: -5 + Math.sin(t * 25) * 5,
      lArmUp: -40 + Math.sin(t * 5) * 20, lArmLow: -30,
      rArmUp: punch * 90, rArmLow: -Math.abs(punch) * 40,
      lLegUp: -15 + Math.sin(t * 4) * 10, lLegLow: 5,
      rLegUp: 15 + Math.sin(t * 4 + 1) * 10, rLegLow: 5,
    };
  },

  guitar: (t) => {
    const strum = Math.sin(t * 8);
    return {
      body: Math.sin(t * 3) * 8, head: 5 + Math.sin(t * 2) * 3,
      lArmUp: -50 + Math.sin(t * 2) * 5, lArmLow: -70,
      rArmUp: 30 + strum * 15, rArmLow: 45 + strum * 20,
      lLegUp: -5, lLegLow: 0,
      rLegUp: 5, rLegLow: 0,
    };
  },

  peek: (t) => {
    const peekPhase = Math.sin(t * 3);
    return {
      body: -20 + peekPhase * 8, head: 25 * peekPhase,
      lArmUp: -10 + peekPhase * 10, lArmLow: -30,
      rArmUp: 10 - peekPhase * 10, rArmLow: 30,
      lLegUp: -8, lLegLow: 10,
      rLegUp: 8, rLegLow: 10,
    };
  },

  slip: (t) => {
    if (t < 0.3) {
      const p = t / 0.3;
      return {
        body: -p * 20, head: p * 15,
        lArmUp: -40 * p, lArmLow: -20,
        rArmUp: 60 * p, rArmLow: 30,
        lLegUp: p * 50, lLegLow: -p * 20,
        rLegUp: -p * 40, rLegLow: p * 30,
      };
    } else if (t < 0.6) {
      const p = (t - 0.3) / 0.3;
      return {
        body: -20 - p * 40, head: 15 + p * 5,
        lArmUp: -40 - p * 30, lArmLow: -20,
        rArmUp: 60 + p * 20, rArmLow: 30,
        lLegUp: 50, lLegLow: -20 + p * 30,
        rLegUp: -40 + p * 10, rLegLow: 30,
      };
    } else {
      const p = (t - 0.6) / 0.4;
      return {
        body: -60 + p * 55, head: 20 - p * 20,
        lArmUp: -70 + p * 55, lArmLow: -20 + p * 10,
        rArmUp: 80 - p * 65, rArmLow: 30 - p * 25,
        lLegUp: 50 - p * 55, lLegLow: 10 - p * 10,
        rLegUp: -30 + p * 35, rLegLow: 30 - p * 30,
      };
    }
  },

  swordFight: (t) => {
    const swing = Math.sin(t * 8);
    const stance = Math.sin(t * 3);
    return {
      body: stance * 10, head: -5 + swing * 5,
      lArmUp: -30 + stance * 10, lArmLow: -40,
      rArmUp: -60 + swing * 70, rArmLow: -20 + swing * 30,
      lLegUp: -20 + stance * 5, lLegLow: 10,
      rLegUp: 20 - stance * 5, rLegLow: 10,
    };
  },

  float: (t) => {
    const sway = Math.sin(t * 2);
    return {
      body: sway * 5, head: sway * 3,
      lArmUp: -60 + sway * 15, lArmLow: -10 + sway * 5,
      rArmUp: 60 - sway * 15, rArmLow: 10 - sway * 5,
      lLegUp: -10 + sway * 5, lLegLow: 5,
      rLegUp: 10 - sway * 5, rLegLow: 5,
    };
  },

};

// ==================== 火柴人颜色 ====================
const STICKMAN_COLOR = { body: '#222', back: '#555', head: '#222', fill: '#fff' };

// ==================== 火柴人 ====================
class Stickman {
  constructor(startX) {
    this.colors = STICKMAN_COLOR;
    this.x = startX !== undefined ? startX : W / 2;
    this.y = HIP_GROUND;
    this.vx = 0;
    this.vy = 0;
    this.grounded = true;
    this.facing = 1;

    this.pose = ACTIONS.idle(0);

    this.state = 'idle';
    this.stateTime = 0;
    this.stateDuration = rand(1.5, 4);
    this.walkTarget = -1;
    this.jumpPhase = 0;
    this.jumpStartY = 0;

    this.mouseX = W / 2;
    this.mouseY = H / 2;
    this.mouseDown = false;
    this.dragging = false;
    this.dragOffX = 0;
    this.dragOffY = 0;
    this.mouseHistory = [];

    this.expression = 'normal';
    this.exprTimer = 0;
    this.dizzyAngle = 0;
    this.squash = 1;  // 挤压拉伸
    this.stretch = 1;
    this.bounceCount = 0;

    // AI 自主行为
    this.thought = '';
    this.thoughtTimer = 0;
    this.recentEvents = [];
    this.actionHistory = [];
    this.aiNextAction = null;
    this.aiThought = null;
    this.aiPending = false;
  }

  // 获取骨骼关节位置
  getJoints() {
    const p = this.pose;
    const hip = { x: this.x, y: this.y };

    const bRad = deg(p.body);
    const neck = {
      x: hip.x + Math.sin(bRad) * BONE.body,
      y: hip.y - Math.cos(bRad) * BONE.body,
    };

    const hRad = deg(p.body + p.head);
    const headCenter = {
      x: neck.x + Math.sin(hRad) * (BONE.headR + 3),
      y: neck.y - Math.cos(hRad) * (BONE.headR + 3),
    };

    const makeChain = (origin, a1, l1, a2, l2) => {
      const r1 = deg(a1);
      const mid = {
        x: origin.x + Math.sin(r1) * l1,
        y: origin.y + Math.cos(r1) * l1,
      };
      const r2 = deg(a1 + a2);
      const end = {
        x: mid.x + Math.sin(r2) * l2,
        y: mid.y + Math.cos(r2) * l2,
      };
      return { origin, mid, end };
    };

    const lArm = makeChain(neck, p.lArmUp, BONE.uArm, p.lArmLow, BONE.lArm);
    const rArm = makeChain(neck, p.rArmUp, BONE.uArm, p.rArmLow, BONE.lArm);
    const lLeg = makeChain(hip, p.lLegUp, BONE.uLeg, p.lLegLow, BONE.lLeg);
    const rLeg = makeChain(hip, p.rLegUp, BONE.uLeg, p.rLegLow, BONE.lLeg);

    return { hip, neck, headCenter, lArm, rArm, lLeg, rLeg };
  }

  // 碰撞检测 - 鼠标是否在火柴人身上
  hitTest(mx, my) {
    const j = this.getJoints();
    const pts = [j.hip, j.neck, j.headCenter, j.lArm.mid, j.lArm.end,
      j.rArm.mid, j.rArm.end, j.lLeg.mid, j.lLeg.end, j.rLeg.mid, j.rLeg.end];
    for (const pt of pts) {
      if (Math.hypot(mx - pt.x, my - pt.y) < 25) return true;
    }
    return false;
  }

  // 鼠标距离
  mouseDist() {
    return Math.hypot(this.mouseX - this.x, this.mouseY - (this.y - BONE.body / 2));
  }

  // 选择下一个随机动作
  nextAction() {
    const actions = ['idle', 'lookAround', 'walk', 'dance', 'crazyDance',
      'jump', 'wave', 'kick', 'spin', 'backflip', 'sitDown', 'flex',
      'pushUp', 'headstand', 'yawn', 'sneak', 'bow', 'run', 'sleep', 'stumble', 'celebrate',
      'cry', 'meditate', 'rage', 'guitar', 'peek', 'slip', 'swordFight', 'float'];
    const weights = [3, 2, 4, 2, 1, 2, 1, 1, 1, 1, 1, 1,
      1, 1, 2, 2, 1, 3, 2, 1, 1,
      1, 1, 1, 1, 1, 1, 1, 1];
    const total = weights.reduce((a, b) => a + b);
    let r = Math.random() * total;
    for (let i = 0; i < actions.length; i++) {
      r -= weights[i];
      if (r <= 0) return actions[i];
    }
    return 'idle';
  }

  addEvent(event) {
    this.recentEvents.push(event);
    if (this.recentEvents.length > 10) this.recentEvents.shift();
  }

  requestAiDecision() {
    if (this.aiPending || !window.electronAPI?.aiDecide) return;
    this.aiPending = true;
    const context = [
      `上一个动作：${this.state}`,
      `动作历史：${this.actionHistory.slice(-5).join('→') || '无'}`,
      `最近互动：${this.recentEvents.slice(-3).join('、') || '无'}`,
      `已连续做了${this.actionHistory.length}个动作`,
    ].join('\n');

    window.electronAPI.aiDecide(context).then(result => {
      this.aiPending = false;
      if (result?.action && ACTIONS[result.action]) {
        this.aiNextAction = result.action;
        this.aiThought = result.thought || '';
      }
    }).catch(() => { this.aiPending = false; });
  }

  update(dt) {
    this.stateTime += dt;

    // 处理表情计时
    if (this.exprTimer > 0) {
      this.exprTimer -= dt;
      if (this.exprTimer <= 0) this.expression = 'normal';
    }

    // 思考气泡消退
    if (this.thoughtTimer > 0) this.thoughtTimer -= dt;

    // 挤压拉伸恢复
    this.squash = lerp(this.squash, 1, dt * 8);
    this.stretch = lerp(this.stretch, 1, dt * 8);

    // 眩晕旋转
    if (this.expression === 'dizzy') {
      this.dizzyAngle += dt * 10;
    }

    // ====== 拖拽状态 ======
    if (this.dragging) {
      this.x = lerp(this.x, this.mouseX + this.dragOffX, 0.3);
      this.y = lerp(this.y, this.mouseY + this.dragOffY, 0.3);
      this.pose = this.lerpPose(this.pose, ACTIONS.dangling(this.stateTime), 0.15);

      // 记录鼠标历史用于计算投掷速度
      this.mouseHistory.push({ x: this.mouseX, y: this.mouseY, t: performance.now() });
      if (this.mouseHistory.length > 10) this.mouseHistory.shift();
      return;
    }

    // ====== 飞行/投掷状态 ======
    if (this.state === 'thrown') {
      this.vy += 1800 * dt; // 重力
      this.x += this.vx * dt;
      this.y += this.vy * dt;

      this.pose = this.lerpPose(this.pose, ACTIONS.flying(this.stateTime), 0.2);

      // 碰地面
      if (this.y >= HIP_GROUND) {
        this.y = HIP_GROUND;
        const impact = Math.abs(this.vy);

        if (impact > 200) {
          this.vy = -this.vy * 0.5;
          this.vx *= 0.7;
          this.bounceCount++;
          this.squash = 1.4;
          this.stretch = 0.7;
          spawnParticles(this.x, GROUND, 8, '#8B7355', 4);

          if (this.bounceCount > 3 || impact < 300) {
            this.land();
          }
        } else {
          this.land();
        }
      }

      // 碰墙壁
      if (this.x < 30) { this.x = 30; this.vx = Math.abs(this.vx) * 0.6; spawnStars(30, this.y, 3); }
      if (this.x > W - 30) { this.x = W - 30; this.vx = -Math.abs(this.vx) * 0.6; spawnStars(W - 30, this.y, 3); }

      // 碰天花板
      if (this.y < 60) { this.y = 60; this.vy = Math.abs(this.vy) * 0.5; spawnStars(this.x, 30, 3); }
      return;
    }

    // ====== 鼠标靠近反应 ======
    const md = this.mouseDist();
    if (md < 60 && this.state !== 'surprised' && this.state !== 'nervous' && this.grounded) {
      if (this.state !== 'nervous') {
        this.addEvent('被鼠标吓到了');
        this.setState('nervous', 0);
        this.expression = 'nervous';
        this.exprTimer = 2;
      }
    }

    // ====== 状态机 ======
    switch (this.state) {
      case 'idle':
      case 'lookAround':
      case 'flex':
      case 'sitDown':
      case 'pushUp':
      case 'headstand':
      case 'yawn':
      case 'bow':
      case 'celebrate':
        this.pose = this.lerpPose(this.pose, ACTIONS[this.state](this.stateTime), 0.12);
        if (this.state === 'celebrate' && Math.random() < 0.05) {
          const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#FFD700'];
          spawnParticles(this.x + rand(-20, 20), this.y - BONE.body + rand(-20, 0),
            2, colors[Math.floor(Math.random() * colors.length)], 3);
        }
        if (this.stateTime >= this.stateDuration) this.transitionToNext();
        break;

      case 'walk': {
        this.pose = this.lerpPose(this.pose, ACTIONS.walk(this.stateTime), 0.15);
        this.x += this.facing * 60 * dt;
        // 到达目标或边界
        if ((this.facing > 0 && this.x >= this.walkTarget) ||
            (this.facing < 0 && this.x <= this.walkTarget) ||
            this.x < 40 || this.x > W - 40) {
          this.x = clamp(this.x, 40, W - 40);
          this.transitionToNext();
        }
        break;
      }

      case 'sneak': {
        this.pose = this.lerpPose(this.pose, ACTIONS.sneak(this.stateTime), 0.15);
        this.x += this.facing * 30 * dt;
        if ((this.facing > 0 && this.x >= this.walkTarget) ||
            (this.facing < 0 && this.x <= this.walkTarget) ||
            this.x < 40 || this.x > W - 40) {
          this.x = clamp(this.x, 40, W - 40);
          this.transitionToNext();
        }
        break;
      }

      case 'run': {
        this.pose = this.lerpPose(this.pose, ACTIONS.run(this.stateTime), 0.15);
        this.x += this.facing * 150 * dt;
        if (Math.random() < 0.3) {
          spawnParticles(this.x - this.facing * 10, GROUND - 5, 1, '#ccc', 1);
        }
        if ((this.facing > 0 && this.x >= this.walkTarget) ||
            (this.facing < 0 && this.x <= this.walkTarget) ||
            this.x < 40 || this.x > W - 40) {
          this.x = clamp(this.x, 40, W - 40);
          this.transitionToNext();
        }
        break;
      }

      case 'sleep': {
        this.pose = this.lerpPose(this.pose, ACTIONS.sleep(this.stateTime), 0.08);
        if (Math.random() < 0.02) {
          const j = this.getJoints();
          spawnZzz(j.headCenter.x, j.headCenter.y);
        }
        if (this.stateTime >= this.stateDuration) {
          this.expression = 'normal';
          this.transitionToNext();
        }
        break;
      }

      case 'stumble': {
        this.pose = this.lerpPose(this.pose,
          ACTIONS.stumble(clamp(this.stateTime / this.stateDuration, 0, 1)), 0.2);
        this.x += this.facing * 25 * dt * Math.sin(this.stateTime * 5);
        this.x = clamp(this.x, 40, W - 40);
        if (this.stateTime >= this.stateDuration) {
          this.expression = 'dizzy';
          this.exprTimer = 1.5;
          this.transitionToNext();
        }
        break;
      }

      case 'dance':
      case 'crazyDance':
        this.pose = this.lerpPose(this.pose, ACTIONS[this.state](this.stateTime), 0.15);
        if (this.stateTime >= this.stateDuration) this.transitionToNext();
        break;

      case 'wave':
        this.pose = this.lerpPose(this.pose, ACTIONS.wave(this.stateTime), 0.15);
        if (this.stateTime >= this.stateDuration) this.transitionToNext();
        break;

      case 'kick':
        this.pose = this.lerpPose(this.pose, ACTIONS.kick(this.stateTime / this.stateDuration), 0.2);
        if (this.stateTime >= this.stateDuration) this.transitionToNext();
        break;

      case 'spin': {
        const p = this.stateTime / this.stateDuration;
        this.pose = this.lerpPose(this.pose, ACTIONS.spin(p), 0.25);
        if (this.stateTime >= this.stateDuration) {
          this.expression = 'dizzy';
          this.exprTimer = 2;
          this.transitionToNext();
        }
        break;
      }

      case 'jump': {
        const dur = this.stateDuration;
        const p = this.stateTime / dur;
        this.pose = this.lerpPose(this.pose, ACTIONS.jump(clamp(p, 0, 1)), 0.2);
        // 物理跳跃
        if (p < 0.3) {
          // 蓄力
        } else if (p >= 0.3 && this.jumpPhase === 0) {
          this.jumpPhase = 1;
          this.vy = -500;
          this.jumpStartY = this.y;
        }
        if (this.jumpPhase === 1) {
          this.vy += 1200 * dt;
          this.y += this.vy * dt;
          if (this.y >= HIP_GROUND) {
            this.y = HIP_GROUND;
            this.jumpPhase = 0;
            this.vy = 0;
            this.squash = 1.3;
            this.stretch = 0.75;
            spawnParticles(this.x, GROUND, 6, '#8B7355', 3);
          }
        }
        if (p >= 1) this.transitionToNext();
        break;
      }

      case 'backflip': {
        const p = this.stateTime / this.stateDuration;
        this.pose = this.lerpPose(this.pose, ACTIONS.backflip(clamp(p, 0, 1)), 0.3);
        // 翻转时的跳跃
        if (p < 0.1 && this.jumpPhase === 0) {
          this.jumpPhase = 1;
          this.vy = -600;
        }
        if (this.jumpPhase === 1) {
          this.vy += 1200 * dt;
          this.y += this.vy * dt;
          if (this.y >= HIP_GROUND && p > 0.5) {
            this.y = HIP_GROUND;
            this.jumpPhase = 0;
            this.vy = 0;
            this.squash = 1.4;
            this.stretch = 0.7;
            spawnParticles(this.x, GROUND, 8, '#8B7355', 4);
          }
        }
        if (p >= 1) this.transitionToNext();
        break;
      }

      case 'surprised': {
        this.pose = this.lerpPose(this.pose, ACTIONS.surprised(this.stateTime), 0.2);
        if (this.stateTime > 1) this.transitionToNext();
        break;
      }

      case 'nervous': {
        this.pose = this.lerpPose(this.pose, ACTIONS.nervous(this.stateTime), 0.15);
        // 鼠标离开后恢复
        if (this.mouseDist() > 80 || this.stateTime > 3) this.transitionToNext();
        break;
      }

      case 'splat': {
        this.pose = this.lerpPose(this.pose, ACTIONS.splat(this.stateTime), 0.15);
        if (this.stateTime > 1.5) this.transitionToNext();
        break;
      }

      case 'cry':
        this.pose = this.lerpPose(this.pose, ACTIONS.cry(this.stateTime), 0.12);
        if (Math.random() < 0.08) {
          const j = this.getJoints();
          particles.push({
            x: j.headCenter.x + rand(-5, 5), y: j.headCenter.y + 5,
            vx: rand(-0.5, 0.5), vy: rand(0.5, 2),
            life: 1, decay: 0.03, r: rand(6, 10), color: '#66BBFF', text: '💧',
          });
        }
        if (this.stateTime >= this.stateDuration) this.transitionToNext();
        break;

      case 'meditate':
        this.pose = this.lerpPose(this.pose, ACTIONS.meditate(this.stateTime), 0.1);
        if (Math.random() < 0.05) {
          particles.push({
            x: this.x + rand(-15, 15), y: this.y - BONE.body / 2 + rand(-20, 20),
            vx: rand(-0.3, 0.3), vy: -rand(0.5, 1.5),
            life: 1, decay: 0.015, r: rand(2, 4), color: '#FFD700',
          });
        }
        if (this.stateTime >= this.stateDuration) this.transitionToNext();
        break;

      case 'rage':
        this.pose = this.lerpPose(this.pose, ACTIONS.rage(this.stateTime), 0.15);
        if (Math.random() < 0.1) {
          const colors = ['#FF4500', '#FF6600', '#FF8800', 'orange', 'red'];
          particles.push({
            x: this.x + rand(-10, 10), y: this.y - BONE.body + rand(-10, 10),
            vx: rand(-1, 1), vy: -rand(1, 3),
            life: 1, decay: 0.03, r: rand(3, 6),
            color: colors[Math.floor(Math.random() * colors.length)],
          });
        }
        if (this.stateTime >= this.stateDuration) this.transitionToNext();
        break;

      case 'guitar':
        this.pose = this.lerpPose(this.pose, ACTIONS.guitar(this.stateTime), 0.12);
        if (Math.random() < 0.06) {
          const notes = ['♪', '♫', '🎵'];
          const j = this.getJoints();
          particles.push({
            x: j.headCenter.x + rand(-10, 10), y: j.headCenter.y - 10,
            vx: rand(-0.5, 0.5), vy: -rand(1, 2),
            life: 1, decay: 0.02, r: rand(8, 12),
            color: '#FF69B4', text: notes[Math.floor(Math.random() * notes.length)],
          });
        }
        if (this.stateTime >= this.stateDuration) this.transitionToNext();
        break;

      case 'peek':
        this.pose = this.lerpPose(this.pose, ACTIONS.peek(this.stateTime), 0.12);
        if (Math.random() < 0.04) {
          const j = this.getJoints();
          particles.push({
            x: j.headCenter.x + rand(-5, 5), y: j.headCenter.y - 15,
            vx: rand(-0.3, 0.3), vy: -rand(0.5, 1),
            life: 1, decay: 0.02, r: rand(10, 14),
            color: '#888', text: '?',
          });
        }
        if (this.stateTime >= this.stateDuration) this.transitionToNext();
        break;

      case 'slip': {
        const sp = clamp(this.stateTime / this.stateDuration, 0, 1);
        this.pose = this.lerpPose(this.pose, ACTIONS.slip(sp), 0.2);
        if (Math.random() < 0.08) {
          particles.push({
            x: this.x + rand(-10, 10), y: this.y + rand(-5, 5),
            vx: rand(-1, 1), vy: rand(-2, 0),
            life: 1, decay: 0.04, r: rand(2, 4), color: '#66BBFF',
          });
        }
        if (this.stateTime >= this.stateDuration) this.transitionToNext();
        break;
      }

      case 'swordFight':
        this.pose = this.lerpPose(this.pose, ACTIONS.swordFight(this.stateTime), 0.15);
        if (Math.random() < 0.08) {
          const j = this.getJoints();
          particles.push({
            x: j.rArm.end.x + rand(-5, 5), y: j.rArm.end.y + rand(-5, 5),
            vx: rand(-2, 2), vy: rand(-2, 0),
            life: 1, decay: 0.05, r: rand(2, 5), color: '#FFFFFF',
          });
        }
        if (this.stateTime >= this.stateDuration) this.transitionToNext();
        break;

      case 'float': {
        this.pose = this.lerpPose(this.pose, ACTIONS.float(this.stateTime), 0.1);
        const floatP = this.stateTime / this.stateDuration;
        if (floatP < 0.3) {
          this.y -= 60 * dt;
          this.grounded = false;
        } else if (floatP < 0.7) {
          this.y += Math.sin(this.stateTime * 3) * 0.5;
        } else {
          this.y += 80 * dt;
        }
        this.y = Math.max(this.y, 50);
        if (this.y >= HIP_GROUND) {
          this.y = HIP_GROUND;
          this.grounded = true;
        }
        if (Math.random() < 0.06) {
          particles.push({
            x: this.x + rand(-15, 15), y: this.y + rand(0, 20),
            vx: rand(-0.5, 0.5), vy: -rand(1, 2.5),
            life: 1, decay: 0.02, r: rand(2, 4), color: '#FFD700',
          });
        }
        if (this.stateTime >= this.stateDuration) {
          this.y = HIP_GROUND;
          this.grounded = true;
          this.transitionToNext();
        }
        break;
      }
    }

    // General gravity — if above ground and not in a controlled air state
    if (!this.grounded && this.y < HIP_GROUND &&
        this.state !== 'thrown' && this.state !== 'float' &&
        this.jumpPhase === 0) {
      this.vy += 1200 * dt;
      this.y += this.vy * dt;
      if (this.y >= HIP_GROUND) {
        this.y = HIP_GROUND;
        this.vy = 0;
        this.grounded = true;
      }
    }
  }

  setState(state, duration) {
    this.state = state;
    this.stateTime = 0;
    this.stateDuration = duration || rand(1.5, 4);
    this.jumpPhase = 0;
  }

  transitionToNext() {
    let next;
    if (this.aiNextAction && ACTIONS[this.aiNextAction]) {
      next = this.aiNextAction;
      if (this.aiThought) {
        this.thought = this.aiThought;
        this.thoughtTimer = 3;
      }
      this.aiNextAction = null;
      this.aiThought = null;
    } else {
      next = this.nextAction();
    }
    this.actionHistory.push(next);
    if (this.actionHistory.length > 20) this.actionHistory.shift();
    this.requestAiDecision();

    if (next === 'walk' || next === 'sneak' || next === 'run') {
      this.walkTarget = rand(50, W - 50);
      this.facing = this.walkTarget > this.x ? 1 : -1;
      this.setState(next, 10); // 移动类动作自己判断结束
    } else if (next === 'jump' || next === 'backflip') {
      this.setState(next, 1.2);
    } else if (next === 'kick') {
      this.setState(next, 0.8);
    } else if (next === 'spin') {
      this.setState(next, 1.0);
    } else if (next === 'stumble') {
      this.setState(next, 1.5);
    } else if (next === 'sleep') {
      this.expression = 'sleepy';
      this.exprTimer = 999;
      this.setState(next, rand(3, 6));
    } else if (next === 'celebrate') {
      this.expression = 'happy';
      this.exprTimer = 999;
      this.setState(next, rand(2, 4));
    } else if (next === 'cry') {
      this.expression = 'sad';
      this.exprTimer = 999;
      this.setState(next, rand(2, 5));
    } else if (next === 'meditate') {
      this.expression = 'peaceful';
      this.exprTimer = 999;
      this.setState(next, rand(3, 6));
    } else if (next === 'rage') {
      this.expression = 'angry';
      this.exprTimer = 999;
      this.setState(next, rand(2, 4));
    } else if (next === 'guitar') {
      this.expression = 'happy';
      this.exprTimer = 999;
      this.setState(next, rand(3, 5));
    } else if (next === 'peek') {
      this.expression = 'nervous';
      this.exprTimer = 999;
      if (this.x < W / 3) this.facing = 1;
      else if (this.x > W * 2 / 3) this.facing = -1;
      this.setState(next, rand(2, 4));
    } else if (next === 'slip') {
      this.expression = 'surprised';
      this.exprTimer = 999;
      this.setState(next, rand(1.5, 2.5));
    } else if (next === 'swordFight') {
      this.expression = 'happy';
      this.exprTimer = 999;
      this.setState(next, rand(2, 4));
    } else if (next === 'float') {
      this.expression = 'peaceful';
      this.exprTimer = 999;
      this.setState(next, rand(3, 5));
    } else {
      this.setState(next, rand(2, 5));
    }
  }

  land() {
    this.y = HIP_GROUND;
    this.grounded = true;
    this.bounceCount = 0;
    const wasHard = Math.abs(this.vx) + Math.abs(this.vy) > 500;
    this.vx = 0;
    this.vy = 0;
    this.squash = 1.5;
    this.stretch = 0.6;
    spawnParticles(this.x, GROUND, 12, '#8B7355', 5);

    if (wasHard) {
      this.addEvent('摔了个大跟头');
      this.expression = 'dizzy';
      this.exprTimer = 3;
      this.setState('splat', 2);
    } else {
      this.transitionToNext();
    }
  }

  // 开始拖拽
  startDrag(mx, my) {
    this.addEvent('被抓起来了');
    this.dragging = true;
    this.grounded = false;
    this.dragOffX = this.x - mx;
    this.dragOffY = this.y - my;
    this.mouseHistory = [];
    this.expression = 'surprised';
    this.exprTimer = 999;
    this.vx = 0;
    this.vy = 0;
  }

  // 释放（投掷）
  release() {
    this.addEvent('被扔出去了');
    this.dragging = false;
    this.expression = 'surprised';
    this.exprTimer = 2;

    // 从鼠标历史计算投掷速度
    if (this.mouseHistory.length >= 2) {
      const recent = this.mouseHistory.slice(-5);
      const first = recent[0];
      const last = recent[recent.length - 1];
      const dt = (last.t - first.t) / 1000;
      if (dt > 0.001) {
        this.vx = clamp((last.x - first.x) / dt, -1500, 1500);
        this.vy = clamp((last.y - first.y) / dt, -1500, 1500);
      }
    }

    const speed = Math.hypot(this.vx, this.vy);
    if (speed > 100) {
      this.state = 'thrown';
      this.stateTime = 0;
      this.bounceCount = 0;
    } else {
      // 轻放
      if (this.y >= HIP_GROUND - 10) {
        this.land();
      } else {
        this.state = 'thrown';
        this.stateTime = 0;
        this.bounceCount = 0;
      }
    }
  }

  // 被点击
  poke() {
    if (this.dragging || this.state === 'thrown') return;
    this.addEvent('被点击了');
    this.setState('surprised', 1.2);
    this.expression = 'surprised';
    this.exprTimer = 1.5;
    spawnStars(this.x, this.y - BONE.body, 5);
  }

  // 线性插值姿态
  lerpPose(current, target, t) {
    const result = {};
    for (const key in target) {
      result[key] = lerp(current[key] || 0, target[key], t);
    }
    return result;
  }

  // ==================== 渲染 ====================
  draw() {
    const j = this.getJoints();

    ctx.save();
    // 挤压拉伸变换
    ctx.translate(this.x, this.y);
    ctx.scale(this.facing * this.stretch, this.squash);
    ctx.translate(-this.x, -this.y);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 阴影
    if (this.grounded || this.y > HIP_GROUND - 50) {
      const shadowAlpha = clamp(1 - (HIP_GROUND - this.y) / 200, 0.05, 0.3);
      const shadowWidth = 30 + clamp((HIP_GROUND - this.y) / 5, 0, 20);
      ctx.fillStyle = `rgba(0,0,0,${shadowAlpha})`;
      ctx.beginPath();
      ctx.ellipse(this.x, GROUND + 5, shadowWidth, 5, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 画骨骼
    const c = this.colors;

    // 后面的手臂和腿（稍微淡一点表示层次）
    ctx.strokeStyle = c.back;
    ctx.lineWidth = 4;
    this.drawLimb(j.lArm);
    this.drawLimb(j.lLeg);

    // 身体
    ctx.strokeStyle = c.body;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(j.hip.x, j.hip.y);
    ctx.lineTo(j.neck.x, j.neck.y);
    ctx.stroke();

    // 前面的手臂和腿
    ctx.strokeStyle = c.body;
    ctx.lineWidth = 5;
    this.drawLimb(j.rArm);
    this.drawLimb(j.rLeg);

    // 头
    this.drawHead(j.headCenter, j.neck);

    ctx.restore();

    // 速度线（投掷时）
    if (this.state === 'thrown') {
      const speed = Math.hypot(this.vx, this.vy);
      if (speed > 300) {
        const lineCount = Math.min(Math.floor(speed / 200), 5);
        ctx.strokeStyle = 'rgba(100,100,100,0.3)';
        ctx.lineWidth = 2;
        for (let i = 0; i < lineCount; i++) {
          const ox = rand(-20, 20);
          const oy = rand(-20, 20);
          const len = speed * 0.03;
          const nx = -this.vx / speed;
          const ny = -this.vy / speed;
          ctx.beginPath();
          ctx.moveTo(this.x + ox, this.y - 30 + oy);
          ctx.lineTo(this.x + ox + nx * len, this.y - 30 + oy + ny * len);
          ctx.stroke();
        }
      }
    }

    // 思考气泡
    if (this.thoughtTimer > 0 && this.thought) {
      const j = this.getJoints();
      const bx = this.x;
      const by = j.headCenter.y - BONE.headR - 30;
      const alpha = this.thoughtTimer < 0.5 ? this.thoughtTimer / 0.5 : 1;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 11px "PingFang SC", "Microsoft YaHei", sans-serif';
      const tw = ctx.measureText(this.thought).width;
      const pad = 8;
      const bw = tw + pad * 2;
      const bh = 22;
      const left = bx - bw / 2;
      const top = by - bh;

      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(left, top, bw, bh, 6);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(bx - 4, by);
      ctx.lineTo(bx, by + 7);
      ctx.lineTo(bx + 4, by);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(bx - 3, by - 1, 6, 2);

      ctx.fillStyle = '#333';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.thought, bx, top + bh / 2);
      ctx.restore();
    }
  }

  drawLimb(limb) {
    ctx.beginPath();
    ctx.moveTo(limb.origin.x, limb.origin.y);
    ctx.lineTo(limb.mid.x, limb.mid.y);
    ctx.lineTo(limb.end.x, limb.end.y);
    ctx.stroke();
  }

  drawHead(center, neck) {
    const r = BONE.headR;

    // 头的填充
    const c = this.colors;
    ctx.fillStyle = c.fill;
    ctx.strokeStyle = c.head;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(center.x, center.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 眼睛 - 看向鼠标（补偿 facing 镜像）
    const lookDirX = (this.mouseX - center.x) * this.facing;
    const lookDirY = this.mouseY - center.y;
    const lookDist = Math.max(1, Math.hypot(lookDirX, lookDirY));
    const lookNX = lookDirX / lookDist;
    const lookNY = lookDirY / lookDist;
    const eyeOffset = 3;

    const eyeL = { x: center.x - 5, y: center.y - 2 };
    const eyeR = { x: center.x + 5, y: center.y - 2 };

    if (this.expression === 'dizzy') {
      // 眩晕 - 螺旋眼
      ctx.strokeStyle = c.head;
      ctx.lineWidth = 1.5;
      for (const eye of [eyeL, eyeR]) {
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 4; a += 0.2) {
          const sr = a / (Math.PI * 4) * 4;
          const sx = eye.x + Math.cos(a + this.dizzyAngle) * sr;
          const sy = eye.y + Math.sin(a + this.dizzyAngle) * sr;
          if (a === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      }
    } else if (this.expression === 'surprised') {
      // 惊讶 - 大圆眼
      ctx.fillStyle = c.head;
      for (const eye of [eyeL, eyeR]) {
        ctx.beginPath();
        ctx.arc(eye.x + lookNX * 1, eye.y + lookNY * 1, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // 张嘴
      ctx.beginPath();
      ctx.arc(center.x, center.y + 6, 4, 0, Math.PI * 2);
      ctx.stroke();
    } else if (this.expression === 'sleepy') {
      // 打瞌睡 - 半闭眼 + 眼皮线
      ctx.strokeStyle = c.head;
      ctx.lineWidth = 2;
      for (const eye of [eyeL, eyeR]) {
        ctx.beginPath();
        ctx.moveTo(eye.x - 3, eye.y + 1);
        ctx.quadraticCurveTo(eye.x, eye.y + 3, eye.x + 3, eye.y + 1);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(eye.x - 3, eye.y + 1);
        ctx.lineTo(eye.x + 3, eye.y + 1);
        ctx.stroke();
      }
    } else if (this.expression === 'happy') {
      // 开心 - ^_^ 弯眼
      ctx.strokeStyle = c.head;
      ctx.lineWidth = 2;
      for (const eye of [eyeL, eyeR]) {
        ctx.beginPath();
        ctx.arc(eye.x, eye.y + 2, 3, Math.PI + 0.3, -0.3);
        ctx.stroke();
      }
      // 微笑
      ctx.beginPath();
      ctx.arc(center.x, center.y + 3, 4, 0.2, Math.PI - 0.2);
      ctx.stroke();
    } else if (this.expression === 'sad') {
      // 悲伤 - 下弯弧线眼 + 下弯嘴
      ctx.strokeStyle = c.head;
      ctx.lineWidth = 2;
      for (const eye of [eyeL, eyeR]) {
        ctx.beginPath();
        ctx.arc(eye.x, eye.y - 1, 3, 0.3, Math.PI - 0.3);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(center.x, center.y + 9, 3, Math.PI + 0.3, -0.3);
      ctx.stroke();
    } else if (this.expression === 'peaceful') {
      // 平和 - 闭眼弯线 + 微笑
      ctx.strokeStyle = c.head;
      ctx.lineWidth = 2;
      for (const eye of [eyeL, eyeR]) {
        ctx.beginPath();
        ctx.moveTo(eye.x - 3, eye.y);
        ctx.quadraticCurveTo(eye.x, eye.y + 2, eye.x + 3, eye.y);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(center.x, center.y + 4, 3, 0.2, Math.PI - 0.2);
      ctx.stroke();
    } else if (this.expression === 'angry') {
      // 愤怒 - V 形眉 + 瞪眼 + 紧闭嘴
      ctx.strokeStyle = c.head;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(eyeL.x - 4, eyeL.y - 5);
      ctx.lineTo(eyeL.x + 3, eyeL.y - 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(eyeR.x + 4, eyeR.y - 5);
      ctx.lineTo(eyeR.x - 3, eyeR.y - 2);
      ctx.stroke();
      ctx.fillStyle = c.head;
      for (const eye of [eyeL, eyeR]) {
        ctx.beginPath();
        ctx.arc(eye.x, eye.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(center.x - 4, center.y + 6);
      ctx.lineTo(center.x + 4, center.y + 6);
      ctx.stroke();
    } else if (this.expression === 'nervous') {
      // 紧张 - 小点眼 + 汗
      ctx.fillStyle = c.head;
      for (const eye of [eyeL, eyeR]) {
        ctx.beginPath();
        ctx.arc(eye.x + lookNX * 2, eye.y + lookNY * 2, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      // 汗滴
      ctx.fillStyle = '#66BBFF';
      ctx.beginPath();
      ctx.arc(center.x + r - 2, center.y - 3, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // 正常眼睛
      ctx.fillStyle = c.head;
      for (const eye of [eyeL, eyeR]) {
        ctx.beginPath();
        ctx.arc(eye.x + lookNX * eyeOffset, eye.y + lookNY * eyeOffset, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

// ==================== 火柴人实例 ====================
const man = new Stickman(W / 2);
man.requestAiDecision();

// ==================== 鼠标交互 ====================
let rightDragging = false;
let rightDragMoved = false;
let wasDragging = false;

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  man.mouseX = e.clientX - rect.left;
  man.mouseY = e.clientY - rect.top;

  if (rightDragging) {
    rightDragMoved = true;
    window.electronAPI.dragWindow(e.movementX, e.movementY);
  }
});

canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  if (e.button === 2) {
    rightDragging = true;
    rightDragMoved = false;
    return;
  }

  if (e.button === 0 && man.hitTest(mx, my)) {
    man.startDrag(mx, my);
  }
});

canvas.addEventListener('mouseup', (e) => {
  if (e.button === 2) {
    rightDragging = false;
    return;
  }
  if (e.button === 0 && man.dragging) {
    wasDragging = true;
    man.release();
  }
});

canvas.addEventListener('click', (e) => {
  if (wasDragging) { wasDragging = false; return; }
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  if (man.hitTest(mx, my) && !man.dragging && man.state !== 'thrown') {
    man.poke();
  }
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// ==================== 地面 ====================
function drawGround() {
  ctx.strokeStyle = 'rgba(100,100,100,0.3)';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(10, GROUND);
  ctx.lineTo(W - 10, GROUND);
  ctx.stroke();
  ctx.setLineDash([]);
}

// ==================== 游戏循环 ====================
let lastTime = performance.now();

function gameLoop(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;

  ctx.clearRect(0, 0, W, H);
  drawGround();

  man.update(dt);
  man.draw();

  updateParticles(dt);
  drawParticles();

  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);

// Expose for testing
if (typeof globalThis !== 'undefined') {
  globalThis.ACTIONS = ACTIONS;
  globalThis.Stickman = Stickman;
  globalThis.particles = particles;
  globalThis.HIP_GROUND = HIP_GROUND;
  globalThis.W = W;
  globalThis.GROUND = GROUND;
  globalThis.BONE = BONE;
}
