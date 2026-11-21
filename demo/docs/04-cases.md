
## 7. 案例（全部来自仓库现成特效）

以下案例的代码**就是 src/fx 里的源文件**，只去掉了 import 行和 export 关键字，一个字没改。
每类特效配了两种运行方式：粘进 HTML 直接跑，或用生成器一键出独立页面。

两种特效形态都覆盖了：

| 案例 | 形态 | 一句话 |
| --- | --- | --- |
| Critical hit | 模拟型 | 暴击命中：比普通命中更重的一击——更大的十字闪光、碎裂的环、… |
| Glitch | 纯函数型 | 信号故障：小人的信号间歇性炸裂——RGB 分离、横向撕裂、行… |
| Hit spark | 模拟型 | 命中火花：沿打击方向的一道长虹、白色菱形核心、锥形火花与碎屑… |

---

### 案例 A — Critical hit（src/fx/impacts/crit-hit.js）

**暴击命中：比普通命中更重的一击——更大的十字闪光、碎裂的环、地刺弹出、碎屑与火星四溅。带 0.1 秒命中顿帧。**

| 项 | 值 |
| --- | --- |
| 尺寸 | [216, 136] |
| 时长 | 0.9 秒 |
| 形态 | 模拟型（create + 手写粒子状态） |

**实现要点**

- create(o) 里用 new Rng(o.seed) 生成一次性的形状参数（地刺的位置、环的缺口、碎屑的轨迹），存进闭包，draw 每帧按已过时间画对应阶段——同种子永远同画面。
- Particles 和 Bits 两个容器分工：粒子管火星（自带重力和落地反弹），Bits 管方块碎屑（翻转、弹跳、停在地上）。
- spikes / star / brokenRing 来自 impacts/_lib.js，是命中类特效的现成画法：地刺、星芒、碎裂的环。
- 阶段划分是打击感的关键：闪光帧、膨胀帧、消散帧各有各的画法，而不是一个形状缩放到底。

粘进 HTML 时，把下面这行加在代码块末尾（运行时读 `fx` 这个名字）：

