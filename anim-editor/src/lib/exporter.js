// 编排 → chain 脚本。
//
// 生成的文件只用秒（chain 的契约），但源码里每个时间都写成 F(帧号)，一眼能对上时间轴。
// 帧率只出现在 FPS 常量里，接收方即使换了渲染帧率，速度也不变。

import { normalizeFps, round6, secondsOfFrames6, slugFor, toSlug } from "./frames.js";

export { slugFor, toSlug };

const PAL_KEY = { 火: "fire", 冰: "ice", 雷: "electric", 毒: "poison", 金: "gold", 血: "blood", 暗: "shadow", 圣: "holy" };
// 编辑器里的中文配色名 -> PAL 常量名
const PALETTE_CODE = { fire: "PAL.fire", ice: "PAL.ice", electric: "PAL.electric", poison: "PAL.poison", gold: "PAL.gold", blood: "PAL.blood", shadow: "PAL.shadow", holy: "PAL.holy" };

const RESERVED = new Set(["fx", "t", "until", "x", "y", "flip", "seed", "palette", "fxId"]);

const ident = (id) => id.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "fx";
const json = (v, ind = 2) => JSON.stringify(v, null, ind).replace(/\n/g, "\n".padEnd(ind + 1, " "));
/** 画面里真正要用到的特效模块（角色的动作数据会内联，不 import）。 */
function collectFxIds(project) {
  const ids = new Set();
  for (const c of project.clips) if (c.type === "fx" && c.fxId) ids.add(c.fxId);
  return [...ids];
}

function importPath(fxId) {
  const [cat, ...rest] = String(fxId).split("/");
  const file = rest.join("/");
  if (!cat || !file) return null;
  return cat === "moves" ? `./${file}.js` : `../${cat}/${file}.js`;
}

/** 目标列表：优先用编排里的靶子，没有就用动作自带的。 */
function targetsOf(project, actRefs) {
  const targets = project.clips.filter((c) => c.type === "target");
  if (targets.length) return targets.map((t) => Math.round(t.x ?? 0));
  const first = actRefs.find((a) => a.act?.target || a.act?.targets);
  if (!first) return undefined;
  const raw = first.act.targets ?? (first.act.target ? [first.act.target] : []);
  return raw.map((g) => Math.round(g.x ?? 66));
}

/** 绑定的靶子 -> target 下标。 */
function targetIndex(project, stateClip) {
  const targets = project.clips.filter((c) => c.type === "target");
  const i = targets.findIndex((t) => t.id === stateClip.bindTo);
  return i >= 0 ? i : 0;
}

