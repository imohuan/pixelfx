# pixelfx demo

一个模板：`index.html` 里只有一段特效代码，界面全部由 `pixelfx.js` 生成。

```
demo/
  index.html       模板页（当前是 src/fx/lightning/ball-lightning.js）
  pixelfx.js       打包产物，182 KB
  fonts/           界面字体，构建时自动复制
  build.mjs        构建：src/entry.js → pixelfx.js
  make-page.mjs    把任意 src/fx 特效写成 index.html
  verify.mjs       不开浏览器，直接跑页面里的特效并数像素
  src/
    entry.js       入口：发布全局工具名，自动挂载 fx
    player.js      播放器
    ui.js          整个界面（标题、舞台、按钮、进度条、说明）
    kit.js         构建时自动生成，收集所有分类的 _lib
  PIXEL-RULES.md   像素画法规则
```

页面本身就是模板，只有两行结构：

```html
<!doctype html>
<script src="pixelfx.js"></script>
<script>
// src/fx/lightning/ball-lightning.js 的内容，import 行去掉，export 去掉
const meta = { name: "Ball lightning", size: [136, 104], origin: [68, 92], duration: 4, loop: true };
function draw(p, t, o) { /* … */ }
</script>
```

不需要写 `pixelfx.mount()`，也不需要 `<canvas>`：入口脚本在 DOM 就绪后自己找到页面里的 `meta` + `draw`
（或 `meta` + `create`），建好界面并开始播放。

## 换成别的特效

```bash
node demo/make-page.mjs                    # 默认 lightning/ball-lightning
node demo/make-page.mjs fire/torch
node demo/make-page.mjs critters/bat --out bat.html
```

它把 `src/fx/<id>.js` 原样搬过来，只去掉 `import` 行和 `export` 关键字，别的都不改。
所以改一个特效的样子，改 `src/fx` 里的文件，再重新生成页面。

## 重新打包

```bash
node demo/build.mjs        # demo/pixelfx.js + demo/fonts/
node demo/verify.mjs       # 跑一遍页面里的特效，确认画得出来
```

打开页面：

```bash
node tools/serve.mjs       # http://localhost:8080/demo/
```

`index.html` 也能直接双击打开。

## 页面上的东西

标题、描述、舞台、重播 / 暂停、背景、缩放、镜像、精灵图导出、进度条、信息表，全部由 `src/ui.js` 生成，
样式按 `docs/UI-STYLE.md`：黑底、无圆角、1px 边框、mono 小字、品牌粉只做点缀。

字体 `Patch Pixel` 随包一起发布，路径相对 `pixelfx.js` 自己解析，所以页面放在任何目录都能加载。

## 工具名

`pixelfx.js` 加载后，`src/core` 和 `src/fx/*/_lib.js` 里的名字都是全局的：
`fit` `clamp` `hex` `mix` `lerp` `rand` `rng` `Rng` `Particles` `Lights` `Grid` `shadow`
`zigzag` `stroke` `crackle` `flight` `VOLT` `PLASMA` `WHITE` `TAU` …
所以特效文件把 `import` 去掉就能直接用。完整列表在 `pixelfx.kit`。

## 自己驱动

要在自己的页面里控制，而不是用生成的界面：给 `<body>` 加 `data-pixelfx-manual`，
然后 `pixelfx.shell(fx)` 或 `pixelfx.play(canvas, fx, { scale: 4 })`。
