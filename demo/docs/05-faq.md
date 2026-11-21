
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
