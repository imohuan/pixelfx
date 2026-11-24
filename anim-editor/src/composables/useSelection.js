// 属性面板的编辑回调：改的是 selected clip 的字段，改完排一帧重绘。
import * as EN from "../../engine.js";

const { loadFx } = EN;

export function useSelection({ selected, project, time, scheduleDraw, engineGetter, setTime }) {
  function onStartChange(v) {
    const c = selected.value;
    if (!c) return;
    c.t = Math.max(0, Number(v) || 0);
    if (c.until != null && c.until <= c.t) c.until = Math.min(project.duration, c.t + 0.2);
    scheduleDraw();
  }
  function setEnd(v) {
    const c = selected.value;
    if (!c) return;
    c.until = Math.max(c.t + 0.05, Math.min(project.duration, Number(v) || 0));
    scheduleDraw();
  }
  function onDurationChange(v) {
    const d = Math.max(0.3, Number(v) || 0.3);
    project.duration = Math.round(d * 1000) / 1000;
    if (time.value > project.duration) setTime(project.duration);
  }
  function onFpsChange(v) {
    project.fps = Math.max(1, Math.round(Number(v) || 24));
  }
  function onActChange(v) {
    const c = selected.value;
    if (!c) return;
    c.actRef = v && v !== "none" ? v : null;
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
    engineGetter()?.invalidate();
    loadFx(v).then(() => { engineGetter()?.invalidate(); scheduleDraw(); });
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
  return { onStartChange, setEnd, onDurationChange, onFpsChange, onActChange, onWeaponChange, onFxChange, onSeedChange, onPaletteChange, onToggleTo, setFrom, setTo, setBox, onBindChange, actionInfo };
}