/** 角色动作：把引用的动作关键帧按片段位置平移；多个角色片段则按 1/12 秒采样合并。 */
function buildAct(project, actModules, warnings) {
  const chars = project.clips.filter((c) => c.type === "character");
  const poses = [];
  const hits = [];
  const dust = [];
  if (!chars.length) return null;

  const single = chars.length === 1;
  const frameDt = 1 / 12;
  // 编辑器里「命中」由状态片段决定；有状态片段时，动作自带的 hits 不再叠加
  const stateHits = project.clips.filter((x) => x.type === "state" && x.hit);
  for (const clip of chars) {
    const mod = actModules.get(clip.actRef);
    const start = round6(clip.t + (clip.actStart ?? 0));
    const end = round6(clip.fEnd / project.fps);
    const dx = Math.round(clip.x ?? 0), dy = Math.round(clip.y ?? 0);
    if (clip.scale != null && clip.scale !== 1) warnings.push(`角色「${clip.actRef ?? "站姿"}」的缩放 ${clip.scale} 无法写进 chain，已忽略`);
    if (clip.angle) warnings.push(`角色「${clip.actRef ?? "站姿"}」的旋转 ${clip.angle}° 无法写进 chain，已忽略`);
    const track = mod?.act?.poses;
    if (!track?.length) {
      poses.push([clampTime(start, end), { x: dx, y: dy }]);
      continue;
    }
    if (single) {
      // 只有一个角色片段：原样搬关键帧，保留 "snap" 等缓动信息，动作最忠实
      for (const [kt, pose, how] of track) {
        // 不四舍五入：源动作的键本来就在帧边界上（只差 1e-16 的浮点尾巴），保留原值才能逐像素一致
        const at = start + kt;
        if (at > end + 1e-6) break;
        const key = [at, shiftPose(pose, dx, dy)];
        if (how) key.push(how);
        poses.push(key);
      }
      continue;
    }
    // 多个角色片段：按编辑器自己的 12fps 步进采样，再合并成一条时间轴
    for (let t = start; t < end - 1e-6; t += frameDt) {
      const p = poseAtLite(track, t - start);
      poses.push([round6(t), shiftPose(p, dx, dy)]);
    }
    const lastPose = poseAtLite(track, Math.max(0, end - start));
    poses.push([round6(end), shiftPose(lastPose, dx, dy)]);

    if (!stateHits.length) {
      for (const h of mod?.act?.hits ?? []) {
        const at = start + (h.t ?? 0);
        if (at > end + 1e-6) continue;
        hits.push({ ...h, t: at });
      }
    }
    for (const d of mod?.act?.dust ?? []) {
      const at = start + (d.t ?? 0);
      if (at > end + 1e-6) continue;
      dust.push({ ...d, t: at, x: (d.x ?? 0) + dx });
    }
  }
  if (!poses.length) return null;

  // 命中：由状态片段生成（编辑器的「叠加态 / 命中」）
  for (const c of stateHits) {
    const at = c.t;
    const hit = {
      t: at,
      stop: 0,
      push: c.push ?? 1.4,
      straw: c.straw ?? 10,
      skin: c.skin ?? null,
      at: targetIndex(project, c),
    };
    if (c.shiver) hit.shiver = c.shiver;
    hits.push(hit);
    // 状态结束：皮肤恢复（编辑器里状态片段结束就恢复）
    if (c.skin) {
      const endAt = c.until ?? c.t;
      if (endAt > at) hits.push({ t: endAt, push: 0, straw: 0, flash: 0, skin: null, at: hit.at });
    }
  }
  hits.sort((a, b) => a.t - b.t);
  dust.sort((a, b) => a.t - b.t);
  return { poses: dedupeKeys(poses), hits, dust };
}

const clampTime = (a, b) => round6(Math.min(Math.max(a, 0), b));
const shiftPose = (p, dx, dy) => {
  const out = { ...p };
  if (dx) out.x = (out.x ?? 0) + dx;
  if (dy) out.y = (out.y ?? 0) + dy;
  return out;
};

/** 同一时间重复的 key 只留最后一个（采样合并时会出现）。 */
function dedupeKeys(keys) {
  const out = [];
  for (const k of keys) {
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev[0] - k[0]) < 1e-6) out[out.length - 1] = k;
    else out.push(k);
  }
  return out;
}

/** 简化版 poseAt：只需要在采样时取到姿势，不参与渲染。 */
function poseAtLite(track, t) {
  if (!track.length) return {};
  if (t <= track[0][0]) return { ...track[0][1] };
  for (let i = 0; i < track.length - 1; i++) {
    const [t0, a] = track[i];
    const [t1, b, how] = track[i + 1];
    if (t < t1) {
      if (how === "snap") return { ...a };
      const u = (t - t0) / (t1 - t0);
      const out = {};
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const v0 = a[k], v1 = b[k];
        if (typeof v0 === "number" && typeof v1 === "number") out[k] = v0 + (v1 - v0) * ease(u);
        else out[k] = u < 1 ? v0 : v1;
      }
      out.x = (a.x ?? 0) + ((b.x ?? 0) - (a.x ?? 0)) * ease(u);
      out.y = (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * ease(u);
      return out;
    }
  }
  return { ...track[track.length - 1][1] };
}
const ease = (u) => u * u * (3 - 2 * u);

