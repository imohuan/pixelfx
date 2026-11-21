#!/usr/bin/env node
// 把单个 Mixamo FBX 动画转成 pixelfx 姿势 JSON：node tools/rig/fbx2action.mjs <file.fbx> [out.json]
// Writes editor/actions/<name>.json — one pose per frame, the same pose objects the editor exports.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { basename, join, dirname } from "node:path";

// ---- binary FBX reader
class Reader {
  constructor(buf) { this.buf = buf; this.pos = 0; }
  u8() { return this.buf.readUInt8(this.pos++); }
  u32() { const v = this.buf.readUInt32LE(this.pos); this.pos += 4; return v; }
  i64() { const v = this.buf.readBigInt64LE(this.pos); this.pos += 8; return v; }
  f64() { const v = this.buf.readDoubleLE(this.pos); this.pos += 8; return v; }
  f32() { const v = this.buf.readFloatLE(this.pos); this.pos += 4; return v; }
  bytes(n) { const b = this.buf.subarray(this.pos, this.pos + n); this.pos += n; return b; }
}

function readProp(r) {
  const t = String.fromCharCode(r.u8());
  if (t === "Y") { const v = r.buf.readInt16LE(r.pos); r.pos += 2; return v; }
  if (t === "C") return r.u8() !== 0;
  if (t === "I") { const v = r.buf.readInt32LE(r.pos); r.pos += 4; return v; }
  if (t === "F") return r.f32();
  if (t === "D") return r.f64();
  if (t === "L") return Number(r.i64());
  if ("fdlib".includes(t)) {
    // array lengths stay 32-bit even in the 64-bit-offset format
    const n = r.u32(), enc = r.u32(), clen = r.u32();
    let data = r.bytes(clen);
    if (enc === 1) data = inflateSync(data);
    // FBX 7.x stores typed arrays little-endian on disk
    const out = [];
    if (t === "f") for (let i = 0; i < n; i++) out.push(data.readFloatLE(i * 4));
    else if (t === "d") for (let i = 0; i < n; i++) out.push(data.readDoubleLE(i * 8));
    else if (t === "l") for (let i = 0; i < n; i++) out.push(Number(data.readBigInt64LE(i * 8)));
    else if (t === "i") for (let i = 0; i < n; i++) out.push(data.readInt32LE(i * 4));
    else for (let i = 0; i < n; i++) out.push(data[i] !== 0);
    return out;
  }
  if (t === "S" || t === "R") {
    const n = r.u32(), b = r.bytes(n);
    return t === "S" ? b.toString("latin1") : b;
  }
  throw new Error("unknown prop type " + t);
}

function readNodes(r, end) {
  const out = [];
  while (r.pos + 1 < end) {
    const start = r.pos;
    // 7.5+ writes 64-bit offsets; 7.4 and older 32-bit
    const nodeEnd = r.wide ? Number(r.i64()) : r.u32();
    if (nodeEnd === 0 || nodeEnd > end) { r.pos = start; break; }
    const nProps = r.wide ? Number(r.i64()) : r.u32();
    if (r.wide) r.i64(); else r.u32(); // prop list len
    const nameLen = r.u8();
    const name = r.bytes(nameLen).toString("latin1");
    const props = [];
    for (let i = 0; i < nProps; i++) props.push(readProp(r));
    const children = [];
    if (r.pos < nodeEnd - 1) children.push(...readNodes(r, nodeEnd));
    r.pos = nodeEnd;
    out.push({ name, props, children });
  }
  return out;
}

function parseFbx(file) {
  const buf = readFileSync(file);
  const version = buf.readUInt32LE(23);
  const r = new Reader(buf);
  r.wide = version >= 7500;
  r.pos = 27;
  return { version, top: readNodes(r, buf.length) };
}

const find = (nodes, name) => (nodes ?? []).filter((n) => n.name === name);
const find1 = (nodes, name) => find(nodes, name)[0];

