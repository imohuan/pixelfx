// 头发物理链（路线 A：verlet + 距离约束）。骨架本身不管头发——头发是挂在头部锚点上的独立粒子链，
// 每帧做三件事：重力往下拉、朝锚点方向收束、相邻点之间保持固定距离。头部一动头发自然甩动。
//
// 用法:
//   import { HairChain } from "./hair.js";
//   const hair = new HairChain({ segments: 10, segLen: 6, gravity: 900, stiffness: 0.6 });
//   // 每帧:
//   hair.step(dt, anchor);          // anchor = skeleton(pose).joints.head (x, y, z)，y 向下
//   hair.draw(ctx, zoom, ox, oy);   // 画在 canvas 上

export class HairChain {
  constructor({ segments = 10, segLen = 6, gravity = 900, stiffness = 0.65, damping = 0.985, thickness = 2, jitter = 0, seed = 1 } = {}) {
    this.segLen = segLen;
    this.gravity = gravity;
    this.stiffness = stiffness;
    this.damping = damping;
    this.jitter = jitter;   // 扰乱：每帧给发点加的随机水平力，0 = 安静，越大越乱动
    this.thickness = thickness;
    this.pts = Array.from({ length: segments + 1 }, () => ({ x: 0, y: 0, px: 0, py: 0, z: 0 }));
    this.anchor = [0, 0, 0];
    this.first = true;
    // 固定种子的小扰动，让几缕头发落下角度不完全一致（确定性，可复现）
    this.rng = seed >>> 0 || 1;
  }
  rand() {
    let t = (this.rng = (this.rng + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  noise(x, seed = 0) {
    // 简易平滑值噪声 [-1, 1]，确定性（扰动用）
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    const r = (a, b) => {
      let h = (a | 0) ^ Math.imul(b | 0, 0x9e3779b9);
      h = Math.imul(h ^ (h >>> 13), 0x85ebca6b); h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
    return (r(i, seed) + (r(i + 1, seed) - r(i, seed)) * u) * 2 - 1;
  }
  // anchor: [x, y, z]，局部空间，y 向下
  step(dt, anchor) {
    if (!anchor) return;
    this.anchor = anchor;
    const n = this.pts.length;
    // 初始化：从锚点往下垂
    if (this.first) {
      for (let i = 0; i < n; i++) {
        this.pts[i].x = anchor[0] + (this.rand() - 0.5) * 2;
        this.pts[i].y = anchor[1] + i * this.segLen;
        this.pts[i].px = this.pts[i].x;
        this.pts[i].py = this.pts[i].y;
        this.pts[i].z = anchor[2];
      }
      this.first = false;
    }
    this.clock += dt;
    // 1. verlet 积分：新位置 = 当前 + (当前 - 上一帧) * 阻尼 + 重力 * dt²
    const g = this.gravity * dt * dt;
    for (let i = 1; i < n; i++) {  // i=0 是锚点本身，不动
      const p = this.pts[i];
      const vx = (p.x - p.px) * this.damping;
      const vy = (p.y - p.py) * this.damping;
      p.px = p.x; p.py = p.y;
      p.x += vx;
      p.y += vy + g;
      if (this.jitter > 0) {
        // 扰乱：低频噪声力，越靠发梢越强（i/n），随时间变化
        const t = Math.floor(this.clock * 3);
        p.x += this.noise(i * 13.7 + t, 11) * this.jitter * (i / n) * dt;
        p.y += this.noise(i * 17.3 + t, 29) * this.jitter * 0.4 * (i / n) * dt;
      }
    }
    // 2. 约束：反复拉直到满足距离（迭代 stiffness 次，越大越硬）
    const iters = Math.max(1, Math.round(this.stiffness * 8));
    for (let k = 0; k < iters; k++) {
      // 锚点永远钉在头部
      this.pts[0].x = anchor[0];
      this.pts[0].y = anchor[1];
      this.pts[0].z = anchor[2];
      for (let i = 0; i < n - 1; i++) {
        const a = this.pts[i], b = this.pts[i + 1];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1e-6;
        const diff = (d - this.segLen) / d;
        // 锚点不动，另一端对半分摊（i=0 那段只动 b）
        if (i === 0) {
          b.x -= dx * diff;
          b.y -= dy * diff;
        } else {
          a.x += dx * diff * 0.5;
          a.y += dy * diff * 0.5;
          b.x -= dx * diff * 0.5;
          b.y -= dy * diff * 0.5;
        }
      }
    }
  }
  /** 链上各点的局部坐标（y 向下），供自己画或做碰撞用 */
  points() { return this.pts.map((p) => [p.x, p.y, p.z]); }
  /** 重置到垂下状态（换姿势/传送时用） */
  reset() { this.first = true; }
  /**
   * 画到 canvas。局部坐标（y 向下）转屏幕：sx = ox + x * zoom, sy = oy + y * zoom。
   * color: 头发主色（hex 字符串），highlight: 高光色（可省略）。
   * smooth: true 用 Catmull-Rom 样条过所有点（平滑曲线），false 直线连接（默认 false，跟像素风格更搭）。
   */
  draw(ctx, zoom, ox, oy, color = "#2a2233", highlight = "#4a3f58", smooth = false) {
    const n = this.pts.length;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, this.thickness * zoom * 0.5);
    ctx.beginPath();
    if (smooth && n > 2) {
      this.catmull(ctx, zoom, ox, oy, n, 1);
    } else {
      for (let i = 0; i < n; i++) {
        const sx = ox + this.pts[i].x * zoom, sy = oy + this.pts[i].y * zoom;
        if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      }
    }
    ctx.stroke();
    // 高光：前半段的一条细线
    if (highlight) {
      ctx.strokeStyle = highlight;
      ctx.lineWidth = Math.max(1, this.thickness * zoom * 0.25);
      ctx.beginPath();
      if (smooth && n > 2) {
        this.catmull(ctx, zoom, ox, oy, Math.ceil(n / 2), 0);
      } else {
        for (let i = 0; i < Math.ceil(n / 2); i++) {
          const sx = ox + this.pts[i].x * zoom, sy = oy + this.pts[i].y * zoom;
          if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
      }
      ctx.stroke();
    }
  }
  /** Catmull-Rom 样条：把控制点连成平滑曲线，过每一个点 */
  catmull(ctx, zoom, ox, oy, n, from) {
    const P = (i) => {
      const p = this.pts[Math.max(from, Math.min(n - 1, i))];
      return [ox + p.x * zoom, oy + p.y * zoom];
    };
    ctx.moveTo(...P(from));
    for (let i = from; i < n - 1; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      // 每段画 6 个子段，足够平滑
      for (let s = 1; s <= 6; s++) {
        const t = s / 6, t2 = t * t, t3 = t2 * t;
        const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
        const y = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
        ctx.lineTo(x, y);
      }
    }
  }
}

/**
 * 一撮头发 = 几条并排的链，锚点在头上错开。返回一组 HairChain，step 时共享同一个 dt 和锚点。
 * strands: 几条链（分支数），spreadX: 锚点在 x 方向错开多少（局部像素）。
 */
export function makeHairTuft({ strands = 4, spreadX = 3, segLen = 6, segments = 10, jitter = 0, ...rest } = {}) {
  const tuft = [];
  for (let i = 0; i < strands; i++) {
    const off = (i - (strands - 1) / 2) * spreadX;
    tuft.push({ chain: new HairChain({ segLen, segments, jitter, ...rest }), off });
  }
  return {
    /** 运行时可调的物理参数（实时改，不用重建） */
    set(props) {
      for (const { chain } of tuft) Object.assign(chain, props);
    },
    get props() {
      const c = tuft[0].chain;
      return { gravity: c.gravity, damping: c.damping, stiffness: c.stiffness, jitter: c.jitter, segLen: c.segLen, thickness: c.thickness };
    },
    step(dt, anchor) {
      for (const { chain, off } of tuft) chain.step(dt, [anchor[0] + off, anchor[1], anchor[2]]);
    },
    draw(ctx, zoom, ox, oy, color, highlight) {
      for (const { chain } of tuft) chain.draw(ctx, zoom, ox, oy, color, highlight);
    },
    reset() { for (const { chain } of tuft) chain.reset(); },
  };
}
