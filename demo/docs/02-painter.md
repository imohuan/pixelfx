
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
