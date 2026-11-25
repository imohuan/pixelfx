#!/usr/bin/env node
// 逐帧对拍：编辑器渲染 vs 导出的 chain 脚本渲染。
//   node anim-editor/compare.mjs [预设文件] [--out records/x]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createFrame, clearFrame, createAct } from "../src/core/index.js";
import { adoptProject } from "./src/lib/frames.js";
import { buildMoveSource } from "./src/lib/exporter.js";
import { localizeImports } from "./src/lib/localize.js";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync as writeTmp } from "node:fs";
import { pathToFileURL as toUrl } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const outIdx = process.argv.indexOf("--out");
const OUT = outIdx > 0 ? process.argv[outIdx + 1] : "records/anim-editor-compare";
const preset = args[0] ?? "sword-combo.json";

const raw = JSON.parse(readFileSync(join(HERE, "data", "presets", preset), "utf8"));
const { project } = adoptProject(raw);
const name = project.name;
const actRef = project.clips.find((c) => c.actRef)?.actRef;
const actMod = actRef ? await import(toUrl(join(HERE, "..", "src", "fx", actRef + ".js")).href + "?v=" + Date.now()) : null;
const built = buildMoveSource({
  project, name: project.name, size: [320, 200], origin: [120, 180],
  metaOf: () => null,
  actModules: new Map(actRef ? [[actRef, actMod]] : []),
});
const tmp = mkdtempSync(join(tmpdir(), "animfx-compare-"));
const tmpFile = join(tmp, preset.replace(/\.json$/, ".js"));
writeTmp(tmpFile, localizeImports(built.source, join(HERE, "..")));
const mod = await import(toUrl(tmpFile).href + "?v=" + Date.now());

// 编辑器视角：按图层顺序、片段位置、锚点摆放（engine.js 的简化版）
function editorFrame(t) {
  const W = 520, H = 300;
  const frame = createFrame(W, H, 0, 0);
  const chars = project.clips.filter((c) => c.type === "character" && t >= c.t - 1e-6 && t <= c.until + 1e-6);
  const host = chars[0];
  return { frame, host, W, H };
}

// 导出视角：createAct 一帧
function exportedFrame(t) {
  const [w, h] = mod.meta.size;
  const frame = createFrame(w, h, -mod.meta.origin[0], -mod.meta.origin[1]);
  const inst = createAct(mod, { x: 0, y: 0 });
  const n = Math.max(0, Math.round(t * 120));
  for (let i = 0; i < n; i++) inst.update(1 / 120);
  inst.draw(frame, { body: true, target: true });
  return frame;
}

// 用同一套姿势比较：导出脚本在每一帧的姿势 vs 源动作
const srcMod = actMod ?? { act: { poses: [] } };
let worst = { d: 0 };
const rows = [];
for (let f = 0; f <= project.durationFrames; f++) {
  const t = f / project.fps;
  const src = srcMod.act?.poses ? poseAt(srcMod.act.poses, t) : null;
  const got = mod.act?.poses ? poseAt(mod.act.poses, t) : null;
  if (!src || !got) continue;
  let d = 0;
  for (const k of ["fx", "fy", "bx", "by", "ffx", "fbx", "sa", "crouch", "lean", "x", "y"]) {
    if (src[k] === undefined && got[k] === undefined) continue;
    d = Math.max(d, Math.abs((src[k] ?? 0) - (got[k] ?? 0)));
  }
  if (d > worst.d) worst = { d, f, t, src, got };
  if (f % 6 === 0) rows.push({ f, t: +t.toFixed(3), d: +d.toFixed(3) });
}

console.log(`${name}：${project.durationFrames} 帧 @ ${project.fps}fps = ${project.duration.toFixed(3)}s`);
console.log(`姿势最大偏差：${worst.d.toFixed(3)} px/单位，在第 ${worst.f ?? "-"} 帧`);
if (worst.d > 1) console.log("  源：", JSON.stringify(worst.src), "\n  导出：", JSON.stringify(worst.got));

// 渲染两版对照图：编辑器姿势 vs 导出姿势，逐帧像素差
const [w, h] = mod.meta.size;
const A = createFrame(w, h, -mod.meta.origin[0], -mod.meta.origin[1]);
const B = createFrame(w, h, -mod.meta.origin[0], -mod.meta.origin[1]);
const steps = project.durationFrames;
let diffTotal = 0, diffMax = 0, diffMaxF = -1;
// A 用源动作的姿势，命中/灰尘/靶子用导出结果（编辑器也是按状态片段算的）；两者只剩姿势差异
const aAct = createAct({ ...mod, act: { poses: srcMod.act.poses, target: mod.act.target, hits: mod.act.hits, dust: mod.act.dust } }, { x: 0, y: 0 });
const bAct = createAct(mod, { x: 0, y: 0 });
for (let f = 0; f < steps; f++) {
  clearFrame(A); clearFrame(B);
  aAct.draw(A, { body: true, target: true });
  bAct.draw(B, { body: true, target: true });
  let d = 0;
  for (let i = 0; i < A.color.length; i++) if (A.color[i] !== B.color[i]) d++;
  for (let i = 0; i < A.light.length; i++) if (A.light[i] !== B.light[i]) d++;
  diffTotal += d;
  if (d > diffMax) { diffMax = d; diffMaxF = f; }
  aAct.update(1 / project.fps);
  bAct.update(1 / project.fps);
}
console.log(`像素差：合计 ${diffTotal}，最大 ${diffMax}（第 ${diffMaxF} 帧）`);

mkdirSync(join(HERE, "..", OUT), { recursive: true });
writeFileSync(join(HERE, "..", OUT, "compare.json"), JSON.stringify({ name, fps: project.fps, frames: steps, rows, worst: { d: worst.d, f: worst.f }, diffTotal, diffMax, diffMaxF }, null, 2));
console.log("明细：" + OUT + "/compare.json");

function poseAt(track, t) {
  if (t <= track[0][0]) return { ...track[0][1] };
  for (let i = 0; i < track.length - 1; i++) {
    const [t0, a, how0] = track[i];
    const [t1, b] = track[i + 1];
    if (t < t1) {
      const step = 1 / 12;
      const e = (u) => u * u * (3 - 2 * u);
      const local = Math.min(t, t0 + Math.floor((t - t0) * 12 + 1e-6) / 12);
      const u = e((local - t0) / (t1 - t0));
      const out = {};
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (typeof a[k] === "number" && typeof b[k] === "number") out[k] = a[k] + (b[k] - a[k]) * u;
        else out[k] = u < 1 ? a[k] : b[k];
      }
      out.x = (a.x ?? 0) + ((b.x ?? 0) - (a.x ?? 0)) * u;
      out.y = (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * u;
      return out;
    }
  }
  return { ...track[track.length - 1][1] };
}
