// 项目数据 + 选中 + 增删片段/轨道。所有函数回写 reactive project / ref selectedId。
import * as EN from "../../engine.js";
import { fxNameCn } from "../lib/fx-names.js";
import { adoptProject, setClipFrames, syncProjectTime, normalizeFps, secondsOfFrames } from "../lib/frames.js";

const { loadedFx, loadFx } = EN;

export const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

/** 片段该占的帧：新数据优先用 f / fEnd，缺失时才按秒换算。 */
export function clipFramesOf(project, c) {
  const fps = normalizeFps(project.fps);
  if (!c) return { f: 0, fEnd: 0 };
  if (Number.isInteger(c.f) && Number.isInteger(c.fEnd) && c.fEnd > c.f) return { f: c.f, fEnd: c.fEnd };
  const f = Math.max(0, Math.round((Number(c.t) || 0) * fps));
  const into = c.until != null
    ? (Number(c.until) - (Number(c.t) || 0))
    : (loadedFx(c.fxId)?.meta?.duration ?? 1);
  return { f, fEnd: Math.max(f + 1, Math.round((f + into * fps))) };
}

export function clipEndOf(c) {
  if (!c) return 0;
  if (c.until != null) return c.until;
  const d = loadedFx(c.fxId)?.meta?.duration ?? 1;
  return c.t + d;
}
export const activeAt = (c, t) => t >= c.t - 1e-6 && t <= clipEndOf(c) + 1e-6;