/** 一个特效片段 -> 若干条 cue（长于特效本身时按循环展开）。 */
function cuesOf(project, clip, metaOf, warnings) {
  const fps = normalizeFps(project.fps);
  const startSec = clip.t;
  const endSec = clip.fEnd / fps;
  const meta = metaOf(clip.fxId);
  const dur = meta?.duration ?? (endSec - startSec);
  const out = [];
  let loops = 0;
  let k = 0;
  const minTail = 0.5 / fps; // 尾巴不足半帧：并进上一段，不要再起一段
  for (let at = startSec; at + minTail < endSec; at += dur, k++) {
    const cueEnd = Math.min(endSec, at + dur);
    const cue = { fxId: clip.fxId, at, end: cueEnd, startSec, endSec, clip, cut: at + dur > endSec + 1e-6 };
    out.push(cue);
    loops++;
    if (k > 500) { warnings.push(`「${clip.label ?? clip.fxId}」循环次数过多，已截断`); break; }
  }
  if (!out.length) out.push({ fxId: clip.fxId, at: startSec, end: endSec, startSec, endSec, clip, cut: false });
  if (loops > 1) warnings.push(`「${clip.label ?? clip.fxId}」比特效本身长，导出成 ${loops} 段连续播放`);
  if (clip.scale != null && clip.scale !== 1) warnings.push(`特效「${clip.label ?? clip.fxId}」的缩放 ${clip.scale} 无法写进 chain，已忽略`);
  if (clip.angle) warnings.push(`特效「${clip.label ?? clip.fxId}」的旋转 ${clip.angle}° 无法写进 chain，已忽略`);
  return out;
}

function cueLine(cue, fps, aliases) {
  const clip = cue.clip;
  const alias = aliases.get(cue.fxId);
  const parts = [`fx: ${alias}`];
  parts.push(`t: F(${Math.round(cue.at * fps)})`);
  if (cue.cut) parts.push(`until: F(${Math.round(cue.end * fps)})`);
  const from = clip.from ?? [0, 0];
  const to = clip.to;
  if (to) {
    const a0 = clip.t;
    const len = Math.max(1e-6, cue.endSec - cue.startSec);
    parts.push(`x: (t) => ${num(from[0])} + ${num(to[0] - from[0])} * Math.min(1, Math.max(0, (t - ${num(a0)}) / ${num(len)}))`);
    parts.push(`y: (t) => ${num(from[1])} + ${num(to[1] - from[1])} * Math.min(1, Math.max(0, (t - ${num(a0)}) / ${num(len)}))`);
  } else {
    if (from[0]) parts.push(`x: ${num(from[0])}`);
    if (from[1]) parts.push(`y: ${num(from[1])}`);
  }
  if (clip.palette && clip.palette !== "default") {
    const key = PAL_KEY[clip.palette];
    if (key) parts.push(`palette: ${PALETTE_CODE[key]}`);
    else parts.push(`palette: ${JSON.stringify(clip.palette)}`);
  }
  if (clip.seed != null && clip.seed !== 1) parts.push(`seed: ${Math.round(clip.seed)}`);
  for (const [k, v] of Object.entries(clip)) {
    if (RESERVED.has(k) || k.startsWith("_") || ["id", "trackId", "type", "row", "label", "f", "fEnd", "until", "to", "from", "scale", "angle"].includes(k)) continue;
    if (v === undefined || v === null) continue;
    if (typeof v === "object") parts.push(`${k}: ${JSON.stringify(v)}`);
    else if (typeof v === "string") parts.push(`${k}: ${JSON.stringify(v)}`);
    else parts.push(`${k}: ${v}`);
  }
  return `  { ${parts.join(", ")} },`;
}

const num = (v) => {
  const n = Math.round((Number(v) || 0) * 1e6) / 1e6;
  return Number.isInteger(n) ? String(n) : String(n);
};

/**
 * 生成脚本源码。
 * opts: { project, name, size, origin, metaOf(fxId), actModules(Map), desc }
 */
