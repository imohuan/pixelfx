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

画笔写入两个缓冲：**颜色层**（实色像素）和**光层**（加法发光），合成时光叠在颜色上。
所以“发光的东西”的正确画法永远是：先画实色像素，再补一圈 `p.glow`。只画光会得到一团雾。

所有方法的坐标都是**特效局部坐标**：`(0, 0)` 是 meta 里声明的 `origin`，往右 x 正、往下 y 正，
1 单位 1 像素。界面会自动放置、镜像、旋转，你不用关心画布在哪。

### 3.1 像素

```js
p.px(x, y, c)                 // 一个不透明像素。c 是颜色（hex() 的返回值）
p.dot(x, y, c, a)             // 一个像素，a 是 0~1 的透明度
p.blend(x, y, c, a)           // 真透明混合（烟雾、雾气用）
p.light(x, y, c, k)           // 只往光层加光，不动颜色
```

**参数**：

- `x, y` — 局部坐标，可以是小数（落到最近的像素格）
- `c` — 颜色整数，用 `hex("#ffaa33")` 或 `rgb(r, g, b)` 得到
- `a` — 透明度 0~1。**低于 1 时引擎用 4×4 棋盘抖动**：一部分像素画、一部分不画，
  这是像素画淡出的标准做法。想要平滑的半透明（比如烟）才用 `blend`
- `k` — 光强 0~1，大于 1 允许（用于爆发帧）

```js
// 例：三点从实到虚
p.px(0, 0, hex("#ffffff"));
p.dot(4, 0, hex("#ffaa33"), 0.6);   // 抖动淡出
p.dot(8, 0, hex("#ffaa33"), 0.3);
```

### 3.2 形状

形状方法的 `c` 和 `a` 除了常量，**都可以是函数**——这是做明暗、渐隐、拖尾的关键。
函数收到什么参数，每个方法不同，见下表。

| 方法 | 参数 | 回调收到 | 用途 |
| --- | --- | --- | --- |
| `p.line(x0,y0,x1,y1,c,a)` | 两端点 | `c(u)`，u 是 0 起点→1 终点的进度 | 轨迹、引线、拖尾 |
| `p.beam(x0,y0,x1,y1,w,c,a)` | 两端点 + 宽度 w（像素） | `c(u, v)`，v 是 0 中心→1 边缘 | 光束、手臂、杆子 |
| `p.circle(cx,cy,r,c,a)` | 圆心 + 半径 r | `c(d, ang)`，d 是 0 中心→1 边缘，ang 弧度 | 球体、光核 |
| `p.ellipse(cx,cy,rx,ry,c,a)` | 圆心 + 两轴半径 | 同 circle | 压扁的球、身体块 |
| `p.ring(cx,cy,r,w,c,a)` | 圆心 + 半径 + 厚度 w | `c(v, ang)`，v 是 0 内沿→1 外沿 | 冲击波、描边环 |
| `p.arc(cx,cy,r,w,a0,a1,c,a)` | 圆心 + 半径 + 厚度 + 起止角（弧度） | `c(u, v)`，u 沿弧 0→1 | 刀光新月、扇形 |
| `p.rect(x,y,w,h,c,a)` | 左上角 + 宽高 | 常量 | 方块身体、补丁 |
| `p.poly(pts,c,a)` | 顶点数组 `[[x,y],...]` | `c(x, y)` | 多边形块、耳朵 |
| `p.tri(x0,y0,x1,y1,x2,y2,c,a)` | 三顶点 | 同 poly | 三角 |
| `p.shade(x0,y0,x1,y1,fn)` | 包围盒 | `fn(x, y, out)` 逐像素调用 | 完全自定义的形状 |

```js
// 例：一条从头到尾变暗的光束（剑的拖尾）
p.beam(-20, -30, 20, -34, 3,
  (u, v) => (v > 0.7 ? hex("#1e1b26") : hex("#ffd166")),   // v>0.7 是边缘，画深色描边
  1 - u * 0.6);                                              // u 越接近终点越透明

// 例：一个左上受光的球（四层硬色阶，不做平滑渐变）
p.circle(0, -30, 12, (d, ang) => {
  const light = -Math.cos(ang) * 0.62 - Math.sin(ang) * 0.78;  // 左上方向的光
  if (d > 0.82) return hex("#1b2a5e");        // 最外圈：轮廓色
  if (light > 0.55) return hex("#eaf9ff");    // 高光
  if (light > -0.1) return hex("#9ed8ff");    // 亮面
  return hex("#4a8fe0");                      // 暗面
});

// 例：shade 像素着色器——方块加缝线 X 眼（稻草人的头）
p.shade(-8, -66, 8, -50, (x, y, out) => {
  out.c = hex("#c9a26c");                     // 麻布色
  const lx = Math.abs(x) - 3.5, ly = Math.abs(y + 58) - 3.5;
  if (Math.abs(lx) < 0.7 && Math.abs(ly) < 0.7) out.c = hex("#3a2a18");  // X 眼的笔画
});
```

