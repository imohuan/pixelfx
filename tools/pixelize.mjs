#!/usr/bin/env node
// pixelize.mjs — 提炼自 Frame-sequence 的两个节点：
//   hd      「高清转像素」：高清图重画到粗网格，每格取主色，再归并色板
//   perfect 「完美像素」  ：FFT 检测 AI 像素风图的隐藏网格，块内取众数
// 零依赖：PNG 解码/编码用 Node 内置 zlib 自己实现。
//
// 用法：
//   node tools/pixelize.mjs hd <in.png> -o out.png --width 64 --palette sweetie16
//   node tools/pixelize.mjs perfect <in.png> --mode down --scale 8 -o out.png

import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";

// ---------- 基础图像类型 ----------

class ImageData {
  constructor(w, h, data) {
    this.width = w;
    this.height = h;
    this.data = data || new Uint8ClampedArray(w * h * 4);
  }
}

const hexToRgb = (hex) => [
  parseInt(hex.slice(0, 2), 16),
  parseInt(hex.slice(2, 4), 16),
  parseInt(hex.slice(4, 6), 16),
];

// ---------- PNG 解码 ----------

function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("不是 PNG 文件（本脚本支持 PNG；JPEG 请先转 PNG）");
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  let plte = null, trns = null;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "PLTE") {
      plte = new Uint8Array(data);
    } else if (type === "tRNS") {
      trns = new Uint8Array(data);
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    pos += 12 + len;
  }
  if (!width || !height) throw new Error("PNG 头解析失败");
  if (interlace) throw new Error("不支持 Adam7 隔行 PNG，请另存为普通 PNG");

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error("不支持的 PNG 颜色类型 " + colorType);
  const bpp = channels * (bitDepth > 8 ? 2 : 1);
  const raw = zlib.inflateSync(Buffer.concat(idat));

  // 逐字节还原滤波
  const stride = Math.ceil(width * channels * bitDepth / 8);
  const img = new Uint8Array(height * stride);
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    const row = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? img[row + x - bpp] : 0;
      const b = y > 0 ? img[row - stride + x] : 0;
      const c = x >= bpp && y > 0 ? img[row - stride + x - bpp] : 0;
      let v = raw[rp + x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      img[row + x] = v & 255;
    }
    rp += stride;
  }

  // 转成 RGBA8
  const out = new Uint8ClampedArray(width * height * 4);
  const lineBytes = width * channels * (bitDepth > 8 ? 2 : 1);
  for (let y = 0; y < height; y++) {
    const rowOff = y * stride;
    for (let x = 0; x < width; x++) {
      const oi = (y * width + x) * 4;
      const sample = (ch) => {
        if (bitDepth === 16) return img[rowOff + (x * channels + ch) * 2];
        return img[rowOff + x * channels + ch];
      };
      if (colorType === 6) {
        out[oi] = sample(0); out[oi + 1] = sample(1); out[oi + 2] = sample(2);
        out[oi + 3] = bitDepth === 16 ? sample(3) : img[rowOff + x * 4 + 3];
      } else if (colorType === 2) {
        out[oi] = sample(0); out[oi + 1] = sample(1); out[oi + 2] = sample(2); out[oi + 3] = 255;
      } else if (colorType === 4) {
        const g = sample(0);
        out[oi] = out[oi + 1] = out[oi + 2] = g;
        out[oi + 3] = bitDepth === 16 ? sample(1) : img[rowOff + x * 2 + 1];
      } else if (colorType === 0) {
        const g = sample(0);
        out[oi] = out[oi + 1] = out[oi + 2] = g; out[oi + 3] = 255;
      } else if (colorType === 3) {
        let idx;
        if (bitDepth === 8) idx = img[rowOff + x];
        else {
          const perByte = 8 / bitDepth;
          const byte = img[rowOff + Math.floor(x / perByte)];
          const shift = 8 - bitDepth * (Math.floor(x % perByte) + 1);
          idx = (byte >> shift) & ((1 << bitDepth) - 1);
        }
        if (plte && idx * 3 + 2 < plte.length) {
          out[oi] = plte[idx * 3]; out[oi + 1] = plte[idx * 3 + 1]; out[oi + 2] = plte[idx * 3 + 2];
        }
        out[oi + 3] = trns && idx < trns.length ? trns[idx] : 255;
      }
    }
  }
  return new ImageData(width, height, out);
}

// ---------- PNG 编码 ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(im) {
  const { width: w, height: h, data: d } = im;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < w * 4; x++) raw[y * (w * 4 + 1) + 1 + x] = d[y * w * 4 + x];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- 颜色工具（提炼自 color.js） ----------

