import { fit, TAU } from "../../core/index.js";
import { Grid, shift } from "./_lib.js";

// A pixel scarecrow matched to the reference sheet: square burlap head with X eyes and a barred mouth,
// a square body with a red spiral patch, straw bundles at the wrists, a wooden post, and drifting flecks.
// Coordinates are local to the origin at (71, 152); the grid starts at (0,0) on that canvas.

export const meta = {
  name: "Scarecrow (hy4flash)",
  desc: "A square burlap scarecrow with X eyes, a red spiral patch, straw hands and a swaying post.",
  tags: ["critter", "scarecrow", "farm", "loop", "pixel"],
  size: [142, 166],
  origin: [71, 152],
  duration: 3.2,
  loop: true,
  fps: 30,
  bg: "ground",
  options: {
    palette: ["#86643a", "#b38b57", "#c9a26c"],
    straw: ["#a0703a", "#d2aa55", "#f0d98a"],
    wood: ["#4e331f", "#724c2e", "#a0703a"],
    patch: ["#6e1f2a", "#9a2f3c", "#c4434f"],
    seed: 1,
    sway: 1,
  },
};

const D = meta.duration;
const GRID = new Grid(0, 0, 142, 166);
const OX = meta.origin[0], OY = meta.origin[1];
const INK = "#1a1108";
const SEAM = "#4e331f";

// Fixed envelope for each straw bundle: [top offset, bottom offset] per column.
const STRAW_TOPS = [65, 60, 60, 62, 60, 64, 65, 60, 61, 61, 64, 62, 65, 60, 60, 60, 64];
const STRAW_BOTTOMS = [89, 86, 89, 89, 86, 88, 87, 85, 89, 89, 88, 84, 84, 85, 88, 86, 88];

const hash = (x, y) => {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
};

// Lean increases toward the head; both sine terms repeat an integer number of times per loop.
function swayAt(y, t, amp) {
  const w = (t / D) * TAU;
  const k = Math.min(1, Math.max(0, (152 - y) / 150));
  return amp * 1.1 * k * k * (Math.sin(w) + 0.3 * Math.sin(2 * w + 0.4));
}

function weave(c, x, y, hi, lo) {
  const h = hash(x, y);
  return h > 0.94 ? hi : h < 0.08 ? lo : c;
}

