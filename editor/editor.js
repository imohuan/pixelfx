// The rig editor: drag the hands and feet, the solver places every other joint.
// Poses are the same objects effects use in their act (see docs/AUTHORING.md).
import { posed, skeleton, shortfall, STAND } from "../src/core/rig.js";
import { DUMMY_PAL } from "../src/core/actor.js";
import { hex } from "../src/core/color.js";
import { READY } from "../src/core/poses.js";

const $ = (s) => document.querySelector(s);
function el(tag, props = {}, kids = []) {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of [].concat(kids)) e.append(k);
  return e;
}

const canvas = $("#stage"), ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height, ZOOM = 9, OX = 240, OY = 372;

let pose = { ...STAND };
let showSkel = true;
let drag = null; // handle name while dragging
let dragFrom = null; // pointer position from the last move, in art coords

// which pose fields each handle moves, and how it follows the pointer:
//   attract — re-solve and step towards the cursor, so the handle hugs the mouse
//   follow  — move by the pointer's delta only (root height)
//   toggle  — on/off from where the pointer is (toes)
const HANDLES = {
  handN:  { mode: "attract", kx: "fx", ky: "fy", lim: { x: [-40, 40], y: [-50, 2] } },
  handF:  { mode: "attract", kx: "bx", ky: "by", lim: { x: [-40, 40], y: [-50, 2] } },
  ankleN: { mode: "attract", kx: "ffx", ky: "ffy", lim: { x: [-18, 18], y: [-16, 2] } },
  ankleF: { mode: "attract", kx: "fbx", ky: "fby", lim: { x: [-18, 18], y: [-16, 2] } },
  toeN:   { mode: "toggle", kx: "toeF" },
  toeF:   { mode: "toggle", kx: "toeB" },
  root:   { mode: "follow", kx: "crouch", lim: [0, 10] },
};
// toes are switches in the panel: drawn on the canvas they overlap the foot
// handle and the tiptoe pose pushes the toe below the floor line
const NO_CANVAS = new Set(["toeN", "toeF"]);
const round2 = (v) => Math.round(v * 2) / 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const clampLim = (v, [lo, hi]) => clamp(v, lo, hi);

// ---- skins: recolor the body by remapping the rig's palette keys
const SKINS = {
  default: {},
  hero: { A: "#f3c49d", B: "#e0a982", C: "#c98b6c", D: "#8a5a32", E: "#6a4030", F: "#5f6f94", G: "#46536f" },
  gold: { A: "#ffe9a8", B: "#f4c95d", C: "#d99a2b", D: "#a86a14", E: "#8a5310", F: "#6e3d0c", G: "#4d2a08" },
  ice: { A: "#eaf8ff", B: "#bfe6ff", C: "#8fd6ff", D: "#5aa8d6", E: "#3d7ca8", F: "#2d5a80", G: "#1f3d5c" },
  shadow: { A: "#9a86c8", B: "#6e5aa8", C: "#4a3a80", D: "#32245c", E: "#261a44", F: "#1a1230", G: "#100a20" },
  poison: { A: "#d8f0a0", B: "#a8d858", C: "#78b830", D: "#4c8420", E: "#386218", F: "#264412", G: "#182c0c" },
};
let skin = "default";
let remap = new Map();
function setSkin(name) {
  skin = name;
  const s = SKINS[name];
  remap = new Map(Object.entries(DUMMY_PAL).map(([k, v]) => [hex(v) >>> 0, s[k] ? hex(s[k]) >>> 0 : hex(v) >>> 0]));
}
setSkin("default");

function draw() {
  ctx.fillStyle = "#15131d";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#333333";
  ctx.fillRect(OX - 220, OY, 440, 1);
  const r = posed(pose);
  for (let i = 0; i < r.n; i++) {
    const c = remap.get(r.color[i] >>> 0) ?? r.color[i];
    ctx.fillStyle = "#" + (c >>> 0).toString(16).padStart(6, "0");
    ctx.fillRect(OX + r.xs[i] * ZOOM, OY + r.ys[i] * ZOOM, ZOOM, ZOOM);
  }
  if (showSkel) drawSkeleton();
  updateInfo();
}

