// 渲染引擎（纯逻辑，不碰 UI DOM，只画 canvas）
// UI 层：app.js（Vue + kit-ui）。引擎负责：时间 → 画布像素 + 靶子状态 + 特效实例

import {
  createFrame, clearFrame, createFx, createAct, composite, posed, posedParts, actBounds, STAND,
  poseAt, PAL, Target, backdrop,
} from "/pixelfx/core/index.js";

// 导出脚本时要用到的测量函数，统一从这里取，避免 app 层再引一次 core。
export { actBounds };
export const palettes = PAL;

// 导出脚本时用：在内存里拼一个临时模块，量出画面范围（返回模块导出）。
export async function measureMoveSource(source, totalFrames, fps) {
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  try {
    const mod = await import(url);
    return measureActModule(mod, totalFrames, fps);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 让模块跑完整段动作，量出真实像素范围；返回 { size, origin, bounds }（局部坐标）。 */
export function measureActModule(mod, totalFrames, fps) {
  const seconds = totalFrames / fps;
  const pad = 6;
  // 探测画布要足够大，避免粒子飞出边界被裁掉；最终尺寸由真实像素决定
  const probeW = 900, probeH = 480;
  const midX = 220, groundY = 400;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const frame = createFrame(probeW, probeH, -midX, -groundY);
  // 人物站在局部坐标原点；frame.ox/oy 把它摆到探测画布中间
  const act = createAct(mod, { x: 0, y: 0 });
  const steps = Math.max(2, Math.round(seconds * 60));
  for (let i = 0; i <= steps; i++) {
    clearFrame(frame);
    act.draw(frame, { body: true, target: true });
    for (let y = 0; y < probeH; y++) {
      for (let x = 0; x < probeW; x++) {
        const j = y * probeW + x;
        if (!((frame.color[j] >>> 24) | (frame.light[j] & 0xffffff))) continue;
        const wx = x + frame.ox, wy = y + frame.oy;
        if (wx < minX) minX = wx;
        if (wx > maxX) maxX = wx;
        if (wy < minY) minY = wy;
        if (wy > maxY) maxY = wy;
      }
    }
    if (i < steps) act.update(1 / 60);
  }
  if (!isFinite(minX)) return { size: [120, 120], origin: [60, 100], bounds: { x0: -40, x1: 40, y0: -80, y1: 0 }, empty: true };
  const x0 = Math.floor(minX), x1 = Math.ceil(maxX), y0 = Math.floor(minY), y1 = Math.ceil(maxY);
  return {
    size: [Math.max(24, x1 - x0 + 1 + pad * 2), Math.max(24, y1 - y0 + 1 + pad * 2)],
    origin: [-x0 + pad, -y0 + pad],
    bounds: { x0, x1, y0, y1 },
  };
}

export const FX_TAGS = [
  "arcane/spell-charge", "ice/ice-lance", "ice/snowflake-burst", "ice/frost-nova",
  "melee/sword-slash", "melee/double-slash", "melee/heavy-cleave", "melee/spear-sweep",
  "explosions/small-explosion", "fire/torch", "lightning/lightning-strike",
  "impacts/hit-spark", "impacts/hit-flash", "impacts/blunt-hit", "impacts/ground-slam",
];
export const MOVE_TAGS = [
  "moves/ice-lance-throw", "moves/sword-combo", "moves/fireball-throw", "moves/dash-strike",
  "moves/earth-stomp", "moves/ground-pound", "moves/arrow-shot", "moves/lightning-call",
  "moves/holy-smite", "moves/meteor-call", "moves/pistol-shots", "moves/rocket-launcher",
];
/**
 * 全量动作脚本：从特效注册表（src/fx/index.js，工具自动生成）动态取——
 * 项目里凡是带 act（姿势时间轴）的特效都是动作脚本，不只 moves/ 下的 12 个。
 * 加载后按类目排序，新写的动作（任何分类）不用改这里就会出现在编辑器里。
 */
export async function loadAllActTags() {
  const reg = await import("/pixelfx/fx/index.js");
  const tags = Object.keys(reg.effects).filter((id) => reg.effects[id] && reg.effects[id].act);
  return tags.sort((a, b) => a.localeCompare(b));
}
export const isMoveFx = (id) => String(id || "").startsWith("moves/");
let FXLIB = null;
/** 资源库：全量注册表（effects + categories），右侧「资源标签」tab 用。 */
export async function loadFxLibrary() {
  if (FXLIB) return FXLIB;
  const reg = await import("/pixelfx/fx/index.js");
  FXLIB = { effects: reg.effects ?? {}, categories: reg.categories ?? [] };
  return FXLIB;
}
export const SKIN_NAMES = ["ice", "char", "poison", "shadow", "holy", "red", "shock", "flash"];
export const WEAPONS = ["sword", "greatsword", "dagger", "spear", "hammer", "scythe", "claw", "bow", "pistol", "launcher", "handle"];
export const SKIN_TINT = {
  ice: [168, 232, 255], char: [58, 30, 24], poison: [88, 196, 58],
  shadow: [58, 26, 112], holy: [255, 244, 192], red: [255, 32, 64],
  shock: [143, 214, 255], flash: [255, 255, 255],
};

const FX = new Map();
export function loadedFx(id) { return FX.get(id); }
export async function loadFx(id) {
  if (!id) return null;
  if (!FX.has(id)) FX.set(id, await import("/pixelfx/fx/" + id + ".js"));
  return FX.get(id);
}
export function paletteOf(name) {
  if (!name || name === "default") return null;
  const key = { 火: "fire", 冰: "ice", 雷: "electric", 毒: "poison", 金: "gold", 血: "blood", 暗: "shadow", 圣: "holy" }[name] ?? name;
  return PAL[key] ?? null;
}

const imgCache = new Map();

/** 稻草人的真实像素范围（相对脚底原点），只算一次 */
/**
 * 扫描离屏特效表面，返回这一帧可见像素的范围（相对锚点）。
 * 特效内容每帧都在变（粒子飞散、弹道前移），所以不做缓存，每次重算。
 */
export function scanSurfaceBounds(surf) {
  const { frame, origin } = surf;
  const w = frame.w, h = frame.h, C = frame.color;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = C[y * w + x];
      if (!c || (c >>> 24) < 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!isFinite(minX)) return null;
  return {
    minX: minX - origin[0], maxX: maxX + 1 - origin[0],
    minY: minY - origin[1], maxY: maxY + 1 - origin[1],
  };
}

let targetBoundsCache = null;
export function targetPixelBounds() {
  if (targetBoundsCache) return targetBoundsCache;
  const W = 200, H = 200, baseX = 100, baseY = 190;
  const frame = createFrame(W, H, 0, 0);
  const t = new Target(0, 5);
  t.draw(frame.color, W, H, baseX, baseY, false);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!frame.color[y * W + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  targetBoundsCache = {
    minX: (minX - baseX), maxX: (maxX - baseX),
    minY: (minY - baseY), maxY: (maxY - baseY),
  };
  return targetBoundsCache;
}

export function getImage(src) {
  if (!src) return null;
  if (!imgCache.has(src)) { const i = new Image(); i.src = src; imgCache.set(src, i); }
  return imgCache.get(src);
}

// ---------------- 视图 ----------------
export const view = { scale: 1.6, offsetX: 0, offsetY: 0, minScale: 0.2, maxScale: 10, userMoved: false };

/**
 * 缩略图渲染：把一块像素帧（color 缓冲）画到 canvas 上，自动裁到不透明像素范围。
 * 用在右侧属性面板的卡片选择上（武器 / 动作 / 特效）。
 */
function blitFrame(canvas, frame, opts = {}) {
  const { w, h, color } = frame;
  const img = new ImageData(w, h);
  const data = img.data;
  for (let i = 0; i < w * h; i++) {
    const c = color[i] >>> 0;
    const a = c >>> 24;
    const j = i * 4;
    data[j] = c & 255;
    data[j + 1] = (c >>> 8) & 255;
    data[j + 2] = (c >>> 16) & 255;
    data[j + 3] = a;
  }
  // 找不透明范围，居中贴到画布上
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((data[(y * w + x) * 4 + 3])) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < x0 || y1 < y0) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const pad = opts.pad ?? 4;
  const fit = Math.min((canvas.width - pad * 2) / bw, (canvas.height - pad * 2) / bh);
  // 放大时取整（像素才不糊）；缩小（大特效）就按比例缩，否则会被裁掉一角
  const scale = fit >= 1 ? Math.max(1, Math.floor(fit)) : fit;
  const dw = Math.round(bw * scale), dh = Math.round(bh * scale);

  const tmp = document.createElement("canvas");
  tmp.width = w; tmp.height = h;
  tmp.getContext("2d").putImageData(img, 0, 0);

  const g = canvas.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.drawImage(tmp, x0, y0, bw, bh, Math.round((canvas.width - dw) / 2), Math.round((canvas.height - dh) / 2), dw, dh);
}

/**
 * 实时缩略图：卡片里循环播放的一小段。
 * 用法：const h = makeFxPreview(canvas, id, { scale: 1 }); h.render(t秒); 用完 h.dispose()。
 * 内部缓存实例，每帧只做 update + draw，不会重新 import 模块。
 */
export async function makeFxPreview(canvas, id, opts = {}) {
  if (!canvas || !id) return null;
  const mod = await loadFx(id).catch(() => null);
  if (!mod) return null;
  const meta = mod.meta ?? {};
  // 卡片取景比例："auto" 按特效 meta.size 自适应（钳制 0.5~2.2），竖长的特效不再被 16:9 裁切
  const metaAspect = (() => { const [w, h] = meta.size ?? [320, 200]; return Math.min(2.2, Math.max(0.5, w / h)); })();
  const aspect = opts.aspect === "auto" ? metaAspect : (opts.aspect ?? 16 / 9);
  const pad = opts.pad ?? 1.15;

  // ---- 取景（照搬 gallery Player.layout 的思路）： ----
  // 动作：actBounds 是整个表演的范围，切掉地面以下；特效：用 meta.size。
  // 舞台 = 内容框按 pad 放大并扩展到目标比例。画布本身 = 舞台大小（1 舞台像素 = 1 特效像素），
  // 卡片上用 CSS 拉伸显示（image-rendering: pixelated），不做 drawImage 缩放。
  // bodyOnly：动作脚本卡只演人物本体（不限 moves/，任何带 act 的特效都算动作）
  const acted = !!mod.act && (isMoveFx(id) || opts.bodyOnly === true);
  const D = Math.max(0.2, meta.duration ?? 1);
  let cw, ch, px, py;
  let bgBuf = null;
  if (acted) {
    const b = { ...actBounds(mod) };
    // 动作卡：舞台贴人物本体（摄像机每帧跟随，人物始终居中）。
    // 人物大小用姿势采样（不含飞出去的抛射物），舞台不再留大片空白。
    const track = mod.act?.poses ?? [];
    let charW = 30, charH = 42;   // 默认人物尺寸
    if (track.length) {
      let x0 = 9999, x1 = -9999, y0 = 9999, y1 = -9999;
      for (let t = track[0][0]; t <= track[track.length - 1][0]; t += 1 / 12) {
        const p = poseAt(track, t);
        const r = posed(p);
        x0 = Math.min(x0, r.x0); x1 = Math.max(x1, r.x1);
        y0 = Math.min(y0, r.y0); y1 = Math.max(y1, r.y1);
      }
      charW = Math.max(20, Math.ceil(x1 - x0 + 2));
      charH = Math.max(32, Math.ceil(y1 - y0 + 2));
    }
    // 舞台 = 人物尺寸 + 2px 边距，比例跟随人物（竖屏，钳制在 0.6~0.85），
    // 人物占卡片 90% 以上，不再浪费空间
    const bodyAspect = Math.min(0.9, Math.max(0.55, charW / charH));
    let W = charW;
    let H = charH;
    if (W / H < bodyAspect) W = Math.ceil(H * bodyAspect);
    else H = Math.ceil(W / bodyAspect);
    if (H > 110) { W = Math.ceil(W * (110 / H)); H = 110; }
    cw = W; ch = H;
    // 人物脚底放卡片底部（地面离底边留 2px），头顶朝上
    py = H - 2;
    px = Math.floor(W / 2);
    bgBuf = backdrop("ground", W, H, py);
  } else {
    const [w, h] = meta.size ?? [320, 200];
    // 特效卡：画布 = meta.size 原始尺寸（不放大、不留 pad），背景铺满整张画布。
    // 这样卡片黑色区域就是特效的真实画布边界，瀑布流按这个比例排布。
    const [ox, oy] = meta.origin ?? [Math.floor(w / 2), h];
    cw = w; ch = h;
    px = ox;
    py = oy;
    // 背景：对齐 gallery——特效自带 meta.bg（默认 dark），浅色特效在暗背景上才看得清
    const bg = meta.bg ?? "dark";
    if (bg && bg !== "none") bgBuf = backdrop(bg, w, h, oy);
  }
  canvas.width = cw;
  canvas.height = ch;
  const frame = createFrame(cw, ch);
  const imgData = new ImageData(cw, ch);
  const g = canvas.getContext("2d");
  let inst = null;
  // 特效卡不画人物（meta.actor 的站位角色只属于动作演示，特效演示只要光效）
  const make = () => (acted ? createAct(mod, { x: px, y: py, seed: 1 }) : createFx(mod, { x: px, y: py, seed: 1, actor: null }));

  function renderFrame() {
    clearFrame(frame);
    try {
      // 动作卡：只画人物本体。fx:false 关掉链式编排里挂的所有子特效（武器光、弹道、爆炸都算特效）
      // 动作卡（动作宫格）：只画人物本体；特效宫格里的动作卡：人物 + 它自己的特效
      if (acted) inst.draw(frame, { target: false, fx: opts.bodyOnly !== true });
      else inst.draw(frame, null);
      composite(frame, imgData.data, bgBuf);
    } catch (e) { /* 个别特效的极端帧可能报错，跳过 */ }
    g.putImageData(imgData, 0, 0);
  }

  return {
    duration: D,
    /** 画一帧到卡片画布上 */
    paint(at) {
      const t = ((at % D) + D) % D;
      // 时间倒退（循环回开头）就重建实例，特效内部状态才不会停在末尾
      if (!inst || t < (inst._pt ?? 0) - 1e-6) { inst = make(); inst._pt = 0; }
      const dt = t - (inst._pt ?? 0);
      if (dt > 1e-6) { inst.update(dt); inst._pt = t; }
      // 摄像机跟随：动作预览时每帧把人物挪回画面中心（人物跑出框会拉走镜头）
      if (acted && inst.pose) {
        const p = inst.pose, cx = Math.round(p.x ?? 0), cy = Math.round(p.y ?? 0);
        if (cx !== px || cy !== py) inst.rebase(px, py);
      }
      renderFrame();
    },
    dispose() { inst = null; },
  };
}

/** 武器模型缩略图：只画武器本身（不带身体），和角色手里拿的形状一致。 */
export function drawWeaponThumb(canvas, weapon) {
  if (!canvas || !weapon) return;
  const pr = posedParts({ ...STAND, weapon });
  const part = pr.find((p) => p.name === "weapon");
  // posedParts 不返回范围，从像素数组自己算
  let x0 = 9999, x1 = -9999, y0 = 9999, y1 = -9999;
  if (part) for (let i = 0; i < part.n; i++) { if (part.xs[i] < x0) x0 = part.xs[i]; if (part.xs[i] > x1) x1 = part.xs[i]; if (part.ys[i] < y0) y0 = part.ys[i]; if (part.ys[i] > y1) y1 = part.ys[i]; }
  if (x1 < x0) { x0 = -14; x1 = 14; y0 = -6; y1 = 6; }
  // 画布贴内容尺寸（blitFrame 会居中缩放），武器不再缩在一张大画布的角落
  const W = Math.max(24, x1 - x0 + 5);
  const H = Math.max(16, y1 - y0 + 5);
  canvas.width = W;
  canvas.height = H;
  const frame = createFrame(W, H, Math.ceil(W / 2), Math.ceil(H / 2));
  if (part) {
    for (let i = 0; i < part.n; i++) {
      const x = Math.ceil(W / 2) + part.xs[i] - Math.round((x0 + x1) / 2);
      const y = Math.ceil(H / 2) + part.ys[i] - Math.round((y0 + y1) / 2);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      frame.color[y * W + x] = part.color[i];
    }
  }
  blitFrame(canvas, frame);
}

function paintFxFrame(mod, id, at) {
  const meta = mod.meta ?? {};
  const size = meta.size ?? [320, 200];
  const origin = meta.origin ?? [size[0] / 2, size[1] / 2];
  const frame = createFrame(size[0], size[1], -origin[0], -origin[1]);
  if (isMoveFx(id) && mod.act) {
    const inst = createAct(mod, { x: 0, y: 0, seed: 1 });
    inst.update(at);
    inst.draw(frame, { target: false });
  } else {
    const inst = createFx(mod, { x: 0, y: 0, seed: 1 });
    inst.update(at);
    inst.draw(frame, null);
  }
  return frame;
}

function coverage(f) {
  let n = 0;
  for (let i = 0; i < f.color.length; i++) if (f.color[i] >>> 24) n++;
  return n;
}

/**
 * 特效 / 动作缩略图：在几个时间点各跑一帧，挑像素最多的一帧（最能看清效果的那一下）。
 * 动作带小人，纯特效只有光效。
 */
export async function drawFxThumb(canvas, id, opts = {}) {
  if (!canvas || !id) return;
  const mod = await loadFx(id).catch(() => null);
  if (!mod) return;
  const D = mod.meta?.duration ?? 1;
  const probes = opts.probes ?? [0.18, 0.3, 0.45, 0.62, 0.8].map((k) => Math.min(D * 0.95, D * k));
  let best = null, bestN = -1;
  for (const at of probes) {
    let f;
    try { f = paintFxFrame(mod, id, at); } catch (e) { continue; }
    const n = coverage(f);
    if (n > bestN) { bestN = n; best = f; }
  }
  if (!best) return;
  blitFrame(canvas, best);
}
/**
 * 取景：把给定的一批世界坐标点（角色、靶子…）装进画面。
 * 没有点就按角色尺寸估一个默认值。
 */
export function fitView(canvas, points) {
  const h = canvas?.height || 600;
  const w = canvas?.width || 900;
  const pad = 0.12;
  const list = (points ?? []).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  let minX, maxX, minY, maxY;
  if (list.length) {
    minX = Math.min(...list.map((p) => p.x));
    maxX = Math.max(...list.map((p) => p.x));
    minY = Math.min(...list.map((p) => p.y));
    maxY = Math.max(...list.map((p) => p.y));
  } else {
    minX = -40; maxX = 240; minY = -90; maxY = 10;
  }
  // 留一点边，但不要把画面撑得太大（否则角色被缩成小点）
  const spanX = Math.max(90, (maxX - minX) * 1.12);
  const spanY = Math.max(80, (maxY - minY) * 1.18);
  const scale = Math.max(0.2, Math.min(10, Math.min((w * (1 - pad * 2)) / spanX, (h * (1 - pad * 2)) / spanY)));
  view.scale = scale;
  view.offsetX = Math.round(w / 2 - ((minX + maxX) / 2) * scale);
  view.offsetY = Math.round(h * 0.86 - maxY * scale);
  view.userMoved = false;
}
export function resetView(canvas) {
  fitView(canvas, null);
}
export function zoomAt(sx, sy, factor) {
  const ns = Math.max(view.minScale, Math.min(view.maxScale, view.scale * factor));
  if (ns === view.scale) return false;
  const k = ns / view.scale;
  view.offsetX = sx - (sx - view.offsetX) * k;
  view.offsetY = sy - (sy - view.offsetY) * k;
  view.scale = ns;
  view.userMoved = true;
  return true;
}
export function screenToWorld(sx, sy) {
  return { x: (sx - view.offsetX) / view.scale, y: (sy - view.offsetY) / view.scale };
}

// ---------------- 状态 ----------------
export function defaultProject() {
  return {
    schema: "anim-fx/2",
    name: "冰标枪",
    duration: 4.375,
    durationFrames: 105,
    fps: 24,
    tracks: [
      { id: "tr-char", name: "角色" },
      { id: "tr-fx", name: "特效" },
      { id: "tr-target", name: "靶子" },
    ],
    clips: [
      { id: "c-char", trackId: "tr-char", type: "character", f: 0, fEnd: 105, t: 0, until: 4.375, actRef: "moves/ice-lance-throw", actStart: 0, x: 0, y: 0, scale: 1, angle: 0 },
      { id: "c-charge", trackId: "tr-fx", type: "fx", f: 1, fEnd: 19, t: 0.041667, until: 0.791667, fxId: "arcane/spell-charge", from: [0, 0], to: [0, 0], scale: 1, angle: 0, seed: 1, palette: "冰", label: "聚气" },
      { id: "c-lance", trackId: "tr-fx", type: "fx", f: 19, fEnd: 27, t: 0.791667, until: 1.125, fxId: "ice/ice-lance", from: [34, -24], to: [170, -24], scale: 1, angle: 0, seed: 1, palette: "冰", label: "标枪飞行" },
      { id: "c-burst", trackId: "tr-fx", type: "fx", f: 27, fEnd: 104, t: 1.125, until: 4.333333, fxId: "ice/snowflake-burst", from: [170, -26], to: null, scale: 1, angle: 0, seed: 1, palette: "冰", label: "命中爆雪" },
      { id: "c-tgt", trackId: "tr-target", type: "target", f: 0, fEnd: 105, t: 0, until: 4.375, x: 170, y: 0 },
      { id: "c-state", trackId: "tr-target", type: "state", f: 27, fEnd: 100, t: 1.125, until: 4.166667, skin: "ice", hit: true, bindTo: "c-tgt", push: 2.4, straw: 12, shiver: 1.4, damage: 12, box: [130, -60, 80, 60] },
    ],
  };
}

/** 引擎实例：持有 project、时间、离屏缓冲、靶子 */
export function createEngine(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = false;
  const world = (() => {
    const c = document.createElement("canvas");
    c.width = 1400; c.height = 800;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.imageSmoothingEnabled = false;
    return { canvas: c, ctx: g, w: 1400, h: 800, ox: 0, oy: 0 };
  })();

  const fxInstances = new Map();
  const fxSurfaces = new Map();
  const targetSlots = new Map();
  let viewInit = false;
  let lastW = 0, lastH = 0;

  // 图层（原「轨道」升级而来）：hiddenLayers 里的 layerId 上的片段不参与渲染/命中
  const hiddenLayers = new Set();
  const layerVisible = (clip) => !hiddenLayers.has(clip.trackId);
  const clipsOf = (type) => E.project.clips.filter((c) => c.type === type && layerVisible(c));
  const clipEnd = (c) => c.until ?? (c.t + (loadedFx(c.fxId)?.meta?.duration ?? 1));
  const activeAt = (c, t) => t >= c.t - 1e-6 && t <= clipEnd(c) + 1e-6;
  const bindsTo = (stateClip, clip) => {
    const bind = stateClip.bindTo;
    if (!bind) return clip.type === "target";
    if (bind === "character") return clip.type === "character";
    return bind === clip.id;
  };
  const characterStateFor = (clip, t) =>
    clipsOf("state").find((s) => activeAt(s, t) && (s.bindTo === "character" || s.bindTo === clip.id)) ?? null;
  const poseOfClip = (clip, t) => {
    if (clip?.actRef) {
      const mod = loadedFx(clip.actRef);
      if (mod?.act?.poses) {
        const p = poseAt(mod.act.poses, t - clip.t - (clip.actStart ?? 0));
        if (clip.weapon) return { ...p, weapon: clip.weapon };
        return p;
      }
    }
    return { ...STAND, crouch: 3 };
  };
  function actionInfo(clip, t) {
    if (!clip?.actRef || !activeAt(clip, t)) return null;
    const mod = loadedFx(clip.actRef);
    if (!mod?.act?.poses) return { ref: clip.actRef, local: 0, keyFrom: null, keyTo: null };
    const local = t - clip.t - (clip.actStart ?? 0);
    const keys = mod.act.poses;
    let idx = 0;
    for (let i = 0; i < keys.length - 1; i++) if (local >= keys[i][0]) idx = i;
    return { ref: clip.actRef, local, keyFrom: keys[idx]?.[0] ?? null, keyTo: keys[idx + 1]?.[0] ?? null };
  }
  function clipSurf(clip, meta) {
    let s = fxSurfaces.get(clip.id);
    if (!s || s.fxId !== clip.fxId) {
      const size = meta?.size ?? [320, 200];
      const origin = meta?.origin ?? [size[0] / 2, size[1] / 2];
      const mk = () => {
        const frame = createFrame(size[0], size[1], -origin[0], -origin[1]);
        const c = document.createElement("canvas");
        c.width = size[0]; c.height = size[1];
        const g2 = c.getContext("2d");
        g2.imageSmoothingEnabled = false;
        return { frame, imgData: new ImageData(size[0], size[1]), canvas: c, ctx: g2 };
      };
      // 双表面：back = drawBack 层（可压到角色层之下），front = draw 层
      const a = mk(), b = mk();
      s = { ...a, origin, fxId: clip.fxId, back: a, front: b };
      fxSurfaces.set(clip.id, s);
    }
    return s;
  }
  function targetFor(clip) {
    let slot = targetSlots.get(clip.id);
    if (!slot) {
      const tw = 440, th = 260;
      const frame = createFrame(tw, th, -80, -220);
      const c = document.createElement("canvas");
      c.width = tw; c.height = th;
      const g2 = c.getContext("2d");
      g2.imageSmoothingEnabled = false;
      slot = { actor: new Target(0, 5), frame, imgData: new ImageData(tw, th), canvas: c, ctx: g2, w: tw, h: th, ox: -80, oy: -220 };
      targetSlots.set(clip.id, slot);
    }
    return slot;
  }
  function resetTargets() {
    for (const [, s] of targetSlots) { s.actor.skin = null; s.actor.lastHitKey = null; s.actor.shiver = 0; }
  }

  const E = {
    project: defaultProject(),
    time: 0,
    clipsOf, clipEnd, activeAt, resetTargets, actionInfo, characterStateFor,
    setLayerVisible(layerId, visible) { if (visible) hiddenLayers.delete(layerId); else hiddenLayers.add(layerId); },
    isLayerVisible(layerId) { return !hiddenLayers.has(layerId); },
    invalidate() { fxInstances.clear(); fxSurfaces.clear(); },
    clearTargets() { targetSlots.clear(); },

    /** 元素的真实可视包围盒（世界坐标，w/h；用于选中框和命中） */
    boundsOf(clip, t = E.time) {
      if (!clip || !layerVisible(clip)) return null;
      if (clip.type === "character") {
        const pr = posed(poseOfClip(clip, t));
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < pr.n; i++) {
          if (pr.xs[i] < minX) minX = pr.xs[i];
          if (pr.xs[i] > maxX) maxX = pr.xs[i];
          if (pr.ys[i] < minY) minY = pr.ys[i];
          if (pr.ys[i] > maxY) maxY = pr.ys[i];
        }
        if (!isFinite(minX)) { minX = -12; maxX = 12; minY = -90; maxY = 0; }
        const s = clip.scale ?? 1;
        // 像素占据 [x, x+1)，所以边界要 +1；否则右侧/底部会漏一个像素
        return {
          minX: minX * s, maxX: (maxX + 1) * s,
          minY: minY * s, maxY: (maxY + 1) * s,
          w: Math.max(10, (maxX - minX + 1) * s), h: Math.max(10, (maxY - minY + 1) * s),
        };
      }
      if (clip.type === "target") {
        // 稻草人真实像素范围（扫描一次，缓存）：TW=38, TH=52，基准 x-19 / Y-52
        const r = targetPixelBounds();
        const s = clip.scale ?? 1;
        return {
          minX: r.minX * s, maxX: (r.maxX + 1) * s,
          minY: r.minY * s, maxY: (r.maxY + 1) * s,
          w: (r.maxX - r.minX + 1) * s, h: (r.maxY - r.minY + 1) * s,
        };
      }
      if (clip.type === "fx") {
        const s = clip.scale ?? 1;
        // 优先用绘制时实测的可见像素范围（相对锚点，不对称）
        const pb = clip._pxBounds;
        if (pb) {
          return {
            minX: pb.minX * s, maxX: pb.maxX * s,
            minY: pb.minY * s, maxY: pb.maxY * s,
            w: Math.max(4, (pb.maxX - pb.minX) * s), h: Math.max(4, (pb.maxY - pb.minY) * s),
          };
        }
        const meta = loadedFx(clip.fxId)?.meta;
        const sz = meta?.size ?? [160, 100];
        const origin = meta?.origin ?? [sz[0] / 2, sz[1] / 2];
        return {
          minX: -origin[0] * s, maxX: (sz[0] - origin[0]) * s,
          minY: -origin[1] * s, maxY: (sz[1] - origin[1]) * s,
          w: sz[0] * s, h: sz[1] * s,
        };
      }
      return null;
    },

    /**
     * 选中元素的外接框（世界坐标）。origin 是可拖动的原点，size 是视觉尺寸。
     * 没有 scale 支持的元素（特效）返回 null 之外的锚点信息给 UI 画箭头用。
     */
    selectionBox(clipId, t = E.time) {
      const c = E.project.clips.find((x) => x.id === clipId);
      if (!c || !layerVisible(c)) return null;
      const active = activeAt(c, t) || c.type === "fx";
      if (!active) return null;
      if (c.type === "character") {
        const scale = c.scale ?? 1;
        return { x: c.x ?? 0, y: c.y ?? 0, w: 34 * scale, h: 92 * scale, scale, originY: "bottom" };
      }
      if (c.type === "target") {
        const scale = c.scale ?? 1;
        return { x: c.x ?? 0, y: c.y ?? 0, w: 46 * scale, h: 74 * scale, scale, originY: "bottom" };
      }
      if (c.type === "fx") {
        const meta = loadedFx(c.fxId)?.meta;
        const sz = meta?.size ?? [320, 200];
        const scale = c.scale ?? 1;
        const px = (c.from?.[0] ?? 0) + (c.to?.[0] ?? 0) * 0;
        const py = (c.from?.[1] ?? 0);
        return { x: (c.x ?? 0) + px, y: (c.y ?? 0) + py, w: sz[0] * scale * 0.5, h: sz[1] * scale * 0.5, scale, originY: "center", isFx: true };
      }
      return null;
    },

    /** 自动取景：按当前时间在台上出现的角色和靶子算 */
    fitCurrent() {
      const t = E.time;
      const pts = [];
      for (const c of clipsOf("character")) {
        if (activeAt(c, t)) pts.push({ x: (c.x ?? 0) - 70, y: (c.y ?? 0) - 90 }, { x: (c.x ?? 0) + 90, y: c.y ?? 0 });
      }
      for (const c of clipsOf("target")) {
        if (activeAt(c, t)) pts.push({ x: (c.x ?? 0) - 40, y: (c.y ?? 0) - 70 }, { x: (c.x ?? 0) + 70, y: c.y ?? 0 });
      }
      for (const c of clipsOf("fx")) {
        if (activeAt(c, t) && c.from) pts.push({ x: (c.from[0] ?? 0) + 90, y: (c.from[1] ?? 0) - 60 });
      }
      fitView(canvas, pts);
    },

    draw() {
      const W = canvas.width, H = canvas.height;
      // 画布尺寸第一次真正布局出来（或窗口变化）时自动取景；用户手动缩放过就不再抢镜头
      if (!viewInit || (!view.userMoved && (W !== lastW || H !== lastH))) {
        viewInit = true;
        lastW = W; lastH = H;
        E.fitCurrent();
      }
      const g = world.ctx;
      world.ox = Math.round(-world.w * 0.4);
      world.oy = Math.round(-world.h * 0.8);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, world.w, world.h);
      g.imageSmoothingEnabled = false;
      g.translate(-world.ox, -world.oy);
      g.strokeStyle = E.dark ? "#44415e" : "#312d42"; // 黑背景下地面线提亮一点
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(-1400, 0); g.lineTo(1400, 0); g.stroke();

      const time = E.time;

      // 图层顺序 → 绘制层级：tracks 数组越靠前 z 越高（左面板列表最上 = 画布最前）。
      // 先按图层分组收集所有要画的片段，再按 z 从高到低逐层绘制。
      const layerZOf = (clip) => {
        const idx = (E.project.tracks ?? []).findIndex((tr) => tr.id === clip.trackId);
        return idx === -1 ? 0 : (E.project.tracks.length - idx);
      };
      const drawClip = (clip) => {
        if (!activeAt(clip, time)) return;
        if (clip.type === "character") drawCharacter(clip);
        else if (clip.type === "target") drawTarget(clip);
        else if (clip.type === "fx") drawFxClip(clip);
      };

      // 角色绘制（原逻辑提成函数）
      function drawCharacter(chClip) {
        const cx = chClip.x ?? 0, cy = chClip.y ?? 0;
        const img = chClip.src ? getImage(chClip.src) : null;
        if (img && img.complete && img.naturalWidth) {
          g.save(); g.translate(cx, cy);
          if (chClip.angle) g.rotate((chClip.angle * Math.PI) / 180);
          if (chClip.scale && chClip.scale !== 1) g.scale(chClip.scale, chClip.scale);
          g.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight);
          g.restore();
        } else {
          const pr = posed(poseOfClip(chClip, time));
          const sc = chClip.scale ?? 1;
          const st = characterStateFor(chClip, time);
          const tint = st ? SKIN_TINT[st.skin] : null;
          for (let i = 0; i < pr.n; i++) {
            const c = pr.color[i] >>> 0;
            let rr = c & 255, gg = (c >>> 8) & 255, bb = (c >>> 16) & 255;
            if (tint) {
              const k = 0.62;
              rr = Math.round(rr * (1 - k) + tint[0] * k);
              gg = Math.round(gg * (1 - k) + tint[1] * k);
              bb = Math.round(bb * (1 - k) + tint[2] * k);
            }
            g.fillStyle = "#" + ((rr << 16) | (gg << 8) | bb).toString(16).padStart(6, "0");
            g.fillRect(cx + Math.round(pr.xs[i] * sc), cy + Math.round(pr.ys[i] * sc), 1, 1);
          }
        }
      }

      // 靶子绘制（原逻辑提成函数）
      function drawTarget(tc) {
        const slot = targetFor(tc);
        const a = slot.actor;
        const st = clipsOf("state").find((s) => activeAt(s, time) && bindsTo(s, tc));
        a.skin = st ? st.skin : null;
        a.shiver = st ? (st.shiver ?? 0) : 0;
        const hitClip = clipsOf("state").find((s) => s.hit && bindsTo(s, tc) && Math.abs(time - s.t) < 0.035);
          // 回退时间：已过命中点就不再留着稻草/摆动，否则倒带后残渣还在飘
        const anyHit = clipsOf("state").filter((s) => s.hit && bindsTo(s, tc));
        if (anyHit.length && !anyHit.some((s) => time >= s.t - 1e-6)) {
          if (a.straw.length) a.straw.length = 0;
          a.theta = 0; a.omega = 0; a.flashT = 0; a.lastHitKey = null;
        }
        if (hitClip) {
          // 命中只触发一次：按「进入该状态的时间」判键，倒带回放才会重新演
          const key = hitClip.id + ":" + Math.floor(time / Math.max(0.01, E.project.duration));
          if (a.lastHitKey !== key) {
            a.lastHitKey = key;
            const params = { push: hitClip.push ?? 1.4, straw: hitClip.straw ?? 10, flash: 0.05, shiver: hitClip.shiver ?? 0 };
            if (hitClip.skin !== undefined) params.skin = hitClip.skin;
            a.hit(params);
          }
        }
        a.step(1 / 60);
        clearFrame(slot.frame);
        a.draw(slot.frame.color, slot.w, slot.h, 80, 220, false);
        a.drawStraw(slot.frame.color, slot.w, slot.h, 80, 220, false);
        composite(slot.frame, slot.imgData.data, null);
        slot.ctx.putImageData(slot.imgData, 0, 0);
        g.save();
        g.translate(tc.x ?? 0, tc.y ?? 0);
        if (tc.angle) g.rotate((tc.angle * Math.PI) / 180);
        const ts = tc.scale ?? 1;
        if (ts !== 1) g.scale(ts, ts);
        g.drawImage(slot.canvas, slot.ox, slot.oy);
        g.restore();
      }

      // 特效绘制（原逻辑提成函数）
      function drawFxClip(clip) {
        const localT = time - clip.t;
        if (localT < 0 || time > clipEnd(clip) + 0.02) return;
        if (!loadedFx(clip.fxId)) { loadFx(clip.fxId).then(() => E.draw()); return; }
        const meta = loadedFx(clip.fxId).meta;
        const surf = clipSurf(clip, meta);
        try {
          let inst = fxInstances.get(clip.id);
          if (!inst || inst._fxId !== clip.fxId) {
            const mod = loadedFx(clip.fxId);
            const opts = { x: 0, y: 0, seed: clip.seed ?? 1 };
            const pal = paletteOf(clip.palette);
            if (pal) opts.palette = pal;
            inst = isMoveFx(clip.fxId) ? createAct(mod, opts) : createFx(mod, opts);
            inst._fxId = clip.fxId;
            fxInstances.set(clip.id, inst);
          }
          const D = meta?.duration ?? 1;
          const winLen = clipEnd(clip) - clip.t;
          // 差不到半帧就当整段放完：否则末尾会闪一下循环开头
          const looping = winLen > D + 0.5 / Math.max(1, E.project.fps);
          const loopT = looping ? localT % D : Math.min(localT, D);
          if (loopT >= inst.t) { if (loopT - inst.t > 1e-4) inst.update(loopT - inst.t); }
          else {
            const mod = loadedFx(clip.fxId);
            const opts = { x: 0, y: 0, seed: clip.seed ?? 1 };
            const pal = paletteOf(clip.palette);
            if (pal) opts.palette = pal;
            inst = isMoveFx(clip.fxId) ? createAct(mod, opts) : createFx(mod, opts);
            inst._fxId = clip.fxId;
            fxInstances.set(clip.id, inst);
            if (loopT > 1e-4) inst.update(loopT);
          }
          clearFrame(surf.frame);
          if (isMoveFx(clip.fxId)) inst.draw(surf.frame, { body: false, target: false });
          else inst.draw(surf.frame, null);
          composite(surf.frame, surf.imgData.data, null);
          surf.ctx.putImageData(surf.imgData, 0, 0);
          const prog = winLen > 0 ? Math.min(1, localT / winLen) : 1;
          const pos = clip.from && clip.to
            ? [clip.from[0] + (clip.to[0] - clip.from[0]) * prog, clip.from[1] + (clip.to[1] - clip.from[1]) * prog]
            : (clip.from ?? [0, 0]);
          const host = clipsOf("character").find((c) => activeAt(c, time));
          const ax = host?.x ?? 0, ay = host?.y ?? 0;
          // 记录这一帧：可见像素范围（相对锚点）+ 锚点实际落到哪（含插值）
          clip._pxBounds = scanSurfaceBounds(surf);
          clip._anchor = { x: ax + pos[0], y: ay + pos[1] };
          const sc = clip.scale ?? 1;
          g.save();
          g.translate(ax + pos[0], ay + pos[1]);
          if (sc !== 1) g.scale(sc, sc);
          if (clip.angle) g.rotate((clip.angle * Math.PI) / 180);
          g.drawImage(surf.canvas, -surf.origin[0], -surf.origin[1]);
          g.restore();
        } catch (e) { console.warn("fx", clip.fxId, e.message); }
      }

      // 统一绘制队列：所有层片段收集后按图层 z 排序（z 高的先画 = 在下层下面？不对——
      // 画布后画的在上层。左面板最上 = 最前 = 最后画。z 越大越靠前，后画。
      const queue = [];
      for (const type of ["character", "target", "state", "fx"]) {
        for (const c of clipsOf(type)) queue.push(c);
      }
      queue.sort((a, b) => layerZOf(a) - layerZOf(b)); // z 小（列表底部）先画，z 大（列表顶部）后画 = 在前
      for (const c of queue) drawClip(c);

      // 合成到主画布
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = false;
      ctx.save();
      ctx.translate(view.offsetX, view.offsetY);
      ctx.scale(view.scale, view.scale);
      ctx.drawImage(world.canvas, world.ox, world.oy);
      ctx.restore();

      // Gizmo：屏幕坐标矢量绘制（线宽不随 zoom 变化）
      if (E.gizmo) E.gizmo(ctx, W, H);
    },
  };
  return E;
}