```js
// The star, its key frames and the spark spray are adapted from Sprite Fusion's open-source impact
// (https://www.spritefusion.com/pixel-art-vfx/impact), MIT License, Copyright (c) 2026 Hugo Duprez.

const meta = {
  name: "Critical hit",
  desc: "A critical hit: a jagged starburst slams in white and overshoots, a ring breaks into flying arcs, sparks streak off, shards tumble to the floor under a big flare.",
  tags: ["impact", "hit", "crit", "critical", "combat", "directional", "one-shot"],
  size: [216, 136],
  origin: [84, 106],
  duration: 0.9,
  loop: false,
  fps: 30,
  bg: "ground",
  options: { palette: ["#2a0510", "#5c0a1c", "#a3142a", "#e0302c", "#ff7a2a", "#ffc23d", "#fff09a", "#ffffff"], height: 26, aim: 0.12, seed: 3 },
};

// the star's key frames: [from t, scale, thickness, alpha, colors (rim, body, inner, core) as steps of the ramp]
const KEYS = [
  [0, 1, 1, 1, [6, 7, 7, 7]],
  [0.025, 1.3, 1, 1, [2, 5, 6, 7]],
  [0.058, 1.05, 0.72, 1, [2, 4, 5, 6]],
  [0.092, 1.22, 0.3, 1, [1, 2, 3, 4]],
  [0.125],
];

// a lens flare: a long level streak, thick and white at the heart, a shorter upright one, on a bed of light
function flare(p, x, y, L, k, C) {
  for (const [dx, dy, len] of [[1, 0, L], [0, 1, L * 0.45], [0.7, 0.7, L * 0.16], [0.7, -0.7, L * 0.16]])
    for (const s of [-1, 1])
      for (let d = 1; d <= len; d++) {
        const u = d / len, a = u < 0.7 ? 1 : k * (1.6 - u);
        p.dot(x + s * dx * d, y + s * dy * d, u < 0.35 ? WHITE : u < 0.7 ? C[6] : C[5], a);
        if (dy === 0 && u < 0.42) for (const e of [-1, 1]) p.dot(x + s * d, y + e, u < 0.2 ? C[6] : C[5], u < 0.3 ? 1 : k);
      }
  p.glowLine(x - L, y, x + L, y, 6, C[6], 0.5 * k);
  p.glowLine(x, y - L * 0.45, x, y + L * 0.45, 4, C[6], 0.3 * k);
}

function create(o) {
  const C = fit(o.palette, 8), R = new Rng(o.seed), X = 0, Y = -o.height, A = o.aim, floor = () => 0;
  const ps = new Particles({ rng: R, ground: floor, sparks: [C[7], C[6], C[5], C[3]] });
  const bits = new Bits({ ground: floor }), lights = new Lights();
  const sp = spikes(R, 14, A, { len: [11, 15], w: [1.8, 2.5], fwd: 1.4, back: 0.6, jag: 0.5 });
  [...sp].sort((a, b) => b.len - a.len).slice(0, 2).forEach((s) => (s.len *= 1.3));
  const segs = Array.from({ length: 7 }, (_, i) => {
    const a = A + (i / 7) * TAU;
    return { a, gap: R.range(0.55, 0.85), dr: R.range(0.08, 0.4) + 0.15 * Math.max(0, Math.cos(a - A)), w: 0.7 + 0.5 * Math.max(0, Math.cos(a - A)) };
  });

  lights.add(X, Y, 84, C[5], 0.6, 0.5);
  lights.add(X, Y, 30, WHITE, 0.7, 0.1);
  lights.add(X, -4, 44, C[4], 0.3, 0.45);
  // sparks: most sprayed on along the blow, a few kicked back
  for (let i = 0; i < 36; i++) {
    const back = R.chance(0.22), a = (back ? A + Math.PI : A) + R.range(-1, 1) * (back ? 0.6 : 0.8), v = R.range(170, 430) * (back ? 0.6 : 1);
    ps.spawn(P.SPARK, X, Y, Math.cos(a) * v, Math.sin(a) * v - 50, R.range(0.15, 0.5), WHITE, 1, R.chance(0.3) ? R.range(0, 0.04) : 0);
  }
  // shards: bright splinters that tumble down, bounce and settle
  for (let i = 0; i < 10; i++) {
    const a = A + R.range(-1, 1) * 1.1 - 0.35, v = R.range(110, 280);
    bits.add({ kind: B.SHARD, x: X, y: Y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, g: 0.8, drag: 0.7, bounce: 0.35, life: R.range(0.55, 0.85), a: R.range(0, TAU), va: R.range(-25, 25), s: R.range(2, 4.5), c: R.pick([C[7], C[6], C[6], C[5]]) });
  }
  // embers of light drifting up and off, and glints that pop round the ring after the hit
  for (let i = 0; i < 12; i++) {
    const a = A - Math.PI / 2 + R.range(-1.4, 1.4), v = R.range(35, 110);
    ps.spawn(P.MOTE, X + Math.cos(a) * 4, Y + Math.sin(a) * 4, Math.cos(a) * v, Math.sin(a) * v - 15, R.range(0.35, 0.7), R.pick([C[6], C[5], C[5]]), 0.6, R.range(0, 0.05));
  }
  for (let i = 0; i < 5; i++) {
    const a = R.range(0, TAU), d = R.range(14, 34);
    ps.spawn(P.STAR, X + Math.cos(a) * d, Y + Math.sin(a) * d * 0.8, 0, -4, R.range(0.22, 0.38), R.chance(0.5) ? C[6] : WHITE, R.range(1.6, 3), R.range(0.08, 0.32));
  }

  let t = 0;
  return {
    update(dt) {
      t += dt;
      ps.update(dt);
      bits.update(dt);
      lights.update(dt);
    },
    draw(p) {
      // the ring: it swells off the star, then breaks into arcs that fly on and cool
      const u = clamp((t - 0.03) / 0.37);
      if (t >= 0.03 && u < 1) {
        const r = 10 + 30 * ease.outCubic(u), brk = smooth(0.12, 0.6, u), th = Math.max(1, 3.6 * Math.pow(1 - u, 1.2));
        const i = u < 0.12 ? 7 : u < 0.3 ? 6 : u < 0.5 ? 5 : u < 0.75 ? 4 : 3;
        brokenRing(p, X, Y, r, th, segs, brk, C[i], C[Math.max(2, i - 2)], u < 0.6 ? 1 : (1 - u) / 0.4, 1, 0);
        if (u < 0.6) p.glowRing(X, Y, r, 6, C[5], 0.35 * Math.pow(1 - u / 0.6, 2));
      }
      bits.draw(p);
      ps.draw(p);
      // the flare blooms as the star collapses
      const f = (t - 0.04) / 0.28;
      if (f > 0 && f < 1) {
        flare(p, X, Y, 64 * Math.pow(1 - f, 1.3), 1 - f, C);
        p.glow(X, Y, 56, C[5], 0.4 * (1 - f));
      }
      // the starburst slams in: a white frame, an overshoot, a settle, then it breaks up
      for (let i = 0; i < KEYS.length - 1; i++)
        if (t >= KEYS[i][0] && t < KEYS[i + 1][0]) {
          const [, sc, th, a, cols] = KEYS[i];
          star(p, X, Y, sp, sc, th, cols.map((j) => C[j]), a, 2.6);
        }
      const pop = Math.exp(-t / 0.05);
      if (pop > 0.02) {
        p.glow(X, Y, 44, C[5], 0.4 * pop);
        p.glow(X, Y, 12, WHITE, 0.6 * pop);
      }
      lights.draw(p);
    },
  };
}

// —— 运行时读这个名字 ——
const fx = { meta, create };
```

