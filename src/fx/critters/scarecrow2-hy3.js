import { fit, clamp, TAU, cycle, hex } from "../../core/index.js";
import { Grid, shift } from "./_lib.js";

export const meta = {
  name: "Scarecrow (PixelPuppet)",
  desc: "A square-faced burlap scarecrow with X eyes, a red spiral patch, straw hands and a gentle looping sway.",
  tags: ["critter", "scarecrow", "loop"],
  size: [142, 166],
  origin: [71, 152],
  duration: 3.2,
  loop: true,
  fps: 30,
  bg: "ground",
  options: {
    palette: ["#c9a26c", "#b38b57", "#86643a", "#a0703a", "#4e331f", "#1a1108"],
    straw: ["#f0d98a", "#d2aa55", "#a0703a"],
    wood: ["#a0703a", "#724c2e", "#4e331f"],
    patch: ["#c4434f", "#9a2f3c", "#6e1f2a"],
    seed: 1,
  },
};

const OX = 71;
const OY = 152;

const DEFAULT = {
  palette: ["#c9a26c", "#b38b57", "#86643a", "#a0703a", "#4e331f", "#1a1108"],
  straw: ["#f0d98a", "#d2aa55", "#a0703a"],
  wood: ["#a0703a", "#724c2e", "#4e331f"],
  patch: ["#c4434f", "#9a2f3c", "#6e1f2a"],
};

function asColor(v, fallback) {
  if (typeof v === "string") return hex(v);
  if (typeof v === "number") return v;
  return hex(fallback);
}

