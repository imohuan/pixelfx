
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

