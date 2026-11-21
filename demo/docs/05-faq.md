
## 7a. act：小人的动作是怎么动的
 
 特效分两类：**纯特效**（爆炸、火把——画布上只有特效本身）和**带角色的特效**（挥剑、射箭、
 被击中——需要一个小人和特效配合：小人挥剑，刀光才跟着出现）。
 
 `act` 描述的就是这个小人的动作。运行时有一个内置的 24×38 像素标准小人（带骨骼），
 `meta.actor: 2` 声明要它出场，`act` 告诉它做什么。
 
 ### 时间轴：相对命中帧，负数在前
 
 ```js
 export const act = {
   poses: [
     [-0.5, REST],           // 命中前 0.5 秒：站立
     [-0.3, AIM],            // 前 0.3 秒：举弓瞄准
     [0.16, DRAWN],          // 拉满弓，屏息
     [0.56, LOOSED, "snap"], // 撒放！"snap" = 瞬间切换，不做插值
     [1.9, REST],            // 收势
   ],
   hits: [
     { t: 0.8, stop: 0.07, shake: 0.12, amp: 2, push: 2.2 },
   ],
 };
 ```
 
 - **poses**：`[时间, 姿势, 缓动]`。时间是相对命中的秒数——**负数在命中前，0 是命中帧**。
   运行时在两个姿势之间平滑插值；传 "snap" 就跳过插值，一帧切到位（撒放、受击抽搐用）。
 - **hits**：命中事件。`stop` 顿帧秒数（画面冻结，打击感的来源）；`shake` + `amp`
   画面震动时长和幅度；`push` 敌人被击退的距离。
 
 ### 姿势对象的字段（对应小人的骨骼）
 
 | 字段 | 含义 |
 | --- | --- |
 | `x, y` | 脚的位置（相对特效原点） |
 | `crouch` | 蹲多深（臀部下降像素） |
 | `lean` | 脊柱前倾（+）/后仰（-） |
 | `hx, hy` | 头的滚动、点头 |
 | `fx, fy` | 近手（右手）位置；`bx, by` 远手 |
 | `ffx, ffy` / `fbx, fby` | 近脚 / 远脚 |
 | `turn` | 胸口朝向（弧度）；`yaw` 整个身体绕脚转（0 朝右，π 朝左） |
 | `weapon` + `sa` | 手持武器及在屏幕上的角度（0 指向前方） |
 | `pull` / `nocked` | 弓已拉满 / 箭已上弦（射箭用） |
 | `ghost` | 残影（快速挥动时留下） |
 
 完整字段表在 `src/core/poses.js` 顶部注释。手臂骨长约 15px、腿 17px，
 骨骼不会拉伸——动作夸张靠移动身体（x/crouch/lean），不要把手伸到够不着的位置。
 
 ### 三种用法
 
 ```js
 // 1. 只要小人站着不动：meta 里加 actor: 2，不写 act。适合状态类（燃烧、中毒、冰冻）
 meta: { actor: 2, ... }
 
 // 2. 小人做动作：写 act.poses。特效的 draw 里用 t 和姿势时间轴对齐（挥剑的刀光在命中帧出现）
 export const act = { poses: [[-0.3, AIM], [0, CUT, "snap"], [0.5, REST]] };
 
 // 3. 加打击感：act.hits 声明命中事件，运行时自动执行顿帧+震动+击退
 export const act = { poses: [...], hits: [{ t: 0, stop: 0.07, shake: 0.12, amp: 2 }] };
 ```
 
 ### 特殊用法：接管小人（Glitch 案例）
 
 ```js
 meta: { actor: 2, ... }        // 声明要小人
 export const act = { onBody: true, poses: [...] };   // 姿势照常驱动身体
 export const actorAlpha = () => 0;                   // 运行时不再画干净小人
 
 // draw 里，o.actor 是小人的像素数据：{ x, y, w, h, pixels, mask }
 // 你逐像素重画它：撕裂、RGB 分离、色块噪声——小人怎么坏完全由你决定
 export function draw(p, t, o) {
   const A = o.actor;
   for (let my = 0; my < A.h; my++)
     for (let mx = 0; mx < A.w; mx++) {
       const c = A.pixels[my * A.w + mx];
       if (c) p.px(A.x + mx + tearOffset, A.y + my, mix(c, RED, 0.6));
     }
 }
 ```
 
 ### 案例里的 act 对照
 
 | 案例 | act 做了什么 |
 | --- | --- |
 | Critical hit | 没有小人——纯命中特效，不需要 act |
 | Glitch | `onBody: true` + 姿势抽搐时间轴 + `actorAlpha = 0` 接管小人，逐像素画故障 |
 | Hit spark | 没有小人——纯命中特效 |
 
 带小人完整动作的参考：`moves/arrow-shot`（搭弓-拉弦-撒放-箭飞-命中，全套）。
 `node demo/make-page.mjs moves/arrow-shot --out arrow.html` 生成页面看完整效果。

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