// ---- matrix helpers (column-major 4x4, row vectors premultiplied as [x,y,z,1] x M)
const I = () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
const mul = (A, B) => {
  const o = new Array(16).fill(0);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[r*4+c] += A[r*4+k] * B[k*4+c];
  return o;
};
const trs = (t, eulerDeg) => {
  const d = Math.PI / 180, x = eulerDeg[0]*d, y = eulerDeg[1]*d, z = eulerDeg[2]*d;
  const cx=Math.cos(x), sx=Math.sin(x), cy=Math.cos(y), sy=Math.sin(y), cz=Math.cos(z), sz=Math.sin(z);
  // R = Rz * Ry * Rx (FBX default XYZ order, applied X first)
  const R = [
    cz*cy, cz*sy*sx - sz*cx, cz*sy*cx + sz*sx, 0,
    sz*cy, sz*sy*sx + cz*cx, sz*sy*cx - cz*sx, 0,
    -sy,   cy*sx,            cy*cx,            0,
    0, 0, 0, 1,
  ];
  const M = I();
  for (let i = 0; i < 12; i++) M[i] = R[i];
  M[12] = t[0]; M[13] = t[1]; M[14] = t[2];
  return M;
};
const world = (M, v) => [
  M[0]*v[0] + M[4]*v[1] + M[8]*v[2] + M[12],
  M[1]*v[0] + M[5]*v[1] + M[9]*v[2] + M[13],
  M[2]*v[0] + M[6]*v[1] + M[10]*v[2] + M[14],
];