const screen = ([x, y]) => [OX + x * ZOOM, OY + y * ZOOM];

function drawSkeleton() {
  const sk = skeleton(pose);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(245, 60, 209, 0.85)";
  ctx.beginPath();
  for (const [a, b] of sk.bones) {
    const [ax, ay] = screen(sk.joints[a]), [bx, by] = screen(sk.joints[b]);
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
  }
  ctx.stroke();
  const warn = shortfall(pose) > 0.75;
  for (const h of Object.keys(HANDLES)) {
    if (NO_CANVAS.has(h)) continue;
    if (!(h in sk.joints) && h !== "root") continue;
    const j = h === "root" ? sk.joints.pelvis : sk.joints[h];
    const [x, y] = screen(j);
    const hot = warn && HANDLES[h].mode === "attract" && h.startsWith("hand");
    ctx.fillStyle = hot ? "#ff5555" : drag === h ? "#ffffff" : "#f53cd1";
    ctx.fillRect(x - 5, y - 5, 10, 10);
    ctx.fillStyle = drag === h ? "#f53cd1" : "#000000";
    ctx.fillRect(x - 2, y - 2, 4, 4);
  }
  $("#warn").textContent = warn ? "手够不着：手往回收一点，或把身体挪过去" : "";
}

// the canvas shows art pixels; pointer positions go back to that space
function artPos(e) {
  const r = canvas.getBoundingClientRect();
  return [((e.clientX - r.left) * (W / r.width) - OX) / ZOOM, ((e.clientY - r.top) * (H / r.height) - OY) / ZOOM];
}

function handleAt(ax, ay) {
  const sk = skeleton(pose);
  let best = null, bd = 1.7;
  for (const h of Object.keys(HANDLES)) {
    if (NO_CANVAS.has(h)) continue;
    const j = h === "root" ? sk.joints.pelvis : sk.joints[h];
    const d = Math.hypot(ax - j[0], ay - j[1]) - (h === "root" ? 0.5 : 0);
    if (d < bd) { bd = d; best = h; }
  }
  return best;
}

function moveHandle(ax, ay) {
  const H = HANDLES[drag];
  if (H.mode === "follow") {
    // root: vertical delta changes the crouch; horizontal does nothing (the engine
    // has no body translation), the feet stay planted
    if (dragFrom) {
      pose[H.kx] = clamp(round2(pose[H.kx] + (ay - dragFrom[1])), ...H.lim);
    }
    dragFrom = [ax, ay];
  } else {
    // computed inverse: clamp the cursor to the limb's reach circle (the nearest
    // point the handle can actually get to), then solve the pose fields until the
    // joint lands on it — not a raw coordinate jump, a real convergence loop
    const sk0 = skeleton(pose);
    const anchor = drag.startsWith("hand") ? sk0.joints[drag === "handN" ? "shoulderN" : "shoulderF"] : sk0.joints[drag === "ankleN" ? "hipN" : "hipF"];
    const reach = drag.startsWith("hand") ? 14.2 : 16.4;
    let dx = ax - anchor[0], dy = ay - anchor[1], d = Math.hypot(dx, dy);
    let tx = ax, ty = ay;
    if (d > reach) { tx = anchor[0] + dx * reach / d; ty = anchor[1] + dy * reach / d; }
    let last = Infinity;
    for (let i = 0; i < 12; i++) {
      const [jx, jy] = skeleton(pose).joints[drag];
      const err = Math.hypot(tx - jx, ty - jy);
      if (err < 0.15 || err >= last) break; // arrived, or corrections stopped helping
      last = err;
      // pose fields and joint coords share the same screen terms (y negative is up),
      // so the correction is a plain delta on both axes
      const nx = clampLim(round2(pose[H.kx] + (tx - jx)), H.lim.x);
      const ny = clampLim(round2(pose[H.ky] + (ty - jy)), H.lim.y);
      if (nx === pose[H.kx] && ny === pose[H.ky]) break; // pinned at a limit
      pose[H.kx] = nx;
      pose[H.ky] = ny;
    }
  }
  draw();
}

