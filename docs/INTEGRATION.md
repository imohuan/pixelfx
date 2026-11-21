# pixelfx 浏览器运行时 — 第三方集成文档

把像素特效嵌进任意网页：一个 script 标签引入运行时，页面里写一个 `fx` 对象，特效就开始播放。
不需要构建工具、不需要 npm 安装、不需要服务器，双击 HTML 也能跑。

- 引入地址（CDN，推荐）：`https://cdn.jsdelivr.net/gh/imohuan/pixelfx@v0.4.0/demo/pixelfx.js`
- 仓库：[github.com/imohuan/pixelfx](https://github.com/imohuan/pixelfx)
- 体积：运行时约 182 KB（含全部 246 个特效的绘制代码和工具库），另有 1.9 KB 界面字体
- 关于 npm：npm 上的 `pixelfx` 名字已被他人占用，而且本项目核心价值是免构建，
  CDN 单文件最符合目标。想自托管只需拷贝 `demo/pixelfx.js` 和 `demo/fonts/` 两个文件。

## 1. 最短上手

完整可运行的页面就这么多，存成 `hello.html` 双击就能看：

```html
<!doctype html>
<script src="https://cdn.jsdelivr.net/gh/imohuan/pixelfx@v0.4.0/demo/pixelfx.js"></script>
<script>
const fx = {
  meta: {
    name: "我的火花",
    desc: "一颗会呼吸的电火花。",
    size: [96, 80],      // 画布像素尺寸
    origin: [48, 60],    // 锚点：角色脚底或冲击中心在画布内的位置
    duration: 1.6,       // 时长，秒
    loop: true,
    fps: 30,
  },
  draw(p, t, o) {
    const k = 1 - t / 1.6;
    p.glow(0, -10, 20 * k, hex("#ffd166"), k);   // 光晕
    p.dot(0, -10, hex("#ffffff"), 1);            // 一个白点
  },
};
</script>
```

页面加载后自动出现：标题、画布舞台、重播/暂停、背景切换、缩放、镜像、精灵图导出、进度条、信息表。
整个界面由运行时生成，你的 HTML 不需要写任何 UI。

## 2. fx 对象

运行时在 DOM 就绪后扫描页面里的内联 script，找到声明了 `meta` 且带 `draw` 或 `create` 的那个，
建界面并播放。两种形态：

```js
const fx = { meta, draw };     // 纯函数型：每帧只由 t 决定，可精确 seek
const fx = { meta, create };   // 模拟型：自己维护状态（粒子、碎片、烟雾）
```

也可以 `window.fx = {...}` 显式声明。给 `<body>` 加 `data-pixelfx-manual` 则不会自动挂载，
由你自己调 `pixelfx.play(canvas, fx)`。

### meta 字段

| 字段 | 说明 |
| --- | --- |
| `name` | 标题 |
| `desc` | 描述 |
| `size` | `[w, h]` 画布像素尺寸，必填 |
| `origin` | `[x, y]` 锚点位置 |
| `duration` | 秒 |
| `loop` | 循环与否 |
| `fps` | 默认 30 |
| `bg` | 预览背景：`stage`(默认) `none` `black` `dark` `ground` `sky` `light` |
| `options` | 可调参数与默认值：调色板、seed、自定数值 |
| `actor` | 声明后舞台会画一个 24×38 的标准小人 |

### 坐标系

`(0, 0)` 是 `origin`。往右 x 正、往下 y 正，1 单位 1 像素。
角色特效一律朝右画，朝左由界面的镜像按钮翻转整帧。

### 时间

`t` 是秒。**每一帧只由 t 决定**，没有上一帧残留：进度条可拖到任意时刻，同一时刻重画结果一致。
随机一律用 `rand`/`rng`/`Rng`（种子来自 `o.seed`），不要用 `Math.random()`，否则 seek 不一致。

## 3. 画笔 API（draw 的第一个参数 p）

画笔写两个缓冲：颜色层（实色像素）和光层（加法发光），合成时光叠在颜色上。
发光的东西的正确画法：先画实色像素，再补一圈 `p.glow`。

### 像素

| 方法 | 说明 |
| --- | --- |
| `p.px(x, y, c)` | 一个不透明像素 |
| `p.dot(x, y, c, a)` | 像素带透明度 a（0–1）；低透明度用 4×4 抖动实现 |
| `p.blend(x, y, c, a)` | 真混合，用于烟雾雾气 |
| `p.light(x, y, c, k)` | 只加光不改颜色 |

### 形状（c 和 a 都可以是函数）

| 方法 | 回调参数 |
| --- | --- |
| `p.line(x0,y0,x1,y1,c,a)` | c/a 收 `u`：0 到 1 的进度 |
| `p.beam(x0,y0,x1,y1,w,c,a)` | 有宽度的线段，圆头；c 收 `(u, v)`，v 是 0 中心到 1 边缘 |
| `p.circle(cx,cy,r,c,a)` | c 收 `(d, ang)`，d 是 0 中心到 1 边缘 |
| `p.ellipse(cx,cy,rx,ry,c,a)` | 同 circle |
| `p.ring(cx,cy,r,w,c,a)` | 圆环，w 厚度 |
| `p.arc(cx,cy,r,w,a0,a1,c,a)` | 弧段，刀光用 |
| `p.rect(x,y,w,h,c,a)` | 矩形 |
| `p.poly(pts,c,a)` / `p.tri(...)` | 多边形 / 三角 |
| `p.shade(x0,y0,x1,y1,fn)` | 像素着色器：`fn(x,y,out)` 返回颜色或 0 跳过；可写 `out.a` `out.k` |

### 光

| 方法 | 说明 |
| --- | --- |
| `p.glow(x,y,r,c,k)` | 径向光晕，k 强度 0–1 |
| `p.glowLine(x0,y0,x1,y1,r,c,k)` | 线状光带 |
| `p.glowRing(x,y,R,r,c,k)` | 环形光，冲击波用 |

### 文本与精灵

| 方法 | 说明 |
| --- | --- |
| `p.sprite(rows, pal, x, y, opts)` | 字符画：rows 字符串数组，pal 字符映射颜色，`.` 和空格为空；opts: `scale flip flipY tint a` |
| `p.text(str, x, y, c, opts)` | 像素文字；opts: `font "mini"(3x5)\|"big"(5x7)` `scale` `align` `outline` `shadow` |

## 4. 全局工具（加载即有，不用 import）

运行时把 21 个模块（core + 每个分类的 `_lib`）全部发布为全局，共 325 个名字。
`Object.keys(pixelfx.kit)` 可列出全部。常用的：

### 颜色

| 名字 | 说明 |
| --- | --- |
| `hex("#ffaa33")` / `rgb(r,g,b)` | 颜色整数 |
| `mix(a, b, t)` | 混色 |
| `scale(c, k)` / `luma(c)` | 亮度 |
| `fit(list, n)` | 任意长度的色带重采样为恰好 n 阶，暗亮端点保持 |
| `FIRE_RAMP` / `SMOKE_RAMP` / `WHITE` | 现成色带 |

调色板约定：暗到亮排列。特效内用 `fit(o.palette, 7)` 取 7 阶，0 最暗 6 最亮。
调用方传的列表长度不同也会自动重采样，不会崩。

### 数值与随机

| 名字 | 说明 |
| --- | --- |
| `clamp` / `lerp` / `smooth` / `ease.outCubic` … | 数值与缓动 |
| `TAU` | 2π |
| `rand(a,b,c…)` | 带种子哈希随机，同参数同结果 |
| `rng(seed, salt, frame)` | 拿一个 Rng；一帧一批 |
| `new Rng(seed)` | `.range(lo,hi)` `.chance(p)` `.sign()` `.pick(arr)` |
| `noise(x,y)` / `tileNoise` / `loopNoise(t,D,F)` | 噪声；loopNoise 在 D 秒内循环 F 次 |
| `cycle(t, D)` / `wrap(v, n)` | 循环相位 |

随机原则：一帧内的一批随机数用 `const r = rng(o.seed, salt, f)`（f 帧号），
不要每像素调用一次 `rand`——那会每帧都变，画面闪烁。

### 粒子（模拟型）

| 名字 | 说明 |
| --- | --- |
| `new Particles({rng, ground})` | `.spawn(kind,x,y,vx,vy,life)` `.update(dt)` `.draw(p)` |
| `new Lights()` | `.add(x,y,r,c,k,life)` `.update(dt)` `.draw(p)` |
| `new Bits()` / `new Blazes()` | 碎片 / 火焰舌 |
| `P.SPARK` `P.SMOKE` `P.BIT` `P.FLAME` `P.EMBER` | 粒子种类 |
| `sparkle(p,x,y,r,hot,cold)` | 星芒闪光，命中暴击用 |
| `flare(p,x,y,r,c,k)` | 十字光芒 |

### 生物（critters 工具箱）

| 名字 | 说明 |
| --- | --- |
| `new Grid(x0,y0,w,h)` | 离屏网格：`ellipse tube poly line sprite shade outline recolor draw` |
| `shadow(p,cx,cy,rx,ry,c,a)` | 地面椭圆阴影 |
| `curve` / `spring` / `toss` / `bounce` / `Swarm` | 曲线、弹簧、抛物线、弹跳、粒子群 |

`Grid` 是画角色的核心：椭圆管状多边形拼身体，函数挑每像素颜色做明暗，
最后 `g.outline(c)` 自动描 1px 边——描边色可按朝向变化，背光侧更黑。

### 闪电（lightning 工具箱）

| 名字 | 说明 |
| --- | --- |
| `VOLT` / `PLASMA` / `GOLD` / `WATER` | 现成色带 |
| `zigzag(R, x0,y0,x1,y1, jag, forks)` | 主干加分叉的折线；R 是 Rng，jag 首段摆幅比例，forks 分叉概率 |
| `bowed(R, ..., bow, jag)` | 弓形弯曲 |
| `stroke(p, bolt, k, C, s, o)` | 画闪电：k 亮度，s 粗细倍数；o: `upTo hero light core` |
| `crackle(p, bolt, k, C, glowK)` | 细电弧 |
| `flight(x,y,vx,vy,age,o)` | 抛物线加阻力落点，纯函数 |
| `scorch(p,cx,cy,rx,T0)` | 地面灼痕 |

### 火（fire 工具箱）

`tongue(p,x,y,h,w,sway,t,D,n,heat,only)` 单舌火焰；`firePuff` 火团；`smokePuff` 烟团；`ember` 火星。
都接受 t 和循环周期 D，天然无接缝循环。

其他分类的 `_lib` 也全部发布：写特效前先看同类的现成特效怎么用这些工具，
比如 `melee/sword-slash.js`（刀光）、`critters/scarecrow2-bunny.js`（稻草人）、`fire/torch.js`（火把）。

## 5. 播放器 API（pixelfx 全局对象）

### `pixelfx.play(canvas, fx, opts)` 返回 Player

opts：`scale`（整数显示倍数）`background` `loop` `speed` `seed` `flip` `light` `autoplay` `onEnd({t})`，
其余原样作为 options 传给特效（palette、radius、seed…）。

### Player 成员

`play` `pause` `toggle` `seek(秒)` `restart` `setOptions(patch)` `resize(scale)` `destroy`；
属性 `t` `playing` `width` `height` `duration`。

### `pixelfx.drawTo(canvas, fx, t, opts)`

只画一帧，不建播放器。适合自己写动画循环或画很多小预览：

```js
function loop(now) {
  pixelfx.drawTo(cvs, fx, now / 1000, { scale: 2, background: "none" });
  requestAnimationFrame(loop);
}
```

### `pixelfx.toDataURL(fx, {scale})`

整段动画排成精灵图 PNG 的 data URL。

### `pixelfx.kit` / `pixelfx.shell` / `pixelfx.installKit`

kit 是全部工具的对象形式；shell 是自动挂载用的界面生成，可自己复用；
`installKit(window)` 手动发布全局（manual 模式下不会自动执行）。

## 6. 开发流程

1. **写骨架**：复制第 1 节的 hello，改 meta 的 name / size / duration。
2. **画静帧**：先把 t 固定（如 0.5），用形状拼出静止画面，确认轮廓和颜色关系。
3. **动起来**：把固定值换成 t 的函数；循环特效保证 t=0 和 t=duration 画面一致（无接缝）。
4. **加随机**：火花碎片烟雾用 rand/rng/Particles，种子取 `o.seed`。
5. **看图迭代**：界面上拖进度条逐帧检查，每次只改最明显的一处。

两条路线：

**纯函数型 `draw(p, t, o)`**：光环、电球、水流这类形状是 t 的函数的东西。可精确 seek，天然循环。

**模拟型 `create(o)`**：爆炸碎片这类有惯性的东西。返回 `update(dt, o)` 和 `draw(p, o)`，
运行时以 120Hz 固定步进 update，任何帧率下物理一致。

画法规则（详见 `demo/PIXEL-RULES.md`）：

1. 颜色和光两套：先实色再补光。
2. 硬色阶：一个物体 4–6 阶。
3. 半透明用抖动：`p.dot` 低 alpha 自动抖动；烟雾才用 `p.blend`。
4. 光从左上：亮面左上暗面右下。
5. 1px 轮廓：角色画完 `g.outline()`。
6. 原点在脚底：有方向的特效朝右画。

动作类加三条：起手方向与攻击方向相反；释放帧整体变白 60–70ms；命中停 30–200ms。

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

## 8. 常见问题

**为什么不用 npm 包？** npm 上的 `pixelfx` 已被他人占用；且本项目核心价值是免构建。
fork 或下载后自托管只需拷 `demo/pixelfx.js` 和 `demo/fonts/`。

**jsDelivr 和 raw.githubusercontent 选哪个？** 都可用。jsDelivr 有边缘缓存和正确 Content-Type，
生产推荐；raw 适合临时测试。两者走同一个 tag，内容一致。

**界面字体没加载？** 运行时按自身 script 标签的 URL 找 `fonts/PatchPixel-Regular.woff2`。
把 `pixelfx.js` 单独复制走时请带上 `demo/fonts/`；字体失败不影响功能，只影响标题字体。

**画面上有个白色小人在动？** 那是 `meta.actor` 声明的标准角色，不需要就删掉 actor 字段。

**特效画面闪烁？** 几乎一定是随机数用错：每帧调用 `rand()` 每帧都变。
改成 `const r = rng(o.seed, salt, frameNumber)`，一批随机只在帧号变化时才变。

**循环有跳变？** 确认 t=0 和 t=duration 画面一致；随时间变化的量用 `cycle(t,D)`
或正弦等封闭形式，不要累加状态。

**想嵌自己的 UI？** `<body data-pixelfx-manual>`，然后 `pixelfx.play(canvas, fx, opts)`
或 `pixelfx.drawTo(...)`。

**缩放后像素模糊？** scale 必须整数。canvas 本体始终是原始像素尺寸，CSS 有 `image-rendering: pixelated`。

## 9. 版本与引用

| 渠道 | 地址 |
| --- | --- |
| jsDelivr 锁定版本（生产推荐） | `https://cdn.jsdelivr.net/gh/imohuan/pixelfx@v0.4.0/demo/pixelfx.js` |
| jsDelivr 跟随 main | `https://cdn.jsdelivr.net/gh/imohuan/pixelfx@main/demo/pixelfx.js` |
| GitHub raw | `https://raw.githubusercontent.com/imohuan/pixelfx/v0.4.0/demo/pixelfx.js` |
| 字体 | `https://cdn.jsdelivr.net/gh/imohuan/pixelfx@v0.4.0/demo/fonts/PatchPixel-Regular.woff2` |

发新版本：改代码 → `node demo/build.mjs` → 提交 → `git tag v0.x.y` 并 push。
jsDelivr 对 tag 内容永久缓存，锁定版本的引用永远稳定。

## 10. 目录速查

```
demo/
  pixelfx.js        打包产物：运行时 + 全部特效代码 + 界面生成器
  index.html        模板页（当前内容：lightning/ball-lightning）
  fonts/            界面字体
  build.mjs         构建
  make-page.mjs     把 src/fx/<id>.js 写成独立 HTML
  verify.mjs        无浏览器验证
  docs/             本文档的分片（合并脚本会拼成 docs/INTEGRATION.md）
  src/entry.js      入口：发布全局工具名 + 自动挂载
  src/player.js     播放器
  src/ui.js         界面生成
  src/kit.js        构建时自动生成（21 个模块，325 个名字）
  PIXEL-RULES.md    像素画法规则
src/fx/             246 个现成特效
src/core/           引擎
docs/CATALOG.md     全部特效目录
```