一键生成独立页面：

```bash
node demo/make-page.mjs impacts/crit-hit --out crit-hit.html
```

---

### 案例 B — Glitch（src/fx/scifi/glitch.js）

**信号故障：小人的信号间歇性炸裂——RGB 分离、横向撕裂、行错位、色块噪声、坏像素飞散，然后恢复清晰。2.4 秒循环。**

| 项 | 值 |
| --- | --- |
| 尺寸 | [88, 64] |
| 时长 | 2.4 秒 |
| 形态 | 纯函数型（draw，逐像素处理角色） |

**实现要点**

- meta.actor: 2 且声明了 act.onBody: true，运行时会把标准小人交给特效：draw 收到的 o.actor 是角色的像素数据 { x, y, w, h, pixels, mask }，特效自己决定画成什么样（这里逐行撕裂重画）。
- actorAlpha = () => 0 让运行时不再画干净的小人——画面上只有故障版本。
- BURSTS 声明三次爆发的 [起帧, 止帧, 强度]；每帧 rand(S, f, ...) 取随机，f 是帧号，所以 seek 到任何时刻画面一致。
- 纯函数型的极致用法：不画自己的东西，而是逐像素改写角色本身。

粘进 HTML 时，把下面这行加在代码块末尾（运行时读 `fx` 这个名字）：

