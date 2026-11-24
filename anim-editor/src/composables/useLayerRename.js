// 图层重命名：F2 / 双击进入，Enter / 失焦提交，Esc 取消。
export function useLayerRename(project, scheduleDraw) {
  const renamingId = Vue.ref(null);
  const renameText = Vue.ref("");
  function startRename(id) {
    const tr = project.tracks.find((t) => t.id === id);
    if (!tr) return;
    renamingId.value = id;
    renameText.value = tr.name;
  }
  function commitRename() {
    const tr = project.tracks.find((t) => t.id === renamingId.value);
    if (tr && renameText.value.trim()) tr.name = renameText.value.trim();
    renamingId.value = null;
    scheduleDraw();
  }
  function cancelRename() { renamingId.value = null; }
  return { renamingId, renameText, startRename, commitRename, cancelRename };
}
