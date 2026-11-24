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
| src/components/ | 模板单元：图层面板 / 画布 / 时间轴 / 属性面板 |
| engine.js | 渲染引擎：纯逻辑，时间 → 画布像素。不含任何 UI DOM |
| style.css | 布局与时间轴样式（配色走 kit.css 的 M3 token） |
| （分割面板） | 左 / 底部 / 右三处都可拖拽，用的是 kit 的 KitSplit 组件 |
| vendor/ | 本地化的 Vue、kit 组件库、字体（离线可用） |
| serve.mjs | 静态服务 + 项目 JSON 保存/载入接口 |
| verify-cdp.mjs | 无头 Chrome CDP 自动化验证脚本（node anim-editor/verify-cdp.mjs） |

## 界面

顶栏：载入「冰标枪 / 三连斩」两个示例，保存、载入、导出 JSON。

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

**排布与拖拽规则见 [TIMELINE.md](TIMELINE.md)**（图层与行的区别、两种拖拽场景、参考框、注意事项）。

- 工具栏：上一帧 / 播放 / 下一帧 / 停止，时间、帧号、FPS、总时长、已选数量、加轨道
- 标尺是独立一行，只跟着下方轨道区的横向滚动位移，永远不会和轨道错位
- 左侧轨道头是独立一列，跟着纵向滚动位移；点击轨道头会选中该轨道第一个标签
- 片段：拖动中间换时间、可跨轨；拖两端 8px 改长短；默认吸附到帧，按住 Alt 关闭吸附
- 红色小三角是 HIT 命中帧；黄色竖线是播放头
- Ctrl + 滚轮在时间轴上以鼠标位置为锚点缩放

右侧属性面板：内容随选中标签类型变化。时间、轨道、位置、缩放、角度、种子、配色、武器、绑定对象、判定框……每个影响画面的参数都在这里能改，没有藏在代码里的行为。

## 数据模型

    project = {
      duration, fps,
      tracks: [ { id, name } ],
      clips:  [ { id, trackId, type, t, until, ... } ]
    }

type 为 character | fx | target | state。state 的 bindTo 决定叠加态作用在谁身上（靶子 id、角色 id，或 "character" 表示任意角色）。

## 渲染

离屏世界画布 1:1 绘制，最后用最近邻放大贴到屏幕，保证像素硬边。

- 角色：posed(poseAt(...)) 得到每帧像素，叠加态用颜色混合上色
- 靶子：Target 自己维护摆动、稻草、冰冻皮肤
- 特效：每个标签独立离屏缓冲；片段比特效本身长时自动循环

## 浏览器自动化

window.__editor 暴露 time / project / select / setTime / step / togglePlay / ready，
window.__layout 暴露面板宽高（left/right/canvas/stage/timeline），方便脚本验证。