const RESURRECT_64 = [
  "2e222f","3e3546","625565","966c6c","ab947a","694f62","7f708a","9babb2",
  "c7dcd0","ffffff","6e2727","b33831","ea4f36","f57d4a","ae2334","e83b3b",
  "fb6b1d","f79617","f9c22b","7a3045","9e4539","cd683d","e6904e","fbb954",
  "4c3e24","676633","a2a947","d5e04b","fbff86","165a4c","239063","1ebc73",
  "91db69","cddf6c","313638","374e4a","547e64","92a984","b2ba90","0b5e65",
  "0b8a8f","0eaf9b","30e1b9","8ff8e2","323353","484a77","4d65b4","4d9be6",
  "8fd3ff","45293f","6b3e75","905ea9","a884f3","eaaded","753c54","a24b6f",
  "cf657f","ed8099","831c5d","c32454","f04f78","f68181","fca790","fdcbb0",
].map(hexToRgb);

const PALETTES = {
  resurrect64: RESURRECT_64,
  endesga32: ["be4a2f","d77643","ead4aa","e4a672","b86f50","733e39","3e2731","a22633",
    "e43b44","f77622","feae34","fee761","63c74d","3e8948","265c42","193c3e",
    "124e89","0099db","2ce8f5","ffffff","c0cbdc","8b9bb4","5a6988","3a4466",
    "262b44","181425","ff0044","68386c","b55088","f6757a","e8b796","c28569"].map(hexToRgb),
  sweetie16: ["1a1c2c","5d275d","b13e53","ef7d57","ffcd75","a7f070","38b764","257179",
    "29366f","3b5dc9","41a6f6","73eff7","f4f4f4","94b0c2","566c86","333c57"].map(hexToRgb),
  db32: ["000000","222034","45283c","663931","8f563b","df7126","d9a066","eec39a",
    "fbf236","99e550","6abe30","37946e","4b692f","524b24","323c39","3f3f74",
    "306082","5b6ee1","639bff","5fcde4","cbdbfc","ffffff","9badb7","847e87",
    "696a6a","595652","76428a","ac3232","d95763","d77bba","8f974a","8a6f30"].map(hexToRgb),
  pico8: ["000000","1d2b53","7e2553","008751","ab5236","5f574f","c2c3c7","fff1e8",
    "ff004d","ffa300","ffec27","00e436","29adff","83769c","ff77a8","ffccaa"].map(hexToRgb),
  gray16: Array.from({ length: 16 }, (_v, i) => { const v = Math.round(i * 255 / 15); return [v, v, v]; }),
};

function rgb2hsl(c) {
  const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s, l };
}

function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r, g, b;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function colorDist(a, b) {
  const rmean = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return (2 + rmean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rmean) / 256) * db * db;
}

