// A Pikachu-like electric critter: it crouches with sparking cheeks, lunges and fires a bolt that
// bursts at its target, then settles back. Bolt and burst inking adapted from Sprite Fusion's
// open-source lightning (https://www.spritefusion.com/pixel-art-vfx/lightning),
// MIT License, Copyright (c) 2026 Hugo Duprez.
import { fit, clamp, wrap, lerp, smooth, seg, ease, rng, hex, TAU, WHITE } from "../../core/index.js";
import { Grid, shift, shadow } from "./_lib.js";
import { zigzag, stroke } from "../lightning/_lib.js";

export const meta = {
  name: "Pikachu thunderbolt",
  desc: "A chubby electric critter crouches with sparking cheeks, lunges and fires a bolt that bursts at its target, then wobbles back to its feet.",
  tags: ["critter", "electric", "monster", "attack", "combat", "loop"],
  size: [176, 112],
  origin: [88, 96],
  duration: 1.2,
  loop: true,
  fps: 30,
  bg: "dark",
  options: {
    palette: ["#3a2404", "#8a5a10", "#c8861c", "#e8a828", "#f6c844", "#fcd860", "#fef0a0"],
    cheek: ["#a81820", "#e03038", "#ff6a5a"],
    eye: ["#101018", "#ffffff"],
    bolt: ["#120a33", "#2a1b78", "#4630c0", "#5a62f0", "#58a6ff", "#9ed8ff", "#e4f6ff", "#ffffff"],
    seed: 1,
  },
};

const D = meta.duration, GRID = new Grid(-30, -44, 60, 46);
// the loop's beats: crouch (charge up), lunge, fire, hold the burst, settle
const T_CROUCH = 0.15, T_LUNGE = 0.4, T_FIRE = 0.5, T_HOLD = 0.72, T_SETTLE = 0.95;
const TX = 62, TY = -18; // where the bolt lands

// body pose at time t: lean (forward +), crouch (down +), s (squash: + tall, - flat), charge
function pose(t) {
  t = wrap(t, D);
  let lean = 0, crouch = 0, s = 0, charge = 0;
  if (t < T_CROUCH) {
    const u = ease.inOutSine(seg(t, 0, T_CROUCH));
    crouch = 3 * u; s = -0.22 * u; charge = u;
  } else if (t < T_LUNGE) {
    const u = seg(t, T_CROUCH, T_LUNGE);
    crouch = 3; s = -0.22; charge = 1 + 0.4 * Math.sin(u * 22);
  } else if (t < T_FIRE) {
    const u = ease.outCubic(seg(t, T_LUNGE, T_FIRE));
    lean = 5 * u; crouch = 3 * (1 - u); s = lerp(-0.22, 0.18, u);
    charge = 1 - u;
  } else if (t < T_HOLD) {
    const u = seg(t, T_FIRE, T_HOLD);
    lean = 5 - 2.4 * ease.outCubic(u);
    s = lerp(0.18, -0.08, ease.outCubic(u));
  } else if (t < T_SETTLE) {
    const u = ease.inOutSine(seg(t, T_HOLD, T_SETTLE));
    lean = lerp(2.6, 0, u); s = lerp(-0.08, 0, u);
  }
  // idle after settling: a gentle breathing bob so the tail of the loop isn't dead frames
  if (t >= T_SETTLE) {
    const u = (t - T_SETTLE) / (D - T_SETTLE);
    s = 0.02 * Math.sin(u * TAU * 2);
    lean = 0.4 * Math.sin(u * TAU);
  }
  return { lean, crouch, s, charge };
}

