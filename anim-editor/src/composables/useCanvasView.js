// 画布尺寸自适应 + 重绘调度 + 取景/聚焦/缩放。
import * as EN from "../../engine.js";

const { view, resetView } = EN;

export function useCanvasView({ canvasEl, stageEl, project, time, viewScale, engineGetter, gizmo }) {
  let engine = null;
  let rafId = 0;
  let lastTs = 0;
  let drawPending = 0;
  let ro = null;

  function drawNow() {
    const eng = engineGetter();
    if (!eng) return;
    eng.time = time.value;
    try { eng.draw(); } catch (e) { console.warn("draw", e); }
    const s = Math.round(view.scale * 100) / 100;
    if (s !== viewScale.value) viewScale.value = s;
  }
  function scheduleDraw() {
    if (drawPending) return;
    drawPending = requestAnimationFrame(() => { drawPending = 0; drawNow(); });
  }
  const redraw = scheduleDraw;

  function sizeCanvas() {
    const cv = canvasEl.value, wrap = stageEl.value;
    if (!cv || !wrap) return;
    const w = Math.max(120, Math.round(wrap.clientWidth));
    const h = Math.max(120, Math.round(wrap.clientHeight));
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
    }
    scheduleDraw();
  }
  function mount() {
    engine = engineGetter();
    ro = new ResizeObserver(() => sizeCanvas());
    ro.observe(stageEl.value);
  }
  function unmount() {
    ro?.disconnect();
    cancelAnimationFrame(rafId);
  }

  function autoFit() {
    const eng = engineGetter();
    if (eng?.fitCurrent) eng.fitCurrent();
    else resetView(canvasEl.value);
    drawNow();
  }
  function focusSelection(selBoxFn) {
    const c = selBoxFn?.();
    const cv = canvasEl.value;
    if (!c || !cv) { autoFit(); return; }
    const want = Math.max(view.minScale, Math.min(view.maxScale, (cv.height * 0.55) / Math.max(20, c.h)));
    view.scale = want;
    view.offsetX = Math.round(cv.width / 2 - c.x * want);
    view.offsetY = Math.round(cv.height * 0.78 - c.y * want);
    view.userMoved = true;
    drawNow();
  }
  function zoomBy(factor) {
    const cv = canvasEl.value;
    if (!cv) return;
    EN.zoomAt(cv.width / 2, cv.height * 0.7, factor);
    drawNow();
  }

  function onKey(e, handlers) {
    const tag = document.activeElement?.tagName || "";
    if (/INPUT|SELECT|TEXTAREA/.test(tag)) return;
    if (e.key === "0") { handlers.autoFit(); }
    else if (e.key === "f" || e.key === "F") { handlers.focusSelection(); }
    else if (e.key === "r" || e.key === "R") { handlers.autoFit(); }
    else if (e.key === " ") { e.preventDefault(); handlers.togglePlay(); }
    else if (e.key === "Delete" || e.key === "Backspace") { handlers.removeSelected(); }
    else if (e.key === "ArrowLeft") { handlers.setTime(time.value - 1 / project.fps); }
    else if (e.key === "ArrowRight") { handlers.setTime(time.value + 1 / project.fps); }
  }

  return { drawNow, scheduleDraw, redraw, sizeCanvas, mount, unmount, autoFit, focusSelection, zoomBy, onKey, setEngine: (e) => { engine = e; } };
}