function nearestIndexIn(c, pal) {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < pal.length; i++) {
    const d = colorDist(c, pal[i]);
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

const packRGB = (d, i) => ((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]) >>> 0;
const unpackRGB = (k) => [(k >> 16) & 255, (k >> 8) & 255, k & 255];

function medianCut(colors, counts, k) {
  if (colors.length <= k) return colors.map((c) => c.slice());
  const rangeOf = (box) => {
    const mn = [255, 255, 255], mx = [0, 0, 0];
    for (const e of box) for (let j = 0; j < 3; j++) {
      if (e.c[j] < mn[j]) mn[j] = e.c[j];
      if (e.c[j] > mx[j]) mx[j] = e.c[j];
    }
    return [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
  };
  const boxOf = (items) => {
    const r = items.length < 2 ? null : rangeOf(items);
    return { items, r, ch: r ? (r[0] >= r[1] ? (r[0] >= r[2] ? 0 : 2) : (r[1] >= r[2] ? 1 : 2)) : 0 };
  };
  const boxes = [boxOf(colors.map((c, i) => ({ c, n: counts[i] })))];
  while (boxes.length < k) {
    let bi = -1, bestR = -1, bestCh = 0;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (!b.r) continue;
      if (b.r[b.ch] > bestR) { bestR = b.r[b.ch]; bi = i; bestCh = b.ch; }
    }
    if (bi < 0) break;
    const items = boxes[bi].items, cnt = new Int32Array(257), box = new Array(items.length);
    for (const e of items) cnt[e.c[bestCh] + 1]++;
    for (let v = 0; v < 256; v++) cnt[v + 1] += cnt[v];
    for (const e of items) box[cnt[e.c[bestCh]]++] = e;
    let tot = 0; for (const e of box) tot += e.n;
    let acc = 0, cut = 1;
    for (let i = 0; i < box.length; i++) {
      acc += box[i].n;
      if (acc >= tot / 2) { cut = Math.min(Math.max(i, 1), box.length - 1); break; }
    }
    boxes.splice(bi, 1, boxOf(box.slice(0, cut)), boxOf(box.slice(cut)));
  }
  return boxes.map((b) => b.items).filter((b) => b.length).map((box) => {
    let sr = 0, sg = 0, sb = 0, sn = 0;
    for (const e of box) { sr += e.c[0] * e.n; sg += e.c[1] * e.n; sb += e.c[2] * e.n; sn += e.n; }
    return [Math.round(sr / sn), Math.round(sg / sn), Math.round(sb / sn)];
  });
}

function colorCounts(images) {
  const counts = new Map();
  for (const im of [].concat(images)) {
    const d = im.data, n = im.width * im.height;
    for (let i = 0; i < n; i++) {
      if (d[i * 4 + 3] < 8) continue;
      const key = packRGB(d, i * 4);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return counts;
}

function countColors(images) { return colorCounts(images).size; }

function remapColors(imageData, mapFn) {
  const d = imageData.data, n = imageData.width * imageData.height;
  const cache = new Map();
  for (let i = 0; i < n; i++) {
    if (d[i * 4 + 3] < 8) continue;
    const key = packRGB(d, i * 4);
    let nc = cache.get(key);
    if (!nc) { nc = mapFn(key); cache.set(key, nc); }
    d[i * 4] = nc[0]; d[i * 4 + 1] = nc[1]; d[i * 4 + 2] = nc[2];
  }
}

function reduceColors(images, k) {
  const list = [].concat(images);
  const counts = colorCounts(list);
  if (counts.size <= k) return;
  const entries = [...counts.entries()];
  const pal = medianCut(entries.map(([key]) => unpackRGB(key)), entries.map(([, c]) => c), k);
  for (const im of list) remapColors(im, (key) => pal[nearestIndexIn(unpackRGB(key), pal)]);
}

function snapToPalette(images, pal) {
  for (const im of [].concat(images)) remapColors(im, (key) => pal[nearestIndexIn(unpackRGB(key), pal)]);
}

// ---------- 「高清转像素」管线（提炼自 pixelize.js） ----------

function downscale(src, w, h, sample, alphaThr) {
  const W = src.width, H = src.height, d = src.data;
  const out = new ImageData(w, h);
  const od = out.data;
  const buckets = new Map();
  for (let oy = 0; oy < h; oy++) {
    const y0 = Math.floor(oy * H / h), y1 = Math.max(y0 + 1, Math.floor((oy + 1) * H / h));
    for (let ox = 0; ox < w; ox++) {
      const x0 = Math.floor(ox * W / w), x1 = Math.max(x0 + 1, Math.floor((ox + 1) * W / w));
      const n = (y1 - y0) * (x1 - x0);
      const oi = (oy * w + ox) * 4;
      if (sample === "average") {
        let r = 0, g = 0, b = 0, a = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const i = (y * W + x) * 4, al = d[i + 3];
            r += d[i] * al; g += d[i + 1] * al; b += d[i + 2] * al; a += al;
          }
        }
        if (a / n < alphaThr || a === 0) continue;
        od[oi] = Math.round(r / a); od[oi + 1] = Math.round(g / a); od[oi + 2] = Math.round(b / a); od[oi + 3] = 255;
        continue;
      }
      buckets.clear();
      let opaque = 0, best = null;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * W + x) * 4;
          if (d[i + 3] < 128) continue;
          opaque++;
          const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
          let e = buckets.get(key);
          if (e) { e[0]++; e[1] += d[i]; e[2] += d[i + 1]; e[3] += d[i + 2]; }
          else { e = [1, d[i], d[i + 1], d[i + 2]]; buckets.set(key, e); }
          if (!best || e[0] > best[0]) best = e;
        }
      }
      if (!best || opaque * 255 < alphaThr * n) continue;
      od[oi] = Math.round(best[1] / best[0]); od[oi + 1] = Math.round(best[2] / best[0]); od[oi + 2] = Math.round(best[3] / best[0]); od[oi + 3] = 255;
    }
  }
  return out;
}

function adjust(im, sat, contrast) {
  if (sat === 100 && contrast === 100) return;
  const d = im.data;
  const cache = new Map();
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    let c = cache.get(key);
    if (!c) {
      const hsl = rgb2hsl([d[i], d[i + 1], d[i + 2]]);
      const s = Math.min(1, hsl.s * sat / 100);
      const l = Math.min(1, Math.max(0, 0.5 + (hsl.l - 0.5) * contrast / 100));
      c = hsl2rgb(hsl.h, s, l);
      cache.set(key, c);
    }
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
  }
}

function buildPalette(images, palette, colors) {
  if (palette && palette !== "adaptive" && PALETTES[palette]) return PALETTES[palette];
  const counts = colorCounts(images);
  const entries = [...counts.entries()];
  const k = colors > 0 ? colors : 256;
  return medianCut(entries.map(([key]) => unpackRGB(key)), entries.map(([, n]) => n), k);
}

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function quantize(im, pal, dither) {
  const { width: w, height: h, data: d } = im;
  if (dither === "fs") {
    const buf = new Float32Array(w * h * 3);
    for (let i = 0; i < w * h; i++) { buf[i * 3] = d[i * 4]; buf[i * 3 + 1] = d[i * 4 + 1]; buf[i * 3 + 2] = d[i * 4 + 2]; }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!d[i * 4 + 3]) continue;
        const c = [buf[i * 3], buf[i * 3 + 1], buf[i * 3 + 2]].map((v) => Math.max(0, Math.min(255, v)));
        const p = pal[nearestIndexIn(c, pal)];
        d[i * 4] = p[0]; d[i * 4 + 1] = p[1]; d[i * 4 + 2] = p[2];
        const er = [c[0] - p[0], c[1] - p[1], c[2] - p[2]];
        const spread = (dx, dy, f) => {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= w || ny >= h) return;
          const j = ny * w + nx;
          if (!d[j * 4 + 3]) return;
          buf[j * 3] += er[0] * f; buf[j * 3 + 1] += er[1] * f; buf[j * 3 + 2] += er[2] * f;
        };
        spread(1, 0, 7 / 16); spread(-1, 1, 3 / 16); spread(0, 1, 5 / 16); spread(1, 1, 1 / 16);
      }
    }
    return;
  }
  const cache = new Map();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (!d[i + 3]) continue;
      let c = [d[i], d[i + 1], d[i + 2]];
      if (dither === "bayer") {
        const off = (BAYER4[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 40;
        c = c.map((v) => Math.max(0, Math.min(255, v + off)));
        const p = pal[nearestIndexIn(c, pal)];
        d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2];
        continue;
      }
      const key = (c[0] << 16) | (c[1] << 8) | c[2];
      let p = cache.get(key);
      if (!p) { p = pal[nearestIndexIn(c, pal)]; cache.set(key, p); }
      d[i] = p[0]; d[i + 1] = p[1]; d[i + 2] = p[2];
    }
  }
}

