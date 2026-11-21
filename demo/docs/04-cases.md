
## 7. 案例

### 案例 A：稻草人（现成特效，`critters/scarecrow2-bunny.js`）

方形麻布头、缝线 X 眼、横条嘴、红补丁、木臂、主杆，随风摇摆，秸秆飘过。
3.2 秒循环，142×166。

一键生成页面：

```bash
node demo/make-page.mjs critters/scarecrow2-bunny --out scarecrow.html
```

源码要点：全部画在 Grid 里逐块定位；唯一的运动是整帧绕杆脚的缓慢剪切（shear）、
杆根秸秆颤动、飘落的碎屑，用 `shift(t, D)` 做循环相位，所以循环无接缝。

### 案例 B：自己写一个会摇的稻草人

```js
const fx = {
  meta: { name: "我的稻草人", size: [96, 110], origin: [48, 96], duration: 2.4, loop: true, fps: 30,
          options: { palette: ["#3a2a18", "#8a6a3a", "#c9a26c", "#e8d8a0"], seed: 3 } },
  draw(p, t, o) {
    const D = 2.4, u = t / D;
    const C = fit(o.palette, 4);
    const sway = Math.sin(u * TAU) * 0.06;               // 摇摆角
    shadow(p, sway * 40, 0, 14, 3, hex("#0b0a10"), 0.45);
    p.beam(0, 0, 0, -58, 3, (uu, v) => (v > 0.7 ? C[0] : C[1]));          // 主杆
    p.beam(-20, -44, 20, -44, 3, (uu, v) => (v > 0.7 ? C[0] : C[1]));     // 横臂
    p.rect(-7 + sway * 44, -48, 14, 18, C[1]);           // 身体随杆头轻移
    p.rect(-3 + sway * 44, -42, 6, 6, C[3]);
    p.shade(-8 + sway * 44, -66, 8 + sway * 44, -50, (x, y, out) => {
      out.c = C[2];
      const lx = x - sway * 44, ly = y + 58;
      if (Math.abs(Math.abs(lx) - 3.5) < 0.7 && Math.abs(Math.abs(ly) - 3.5) < 0.7) out.c = C[0]; // X 眼
    });
    for (let i = 0; i < 6; i++) {                        // 飘草
      const r = rng(o.seed, i);
      const q = (u + r.range(0, 1)) % 1;
      p.dot(r.range(-30, 30), -60 + q * 60, C[3], (1 - q) * 0.8);
    }
  },
};
```

### 案例 C：电球（现成特效，`lightning/ball-lightning.js`，当前模板页就是它）

```bash
node demo/make-page.mjs lightning/ball-lightning
```

源码要点：球心 `at(t)` 是几条不同频率正弦叠加的闭合路径（循环无接缝）；
球体三层 `p.circle`，颜色取 `VOLT` 色带；每帧 `rng(o.seed, 1, f)` 生成新电弧，f 是帧号；
余迹是把过去 14 帧的球心按时间衰减重画小号球；下沉到阈值时对地放电一次。

### 案例 D：刀光（`melee/sword-slash.js`，带小人动作）

```bash
node demo/make-page.mjs melee/sword-slash
```

两帧挥出的新月，白到深蓝拖尾，剑尖闪光，火花四溅。0.75 秒一次性，带 24×38 标准小人挥剑。
meta 里声明 `actor: 2` 就有小人；它的动作由导出的 `act` 字段驱动（poses 时间轴 + hits 命中帧）。

自己写一个不带小人的简化刀光：

```js
const fx = {
  meta: { name: "我的刀光", size: [110, 90], origin: [40, 78], duration: 0.4, fps: 30,
          options: { palette: ["#212f6b", "#2c58aa", "#3a8bd8", "#62c8f4", "#b8c9e8", "#e8f1ff", "#ffffff"], seed: 2 } },
  draw(p, t, o) {
    const C = fit(o.palette, 7);
    const k = clamp(t / 0.4);
    const a0 = -2.2 + k * 2.4, a1 = a0 + 0.9;
    p.arc(0, -34, 30 - k * 4, 9 * (1 - k) + 2, a0, a1,
      (u, v) => C[Math.min(6, 2 + Math.floor((1 - v) * 4))], 1 - k * 0.85);
    p.arc(0, -34, 28 - k * 4, 2, a1 - 0.5, a1, C[6], (1 - k) * 0.9);   // 白色内芯
    const tx = Math.cos(a1) * 30, ty = -34 + Math.sin(a1) * 30;       // 剑尖
    for (let i = 0; i < 5; i++) {
      const r = rng(o.seed, i, Math.floor(t * 30));
      const age = t - r.range(0, 0.06);
      if (age < 0) continue;
      const [x, y] = flight(tx, ty, r.range(-90, 90), r.range(-140, -30), age, { g: 0.4, drag: 2 });
      p.dot(x, y, hex("#ffe26b"), 1 - age / 0.3);
    }
    p.glow(tx, ty, 14, C[4], (1 - k) * 0.5);
  },
};
```

