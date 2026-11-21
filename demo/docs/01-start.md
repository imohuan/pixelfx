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
