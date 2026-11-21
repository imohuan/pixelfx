 # pixelfx 浏览器运行时 — 第三方集成文档
 
 把像素特效嵌进任意网页：一个 script 标签引入运行时，页面里写一个 `fx` 对象，特效就开始播放。
 不需要构建工具、不需要 npm 安装、不需要服务器，双击 HTML 也能跑。
 
 - 引入地址（CDN，推荐）：`https://cdn.jsdelivr.net/gh/imohuan/pixelfx@v0.4.3/demo/pixelfx.js`
 - 仓库：[github.com/imohuan/pixelfx](https://github.com/imohuan/pixelfx)
 - 体积：运行时约 182 KB（含全部 246 个特效的绘制代码和工具库），另有 1.9 KB 界面字体
 - 关于 npm：npm 上的 `pixelfx` 名字已被他人占用，而且本项目核心价值是免构建，
   CDN 单文件最符合目标。想自托管只需拷贝 `demo/pixelfx.js` 和 `demo/fonts/` 两个文件。
 
 ## 1. 最短上手
 
 完整可运行的页面就这么多，存成 `hello.html` 双击就能看：
 
 ```html
 <!doctype html>
 <script src="https://cdn.jsdelivr.net/gh/imohuan/pixelfx@v0.4.3/demo/pixelfx.js"></script>
 <script>
 const fx = {
   meta: {
     name: "我的火花",
     desc: "一颗会呼吸的电火花。",
     size: [96, 80],
     origin: [48, 60],
     duration: 1.6,
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
 
 ## 2. fx 对象的完整结构（TypeScript 声明）
 
 下面是 `fx` 的完整类型声明。每个字段的含义、默认值、什么时候要写，都在注释里。
 这份声明不是要你装 TypeScript——它是**配置手册**，照着注释填就行。
 
 ```ts
 interface FxEffect {
   /** 特效的元信息：画布多大、播多久、锚点在哪。必填。 */
   meta: FxMeta;
 
   /**
    * 纯函数型：画某一帧。二选一（draw 或 create）。
    * @param p    画笔，见第 3 章：p.dot / p.circle / p.glow ...
    * @param t    当前时间，单位秒。loop 时 0 ≤ t < duration；一次性时 t 会停在 duration
    * @param o    选项 = meta.options 的默认值 + 调用方覆盖后的合并结果
    */
   draw?(p: Painter, t: number, o: FxOptions): void;
 
   /**
    * 模拟型：自己维护状态。二选一。
    * @param o    同上的合并选项
    * @returns    { update(dt: number, o): void, draw(p: Painter, o): void, drawBack?(p, o): void }
    *             update 以固定 120Hz 步进，物理在任何帧率下一致
    */
   create?(o: FxOptions): {
     update(dt: number, o: FxOptions): void;
     draw(p: Painter, o: FxOptions): void;
     drawBack?(p: Painter, o: FxOptions): void;
   };
 
   /** 带小人（meta.actor）时的动作声明，见 7a 章。没有小人就不用写。 */
   act?: Act;
 
   /** 让运行时不画干净小人（你自己在 draw 里逐像素画它）。配合 meta.actor + act.onBody 用。 */
   actorAlpha?: () => number;
 }

/**
 * FxOptions：draw/create 第二个（模拟型第一个）参数 o 的类型。
 * 它没有固定形状——就是 meta.options 里声明的默认值，加上调用方覆盖后的结果。
 * 常见键的约定如下；你自定的键（radius、count、speed...）也在里面。
 */
interface FxOptions {
  /**
   * 主色带：暗→亮排列的 hex 字符串数组。
   * 特效内用 fit(o.palette, N) 取 N 阶：C[0] 最暗，C[N-1] 最亮。
   * 调用方传任意长度都会被重采样到你在 fit 里声明的 N，不会崩。
   * 例：["#3a1a10", "#c9281f", "#f2561d", "#ff8a2a", "#ffc23d", "#fff3a6"]
   */
  palette: string[];

  /** 随机种子，默认 1。同一 seed 每帧画面完全一致；界面上"换种子"按钮就是改它。 */
  seed: number;

  /** 你在 meta.options 里声明的其他键，原样出现在这里。 */
  [key: string]: unknown;

  // —— 以下是运行时注入的内部项，一般不用管 ——

  /** 特效在舞台上的摆放点（画布内 origin 的世界坐标）。chain 会改它。 */
  x: number;
  y: number;

  /** 是否水平镜像。界面的"镜像"按钮切换它。 */
  flip: boolean;

  /**
   * meta.actor 声明时才有：标准小人的像素数据，供逐像素处理（Glitch 用法）。
   * pixels 是 w*h 的颜色数组（0 = 空），mask 是 w*h 的 0/1 形状遮罩。
   * x, y 是小人在局部坐标里的左上角。需要 act.onBody: true + actorAlpha = () => 0。
   */
  actor?: { x: number; y: number; w: number; h: number; pixels: number[]; mask: Uint8Array };
}

/**
 * Painter：draw 的第一个参数 p。完整方法表见第 3 章，这里只列签名。
 * 坐标都是特效局部坐标，(0,0) 是 meta.origin。
 * c（颜色）和 a（透明度）在所有形状方法里都可以是函数——每个方法的回调参数不同，见第 3 章的表。
 */
interface Painter {
  /** 一个不透明像素。坐标可以是小数，落到最近的像素格。 */
  px(x: number, y: number, c: number): void;
  /**
   * 一个带透明度的像素。a 低于 1 时用 4×4 棋盘抖动实现——
   * 这是像素画淡出的标准做法（火花熄灭、余迹消散都用它）。
   */
  dot(x: number, y: number, c: number, a?: number): void;
  /** 真透明混合，颜色平滑过渡。只有烟、雾这类没有硬边的东西才用它。 */
  blend(x: number, y: number, c: number, a: number): void;
  /** 只往光层加光，不动颜色。配合 glow 照亮周围。 */
  light(x: number, y: number, c: number, k?: number): void;
  /** 1px 线。c/a 可以是 (u) => 值，u 是 0 起点→1 终点的进度——做拖尾、渐隐的引线。 */
  line(x0: number, y0: number, x1: number, y1: number, c: MaybeFn1, a?: MaybeFn1): void;
  /** 有宽度的圆头线段。c 是 (u, v)：u 沿线进度，v 0 中心→1 边缘——光束、手臂、杆子。 */
  beam(x0: number, y0: number, x1: number, y1: number, w: number, c: MaybeFn2, a?: MaybeFn2): void;
  /** 圆盘。c 是 (d, ang)：d 0 中心→1 边缘，ang 弧度——按方向挑明暗（左上受光的球）。 */
  circle(cx: number, cy: number, r: number, c: MaybeFnD, a?: MaybeFnD): void;
  /** 椭圆，回调同 circle。压扁的球、身体块。 */
  ellipse(cx: number, cy: number, rx: number, ry: number, c: MaybeFnD, a?: MaybeFnD): void;
  /** 圆环，w 是厚度。c 是 (v, ang)：v 0 内沿→1 外沿。冲击波。 */
  ring(cx: number, cy: number, r: number, w: number, c: MaybeFnRing, a?: MaybeFnRing): void;
  /** 弧段，a0/a1 起止角（弧度）。c 是 (u, v)：u 沿弧进度——刀光新月、扇形。 */
  arc(cx: number, cy: number, r: number, w: number, a0: number, a1: number, c: MaybeFn2, a?: MaybeFn2): void;
  /** 实心矩形。方块身体、补丁。 */
  rect(x: number, y: number, w: number, h: number, c: number, a?: number): void;
  /** 多边形（偶奇填充）。耳朵、多边形色块。 */
  poly(pts: [number, number][], c: MaybeFnXY, a?: MaybeFnXY): void;
  /** 三角形。 */
  tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: MaybeFnXY, a?: MaybeFnXY): void;
  /**
   * 像素着色器：对包围盒内每个像素调一次 fn。
   * fn(x, y, out) 返回颜色（或 0 = 不画），也可写 out.c / out.a / out.k（该像素的额外光强）。
   * 完全自定义形状的唯一出口：方块加缝线 X 眼、逐像素噪声地形。
   */
  shade(x0: number, y0: number, x1: number, y1: number, fn: (x: number, y: number, out: { c?: number; a?: number; k?: number }) => number | void): void;
  /** 径向光晕：加进光层，中心强度 k，向外衰减到 0。发光的东西先画实色再补它。 */
  glow(x: number, y: number, r: number, c: number, k?: number): void;
  /** 沿线段的光带。刀光的亮边、激光。 */
  glowLine(x0: number, y0: number, x1: number, y1: number, r: number, c: number, k?: number): void;
  /** 环形光：R 环半径，r 衰减厚度。冲击波扩散。 */
  glowRing(x: number, y: number, R: number, r: number, c: number, k?: number): void;
  /** 字符画：一个字符一个像素，"." 和空格是空。耳朵、尾巴这类轮廓特征强的部分用它最清楚。 */
  sprite(rows: string[], pal: Record<string, string>, x: number, y: number, opts?: { scale?: number; flip?: boolean; flipY?: boolean; tint?: number; a?: number }): void;
  /** 像素文字：mini 3×5 / big 5×7，可带描边和阴影。伤害数字、倒计时。 */
  text(str: string, x: number, y: number, c: number, opts?: { font?: "mini" | "big"; scale?: number; align?: "left" | "center" | "right"; outline?: number; shadow?: number; a?: number }): void;
}

