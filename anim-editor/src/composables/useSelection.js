// 属性面板的编辑回调：改的是 selected clip 的字段，改完排一帧重绘。
import * as EN from "../../engine.js";
import { normalizeFps, setClipFrames, setProjectDurationFrames, setProjectFps } from "../lib/frames.js";
import { fxNameCn } from "../lib/fx-names.js";

const { loadFx, loadedFx } = EN;

export function useSelection({ selected, project, time, scheduleDraw, engineGetter, setTime }) {
  function onStartChange(v) {
    const c = selected.value;
    if (!c) return;
    const fps = normalizeFps(project.fps);
    // 输入框在帧模式下给的是帧号，直接当帧用
    const f = Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : Math.round((Number(c.t) || 0) * fps);
    setClipFrames(project, c, f, Math.max(f + 1, c.fEnd ?? f + 1));
    scheduleDraw();
  }
  function setEnd(v) {
    const c = selected.value;
    if (!c) return;
    const fps = normalizeFps(project.fps);
    setClipFrames(project, c, c.f ?? 0, Math.round(Number(v) || 0));
    scheduleDraw();
  }
  function onDurationChange(v) {
    const fps = normalizeFps(project.fps);
    setProjectDurationFrames(project, Math.round((Number(v) || 0.3) * fps));
    if (time.value > project.duration) setTime(project.duration);
  }
  function onFpsChange(v) {
    // 动作真实时长不变，只换格子：24 → 30 只是采样变细，片段最多挪半帧
    setProjectFps(project, v);
    if (time.value > project.duration) setTime(project.duration);
    scheduleDraw();
    return [];
  }
  function onActChange(v) {
    const c = selected.value;
    if (!c) return;
    c.actRef = v && v !== "none" ? v : null;
    // 动作名不存字段，显示时按 actRef 翻成中文（见 labels.js actName）
    if (c.actRef) loadFx(c.actRef).then(scheduleDraw);
    scheduleDraw();
  }
  function onWeaponChange(v) {
    const c = selected.value;
    if (!c) return;
    c.weapon = v && v !== "none" ? v : null;
    scheduleDraw();
  }
  function onFxChange(v) {
    const c = selected.value;
    if (!c) return;
    c.fxId = v;
    // 换特效必须同时换名字，否则时间轴还挂着上一个特效的中文名
    c.label = fxNameCn(v);
    engineGetter()?.invalidate();
    loadFx(v).then(() => { engineGetter()?.invalidate(); scheduleDraw(); });
    scheduleDraw();
  }
  /** 改角色名 / 特效名：空字符串回到默认中文名 */
  function onLabelChange(v) {
    const c = selected.value;
    if (!c) return;
    const name = String(v ?? "").trim();
    if (c.type === "fx") c.label = name || fxNameCn(c.fxId);
    else if (c.type === "character") c.label = name || "角色";
    scheduleDraw();
  }
  function onSeedChange(v) {
    const c = selected.value;
    if (!c) return;
    c.seed = Number(v) || 1;
    engineGetter()?.invalidate();
    scheduleDraw();
  }
  function onPaletteChange(v) {
    const c = selected.value;
    if (!c) return;
    c.palette = v;
    engineGetter()?.invalidate();
    scheduleDraw();
  }
  function onToggleTo(on) {
    const c = selected.value;
    if (!c) return;
    c.to = on ? [c.from?.[0] ?? 0, c.from?.[1] ?? 0] : null;
    scheduleDraw();
  }
  function setFrom(idx, v) {
    const c = selected.value;
    if (!c) return;
    const arr = c.from ?? [0, 0];
    const next = [arr[0], arr[1]];
    next[idx] = Number(v) || 0;
    c.from = next;
    scheduleDraw();
  }
  function setTo(idx, v) {
    const c = selected.value;
    if (!c) return;
    const arr = c.to ?? [0, 0];
    const next = [arr[0], arr[1]];
    next[idx] = Number(v) || 0;
    c.to = next;
    scheduleDraw();
  }
  function setBox(idx, v) {
    const c = selected.value;
    if (!c) return;
    const arr = c.box ?? [130, -60, 80, 60];
    const next = arr.slice();
    next[idx] = Number(v) || 0;
    c.box = next;
  }
  function onBindChange(v) {
    const c = selected.value;
    if (!c) return;
    c.bindTo = v && v !== "none" ? v : null;
    engineGetter()?.resetTargets();
    scheduleDraw();
  }
  function actionInfo(c) {
    const eng = engineGetter();
    if (!eng || !c) return null;
    return eng.actionInfo(c, time.value);
  }
  return { onStartChange, setEnd, onDurationChange, onFpsChange, onActChange, onWeaponChange, onFxChange, onLabelChange, onSeedChange, onPaletteChange, onToggleTo, setFrom, setTo, setBox, onBindChange, actionInfo };
}