```js
const meta = {
  name: "Glitch",
  desc: "The hero's signal breaks up in bursts: an RGB split, slices torn sideways, rows smeared out, junk blocks and dead pixels, then snaps back clean.",
  tags: ["scifi", "glitch", "digital", "corrupt", "hologram", "status", "loop"],
  size: [88, 64],
  origin: [44, 54],
  duration: 2.4,
  loop: true,
  fps: 30,
  bg: "ground",
  actor: 2,
  options: { palette: ["#14101f", "#3b1f5c", "#ff2e63", "#ff7aa8", "#2ef2ff", "#b4fbff", "#ffffff"], seed: 7 },
};

const TWITCH_A = { turn: 0.3, lean: 3, crouch: 1, fx: 13, fy: -31, bx: 6, by: -14, hx: 1 };
const TWITCH_B = { turn: 1.2, lean: -3, crouch: 0, fx: -9, fy: -14, bx: 14, by: -31, hx: -1 };
const FINE = {};
const act = {
  onBody: true,
  poses: [
    [0, FINE],
    [0.3, TWITCH_A, "snap"],
    [0.37, TWITCH_B, "snap"],
    [0.44, TWITCH_A, "snap"],
    [0.53, FINE, "snap"],
    [1.1, TWITCH_B, "snap"],
    [1.23, FINE, "snap"],
    [1.7, TWITCH_A, "snap"],
    [1.8, { ...TWITCH_B, crouch: 3 }, "snap"],
    [1.9, TWITCH_A, "snap"],
    [2, TWITCH_B, "snap"],
    [2.07, FINE, "snap"],
    [2.4, FINE],
  ],
};

const FPS = 30, NF = Math.round(meta.duration * FPS);
// the bursts: [first frame, last frame, how hard]
const BURSTS = [[9, 16, 0.8], [33, 37, 0.5], [51, 62, 1]];

// the effect draws the hero itself, clean or broken
const actorAlpha = () => 0;

function draw(p, t, o) {
  const C = fit(o.palette, 7), A = o.actor, S = o.seed, RED = C[2], CYAN = C[4], f = Math.floor(t * FPS + 1e-6) % NF;
  const burst = BURSTS.find(([a, b]) => f >= a && f <= b), k = burst ? burst[2] : 0, r = (...n) => rand(S, f, ...n);
  // what this frame's corruption is
  const split = burst ? Math.round(1 + r(1) * 3 * k) * (r(2) < 0.5 ? -1 : 1) : 0;
  const tears = [];
  if (burst) for (let i = 0; i < 1 + Math.floor(r(3) * 4 * k); i++) tears.push([A.y + Math.floor(r(4, i) * A.h), 1 + Math.floor(r(5, i) * 5), Math.round((r(6, i) - 0.5) * 16 * k), r(7, i)]);
  // a lone row slips now and then even when it's calm
  if (!burst && r(8) < 0.07) tears.push([A.y + Math.floor(r(9) * A.h), 1, r(10) < 0.5 ? -2 : 2, 1]);
  const interlace = burst && r(11) < 0.3, roll = burst && r(12) < 0.15 ? -2 - Math.floor(r(13) * 2) : 0, poster = burst && r(14) < 0.15 * k;
  const tearAt = (y) => {
    for (const [y0, h, dx, tint] of tears) if (y >= y0 && y < y0 + h) return [dx, tint];
    return null;
  };
  // the calm signal: a faint bar rolling down the body
  const bar = A.y + ((t / meta.duration) * 2 * (A.h + 12)) % (A.h + 12) - 6;

  const px = (x, y, c) => p.px(x, y, c);
  // the split: the red and cyan ghosts first, offset either side
  if (split)
    for (let my = 0; my < A.h; my++)
      for (let mx = 0; mx < A.w; mx++) {
        if (!A.mask.data[my * A.w + mx]) continue;
        const y = A.y + my + roll, tr = tearAt(A.y + my), dx = tr ? tr[0] : 0;
        px(A.x + mx + dx - split, y, RED);
        px(A.x + mx + dx + split, y, CYAN);
      }
  // the body itself, row by row: torn, interlaced, rolled, posterised, tinted where the bar passes
  for (let my = 0; my < A.h; my++) {
    const ry = A.y + my, y = ry + roll;
    if (interlace && (my & 1)) continue;
    const tr = tearAt(ry), dx = tr ? tr[0] : 0, tint = tr && tr[1] < 0.35 ? (tr[1] < 0.18 ? RED : CYAN) : 0, near = Math.abs(ry - bar);
    for (let mx = 0; mx < A.w; mx++) {
      const c = A.pixels[my * A.w + mx];
      if (!c) continue;
      let col = c;
      if (poster) col = luma(c) > 0.32 ? C[5] : C[1];
      else if (tint) col = mix(c, tint, 0.6);
      else if (near < 1) col = mix(c, C[5], 0.35);
      px(A.x + mx + dx, y, col);
    }
    // a torn row smears its edge pixel out sideways, fading
    if (tr && Math.abs(dx) > 2 && rand(S, f, ry) < 0.6) {
      const right = dx > 0, mx = right ? A.w - 1 - [...Array(A.w)].findIndex((_, i) => A.mask.data[my * A.w + A.w - 1 - i]) : [...Array(A.w)].findIndex((_, i) => A.mask.data[my * A.w + i]);
      if (mx >= 0 && mx < A.w) {
        const c = A.pixels[my * A.w + mx], L = 4 + Math.floor(rand(S, f, ry, 1) * 10);
        for (let i = 1; i <= L; i++) p.dot(A.x + mx + dx + (right ? i : -i), y, c, 1 - i / (L + 1));
      }
    }
  }
  // a roll leaves the top slice repeated at the bottom
  if (roll)
    for (let my = 0; my < -roll; my++)
      for (let mx = 0; mx < A.w; mx++) {
        const c = A.pixels[my * A.w + mx];
        if (c && ((mx + my) & 1)) px(A.x + mx, A.y + A.h + roll + my, mix(c, C[1], 0.5));
      }
  // junk blocks round the body
  if (burst)
    for (let i = 0; i < 2 + Math.floor(r(20) * 5 * k); i++) {
      const w = 2 + Math.floor(r(21, i) * 9), h = 1 + Math.floor(r(22, i) * 3), x = A.x - 6 + Math.floor(r(23, i) * (A.w + 12)), y = A.y + Math.floor(r(24, i) * A.h);
      const c = [WHITE, RED, CYAN, C[5], C[3]][Math.floor(r(25, i) * 5)];
      if (r(26, i) < 0.4) for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) p.px(x + xx, y + yy, (xx + yy) & 1 ? c : C[0]);
      else p.rect(x, y, w, h, c);
    }
  // dead pixels thrown off by a burst, drifting and blinking out
  for (const [a, b, kk] of BURSTS) {
    const age = (f - a + NF) % NF;
    if (age > b - a + 8) continue;
    for (let i = 0; i < 10 * kk; i++) {
      const life = 4 + Math.floor(rand(S, a, i) * 6), at = Math.floor(rand(S, a, i, 1) * (b - a + 1)), q = age - at;
      if (q < 0 || q > life || (q > life / 2 && (q & 1))) continue;
      const x0 = A.x + rand(S, a, i, 2) * A.w, y0 = A.y + rand(S, a, i, 3) * A.h, side = rand(S, a, i, 4) < 0.5 ? -1 : 1;
      p.px(x0 + side * q * (1 + rand(S, a, i, 5) * 2), y0 - q * 0.5, [WHITE, RED, CYAN][i % 3]);
    }
  }
  // light: a cold flicker in the bursts, the split's colors glowing at its edges
  if (burst) {
    if (f === burst[0]) p.glow(A.x + A.w / 2, A.y + A.h / 2, 26, C[5], 0.4);
    p.glow(A.x + A.w / 2 - split * 4, A.y + A.h / 2, 18, RED, 0.18 * k);
    p.glow(A.x + A.w / 2 + split * 4, A.y + A.h / 2, 18, CYAN, 0.18 * k);
  }
  if (Math.abs(bar - (A.y + A.h / 2)) < A.h / 2 + 3) p.glowLine(A.x - 2, bar, A.x + A.w + 2, bar, 4, C[4], 0.12);
}

// —— 运行时读这个名字 ——
const fx = { meta, draw, act, actorAlpha };
```