function addOutline(im, color) {
  const { width: w, height: h, data: d } = im;
  const alpha = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = d[i * 4 + 3] ? 1 : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (alpha[i]) continue;
      if ((x > 0 && alpha[i - 1]) || (x < w - 1 && alpha[i + 1]) || (y > 0 && alpha[i - w]) || (y < h - 1 && alpha[i + w])) {
        d[i * 4] = color[0]; d[i * 4 + 1] = color[1]; d[i * 4 + 2] = color[2]; d[i * 4 + 3] = 255;
      }
    }
  }
}

function outputSize(srcW, srcH, opts) {
  const w = Math.max(1, Math.min(1024, Math.round(opts.width) || 64));
  const h = opts.height > 0 ? Math.max(1, Math.min(1024, Math.round(opts.height))) : Math.max(1, Math.round(srcH * w / srcW));
  return { w, h };
}

function pixelizeAll(images, opts) {
  const { w, h } = outputSize(images[0].width, images[0].height, opts);
  const outs = images.map((im) => {
    const o = downscale(im, w, h, opts.sample || "dominant", opts.alpha ?? 128);
    adjust(o, opts.sat ?? 100, opts.contrast ?? 100);
    return o;
  });
  const pal = buildPalette(outs, opts.palette, Number(opts.colors) || 0);
  let specks = 0;
  for (const o of outs) {
    quantize(o, pal, opts.dither || "none");
    specks += despeckle(o, Number(opts.despeckle) || 0);
  }
  if (opts.outline && opts.outline !== "none") {
    let dark = [0, 0, 0];
    if (opts.outline === "dark") {
      let best = Infinity;
      for (const c of pal) { const l = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]; if (l < best) { best = l; dark = c; } }
    }
    for (const o of outs) addOutline(o, dark);
  }
  return {
    outs,
    info: { w, h, srcW: images[0].width, srcH: images[0].height, colors: colorCounts(outs).size, palette: pal.length, specks },
  };
}

// ---------- 「完美像素」管线（提炼自 depixel.js） ----------

function edgeProfile(data, w, h, axis) {
  const n = axis === 0 ? w : h;
  const prof = new Float64Array(n);
  if (axis === 0) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 1; x < w; x++) {
        const i = (row + x) * 4, j = i - 4;
        prof[x] += Math.abs(data[i] - data[j]) + Math.abs(data[i + 1] - data[j + 1])
                 + Math.abs(data[i + 2] - data[j + 2]) + Math.abs(data[i + 3] - data[j + 3]);
      }
    }
    for (let x = 0; x < n; x++) prof[x] /= h;
  } else {
    for (let y = 1; y < h; y++) {
      const row = y * w, prev = row - w;
      let s = 0;
      for (let x = 0; x < w; x++) {
        const i = (row + x) * 4, j = (prev + x) * 4;
        s += Math.abs(data[i] - data[j]) + Math.abs(data[i + 1] - data[j + 1])
           + Math.abs(data[i + 2] - data[j + 2]) + Math.abs(data[i + 3] - data[j + 3]);
      }
      prof[y] = s / w;
    }
  }
  return prof;
}

function centerProfile(prof) {
  let sum = 0;
  for (let i = 0; i < prof.length; i++) sum += prof[i];
  if (sum <= 1e-9) return null;
  const mean = sum / prof.length;
  const out = new Float64Array(prof.length);
  for (let i = 0; i < prof.length; i++) out[i] = prof[i] - mean;
  return { arr: out, total: sum, raw: prof };
}