`p.shade` 的 `out` 对象：`out.c` 颜色（必须设置，返回值也行）、`out.a` 透明度、
`out.k` 该像素的额外光强。fn 返回 0（或 falsy）表示这个像素不画。

### 3.3 光

```js
p.glow(x, y, r, c, k)              // 径向光晕：r 半径，k 中心强度 0~1，往外衰减到 0
p.glowLine(x0,y0,x1,y1,r,c,k)      // 沿线段的光带
p.glowRing(x, y, R, r, c, k)       // 环形光：R 环半径，r 衰减厚度。冲击波用
```

**参数**：`r` / `R` 是像素半径；`k` 是强度。光只加在光层，不遮挡颜色，所以叠多少层都不会糊。

```js
// 例：火把的光——中心亮，随火苗晃动
p.glow(0, -30, 26, hex("#ffc23d"), 0.4 + noise(t * 9) * 0.12);
```

### 3.4 文本与精灵

```js
p.sprite(rows, pal, x, y, opts)    // 字符画
p.text(str, x, y, c, opts)         // 像素文字
p.measure(str, opts)               // 返回 [宽, 高]
```

**`p.sprite` 参数**：

- `rows` — 字符串数组，一个字符一个像素；`.` 和空格是空
- `pal` — 对象，字符 → 颜色（hex 字符串或颜色整数）
- `x, y` — 放置位置
- `opts` — `scale`(整数放大) `flip`(水平镜像) `flipY`(垂直翻转) `tint`(所有像素统一成一个色) `a`(透明度)

```js
// 例：用字符画一个 8x8 的小火苗，K 是黑尖，h 中层，w 内芯
const FLAME = [
  "...K...",
  "..KK...",
  ".Khhh..",
  ".Khhww.",
  ".Khhww.",
  "..hhww.",
  "...hww.",
  "....ww.",
];
p.sprite(FLAME, { K: hex("#2b1f16"), h: hex("#f2561d"), w: hex("#ffc23d") }, -4, -30);
```

**`p.text` 参数**：`str` 文本，`x, y` 位置，`c` 颜色，
`opts`: `font`("mini" 3×5 或 "big" 5×7) `scale` `align`("left"/"center"/"right")
`outline`(描边色) `shadow`(阴影色) `a`。

```js
p.text("999", 0, -50, hex("#ffffff"), { font: "big", scale: 2, align: "center", outline: hex("#000000") });
```

## 4. 全局工具（加载即有，不用 import）

运行时把 21 个模块（core + 每个特效分类的 `_lib`）的全部导出发布为全局，共 325 个名字。
`Object.keys(pixelfx.kit)` 可以列出全部。下面按用途分组，每个都给参数和例子。

### 4.1 颜色

```js
hex("#ffaa33")        // 十六进制字符串 → 颜色整数。也接受 #rgb 三位简写
rgb(r, g, b)          // 三通道 0-255 → 颜色整数
mix(a, b, t)          // 两色混合，t 0=a 1=b
scale(c, k)           // 亮度乘 k（>1 变亮）
luma(c)               // 感知亮度 0~1
ramp(["#…", …])       // hex 数组 → 颜色整数数组
fit(list, n)          // 关键：把任意长度的色带重采样为恰好 n 阶
WHITE                 // 纯白常量
FIRE_RAMP / SMOKE_RAMP  // 9 阶火 / 烟色带，暗→亮
```

**`fit(list, n)` 是调色板的核心**：调用方可能传 3 个颜色也可能传 10 个，
`fit` 把它拉伸或压缩成你的特效需要的阶数，暗端和亮端保持不动。所以特效内永远写
`fit(o.palette, 7)` 然后按下标取色：0 最暗、6 最亮。