export function draw(p, time, o) {
  const t = shift(time, D, o.seed);
  const K = fit(o.palette, 3);   // dark, mid, light burlap
  const S = fit(o.straw, 3);
  const W = fit(o.wood, 3);
  const R = fit(o.patch, 3);
  const amp = o.sway ?? 1;
  const g = GRID;
  g.clear();

  const hx = (y) => Math.round(swayAt(y - 5, t, amp));
  const by = (y) => Math.round(swayAt(y, t, amp));
  const hd = hx(43), bd = by(92);

  // Wooden post: warm front on the left two thirds, one dark step on the right.
  const pole = by(140);
  for (let y = 122; y <= 152; y++) {
    const x0 = 64 + pole;
    for (let x = x0; x <= x0 + 15; x++) g.set(x, y, x <= x0 + 10 ? W[2] : x <= x0 + 14 ? W[1] : SEAM);
  }

  // Crossbars and the dark wooden end that meets each straw hand.
  for (const side of [-1, 1]) {
    const y = 69 + Math.round(by(73));
    for (let x = side < 0 ? 30 : 99; x <= (side < 0 ? 47 : 116); x++) {
      g.set(x, y - 1, side < 0 ? W[1] : SEAM);
      g.set(x, y, side < 0 ? W[1] : W[0]);
      g.set(x, y + 1, side < 0 ? W[1] : W[0]);
      g.set(x, y + 2, SEAM);
    }
  }

  // Alternating straw fringe at the neck.
  for (let x = 50 + hd; x <= 96 + hd; x++) {
    if (hash(x, 7) > 0.4) {
      g.set(x, 61, S[1]);
      g.set(x, 62, S[2]);
      g.set(x, 63, S[0]);
    }
  }

  // Square body: bright left strip, mid front, dark right quarter, dark hem.
  g.shade(45 + bd, 64, 101 + bd, 119, (x, y, out) => {
    if (x < 47 + bd || x > 99 + bd || y < 66 || y > 117) return 0;
    let c = K[1];
    if (x <= 49 + bd) c = K[2];
    if (x >= 87 + bd) c = K[0];
    if (y >= 112) c = K[0];
    out.a = 1;
    return weave(c, x, y, K[2], K[0]);
  });

  // Square head: bright left strip, mid front, dark right quarter, dark lower band.
  g.shade(48 + hd, 22, 98 + hd, 63, (x, y, out) => {
    if (x < 50 + hd || x > 96 + hd || y < 24 || y > 61) return 0;
    let c = K[1];
    if (x <= 54 + hd) c = K[2];
    if (x >= 83 + hd) c = "#a0703a";
    if (y >= 56) c = "#a0703a";
    out.a = 1;
    return weave(c, x, y, K[2], K[0]);
  });

  // X eyes: two solid diagonal strokes per eye.
  for (const [ex, ey] of [[63 + hd, 38], [83 + hd, 38]]) {
    for (let k = -6; k <= 6; k++) {
      const d = Math.abs(k);
      if (d === 6) continue;
      const y = ey + Math.round(k * 0.65);
      g.set(ex + k, y, INK);
      g.set(ex - k, y, INK);
    }
  }

  // Two seam lines across the head, with vertical stitches in the mouth band.
  for (let x = 50 + hd; x <= 96 + hd; x++) {
    g.set(x, 44, SEAM);
    g.set(x, 45, SEAM);
    g.set(x, 49, SEAM);
    g.set(x, 50, SEAM);
  }
  for (const x of [56 + hd, 64 + hd, 72 + hd, 80 + hd, 88 + hd]) {
    for (let y = 51; y <= 55; y++) g.set(x, y, INK);
  }

  // Red spiral patch: a thick ring that curls inward to a small dark core.
  const cx = 75 + bd, cy = 90;
  for (let y = 76; y <= 104; y++) {
    for (let x = 64; x <= 86; x++) {
      const dx = x - cx, dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= 72 && d2 <= 124) g.set(x + bd, y, R[2]);
      else if (d2 >= 32 && d2 < 72 && dx > -3) g.set(x + bd, y, R[1]);
      else if (d2 >= 36 && d2 < 68 && dx <= -3) g.set(x + bd, y, R[2]);
      else if (d2 >= 10 && d2 < 36 && dx > 1) g.set(x + bd, y, R[0]);
      else if (d2 >= 12 && d2 < 36 && dx <= 1) g.set(x + bd, y, R[1]);
    }
  }
  for (let y = 88; y <= 93; y++) for (let x = 74; x <= 80; x++) g.set(x + bd, y, R[0]);

  // Stitch rows around the hem.
  for (let x = 47 + by(90); x <= 99 + by(90); x++) {
    if (hash(x, 90) > 0.5) { g.set(x, 112, S[2]); g.set(x, 113, S[2]); }
    else { g.set(x, 114, SEAM); g.set(x, 115, SEAM); }
  }

  // Straw bundles at each wrist: tall, loose tufts rather than solid blocks.
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? 18 : 104;
    const d = by(73);
    for (let i = 0; i < 17; i++) {
      const x = x0 + i + d;
      const top = STRAW_TOPS[i];
      const bottom = STRAW_BOTTOMS[i];
      for (let y = top; y <= bottom; y++) {
        const h = hash(x + i * 3, y);
        if (h > 0.78) g.set(x, y, S[2]);
        else if (h < 0.16) g.set(x, y, S[0]);
        else if (h < 0.92) g.set(x, y, S[1]);
      }
    }
    for (const [ox, oy] of [[5, 56], [7, 55], [9, 57], [11, 55], [7, 92], [9, 93]]) {
      g.set(x0 + ox + d, oy, S[2]);
    }
  }

  // A 1 px outline around the whole silhouette only.
  const solid = g.c.slice();
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const i = y * g.w + x;
      if (solid[i]) continue;
      const l = x > 0 && solid[i - 1], r = x < g.w - 1 && solid[i + 1];
      const u = y > 0 && solid[i - g.w], d = y < g.h - 1 && solid[i + g.w];
      if (l || r || u || d) g.set(x, y, INK);
    }
  }
  // The grid is built in reference-image coordinates; the painter places cells relative to meta.origin.
  g.draw(p, 1, -OX, -OY);

  // Loose straw above the head, around the neck, and by the post foot.
  const flecks = [
    [58, 21], [62, 21], [67, 21], [71, 21], [76, 21], [80, 21], [45, 34], [52, 40],
    [99, 30], [100, 35], [52, 125], [57, 128], [62, 130],
    [81, 128], [86, 125], [91, 128],
  ];
  for (const [x, y] of flecks) {
    const d = y < 66 ? hd : by(y);
    p.dot(Math.round(x + d) - OX, y - OY, (x + y) % 3 ? S[1] : S[2]);
  }

  // A few straw tufts tied around the post, densest at its foot.
  for (let i = 0; i < 12; i++) {
    const x = 52 + i * 3 + by(125);
    const y = 120 + Math.round(10 * hash(i, 25));
    p.dot(x - OX, y - OY, i % 3 ? S[1] : S[2]);
  }

  // A few flecks rise from the hands and fall back; three full turns per loop keeps it seamless.
  for (let i = 0; i < 4; i++) {
    const a = (t / D) * TAU * 3 + i * 1.7;
    const side = i % 2 ? 1 : -1;
    const x = 71 + side * (42 + 4 * Math.sin(a)) + by(83);
    const y = 83 + 18 * Math.sin(a + i);
    p.dot(Math.round(x) - OX, Math.round(y) - OY, i % 2 ? S[1] : S[2]);
  }
}