一键生成独立页面：

```bash
node demo/make-page.mjs scifi/glitch --out glitch.html
```

---

### 案例 C — Hit spark（src/fx/impacts/hit-spark.js）

**命中火花：沿打击方向的一道长虹、白色菱形核心、锥形火花与碎屑落地弹跳。0.5 秒一次性。**

| 项 | 值 |
| --- | --- |
| 尺寸 | [136, 80] |
| 时长 | 0.5 秒 |
| 形态 | 模拟型（create + 手写粒子状态） |

**实现要点**

- 手写模拟型的范本：create(o) 里用 new Rng(o.seed) 生成一次性的形状参数（每道射线的角度、长度、粗细），存进闭包，draw 每帧按已过时间画对应阶段。
- Particles({ rng, ground }) 的粒子自带重力、落地反弹；P.SPARK 是线状火花，P.GRIT 是碎屑。
- lights.add(...) 三个光源分层爆闪；draw 里用 Math.exp(-t / 0.045) 做光的指数衰减。
- 阶段划分：t<0.025 全十字闪光，t<0.058 十字变细变长，t<0.092 只剩主射线烧尽——每一阶段画法都不同，这是打击感的关键。

粘进 HTML 时，把下面这行加在代码块末尾（运行时读 `fx` 这个名字）：

