// 播放循环。drawNow / stopBefore / resetTargetsBy 由组装方注入，避免互相 import。
export function usePlayback({ time, project, drawNow, resetEngine }) {
  const playing = Vue.ref(false);
  let rafId = 0;
  let fallbackId = 0;
  let lastTs = 0;

  function setTime(t) {
    const v = Math.max(0, Math.min(project.duration, Number(t) || 0));
    time.value = v;
    resetEngine();
    drawNow();
  }
  function advance(dt) {
    time.value += dt;
    if (time.value >= project.duration) {
      time.value = 0;
      resetEngine();
    }
    drawNow();
  }
  function tick(ts) {
    if (!playing.value) return;
    const dt = Math.min(0.1, Math.max(0, (ts - lastTs) / 1000));
    lastTs = ts;
    advance(dt);
    rafId = requestAnimationFrame(tick);
  }
  function play() {
    if (playing.value) return;
    if (time.value >= project.duration - 1e-6) time.value = 0;
    playing.value = true;
    lastTs = performance.now();
    resetEngine();
    rafId = requestAnimationFrame(tick);
    if (fallbackId) clearInterval(fallbackId);
    fallbackId = setInterval(() => {
      if (!playing.value) return;
      const now = performance.now();
      if (now - lastTs < 60) return;
      advance(Math.min(0.2, (now - lastTs) / 1000));
      lastTs = now;
    }, 40);
  }
  function stop() {
    playing.value = false;
    cancelAnimationFrame(rafId);
    if (fallbackId) { clearInterval(fallbackId); fallbackId = 0; }
    drawNow();
  }
  function togglePlay() { playing.value ? stop() : play(); }
  function dispose() {
    cancelAnimationFrame(rafId);
    if (fallbackId) clearInterval(fallbackId);
  }
  return { playing, setTime, advance, tick, play, stop, togglePlay, dispose };
}