// ---- extract skeleton + animation
function convert(file, outFile) {
  const { version, top } = parseFbx(file);
  const defs = find1(top, "Definitions");
  const objects = find1(top, "Objects");
  const connections = find1(top, "Connections");
  if (!objects || !connections) throw new Error("no Objects/Connections");

  // id -> node
  const byId = new Map();
  for (const o of objects.children) {
    const id = o.props[0];
    const raw = String(o.props[1] ?? "");
    const name = raw.split("\u0000\u0001")[0];
    byId.set(id, { node: o, name, cls: String(o.props[2] ?? "") });
  }

  // models (bones): parent chain from OO connections
  const parentOf = new Map();
  for (const c of connections.children) {
    const [type, child, parent] = c.props;
    if (type === "OO" && byId.has(parent) && byId.has(child)) parentOf.set(child, parent);
  }

  // static local TRS per model from its Properties70
  const propsOf = (obj) => {
    const p70 = find1(obj.node.children, "Properties70");
    const map = {};
    for (const p of p70?.children ?? []) {
      const key = String(p.props[0]);
      map[key] = p.props.slice(4);
    }
    return map;
  };
  const vec = (v, dflt) => (Array.isArray(v) ? v.map(Number) : dflt);
  const models = [...byId.values()].filter((m) => ["LimbNode", "Root", "Limb"].includes(m.cls) || /Hips|Hand|Foot|Leg|Toe|Spine|Neck|Head/.test(m.name));
  const local = new Map();
  for (const m of models) {
    const P = propsOf(m);
    local.set(m, {
      t: vec(P["Lcl Translation"], [0, 0, 0]),
      r: vec(P["Lcl Rotation"], [0, 0, 0]),
      pre: vec(P["PreRotation"], [0, 0, 0]),
    });
  }

  // animation curves: AnimationCurve -> (OP to CurveNode, prop "d|X") -> (OO to Model)
  const curveOf = new Map(); // curveNodeId -> {modelId, channel}
  const channelProps = new Map(); // curveNodeId -> props (KeyTime etc)
  for (const o of objects.children) if (o.name === "AnimationCurve") channelProps.set(o.props[0], o);
  const curvesByNode = new Map(); // curveNodeId -> {modelId, ch}
  const nodeChannel = new Map(); // curveNodeId -> prop name
  for (const c of connections.children) {
    const [type, child, parent, prop] = c.props;
    if (type === "OP" && channelProps.has(parent) && String(prop).startsWith("d|")) nodeChannel.set(parent, String(prop).slice(2));
    if (type === "OO" && nodeChannel.has(child)) curvesByNode.set(child, { modelId: parent, ch: nodeChannel.get(child) });
  }
  // Mixamo writes AnimationCurveNode (one per bone + T/R/S) and AnimationCurve per channel,
  // linked AnimationCurve --OP("d|X")--> AnimationCurveNode --OP("Lcl Rotation")--> Model.
  const curveData = new Map(); // {modelId,ch} -> {times:[ticks], values:[]}
  const curveNodeOf = new Map(); // curveId -> {nodeId, axis}
  const nodeOwner = new Map(); // curveNodeId -> {modelId, kind}
  for (const c of connections.children) {
    const [type, child, parent, prop] = c.props;
    if (type !== "OP") continue;
    if (channelProps.has(child) && /^d\|[XYZ]$/.test(String(prop))) curveNodeOf.set(child, { nodeId: parent, axis: String(prop).slice(2) });
    if (curveNodeOwners(child) && /^(Lcl Translation|Lcl Rotation|Lcl Scaling)$/.test(String(prop))) {}
  }
  function curveNodeOwners(id) { return nodeOwner.has(id); }
  for (const c of connections.children) {
    const [type, child, parent, prop] = c.props;
    if (type !== "OP") continue;
    const p = String(prop);
    if (/^(Lcl Translation|Lcl Rotation)$/.test(p) && byId.get(parent)?.cls === "LimbNode") nodeOwner.set(child, { modelId: parent, kind: p === "Lcl Rotation" ? "R" : "T" });
  }
  for (const [cid, { nodeId, axis }] of curveNodeOf) {
    const owner = nodeOwner.get(nodeId);
    if (!owner) continue;
    const c = channelProps.get(cid);
    const kt = find1(c.children, "KeyTime")?.props[0];
    const kv = find1(c.children, "KeyValueFloat")?.props[0];
    if (!kt || !kv) continue;
    const key = owner.modelId + "|" + owner.kind + axis;
    curveData.set(key, { times: kt, values: kv });
  }

  // evaluate local TRS at a tick
  const sample = (m, tick) => {
    const L = local.get(m);
    const t = [...L.t], r = [...L.r];
    for (const ch of ["X", "Y", "Z"]) {
      const c = curveData.get(byId.get(mIdOf(m))?.id + "|" + ch); // unused path; curves keyed by model id below
    }
    return { t, r };
  };
  // simpler: direct curve lookup by model id
  const mIdOf = (m) => [...byId.entries()].find(([, v]) => v === m)?.[0];
  const valueAt = (modelId, ch, tick) => {
    const c = curveData.get(modelId + "|" + ch);
    if (!c) return null;
    const { times, values } = c;
    if (times.length === 1) return values[0];
    let i = 0;
    while (i < times.length - 1 && times[i + 1] <= tick) i++;
    if (tick <= times[0]) return values[0];
    if (tick >= times[times.length - 1]) return values[values.length - 1];
    const t0 = times[i], t1 = times[i + 1], k = t1 === t0 ? 0 : (tick - t0) / (t1 - t0);
    return values[i] + (values[i + 1] - values[i]) * k;
  };
  const localAt = (m, id, tick) => {
    const L = local.get(m);
    const t = [0, 1, 2].map((i) => valueAt(id, "T"[i] === "T" ? ["X","Y","Z"][i] : "", tick) ?? L.t[i]);
    // channels: T uses d|X d|Y d|Z on CurveNode bound to model; our key is modelId|X etc (no T/R split!)
    return null;
  };

  // NOTE: Mixamo CurveNodes bind to a model's full transform; the "d|X" channel letter is the axis,
  // but T and R both use X/Y/Z. Distinguish via the CurveNode's property name on the OP connection:
  // it is "d|X" for Lcl Translation? No — Mixamo binds "Lcl Translation" and "Lcl Rotation" as the
  // OP property, e.g. "Lcl Translation|X"? Some exports use "d|X". Handle both by storing the raw
  // property on the curve and re-keying here.
  const trCurves = new Map(); // modelId -> { T: {X,Y,Z}, R: {X,Y,Z} }
  for (const c of connections.children) {
    const [type, child, parent, prop] = c.props;
    if (type !== "OP") continue;
    const p = String(prop);
    const m = p.match(/(Lcl Translation|Lcl Rotation|d)\|?\s*([XYZ])?/);
    if (m && channelProps.has(child)) {
      const kind = m[1] === "Lcl Rotation" ? "R" : "T";
      const ch = m[2] ?? "XYZ";
      const cv = channelProps.get(child);
      const kt = find1(cv.children, "KeyTime")?.props[0];
      const kv = find1(cv.children, "KeyValueFloat")?.props[0];
      if (!kt || !kv) continue;
      const rec = trCurves.get(parent) ?? { T: {}, R: {} };
      if (ch === "XYZ") rec[kind].all = { times: kt, values: kv };
      else rec[kind][ch] = { times: kt, values: kv };
      trCurves.set(parent, rec);
    }
  }

  const evalTR = (modelId, tick, dflt) => {
    const rec = trCurves.get(modelId);
    const t = [...dflt.t], r = [...dflt.r];
    const axis = ["X", "Y", "Z"];
    for (let i = 0; i < 3; i++) {
      const tc = curveData.get(modelId + "|T" + axis[i]);
      if (tc) t[i] = valueAtArr(tc, tick);
      const rc = curveData.get(modelId + "|R" + axis[i]);
      if (rc) r[i] = valueAtArr(rc, tick);
    }
    return { t, r };
  };
  const evalTROld = (modelId, tick, dflt) => {
    const rec = trCurves.get(modelId);
    const t = [...dflt.t], r = [...dflt.r];
    if (rec?.T.all) { for (let i = 0; i < 3; i++) t[i] = rec.T.all.values[Math.min(rec.T.all.values.length - 1, Math.max(0, Math.round((tick - rec.T.all.times[0]) / 1)))] ?? t[i]; }
    const axis = ["X", "Y", "Z"];
    for (let i = 0; i < 3; i++) {
      const tc = rec?.T[axis[i]];
      if (tc) { const v = valueAtArr(tc, tick); if (v !== null) t[i] = v; }
      const rc = rec?.R[axis[i]];
      if (rc) { const v = valueAtArr(rc, tick); if (v !== null) r[i] = v; }
    }
    return { t, r };
  };
  const valueAtArr = (c, tick) => {
    const { times, values } = c;
    if (times.length === 1) return values[0];
    if (tick <= times[0]) return values[0];
    if (tick >= times[times.length - 1]) return values[values.length - 1];
    let i = 0;
    while (i < times.length - 1 && times[i + 1] <= tick) i++;
    const t0 = times[i], t1 = times[i + 1];
    return values[i] + (values[i + 1] - values[i]) * (t1 === t0 ? 0 : (tick - t0) / (t1 - t0));
  };

  // pick the bones we need
  const pick = (suffix) => models.find((m) => m.name.split(":").pop() === suffix || m.name === suffix);
  const hips = pick("Hips");
  if (!hips) throw new Error("no Hips bone found — is this a Mixamo FBX?");
  const hipsId = mIdOf(hips);
  const bones = { hips, hipsId };
  for (const [key, suffix] of [["handN", "RightHand"], ["handF", "LeftHand"], ["ankleN", "RightFoot"], ["ankleF", "LeftFoot"]]) {
    const b = pick(suffix);
    if (!b) throw new Error("missing bone " + suffix);
    bones[key] = b;
    bones[key + "Id"] = mIdOf(b);
  }

  // world matrix chain per tick
  const chainOf = (id) => {
    const chain = [];
    let cur = id;
    while (cur !== undefined) { chain.unshift(cur); cur = parentOf.get(cur); }
    return chain;
  };
  const chains = Object.fromEntries(Object.keys(bones).filter((k) => !k.endsWith("Id")).map((k) => [k, chainOf(bones[k + "Id"])]));
  const worldAt = (key, tick) => {
    let M = I();
    for (const id of chains[key]) {
      const m = byId.get(id);
      if (!local.has(m)) continue;
      const { t, r } = evalTR(id, tick, local.get(m));
      let LM = trs(t, r);
      const pre = local.get(m).pre;
      if (pre[0] || pre[1] || pre[2]) LM = mul(LM, trs([0, 0, 0], pre));
      M = mul(M, LM);
    }
    return M;
  };

  // sanity: bone transforms must be in sane ranges; Mixamo bakes a huge scale
  // into root translation when UnitScaleFactor handling goes wrong, detect that
  const probe = worldAt("hips", 0);
  const mag = Math.hypot(probe[12], probe[13], probe[14]);
  if (mag > 1e9) throw new Error("bone transform scale is insane (translation magnitude " + mag.toExponential(2) + ") — likely a non-standard FBX export");

  // tick range: from any curve, assume 30 fps source
  let tMin = Infinity, tMax = -Infinity;
  for (const c of trCurves.values()) {
    for (const rec of [...Object.values(c.T), ...Object.values(c.R)]) {
      if (!rec?.times?.length) continue;
      tMin = Math.min(tMin, rec.times[0]);
      tMax = Math.max(tMax, rec.times[rec.times.length - 1]);
    }
  }
  if (!isFinite(tMin)) throw new Error("no animation curves found");
  const medDelta = (() => {
    const ds = [];
    for (const c of trCurves.values()) for (const rec of Object.values(c.T)) {
      if (rec?.times?.length > 2) for (let i = 1; i < Math.min(rec.times.length, 50); i++) ds.push(rec.times[i] - rec.times[i - 1]);
    }
    ds.sort((a, b) => a - b);
    return ds[Math.floor(ds.length / 2)] || 1;
  })();
  const tps = Math.round(medDelta * 30) || 141120000; // ticks per second, assuming 30fps keys
  const FPS = 30, frames = Math.max(1, Math.round((tMax - tMin) / tps * FPS));

  // scale: the rig pelvis is 19.7 px above the feet; measure hips height over the rest frame
  const restHips = worldAt("hips", tMin), restAnkleN = worldAt("ankleN", tMin);
  // worldAt gives a 4x4 matrix; its translation is columns 12..14
  const hipAboveFoot = restHips[13] - Math.min(restAnkleN[13], worldAt("ankleF", tMin)[13]);
  const S = Math.abs(hipAboveFoot) > 1e-3 ? 19.7 / hipAboveFoot : 0.1;

  const round1 = (v) => Math.round(v * 2) / 2;
  const poses = [];
  const stat = { x: [Infinity, -Infinity], y: [Infinity, -Infinity], z: [Infinity, -Infinity] };
  for (let f = 0; f < frames; f++) {
    const tick = tMin + (f / FPS) * tps;
    const handN = worldAt("handN", tick), handF = worldAt("handF", tick);
    const ankleN = worldAt("ankleN", tick), ankleF = worldAt("ankleF", tick);
    const hips = worldAt("hips", tick);
    const ground = Math.min(ankleN[13], ankleF[13]);
    const yaw = (() => {
      const rec = trCurves.get(hipsId)?.R;
      if (rec?.Y) return (valueAtArr(rec.Y, tick) * Math.PI) / 180;
      if (rec?.all) return 0;
      return 0;
    })();
    // the rig's local frame: x lateral on screen, y down, z depth towards the viewer.
    // the FBX is authored facing -Z or +Z depending on export, so lateral motion is
    // the FBX depth axis (14), and the pose keeps the figure in its own local frame.
    const px = (v) => -(v - hips[14]) * S;
    const py = (v) => -(v - ground) * S;
    for (const p of [handN, handF, ankleN, ankleF]) {
      stat.x = [Math.min(stat.x[0], p[12]), Math.max(stat.x[1], p[12])];
      stat.y = [Math.min(stat.y[0], p[13]), Math.max(stat.y[1], p[13])];
      stat.z = [Math.min(stat.z[0], p[14]), Math.max(stat.z[1], p[14])];
    }
    poses.push({
      fx: round1(px(handN[14])), fy: round1(py(handN[13]) - 4),
      bx: round1(px(handF[14])), by: round1(py(handF[13]) - 4),
      ffx: round1(px(ankleN[14])), ffy: round1(py(ankleN[13]) - 4),
      fbx: round1(px(ankleF[14])), fby: round1(py(ankleF[13]) - 4),
      yaw: +yaw.toFixed(3),
    });
  }

  // sanity clamp: hands/feet inside what the rig can reach, so nothing snaps
  const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  for (const p of poses) {
    for (const [k, lo, hi] of [["fx", -40, 40], ["fy", -50, 0], ["bx", -40, 40], ["by", -50, 0], ["ffx", -18, 18], ["ffy", -16, 0], ["fbx", -18, 18], ["fby", -16, 0]]) p[k] = cl(p[k], lo, hi);
  }

  const name = basename(file, ".fbx").replace(/__.*$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const action = { name, fps: FPS, frames: poses.length, poses };
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(action, null, 1));
  console.log("frames:", frames, "scale:", S.toFixed(3), "px/cm", "->", outFile);
}

const [, , file, out] = process.argv;
if (!file) { console.log("用法：node tools/rig/fbx2action.mjs <文件.fbx> [输出.json]"); process.exit(1); }
convert(file, out ?? join("editor", "actions", basename(file, ".fbx").replace(/__.*$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".json"));
