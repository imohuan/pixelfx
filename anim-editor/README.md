# anim-editor — 动作特效编辑器

在一条多轨时间轴上编排「角色动作 + 特效 + 靶子 + 叠加态」，全部在浏览器里跑，不需要编译。

## 启动

    node anim-editor/serve.mjs        # http://localhost:8610/

serve.mjs 的 /pixelfx/* 路由映射到仓库的 src/，特效和骨骼直接复用主仓库代码。

## 文件

| 文件 | 作用 |
| --- | --- |
| index.html | Vue 模板：顶栏 / 标签库 / 画布 / 时间轴 / 属性面板 |
| app.js | UI 组装：composable 组合、测试钩子（逻辑在 src/composables/*，模板在 src/components/*） |
| src/composables/ | 逻辑单元：项目/播放/时间轴/gizmo/面板尺寸/文件/图层重命名 |
| src/components/ | 模板单元：图层面板 / 画布 / 时间轴 / 右侧面板（属性 · 资源 · 资源标签） |
| src/components/MasonryGrid.js | 通用瀑布流容器：固定 2 / 3 列，只负责排布，卡片内容走插槽 |
| src/components/ResourceCard.js | 瀑布流里的单张卡：特效/动作实时预览、武器静态图、图标 |
| src/components/ResourceTab.js | 「资源」tab：只显示当前标签能用的资源 |
| src/lib/labels.js | 名称规则：id 一律翻成中文；角色名 = 角色 · 动作 · 武器 |
| engine.js | 渲染引擎：纯逻辑，时间 → 画布像素。不含任何 UI DOM |
| style.css | 布局与时间轴样式（配色走 kit.css 的 M3 token） |
| （分割面板） | 左 / 底部 / 右三处都可拖拽，用的是 kit 的 KitSplit 组件 |
| vendor/ | 本地化的 Vue、kit 组件库、字体（离线可用） |
| serve.mjs | 静态服务 + 项目 JSON 保存/载入接口 |
| verify-cdp.mjs | 无头 Chrome CDP 自动化验证脚本（node anim-editor/verify-cdp.mjs） |

## 界面

顶栏：预设按钮（读 `data/presets/*.json`，可自行增删）、保存、载入、导出 JSON、**导出脚本**。

顶部预设和「载入」走同一条路：都读一个 JSON、交给 `applyProject` 统一换算成帧、重排行号、
加载依赖的特效，区别只是文件不同。新增预设只要往 `data/presets/` 放文件，再登记到
`data/presets/index.json`，不用改代码。

左侧图层面板：一层对应时间轴的一条轨道（同一份数据）。整卡可拖拽排序（vue-draggable-plus
带换位动画，顺序决定画布前后层级：列表越靠上越在前），眼睛控制图层显隐
（隐藏后画布上该层全部片段不渲染、不可点选），F2 或双击重命名，计数显示层内片段数。

一个标签就是时间轴上的一段，归属某个图层。四种类型——

- 角色标签：引用 moves/* 动作脚本（姿势时间轴），可覆盖武器
- 特效标签：引用 src/fx/** 的任意特效，锚点相对角色
- 靶子标签：稻草人存在的时间段
- 状态标签：叠加态（冰冻 / 变色 / 颤抖），必须绑定到某个靶子或角色

中间画布：滚轮缩放、拖拽平移、按 0 自动取景。角色和靶子可以直接拖。

底部时间轴（结构参照 timeline-editor）：

**时间以帧为唯一真值。** 数据里存的是整数帧（`clip.f` / `clip.fEnd` / `project.durationFrames`），
秒是按帧率算出来的（`t = f / fps`），只用于显示和导出。因此不做「秒 → 帧 → 秒」的往返，
不会越存越偏。总时长显示在工具栏，由总帧数和帧率推出。

- 帧率（FPS）保存在工程文件里，载入时读文件的值；老文件没写帧率会明确提示「按 24 换算」。
- 改帧率是换格子：动作的真实时长不变，24 → 30 只是采样变细，片段最多挪半帧，特效不会被截短。
- 属性面板的开始 / 结束直接填帧号，下面一行显示对应的秒。

**排布与拖拽规则见 [TIMELINE.md](TIMELINE.md)**（图层与行的区别、两种拖拽场景、参考框、注意事项）。

- 工具栏：上一帧 / 播放 / 下一帧 / 停止，时间、帧号、FPS、总时长、已选数量、加轨道
- 标尺是独立一行，只跟着下方轨道区的横向滚动位移，永远不会和轨道错位
- 左侧轨道头是独立一列，跟着纵向滚动位移；点击轨道头会选中该轨道第一个标签
- 片段：拖动中间换时间、可跨轨；拖两端 8px 改长短；默认吸附到帧，按住 Alt 关闭吸附
- 红色小三角是 HIT 命中帧；黄色竖线是播放头
- Ctrl + 滚轮在时间轴上以鼠标位置为锚点缩放

名称规则（时间轴、左侧列表、属性面板都用同一套）：

- 角色标签显示「角色名 · 动作中文名 · 武器中文名」，例如「小法师 · 掷冰标枪 · 长剑」。
- 特效标签显示特效的中文名；手动改过就用手动名，清空后自动回到中文默认名。
- 换动作 / 武器 / 特效时名字会跟着换，不会残留上一个资源的中文名。

右侧面板分三个标签：

- **属性**：内容随选中标签类型变化。时间、轨道、位置、缩放、角度、种子、配色、绑定对象、判定框……每个影响画面的参数都在这里能改。
- **资源**：瀑布流只列出当前标签支持的资源——角色标签只有「动作脚本 / 武器」，特效标签只有「特效」，靶子和叠加态没有可换的资源。点一张卡就套到当前标签上。
- **资源标签**：全部 246 个特效的瀑布流，可拖到画布，也可单击新增或替换。

瀑布流布局与卡片渲染是两个独立组件：`MasonryGrid` 只管排布（2 / 3 列、8px 间距、重排），
卡片长什么样由 `ResourceCard` 决定，也可以换成任意自写内容。武器缩略图按两倍像素绘制，
在卡片里等比放大到看得清。

## 数据模型

    project = {
      schema: "anim-fx/2", name, slug,
      fps,                    // 编排帧率：唯一依据
      durationFrames,         // 总帧数（整数）
      duration,               // = durationFrames / fps，只读派生值
      tracks: [ { id, name } ],
      clips:  [ { id, trackId, type, f, fEnd, t, until, ... } ]
    }

`f` / `fEnd` 是整数帧，`t` / `until` 由它们算出来，不要手写。改帧相关的东西一律走
`src/lib/frames.js` 里的 `setClipFrames` / `setProjectFps` / `setProjectDurationFrames`，
别处直接赋值会让帧和秒对不上。

type 为 character | fx | target | state。state 的 bindTo 决定叠加态作用在谁身上（靶子 id、角色 id，或 "character" 表示任意角色）。

## 导出

「导出 JSON」写的是帧存储的工程文件（`schema: anim-fx/2`），可以直接被预设目录使用。

「导出脚本」把时间轴转成 pixelfx 的 chain 代码，写到 `src/fx/moves/<名字>.js`，画廊和
`node tools/render.mjs` 立刻能用。规则：

- 只导出秒（chain 的契约），但源码里每个时间写成 `F(帧号)`，`const FPS = <工程帧率>`。
- 文件头 meta 带 `arrangement: { fps, frames }`，接收方即使换渲染帧率也不会变速。
- 角色动作按关键帧平移（单角色），多角色时按 12fps 采样合并；命中来自状态片段。
- 画布尺寸和锚点不是猜的：导出时真的跑一遍完整动作，量出像素范围再回填。
- 循环片段（比特效本身长）会展开成多段 cue 并提示；缩放 / 旋转 / 伤害无对应字段，也提示。

## 自检

    node anim-editor/verify.mjs        # 帧换算、预设、改帧率、老文件、导出脚本
    node anim-editor/compare.mjs ice-lance.json      # 逐像素对拍编辑器与导出脚本
    node anim-editor/compare.mjs sword-combo.json
    node anim-editor/verify-cdp.mjs   # 无头浏览器实测预设 / 拖拽 / 导出

## 渲染

离屏世界画布 1:1 绘制，最后用最近邻放大贴到屏幕，保证像素硬边。

- 角色：posed(poseAt(...)) 得到每帧像素，叠加态用颜色混合上色
- 靶子：Target 自己维护摆动、稻草、冰冻皮肤
- 特效：每个标签独立离屏缓冲；片段比特效本身长时自动循环

## 浏览器自动化

window.__editor 暴露 time / project / select / setTime / step / togglePlay / ready，
window.__layout 暴露面板宽高（left/right/canvas/stage/timeline），方便脚本验证。