```js
// The two-tone spark spray and the light pop are adapted from Sprite Fusion's open-source impact
// (https://www.spritefusion.com/pixel-art-vfx/impact), MIT License, Copyright (c) 2026 Hugo Duprez.

const meta = {
  name: "Hit spark",
  desc: "The everyday hit: a sharp, lopsided cross flare with one long ray along the blow round a white diamond core, then a cone of sparks and hot chips that fall and bounce.",
  tags: ["impact", "hit", "spark", "combat", "directional", "one-shot"],
  size: [136, 80],
  origin: [44, 64],
  duration: 0.5,
  loop: false,
  fps: 30,
  bg: "ground",
  options: { palette: ["#4a1712", "#c9281f", "#f2561d", "#ff8a2a", "#ffe26b", "#fff3a6", "#ffffff"], height: 20, aim: 0.1, seed: 4 },
};

// one ray of the cross: fat at the root, a hair at the tip, white cooling outward; from..to draws a stretch of it
function ray(p, x, y, a, L, w, C, from = 0) {
  const c = Math.cos(a), s = Math.sin(a);
  for (let d = from * L; d <= L; d += 0.5) {
    const u = d / L, hw = w * Math.pow(1 - u, 1.6);
    const col = u < 0.3 ? WHITE : u < 0.62 ? C[5] : u < 0.88 ? C[4] : C[3];
    p.px(x + c * d, y + s * d, col);
    if (hw > 0.45) for (let o = 0.5; o <= hw; o += 0.5) for (const e of [-o, o]) p.px(x + c * d - s * e, y + s * d + c * e, u < 0.3 && o < 1 ? C[5] : C[4]);
  }
}

// the core: a crisp white diamond with a pale rim
function diamond(p, x, y, r, C) {
  for (let dy = -r - 1; dy <= r + 1; dy++)
    for (let dx = -r - 1; dx <= r + 1; dx++) {
      const m = Math.abs(dx) + Math.abs(dy);
      if (m <= r) p.px(x + dx, y + dy, WHITE);
      else if (m === r + 1) p.px(x + dx, y + dy, C[3]);
    }
}

function create(o) {
  const C = fit(o.palette, 7), R = new Rng(o.seed), X = 0, Y = -o.height, A = o.aim, floor = () => 0;
  const ps = new Particles({ rng: R, ground: floor, sparks: [C[6], C[5], C[4], C[2]] });
  const lights = new Lights();
  // the cross: a long thin ray along the blow, a stub behind, two unequal arms across, and a glint between
  const tilt = R.range(-0.08, 0.08);
  const rays = [
    { a: A + tilt, L: R.range(33, 37), w: 2.2 },
    { a: A + Math.PI + tilt, L: R.range(8, 10), w: 2.2 },
    { a: A - Math.PI / 2 + tilt, L: R.range(15, 18), w: 2.6 },
    { a: A + Math.PI / 2 + tilt, L: R.range(10, 12), w: 2.3 },
    { a: A - Math.PI / 4 + tilt, L: R.range(5, 7), w: 1 },
  ];

  lights.add(X, Y, 38, C[4], 0.35, 0.18);
  lights.add(X + Math.cos(A) * 10, Y + Math.sin(A) * 10, 22, C[5], 0.45, 0.1);
  lights.add(X, -2, 26, C[3], 0.22, 0.22);
  // a cone of sparks sprayed on along the blow: they fall, bounce off the floor and die
  for (let i = 0; i < 9; i++) {
    const a = A + R.range(-0.6, 0.6) - 0.15, v = R.range(170, 360);
    ps.spawn(P.SPARK, X + 1, Y, Math.cos(a) * v, Math.sin(a) * v - 40, R.range(0.25, 0.45), WHITE, 1, i > 6 ? R.range(0.01, 0.03) : 0);
  }
  // hot pixel chips knocked off, tumbling down to tick off the floor
  for (let i = 0; i < 6; i++) {
    const a = A + R.range(-1.1, 0.5) - 0.3, v = R.range(70, 170);
    ps.spawn(P.GRIT, X + 1, Y, Math.cos(a) * v, Math.sin(a) * v - R.range(30, 80), R.range(0.35, 0.45), R.pick([C[5], C[4], C[4], C[3]]), 1);
  }

  let t = 0;
  return {
    update(dt) {
      t += dt;
      ps.update(dt);
      lights.update(dt);
    },
    draw(p) {
      ps.draw(p);
      if (t < 0.025) {
        // the flash: the whole cross round the diamond
        for (const r of rays) ray(p, X, Y, r.a, r.L, r.w, C);
        diamond(p, X, Y, 4, C);
      } else if (t < 0.058) {
        // reaching further and thinning, the diamond still crisp
        for (const r of rays) ray(p, X, Y, r.a, r.L * 1.2, r.w * 0.55, C, 0.12);
        diamond(p, X, Y, 3, C);
      } else if (t < 0.092) {
        // only the long ray lingers, its root burning away
        const r = rays[0];
        ray(p, X, Y, r.a, r.L * 1.3, 0.6, [C[0], C[1], C[2], C[3], C[3], C[4]], 0.4);
      }
      const pop = Math.exp(-t / 0.045);
      if (pop > 0.02) {
        p.glow(X, Y, 22, C[4], 0.3 * pop);
        p.glow(X, Y, 7, WHITE, 0.15 * pop);
        p.glowLine(X, Y, X + Math.cos(A) * 26, Y + Math.sin(A) * 26, 4, C[5], 0.25 * pop);
      }
      lights.draw(p);
    },
  };
}

// —— 运行时读这个名字 ——
const fx = { meta, create };
```