canvas.addEventListener("pointerdown", (e) => {
  const [ax, ay] = artPos(e);
  const h = handleAt(ax, ay);
  if (h && HANDLES[h].mode === "toggle") {
    // toes flip on a click, there is nothing to drag
    if (pose[HANDLES[h].kx]) delete pose[HANDLES[h].kx]; else pose[HANDLES[h].kx] = 1;
    draw();
  } else if (h) { drag = h; dragFrom = [ax, ay]; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = "grabbing"; draw(); }
});
canvas.addEventListener("pointermove", (e) => {
  const [ax, ay] = artPos(e);
  if (drag) moveHandle(ax, ay);
  else canvas.style.cursor = handleAt(ax, ay) ? "grab" : "default";
});
canvas.addEventListener("pointerup", () => { drag = null; dragFrom = null; canvas.style.cursor = "grab"; draw(); });

// ---- body sliders
const SLIDERS = [
  { k: "crouch", min: 0, max: 10, step: 0.5 },
  { k: "lean", min: -8, max: 8, step: 0.5 },
  { k: "yaw", min: -180, max: 180, step: 5, deg: true },
];
const sliderRows = SLIDERS.map((s) => {
  const val = el("span", { className: "val" });
  const inp = el("input", { type: "range", min: s.min, max: s.max, step: s.step });
  const show = () => { val.textContent = s.deg ? inp.value + "\u00b0" : inp.value; };
  inp.addEventListener("input", () => {
    pose[s.k] = s.deg ? (+inp.value * Math.PI) / 180 : +inp.value;
    show();
    draw();
  });
  $("#sliders").append(el("div", { className: "row" }, [el("label", { textContent: s.k }), inp, val]));
  return { s, inp, show };
});
function syncSliders() {
  for (const { s, inp, show } of sliderRows) {
    inp.value = s.deg ? Math.round(((pose[s.k] || 0) * 180) / Math.PI) : pose[s.k] || 0;
    show();
  }
}
syncSliders();

// ---- feet switches (toes)
const FEET = [["near toe", "toeF"], ["far toe", "toeB"]];
const feetBtns = [];
for (const [label, key] of FEET) {
  const b = el("button", { className: "btn", type: "button", textContent: label });
  b.addEventListener("click", () => {
    if (pose[key]) delete pose[key]; else pose[key] = 1;
    b.setAttribute("aria-pressed", !!pose[key]);
    draw();
  });
  feetBtns.push({ b, key });
  $("#feet").append(b);
}
function syncFeet() {
  for (const { b, key } of feetBtns) b.setAttribute("aria-pressed", !!pose[key]);
}

// ---- actions: poses sampled from an FBX, played back frame by frame
let action = null;         // { name, fps, frames, poses }
let actionTime = 0;        // seconds into the action
let actionPlaying = false;
let actionSpeed = 1;
let actionYaw = 0; // extra body turn layered on top of the action, radians
let actionRaf = 0;
let lastStamp = 0;

async function loadActions() {
  let idx = null;
  try {
    const res = await fetch("actions/index.json", { cache: "no-store" });
    if (res.ok) idx = await res.json();
  } catch { /* no index: the folder may be empty */ }
  if (!idx?.categories?.length) {
    $("#actions").append(el("span", { className: "empty-note", textContent: "还没有动作：运行 node tools/rig/motion2actions.mjs" }));
    return;
  }
  allActions = idx.categories.flatMap((c) => c.actions.map((a) => ({ ...a, category: c.name, catDir: c.slug })));
  // one chip per category, the first selected
  for (const c of idx.categories) {
    const b = el("button", { className: "btn", type: "button", textContent: c.name + " " + c.actions.length });
    b.addEventListener("click", () => selectCategory(c.name, b));
    if (!curCategory) { curCategory = c.name; b.setAttribute("aria-pressed", "true"); }
    $("#act-cats").append(b);
  }
  renderActionList();
}

