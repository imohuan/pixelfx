// 帧 ⇄ 秒：整个编辑器只有这一套规则。
//
// 数据里只存整数帧（clip.f / clip.fEnd / project.durationFrames），秒是算出来的。
// 因此日常编辑不会发生「秒 → 帧 → 秒」的往返漂移；需要转换的地方只有入口：
// 载入旧文件（秒），以及手动输入秒数。

export const SCHEMA = "anim-fx/2";

/** 导出文件名用的短名：只允许 a-z0-9-，其余一律换成连字符。 */
export function toSlug(value, fallback = "move") {
  const s = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || fallback;
}

/** 中文名没法直接当文件名：用名字算一个稳定的短后缀，同名工程永远得到同一个文件名。 */
export function slugFor(name, explicit) {
  if (explicit) return toSlug(explicit, "move");
  const ascii = toSlug(name, "");
  if (ascii) return ascii;
  let h = 0;
  for (const ch of String(name || "move")) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return "move-" + h.toString(36).slice(0, 6);
}
export const DEFAULT_FPS = 24;
export const MAX_FPS = 240;
export const TIME_DIGITS = 6; // 导出 chain 时秒的小数位，够到像素级还留余量

export const round6 = (v) => Math.round((Number(v) || 0) * 1e6) / 1e6;

/** 常用的编排帧率。改成别的整数也可以，这里只是给 UI 用。 */
export const FPS_CHOICES = [12, 15, 24, 25, 30, 48, 60, 120];

export function normalizeFps(v, fallback = DEFAULT_FPS) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(1, Math.min(MAX_FPS, Math.round(n)));
}

/** 文件里的 fps；没有或非法时返回 null，让调用方决定怎么提示。 */
export function readFps(data) {
  const raw = data?.fps;
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > MAX_FPS) return null;
  return Math.round(n);
}

export function framesOfSeconds(sec, fps) {
  return Math.round((Number(sec) || 0) * normalizeFps(fps));
}

export function secondsOfFrames(f, fps) {
  return (Number(f) || 0) / normalizeFps(fps);
}

export function secondsOfFrames6(f, fps) {
  return round6(secondsOfFrames(f, fps));
}

/** 总帧数：优先 durationFrames，没有就从 duration 秒换算。 */
export function readDurationFrames(data, fps) {
  const raw = Number(data?.durationFrames);
  if (Number.isInteger(raw) && raw > 0) return raw;
  const sec = Number(data?.duration);
  if (Number.isFinite(sec) && sec > 0) return Math.max(1, Math.round(sec * normalizeFps(fps)));
  return Math.max(1, Math.round(DEFAULT_FPS * 2));
}

/**
 * 一个片段该占哪几帧。
 * durationOf(fxId) 返回特效自身的秒数（没加载到就省略）。
 * 新格式直接用 f / fEnd；旧格式从 t / until 换算，并且只换算这一次。
 */
export function planClipFrames(raw, fps, durationOf) {
  const F = normalizeFps(fps);
  const hasF = Number.isInteger(raw?.f);
  const hasEnd = Number.isInteger(raw?.fEnd);
  if (hasF && hasEnd && raw.fEnd > raw.f) return { f: Math.max(0, raw.f), fEnd: raw.fEnd };

  let f;
  if (hasF) f = Math.max(0, raw.f);
  else if (hasEnd) f = Math.max(0, raw.fEnd - 1);
  else f = Math.max(0, Math.round((Number(raw?.t) || 0) * F));

  let endSec;
  let derived = false;
  if (hasEnd) endSec = raw.fEnd / F;
  else if (raw?.until != null) endSec = Number(raw.until);
  else {
    const startSec = hasF ? f / F : (Number(raw?.t) || 0);
    endSec = startSec + (durationOf?.(raw?.fxId) ?? 1);
    derived = true;
  }
  // 用户明确写的结束时间就近取整；从特效时长推出来的向上取整，别把最后几帧切掉
  const fEnd = Math.max(f + 1, derived ? Math.ceil(endSec * F - 1e-9) : Math.round(endSec * F));
  return { f, fEnd };
}