一键生成独立页面：

```bash
node demo/make-page.mjs impacts/hit-spark --out hit-spark.html
```

---

## 7b. 一个特效里调用另一个特效（chain）

有些特效是“多个特效按时间线拼出来”的。典型是 moves/arrow-shot：小人射箭，
箭飞出去（projectiles/arrow 特效），命中瞬间炸出火花（impacts/hit-spark 特效）。
仓库自带一个组合器 chain，专门干这件事。

### chain 的用法

```js
import { chain } from "../../core/index.js";      // 全局已提供，不用 import
import * as arrow from "../projectiles/arrow.js"; // 被调用的特效模块
import * as spark from "../impacts/hit-spark.js";

export const create = (o) => chain([
  // 一个 cue = 一个被调用的特效
  { fx: arrow,                    // 特效模块（有 meta + draw 或 create 的那个对象）
    t: 0.56,                      // 几秒后开始画它
    until: 0.8,                   // 到几秒为止（省略则画到它自己播完）
    x: (t) => 30 + (t - 0.56) * 625,  // 位置；数字或 t 的函数（箭就是这么飞的）
    y: -28,                       // y 同样可以是函数
    flip: false,                  // 水平镜像
    seed: 9,                      // 传给它的 options
  },
  { fx: spark, t: 0.8, x: 170, height: 30 },   // 命中时炸火花
])(o);
```