// 形状方法回调里收到的参数（第 3 章有中文说明）
type MaybeFn1 = number | ((u: number) => number);                    // u: 0 起点 → 1 终点
type MaybeFn2 = number | ((u: number, v: number) => number);         // v: 0 中心 → 1 边缘
type MaybeFnD = number | ((d: number, ang: number) => number);       // d: 0 中心 → 1 边缘, ang 弧度
type MaybeFnRing = number | ((v: number, ang: number) => number);    // v: 0 内沿 → 1 外沿
type MaybeFnXY = number | ((x: number, y: number) => number);

/**
 * Act：小人的动作声明，见 7a 章。字段：
 *   onBody   特效接管小人（配合 actorAlpha = () => 0）
 *   poses    [时间秒(相对命中，负=命中前), 姿势对象, 缓动?（"snap" 瞬切）]
 *   hits     [{ t, stop(顿帧秒), shake(震动秒), amp(震幅px), push(击退px), ... }]
 * 姿势对象的全部字段（fx/bx 手、crouch 蹲、lean 倾斜、weapon+sa 武器…）见 7a 章的表。
 */
interface Act {
  onBody?: boolean;
  poses: [number, Record<string, number | boolean | string>, string?][];
  hits?: { t: number; stop?: number; shake?: number; amp?: number; push?: number }[];
  target?: { x: number };
}
 
 interface FxMeta {
   /** 标题，显示在页面最上方 */
   name: string;
   /** 描述，显示在标题下面。可省略 */
   desc?: string;
 
   /** 画布像素尺寸 [宽, 高]，必填。特效画出这个范围会被裁掉 */
   size: [number, number];
 
   /**
    * 锚点在画布内的位置 [x, y]，默认 [0, 0]。
    * 你的 draw 里 (0,0) 就是这个点。角色特效填"脚底"所在像素；
    * 冲击特效填"撞击点"；火把填"火把底座"。往上是负 y。
    */
   origin: [number, number];
 
   /** 时长（秒），必填。循环特效播完回到 0；一次性特效停在最后一帧 */
   duration: number;
 
   /** 是否循环，默认 false。也可以在界面上切换 */
   loop?: boolean;
 
   /** 帧率，默认 30。影响进度条步进和导出精灵图的帧数；渲染本身是实时的 */
   fps?: number;
 
   /** 预览背景，默认 "none"（透明，方便叠进你的页面）。可选： */
   /**   "none"   透明            "black"  纯黑           "dark"  深灰蓝 */
   /**   "ground" 石砖地面+暗空   "sky"    夜空渐变+星星   "light" 浅灰白 */
   bg?: "none" | "black" | "dark" | "ground" | "sky" | "light";
 
   /**
    * 特效自己的可调参数及默认值。调用方（或界面）传同名键即可覆盖；
    * 颜色数组长度不同会被自动重采样。在 draw/create 里从 o 上读。
    * 常见键约定：
    *   palette  主色带，暗→亮排列。特效内 fit(o.palette, N) 取 N 阶
    *   seed     随机种子，默认 1。同种子每次画面完全一样
    * 其余键随意（radius、speed、count...），名字自定。
    */
   options?: Record<string, unknown>;
 
   /**
    * 声明后舞台会画一个 24×38 像素的标准小人（骨骼驱动）。
    * 值填 2（普通小人）。配合 act 使用，见 7a 章：
    *   不写 act                小人站着不动（燃烧、中毒这类状态）
    *   act.poses               小人做动作（挥剑、拉弓）
    *   act.hits                命中顿帧+震动+击退
    *   act.onBody + actorAlpha 特效接管小人，逐像素画它
    */
   actor?: number;
 }
 ```
 
 ### options 怎么配置（举例）
 
 `options` 是特效暴露给调用方的"旋钮"。你在 meta 里声明默认值，使用者传同名键覆盖。
 
 ```js
 const fx = {
   meta: {
     name: "火球",
     size: [120, 90], origin: [30, 70], duration: 0.9, fps: 30,
     options: {
       // 主色带：暗→亮。调用方可以整体换色，比如换成冰蓝色
       palette: ["#3a1a10", "#c9281f", "#f2561d", "#ff8a2a", "#ffc23d", "#fff3a6"],
       // 随机种子。同一 seed 画面完全一致；界面上点"换种子"就是改这个
       seed: 4,
       // 自定参数：名字随意，在 draw 里从 o 上读
       radius: 14,       // 火球半径
       count: 24,        // 火花数量
     },
   },
   draw(p, t, o) {
     // o = { palette, seed, radius, count }（使用者覆盖过的）
     const C = fit(o.palette, 6);      // 自动取 6 阶
     const R = new Rng(o.seed);
     for (let i = 0; i < o.count; i++) { /* ... */ }
   },
 };
 
 // 使用方覆盖：换色 + 调参
 pixelfx.play(canvas, fx, {
   palette: ["#101828", "#2b4a6b", "#4a7fa8", "#7fc0dc", "#b8e4f5", "#ffffff"],  // 变成冰球
   radius: 20,
 });
 ```
 
 ### actor 怎么配置（举例）
 
 `actor` 声明"这个特效需要一个小人"。三种情况：
 
 ```js
 // 情况 1：小人站着不动，特效画在他身上（燃烧、中毒、冰冻等状态）
 const fx = {
   meta: { name: "燃烧", size: [80, 80], origin: [40, 66], duration: 2, loop: true, actor: 2 },
   draw(p, t, o) { /* 只画火焰，小人是运行时画的 */ },
 };
 
 // 情况 2：小人做动作，特效配合（挥剑、射箭）
 const fx = {
   meta: { name: "挥剑", size: [136, 104], origin: [44, 92], duration: 0.75, actor: 2 },
   draw(p, t, o) { /* 刀光出现在 t=0 的命中帧 */ },
 };
 export const act = {
   poses: [[-0.3, AIM], [0, CUT, "snap"], [0.5, REST]],   // 详见 7a 章
 };
 
 // 情况 3：小人自己就是画布（Glitch 故障效果）
 const fx = {
   meta: { name: "Glitch", size: [88, 64], origin: [44, 54], duration: 2.4, loop: true, actor: 2 },
   draw(p, t, o) { /* 逐像素改写 o.actor 的像素 */ },
 };
 export const act = { onBody: true, poses: [...] };
 export const actorAlpha = () => 0;   // 运行时不画干净小人
 ```
 
 ## 3. 两种形态怎么选
 
 ```js
 const fx = { meta, draw };     // 纯函数型：每帧只由 t 决定，可精确 seek
 const fx = { meta, create };   // 模拟型：自己维护状态（粒子、碎片、烟雾）
 ```
 
 - **形状是 t 的函数**（光环、电球、水流、火把）→ `draw`。天然循环、可精确 seek、无内存。
 - **有惯性/会积累状态**（爆炸碎片、烟、火花溅射）→ `create`。运行时以 120Hz 固定步进 update。
 
 也可以 `window.fx = {...}` 显式声明。给 `<body>` 加 `data-pixelfx-manual` 则不会自动挂载，
 由你自己调 `pixelfx.play(canvas, fx)`。
 
 ## 3a. 坐标系
 
 `(0, 0)` 是 `meta.origin`。往右 x 正、往下 y 正，1 单位 1 像素。
 角色特效一律朝右画，朝左由界面的镜像按钮翻转整帧。
 
 ## 3b. 时间
 
 `t` 是秒。**每一帧只由 t 决定**，没有上一帧残留：进度条可拖到任意时刻，同一时刻重画结果一致。
 随机一律用 `rand`/`rng`/`Rng`（种子来自 `o.seed`），不要用 `Math.random()`，否则 seek 不一致。
 
