// 全局历史记录：撤销 / 重做。以 project 数据的深拷贝快照为单位，
// 覆盖画布拖拽、时间轴拖拽、右侧属性面板的全部编辑。

const MAX_STEPS = 100;

// 快照时剔除下划线开头的渲染缓存字段（engine 绘制时会往 clip 上写临时数据）
function cleanClip(c) {
  const out = {};
  for (const k of Object.keys(c).sort()) if (!k.startsWith("_")) out[k] = c[k];
  return out;
}

function cleanTrack(t) {
  const out = {};
  for (const k of Object.keys(t).sort()) if (!k.startsWith("_")) out[k] = t[k];
  return out;
}

export function useHistory({ project, engineGetter, afterRestore }) {
  const canUndo = Vue.ref(false);
  const canRedo = Vue.ref(false);

  const undoStack = [];
  const redoStack = [];

  let paused = false;
  let lastCommitAt = 0;
  let pendingChanges = false;
  let lastSnapshot = null;

  function snapshot() {
    return {
      tracks: JSON.parse(JSON.stringify(Vue.toRaw(project).tracks.map(cleanTrack))),
      clips: JSON.parse(JSON.stringify(Vue.toRaw(project).clips.map(cleanClip))),
      duration: project.duration,
      fps: project.fps,
    };
  }

  function refreshState() {
    canUndo.value = undoStack.length > 0;
    canRedo.value = redoStack.length > 0;
  }

  function scheduleCommit() {
    pendingChanges = true;
    if (paused) return;
    // 同步提交：后台标签页的 setTimeout 会被浏览器冻结，导致历史永远不记录。
    // 改为时间窗合并：350ms 内的连续修改合并为一步，通过下一次修改或 flush 同步落栈。
    const now = Date.now();
    if (now - lastCommitAt >= 350) commit();
  }

  function commit() {
    if (paused) return;
    lastCommitAt = Date.now();
    pendingChanges = false;
    const snap = snapshot();
    if (lastSnapshot && JSON.stringify(snap) === JSON.stringify(lastSnapshot)) return;
    undoStack.push(lastSnapshot);
    if (undoStack.length > MAX_STEPS) undoStack.shift();
    redoStack.length = 0;
    lastSnapshot = snap;
    refreshState();
  }

  function restore(snap) {
    paused = true;
    lastCommitAt = Date.now();
    pendingChanges = false;
    project.tracks = JSON.parse(JSON.stringify(snap.tracks)).map(cleanTrack);
    project.clips = JSON.parse(JSON.stringify(snap.clips)).map(cleanClip);
    project.duration = snap.duration;
    project.fps = snap.fps;
    lastSnapshot = snapshot();
    Promise.resolve().then(() => {
      try { engineGetter()?.invalidate(); engineGetter()?.resetTargets?.(); } catch (e) { console.warn("history restore", e); }
      afterRestore?.();
      Vue.nextTick(() => { paused = false; });
    });
  }

  function undo() {
    if (!undoStack.length) return;
    const snap = undoStack.pop();
    redoStack.push(lastSnapshot);
    restore(snap);
    refreshState();
  }

  function redo() {
    if (!redoStack.length) return;
    const snap = redoStack.pop();
    undoStack.push(lastSnapshot);
    restore(snap);
    refreshState();
  }

  function reset(baseline) {
    undoStack.length = 0;
    redoStack.length = 0;
    lastSnapshot = baseline ? {
      tracks: JSON.parse(JSON.stringify(baseline.tracks ?? [])),
      clips: JSON.parse(JSON.stringify(baseline.clips ?? [])),
      duration: baseline.duration,
      fps: baseline.fps,
    } : snapshot();
    refreshState();
  }

  function stackInfo() { return { undoLen: undoStack.length, redoLen: redoStack.length, lastClips: lastSnapshot ? lastSnapshot.clips.length : -1 }; }

  function debugInfo() { return { paused, undoLen: undoStack.length, redoLen: redoStack.length, lastClips: lastSnapshot ? lastSnapshot.clips.length : -1 }; }

  return { canUndo, canRedo, scheduleCommit, commit, undo, redo, reset, stackInfo, debugInfo };
}