export function useProject(scheduleDraw, engineGetter = () => null, timeRef = Vue.ref(0)) {
  const project = Vue.reactive(EN.defaultProject());
  const selectedId = Vue.ref("c-char");
  const selected = Vue.computed(() => project.clips.find((c) => c.id === selectedId.value) ?? null);
  const sortedClips = Vue.computed(() => [...project.clips].sort((a, b) => a.t - b.t));
  const clips = Vue.computed(() => project.clips);
  const trackOptions = Vue.computed(() => project.tracks.map((tr) => ({ label: tr.name, value: tr.id })));

  function addClip(type) {
    const fps = normalizeFps(project.fps);
    const f0 = Math.min(Math.round(timeRef.value * fps), Math.max(0, project.durationFrames - 2));
    const trackOf = (name) => project.tracks.find((x) => x.name === name)?.id ?? project.tracks[0].id;
    let c;
    if (type === "character") {
      c = { id: uid("c"), trackId: trackOf("角色"), type: "character", actRef: null, actStart: 0, weapon: null, x: 0, y: 0, scale: 1, angle: 0 };
      setClipFrames(project, c, f0, Math.min(project.durationFrames, f0 + 2 * fps));
    } else if (type === "fx") {
      c = { id: uid("c"), trackId: trackOf("特效"), type: "fx", fxId: "melee/sword-slash", from: [16, -22], to: null, scale: 1, angle: 0, seed: 1, palette: "default", label: "新特效" };
      setClipFrames(project, c, f0, Math.min(project.durationFrames, f0 + Math.round(0.75 * fps)));
      loadFx("melee/sword-slash").then(scheduleDraw);
    } else if (type === "target") {
      c = { id: uid("c"), trackId: trackOf("靶子"), type: "target", x: 170, y: 0 };
      setClipFrames(project, c, 0, project.durationFrames);
    } else {
      const firstTarget = project.clips.find((x) => x.type === "target");
      c = { id: uid("c"), trackId: trackOf("靶子"), type: "state", skin: "ice", hit: true, bindTo: firstTarget?.id ?? null, push: 1.4, straw: 10, shiver: 1, damage: 10, box: [130, -60, 80, 60] };
      setClipFrames(project, c, f0, Math.min(project.durationFrames, f0 + 2 * fps));
    }
    project.clips.push(c);
    selectedId.value = c.id;
  }

  /** 图层里这一段时间能不能放进某一行；返回第一个空行，全满则 rows 表示需要新行。 */
  function findRowForRange(trackId, f, fEnd, excludeId) {
    let rows = 0;
    for (const c of project.clips) {
      if (c.trackId === trackId) rows = Math.max(rows, (c.row ?? 0) + 1);
    }
    for (let r = 0; r < Math.max(1, rows); r++) {
      const clash = project.clips.some((c) => c.trackId === trackId && c.id !== excludeId && (c.row ?? 0) === r && f < c.fEnd && fEnd > c.f);
      if (!clash) return { row: r, fits: true };
    }
    return { row: rows, fits: false };
  }

  /**
   * 资源库拖进画布：落在当前选中的图层里。
   * 该图层有能放下这段时间的行就放进那一行；所有行都放不下 → 在这一层内部新增一行（不新建图层）。
   * 没有选中任何图层时用「特效」图层；连特效图层都没有才创建一个。
   */
  async function dropFxOnStage(fxId, worldX, worldY, trackId) {
    const fps = normalizeFps(project.fps);
    const total = Math.max(1, Math.round(project.durationFrames ?? project.duration * fps));
    const f0 = Math.min(Math.round(timeRef.value * fps), Math.max(0, total - 1));
    // 目标图层：选中的那个；没选中就用「特效」；还没有就建一个「特效」
    function resolveTrack() {
      const picked = project.tracks.find((t) => t.id === trackId);
      if (picked) return picked;
      const fx = project.tracks.find((t) => t.name === "特效");
      if (fx) return fx;
      const created = { id: uid("tr"), name: "特效" };
      project.tracks.push(created);
      return created;
    }
    // 先用已知时长（未加载到就按 1 秒）定出落点，保证拖入立即有反馈
    const durFirst = loadedFx(fxId)?.meta?.duration ?? 1;
    const place = (durSec, clip) => {
      const fEnd = Math.min(total, Math.max(f0 + 1, f0 + Math.ceil(durSec * fps)));
      const wanted = resolveTrack().id;
      // 已经放下的片段要先从候选里排除自己，否则会被自己顶开
      const slot = findRowForRange(wanted, f0, fEnd, clip?.id);
      if (slot.fits) {
        if (clip) { clip.trackId = wanted; clip.row = slot.row; }
        return { trackId: wanted, row: slot.row };
      }
      // 这一层所有行都放不下 → 在这一层内部新增一行（row 追加到最后），不新建图层
      if (clip) { clip.trackId = wanted; clip.row = slot.row; }
      return { trackId: wanted, row: slot.row, newRow: true };
    };
    const spot = place(durFirst, null);
    const c = { id: uid("c"), trackId: spot.trackId, row: spot.row, type: "fx", fxId, from: [Math.round(worldX), Math.round(worldY)], to: null, scale: 1, angle: 0, seed: 1, palette: "default", label: fxNameCn(fxId) };
    setClipFrames(project, c, f0, Math.min(total, Math.max(f0 + 1, f0 + Math.ceil(durFirst * fps))));
    project.clips.push(c);
    selectedId.value = c.id;
    engineGetter()?.invalidate?.();
    scheduleDraw();
    // 真实时长加载完后再校正一次（新行已经建多了不会再建）
    loadFx(fxId).then((m) => {
      const d = m?.meta?.duration ?? durFirst;
      const end = Math.min(total, Math.max(f0 + 1, f0 + Math.ceil(d * fps)));
      setClipFrames(project, c, f0, end);
      if (!findRowForRange(c.trackId, c.f, c.fEnd, c.id).fits) place(d, c);
      engineGetter()?.invalidate?.();
      scheduleDraw();
    }).catch(() => {});
    return c;
  }
  function addTrack() {
    project.tracks.push({ id: uid("tr"), name: "轨道 " + (project.tracks.length + 1) });
  }
  function removeTrack(trackId) {
    if (project.tracks.length <= 1) return;
    const fallback = project.tracks.find((x) => x.id !== trackId).id;
    for (const c of project.clips) if (c.trackId === trackId) c.trackId = fallback;
    project.tracks = project.tracks.filter((x) => x.id !== trackId);
  }
  function removeSelected() {
    const c = selected.value;
    if (!c) return;
    project.clips = project.clips.filter((x) => x.id !== c.id);
    selectedId.value = project.clips[0]?.id ?? null;
    engineGetter()?.clearTargets();
    scheduleDraw();
  }
  function duplicate() {
    const c = selected.value;
    if (!c) return;
    const fps = normalizeFps(project.fps);
    const copy = JSON.parse(JSON.stringify(c));
    copy.id = uid("c");
    const shift = Math.max(1, Math.round(0.2 * fps));
    setClipFrames(project, copy, Math.min(project.durationFrames - 1, c.f + shift), Math.min(project.durationFrames, c.fEnd + shift));
    project.clips.push(copy);
    selectedId.value = copy.id;
  }
  function selectClip(id) { selectedId.value = id; }
  // 同一行禁止重叠：把每个片段分配到该图层里第一个空出来的行
  function normalizeRows() {
    const occupied = new Map();
    for (const c of [...project.clips].sort((a, b) => a.t - b.t)) {
      if (!occupied.has(c.trackId)) occupied.set(c.trackId, []);
      const rows = occupied.get(c.trackId);
      const dur = clipEndOf(c) - c.t;
      let row = 0;
      for (;;) {
        const clash = rows.some((r) => r.row === row && c.t < r.end - 1e-6 && c.t + dur > r.t + 1e-6);
        if (!clash) break;
        row++;
      }
      c.row = row;
      rows.push({ row, t: c.t, end: c.t + dur });
    }
  }
  function selectTrack(trackId) {
    const first = project.clips.find((c) => c.trackId === trackId);
    if (first) selectedId.value = first.id;
  }
  /** 载入任意版本的工程：统一换算成帧存储。fpsFromFile=false 表示文件没写帧率。 */
  async function replaceAll(data) {
    const adopted = adoptProject(data, { durationOf: (fxId) => loadedFx(fxId)?.meta?.duration });
    const next = adopted.project;
    project.schema = next.schema;
    project.name = next.name;
    project.tracks = next.tracks;
    project.clips = next.clips;
    project.fps = next.fps;
    project.durationFrames = next.durationFrames;
    project.duration = next.duration;
    normalizeRows();
    selectedId.value = project.clips[0]?.id ?? null;
    engineGetter()?.invalidate();
    engineGetter()?.clearTargets();
    const mods = new Set();
    for (const c of project.clips) { if (c.fxId) mods.add(c.fxId); if (c.actRef) mods.add(c.actRef); }
    await Promise.all([...mods].map((id) => loadFx(id).catch(() => null)));
    // 特效时长要等模块加载完才准：画面没被裁掉，总长取两者较大值
    let total = project.durationFrames;
    for (const c of project.clips) if (c.fEnd > total) total = c.fEnd;
    project.durationFrames = total;
    project.duration = secondsOfFrames(total, project.fps);
    syncProjectTime(project);
    normalizeRows();
    engineGetter()?.invalidate();
    scheduleDraw();
    return adopted;
  }
  return { project, selectedId, selected, sortedClips, clips, trackOptions, addClip, dropFxOnStage, addTrack, removeTrack, removeSelected, duplicate, selectClip, selectTrack, replaceAll, clipEndOf, activeAt, normalizeRows };
}