function combScore(raw, p) {
  const n = raw.length;
  const B = Math.max(2, Math.min(48, Math.floor(p)));
  if (B < 4) return 1;
  const sum = new Float64Array(B), cnt = new Float64Array(B);
  for (let x = 0; x < n; x++) {
    let j = Math.floor((x % p) / p * B);
    if (j < 0) j = 0; else if (j >= B) j = B - 1;
    sum[j] += raw[x]; cnt[j]++;
  }
  const avg = new Float64Array(B);
  for (let j = 0; j < B; j++) avg[j] = cnt[j] ? sum[j] / cnt[j] : -1;
  let jb = 0;
  for (let j = 1; j < B; j++) if (avg[j] > avg[jb]) jb = j;
  if (avg[jb] <= 0) return 1;
  let jn = -1;
  if (B > 6) {
    const jl = (jb + B - 1) % B, jr = (jb + 1) % B;
    jn = avg[jl] >= avg[jr] ? jl : jr;
  }
  let on = avg[jb], onN = 1, off = 0, offN = 0;
  if (jn >= 0 && avg[jn] >= 0) { on += avg[jn]; onN++; }
  for (let j = 0; j < B; j++) {
    if (j === jb || j === jn || avg[j] < 0) continue;
    off += avg[j]; offN++;
  }
  if (!offN || off <= 1e-9) return 1;
  return (on / onN) / (off / offN);
}

function dftBin(ctr, p) {
  const arr = ctr.arr, n = arr.length;
  const t = -2 * Math.PI / p;
  const cs = Math.cos(t), sn = Math.sin(t);
  let cr = 1, ci = 0, re = 0, im = 0;
  for (let x = 0; x < n; x++) {
    const v = arr[x];
    re += v * cr; im += v * ci;
    const nr = cr * cs - ci * sn;
    ci = cr * sn + ci * cs;
    cr = nr;
  }
  let phase = p * Math.atan2(-im, re) / (2 * Math.PI);
  phase = ((phase % p) + p) % p;
  return { p, r: Math.hypot(re, im) / ctr.total, phase };
}

function fftProfile(ctr) {
  const n = ctr.arr.length;
  let size = 1;
  while (size < n * 2) size *= 2;
  const re = new Float64Array(size), im = new Float64Array(size);
  re.set(ctr.arr);
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) {
      const tmp = re[i]; re[i] = re[j]; re[j] = tmp;
    }
  }
  for (let len = 2; len <= size; len *= 2) {
    const half = len >> 1, angle = -2 * Math.PI / len;
    const stepR = Math.cos(angle), stepI = Math.sin(angle);
    for (let start = 0; start < size; start += len) {
      let wr = 1, wi = 0;
      for (let j = 0; j < half; j++) {
        const a = start + j, b = a + half;
        const tr = re[b] * wr - im[b] * wi;
        const ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti;
        re[a] += tr; im[a] += ti;
        const nextR = wr * stepR - wi * stepI;
        wi = wr * stepI + wi * stepR;
        wr = nextR;
      }
    }
  }
  return { re, im, size };
}

const DP_MIN_PERIOD = 1.8;

function refinePeriod(ctr, p0, half) {
  let pick = dftBin(ctr, p0);
  for (let pass = 0; pass < 3; pass++) {
    const sub = half / 8;
    let best = pick;
    for (let p = pick.p - half; p <= pick.p + half + 1e-12; p += sub) {
      if (p < DP_MIN_PERIOD) continue;
      const c = dftBin(ctr, p);
      if (c.r > best.r) best = c;
    }
    pick = best;
    half = sub;
  }
  return pick;
}

function detectPeriod(ctr, maxPeriod) {
  const n = ctr.arr.length;
  const pMax = Math.min(maxPeriod, n / 6);
  if (pMax <= DP_MIN_PERIOD) return null;
  const { re, im, size } = fftProfile(ctr);
  const cands = [];
  const kLo = Math.ceil(size / pMax), kHi = Math.floor(size / DP_MIN_PERIOD);
  for (let k = kLo; k <= kHi; k++) {
    const p = size / k;
    let phase = p * Math.atan2(-im[k], re[k]) / (2 * Math.PI);
    phase = ((phase % p) + p) % p;
    cands.push({ p, r: Math.hypot(re[k], im[k]) / ctr.total, phase });
  }
  if (cands.length < 3) return null;
  let best = cands[0];
  for (const c of cands) if (c.r > best.r) best = c;
  const peaks = [];
  for (let i = 1; i < cands.length - 1; i++) {
    const c = cands[i];
    if (c.r >= best.r * 0.25 && c.r >= cands[i - 1].r && c.r >= cands[i + 1].r) peaks.push(c);
  }
  if (!peaks.length) peaks.push(best);
  peaks.sort((a, b) => b.r - a.r);
  const tries = peaks.slice(0, 20).map((c) => c.p);
  for (const c of peaks.slice(0, 6)) for (const k of [2, 3]) {
    if (c.p * k <= pMax) tries.push(c.p * k);
  }
  let bestScored = null;
  const scored = [];
  for (const p0 of tries) {
    const ref = refinePeriod(ctr, p0, p0 * p0 / size * 1.5);
    ref.score = combScore(ctr.raw, ref.p);
    scored.push(ref);
    if (!bestScored || ref.score > bestScored.score) bestScored = ref;
  }
  if (!bestScored) return null;
  let bestScore = 0;
  for (const c of scored) if (c.score > bestScore) bestScore = c.score;
  let valid = scored.filter((c) => c.score >= Math.max(bestScore * 0.8, 1.12));
  if (!valid.length) valid = scored;
  let bestR = 0;
  for (const c of valid) if (c.r > bestR) bestR = c.r;
  let pick = null;
  for (const c of valid) {
    if (c.r >= bestR * 0.6 && (!pick || c.p > pick.p)) pick = c;
  }
  return pick || bestScored;
}