let allActions = [];
let curCategory = null;

function renderActionList() {
  const q = ($("#act-search").value || "").trim().toLowerCase();
  const list = allActions.filter((a) => (q ? a.name.toLowerCase().includes(q) || a.id.includes(q) : a.category === curCategory));
  $("#actions").replaceChildren();
  if (!list.length) { $("#actions").append(el("span", { className: "empty-note", textContent: "没有匹配的动作" })); return; }
  for (const a of list.slice(0, 200)) {
    const btn = el("button", { className: "btn", type: "button", textContent: a.name });
    btn.addEventListener("click", () => selectAction(a.name, a.catDir + "/" + a.id, btn));
    btn.dataset.action = a.id;
    $("#actions").append(btn);
  }
}

function selectCategory(name, btn) {
  curCategory = name;
  for (const b of document.querySelectorAll("#act-cats .btn")) b.setAttribute("aria-pressed", "false");
  btn.setAttribute("aria-pressed", "true");
  $("#act-search").value = "";
  renderActionList();
}

$("#act-search").addEventListener("input", renderActionList);

function setSelected(kind) {
  // presets and actions are exclusive: picking one clears the other
  for (const b of document.querySelectorAll("#presets .btn, #actions .btn")) {
    b.setAttribute("aria-pressed", b.dataset.kind === kind && b.dataset.active === "1");
  }
}

