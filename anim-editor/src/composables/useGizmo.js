// Gizmo：选中框/四角缩放/原点轴箭头，含命中测试与拖拽应用。engine 由组装方注入。
import * as EN from "../../engine.js";

const { view, screenToWorld, zoomAt } = EN;

const HANDLE_HIT = 9;
const ARROW_LEN = 46;

export function useGizmo({ selected, selectedId, project, time, canvasEl, engineGetter, drawNow }) {
  const showBox = Vue.ref(true);
  const showAxes = Vue.ref(true);
  const handMode = Vue.ref(false); // 手抓模式：左键只拖画布，不选中
  const gizmoHover = Vue.ref(null);

  let panning = false;
  let panStart = null;
  let panPointerId = null;
  let gizmoDrag = null;

  function toggleBox() {
    showBox.value = !showBox.value;
    if (!showBox.value) gizmoHover.value = null;
    if (canvasEl.value) canvasEl.value.style.cursor = "";
    drawNow();
  }
  function toggleAxes() {
    showAxes.value = !showAxes.value;
    if (!showAxes.value) gizmoHover.value = null;
    if (canvasEl.value) canvasEl.value.style.cursor = "";
    drawNow();
  }

  function toggleHand() {
    handMode.value = !handMode.value;
    gizmoHover.value = null;
    if (handMode.value) selectedId.value = null; // 进入手抓模式先取消选中
    if (canvasEl.value) canvasEl.value.style.cursor = handMode.value ? "grab" : "";
    drawNow();
  }

  function toScreen(wx, wy) {
    return { x: wx * view.scale + view.offsetX, y: wy * view.scale + view.offsetY };
  }
  function toWorldScale(s) { return s / view.scale; }
  function canvasPoint(e) {
    const cv = canvasEl.value;
    const r = cv.getBoundingClientRect();
    const sx = (e.clientX - r.left) * (cv.width / r.width);
    const sy = (e.clientY - r.top) * (cv.height / r.height);
    const w = screenToWorld(sx, sy);
    return { sx, sy, x: w.x, y: w.y };
  }

  function selBox() {
    const c = selected.value;
    const eng = engineGetter();
    if (!c || !eng) return null;
    const b = eng.boundsOf(c, time.value);
    if (!b) return null;
    if (c.type === "fx") {
      const host = project.clips.find((x) => x.type === "character" && (t => t >= x.t - 1e-6 && t <= (x.until ?? x.t + 1) + 1e-6)(time.value));
      const ox = c._anchor ? c._anchor.x : (host?.x ?? 0) + (c.from?.[0] ?? 0);
      const oy = c._anchor ? c._anchor.y : (host?.y ?? 0) + (c.from?.[1] ?? 0);
      const mx = b.minX ?? -b.w / 2, Mx = b.maxX ?? b.w / 2;
      const my = b.minY ?? -b.h / 2, My = b.maxY ?? b.h / 2;
      return { x: ox, y: oy, w: b.w, h: b.h, scale: c.scale ?? 1, isFx: true,
               left: ox + mx, right: ox + Mx, top: oy + my, bottom: oy + My };
    }
    const ox = c.x ?? 0, oy = c.y ?? 0;
    if (b.minX !== undefined) {
      return { x: ox, y: oy, w: b.w, h: b.h, scale: c.scale ?? 1,
               left: ox + b.minX, right: ox + b.maxX, top: oy + b.minY, bottom: oy + b.maxY };
    }
    return { x: ox, y: oy, w: b.w, h: b.h, scale: c.scale ?? 1,
             left: ox - b.w / 2, right: ox + b.w / 2, top: oy - b.h, bottom: oy };
  }

  function gizmoHandles() {
    const b = selBox();
    if (!b) return null;
    const corners = [
      { x: b.left, y: b.top }, { x: b.right, y: b.top },
      { x: b.right, y: b.bottom }, { x: b.left, y: b.bottom },
    ];
    return { box: b, corners };
  }

  function drawGizmo(ctx) {
    const c = selected.value;
    if (handMode.value) return; // 手抓模式不画选中框 / 坐标轴
    if (!c) return;
    const g = gizmoHandles();
    if (!g) return;
    const { box, corners } = g;
    const tl = corners.map((p) => toScreen(p.x, p.y));
    const s = toScreen(box.x, box.y);
    if (showBox.value) {
      ctx.save();
      ctx.strokeStyle = "#0a84ff";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.rect(tl[0].x, tl[0].y, tl[2].x - tl[0].x, tl[2].y - tl[0].y);
      ctx.stroke();
      ctx.setLineDash([]);
      const hot = gizmoHover.value;
      for (let i = 0; i < 4; i++) {
        const isHot = hot === "corner" + i;
        ctx.fillStyle = isHot ? "#ffd60a" : "#ffffff";
        ctx.strokeStyle = "#0a84ff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.rect(tl[i].x - 4, tl[i].y - 4, 8, 8);
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
    if (showAxes.value) {
      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = "#ff453a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + ARROW_LEN, s.y);
      ctx.stroke();
      ctx.fillStyle = "#ff453a";
      ctx.beginPath();
      ctx.moveTo(s.x + ARROW_LEN + 6, s.y);
      ctx.lineTo(s.x + ARROW_LEN - 4, s.y - 5);
      ctx.lineTo(s.x + ARROW_LEN - 4, s.y + 5);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#30d158";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x, s.y - ARROW_LEN);
      ctx.stroke();
      ctx.fillStyle = "#30d158";
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - ARROW_LEN - 6);
      ctx.lineTo(s.x - 5, s.y - ARROW_LEN + 4);
      ctx.lineTo(s.x + 5, s.y - ARROW_LEN + 4);
      ctx.closePath();
      ctx.fill();
      const hot = gizmoHover.value === "origin";
      ctx.beginPath();
      ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = hot ? "#ffd60a" : "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#1c1c1e";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    }
  }

  function hitGizmo(sx, sy) {
    const g = gizmoHandles();
    if (!g) return null;
    const { box, corners } = g;
    const s = toScreen(box.x, box.y);
    const tl = corners.map((p) => toScreen(p.x, p.y));
    if (showBox.value) {
      for (let i = 0; i < 4; i++) {
        if (Math.abs(sx - tl[i].x) <= HANDLE_HIT && Math.abs(sy - tl[i].y) <= HANDLE_HIT) return { kind: "corner" + i };
      }
    }
    if (showAxes.value) {
      if (Math.hypot(sx - s.x, sy - s.y) <= 9) return { kind: "origin" };
      if (Math.abs(sy - s.y) <= 7 && sx >= s.x && sx <= s.x + ARROW_LEN + 8) return { kind: "axisX" };
      if (Math.abs(sx - s.x) <= 7 && sy <= s.y && sy >= s.y - ARROW_LEN - 8) return { kind: "axisY" };
    }
    return null;
  }

  function applyGizmoDrag(handle, sx, sy, start) {
    const c = selected.value;
    if (!c) return;
    const dsx = (sx - start.sx), dsy = (sy - start.sy);
    if (handle === "origin") {
      const dx = toWorldScale(dsx), dy = toWorldScale(dsy);
      if (c.type === "fx") {
        c.from = [Math.round(start.fx0 + dx), Math.round(start.fy0 + dy)];
        if (c.to) c.to = [Math.round(start.tx0 + dx), Math.round(start.ty0 + dy)];
      } else {
        c.x = Math.round(start.ox + dx);
        c.y = Math.round(start.oy + dy);
      }
    } else if (handle === "axisX") {
      const dx = toWorldScale(dsx);
      if (c.type === "fx") {
        c.from = [Math.round(start.fx0 + dx), start.fy0];
        if (c.to) c.to = [Math.round(start.tx0 + dx), start.ty0];
      } else c.x = Math.round(start.ox + dx);
    } else if (handle === "axisY") {
      const dy = toWorldScale(dsy);
      if (c.type === "fx") {
        c.from = [start.fx0, Math.round(start.fy0 + dy)];
        if (c.to) c.to = [start.tx0, Math.round(start.ty0 + dy)];
      } else c.y = Math.round(start.oy + dy);
    } else if (handle.startsWith("corner")) {
      const d0 = Math.max(8, Math.hypot(start.sx - start.anchorSx, start.sy - start.anchorSy));
      const d1 = Math.hypot(sx - start.anchorSx, sy - start.anchorSy);
      const k = (start.scale * d1) / d0;
      if (!isFinite(k)) return;
      c.scale = Math.round(Math.max(0.2, Math.min(10, k)) * 100) / 100;
    }
    drawNow();
  }

  function onWheel(e) {
    e.preventDefault();
    const p = canvasPoint(e);
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;
    else if (e.deltaMode === 2) dy *= canvasEl.value.getBoundingClientRect().height;
    if (zoomAt(p.sx, p.sy, Math.exp(-dy * 0.0018))) drawNow();
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;
    const cv = canvasEl.value;
    cv.setPointerCapture?.(e.pointerId); // 拖拽出画布也能收到 move/up，避免平移态卡死
    if (handMode.value) {
      // 手抓模式：左键直接拖画布，不选中任何元素
      panning = true;
      panPointerId = e.pointerId;
      view.userMoved = true;
      panStart = { x: e.clientX, y: e.clientY, ox: view.offsetX, oy: view.offsetY };
      cv.classList.add("grabbing");
      return;
    }
    const r = cv.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const c = selected.value;
    const eng = engineGetter();
    if (c) {
      const hit = hitGizmo(sx, sy);
      if (hit) {
        const g = gizmoHandles();
        const box = g.box;
        const idx = hit.kind.startsWith("corner") ? +hit.kind.slice(6) : 0;
        const anchor = g.corners[(idx + 2) % 4];
        const as = toScreen(anchor.x, anchor.y);
        gizmoDrag = {
          handle: hit.kind,
          sx, sy,
          ox: c.x ?? 0, oy: c.y ?? 0,
          fx0: c.from?.[0] ?? 0, fy0: c.from?.[1] ?? 0,
          tx0: c.to?.[0] ?? 0, ty0: c.to?.[1] ?? 0,
          scale: c.scale ?? 1,
          anchorSx: as.x, anchorSy: as.y,
        };
        cv.setPointerCapture?.(e.pointerId);
        return;
      }
    }
    const p = canvasPoint(e);
    const t = time.value;
    let best = null;
    const considerRect = (clip, left, top, right, bottom) => {
      const pad = 6;
      if (p.x >= left - pad && p.x <= right + pad && p.y >= top - pad && p.y <= bottom + pad) {
        const cx = (left + right) / 2, cy = (top + bottom) / 2;
        const score = (clip.id === selectedId.value ? -1000 : 0) + Math.abs(p.x - cx) + Math.abs(p.y - cy);
        if (!best || score < best.score) best = { clip, score };
      }
    };
    const isActive = (x) => t >= x.t - 1e-6 && t <= (x.until ?? x.t + 1) + 1e-6;
    for (const ch of project.clips.filter((x) => x.type === "character" && isActive(x))) {
      const b = eng.boundsOf(ch, t);
      const left = (ch.x ?? 0) + (b.minX ?? -b.w / 2), right = (ch.x ?? 0) + (b.maxX ?? b.w / 2);
      const top = (ch.y ?? 0) + (b.minY ?? -b.h), bottom = (ch.y ?? 0) + (b.maxY ?? 0);
      considerRect(ch, left, top, right, bottom);
    }
    for (const tg of project.clips.filter((x) => x.type === "target" && isActive(x))) {
      const b = eng.boundsOf(tg, t);
      considerRect(tg, (tg.x ?? 0) - b.w / 2, (tg.y ?? 0) - b.h, (tg.x ?? 0) + b.w / 2, tg.y ?? 0);
    }
    for (const fx of project.clips.filter((x) => x.type === "fx" && isActive(x))) {
      const host = project.clips.find((x) => x.type === "character" && isActive(x));
      const b = eng.boundsOf(fx, t);
      const hostX = host?.x ?? 0, hostY = host?.y ?? 0;
      const ox = hostX + (fx.from?.[0] ?? 0), oy = hostY + (fx.from?.[1] ?? 0);
      considerRect(fx, ox + (b.minX ?? -b.w / 2), oy + (b.minY ?? -b.h / 2),
                        ox + (b.maxX ?? b.w / 2), oy + (b.maxY ?? b.h / 2));
    }
    if (best) {
      const c2 = best.clip;
      selectedId.value = c2.id;
      const start = c2.type === "fx"
        ? { handle: "origin", sx, sy, fx0: c2.from?.[0] ?? 0, fy0: c2.from?.[1] ?? 0, tx0: c2.to?.[0] ?? 0, ty0: c2.to?.[1] ?? 0 }
        : { handle: "origin", sx, sy, ox: c2.x ?? 0, oy: c2.y ?? 0 };
      gizmoDrag = start;
      drawNow();
      return;
    }
    // 点在空白处：取消选中，然后进入平移
    if (selectedId.value != null) {
      selectedId.value = null;
      gizmoHover.value = null;
      cv.style.cursor = "";
      drawNow();
    }
    panning = true;
    panPointerId = e.pointerId;
    view.userMoved = true;
    panStart = { x: e.clientX, y: e.clientY, ox: view.offsetX, oy: view.offsetY };
    cv.classList.add("grabbing");
  }

  function onPointerMove(e) {
    const cv = canvasEl.value;
    const r = cv.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    if (gizmoDrag) {
      applyGizmoDrag(gizmoDrag.handle, sx, sy, gizmoDrag);
      return;
    }
    if (panning) {
      // 增量平移：每次只加本次鼠标位移，缩放后接着拖不会跳回旧位置
      view.offsetX += e.clientX - panStart.x;
      view.offsetY += e.clientY - panStart.y;
      panStart.x = e.clientX;
      panStart.y = e.clientY;
      drawNow();
      return;
    }
    if (selected.value && !handMode.value) {
      const hit = hitGizmo(sx, sy);
      const kind = hit?.kind ?? null;
      if (kind !== gizmoHover.value) {
        gizmoHover.value = kind;
        drawNow();
      }
      const idx = kind && kind.startsWith("corner") ? +kind.slice(6) : -1;
      cv.style.cursor =
        kind === "origin" ? "move"
        : kind === "axisX" ? "ew-resize"
        : kind === "axisY" ? "ns-resize"
        : idx === 0 || idx === 2 ? "nwse-resize"
        : idx === 1 || idx === 3 ? "nesw-resize"
        : "";
    }
  }

  function onPointerUp() {
    gizmoDrag = null;
    if (panning) {
      canvasEl.value?.classList.remove("grabbing");
      if (panPointerId != null) canvasEl.value?.releasePointerCapture?.(panPointerId);
      panPointerId = null;
      panStart = null;
    }
    panning = false;
  }

  return { showBox, showAxes, handMode, toggleHand, gizmoHover, toggleBox, toggleAxes, drawGizmo, hitGizmo, selBox, canvasPoint, onWheel, onPointerDown, onPointerMove, onPointerUp, toScreen };
}
