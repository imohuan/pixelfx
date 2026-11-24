// 保存 / 载入 / 导出 JSON。
export function useFiles({ project, applyProject, notify }) {
  async function save() {
    try {
      const r = await fetch("/api/project", { method: "POST", body: JSON.stringify(project, null, 2) });
      const j = await r.json();
      notify?.[j.ok ? "success" : "error"](j.ok ? "已保存到 data/project.json" : "保存失败");
    } catch (e) { notify?.error("保存失败：" + e.message); }
  }
  async function load() {
    try {
      const j = await (await fetch("/api/project")).json();
      if (j && j.clips && j.tracks) {
        applyProject(j);
        notify?.success("已载入已保存的项目");
      } else notify?.warning("没有已保存的项目");
    } catch (e) { notify?.error("载入失败：" + e.message); }
  }
  function exportJson() {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "action.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  return { save, load, exportJson };
}
