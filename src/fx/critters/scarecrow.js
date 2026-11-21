// A scarecrow, after the reference sheet: a flat burlap head with stitched X eyes and a barred mouth, a
// burlap body with a red coiled patch on the chest, stitched seams top and bottom, a straw bundle at each
// wrist, a plain pole, and straw flecks hanging in the air around it. It sways on its pole in the wind.
//
// The recipe is the slime's, and it is four steps:
//   1. shapes   - the head and body are boxes with rounded corners, the arms are bars, the hands are straw
//   2. shade    - every pixel gets a ramp step from a fake light in the top-left
//   3. outline  - one dark pixel around the whole silhouette, so it reads against any backdrop
//   4. draw     - put the grid on the painter, then the ground shadow and the floating straw

import { fit, clamp, wrap, TAU, cycle } from "../../core/index.js";
import { Grid, shift } from "./_lib.js";

export const meta = {
  name: "Scarecrow",
  desc: "A stitched burlap scarecrow sways on its pole: X eyes, a barred mouth, a red coiled patch, straw hands and flecks of straw on the wind.",
  tags: ["critter", "scarecrow", "farm", "idle", "wind", "loop"],
  size: [112, 108],
  origin: [56, 92],
  duration: 3.2,
  loop: true,
  fps: 30,
  bg: "ground",
  options: {
    cloth: ["#161009", "#221810", "#2e2114", "#3d2c1b", "#4e3924", "#60482e"],
    sack: ["#2a1d10", "#3f2d18", "#5b4426", "#86643a", "#b38b57", "#c9a26c"],
    straw: ["#4a3410", "#6f4f18", "#9a6f22", "#c0922f", "#d2aa55", "#f0d98a"],
    wood: ["#0e0803", "#18100a", "#1f150d", "#2a1c11", "#3a2717", "#4e331f"],
    patch: ["#3a1016", "#5e1a24", "#7a2431", "#9a2f3c", "#c4434f", "#e0717c"],
    sway: 1.8,
    seed: 1,
  },
};

const D = meta.duration;
const GRID = new Grid(-30, -86, 62, 90);

// A cheap stable hash in 0..1, for burlap stipple and straw placement.
const hash = (x, y) => {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
};

// How far the whole thing leans at height y: nothing at the pole's foot, most at the head.
const leanAt = (y, t, amp) => -amp * clamp(-y / 88, 0, 1) ** 2 * Math.sin((t / D) * TAU);
// The head sways a little later than the body, so the neck looks soft.
const headLean = (y, t, amp) => leanAt(y - 6, t - 0.12, amp * 1.25);

// A box with rounded corners, offset by lean.
function rbox(u, y, hw, y0, y1, r) {
  if (y < y0 || y > y1 || Math.abs(u) > hw) return false;
  const d = Math.min(y - y0, y1 - y);
  if (d >= r) return true;
  const k = r - d;
  return Math.abs(u) <= hw - (r - Math.sqrt(Math.max(0, r * r - k * k)));
}

// Ramp step from a fake light in the top-left: flat front faces, one step darker toward the bottom.
function lit(u, hw, y, y0, y1, n) {
  const side = u > hw - 2.2 ? 2 : 0;
  const down = clamp((y - y0) / (y1 - y0), 0, 1);
  const shade = down > 0.86 ? 2 : down > 0.45 ? 1 : 0;
  let i = n - 2 - side - shade;
  if (down > 0.45 && down <= 0.86 && side) i += 1;
  return clamp(i, 0, n - 1);
}

// Burlap weave: a light speckle plus slightly darker threads.
function weave(c, x, y) {
  const h = hash(x, y);
  return h > 0.9 ? Math.min(5, c + 1) : h < 0.08 ? Math.max(0, c - 1) : c;
}