function hash(x, y, seed = 1) {
  let h = Math.imul((x | 0) ^ Math.imul(seed | 0, 0x9e3779b1), 0x85ebca6b);
  h ^= Math.imul((y | 0) ^ 0x165667b1, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2d);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

function cloth(x, y, base, light, dark, seed) {
  const h = hash(x, y, seed);
  if (h < 0.08) return dark;
  if (h < 0.2) return light;
  return base;
}

function distToSeg(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len = vx * vx + vy * vy;
  const t = clamp((wx * vx + wy * vy) / (len || 1), 0, 1);
  const dx = px - (ax + vx * t);
  const dy = py - (ay + vy * t);
  return Math.sqrt(dx * dx + dy * dy);
}

export function draw(p, time, o = meta.options) {
  const opts = Object.assign({}, meta.options, o || {});
  const pal = opts.palette || DEFAULT.palette;
  const straw = opts.straw || DEFAULT.straw;
  const wood = opts.wood || DEFAULT.wood;
  const patch = opts.patch || DEFAULT.patch;
  const seed = opts.seed | 0;

  const C = {
    sackHi: asColor(pal[0], "#c9a26c"),
    sackMid: asColor(pal[1], "#b38b57"),
    sackDark: asColor(pal[2], "#86643a"),
    headDark: asColor(pal[3], "#a0703a"),
    seam: asColor(pal[4], "#4e331f"),
    black: asColor(pal[5], "#1a1108"),
    strawHi: asColor(straw[0], "#f0d98a"),
    strawMid: asColor(straw[1], "#d2aa55"),
    strawDark: asColor(straw[2], "#a0703a"),
    woodHi: asColor(wood[0], "#a0703a"),
    woodMid: asColor(wood[1], "#724c2e"),
    woodDark: asColor(wood[2], "#4e331f"),
    patchBright: asColor(patch[0], "#c4434f"),
    patchMid: asColor(patch[1], "#9a2f3c"),
    patchDeep: asColor(patch[2], "#6e1f2a"),
  };

  const u = shift(time, meta.duration, seed);
  const sway = Math.round(Math.sin(TAU * u) * 0.85 + Math.sin(TAU * 2 * u) * 0.25);
  const g = new Grid(-75, -160, 150, 166);

  const X = (x) => x - OX + sway;
  const Y = (y) => y - OY;
  const put = (x, y, c, a = 1) => g.set(X(x), Y(y), c, a);
  const line = (x0, y0, x1, y1, c, a = 1) => g.line(X(x0), Y(y0), X(x1), Y(y1), c, a);
  const shadeBox = (x0, y0, x1, y1, fn) => {
    g.shade(X(x0), Y(y0), X(x1), Y(y1), (gx, gy, out) => {
      return fn(Math.floor(gx) + OX - sway, Math.floor(gy) + OY, out);
    });
  };

  function drawPole() {
    shadeBox(64, 118, 79, 152, (x, y) => {
      if (x === 64 || x === 79 || y === 118 || y === 152) return C.seam;
      if (x >= 75) return y === 119 ? C.woodMid : C.woodDark;
      if (x <= 73) return cloth(x, y, C.woodHi, C.woodHi, C.woodMid, seed + 31);
      return C.woodMid;
    });
    for (let y = 121; y < 150; y += 5) {
      put(66, y, C.woodMid);
      put(70, y + 2, C.woodDark);
    }
  }

  function drawWoodBar(x0, y0, x1, y1, darkSide) {
    shadeBox(x0, y0, x1, y1, (x, y) => {
      if (x === x0 || x === x1 || y === y0 || y === y1) return C.seam;
      if (darkSide) {
        if (x >= x1 - 3) return C.woodDark;
        if (y === y0 + 1) return C.woodHi;
        if (y === y1 - 1) return C.woodDark;
        return C.woodMid;
      }
      if (y === y0 + 1) return C.woodHi;
      if (y === y1 - 1) return C.woodDark;
      return x < x1 - 3 ? C.woodHi : C.woodMid;
    });
    for (let x = x0 + 3; x < x1 - 1; x += 5) {
      put(x, y0 + 1, darkSide ? C.woodDark : C.woodMid);
      put(x + 1, y1 - 1, C.woodDark);
    }
  }

  function drawStrawBundle(cx, phase) {
    const x0 = cx - 10;
    const x1 = cx + 10;
    shadeBox(x0, 72, x1, 89, (x, y) => {
      if (x === x0 || x === x1 || y === 89) return C.strawDark;
      const h = hash(x + cx * 7, y - 72, seed + 3);
      if (h < 0.22) return C.strawHi;
      if (h < 0.45) return C.strawDark;
      return C.strawMid;
    });
    for (let i = 0; i <= 10; i++) {
      const x = x0 + i * 2;
      const h = hash(i, cx, seed + 4);
      const top = 59 + Math.floor(h * 7);
      const lean = Math.round(Math.sin(TAU * u + phase + i * 0.53));
      const c = i % 3 === 0 ? C.strawHi : i % 3 === 1 ? C.strawMid : C.strawDark;
      line(x, 76, x + lean, top, c);
      line(x, 82, x - lean, top + 5, c);
      if (i % 2 === 0) put(x + (x >= cx ? -1 : 1), top + 2, C.strawHi);
    }
  }

  function drawBody() {
    shadeBox(47, 66, 99, 117, (x, y) => {
      if (x === 47 || x === 99 || y === 66 || y === 117) return C.seam;
      if (x <= 50) return cloth(x, y, C.sackHi, C.sackHi, C.sackMid, seed);
      if (x <= 86) return cloth(x, y, C.sackMid, C.sackHi, C.sackDark, seed);
      return cloth(x, y, C.sackDark, C.headDark, C.woodDark, seed + 1);
    });
  }

  function drawSpiral(c, radius) {
    const ir = Math.ceil(radius);
    const r2 = radius * radius;
    for (let i = 0; i <= 280; i++) {
      const t = i / 280;
      const a = -Math.PI / 2 + t * TAU * 2.12;
      const rx = 1.3 + 7.2 * t;
      const ry = 1.6 + 10.2 * t;
      const sx = Math.round(75 + Math.cos(a) * rx);
      const sy = Math.round(90 + Math.sin(a) * ry);
      for (let yy = -ir; yy <= ir; yy++) {
        for (let xx = -ir; xx <= ir; xx++) {
          if (xx * xx + yy * yy > r2) continue;
          const px = sx + xx;
          const py = sy + yy;
          if (Math.hypot((px - 75) / 11, (py - 90) / 14) <= 0.86) put(px, py, c);
        }
      }
    }
  }

  function drawPatch() {
    shadeBox(64, 76, 86, 104, (x, y) => {
      const nx = (x - 75) / 11;
      const ny = (y - 90) / 14;
      const rr = Math.hypot(nx, ny);
      if (rr > 1) return 0;
      if (rr > 0.86) return C.patchDeep;
      const h = hash(x + 370, y + 511, seed + 6);
      if (h < 0.12) return C.patchBright;
      if (h < 0.23) return C.patchDeep;
      return C.patchMid;
    });
    drawSpiral(C.patchDeep, 1.8);
    drawSpiral(C.patchBright, 0.65);
    for (let y = 88; y <= 93; y++) {
      for (let x = 74; x <= 80; x++) put(x, y, C.patchDeep);
    }
    put(75, 89, C.patchMid);
    put(76, 89, C.patchMid);
    put(75, 90, C.patchMid);
  }

  function drawBodySeam() {
    for (let x = 48; x <= 98; x++) {
      if (x % 4 < 2) {
        put(x, 113, C.seam);
        put(x, 116, C.seam);
      } else if (x % 4 === 2) {
        put(x, 114, C.black);
        put(x, 115, C.black);
      }
    }
    for (let x = 49; x <= 98; x += 6) put(x, 117, C.black);
  }

  function drawX(x0, y0, x1, y1) {
    shadeBox(x0, y0, x1, y1, (x, y) => {
      const d1 = distToSeg(x, y, x0, y0, x1, y1);
      const d2 = distToSeg(x, y, x1, y0, x0, y1);
      return Math.min(d1, d2) <= 1.2 ? C.black : 0;
    });
  }

  function drawMouth() {
    for (let x = 56; x <= 86; x++) {
      put(x, 51, C.black);
      put(x, 55, C.black);
    }
    for (let x = 56; x <= 86; x += 4) {
      put(x, 52, C.black);
      put(x + 2, 54, C.black);
    }
    for (const x of [64, 72, 80]) {
      for (let y = 51; y <= 55; y++) put(x, y, C.black);
    }
    for (let x = 58; x <= 84; x += 4) put(x, 53, C.seam);
  }

  function drawHead() {
    shadeBox(50, 24, 96, 61, (x, y) => {
      if (x === 50 || x === 96 || y === 24 || y === 61) return C.seam;
      if (x < 83) return cloth(x, y, C.sackHi, C.sackHi, C.sackMid, seed + 2);
      if (x <= 89) return cloth(x, y, C.headDark, C.sackMid, C.sackDark, seed + 3);
      return cloth(x, y, C.sackDark, C.headDark, C.woodDark, seed + 4);
    });

    for (const y of [44, 45, 49, 50]) {
      for (let x = 50; x <= 96; x++) put(x, y, x % 8 < 2 ? C.black : C.seam);
    }

    drawX(56, 32, 70, 43);
    drawX(76, 32, 90, 43);
    drawMouth();
  }

  function drawNeckGrass() {
    for (let x = 50; x <= 96; x += 2) {
      const h = hash(x, 7, seed + 11);
      const top = 61 + Math.floor(h * 3);
      const lean = Math.round(Math.sin(TAU * u + x * 0.43));
      const tip = clamp(x + lean, 50, 96);
      const c = x % 6 === 0 ? C.strawHi : x % 4 === 0 ? C.strawDark : C.strawMid;
      line(x, 65, tip, top, c);
      if (x % 4 === 0) put(clamp(x + 1, 50, 96), 63, C.strawHi);
    }
  }

  function drawRodGrass() {
    const clusters = [
      [64, 131, 12, 121, 7],
      [85, 131, 14, 122, 8],
      [62, 152, 10, 145, 11],
      [79, 152, 10, 144, 11],
      [89, 152, 10, 146, 10],
    ];
    for (let k = 0; k < clusters.length; k++) {
      const [cx, baseY, spread, topY, count] = clusters[k];
      for (let i = 0; i < count; i++) {
        const x = clamp(cx - spread + Math.floor((i / (count - 1)) * spread * 2), 52, 99);
        const h = hash(x + k * 17, baseY, seed + 12 + k);
        const top = topY + Math.floor(h * 4);
        const lean = Math.round(Math.sin(TAU * u + x * 0.41 + k * 0.9));
        const tip = clamp(x + lean, 52, 99);
        const c = (i + k) % 3 === 0 ? C.strawHi : (i + k) % 3 === 1 ? C.strawMid : C.strawDark;
        line(x, baseY, tip, top, c);
        if (i % 3 === 0) line(x, baseY - 2, clamp(x - lean, 52, 99), top + 5, C.strawDark);
      }
    }
  }

  function drawFloatingStraw() {
    const bits = [
      [15, 66, 0.2, C.strawHi],
      [41, 86, 1.4, C.strawMid],
      [125, 65, 2.1, C.strawHi],
      [102, 88, 3.3, C.strawMid],
      [58, 126, 4.2, C.strawDark],
      [94, 128, 5.1, C.strawHi],
    ];
    for (const [px, py, phase, c] of bits) {
      const x = Math.round(px + 4 * Math.sin(TAU * u + phase));
      const y = Math.round(py + 2 * Math.sin(TAU * 2 * u + phase * 1.7));
      put(x, y, c);
    }
  }

  drawPole();
  drawStrawBundle(28, 0.25);
  drawWoodBar(30, 69, 47, 77, false);
  drawStrawBundle(114, 1.75);
  drawWoodBar(99, 69, 117, 77, true);
  drawBody();
  drawPatch();
  drawBodySeam();
  drawHead();
  drawNeckGrass();
  drawRodGrass();
  drawFloatingStraw();
  g.draw(p);
}