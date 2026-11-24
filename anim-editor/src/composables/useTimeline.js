// 时间轴：刻度/网格 computed、拖拽/吸附/滚动/缩放交互。engine、DOM refs 由组装方注入。
import { ROW_H } from "../lib/labels.js";

export function useTimeline({ project, time, selected, selectedId, engineGetter, scheduleDraw, setTime, clipEndOf, pxPerSec, tlMode }) {
  const scrollLeft = Vue.ref(0);
  const scrollTop = Vue.ref(0);
  const tlVp = Vue.ref(null);
  const dragId = Vue.ref(null);

  const totalW = Vue.computed(() => Math.max(360, Math.round((project.duration + 0.2) * pxPerSec.value)));
  const totalH = Vue.computed(() => project.tracks.reduce((sum, tr) => sum + laneHeightView(tr.id), 0));
  const totalFrames = Vue.computed(() => Math.max(1, Math.round(project.duration * project.fps)));
  const frameNo = Vue.computed(() => Math.min(totalFrames.value, Math.round(time.value * project.fps) + 1));

  const ticks = Vue.computed(() => {
    const pps = pxPerSec.value;
    const out = [];
    if (tlMode.value === "frame") {
      const fpp = Math.max(2, pps / Math.max(1, project.fps));
      const totalF = Math.max(1, Math.round(project.duration * project.fps));
      const labelEvery = fpp >= 26 ? 1 : fpp >= 13 ? 2 : fpp >= 7 ? 5 : 10;
      for (let f = 0; f <= totalF; f++) {
        const x = (f / project.fps) * pps;
        const isMajor = f % labelEvery === 0;
        out.push({ t: f / project.fps, x, major: isMajor, label: isMajor ? String(f) : "" });
      }
      return out;
    }
    const majorStep = pps >= 420 ? 0.25 : pps >= 220 ? 0.5 : pps >= 110 ? 1 : 2;
    const minorStep = majorStep / 5;
    const eps = 1e-6;
    for (let t = 0; t <= project.duration + eps; t += minorStep) {
      const tt = +t.toFixed(4);
      const isMajor = Math.abs(tt / majorStep - Math.round(tt / majorStep)) < 1e-6;
      out.push({ t: tt, x: tt * pps, major: isMajor, label: isMajor ? (majorStep >= 1 ? tt.toFixed(0) + "s" : tt.toFixed(2) + "s") : "" });
    }
    return out;
  });

  const gridStyle = Vue.computed(() => {
    const pps = pxPerSec.value;
    if (tlMode.value === "frame") {
      const fpp = Math.max(2, pps / Math.max(1, project.fps));
      return {
        backgroundImage:
          "linear-gradient(90deg, rgba(20,24,32,.16) 1px, transparent 1px)," +
          "linear-gradient(90deg, rgba(20,24,32,.06) 1px, transparent 1px)",
        backgroundSize: (fpp * 10) + "px 100%," + fpp + "px 100%",
      };
    }
    const majorStep = pps >= 420 ? 0.25 : pps >= 220 ? 0.5 : pps >= 110 ? 1 : 2;
    const minor = Math.max(4, (majorStep / 5) * pps);
    const major = Math.max(12, majorStep * pps);
    return {
      backgroundImage:
        "linear-gradient(90deg, rgba(20,24,32,.18) 1px, transparent 1px)," +
        "linear-gradient(90deg, rgba(20,24,32,.07) 1px, transparent 1px)",
      backgroundSize: major + "px 100%," + minor + "px 100%",
    };
  });

  const clipCell = Vue.computed(() => Math.max(2, pxPerSec.value / Math.max(1, project.fps)));
  const framesOf = (c) => Math.max(1, Math.round((clipEndOf(c) - c.t) * project.fps));
  const tlModeLabel = Vue.computed(() => (tlMode.value === "frame" ? "帧" : "轨道帧"));
  function setTlMode(mode) { tlMode.value = mode; }

  // 行号持久存在片段上（c.row），横向拖拽绝不重排：一行就是一个自由重叠的轨道
  const rowCount = (trackId) => {
    let max = 0;
    for (const c of project.clips) if (c.trackId === trackId) max = Math.max(max, c.row ?? 0);
    return max + 1;
  };
  // 含拖拽预览行的可视行数（只用于渲染轨道高度，不参与落位计算）
  const rowCountView = (trackId) => {
    let n = rowCount(trackId);
    const pr = dragPreviewRow.value;
    if (pr && pr.trackId === trackId) n = Math.max(n, pr.row + 1);
    return n;
  };
  const laneHeight = (trackId) => rowCount(trackId) * ROW_H;
  const laneHeightView = (trackId) => rowCountView(trackId) * ROW_H;
  const packed = (trackId) => {
    return project.clips.filter((c) => c.trackId === trackId).map((clip) => ({ clip, row: clip.row ?? 0 }));
  };
  const hitMarks = (trackId) =>
    project.clips.filter((c) => c.type === "state" && c.hit && c.trackId === trackId)
      .map((c) => ({ id: c.id, t: c.t }));
  // 落位规则：同一行禁止重叠。拖到某行→该行有空就放；满了→向下找现有空行；
  // 图层所有行都满→临时新行（图层内部加一行，松手才落位，不新建图层）
  const rowFree = (trackId, row, t, dur, excludeId) => {
    return !project.clips.some((c) => c.trackId === trackId && c.id !== excludeId && (c.row ?? 0) === row && t < clipEndOf(c) - 1e-6 && t + dur > c.t + 1e-6);
  };
  function findDropRow(trackId, hintRow, t, dur, excludeId) {
    const rows = rowCount(trackId);
    for (let r = Math.max(0, Math.min(hintRow, rows - 1)); r < rows; r++) {
      if (rowFree(trackId, r, t, dur, excludeId)) return { row: r, temp: false };
    }
    return { row: rows, temp: true }; // 全满 → 临时新行
  }
  // 某行是否有片段和目标时间段重叠
  const overlapsRow = (trackId, row, t, dur, excludeId) =>
    project.clips.some((c) => c.trackId === trackId && c.id !== excludeId && (c.row ?? 0) === row && t < clipEndOf(c) - 1e-6 && t + dur > c.t + 1e-6);
  // 鼠标落在哪条轨道的哪一行；轨道下方的空白区域算作该轨道的新行
  function laneHitAt(y) {
    const lanes = [...document.querySelectorAll(".tl-lane[data-track]")];
    for (const lane of lanes) {
      const r = lane.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) {
        return { trackId: lane.dataset.track, row: Math.max(0, Math.floor((y - r.top) / ROW_H)) };
      }
    }
    if (!lanes.length) return null;
    const last = lanes[lanes.length - 1];
    const lr = last.getBoundingClientRect();
    if (y > lr.bottom) return { trackId: last.dataset.track, row: rowCountView(last.dataset.track) };
    const fr = lanes[0].getBoundingClientRect();
    if (y < fr.top) return { trackId: lanes[0].dataset.track, row: 0 };
    return null;
  }
  // 拖拽开始时冻结轨道几何：目标轨道临时长高后轨道会整体下移，
  // 若继续用实时 DOM 坐标判定，鼠标不动也会“换轨道”，导致参考框闪没。
  function snapshotLanes() {
    const out = [];
    let top = null;
    for (const lane of document.querySelectorAll(".tl-lane[data-track]")) {
      const r = lane.getBoundingClientRect();
      if (top == null) top = r.top;
      out.push({ trackId: lane.dataset.track, top: out.length ? out[out.length - 1].top + out[out.length - 1].rows * ROW_H : r.top, rows: rowCount(lane.dataset.track) });
    }
    return out;
  }
  function laneHitAtFrozen(geo, y) {
    if (!geo || !geo.length) return null;
    for (const g of geo) {
      const bottom = g.top + g.rows * ROW_H;
      if (y >= g.top && y <= bottom) {
        return { trackId: g.trackId, row: Math.max(0, Math.floor((y - g.top) / ROW_H)) };
      }
    }
    const last = geo[geo.length - 1];
    if (y > last.top + last.rows * ROW_H) return { trackId: last.trackId, row: last.rows };
    if (y < geo[0].top) return { trackId: geo[0].trackId, row: 0 };
    return null;
  }
  const dragPreviewRow = Vue.ref(null);
  // 拖拽中的片段盒子：跟随预览手动更新，避开 reactive 依赖失效问题
  const dragClipBox = Vue.ref(null);
  const dragGhost = Vue.computed(() => {
    const c = dragClipBox.value;
    const pr = dragPreviewRow.value;
    if (!c || !pr) return null;
    // 参考框：始终画在实际落位行（向下找到的空行 / 临时行）
    return { trackId: pr.trackId, left: c.t, width: c.dur, row: pr.row };
  });

  function onTlScroll(e) {
    const el = e.currentTarget;
    scrollLeft.value = el.scrollLeft;
    scrollTop.value = el.scrollTop;
  }
  function onTlWheel(e) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const anchorX = e.clientX - rect.left;
      const anchorTime = (e.currentTarget.scrollLeft + anchorX) / pxPerSec.value;
      const next = Math.max(60, Math.min(640, pxPerSec.value * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      pxPerSec.value = Math.round(next / 20) * 20;
      requestAnimationFrame(() => {
        const el = tlVp.value;
        if (el) el.scrollLeft = Math.max(0, anchorTime * pxPerSec.value - anchorX);
      });
      return;
    }
    const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
    if (horizontal || e.shiftKey) {
      e.preventDefault();
      e.currentTarget.scrollLeft += horizontal ? e.deltaX : e.deltaY;
    }
  }
  const snapOn = (ev) => !ev.altKey;
  const snapTime = (t, ev) => {
    if (!snapOn(ev)) return t;
    const f = Math.round(t * project.fps);
    return f / project.fps;
  };
  function onZoomInput(v) {
    const anchor = scrollLeft.value + 160;
    const anchorTime = anchor / pxPerSec.value;
    pxPerSec.value = Number(v) || 240;
    requestAnimationFrame(() => {
      const el = tlVp.value;
      if (el) el.scrollLeft = Math.max(0, anchorTime * pxPerSec.value - 160);
    });
  }
  function onRulerDown(e) {
    if (e.button !== 0) return;
    const content = e.currentTarget;
    const apply = (ev) => {
      const r = content.getBoundingClientRect();
      const x = ev.clientX - r.left;
      setTime(Math.max(0, Math.min(project.duration, x / pxPerSec.value)));
    };
    apply(e);
    const up = () => {
      window.removeEventListener("pointermove", apply);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", apply);
    window.addEventListener("pointerup", up);
  }
  function onLaneDown(e, trackId) {
    if (e.button !== 0) return;
    const lane = e.currentTarget;
    const rect = lane.getBoundingClientRect();
    const apply = (ev) => {
      const x = ev.clientX - rect.left;
      setTime(Math.max(0, Math.min(project.duration, x / pxPerSec.value)));
    };
    apply(e);
    const up = () => {
      window.removeEventListener("pointermove", apply);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", apply);
    window.addEventListener("pointerup", up);
  }
  function stepFrame(dir) {
    setTime(time.value + dir / project.fps);
  }
  function onClipDown(e, clip) {
    if (e.button !== 0) return;
    e.stopPropagation();
    selectedId.value = clip.id;
    dragId.value = clip.id;
    dragClipBox.value = { id: clip.id, trackId: clip.trackId, t: clip.t, dur: clipEndOf(clip) - clip.t };
    // 拖拽预览行：拖到其他轨道只是临时预览，松手才真正改 trackId
    let previewTrackId = null;
    const bar = e.currentTarget;
    const rect = bar.getBoundingClientRect();
    const edge = e.clientX < rect.left + 10 ? "left" : e.clientX > rect.right - 10 ? "right" : null;
    const startX = e.clientX;
    const startT = clip.t;
    const startEnd = clipEndOf(clip);
    const startTrack = clip.trackId;
    const startRow = clip.row ?? 0;
    let previewRow = null;
    let moved = false;
    const body = document.body;
    const prevCursor = body.style.cursor;
    const prevUserSelect = body.style.userSelect;
    body.style.cursor = "grabbing";
    body.style.userSelect = "none";
    const laneGeo = snapshotLanes(); // 冻结轨道几何，避免临时行撑高导致判定漂移
    const move = (ev) => {
      moved = true;
      const dx = (ev.clientX - startX) / pxPerSec.value;
      if (edge === "right") {
        const end = Math.max(clip.t + 1 / project.fps, startEnd + dx);
        clip.until = Math.min(project.duration, Math.max(clip.t + 1 / project.fps, snapTime(end, ev)));
        resizeSink();
      } else if (edge === "left") {
        const t = Math.max(0, Math.min(startEnd - 1 / project.fps, startT + dx));
        const snapped = Math.max(0, snapTime(t, ev));
        clip.t = Math.min(snapped, startEnd - 1 / project.fps);
        clip.until = startEnd;
        resizeSink();
      } else {
        const dur = startEnd - startT;
        let t = Math.max(0, Math.min(project.duration - dur, startT + dx));
        t = Math.max(0, snapTime(t, ev));
        clip.t = Math.min(t, Math.max(0, project.duration - dur));
        clip.until = Math.min(project.duration, clip.t + dur);
        // 场景1：跨轨道拖拽。参考框 = 实际落位行（从鼠标所在行向下找空行；全满→临时新行）
        const hit = laneHitAtFrozen(laneGeo, ev.clientY);
        if (!hit) {
          previewTrackId = null;
          previewRow = null;
          dragPreviewRow.value = null;
        } else if (hit.trackId === startTrack) {
          // 场景2：同图层内永远不显示参考框，片段直接跟手落位
          // 行号由空位决定：从最上面开始找第一个放得下的行（重叠消失就自动合并回上行）
          // 全满 → 新建临时行（图层内部加一行，不是新图层）
          previewTrackId = null;
          previewRow = null;
          dragPreviewRow.value = null;
          clip.row = findDropRow(startTrack, 0, clip.t, dur, clip.id).row;
        } else {
          // 场景1：跨图层拖拽。片段留在原处，参考框画在目标图层实际落位行
          // 片段仍留在原图层，但时间变了；若压到本图层其他片段，必须立刻沉行（否则会重叠）
          resizeSink();
          const drop = findDropRow(hit.trackId, hit.row, clip.t, dur, clip.id);
          previewTrackId = hit.trackId;
          previewRow = drop.row;
          dragPreviewRow.value = { trackId: hit.trackId, row: drop.row, temp: drop.temp };
        }
        dragClipBox.value = { id: clip.id, trackId: clip.trackId, t: clip.t, dur };
      }
      engineGetter()?.invalidate();
      scheduleDraw();
    };
    // 场景2：拉两端/横向压到同行片段 → 不要参考框，直接沉入向下找到的空行；全满→临时新行
    const sameRowOverlap = () => project.clips.some((c) => c.trackId === clip.trackId && c.id !== clip.id && (c.row ?? 0) === (clip.row ?? 0) && clip.t < clipEndOf(c) - 1e-6 && clipEndOf(clip) > c.t + 1e-6);
    function resizeSink() {
      const d = clipEndOf(clip) - clip.t;
      let row = clip.row ?? 0;
      if (sameRowOverlap()) {
        // 压到同行 → 沉入下方的空行
        row = findDropRow(clip.trackId, row + 1, clip.t, d, clip.id).row;
      } else if (row > 0) {
        // 不再重叠 → 尝试向上合并回空行（缩短回原长度时回到上面）
        for (let r = 0; r < row; r++) {
          if (rowFree(clip.trackId, r, clip.t, d, clip.id)) { row = r; break; }
        }
      }
      clip.row = row;
      dragClipBox.value = { id: clip.id, trackId: clip.trackId, t: clip.t, dur: clipEndOf(clip) - clip.t };
    }
    const up = () => {
      if (previewTrackId && previewRow != null) {
        // 场景1 松手：落进参考框所在的行
        clip.trackId = previewTrackId;
        clip.row = previewRow;
      }
      if (!rowFree(clip.trackId, clip.row ?? 0, clip.t, clipEndOf(clip) - clip.t, clip.id)) {
        // 兜底：任何情况下都不允许重叠，冲突就向下找空行
        clip.row = findDropRow(clip.trackId, (clip.row ?? 0) + 1, clip.t, clipEndOf(clip) - clip.t, clip.id).row;
      }
      dragPreviewRow.value = null;
      dragClipBox.value = null;
      body.style.cursor = prevCursor;
      body.style.userSelect = prevUserSelect;
      dragId.value = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (moved) scheduleDraw();
      else if (startTrack !== clip.trackId) scheduleDraw();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  const trackActive = (trackId) => !!selected.value && selected.value.trackId === trackId;
  function trackIcon(trackId) {
    const c = project.clips.find((x) => x.trackId === trackId);
    const TYPE_ICON = { character: "person", fx: "auto_awesome", target: "my_location", state: "blur_on" };
    return c ? (TYPE_ICON[c.type] ?? "circle") : "view_stream";
  }
  return { scrollLeft, scrollTop, tlVp, dragId, dragGhost, totalW, totalH, totalFrames, frameNo, ticks, gridStyle, clipCell, framesOf, tlModeLabel, setTlMode, rowCount, rowCountView, laneHeight: laneHeightView, packed, hitMarks, onTlScroll, onTlWheel, snapTime, onZoomInput, onRulerDown, onLaneDown, stepFrame, onClipDown, trackActive, trackIcon, ROW_H };
}
