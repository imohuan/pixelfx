// 四栏对比图（1×4）：REF 参考图 | DOLL BASE 原始人偶 | DOLL NEW 替换后人偶 | PART 部件特写
// 用法: node tools/compare.mjs [head|body|skirt|full]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { decodePng, encodePng } from "./png.mjs";
import * as rig from "../core/rig-big.js";
import { renderPart, PixBuf, ellipsoid } from "./render.mjs";
import { drawText } from "./font.mjs";

const PART = process.argv[2] || "head";
const PART_LABELS = {
  head: "HEAD: hair shell + face",
  body: "BODY: robe torso",
  skirt: "SKIRT: cone + hem",
  full: "FULL",
};
mkdirSync("skeleton-lab/out", { recursive: true });

// ---- 参考图
const ref = decodePng(readFileSync("skeleton-lab/ref/mage-ref.png"));
const isBg = (r, g, b, a) => a < 128 || (r > 240 && g > 240 && b > 240);
const SX = 17, SY = 4, SW = 221, SH = 341;

// ---- mage 材质色阶（亮→暗，全部取自参考图主色）
const MAGE = {
  skin:  [[245,225,208],[232,200,176],[200,154,112],[150,104,74]],
  face:  [[255,238,221],[238,204,153],[204,170,136],[170,136,102]],
  hair:  [[119,119,136],[68,68,85],[34,34,51],[0,0,0]],
  robe:  [[232,240,244],[200,216,228],[152,180,200],[104,136,164]],
  trim:  [[232,200,120],[208,168,88],[168,136,60],[120,92,40]],
  steel: [[200,204,212],[154,162,176],[104,116,143],[62,70,86]],
};
const SKIN = 0, FACE = 1, HAIR = 2, ROBE = 3, TRIM = 4, STEEL = 5;
const RAMP_NAMES = ["skin", "face", "hair", "robe", "trim", "steel"];

// ---- rig 初始化 + 部件
rig.setScale(5);
const pose = { ...rig.STAND, crouch: 15 };
const parts = rig.posedParts(pose);
const sk = rig.skeleton(pose);

// ---- 合成人偶到 PixBuf（统一深度缓冲）
// 配置：每个 rig 部件 → (材质, 是否渲染)。替换部件（head/face）跳过，用自定义几何画。
const DOLL_H = 380;   // 人偶目标高（PixBuf 高度）
function composeDoll(mode) {   // mode: "base" | "new"
  // PixBuf 尺寸：人偶 x 范围 ±60，y 0..-190 → 画布 y 偏移 190
  const buf = new PixBuf(160, DOLL_H + 20);
  const OX = 80, OY = DOLL_H;   // 本地 → PixBuf 坐标
  // 自定义替换几何（只 mode=new 画）：mage 的头
  if (mode === "new") {
    const hx = sk.joints.head[0] + OX, hy = sk.joints.head[1] + OY;
    // 发壳：大椭球（z 深度放在头前）
    ellipsoid(buf, hx - 1, hy - 2, 19, 18, 16, HAIR, 0.8, (x, y, dx, dy) => {
      // 脸部区域不盖：右下区域露出
      if (dy > 0.15 && x > hx - 5) return false;
      return true;
    });
    // 脸：前下方
    ellipsoid(buf, hx + 3, hy + 6, 12, 13, 11, FACE, 1.2, (x, y) => x > hx - 8);
    // 鬓角垂发：两侧细长椭球（左颊和右颊前方）
    ellipsoid(buf, hx - 12, hy + 14, 5, 14, 8, HAIR, 1.4);
    ellipsoid(buf, hx + 10, hy + 12, 4.5, 12, 7, HAIR, 1.4);
  }
  // rig 部件像素：z 升序（深度缓冲自己处理遮挡）
  const sorted = [...parts].sort((a, b) => a.z - b.z);
  for (const p of sorted) {
    // new 模式：head/face 被自定义几何替换 → 跳过
    if (mode === "new" && (p.name === "head" || p.name === "face")) continue;
    let matId = SKIN;
    if (p.name === "face") matId = FACE;
    else if (p.name === "head") matId = mode === "base" ? SKIN : HAIR;
    else if (["waist", "chest", "pelvis"].includes(p.name)) matId = mode === "new" ? ROBE : SKIN;
    else if (p.name.startsWith("thigh") || p.name.startsWith("shin") || p.name.startsWith("foot")) matId = mode === "new" ? ROBE : SKIN;
    for (let i = 0; i < p.n; i++) {
      const c = p.color[i] >>> 0;
      const r0 = c & 255, g0 = (c >>> 8) & 255, b0 = (c >>> 16) & 255;
      const tone = (0.299*r0 + 0.587*g0 + 0.114*b0) / 255;
      // z 值转屏幕深度：rig z 范围约 0..30，PixBuf depth 直接用
      buf.plot(p.xs[i] + OX, p.ys[i] + OY, tone, p.z, matId);
    }
  }
  buf.finish();
  return buf;
}
const bufBase = composeDoll("base");
const bufNew = composeDoll("new");

// ---- 裁剪 PixBuf 到内容包围盒
function cropBuf(buf) {
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < buf.h; y++) for (let x = 0; x < buf.w; x++) {
    if (buf.mat[y * buf.w + x] >= 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = ((y + y0) * buf.w + (x + x0)) * 4, d = (y * w + x) * 4;
    data[d] = buf.data[s]; data[d+1] = buf.data[s+1]; data[d+2] = buf.data[s+2]; data[d+3] = 255;
  }
  return { w, h, data };
}
const baseC = cropBuf(bufBase), newC = cropBuf(bufNew);
function metrics(c) { const s = 400 / c.h; return { s, outW: Math.round(c.w * s) }; }
const mBase = metrics(baseC), mNew = metrics(newC);