```js
const C = fit(o.palette, 7);
p.circle(0, -20, 10, (d, ang) => {
  const light = -Math.cos(ang) - Math.sin(ang) * 1.2;
  if (light > 0.6) return C[5];       // 高光
  if (light > 0) return C[4];         // 亮面
  if (light > -0.6) return C[3];      // 中间
  return C[1];                        // 暗面
});
```

### 4.2 数值与随机

```js
clamp(v, lo, hi)      // 夹进区间；省略区间就是 0~1
lerp(a, b, t)         // 线性插值，t 0=a 1=b
smooth(t)             // 平滑 step（两端慢中间快）
ease.outCubic(t)      // 缓动族：inCubic outCubic inOutCubic outBack outElastic ...
TAU                   // 2π，写角度循环用它
wrap(v, n)            // 取模到 0~n
cycle(t, D)           // 循环相位 0~1，D 是周期
```

**随机——这是最容易用错的地方。**

```js
rand(a, b, c…)        // 带种子的哈希随机：同参数永远同结果，0~1
rng(seed, salt, f)    // 拿一个 Rng 实例；f 通常是帧号
new Rng(seed)         // 连续取随机：.range(lo,hi) .chance(p) .sign() .pick(arr)
hash(a, b)            // 整数哈希
```

**规则：一帧内的一批随机数，先拿一个 Rng 再连续取；跨帧要变化的，把帧号当参数。**

```js
draw(p, t, o) {
  const f = Math.floor(t * 30);            // 帧号
  // 错：每像素 rand()，每帧都变 → 画面闪烁
  // 对：每帧拿一个 Rng，本帧内稳定
  const r = rng(o.seed, 7, f);
  for (let i = 0; i < 8; i++) {
    const a = r.range(0, TAU), len = r.range(4, 12);
    p.dot(Math.cos(a) * len, -20 + Math.sin(a) * len, hex("#7ff3ff"), 0.9);
  }
}
```

### 4.3 噪声与循环

```js
noise(x, y)                 // 平滑 2D 噪声，-1~1
noise2(x, y, z)             // 3D 版
loopNoise(t, D, F, off)     // 在 D 秒内循环 F 次的噪声（火苗摆动用），off 偏移不同噪声
tileNoise(x, F) / tileFbm   // 平铺噪声 / 分形叠加
cycle(t, D)                 // 0→1 的循环相位
```

```js
// 例：火把的光随火苗晃，幅度小、频率高
const flicker = loopNoise(t, 1.2, 9, 0);          // 1.2 秒内循环 9 次
p.glow(0, -30, 26, hex("#ffc23d"), 0.4 + flicker * 0.12);
```

### 4.4 粒子系统（模拟型特效用）

粒子容器在 `create(o)` 里创建，`update(dt)` 推进，`draw(p)` 绘制。
粒子自带重力、阻力、落地反弹，不用你写物理。

```js
new Particles({ rng: R, ground: () => 0 })   // 容器；ground 是地面 y，反弹用
ps.spawn(kind, x, y, vx, vy, life)           // 发射一个：kind 见下，速度单位 像素/秒
ps.update(dt)                                // 推进
ps.draw(p)                                   // 画到当前层
ps.list                                      // 粒子数组，可遍历改属性
```

**kind**：`P.SPARK`(线状火花) `P.SMOKE`(烟团) `P.BIT`(方块碎屑) `P.FLAME`(火焰舌) `P.EMBER`(火星)。

```js
new Lights()                       // 光源容器
lights.add(x, y, r, c, k, life)    // 一个光：半径、颜色、强度、寿命秒
new Bits()                         // 方块碎屑容器
```

```js
// 例：create 路线的完整爆炸
const fx = {
  meta: { name: "爆炸", size: [110, 100], origin: [55, 78], duration: 0.9, fps: 30,
          options: { seed: 11 } },
  create(o) {
    const R = new Rng(o.seed);
    const ps = new Particles({ rng: R });
    const lights = new Lights();
    lights.add(0, -14, 46, hex("#fff3a6"), 0.9, 0.22);          // 中心闪光，0.22 秒
    for (let i = 0; i < 36; i++) {
      const a = R.range(0, TAU), sp = R.range(90, 300);
      ps.spawn(P.SPARK, 0, -14, Math.cos(a) * sp, Math.sin(a) * sp - 60, R.range(0.25, 0.6));
    }
    let t = 0;
    return {
      update(dt) { t += dt; ps.update(dt); lights.update(dt); },
      draw(p) { ps.draw(p); lights.draw(p); },
    };
  },
};
```