/** 写片段：帧是唯一真值，t / until 跟着算出来。 */
export function setClipFrames(project, clip, f, fEnd) {
  const fps = normalizeFps(project.fps);
  const total = Math.max(1, Math.round(project.durationFrames ?? project.duration * fps));
  const s = Math.max(0, Math.min(total - 1, Math.round(Number(f) || 0)));
  const e = Math.min(total, Math.max(s + 1, Math.round(Number(fEnd) || s + 1)));
  clip.f = s;
  clip.fEnd = e;
  clip.t = round6(s / fps);
  clip.until = round6(e / fps);
  return clip;
}

/** 只重算秒，不改片段位置（改 fps 时用）。 */
export function syncClipTimes(project, clip) {
  const fps = normalizeFps(project.fps);
  if (!Number.isInteger(clip.f)) clip.f = Math.max(0, Math.round((Number(clip.t) || 0) * fps));
  if (!Number.isInteger(clip.fEnd) || clip.fEnd <= clip.f) {
    const endSec = clip.until != null ? Number(clip.until) : (Number(clip.t) || 0) + 1;
    clip.fEnd = Math.max(clip.f + 1, Math.round(endSec * fps));
  }
  clip.t = round6(clip.f / fps);
  clip.until = round6(clip.fEnd / fps);
  return clip;
}

export function syncProjectTime(project) {
  const fps = normalizeFps(project.fps);
  const total = Math.max(1, Math.round(project.durationFrames ?? (Number(project.duration) || 2) * fps));
  project.durationFrames = total;
  project.duration = round6(total / fps);
  for (const c of project.clips ?? []) {
    syncClipTimes(project, c);
    if (c.fEnd > total) setClipFrames(project, c, Math.min(c.f, total - 1), total);
  }
  return project;
}

/**
 * 改帧率：动作的**真实时长不变**，整条时间轴换到更密或更疏的格子上。
 * 24 → 30 只是采样变细，动作不会变快，特效也不会被截短；每个片段最多挪半帧。
 * （若让帧号原地不动，秒数会等比缩短，原本刚好放下的特效就会被截掉——这一点实测过。）
 */
export function setProjectFps(project, v) {
  const from = normalizeFps(project.fps);
  const to = normalizeFps(v);
  const oldTotal = Math.max(1, Math.round(project.durationFrames ?? (Number(project.duration) || 2) * from));
  const totalSec = oldTotal / from;
  const plan = (project.clips ?? []).map((c) => {
    const f = Number.isInteger(c.f) ? c.f : Math.round((Number(c.t) || 0) * from);
    const fEnd = Number.isInteger(c.fEnd) && c.fEnd > f ? c.fEnd : f + 1;
    return { c, s: f / from, e: fEnd / from };
  });
  project.fps = to;
  project.durationFrames = Math.max(1, Math.round(totalSec * to));
  project.duration = round6(project.durationFrames / to);
  for (const { c, s, e } of plan) {
    const f = Math.max(0, Math.min(project.durationFrames - 1, Math.round(s * to)));
    let fEnd = Math.round(e * to);
    if (fEnd <= f) fEnd = f + Math.max(1, Math.round((e - s) * to));
    c.f = f;
    c.fEnd = Math.max(f + 1, Math.min(project.durationFrames, fEnd));
    c.t = round6(c.f / to);
    c.until = round6(c.fEnd / to);
  }
  return project;
}

export function setProjectDurationFrames(project, n) {
  const fps = normalizeFps(project.fps);
  const total = Math.max(1, Math.round(Number(n) || 1));
  project.durationFrames = total;
  project.duration = round6(total / fps);
  for (const c of project.clips ?? []) {
    if (c.fEnd > total) setClipFrames(project, c, Math.min(c.f, total - 1), total);
  }
  return project;
}

/**
 * 自检：帧 → 秒 → 帧 必须回到原值；秒 → 帧 最多半帧偏差。
 * 返回问题列表，空数组就是全过。
 */
export function verifyConversions(fpsList = [12, 24, 25, 30, 60, 120], maxFrames = 2000) {
  const errors = [];
  for (const fps of fpsList) {
    for (let f = 0; f <= maxFrames; f++) {
      const exact = secondsOfFrames(f, fps);
      if (Math.round(exact * fps) !== f) errors.push(`${fps}fps：第 ${f} 帧往返不一致（${exact}）`);
      const rounded = secondsOfFrames6(f, fps);
      if (Math.round(rounded * fps) !== f) errors.push(`${fps}fps：第 ${f} 帧保留 6 位小数后往返不一致（${rounded}）`);
      if (errors.length > 20) return errors;
    }
    for (let f = 0; f <= maxFrames; f += 37) {
      const sec = f / fps;
      const back = framesOfSeconds(sec, fps);
      if (back !== f) errors.push(`${fps}fps：${sec}s 转帧得到 ${back}，应为 ${f}`);
      if (errors.length > 20) return errors;
    }
  }
  return errors;
}