// ---- 部件特写：从 NEW 的 PixBuf 裁剪头部区域（head 关节附近）
function closeupOf(buf, partNames) {
  const ps = parts.filter((p) => partNames.includes(p.name));
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (const p of ps) for (let i = 0; i < p.n; i++) {
    const px = p.xs[i] + 80, py = p.ys[i] + 400;
    if (px < x0) x0 = px; if (px > x1) x1 = px;
    if (py < y0) y0 = py; if (py > y1) y1 = py;
  }
  // 外扩 8px 容纳发壳
  x0 -= 10; y0 -= 10; x1 += 10; y1 += 10;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const data = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { data[i*4] = 255; data[i*4+1] = 255; data[i*4+2] = 255; data[i*4+3] = 255; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const bx = x0 + x, by = y0 + y;
    if (bx < 0 || by < 0 || bx >= buf.w || by >= buf.h) continue;
    const s = (by * buf.w + bx) * 4, d = (y * w + x) * 4;
    data[d] = buf.data[s]; data[d+1] = buf.data[s+1]; data[d+2] = buf.data[s+2]; data[d+3] = 255;
  }
  return { w, h, data };
}
const close = closeupOf(bufNew, PART === "head" ? ["head", "face"] : ["chest", "waist"]);
const closeScale = Math.max(2, Math.min(8, 260 / close.h));
const closeW = Math.round(close.w * closeScale), closeH = Math.round(close.h * closeScale);

// ---- 画布
const refW = Math.round(SW * 400/SH);
const MARGIN = 20, GAP = 22, LABEL_H = 30, NOTE_H = 34;
const W = MARGIN + refW + GAP + mBase.outW + GAP + mNew.outW + GAP + closeW + MARGIN;
const H = LABEL_H + 400 + NOTE_H;
const out = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) { out[i*4] = 255; out[i*4+1] = 255; out[i*4+2] = 255; out[i*4+3] = 255; }
const put = (x, y, r, g, b, a) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const j = (y * W + x) * 4;
  if (a < 255) {
    out[j] = Math.round(out[j] * (1 - a/255) + r * a/255);
    out[j+1] = Math.round(out[j+1] * (1 - a/255) + g * a/255);
    out[j+2] = Math.round(out[j+2] * (1 - a/255) + b * a/255);
  } else { out[j] = r; out[j+1] = g; out[j+2] = b; }
  out[j+3] = 255;
};
function drawC(c, x0) {
  const s = 400 / c.h;
  for (let y = 0; y < 400; y++) for (let x = 0; x < Math.round(c.w * s); x++) {
    const sx = Math.min(c.w - 1, Math.floor(x / s)), sy = Math.min(c.h - 1, Math.floor(y / s));
    const j = (sy * c.w + sx) * 4;
    put(x0 + x, LABEL_H + y, c.data[j], c.data[j+1], c.data[j+2], 255);
  }
}
// 1. REF
const x1 = MARGIN;
for (let y = 0; y < 400; y++) for (let x = 0; x < refW; x++) {
  const sx = SX + Math.floor(x * SW / refW), sy = SY + Math.floor(y * SH / 400);
  const j = (sy * ref.w + sx) * 4;
  const r = ref.data[j], g = ref.data[j+1], b = ref.data[j+2], a = ref.data[j+3];
  if (!isBg(r, g, b, a)) put(x1 + x, LABEL_H + y, r, g, b, a);
}
// 2. BASE 3. NEW
const x2 = x1 + refW + GAP;
drawC(baseC, x2);
const x3 = x2 + mBase.outW + GAP;
drawC(newC, x3);
// 4. PART
const x4 = x3 + mNew.outW + GAP;
for (let y = 0; y < closeH; y++) for (let x = 0; x < closeW; x++) {
  const sx = Math.floor(x / closeScale), sy = Math.floor(y / closeScale);
  const j = (sy * close.w + sx) * 4;
  put(x4 + x, LABEL_H + Math.round((400 - closeH) / 2) + y, close.data[j], close.data[j+1], close.data[j+2], 255);
}
// 分隔线
for (const dx0 of [x2 - GAP/2, x3 - GAP/2, x4 - GAP/2]) for (let y = 18; y < H - 18; y++) put(Math.round(dx0), y, 195, 195, 205, 255);
// 标题 + 注释
const LC = [80, 80, 95], NC = [45, 45, 58];
drawText(out, W, "REF", x1, 9, LC, 2);
drawText(out, W, "DOLL BASE", x2, 9, LC, 2);
drawText(out, W, "DOLL NEW", x3, 9, LC, 2);
drawText(out, W, "PART", x4, 9, LC, 2);
drawText(out, W, "stock rig", x2, LABEL_H + 400 + 6, NC, 2);
drawText(out, W, PART + " swapped", x3, LABEL_H + 400 + 6, NC, 2);
drawText(out, W, PART_LABELS[PART] || PART, x4, LABEL_H + 400 + 6, NC, 2);

const outPath = "skeleton-lab/out/compare-" + PART + ".png";
writeFileSync(outPath, encodePng(W, H, out));
console.log("wrote", outPath, "(" + W + "x" + H + ")");