即时函数（不用容器，纯函数特效直接画）：

```js
sparkle(p, x, y, r, hot, cold)     // 星芒闪光：r 半径，hot/cold 两阶颜色。命中、暴击用
flare(p, x, y, r, c, k)            // 十字光芒
crystal(p, x, y, r, c)             // 晶体碎片
```

### 4.5 生物绘制（critters 工具箱）

`Grid` 是画角色的核心：在一个离屏网格里拼身体 → 打明暗 → 描 1px 边 → 整体贴到画面。
好处：明暗和描边对整只角色统一处理，角色还能整体拆成粒子（死亡溶解）。

```js
const G = new Grid(x0, y0, w, h)   // 网格覆盖的世界范围（origin 是 (0,0)，所以 x0 y0 一般是负的）

G.ellipse(cx, cy, rx, ry, c)       // 椭圆；c 可为 fn(nx, ny)，归一化 -1~1
G.tube(pts, r, c)                  // 管状（手臂尾巴）：pts 折线点，r 半径可 fn(u)，c 可 fn(u, v)
G.poly(pts, c)                     // 多边形
G.line(x0,y0,x1,y1,c)              // 线
G.sprite(rows, pal, x, y, opts)    // 字符画（同 p.sprite，opts 多 rot / ax / ay 锚点旋转）
G.shade(x0,y0,x1,y1,fn)            // 像素着色器
G.set(x, y, c)                     // 单像素
G.outline(c)                       // 关键：给已画的全部内容描 1px 边
G.recolor(fn)                      // 重上色（白闪帧用：全部混向白色）
G.draw(p, fade, dx, dy)            // 贴到画面
G.clear()                          // 清空（每帧重画前调用）
```

```js
// 例：Grid 画一个带明暗的球角色，每帧重建
const G = new Grid(-20, -40, 40, 40);
function draw(p, t, o) {
  G.clear();
  G.ellipse(0, -16, 9, 10, (nx, ny) => {
    const light = nx * -0.6 + ny * -0.85;          // 左上光
    if (light > 0.55) return C[5];
    if (light > 0.12) return C[4];
    if (light < -0.4) return C[1];
    return C[3];
  });
  G.outline(C[0]);                                  // 1px 轮廓
  G.draw(p);                                        // 贴上画面
}
```

其他 critters 工具：

```js
shadow(p, cx, cy, rx, ry, c, a)    // 地面椭圆阴影（画在最底层）
curve(x, [[t0,v0],[t1,v1],…])      // 关键帧曲线，两端外持平
spring(age, hz, damp)              // 阻尼弹簧：受击晃动，1 → 衰减震荡
toss(x,y,vx,vy,age,g,floor)        // 抛物线落点（含落地判断）
bounce(x,y,vx,vy,age,g,floor,e)    // 弹跳（连续弹到停）
flight(x,y,vx,vy,age,{g,drag})     // 抛物线加空气阻力，纯函数，火花用
new Swarm(opts)                    // 声明式粒子群（循环特效用）
```

```js
// 例：受击晃动——命中后 0.4 秒内头顶左右摆
const age = t - hitTime;
if (age >= 0 && age < 0.4) {
  const wobble = spring(age, 9, 7);        // 9Hz，衰减 7
  headX = wobble * 3;
}
```

### 4.6 闪电（lightning 工具箱）

```js
VOLT      // 电色带 8 阶：深紫罗兰 → 电蓝 → 冰白
PLASMA    // 等离子火花 4 阶（青色系）
GOLD / WATER / SOOT  // 金 / 水 / 烟灰

zigzag(R, x0, y0, x1, y1, jag, forks)   // 生成闪电形状
bowed(R, x0,y0,x1,y1, bow, jag)         // 弓形弯曲的
stroke(p, bolt, k, C, s, o)             // 把闪电画出来
crackle(p, bolt, k, C, glowK)           // 细电弧（短命的小闪）
trace(p, pts, c, a, from, to)           // 只画 1px 主干线（引导线、余像）
```

**`zigzag` 参数**：