async function selectAction(name, file, btn) {
  for (const b of document.querySelectorAll("#actions .btn")) { b.dataset.active = ""; b.setAttribute("aria-pressed", "false"); }
  btn.dataset.active = "1";
  for (const b of document.querySelectorAll("#presets .btn")) b.setAttribute("aria-pressed", "false");
  stopAction();
  try {
    const res = await fetch("actions/" + file + ".json", { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    action = await res.json();
  } catch (e) {
    action = null;
    $("#warn").textContent = "动作读取失败：" + name;
    return;
  }
  actionTime = 0;
  const bar = $("#playbar");
  bar.hidden = false;
  const fr = $("#act-frame");
  fr.max = String(Math.max(0, action.frames - 1));
  fr.value = "0";
  $("#act-frame-v").textContent = "0";
  pose = { ...STAND, ...action.poses[0] };
  syncSliders(); syncFeet(); draw();
  playAction(true);
}

function frameAt(t) {
  const f = Math.floor(t * action.fps) % action.frames;
  return action.poses[(f + action.frames) % action.frames];
}

function playAction(on) {
  actionPlaying = on;
  $("#act-play").textContent = on ? "pause" : "play";
  if (on && !actionRaf) { lastStamp = performance.now(); actionRaf = requestAnimationFrame(stepAction); }
  if (!on && actionRaf) { cancelAnimationFrame(actionRaf); actionRaf = 0; }
}

function stopAction() {
  playAction(false);
  $("#playbar").hidden = true;
}

function stepAction(stamp) {
  actionRaf = 0;
  if (!action || !actionPlaying) return;
  const dt = Math.min(0.1, (stamp - lastStamp) / 1000);
  lastStamp = stamp;
  actionTime = (actionTime + dt * actionSpeed) % (action.frames / action.fps);
  pose = { ...STAND, ...frameAt(actionTime), yaw: actionYaw };
  syncSliders(); syncFeet(); draw();
  const f = Math.round(actionTime * action.fps) % action.frames;
  $("#act-frame").value = String(f);
  $("#act-frame-v").textContent = String(f);
  actionRaf = requestAnimationFrame(stepAction);
}

$("#act-play").addEventListener("click", () => { playAction(!actionPlaying); if (actionPlaying) lastStamp = performance.now(); });
$("#act-restart").addEventListener("click", () => { actionTime = 0; if (!actionPlaying) playAction(true); });
$("#act-speed").addEventListener("input", (e) => { actionSpeed = +e.target.value; $("#act-speed-v").textContent = actionSpeed + "x"; });
$("#act-yaw").addEventListener("input", (e) => {
  actionYaw = (+e.target.value * Math.PI) / 180;
  $("#act-yaw-v").textContent = e.target.value + "\u00b0";
  if (action) { pose = { ...STAND, ...frameAt(actionTime), yaw: actionYaw }; syncSliders(); draw(); }
});
$("#act-frame").addEventListener("input", (e) => {
  if (!action) return;
  playAction(false);
  actionTime = +e.target.value / action.fps;
  pose = { ...STAND, ...frameAt(actionTime), yaw: actionYaw };
  $("#act-frame-v").textContent = e.target.value;
  syncSliders(); draw();
});

// ---- presets and skin buttons
for (const [name, p] of [["stand", STAND], ["ready", READY]]) {
  const b = el("button", { className: "btn", type: "button", textContent: name });
  b.dataset.kind = "preset";
  b.addEventListener("click", () => {
    // presets and actions are exclusive
    stopAction();
    action = null;
    for (const o of document.querySelectorAll("#actions .btn")) { o.dataset.active = ""; o.setAttribute("aria-pressed", "false"); }
    for (const o of document.querySelectorAll("#presets .btn")) o.setAttribute("aria-pressed", "false");
    b.setAttribute("aria-pressed", "true");
    pose = { ...STAND, ...p }; syncSliders(); syncFeet(); draw();
  });
  $("#presets").append(b);
}
const skinBtns = {};
for (const name of Object.keys(SKINS)) {
  const b = el("button", { className: "btn", type: "button", textContent: name });
  b.addEventListener("click", () => {
    setSkin(name);
    for (const [n, btn] of Object.entries(skinBtns)) btn.setAttribute("aria-pressed", n === name);
    draw();
  });
  skinBtns[name] = b;
  $("#skins").append(b);
}
skinBtns.default.setAttribute("aria-pressed", "true");
$("#skel").addEventListener("click", (e) => {
  showSkel = !showSkel;
  e.currentTarget.setAttribute("aria-pressed", showSkel);
  draw();
});
$("#copy").addEventListener("click", async (e) => {
  await navigator.clipboard.writeText(exportText());
  e.currentTarget.textContent = "copied";
  setTimeout(() => ($("#copy").textContent = "copy"), 1200);
});

function exportText() {
  const entries = Object.entries(pose)
    .filter(([, v]) => typeof v === "number" && Math.abs(v) > 0.01)
    .map(([k, v]) => "  " + k + ": " + +v.toFixed(2) + ",");
  return "const pose = {\n" + entries.join("\n") + "\n};";
}

function updateInfo() {
  const d = (v) => +(+v).toFixed(1);
  $("#facts").innerHTML = [
    ["near hand", d(pose.fx) + ", " + d(pose.fy)],
    ["far hand", d(pose.bx) + ", " + d(pose.by)],
    ["near foot", d(pose.ffx) + ", " + d(pose.ffy)],
    ["far foot", d(pose.fbx) + ", " + d(pose.fby)],
    ["toes", (pose.toeF ? "near " : "") + (pose.toeB ? "far" : "") || "off"],
    ["crouch", d(pose.crouch || 0)],
    ["lean", d(pose.lean || 0)],
    ["yaw", Math.round(((pose.yaw || 0) * 180) / Math.PI) + "\u00b0"],
  ].map(([k, v]) => "<dt>" + k + "</dt><dd>" + v + "</dd>").join("");
  $("#out").textContent = exportText();
}

draw();
loadActions();
