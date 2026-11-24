// 程序化渲染：按部件输出 RGBA Buffer（白底）。
// 与 rig 相同的原理：3D 几何 → 法线 → 单一光方向 → 4 档色阶 → 外轮廓

export const LIGHT = norm([-0.55, 0.72, 0.5]);
export function norm(v) { const l = Math.hypot(...v) || 1e-6; return v.map((x) => x / l); }
export function dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
export function hexToRgb(h) { const s = h.replace("#", ""); return [parseInt(s.slice(0,2),16), parseInt(s.slice(2,4),16), parseInt(s.slice(4,6),16)]; }

// 材质：4 档色阶（亮 → 暗）
export const MAT = {
  skin: ["#f5d9b8", "#e8c49c", "#c89a70", "#96684a"],
  hair: ["#3a3a46", "#2c2c38", "#20202a", "#14141c"],
  robe: ["#e8f0f4", "#c8d8e4", "#98b4c8", "#6888a4"],
  trim: ["#e8c878", "#d0a858", "#a8883c", "#785c28"],
  steel: ["#c8ccd4", "#9aa2b0", "#68748f", "#3e4656"],
  ribbon: ["#a8d8e8", "#88b8d0", "#5888a8", "#385878"],
};

export class PixBuf {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.depth = new Float32Array(w * h);
    this.tone = new Float32Array(w * h);
    this.mat = new Int16Array(w * h).fill(-1);
    this.data = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) { this.data[i*4] = 255; this.data[i*4+1] = 255; this.data[i*4+2] = 255; this.data[i*4+3] = 255; }
  }
  plot(x, y, tone, depth, mat) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = y * this.w + x;
    if (depth > this.depth[i]) { this.depth[i] = depth; this.tone[i] = tone; this.mat[i] = mat; }
  }
  /** 4 档色阶上色 + 1px 外轮廓。ramps: 材质 id → 色带名 */
  ramps = ["skin", "skin", "hair", "robe", "trim", "steel", "ribbon"];
  customRamps = null;   // { matId: [r,g,b][4] } 覆盖
  finish() {
    const { w, h } = this;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const m = this.mat[i];
      if (m < 0) continue;
      const rampName = this.customRamps?.[m] ?? this.rampName(m);
      const t = this.tone[i];
      const step = t > 0.8 ? 0 : t > 0.42 ? 1 : t > 0.08 ? 2 : 3;
      const [r, g, b] = Array.isArray(rampName) ? rampName[step] : hexToRgb(MAT[rampName][step]);
      const j = i * 4;
      this.data[j] = r; this.data[j+1] = g; this.data[j+2] = b; this.data[j+3] = 255;
    }
    // 外轮廓：身体像素的外圈画墨线（比最暗更深的固定色）
    const INK = [0x14, 0x10, 0x18];
    const ring = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (this.mat[i] < 0) continue;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) { ring.push([nx, ny]); continue; }
        if (this.mat[ny * w + nx] < 0) ring.push([nx, ny]);
      }
    }
    for (const [x, y] of ring) {
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const j = (y * w + x) * 4;
      this.data[j] = INK[0]; this.data[j+1] = INK[1]; this.data[j+2] = INK[2]; this.data[j+3] = 255;
    }
    return this.data;
  }
  rampName(matId) { return this.ramps[matId] || "skin"; }
}

export function ellipsoid(buf, cx, cy, rx, ry, rz, matId, depthBoost = 0, clip) {
  const big = Math.max(rx, ry);
  for (let y = Math.floor(cy - big); y <= Math.ceil(cy + big); y++) {
    for (let x = Math.floor(cx - big); x <= Math.ceil(cx + big); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      const q = dx*dx + dy*dy;
      if (q > 1) continue;
      const dz = Math.sqrt(1 - q);
      if (clip && !clip(x, y, dx, dy, dz)) continue;
      const n = norm([dx / rx, dy / ry, dz / rz]);
      buf.plot(x, y, dot(n, LIGHT), dz + depthBoost, matId);
    }
  }
}

/**
 * 渲染部件。返回 { w, h, data }。逐步实现：head → body → skirt → full
 */
export function renderPart(part) {
  if (part === "head") return renderHead();
  return renderPlaceholder(part);
}

function renderPlaceholder(name) {
  const buf = new PixBuf(200, 240);
  ellipsoid(buf, 100, 120, 40, 18, 30, 3);   // 一个灰蓝占位块
  return { w: buf.w, h: buf.h, data: buf.finish() };
}

// ---- 头部：颅骨 + 脸 + 发壳 + （下一步：眼睛）
function renderHead() {
  const buf = new PixBuf(200, 260);
  const CX = 100, CY = 120;
  // 0 皮肤 / 2 头发
  // 颅骨（皮肤色，大部分会被发壳盖住）
  ellipsoid(buf, CX, CY, 15, 14, 13, 0);
  // 脸：前下方偏移，浅一点肤色（亮部更多）
  ellipsoid(buf, CX + 2, CY + 5, 12, 13, 11, 1, 0.35, (x, y) => x > CX - 8);   // 只画右半边脸（角色朝右）
  // 发壳：比颅骨大，只覆盖头顶和后脑（角色朝右 → 后脑在左）
  ellipsoid(buf, CX - 2, CY - 2, 17.5, 17, 15, 2, 0.5, (x, y, dx, dy) => {
    // 条件：头顶区域 + 左后脑。脸的右下区域不盖
    if (dy > 0.12 && x > CX - 4) return false;
    return true;
  });
  return { w: buf.w, h: buf.h, data: buf.finish() };
}