function cellEdges(len, p, phase) {
  let first = phase % p;
  if (first < 0) first += p;
  const list = [];
  for (let e = first; e < len - 1e-6; e += p) list.push(e);
  if (!list.length) return [0, len];
  if (list[0] > 0.5 * p) list.unshift(0); else list[0] = 0;
  if (len - list[list.length - 1] > 0.5 * p) list.push(len);
  else list[list.length - 1] = len;
  return list.length >= 2 ? list : [0, len];
}

function insetRange(a, b, len) {
  const inset = Math.min((b - a) * 0.28, 1.25);
  let s = Math.ceil(a + inset - 1e-6);
  let e = Math.floor(b - inset + 1e-6);
  if (e <= s) { s = Math.floor((a + b) / 2); e = s + 1; }
  s = Math.max(0, Math.min(len - 1, s));
  e = Math.max(s + 1, Math.min(len, e));
  return [s, e];
}

function resample(srcData, w, h, ex, ey) {
  const outW = ex.length - 1, outH = ey.length - 1;
  const out = new ImageData(outW, outH);
  const od = out.data;
  const buckets = new Map();
  const xr = [];
  for (let cx = 0; cx < outW; cx++) xr.push(insetRange(ex[cx], ex[cx + 1], w));
  for (let cy = 0; cy < outH; cy++) {
    const [y0, y1] = insetRange(ey[cy], ey[cy + 1], h);
    for (let cx = 0; cx < outW; cx++) {
      const x0 = xr[cx][0], x1 = xr[cx][1];
      buckets.clear();
      let total = 0, opaque = 0, bestN = 0, bestBucket = null;
      for (let y = y0; y < y1; y++) {
        const row = y * w;
        for (let x = x0; x < x1; x++) {
          const i = (row + x) * 4;
          total++;
          if (srcData[i + 3] < 128) continue;
          opaque++;
          const r = srcData[i], g = srcData[i + 1], b = srcData[i + 2];
          const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
          let e = buckets.get(key);
          if (e) { e[0]++; e[1] += r; e[2] += g; e[3] += b; }
          else { e = [1, r, g, b]; buckets.set(key, e); }
          if (e[0] > bestN) { bestN = e[0]; bestBucket = e; }
        }
      }
      const oi = (cy * outW + cx) * 4;
      if (!bestBucket || opaque * 2 < total) { od[oi + 3] = 0; continue; }
      od[oi] = Math.round(bestBucket[1] / bestBucket[0]);
      od[oi + 1] = Math.round(bestBucket[2] / bestBucket[0]);
      od[oi + 2] = Math.round(bestBucket[3] / bestBucket[0]);
      od[oi + 3] = 255;
    }
  }
  return out;
}

function despeckle(imageData, strength) {
  if (!strength) return 0;
  const w = imageData.width, h = imageData.height, d = imageData.data;
  const src = new Uint8ClampedArray(d);
  const minKeep = strength >= 2 ? 2 : 1;
  const key = (i) => src[i * 4 + 3] < 8 ? -1
    : ((src[i * 4] << 16) | (src[i * 4 + 1] << 8) | src[i * 4 + 2]) >>> 0;
  let changed = 0;
  const tally = new Map();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const me = key(i);
      if (me < 0) continue;
      tally.clear();
      let same = 0, bestK = -1, bestN = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const k = key(ny * w + nx);
          if (k < 0) continue;
          if (k === me) { same++; continue; }
          const n = (tally.get(k) || 0) + 1;
          tally.set(k, n);
          if (n > bestN) { bestN = n; bestK = k; }
        }
      }
      if (same >= minKeep || bestK < 0 || bestN < 2) continue;
      d[i * 4] = (bestK >> 16) & 255;
      d[i * 4 + 1] = (bestK >> 8) & 255;
      d[i * 4 + 2] = bestK & 255;
      changed++;
    }
  }
  return changed;
}

function edgeToInt(edges, len) {
  const b = new Int32Array(edges.length);
  for (let i = 0; i < edges.length; i++) b[i] = Math.round(edges[i]);
  b[0] = 0;
  b[b.length - 1] = len;
  for (let i = 1; i < b.length; i++) if (b[i] < b[i - 1]) b[i] = b[i - 1];
  return b;
}

