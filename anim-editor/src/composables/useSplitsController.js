// kit-split 尺寸控制器：把 useSplits 的状态落到 DOM（照搬原 applyLeftWidth 一族）。
export function useSplitsController(S, { canvasW, stageH, tlH, leftW, rightW }) {
  const { DEF_LEFT, DEF_RIGHT, SPLIT_DIVIDER, lsWrite } = S;

  function splitRoot(sel) {
    const el = document.querySelector(sel);
    return el && el.classList.contains("kit-split") ? el : null;
  }
  function setSplitPx(refObj, px) {
    const vm = refObj.value;
    if (!vm || typeof vm.measure !== "function") return false;
    vm.measure();
    const total = vm.containerW;
    if (!(total > 0)) return false;
    vm.collapsed = null;
    vm.ratio = Math.min(Math.max(px / total, vm.minLeft / total), vm.maxLeft / total);
    vm.emitSize();
    return true;
  }
  function mainTotalW() {
    const el = splitRoot(".main-split");
    const w = el ? el.clientWidth : 0;
    return w > 200 ? w : window.innerWidth;
  }
  function innerTotalW() {
    const el = splitRoot(".inner-split");
    return el ? Math.max(0, el.clientWidth - SPLIT_DIVIDER) : 0;
  }
  function colTotalH() {
    const el = splitRoot(".col-split");
    return el ? Math.max(0, el.clientHeight - SPLIT_DIVIDER) : 0;
  }
  function syncInnerWidth() {
    const total = innerTotalW();
    if (!(total > 0)) return;
    const cw = Math.max(520, total - rightW.value);
    if (Math.abs(cw - canvasW.value) < 1) return;
    canvasW.value = cw;
    setSplitPx(S.innerSplit, cw);
  }
  function applyLeftWidth(w, save) {
    const total = mainTotalW();
    const maxW = Math.max(200, total - SPLIT_DIVIDER - rightW.value - 520 - SPLIT_DIVIDER);
    leftW.value = Math.round(Math.max(200, Math.min(maxW, Number(w) || DEF_LEFT)));
    setSplitPx(S.mainSplit, leftW.value);
    if (save) lsWrite(S.LS_LEFT, leftW.value);
    Vue.nextTick(syncInnerWidth);
  }
  function applyTimelineHeight(h) {
    const total = colTotalH();
    if (!(total > 0)) return;
    tlH.value = Math.max(140, Math.min(total - 160, Math.round(h)));
    const sh = Math.max(160, total - tlH.value);
    stageH.value = sh;
    setSplitPx(S.colSplit, sh);
    lsWrite(S.LS_TL, tlH.value);
  }
  function onWinResize() {
    requestAnimationFrame(() => {
      applyLeftWidth(leftW.value, false);
      if (tlH.value > 0) applyTimelineHeight(tlH.value);
    });
  }
  function applyRightWidth(w, save) {
    const total = innerTotalW();
    if (!(total > 0)) return;
    rightW.value = Math.round(Math.max(200, Math.min(total - 520, Number(w) || DEF_RIGHT)));
    const cw = Math.max(520, total - rightW.value);
    canvasW.value = cw;
    setSplitPx(S.innerSplit, cw);
    if (save) lsWrite(S.LS_RIGHT, rightW.value);
  }
  function initWatchers() {
    Vue.watch(stageH, (v) => {
      const total = colTotalH();
      if (!(total > 0) || !(v > 0)) return;
      tlH.value = Math.max(140, Math.min(total - 160, Math.round(total - v)));
    });
    let splitReady = false;
    let lastInnerTotal = 0;
    Vue.watch(canvasW, (v) => {
      if (!splitReady) return;
      const total = innerTotalW();
      if (!(total > 0) || !(v > 0)) return;
      if (Math.abs(total - lastInnerTotal) > 1) {
        lastInnerTotal = total;
        syncInnerWidth();
        return;
      }
      rightW.value = Math.round(Math.max(200, total - v));
      lsWrite(S.LS_RIGHT, rightW.value);
    });
    Vue.watch(leftW, (v) => {
      if (!splitReady) return;
      lsWrite(S.LS_LEFT, v);
      Vue.nextTick(syncInnerWidth);
    });
    return {
      markReady() { splitReady = true; lastInnerTotal = innerTotalW(); },
    };
  }
  return { splitRoot, setSplitPx, syncInnerWidth, applyLeftWidth, applyTimelineHeight, applyRightWidth, onWinResize, initWatchers };
}