**cue 字段**

| 字段 | 说明 |
| --- | --- |
| `fx` | 被调用的特效**模块**——就是那个 `{ meta, draw }` 或 `{ meta, create }` 对象 |
| `t` | 它几点开始（秒，相对本特效的时间轴） |
| `until` | 几点停（省略则画到它自己 duration 结束） |
| `x`, `y` | 摆放位置。**可以是 `(t) => …` 函数**——投影类特效全靠这个飞 |
| `flip` | 水平镜像 |
| 其余 | 原样作为 options 传给它（palette、seed、自定参数）；seed 默认自动 +1，避免随机序列和主特效相同 |

chain 返回一个标准的 create 结果（update / drawBack / draw），所以从外面看它就是一个普通特效：
可以再被别人 chain、可以 seek、可以导出精灵图。

### 只叠一帧（不用 chain）

只是想在特效里“叠”另一个特效，不需要时间线，用 createFx 自己管理：

```js
export function create(o) {
  const inner = createFx(arrow, { x: 100, y: -20, seed: o.seed });
  let t = 0;
  return {
    update(dt) { t += dt; inner.update(dt); },
    draw(p) { inner.draw(p); /* 再画你自己的东西 */ },
  };
}
```

### 粘贴进 HTML 时怎么拿到模块

chain 需要被调用的特效是**模块对象**（`{ meta, draw }` 或 `{ meta, create }`）。两种方式：

1. **用生成器（推荐）**：`node demo/make-page.mjs moves/arrow-shot --out arrow.html`——
   esbuild 把箭和火花模块一起打进那个页面，双击就能跑。
2. **手写页面**：先定义特效对象，再传给 chain：

```js
const arrow = { meta: {...}, draw(p, t, o) {...} };   // 从 src/fx/projectiles/arrow.js 抄来
const spark = { meta: {...}, create(o) {...} };       // 从 src/fx/impacts/hit-spark.js 抄来
const fx = {
  meta: { name: "我的射箭", size: [300, 74], origin: [38, 66], duration: 1.9, fps: 30 },
  create: (o) => chain([
    { fx: arrow, t: 0.56, until: 0.8, x: (t) => 30 + (t - 0.56) * 625, y: -28 },
    { fx: spark, t: 0.8, x: 170, height: 30 },
  ])(o),
};
```

### 案例对照

| 案例文件 | 组合了什么 |
| --- | --- |
| `moves/arrow-shot` | projectiles/arrow（箭）+ impacts/hit-spark（命中火花） |
| `moves/fireball-throw` | projectiles/fireball + explosions/small-explosion |
| `moves/ice-lance-throw` | projectiles/ice-lance + 命中特效 |
| `moves/lightning-call` | 天上落雷 + 地面命中 |

想看更多组合写法，直接读 `src/fx/moves/` 目录——每个文件都是“小人动作 + 若干特效按时间线”的完整例子。

### 想要更多？

仓库里有 246 个现成特效，全部可以这样搬：

```bash
node tools/list.mjs fire            # 按关键词过滤
cat docs/CATALOG.md                 # 全量目录（id / 尺寸 / 时长 / 描述）
node demo/make-page.mjs <分类>/<名字> --out 页面.html
```