function expandCells(cells, ex, ey, w, h) {
  const bx = edgeToInt(ex, w), by = edgeToInt(ey, h);
  const out = new ImageData(w, h);
  const od = out.data, cd = cells.data, cw = cells.width;
  for (let cy = 0; cy < cells.height; cy++) {
    for (let cx = 0; cx < cw; cx++) {
      const s = (cy * cw + cx) * 4;
      const r = cd[s], g = cd[s + 1], b = cd[s + 2], a = cd[s + 3];
      for (let y = by[cy]; y < by[cy + 1]; y++) {
        let d = (y * w + bx[cx]) * 4;
        for (let x = bx[cx]; x < bx[cx + 1]; x++) {
          od[d] = r; od[d + 1] = g; od[d + 2] = b; od[d + 3] = a;
          d += 4;
        }
      }
    }
  }
  return out;
}

function applyPalette(im, opts) {
  const limit = Number(opts.colors) || 0;
  if (opts.palette === "resurrect64") {
    snapToPalette(im, RESURRECT_64);
    if (limit && limit < 64) reduceColors(im, limit);
  } else if (limit > 0) {
    reduceColors(im, limit);
  }
}

function depixel(src, opts) {
  const sw = src.width, sh = src.height;
  const before = countColors(src);

  if (opts.mode === "color") {
    const out = new ImageData(new Uint8ClampedArray(src.data), sw, sh);
    applyPalette(out, opts);
    const specks = despeckle(out, Number(opts.despeckle) || 0);
    return { out, info: { mode: "color", w: sw, h: sh, before, after: countColors(out), specks } };
  }

  const ctrX = centerProfile(edgeProfile(src.data, sw, sh, 0));
  const ctrY = centerProfile(edgeProfile(src.data, sw, sh, 1));
  if (!ctrX || !ctrY) throw new Error("整张图没有任何颜色变化，无法检测网格。");
  const maxP = Math.max(DP_MIN_PERIOD, Math.min(96, Math.min(sw, sh) / 6));
  const manW = Number(opts.blockW) || 0;
  const manH = Number(opts.blockH) || 0;
  const fixed = (ctr, p) => { const c = dftBin(ctr, p); c.score = combScore(ctr.raw, p); return c; };
  let dx = manW >= DP_MIN_PERIOD ? fixed(ctrX, manW) : detectPeriod(ctrX, maxP);
  let dy = manH >= DP_MIN_PERIOD ? fixed(ctrY, manH) : detectPeriod(ctrY, maxP);
  if (!dx || !dy) throw new Error("图片太小或没有可辨认的网格，请用 --block-w / --block-h 手动指定。");

  if (!manW && !manH && Math.abs(dx.p - dy.p) <= 0.06 * Math.max(dx.p, dy.p)) {
    const p = (dx.p * dx.r + dy.p * dy.r) / (dx.r + dy.r);
    dx = fixed(ctrX, p);
    dy = fixed(ctrY, p);
  }

  const phaseX = opts.phaseX == null || opts.phaseX === "" ? dx.phase : Number(opts.phaseX);
  const phaseY = opts.phaseY == null || opts.phaseY === "" ? dy.phase : Number(opts.phaseY);
  if (!isFinite(phaseX) || !isFinite(phaseY)) throw new Error("相位必须是数字，留空表示自动。");

  const ex = cellEdges(sw, dx.p, phaseX);
  const ey = cellEdges(sh, dy.p, phaseY);
  const outW = ex.length - 1, outH = ey.length - 1;
  if (outW < 1 || outH < 1 || outW > sw || outH > sh) {
    throw new Error("推算出的输出尺寸不合理（" + outW + " × " + outH + "），请检查块大小。");
  }

  const score = Math.min(dx.score, dy.score);
  const weak = score < 1.35 || Math.min(dx.r, dy.r) < 0.10;

  const cells = resample(src.data, sw, sh, ex, ey);
  applyPalette(cells, opts);
  const specks = despeckle(cells, Number(opts.despeckle) || 0);
  const keepSize = opts.mode !== "down";
  const out = keepSize ? expandCells(cells, ex, ey, sw, sh) : cells;

  return {
    out,
    info: {
      mode: opts.mode, w: out.width, h: out.height, before, after: countColors(cells), specks,
      blockW: dx.p, blockH: dy.p, phaseX, phaseY, gridW: outW, gridH: outH,
      confidence: Math.max(0, Math.round((1 - 1 / Math.max(score, 1)) * 100)),
      weak,
    },
  };
}

// ---------- 导出放大（最近邻） ----------

function upscale(im, scale) {
  if (!scale || scale <= 1) return im;
  const w = im.width, h = im.height, s = Math.round(scale);
  const out = new ImageData(w * s, h * s);
  const od = out.data, d = im.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      for (let dy = 0; dy < s; dy++) {
        let o = ((y * s + dy) * w * s + x * s) * 4;
        for (let dx = 0; dx < s; dx++) {
          od[o] = d[i]; od[o + 1] = d[i + 1]; od[o + 2] = d[i + 2]; od[o + 3] = d[i + 3];
          o += 4;
        }
      }
    }
  }
  return out;
}