const CLIP_TIME_FIELDS = new Set(["t", "until", "f", "fEnd", "_pxBounds", "_anchor"]);

/** 干净的片段：去掉渲染缓存字段，帧是唯一真值，秒跟着算出来。 */
function cleanClip(raw, fps, durationOf, total) {
  const out = {};
  for (const [k, v] of Object.entries(raw ?? {})) if (!CLIP_TIME_FIELDS.has(k)) out[k] = v;
  const { f, fEnd } = planClipFrames(raw, fps, durationOf);
  out.f = Math.max(0, Math.min(Math.max(0, total - 1), f));
  out.fEnd = Math.max(out.f + 1, Math.min(total, fEnd));
  out.t = round6(out.f / fps);
  out.until = round6(out.fEnd / fps);
  return out;
}

/**
 * 把任意版本的工程数据收拢成一种格式。
 * - 新格式：直接读 f / fEnd / durationFrames
 * - 旧格式：按 fps 换算一次（没有 fps 时用 fallbackFps）
 * 返回 { project, fpsFromFile }，fpsFromFile=false 说明用了兜底值，UI 要提示。
 */
export function adoptProject(raw, { fallbackFps = DEFAULT_FPS, durationOf } = {}) {
  const fileFps = readFps(raw);
  const fps = fileFps ?? normalizeFps(fallbackFps);
  const src = raw && typeof raw === "object" ? raw : {};
  const tracks = Array.isArray(src.tracks) && src.tracks.length
    ? src.tracks.map((tr, i) => ({ ...tr, id: tr?.id ?? `tr-${i + 1}`, name: tr?.name ?? `图层 ${i + 1}` }))
    : [{ id: "tr-char", name: "角色" }, { id: "tr-fx", name: "特效" }, { id: "tr-target", name: "靶子" }];
  const known = new Set(tracks.map((tr) => tr.id));
  let total = readDurationFrames(src, fps);
  const clips = (Array.isArray(src.clips) ? src.clips : []).map((c) => {
    const copy = { ...c };
    if (!known.has(copy.trackId)) {
      const fallbackTrack = tracks.find((tr) => tr.name === "特效") ?? tracks[0];
      copy.trackId = fallbackTrack.id;
    }
    if (!Number.isInteger(copy.row) || copy.row < 0) copy.row = Math.max(0, Number(copy.row) || 0);
    return copy;
  });
  for (const c of clips) {
    const { f, fEnd } = planClipFrames(c, fps, durationOf);
    total = Math.max(total, fEnd);
  }
  total = Math.max(1, total);
  const project = {
    schema: SCHEMA,
    name: typeof src.name === "string" ? src.name : "未命名编排",
    slug: slugFor(src.name, src.slug),
    fps,
    durationFrames: total,
    duration: round6(total / fps),
    tracks: tracks.map((tr) => ({ ...tr })),
    clips: clips.map((c) => cleanClip(c, fps, durationOf, total)),
  };
  return { project, fpsFromFile: fileFps != null };
}

/** 保存 / 导出用的干净数据：只留字段，不存渲染缓存。 */
export function serializeProject(project) {
  const fps = normalizeFps(project.fps);
  const total = Math.max(1, Math.round(project.durationFrames ?? (Number(project.duration) || 1) * fps));
  return {
    schema: SCHEMA,
    name: project.name ?? "未命名编排",
    slug: slugFor(project.name, project.slug),
    fps,
    durationFrames: total,
    duration: round6(total / fps),
    tracks: (project.tracks ?? []).map((tr) => ({ id: tr.id, name: tr.name })),
    clips: (project.clips ?? []).map((c) => {
      const out = {};
      for (const [k, v] of Object.entries(c)) if (!k.startsWith("_") && k !== "t" && k !== "until") out[k] = v;
      out.t = round6((c.f ?? 0) / fps);
      out.until = round6((c.fEnd ?? 0) / fps);
      return out;
    }),
  };
}