export function draw(p, time, o) {
  const t = shift(time, D, o.seed);
  const C = fit(o.cloth, 6), K = fit(o.sack, 6), S = fit(o.straw, 6), W = fit(o.wood, 6), R = fit(o.patch, 6);
  const amp = o.sway * (0.8 + 0.2 * Math.sin((t / D) * TAU * 2));
  const g = GRID;
  g.clear();

  const HY0 = -86, HY1 = -62, HW = 14.5;   // head box
  const BY0 = -60, BY1 = -34, BW = 15.5;   // body box
  const leanHead = (y) => headLean(y, t, amp);
  const leanBody = (y) => leanAt(y, t, amp);

  // ---- 1. shapes
  // the pole: a plain brown post, lit on the left
  for (let y = -34; y <= 1; y++) {
    const u0 = leanAt(y, t, amp);
    for (let x = Math.round(u0) - 2; x <= Math.round(u0) + 2; x++) {
      const d = x - u0;
      g.set(x, y, d < -0.6 ? W[4] : d < 0.6 ? W[3] : W[2]);
    }
  }
  // straw shoulders: short tufts peeking out from under the head at each side
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const y = BY0 - 2 + k * 1.2;
      const x0 = side * (BW - 2.5), len = 4.5 - k * 0.4;
      g.line(x0, y, x0 + side * len, y - 1.5 + k * 0.6, k === 0 ? S[5] : S[4]);
    }
  }
  // arms: thin bars from the body out to the straw, a shade of wood
  for (const side of [-1, 1]) {
    for (let x = side * 13; Math.abs(x) <= 27; x += side) {
      const y = -48 + Math.round(leanBody(-48) * 0.5);
      g.set(x, y - 1, W[4]);
      g.set(x, y, W[5]);
      g.set(x, y + 1, W[3]);
    }
  }
  // body box
  g.shade(-BW - 2, BY0 - 1, BW + 2, BY1 + 1, (x, y, out) => {
    const u = x - leanBody(y);
    if (!rbox(u, y, BW, BY0, BY1, 2.2)) return 0;
    out.a = 1;
    return K[weave(lit(u, BW, y, BY0, BY1, 6), x, y)];
  });
  // head box
  g.shade(-HW - 2, HY0 - 1, HW + 2, HY1 + 1, (x, y, out) => {
    const u = x - leanHead(y);
    if (!rbox(u, y, HW, HY0, HY1, 2.2)) return 0;
    out.a = 1;
    return K[weave(lit(u, HW, y, HY0, HY1, 6), x, y)];
  });

  // ---- 2. stitching
  // the seam under the head, where the sack is cinched
  for (let x = -Math.round(BW) + 1; x <= Math.round(BW) - 1; x++) {
    if ((x & 1) === 0) continue;
    g.set(x, BY0 + 1, C[1]);
    g.set(x, BY0 + 2, C[1]);
  }
  // the seam along the hem, and the stitched vertical edges
  for (let x = -Math.round(BW) + 1; x <= Math.round(BW) - 1; x++) {
    if ((x & 1) === 0) continue;
    g.set(x, BY1 - 1, C[1]);
  }
  for (let y = BY0 + 5; y < BY1 - 4; y++) {
    if ((y & 1) === 0) continue;
    g.set(-Math.round(BW) + 1, y, C[1]);
    g.set(Math.round(BW) - 1, y, C[1]);
  }
  // fill the middle of each hand so the lashing reads against straw, not the night
  for (const side of [-1, 1]) {
    g.shade(side * 24, -51, side * 34, -44, (x, y) => {
      const d = ((x - side * 29) / 3.2) ** 2 + ((y + 47.6) / 2.6) ** 2;
      if (d > 1) return 0;
      return hash(x, y) > 0.72 ? S[5] : S[4];
    });
  }
  // the mouth: short dark bars between the head's stitches
  const mxl = Math.round(leanHead(-70));
  for (let bx = -2; bx <= 2; bx++) g.set(mxl + bx * 2, -70, C[0]);
  for (const bx of [-2, 2]) g.set(mxl + bx * 2, -69, C[0]);

  // X eyes, stitched with two crossing threads
  for (const side of [-1, 1]) {
    const ex = Math.round(leanHead(-77) + side * 7.6);
    // two short crossing threads, clipped to a 5x5 box so the X stays an X
    for (let k = -2; k <= 2; k++) {
      g.set(ex + k, -79 + k, C[0]);
      g.set(ex + k, -75 - k, C[0]);
    }
    g.set(ex - 2, -79, K[5]);
    g.set(ex + 2, -75, K[5]);
  }

  // the red coiled patch: a loop of thread, darker at the bottom, with a knot in the middle
  const px0 = Math.round(leanBody(-47)), py0 = -47;
  g.shade(px0 - 9, py0 - 9, px0 + 9, py0 + 9, (x, y) => {
    const dx = x - px0, dy = y - py0;
    const d = Math.hypot(dx, dy);
    if (d < 4.2 || d > 7.6) return 0;
    const a = Math.atan2(dy, dx);
    // leave a gap at the top of the loop, where the thread turns in
    if (a > -1.1 && a < -0.35 && d > 5.4) return 0;
    const i = dy > 2 ? 2 : dy > -2 ? 3 : 4;
    return R[i];
  });
  g.shade(px0 - 4, py0 - 4, px0 + 4, py0 + 4, (x, y) => {
    const dx = x - px0, dy = y - py0, d = Math.hypot(dx, dy);
    if (d < 1.6) return R[1];
    if (d < 2.8) return R[4];
    return 0;
  });
  // the loose end of the thread, curling off to the left
  g.line(px0 - 4, py0 - 6, px0 - 7, py0 - 4, R[3]);
  g.line(px0 - 7, py0 - 4, px0 - 7, py0 - 2, R[3]);

  // straw hands: a tall bundle lashed at the middle, one end fraying up and one down
  for (const side of [-1, 1]) {
    const wx = side * 29.5, cy = -48;
    for (let k = 0; k < 11; k++) {
      // strands fan out from the tie; half point up, half down, so it reads as a bundle
      const up = k < 6;
      const spread = (k % 6) / 5 - 0.5 + 0.05 * Math.sin((t / D) * TAU * 2 + k);
      const len = (up ? 6 : 5) - Math.abs(k % 6 - 2.5) * 0.6;
      const x0 = wx + side * (k % 2 ? 1.4 : -1.2), y0 = cy + (up ? -1 : 1);
      g.line(x0, y0, x0 + Math.sin(spread) * len * side * 0.8, y0 + (up ? -1 : 1) * len * 0.9,
        k % 3 === 0 ? S[5] : k % 3 === 1 ? S[4] : S[3]);
    }
    // the lashing
    for (let y = -49; y <= -47; y++) g.set(wx, y, S[1]), g.set(wx + side, y, S[1]);
  }

  // ---- 3. outline
  g.outline((x, y, nx, ny) => (ny > 0 ? C[0] : C[1]));
  g.draw(p);

  // ---- 4. ground shadow and floating straw
  for (let x = -13; x <= 13; x++)
    for (let y = 0; y <= 2; y++) {
      const d = (x / 13) ** 2 + ((y - 0.4) / 2.2) ** 2;
      if (d < 1) p.blend(x, y, C[0], 0.42 * (1 - d));
    }
  cycle(t, D, 9, o.seed * 7 + 5, (r) => r.range(1.5, 2.5), (ag, L, r, i) => {
    const k = ag / L;
    const x = r.range(-22, 22) + Math.sin((ag / L) * TAU * 0.5 + i) * 2;
    const y = -r.range(30, 78) + 2 * ag;
    const a = Math.min(1, k * 4) * Math.min(1, (1 - k) * 3);
    p.set?.(0, 0, 0);
    p.dot(x, y, i % 3 ? S[5] : S[4], a);
    if (i % 4 === 0) p.dot(x + 1, y, S[4], a * 0.8);
  });
}

