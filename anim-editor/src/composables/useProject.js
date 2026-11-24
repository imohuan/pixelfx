// 项目数据 + 选中 + 增删片段/轨道。所有函数回写 reactive project / ref selectedId。
import * as EN from "../../engine.js";
import { fxNameCn } from "../lib/fx-names.js";

const { loadedFx, loadFx } = EN;

export const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

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
    const t0 = Math.min(timeRef.value, Math.max(0, project.duration - 0.2));
    const trackOf = (name) => project.tracks.find((x) => x.name === name)?.id ?? project.tracks[0].id;
    let c;
    if (type === "character") {
      c = { id: uid("c"), trackId: trackOf("角色"), type: "character", t: t0, until: Math.min(project.duration, t0 + 2), actRef: null, actStart: 0, weapon: null, x: 0, y: 0, scale: 1, angle: 0 };
    } else if (type === "fx") {
      c = { id: uid("c"), trackId: trackOf("特效"), type: "fx", t: t0, until: Math.min(project.duration, t0 + 0.75), fxId: "melee/sword-slash", from: [16, -22], to: null, scale: 1, angle: 0, seed: 1, palette: "default", label: "新特效" };
      loadFx("melee/sword-slash").then(scheduleDraw);
    } else if (type === "target") {
      c = { id: uid("c"), trackId: trackOf("靶子"), type: "target", t: 0, until: project.duration, x: 170, y: 0 };
    } else {
      const firstTarget = project.clips.find((x) => x.type === "target");
      c = { id: uid("c"), trackId: trackOf("靶子"), type: "state", t: t0, until: Math.min(project.duration, t0 + 2), skin: "ice", hit: true, bindTo: firstTarget?.id ?? null, push: 1.4, straw: 10, shiver: 1, damage: 10, box: [130, -60, 80, 60] };
    }
    project.clips.push(c);
    selectedId.value = c.id;
  }

  function dropFxOnStage(fxId, worldX, worldY) {
    const t0 = Math.min(timeRef.value, Math.max(0, project.duration - 0.2));
    const trackOf = (name) => project.tracks.find((x) => x.name === name)?.id ?? project.tracks[0].id;
    const c = { id: uid("c"), trackId: trackOf("特效"), type: "fx", t: t0, until: Math.min(project.duration, t0 + 1), fxId, from: [Math.round(worldX), Math.round(worldY)], to: null, scale: 1, angle: 0, seed: 1, palette: "default", label: fxNameCn(fxId) };
    project.clips.push(c);
    selectedId.value = c.id;
    loadFx(fxId).then((m) => {
      const d = m?.meta?.duration ?? 1;
      c.until = Math.min(project.duration, c.t + d);
      engineGetter()?.invalidate?.();
      scheduleDraw();
    });
    scheduleDraw();
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
    const copy = JSON.parse(JSON.stringify(c));
    copy.id = uid("c");
    copy.t = Math.min(Math.max(0, project.duration - 0.05), c.t + 0.2);
    if (copy.until != null) copy.until = Math.min(project.duration, copy.until + 0.2);
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
  function replaceAll(data) {
    project.tracks = JSON.parse(JSON.stringify(data.tracks ?? []));
    project.clips = JSON.parse(JSON.stringify(data.clips ?? []));
    project.duration = data.duration ?? 4.34;
    project.fps = data.fps ?? 24;
    normalizeRows();
    selectedId.value = project.clips[0]?.id ?? null;
    engineGetter()?.invalidate();
    engineGetter()?.clearTargets();
    const mods = new Set();
    for (const c of project.clips) { if (c.fxId) mods.add(c.fxId); if (c.actRef) mods.add(c.actRef); }
    Promise.all([...mods].map((id) => loadFx(id).catch(() => null))).then(() => { engineGetter()?.invalidate(); scheduleDraw(); });
    scheduleDraw();
  }
  return { project, selectedId, selected, sortedClips, clips, trackOptions, addClip, dropFxOnStage, addTrack, removeTrack, removeSelected, duplicate, selectClip, selectTrack, replaceAll, clipEndOf, activeAt, normalizeRows };
}