// the critter, feet at (0, 0): big head, small body, long outward ears, bolt tail with a brown root
function body(g, C, Pz) {
  g.clear();
  const lean = Pz.lean, crouch = Pz.crouch, s = Pz.s;
  const by = -crouch;
  const cs = Math.cos(lean * 0.06), sn = Math.sin(lean * 0.06);
  const sx = 1 - s * 0.55, sy = 1 + s;
  const local = (x, y) => {
    const dy = y - by;
    return [(x * cs + dy * sn) / sx, (-x * sn + dy * cs) / sy];
  };
  // head (big) + body (small), clearly separated
  const inBody = (x, y) => {
    const [u, v] = local(x, y);
    return (u / 8.2) ** 2 + ((v + 16.5) / 7) ** 2 <= 1 || (u / 7) ** 2 + ((v + 6.5) / 6) ** 2 <= 1;
  };
  const lit = (x, y, k) => inBody(-2 + (x + 2) / k, -13 + (y + 13) / k);
  g.shade(-14, by - 30, 14, by + 2, (x, y, o) => {
    if (!inBody(x, y)) return 0;
    const [u, v] = local(x, y);
    // belly: a pale patch on the lower front of the body
    if (v > -10 && v < -1.5 && u > -2.5 && u < 5.5) {
      const [uu, vv] = local(x, y - 0.8);
      if ((uu / 7) ** 2 + ((vv + 6.5) / 6) ** 2 <= 1) return C[6];
    }
    return lit(x, y, 0.5) ? C[4] : lit(x, y, 0.78) ? C[3] : C[2];
  });
  // ears: two wide spikes angling out, black tips on the top third
  for (const side of [-1, 1]) {
    const bx = side * 4.2, tipX = side * (10 + (side > 0 ? 1 : 0)) + lean * 0.5, tipY = by - 27.5 - (side > 0 ? 1.5 : 0);
    g.poly([[bx - side * 3, by - 19], [tipX, tipY], [bx + side * 4, by - 20.5]], (x, y) => {
      const [u] = local(x, y);
      // black outer third, inner face brighter
      const h = (by - 20.5 - y) / (by - 20.5 - tipY);
      if (h > 0.62) return C[0];
      return u * side < 0 ? C[4] : C[3];
    });
  }
  // tail: a brown root on the lower back, a bolt-flag flicking out to the mid-left
  const t0 = [-5.5 + lean * 0.5, by - 8];
  g.poly([
    [t0[0] + 2, t0[1] - 1], [t0[0] + 2, t0[1] - 3.5], [t0[0] - 2, t0[1] - 3.5],
    [t0[0] - 2, t0[1] - 6], [t0[0] + 1.5, t0[1] - 6], [t0[0] + 1.5, t0[1] - 9.5],
    [t0[0] - 3, t0[1] - 9.5], [t0[0] - 3, t0[1] - 13.5], [t0[0] - 10.5, t0[1] - 13.5],
    [t0[0] - 10.5, t0[1] - 9], [t0[0] - 6, t0[1] - 9], [t0[0] - 6, t0[1] - 3.5],
    [t0[0] + 2, t0[1] - 3.5],
  ], C[5]);
  g.poly([[t0[0] - 3, t0[1] - 13.5], [t0[0] - 3, t0[1] - 16.5], [t0[0] - 10.5, t0[1] - 16.5], [t0[0] - 10.5, t0[1] - 13.5]], C[4]);
  // feet: two plump toes-forward ovals
  for (const side of [-1, 1]) g.ellipse(side * 2.8 + lean * 0.3, by - 1, 3, 1.7, C[3]);
  // a stubby front arm on the near side
  g.ellipse(5.5 + lean * 0.3, by - 8, 2, 2.6, (nx, ny) => (nx + ny < -0.4 ? C[4] : C[3]));
  // cheeks: red dots that swell with the charge
  const chK = clamp(Pz.charge, 0, 1.4);
  for (const side of [-1, 1]) {
    const cx = side * 6.5 + lean * 0.3, cy = by - 13.5;
    g.ellipse(cx, cy, 2 + chK * 0.4, 1.6 + chK * 0.3, (nx, ny) => (nx + ny < -0.4 ? C.ch[2] : C.ch[1]));
  }
  for (const side of [-1, 1]) {
    const ex = Math.round(side * 3.5 + lean * 0.35), ey = by - 18;
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 2; dx++) g.set(ex + dx, ey + dy, C.eye[0]);
    g.set(ex, ey, C.eye[1]);
  }
  // mouth: a small w under the eyes
  const mx = Math.round(lean * 0.35);
  g.set(mx, by - 13.5, C[1]); g.set(mx + 1, by - 13, C[1]); g.set(mx + 2, by - 13.5, C[1]);
  g.outline(C[0]);
}

