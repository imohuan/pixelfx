// 保存 / 载入 / 导出 JSON / 导出 chain 脚本。
import { serializeProject, adoptProject } from "../lib/frames.js";

function download(filename, text, type = "text/plain") {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function useFiles({ project, applyProject, notify, exportMove, notifyPresetFps }) {
  async function save() {
    try {
      const body = JSON.stringify(serializeProject(project), null, 2);
      const r = await fetch("/api/project", { method: "POST", body });
      const j = await r.json();
      notify?.[j.ok ? "success" : "error"](j.ok ? `已保存到 data/project.json（${project.fps}fps）` : "保存失败");
    } catch (e) { notify?.error("保存失败：" + e.message); }
  }
  async function load() {
    try {
      const r = await fetch("/api/project");
      const j = await r.json();
      if (j && j.clips && j.tracks) {
        const adopted = await applyProject(j);
        if (!adopted?.fpsFromFile) notifyPresetFps?.("载入的工程没有记录帧率");
        else notify?.success(`已载入工程：${project.name}（${project.fps}fps，${project.durationFrames} 帧）`);
      } else notify?.warning("没有已保存的工程");
    } catch (e) { notify?.error("载入失败：" + e.message); }
  }
  function exportJson() {
    download("action.json", JSON.stringify(serializeProject(project), null, 2), "application/json");
  }
  async function exportScript() {
    try {
      const r = await exportMove();
      notify?.success(`已导出 ${r.filename}：${r.cues} 段 cue，${r.totalFrames} 帧`);
      for (const w of r.warnings ?? []) notify?.warning(w, 6000);
    } catch (e) { notify?.error("导出脚本失败：" + e.message, 6000); }
  }
  return { save, load, exportJson, exportScript };
}
