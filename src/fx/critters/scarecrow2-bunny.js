// A scarecrow built straight off the reference sheet: a square burlap head with a stitched seam, X eyes and
// a barred mouth, a square burlap body with a red coiled patch and a straw hem, a wooden bar for each arm with
// a bundle of straw at the wrist, a plain pole, and straw flecks on the wind.
//
// The picture is drawn from the sheet's own pixels, so every block face is where it belongs. The only motion is
// a slow lean: the whole scarecrow shears about the foot of its pole, the straw at the pole's root shivers,
// and the loose flecks drift. The reference pose is the one the loop leans out of, so the loop has no seam.

import { fit, clamp, TAU } from "../../core/index.js";
import { Grid, shift } from "./_lib.js";

export const meta = {
  name: "Scarecrow (Bunny)",
  desc: "A square burlap scarecrow with stitched X eyes, a barred mouth and a red coiled patch, leaning on its pole while straw drifts past.",
  tags: ["critter", "scarecrow", "farm", "idle", "wind", "loop"],
  size: [142, 166],
  origin: [71, 152],
  duration: 3.2,
  loop: true,
  fps: 30,
  bg: "ground",
  options: {
    palette: ["#0b0a1a", "#4e331f", "#86643a", "#a0703a", "#b38b57", "#c9a26c"],
    straw: ["#f0d98a", "#d2aa55", "#a0703a"],
    wood: ["#a0703a", "#724c2e", "#4e331f"],
    patch: ["#c4434f", "#9a2f3c", "#6e1f2a"],
    seed: 1,
  },
};

const OX = 71, OY = 152, D = meta.duration;
const GRID = new Grid(-75, -160, 150, 166);

// The reference sheet's coordinates: 142 x 166, the ground line at y = 152.
// Everything below is written in those coordinates and moved onto the canvas at the end.

