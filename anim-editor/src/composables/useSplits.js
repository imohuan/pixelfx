// 三个 kit-split 面板尺寸（localStorage 键沿用旧值，避免用户布局被重置）。
export function useSplits() {
  const DEF_LEFT = 250, DEF_RIGHT = 300, DEF_TL = 300;
  const SPLIT_DIVIDER = 10;
  const LS_LEFT = "animEditor.v2.leftW";
  const LS_RIGHT = "animEditor.v3.rightW";
  const LS_TL = "animEditor.v2.timelineH";

  function lsRead(key, def) {
    try {
      const v = parseFloat(localStorage.getItem(key));
      return Number.isFinite(v) ? v : def;
    } catch (e) { return def; }
  }
  function lsWrite(key, v) {
    try { localStorage.setItem(key, String(Math.round(v))); } catch (e) { /* 忽略 */ }
  }

  const leftW = Vue.ref(lsRead(LS_LEFT, DEF_LEFT));
  const rightW = Vue.ref(lsRead(LS_RIGHT, DEF_RIGHT));
  const canvasW = Vue.ref(Math.max(520, (typeof window !== "undefined" ? window.innerWidth : 1440) - leftW.value - rightW.value - SPLIT_DIVIDER * 2));
  const stageH = Vue.ref(Math.max(160, (typeof window !== "undefined" ? window.innerHeight : 900) - DEF_TL - SPLIT_DIVIDER));
  const tlH = Vue.ref(lsRead(LS_TL, DEF_TL));

  const mainSplit = Vue.ref(null);
  const innerSplit = Vue.ref(null);
  const colSplit = Vue.ref(null);

  return { DEF_LEFT, DEF_RIGHT, DEF_TL, SPLIT_DIVIDER, LS_LEFT, LS_RIGHT, LS_TL, lsWrite,
    leftW, rightW, canvasW, stageH, tlH, mainSplit, innerSplit, colSplit };
}
