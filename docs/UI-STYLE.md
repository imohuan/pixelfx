# UI 风格指南（提炼自 gallery）

本项目所有网页 UI（gallery、编辑器、以后新加的工具页）共用这一套风格。
写新页面前先读这里，变量和组件直接照抄，不另起炉灶。

## 主题

单一暗色主题，页面永远黑底，不做浅色模式。

| 变量 | 值 | 用途 |
|---|---|---|
| --ground | #000000 | 页面底色 |
| --panel | #111111 | 代码块底色 |
| --stage | #15131d | 画布、舞台底色 |
| --ink | #ffffff | 主文字 |
| --quiet | #999999 | 次要文字 |
| --line | #333333 | 边框 |
| --patch | #f53cd1 | 品牌色，只做少量点缀 |

## 字体

- 标题：Patch Pixel（仓库内 `gallery/fonts/PatchPixel-Regular.woff2`，像素风）
- 正文：Funnel Sans（Google Fonts）
- 标签、数字、代码：Red Hat Mono（Google Fonts），11–13px，letter-spacing 0.04em

## 组件

- chip / btn：mono 小字按钮，1px --line 边框、透明底、无圆角；悬停边框变 --quiet；
  选中（aria-pressed="true"）时反色（白底黑字）。
- 舞台 .stage：--stage 底色，canvas 宽 100%，image-rendering: pixelated。
- 粘性工具条 .bar：黑底，底部 1px --line 边框。
- 代码块 pre：--panel 底，1px --line 边框，12px mono。
- facts 表：两列 dl，dt 用 --quiet，dd 数字用 tabular-nums。

## 布局

- 内容最大宽 1240px 居中；网格 gap 12px；详情页左画布、右 340px 信息栏。
- 悬停反馈只用边框和颜色变化，不用阴影；圆角一律 0。
- 窄屏（<900px）两栏并成一栏。

## 交互

- focus-visible：2px 白色外框。
- 不做过渡动画，状态切换即时。