export function buildMoveSource({ project, name, size, origin, metaOf, actModules, desc }) {
  const fps = normalizeFps(project.fps);
  const total = Math.max(1, project.durationFrames);
  const warnings = [];
  const fxIds = collectFxIds(project);
  const aliases = new Map();
  const used = new Set();
  for (const id of fxIds) {
    const base = ident(id.split("/").pop());
    let alias = base, i = 2;
    while (used.has(alias)) alias = base + i++;
    used.add(alias);
    aliases.set(id, alias);
  }

  const act = buildAct(project, actModules, warnings);
  const targets = targetsOf(project, [...actModules.values()]);
  const needsPal = project.clips.some((c) => c.type === "fx" && PAL_KEY[c.palette]);

  const imports = [];
  const coreImports = ["chain"];
  if (needsPal) coreImports.push("PAL");
  imports.push(`import { ${coreImports.join(", ")} } from "../../core/index.js";`);
  for (const id of fxIds) {
    const p = importPath(id);
    if (!p) { warnings.push(`特效 id 不合法：${id}`); continue; }
    imports.push(`import * as ${aliases.get(id)} from "${p}";`);
  }

  const cues = [];
  for (const c of project.clips.filter((x) => x.type === "fx")) {
    for (const cue of cuesOf(project, c, metaOf, warnings)) cues.push(cue);
  }
  cues.sort((a, b) => a.at - b.at || a.clip.id.localeCompare(b.clip.id));

  const lines = [];
  lines.push(`// ${name}：由 anim-editor 从时间轴导出。`);
  lines.push(`// ${total} 帧 @ ${fps}fps = ${secondsOfFrames6(total, fps)}s；chain 只认秒，F(n) 把帧号换成秒。`);
  lines.push(`// 重新导出会覆盖本文件；想手改就把生成的代码拷到别的文件。`);
  lines.push("");
  lines.push(...imports);
  lines.push("");
  lines.push(`const FPS = ${fps};`);
  lines.push(`const F = (n) => n / FPS;`);
  lines.push(`const DURATION = F(${total});`);
  lines.push("");
  lines.push("export const meta = {");
  lines.push(`  name: ${JSON.stringify(name)},`);
  lines.push(`  desc: ${JSON.stringify(desc ?? `导出的编排：${name}`)},`);
  lines.push(`  tags: ["move", "exported"],`);
  lines.push(`  size: [${size[0]}, ${size[1]}],`);
  lines.push(`  origin: [${origin[0]}, ${origin[1]}],`);
  lines.push(`  duration: DURATION,`);
  lines.push(`  loop: false,`);
  lines.push(`  fps: 30,`);
  lines.push(`  bg: "ground",`);
  lines.push(`  actor: 2,`);
  lines.push(`  options: { seed: 1 },`);
  lines.push(`  arrangement: { fps: FPS, frames: ${total} },`);
  lines.push("};");
  lines.push("");
  if (act) {
    lines.push("export const act = {");
    if (targets && targets.length) {
      lines.push(`  target: ${JSON.stringify({ x: targets[0] })},`);
    }
    lines.push(`  poses: ${JSON.stringify(act.poses)},`);
    lines.push(`  hits: ${JSON.stringify(act.hits)},`);
    if (act.dust.length) lines.push(`  dust: ${JSON.stringify(act.dust)},`);
    lines.push("};");
    lines.push("");
  } else {
    warnings.push("没有角色片段：生成的动作只有特效，没有身体动作");
  }
  const targetClips = project.clips.filter((c) => c.type === "target");
  if (targetClips.length > 1) warnings.push(`有 ${targetClips.length} 个靶子，chain 的动作数据只支持一个，已用第一个`);
  lines.push("export const create = chain([");
  for (const cue of cues) lines.push(cueLine(cue, fps, aliases));
  lines.push("]);");
  lines.push("");

  // 时间线校验：所有 cue 必须落在总长内
  for (const cue of cues) {
    if (cue.at < -1e-6) warnings.push(`「${cue.clip.label ?? cue.fxId}」开始时间为负，已按 0 处理`);
    if (cue.at > total / fps + 1e-6) warnings.push(`「${cue.clip.label ?? cue.fxId}」开始时间超出总长`);
  }

  return { source: lines.join("\n"), warnings, fps, totalFrames: total, cues: cues.length };
}

/** 导出时把相对 import 换成绝对 file:// 路径，方便在 Node 或浏览器里直接 import 测量。 */
export function toMeasureSource(source, baseUrl) {
  return source.replace(/from "(\.\.?\/[^"]+)"/g, (m, p) => {
    if (!baseUrl) return m;
    const url = new URL(p, baseUrl);
    return `from ${JSON.stringify(url.href)}`;
  });
}
