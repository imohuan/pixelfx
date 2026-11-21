# tools/rig — 骨骼与动作脚本

骨骼编辑器（editor/）配套的脚本，全部是 Node，无第三方依赖（Node 18+）。
和 pixelfx 原有的特效工具分开，避免混在一起。

## motion2actions.mjs

把动作库的 MVP 姿态流批量转成编辑器可播放的姿势 JSON。

    node tools/rig/motion2actions.mjs [--source <动作库 docs 目录>] [--out <输出目录>] [--limit N]

- 默认读 `motion-source/motion-room-main/docs`（该目录已在 .gitignore 忽略）
- 默认输出到 `editor/actions`，按分类分子目录，并写 `index.json`
- `--limit N` 只转前 N 个，用于快速试跑

## fbx2action.mjs

把单个 Mixamo FBX 动画转成一个姿势 JSON。

    node tools/rig/fbx2action.mjs <文件.fbx> [输出.json]

不传输出路径时写到 `editor/actions/<名字>.json`。
支持二进制 FBX 7.0–7.7（64 位节点偏移、小端数组、AnimationCurveNode 结构）。

## 坐标约定

输出姿势和骨骼引擎一致：

- 原点在双脚，x 向右，y 向上为负，单位是像素
- 脚踝按引擎标准离地 4px（对应 rig.js 里的 `STAND.ffy`）
- 踮脚开关只在真正抬脚跟时才打开，判断阈值来自每个动作自己的平踩基准

