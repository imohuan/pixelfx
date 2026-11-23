// 骨架查看器：把 rig.js 解出的关节位置画成一张 PNG，方便研究骨骼结构。
// 用法: node skeleton-lab/view.mjs                # 站立姿势
//       node skeleton-lab/view.mjs挥剑            # 或 --pose挥剑

import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { posed, skeleton, STAND } from "./core/rig.js";

const POSES = {
  stand: { ...STAND, crouch: 3, fx: 11, fy: -21, bx: 9, by: -21 },
  swing: { crouch: 4, lean: 5, fx: 24, fy: -19, bx: -10, by: -22, weapon: "sword", sa: 0.6 },
  kick: { crouch: 2, lean: -3, ffx: 16, ffy: -10, fbx: -6, fby: -2, fx: -8, fy: -18 },
  jump: { y: -14, fx: -4, fy: -26, bx: 7, by: -24, ffx: 5, ffy: -8, fbx: -5, fby: -3 },
};

const poseName = process.argv[2] || "stand";
const pose = POSES[poseName] || POSES.stand;

const W = 120, H = 100;
const img = Buffer.alloc(W * H * 4);
const px = (x, y, r, g, b) => {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  img[i] = r; img[i+1] = g; img[i+2] = b; img[i+3] = 255;
};
const line = (a, b, c) => {
  const n = Math.ceil(Math.hypot(b[0]-a[0], b[1]-a[1]));
  for (let i = 0; i <= n; i++) {
    px(a[0] + (b[0]-a[0])*i/n, a[1] + (b[1]-a[1])*i/n, c[0], c[1], c[2]);
  }
};

// 骨架数据：joint 坐标是 (x, y_down, z)，y 向下，脚在原点
const sk = skeleton(pose);
// 骨架坐标转图像坐标：x 向右不变，y 向下翻成向上
const T = (j) => [j[0] + 40, 80 + j[1]];

// 画骨头
const BONE = [180, 180, 200];
for (const [from, to] of sk.bones) line(T(sk.joints[from]), T(sk.joints[to]), BONE);
// 画关节
const JOINT = [255, 220, 60];
for (const [name, j] of Object.entries(sk.joints)) {
  const [x, y] = T(j);
  px(x-1, y, ...JOINT); px(x+1, y, ...JOINT); px(x, y-1, ...JOINT); px(x, y+1, ...JOINT);
  px(x, y, ...JOINT);
}
// 把像素图叠到骨架图旁边：rendered body 用 posed() 拿到每个像素
const body = posed(pose);
const BODY_COLOR = [240, 240, 240];
for (let i = 0; i < body.n; i++) {
  const x = body.xs[i] + 90, y = 80 + body.ys[i];
  const c = body.color[i];
  px(x, y, c & 255, (c >>> 8) & 255, (c >>> 16) & 255);
}

mkdirSync("skeleton-lab/out", { recursive: true });
// 最简 PNG 编码：8字节签名 + IHDR + IDAT(deflate) + IEND，无压缩行(filter=0)
function encodePng(w, h, rgba) {
  const crcTable = [...Array(256)].map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  // 每行前加 filter byte 0
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return png;
}

const out = `skeleton-lab/out/skeleton-${poseName}.png`;
writeFileSync(out, encodePng(W, H, img));
console.log(`wrote ${out} (${W}x${H}), ${sk.bones.length} bones, ${Object.keys(sk.joints).length} joints`);