function cheekSparks(p, Pz, C, t, seed) {
  if (Pz.charge < 0.15) return;
  const f = Math.floor(t * 30), r = rng(seed, f, 3);
  const n = 1 + Math.round(Pz.charge * 2);
  for (let i = 0; i < n; i++) {
    const side = r.chance(0.5) ? -1 : 1;
    const cx = side * 6.5, cy = -13;
    const a0 = r.range(0, TAU), d0 = r.range(1.5, 3.5), a1 = a0 + r.range(-1, 1), d1 = r.range(4, 8);
    const b = zigzag(r, cx + Math.cos(a0) * d0, cy + Math.sin(a0) * d0, cx + Math.cos(a1) * d1, cy + Math.sin(a1) * d1, 0.6, 0, 0.8);
    stroke(p, b, 0.6 + 0.25 * Pz.charge, C.bolt, 0.9, { light: 0.2 });
  }
}

export function draw(p, time, o) {
  const t = shift(time, D, o.seed), C = fit(o.palette, 7), Pz = pose(t);
  C.ch = fit(o.cheek, 3); C.eye = fit(o.eye, 2); C.bolt = fit(o.bolt, 8);
  const g = GRID;
  body(g, C, Pz);
  const X = Math.round(Pz.lean * 0.8), Y = Math.round(-Pz.crouch);
  g.draw(p, 1, X, Y);
  cheekSparks(p, Pz, C, t, o.seed);
  if (t >= T_FIRE) {
    const ft = wrap(t - T_FIRE, D), FLIGHT = 0.08, HIT = 0.32;
    const f = Math.floor(t * 30), r = rng(o.seed, f, 9);
    if (ft < FLIGHT) {
      const u = ease.outCubic(ft / FLIGHT);
      const b = zigzag(r, 4 + X, -14 + Y, lerp(4 + X, TX, u), lerp(-14 + Y, TY, u), 0.4, 0.25);
      stroke(p, b, 1, C.bolt, 1.5, { light: 0.6 });
    } else if (ft < HIT) {
      const a = (ft - FLIGHT) / (HIT - FLIGHT), R0 = 26 * (1 - a * 0.7);
      const m = Math.round(16 * (1 - a * 0.5));
      for (let i = 0; i < m; i++) {
        const ang = r.range(0, TAU), d0 = r.range(1, R0 * 0.5), a2 = ang + r.range(-1.1, 1.1), d1 = r.range(R0 * 0.5, R0);
        stroke(p, zigzag(r, TX + Math.cos(ang) * d0, TY + Math.sin(ang) * d0, TX + Math.cos(a2) * d1, TY + Math.sin(a2) * d1, 0.55, 0.3, 1), 0.9 * (1 - a) + 0.2, C.bolt, 1.1, { light: 0.3 });
      }
      p.circle(TX, TY, 6 * (1 - a) + 2, WHITE);
      p.circle(TX, TY, 5 * (1 - a) + 1.5, C.bolt[6]);
      p.glow(TX, TY, 44 * (1 - a) + 10, C.bolt[5], 0.75 * (1 - a) + 0.1);
      if (a < 0.25) p.glow(TX, TY, 16, WHITE, 0.5 * (1 - a * 4));
      for (let i = 0; i < 10; i++) {
        const a0 = r.range(0, TAU), sp = r.range(30, 70), d = sp * (ft - FLIGHT);
        const d2 = sp * (ft - FLIGHT) + r.range(3, 10);
        p.px(TX + Math.cos(a0) * d2, TY + Math.sin(a0) * d2, C.bolt[5], 1 - a);
      }
    }
  }
  if (Pz.charge > 0.3) p.glow(0, -13, 14 + 8 * Pz.charge, C[4], 0.12 * Pz.charge);
}

export function drawBack(p, time, o) {
  const t = shift(time, D, o.seed), C = fit(o.palette, 7), Pz = pose(t);
  shadow(p, 0, -0.5, 11 + Pz.lean, 2, C[0], 0.55);
}
