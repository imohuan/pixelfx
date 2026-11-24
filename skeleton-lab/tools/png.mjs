// 最简 PNG 解码/编码（RGBA 8bit，支持彩色类型 6 和 2，filter 0-4）
import { inflateSync, deflateSync } from "node:zlib";

export function decodePng(buf) {
  if (buf.readUInt32BE(12) !== 0x49484452) throw new Error("no IHDR");
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const depth = buf[24], color = buf[25];
  if (depth !== 8) throw new Error("only 8bit depth");
  let channels;
  if (color === 6) channels = 4; else if (color === 2) channels = 3; else if (color === 3) channels = 1;
  else throw new Error("color type " + color + " not supported");
  // 收集 IDAT
  let pos = 8, idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString("ascii", pos + 4, pos + 8);
    if (type === "IDAT") idat.push(buf.subarray(pos + 8, pos + 8 + len));
    if (type === "IEND") break;
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const bpp = channels, stride = w * bpp;
  const out = Buffer.alloc(w * h * 4);
  const prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  let rp = 0;
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < h; y++) {
    const filter = raw[rp++];
    for (let i = 0; i < stride; i++) {
      const x = raw[rp + i];
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v;
      if (filter === 0) v = x;
      else if (filter === 1) v = x + a;
      else if (filter === 2) v = x + b;
      else if (filter === 3) v = x + ((a + b) >> 1);
      else v = x + paeth(a, b, c);
      cur[i] = v & 255;
    }
    rp += stride;
    for (let x = 0; x < w; x++) {
      const j = (y * w + x) * 4;
      if (channels === 4) { out[j] = cur[x*4]; out[j+1] = cur[x*4+1]; out[j+2] = cur[x*4+2]; out[j+3] = cur[x*4+3]; }
      else if (channels === 3) { out[j] = cur[x*3]; out[j+1] = cur[x*3+1]; out[j+2] = cur[x*3+2]; out[j+3] = 255; }
      else { out[j] = out[j+1] = out[j+2] = cur[x]; out[j+3] = 255; }
    }
    prev.set(cur);
  }
  return { w, h, data: out };
}

export function encodePng(w, h, rgba) {
  const crcTable = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) { raw[y * (1 + w * 4)] = 0; rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