- `R` — Rng 实例（决定形状，同 R 同形状）
- `x0,y0 → x1,y1` — 起终点
- `jag` — 首段摆幅占长度的比例，0.2~0.4 常用；越大越狂野
- `forks` — 分叉概率 0~1；0 就是没有分叉的主干
- 返回 `{ paths: [{ pts, w }] }`，主干在前（w≥1），分叉在后（自动变细）

**`stroke` 参数**：

- `p` 画笔，`bolt` zigzag 的返回，`k` 亮度 0~1（低于 0.5 分叉消失，主干变细）
- `C` 色带（8 阶，用 VOLT），`s` 粗细倍数（1 是标准，0.7 细）
- `o` — `{ upTo: 0~1 }` 从头画到某个比例（闪电生长）；`{ hero: true }` 白闪帧；
  `{ light: 0.5 }` 光强；`{ core: 2 }` 加粗白芯

```js
// 例：从爪子射向右边的闪电，0.07 秒长到位
const r = rng(o.seed, 7, f);                              // 每帧新形状
const bolt = zigzag(r, 17, -11, 119, -18, 0.22, 0.42);
const age = t - 0.42;                                     // 0.42 秒释放
stroke(p, bolt, 0.9, VOLT, 1.35, { upTo: clamp(age / 0.07) });
```

**`crackle` 参数**：`p` `bolt` `k`(0~1) `C` `glowK`(光强)。比 stroke 细，适合贴着物体表面跳的小电弧。

```js
flight(x, y, vx, vy, age, { g, drag, floor })
// 抛物线加阻力：返回 [x, y, vx, vy]。g 重力倍数，drag 阻力，floor 地面 y
// age 是这个粒子已经飞了几秒。纯函数，seek 到任何时刻都能算出正确位置
```

```js
// 例：命中点溅出的火花，各自有出生延迟和寿命
for (let i = 0; i < 7; i++) {
  const sr = rng(o.seed, 30, i);
  const life = sr.range(0.18, 0.42), dly = sr.range(0, 0.4);
  const age = t - hitTime - dly;
  if (age < 0 || age > life) continue;
  const [x, y] = flight(hitX, hitY, sr.range(70, 190), sr.range(-80, -14), age, { g: 0.35, drag: 1.8 });
  p.dot(x, y, hex("#c8f8ff"), 1 - age / life);
}
```

### 4.7 火（fire 工具箱）

```js
tongue(p, x, y, h, w, sway, t, D, n, heat, only)   // 单舌火焰
firePuff(p, x, y, k, size, seed, heat)             // 火团，k 是剩余寿命 1→0
smokePuff(p, x, y, size, u, c)                     // 烟团，u 是已过寿命 0→1
```

**`tongue` 参数**：

- `x, y` — 火舌根部（底座）
- `h` 高度像素，`w` 根部半宽
- `sway` — 顶端偏移（摆动量，用 loopNoise 算出来传入）
- `t` 时间，`D` 循环周期（两者一起保证循环无接缝）
- `n` — 变化种子（同 n 同形状序列）
- `heat` — 色带数组，**亮在前**（和外层调色板相反，注意 `C.slice().reverse()`）
- `only` — 只画某一层（0 最外暗层 … 3 白芯），多根火舌各画各的层能融合成一团

```js
// 例：三根火舌，各画最外层，融合成一团有层次的火
const C = fit(o.palette, 6).reverse();             // 亮在前
tongue(p, -3, -20, 14, 2, sway * 0.7, t, D, 1, C, 0);
tongue(p, 3, -20, 15, 2, sway * 0.7, t, D, 2, C, 0);
tongue(p, 0, -21, 22, 3.2, sway, t, D, 3, C);      // 主焰画全部层
```

### 4.8 其他分类的工具

每个 `src/fx/<分类>/_lib.js` 都被发布为全局。写特效前先看同类的现成特效怎么用，
比如 `melee/sword-slash.js`（刀光）、`critters/scarecrow2-bunny.js`（稻草人）、
`lightning/ball-lightning.js`（电球）。`pixelfx.kit` 上能看到全部名字。

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

### 想要更多？

仓库里有 246 个现成特效，全部可以这样搬：

```bash
node tools/list.mjs fire            # 按关键词过滤
cat docs/CATALOG.md                 # 全量目录（id / 尺寸 / 时长 / 描述）
node demo/make-page.mjs <分类>/<名字> --out 页面.html
```

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
