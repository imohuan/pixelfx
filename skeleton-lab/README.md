# skeleton-lab — 骨骼核心逻辑研究区

这里是从 pixelfx 搬出来的角色骨骼系统，原封不动，方便你自己研究、修改、加物理效果。

## 文件

- `core/rig.js` — **骨骼核心**（28KB，最重要）。骨骼定义、IK 求解、像素渲染全在这一个文件。
- `core/math.js` — 数学工具（向量在 rig.js 内部另有一套，这里主要是缓动、噪声、随机数）。
- `core/color.js` — 颜色工具（rig.js 只用到 `hex()` 一个函数）。
- `core/actor.js` — 默认角色皮肤（站立姿势的像素图 HERO2、调色板 DUMMY_PAL）。
- `view.mjs` — 骨架查看器，把解出的关节画成 PNG。

## 快速上手

```bash
# 看站立姿势的骨架 + 身体像素图
node skeleton-lab/view.mjs

# 换姿势
node skeleton-lab/view.mjs swing
node skeleton-lab/view.mjs kick
node skeleton-lab/view.mjs jump
```

输出在 `skeleton-lab/out/`，左边是骨架（黄色点=关节），右边是身体像素。

## 在自己的代码里用

```js
import { posed, skeleton, STAND } from "./core/rig.js";

// 姿势 = 只说手和脚的位置（y 负数=向上），其他关节自动算
const pose = { ...STAND, fx: 24, fy: -19, weapon: "sword", sa: 0.6 };

// 拿像素（画到画布上）
const body = posed(pose);
for (let i = 0; i < body.n; i++) {
  // body.xs[i], body.ys[i] 是局部坐标（脚=0,0，y 向下）
  // body.color[i] 是 RGBA 数字
}

// 拿关节位置（做自己的物理/跟随效果）
const sk = skeleton(pose);
// sk.joints.handN = [x, y, z]  近手位置
// sk.bones = [["pelvis","waist"], ...]  骨头列表
```

## 骨骼设计（rig.js 重点标注）

想改尺寸、比例、加部件，从这三处入手：

### 1. 骨骼尺寸表 `M`（约第 30 行）

```js
const M = {
  pelvis: 19.7,   // 骨盆离地高度
  spine1: 2.8,    // 腰椎长度
  spine2: 4.6,    // 胸椎长度
  shoulderUp: 2.5, shoulderOut: 5.9,  // 肩膀相对胸的偏移
  neckUp: 4.0, headUp: 3.1,           // 脖子、头
  hipDown: 1.1, hipOut: 2.8,          // 胯相对骨盆的偏移
  thigh: 8.6, shin: 8.3,              // 大腿、小腿
  upper: 7.6, fore: 7.4,              // 大臂、小臂
  turn: 36 * DEG,                     // 默认转身角度
};
```

改这里 = 改骨架比例。例如做 48px 高的角色，全部数字 ×2。

### 2. 身体粗细 `drawBody()`（约第 150 行起）

每个部位是球体/胶囊/椭球，半径写在 `sphere()`、`sweep()`、`ellipsoid()` 的调用参数里。
骨头变长后，这里也要跟着放大，不然身体像竹竿。

### 3. 深度缓冲 `BW/BH/OX/OY`（约第 100 行）

```js
const BW = 300, BH = 240, OX = 150, OY = 180;
```

画布大小和脚的原点位置。角色放大后记得检查别超出。

## 怎么加物理骨骼（自己实现）

现在的骨架是**纯运动学**：每帧独立求解，没有弹簧/惯性。加物理的思路：

```js
// 1. 每帧从 skeleton(pose) 拿到关节位置
const sk = skeleton(pose);

// 2. 对想要的骨头末端（如头发梢、披风下摆），自己维护一个 verlet 点
//    verlet: 新位置 = 当前位置 + (当前位置 - 上一帧位置) * 阻尼 + 重力 * dt²
const pts = [];  // { x, y, px, py } 当前和上一次位置
function verlet(p, dt, gravity = 400, damping = 0.98) {
  const vx = (p.x - p.px) * damping;
  const vy = (p.y - p.py) * damping;
  p.px = p.x; p.py = p.y;
  p.x += vx; p.y += vy + gravity * dt * dt;
  return p;
}

// 3. 每帧把 verlet 点"拉回"骨架固定点附近（距离约束）
//    anchor = sk.joints.head 之类
function constrain(p, anchor, maxDist) {
  const dx = p.x - anchor[0], dy = p.y - anchor[1];
  const d = Math.hypot(dx, dy);
  if (d > maxDist) { p.x = anchor[0] + dx/d*maxDist; p.y = anchor[1] + dy/d*maxDist; }
}
```

这是最简物理骨骼（verlet + 距离约束），加在骨架求解**之后**，不改 rig.js 本身。
想要更硬核的（角动量、关节扭矩），需要自己写完整的物理求解器，rig.js 提供关节坐标做输入。

## 依赖关系

```
rig.js
  ├─ color.js  (只用了 hex)
  └─ actor.js  (只要 DUMMY_PAL，用于调色板)
actor.js
  └─ color.js  (hex)
math.js   ← rig.js 其实没 import 它，向量是 rig.js 内部自己写的
```

所以 `rig.js + actor.js + color.js` 三个文件就能独立跑，math.js 是备用工具箱。