export function draw(p, time, o) {
  const t = shift(time, D, o.seed);
  const P = fit(o.palette, 6);
  const ST = fit(o.straw, 3);
  const WD = fit(o.wood, 3);
  const PA = fit(o.patch, 3);

  const O = P[0];   // outline black
  const E = P[1];   // deep seam / deepest wood
  const CD = P[2];  // sack shadow
  const HD = P[3];  // warm shadow (straw shade, lit wood)
  const B = P[4];   // sack mid
  const A = P[5];   // sack light
  const HS = ST[0], SS = ST[1], SD = ST[2];   // straw light, mid, dark
  const WW = WD[0], WM = WD[1], WE = WD[2];   // wood light, mid, dark
  const PR = PA[0], PM = PA[1], PD = PA[2];   // patch light, mid, deep

  // The lean. One slow sine over the loop; the reference pose sits where the sine crosses zero, so the
  // drawing at t = 0.8 is exactly the sheet and the loop closes without a jump.
  const ph = (TAU * t) / D + Math.PI / 2;
  const lean = Math.sin(ph) - Math.sin(Math.PI);
  // The scarecrow leans about the foot of its pole: nothing moves at the ground, the head moves most.
  // `y` here is the sheet's row, so the ground is at OY and the top of the head is at 23.
  const sway = (y) => Math.round(lean * 3 * clamp((OY - y) / (OY - 23), 0, 1));
  // The straw at the pole's root and the flecks in the air move on their own little phases.
  const shiver = Math.sin(2 * ph + 1.1) - Math.sin(2 * Math.PI + 1.1);

  const g = GRID;
  g.clear();

  // put a pixel of the scarecrow (it leans with the body)
  const put = (x, y, c) => g.set(x - OX + sway(y), y - OY, c);
  const span = (y, x0, x1, c) => {
    const dx = sway(y);
    for (let x = x0; x <= x1; x++) g.set(x - OX + dx, y - OY, c);
  };
  // put a pixel of the pole (it stands still)
  const putP = (x, y, c) => g.set(x - OX, y - OY, c);
  const spanP = (y, x0, x1, c) => {
    for (let x = x0; x <= x1; x++) putP(x, y, c);
  };

  // ------------------------------------------------------------------ the pole
  for (let y = 125; y <= 152; y++) {
    spanP(y, 62, 63, O);
    spanP(y, 64, 69, WW);
    spanP(y, 70, 74, WM);
    spanP(y, 75, 79, WE);
    spanP(y, 80, 81, O);
  }
  // loose straw around the pole's foot
  const sh = Math.round(shiver * 0.9);
  for (const [y0, y1, x0, x1, c] of [
    [125, 126, 52, 53, SS], [125, 126, 59, 61, HS], [125, 126, 82, 84, SS], [125, 126, 90, 91, SS],
    [127, 129, 54, 56, HS], [127, 129, 62, 63, SS], [127, 129, 85, 86, HS],
    [130, 131, 57, 58, SS], [130, 131, 87, 89, SS],
  ]) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) putP(x + (x < 62 ? sh : -sh), y, c);
  }

  // ------------------------------------------------------------------ the straw bundles at the wrists
  for (const [y0, y1, x0, x1, c] of [
    [59, 60, 31, 33, HS], [61, 63, 29, 30, SS],
    [64, 65, 24, 25, SS], [64, 65, 26, 28, HS], [64, 65, 29, 35, SS],
    [66, 68, 24, 35, SS],
    [69, 70, 24, 28, SS], [69, 70, 29, 30, HS], [69, 70, 31, 35, SS],
    [71, 73, 24, 35, SS],
    [74, 76, 24, 30, SS], [74, 76, 31, 33, HS], [74, 76, 34, 35, SS],
    [77, 78, 24, 25, SS], [77, 78, 26, 28, CD], [77, 78, 29, 35, SS],
    [79, 81, 24, 28, SS], [79, 81, 29, 30, HS], [79, 81, 31, 35, SS],
    [82, 83, 24, 35, SS],
    [84, 86, 29, 30, SS], [84, 86, 31, 33, CD],
    [87, 88, 26, 28, HS],
  ]) for (let y = y0; y <= y1; y++) span(y, x0, x1, c);

  for (const [y0, y1, x0, x1, c] of [
    [59, 60, 115, 117, HS], [61, 63, 113, 114, SS],
    [64, 65, 108, 109, SS], [64, 65, 110, 112, HS], [64, 65, 113, 119, SS],
    [66, 68, 108, 119, SS],
    [69, 70, 108, 112, SS], [69, 70, 113, 114, HS], [69, 70, 115, 119, SS],
    [71, 73, 108, 119, SS],
    [74, 76, 108, 114, SS], [74, 76, 115, 117, HS], [74, 76, 118, 119, SS],
    [77, 78, 108, 109, SS], [77, 78, 110, 112, CD], [77, 78, 113, 119, SS],
    [79, 81, 108, 112, SS], [79, 81, 113, 114, HS], [79, 81, 115, 119, SS],
    [82, 83, 108, 119, SS],
    [84, 86, 113, 114, SS], [84, 86, 115, 117, CD],
    [87, 88, 110, 112, HS],
  ]) for (let y = y0; y <= y1; y++) span(y, x0, x1, c);

  // ------------------------------------------------------------------ the body
  // the box, lit from the top left: a bright top face, a bright left edge, a dark right quarter
  for (let y = 66; y <= 68; y++) for (let x = 49; x <= 94; x++) put(x, y, x <= 84 ? A : x <= 86 ? B : CD);
  for (let y = 69; y <= 121; y++) for (let x = 49; x <= 94; x++) put(x, y, x <= 51 ? A : x <= 86 ? B : CD);
  // the outline
  for (let y = 66; y <= 121; y++) { span(y, 47, 48, O); span(y, 95, 97, O); }
  for (let y = 122; y <= 124; y++) span(y, 49, 94, O);
  // the sheet's dark side steps in twice, right beside the patch
  for (let y = 77; y <= 78; y++) span(y, 85, 86, CD);
  for (let y = 92; y <= 93; y++) span(y, 85, 86, CD);

  // the woven threads: a few dark specks in the cloth, the same pixels every frame
  for (const [y0, y1, x0, x1] of [
    [69, 70, 57, 58], [69, 70, 67, 69], [69, 70, 77, 79],
    [77, 78, 54, 56], [77, 78, 64, 66],
    [84, 86, 57, 58], [84, 86, 67, 69], [84, 86, 77, 79],
    [92, 93, 54, 56], [92, 93, 64, 66],
    [99, 101, 57, 58],
  ]) for (let y = y0; y <= y1; y++) span(y, x0, x1, CD);

  // the arms: a wooden bar under each wrist, lit along the top
  for (let y = 66; y <= 68; y++) span(y, 36, 48, O);
  for (let y = 69; y <= 70; y++) span(y, 36, 46, WW);
  for (let y = 71; y <= 76; y++) span(y, 36, 46, WM);
  for (let y = 77; y <= 78; y++) span(y, 36, 46, WE);
  for (let y = 79; y <= 81; y++) span(y, 36, 48, O);
  for (let y = 66; y <= 68; y++) span(y, 95, 107, O);
  for (let y = 69; y <= 70; y++) span(y, 98, 107, WW);
  for (let y = 71; y <= 76; y++) span(y, 98, 107, WM);
  for (let y = 77; y <= 78; y++) span(y, 98, 107, WE);
  for (let y = 79; y <= 81; y++) span(y, 95, 107, O);

  // the red coiled patch on the chest: light thread on the outer top, dark thread under it
  for (const [y0, y1, runs] of [
    [77, 78, [[67, 76, PR]]],
    [79, 81, [[62, 79, PR], [80, 81, PM]]],
    [82, 83, [[62, 63, PR], [80, 81, PM]]],
    [84, 86, [[59, 63, PR], [80, 84, PM]]],
    [87, 88, [[59, 61, PR], [67, 71, PR], [72, 76, PM], [82, 84, PM]]],
    [89, 91, [[59, 61, PR], [67, 69, PR], [70, 76, PM], [82, 84, PM]]],
    [92, 93, [[59, 61, PR], [67, 76, PM], [82, 84, PM]]],
    [94, 96, [[59, 63, PR], [80, 84, PM]]],
    [97, 98, [[62, 63, PM], [80, 81, PM]]],
    [99, 101, [[62, 81, PM]]],
    [102, 103, [[67, 76, PM]]],
  ]) for (let y = y0; y <= y1; y++) for (const [x0, x1, c] of runs) span(y, x0, x1, c);

  // the seam above the hem
  for (let y = 107; y <= 109; y++) {
    span(y, 49, 51, A);
    span(y, 52, 53, B);
    span(y, 54, 56, CD);
    span(y, 57, 63, B);
    span(y, 64, 66, CD);
    span(y, 67, 74, B);
    span(y, 75, 76, CD);
    span(y, 77, 84, B);
    span(y, 85, 94, CD);
  }

  // the hem: a band of straw, then a band of wood, then the dark underside
  const hem = [[49, 51], [52, 53], [54, 56], [57, 58], [59, 61], [62, 63], [64, 66], [67, 69], [70, 71],
    [72, 74], [75, 76], [77, 79], [80, 81], [82, 84], [85, 86], [87, 89], [90, 91], [92, 94]];
  for (let y = 112; y <= 114; y++) hem.forEach(([x0, x1], i) => span(y, x0, x1, i % 2 ? HD : SS));
  for (let y = 115; y <= 116; y++) hem.forEach(([x0, x1], i) => span(y, x0, x1, i % 2 ? WE : WM));
  for (let y = 117; y <= 121; y++) span(y, 49, 94, CD);

  // ------------------------------------------------------------------ the head
  // the box: a bright top face, a bright left edge, a dark right quarter
  for (let y = 23; y <= 25; y++) span(y, 52, 91, O);
  for (let y = 26; y <= 60; y++) { span(y, 49, 51, O); span(y, 92, 94, O); }
  for (let y = 26; y <= 60; y++)
    for (let x = 52; x <= 91; x++)
      put(x, y, y <= 27 ? (x <= 81 ? A : x <= 84 ? B : CD) : x <= 53 ? A : x <= 84 ? B : CD);
  for (let y = 56; y <= 60; y++) span(y, 52, 91, CD);

  // the woven threads on the head
  for (const [y0, y1, x0, x1] of [
    [28, 30, 59, 61], [28, 30, 70, 71], [28, 30, 80, 81],
    [36, 38, 67, 69], [36, 38, 77, 79],
  ]) for (let y = y0; y <= y1; y++) span(y, x0, x1, CD);

  // the eyes: two X's of black stitches
  for (let y = 33; y <= 35; y++) { span(y, 54, 56, O); span(y, 64, 66, O); span(y, 77, 79, O); span(y, 87, 89, O); }
  for (let y = 36; y <= 38; y++) { span(y, 57, 58, O); span(y, 62, 63, O); span(y, 80, 81, O); span(y, 85, 86, O); }
  for (let y = 39; y <= 40; y++) { span(y, 59, 61, O); span(y, 82, 84, O); }
  for (let y = 41; y <= 43; y++) { span(y, 57, 58, O); span(y, 62, 63, O); span(y, 80, 81, O); span(y, 85, 86, O); }

  // the seam across the head
  for (let y = 44; y <= 45; y++) {
    span(y, 52, 53, A);
    span(y, 54, 56, O);
    span(y, 57, 58, B);
    span(y, 59, 61, CD);
    span(y, 62, 63, B);
    span(y, 64, 66, O);
    span(y, 67, 69, B);
    span(y, 70, 71, CD);
    span(y, 72, 76, B);
    span(y, 77, 79, O);
    span(y, 80, 81, CD);
    span(y, 82, 84, B);
    span(y, 85, 86, CD);
    span(y, 87, 89, O);
    span(y, 90, 91, CD);
  }

  // the mouth: three long stitches with teeth between them
  for (let y = 49; y <= 50; y++) { span(y, 62, 63, O); span(y, 70, 71, O); span(y, 77, 79, O); }
  for (let y = 51; y <= 53; y++) {
    span(y, 57, 61, CD);
    span(y, 62, 63, O);
    span(y, 64, 66, CD);
    span(y, 67, 69, O);
    span(y, 70, 71, CD);
    span(y, 72, 74, O);
    span(y, 75, 76, CD);
    span(y, 77, 79, O);
    span(y, 80, 81, CD);
    span(y, 82, 84, O);
  }
  for (let y = 54; y <= 55; y++) { span(y, 62, 63, O); span(y, 70, 71, O); span(y, 77, 79, O); }

  // ------------------------------------------------------------------ the neck: straw under the head
  const neck = [[54, 56, SS], [57, 58, HD], [59, 61, SS], [62, 63, HD], [64, 66, SS], [67, 69, HD], [70, 71, SS],
    [72, 74, HD], [75, 76, SS], [77, 79, HD], [80, 81, SS], [82, 84, HD], [85, 86, SS], [87, 89, HD]];
  for (let y = 61; y <= 63; y++) {
    span(y, 52, 53, O);
    span(y, 90, 91, O);
    for (const [x0, x1, c] of neck) span(y, x0, x1, c);
  }
  // the shadow the neck throws on the shoulders
  const neckShade = [[54, 56, E], [57, 58, WM], [59, 61, E], [62, 63, WM], [64, 66, E], [67, 69, WM], [70, 71, E],
    [72, 74, WM], [75, 76, E], [77, 79, WM], [80, 81, E], [82, 84, WM], [85, 86, E], [87, 89, WM]];
  for (let y = 64; y <= 65; y++) {
    span(y, 49, 53, O);
    span(y, 90, 94, O);
    for (const [x0, x1, c] of neckShade) span(y, x0, x1, c);
  }

  // ------------------------------------------------------------------ straw on the wind
  // The loose flecks from the sheet: little blocks of straw, each drifting on its own phase.
  for (const [x0, y0, x1, y1, c, p, amp] of [
    [57, 21, 58, 22, SS, 0.0, 1.6], [62, 21, 63, 22, HS, 0.7, 1.6], [70, 21, 71, 22, SS, 1.4, 1.6],
    [77, 21, 79, 22, HS, 2.1, 1.6], [85, 21, 86, 22, SS, 2.8, 1.6],
    [98, 28, 99, 30, HS, 3.4, 1.4], [47, 31, 48, 32, SS, 4.1, 1.4],
    [95, 36, 97, 38, SS, 4.8, 1.4], [44, 39, 46, 40, HS, 5.5, 1.4],
    [26, 87, 28, 88, HS, 5.9, 1.0], [110, 87, 112, 88, HS, 6.3, 1.0],
  ]) {
    const dx = Math.round(amp * (Math.sin(ph + p) - Math.sin(Math.PI + p)));
    const dy = Math.round(amp * 0.9 * (Math.sin(2 * ph + p) - Math.sin(2 * Math.PI + p)));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g.set(x + dx - OX, y + dy - OY, c);
  }

  g.draw(p);
}