### 案例 E：火把（`fire/torch.js`）

```bash
node demo/make-page.mjs fire/torch
```

铁架墙面火把，舔舐的火舌、脱落的火团、烟、火星、墙上闪动的光。2 秒循环，72×120。
源码用 fire 工具箱的 `tongue` + `burn`，配合 `loopNoise` 让火苗摆动。

简化版骨架：

```js
const fx = {
  meta: { name: "我的火把", size: [48, 72], origin: [24, 62], duration: 1.2, loop: true, fps: 30,
          options: { palette: ["#4a1712", "#c9281f", "#f2561d", "#ff8a2a", "#ffc23d", "#fff3a6"], seed: 4 } },
  draw(p, t, o) {
    const C = fit(o.palette, 6), D = 1.2;
    tongue(p, 0, -20, 22, 3.2, lnoise(t, D, 9, 0) * 2.4, t, D, 3, C.slice().reverse());
    p.beam(0, -20, 0, 0, 3, hex("#3b2216"));
    p.rect(-3, -18, 6, 2, hex("#1e1b26"));
    for (let i = 0; i < 4; i++) {
      const r = rng(o.seed, i);
      const q = ((t / D) + r.range(0, 1)) % 1;
      const [x, y] = flight(r.range(-3, 3), -34, r.range(-14, 14), r.range(-50, -28), q * r.range(0.6, 1), { g: 0.18, drag: 1.2 });
      p.dot(x, y, hex("#ff8a2a"), 1 - q);
    }
    p.glow(0, -30, 26, C[4], 0.4 + lnoise(t, D, 11, 3) * 0.12);
  },
};
```

### 案例 F：爆炸（模拟型，create 路线）

```js
const fx = {
  meta: { name: "我的爆炸", size: [110, 100], origin: [55, 78], duration: 0.9, fps: 30,
          options: { palette: ["#3a1a10", "#c9281f", "#f2561d", "#ff8a2a", "#ffc23d", "#fff3a6"], seed: 11 } },
  create(o) {
    const R = new Rng(o.seed), C = fit(o.palette, 6);
    const ps = new Particles({ rng: R }), lights = new Lights();
    lights.add(0, -14, 46, C[5], 0.9, 0.22);
    for (let i = 0; i < 36; i++) {
      const a = R.range(0, TAU), sp = R.range(90, 300);
      ps.spawn(P.SPARK, 0, -14, Math.cos(a) * sp, Math.sin(a) * sp - 60, R.range(0.25, 0.6));
    }
    for (let i = 0; i < 8; i++) {
      const a = R.range(0, TAU);
      ps.spawn(P.SMOKE, Math.cos(a) * 6, -14 + Math.sin(a) * 6, Math.cos(a) * 30, Math.sin(a) * 30 - 40, R.range(0.6, 1.1));
    }
    let t = 0;
    return {
      update(dt) { t += dt; ps.update(dt); lights.update(dt); },
      draw(p) {
        const k = clamp(t / 0.9);
        if (t < 0.12) sparkle(p, 0, -14, 10 * (1 - t / 0.12), C[5], C[3]);
        if (t < 0.3) p.circle(0, -14, 6 + k * 22, C[3 - Math.floor(k * 3)], (1 - k) * 0.9);
        ps.draw(p); lights.draw(p);
      },
    };
  },
};
```

### 案例 G：把 246 个现成特效当素材库

不一定要自己画。`src/fx` 下按分类整理了 246 个：melee 近战、fire 火、lightning 电、
explosions 爆炸、ice 冰、water 水、shadow 暗、holy 圣、weather 天气、ui 界面反馈、
critters 生物（含稻草人）……

列出全部：`node tools/list.mjs fire`，或看 `docs/CATALOG.md`（全量 id/尺寸/时长/描述）。

搬进页面：`node demo/make-page.mjs <分类>/<名字> [--out 文件.html]`