// ---------- CLI ----------

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-o" || a === "--out") opts.out = argv[++i];
    else if (a === "--width") opts.width = Number(argv[++i]);
    else if (a === "--height") opts.height = Number(argv[++i]);
    else if (a === "--sample") opts.sample = argv[++i];
    else if (a === "--sat") opts.sat = Number(argv[++i]);
    else if (a === "--contrast") opts.contrast = Number(argv[++i]);
    else if (a === "--alpha") opts.alpha = Number(argv[++i]);
    else if (a === "--palette") opts.palette = argv[++i];
    else if (a === "--colors") opts.colors = Number(argv[++i]);
    else if (a === "--dither") opts.dither = argv[++i];
    else if (a === "--despeckle") opts.despeckle = Number(argv[++i]);
    else if (a === "--outline") opts.outline = argv[++i];
    else if (a === "--scale") opts.scale = Number(argv[++i]);
    else if (a === "--mode") opts.mode = argv[++i];
    else if (a === "--block-w") opts.blockW = Number(argv[++i]);
    else if (a === "--block-h") opts.blockH = Number(argv[++i]);
    else if (a === "--phase-x") opts.phaseX = argv[++i];
    else if (a === "--phase-y") opts.phaseY = argv[++i];
    else if (a === "-h" || a === "--help") opts.help = true;
    else opts._.push(a);
  }
  return opts;
}

const HELP = `pixelize.mjs — 高清图 → 像素图（提炼自 Frame-sequence 的「高清转像素」与「完美像素」节点）

用法:
  node tools/pixelize.mjs hd <in.png> [选项]      高清转像素（默认子命令）
  node tools/pixelize.mjs perfect <in.png> [选项] 完美像素（AI 像素风图对齐真实网格）

hd 选项:
  --width N        目标宽（默认 64；--height 0 = 按比例）
  --height N       目标高（0 = 按比例，默认 0）
  --sample S       dominant（主色，默认）| average（平均色）
  --sat N          饱和度 %（默认 115）
  --contrast N     对比度 %（默认 105）
  --alpha N        透明阈值 1-255（默认 128）
  --palette P      adaptive（自适应，默认）| resurrect64 | endesga32 | sweetie16 | db32 | pico8 | gray16
  --colors N       自适应色数（默认 24）
  --dither D       none | bayer | fs
  --despeckle N    0 关 | 1 弱 | 2 强（默认 1）
  --outline O      none（默认）| dark（色板最深色）| black
  --scale N        导出放大倍数（最近邻，方便查看）
  -o, --out FILE   输出路径（默认 <in>.pixel.png）

perfect 选项:
  --mode M         color（只去杂色）| same（对齐网格保持原尺寸）| down（缩成 1:1 真像素，默认 down）
  --colors N       目标色数（0 = 不限，默认 64）
  --palette P      adaptive（默认）| resurrect64
  --despeckle N    0 | 1（默认）| 2
  --block-w N      手动块宽（0 = 自动检测）
  --block-h N      手动块高（0 = 自动检测）
  --phase-x N      相位 X（缺省自动）
  --phase-y N      相位 Y（缺省自动）
  --scale N        导出放大倍数
  -o, --out FILE   输出路径
`;

function main() {
  const argv = process.argv.slice(2);
  let cmd = "hd";
  if (argv.length && (argv[0] === "hd" || argv[0] === "perfect")) cmd = argv.shift();
  const opts = parseArgs(argv);
  if (opts.help || !opts._.length) {
    process.stdout.write(HELP);
    process.exit(opts.help ? 0 : 1);
  }
  const input = opts._[0];
  const buf = fs.readFileSync(input);
  const src = decodePNG(buf);

  let im, info;
  if (cmd === "hd") {
    const r = pixelizeAll([src], opts);
    im = r.outs[0];
    info = r.info;
    console.log(`原图 ${info.srcW}×${info.srcH} → 像素图 ${info.w}×${info.h} · ${info.colors} 色（色板 ${info.palette}）· 清杂点 ${info.specks} px`);
  } else {
    if (!opts.mode) opts.mode = "down";
    const r = depixel(src, opts);
    im = r.out;
    info = r.info;
    if (info.mode === "color") {
      console.log(`只去杂色：${info.before} → ${info.after} 色 · 尺寸不变 ${info.w}×${info.h} · 清噪点 ${info.specks}`);
    } else {
      console.log(`检测网格：块 ${info.blockW.toFixed(2)}×${info.blockH.toFixed(2)} · 相位 ${info.phaseX.toFixed(2)}/${info.phaseY.toFixed(2)} · ${info.gridW}×${info.gridH} 格 · 置信度 ${info.confidence}%${info.weak ? "（弱，建议手动指定块大小）" : ""}`);
      console.log(`颜色 ${info.before} → ${info.after} · 输出 ${info.w}×${info.h}${info.mode === "down" ? "（1:1 真像素）" : "（保持原尺寸）"}`);
    }
  }

  const outIm = upscale(im, opts.scale || 0);
  const outPath = opts.out || input.replace(/\.png$/i, "") + (cmd === "hd" ? ".pixel.png" : ".perfect.png");
  fs.writeFileSync(outPath, encodePNG(outIm));
  console.log("已写出：" + outPath);
}

main();
