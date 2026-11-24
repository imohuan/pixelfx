// 左侧图层面板：拖拽排序（vue-draggable-plus，VueDraggable 自身做容器）、六点手柄、眼睛显隐、F2/双击重命名。
export const LayerPanel = {
  name: "LayerPanel",
  props: { ctx: { type: Object, required: true } },
  template: `
  <aside class="left-pane">
    <div class="pane-head">
      <span class="material-symbols-outlined" style="font-size:16px">layers</span>
      <span class="pane-title">图层</span>
      <span class="flex-1"></span>
      <span class="pane-count">{{ ctx.layers.length }}</span>
    </div>
    <div class="add-group">
      <kit-button size="sm" variant="outlined" icon="add" @click="ctx.addTrack">新建图层</kit-button>
    </div>
    <vue-draggable
      class="layer-list"
      :model-value="ctx.layers"
      :animation="150"
      draggable=".layer-row"
      @start="ctx.onDragStart"
      @end="ctx.onDragEnd"
      @update:model-value="ctx.onReorder"
    >
      <button v-for="tr in ctx.layers" :key="tr.id" type="button"
              class="kit-list-item clip-row layer-row"
              :class="{ 'kit-list-item--active': ctx.activeLayerId === tr.id, 'is-dragging': ctx.dragging }"
              @click="ctx.selectLayer(tr.id)"
              @dblclick="ctx.startRename(tr.id)"
              @keydown.f2.prevent="ctx.startRename(tr.id)">
        <span class="layer-grip material-symbols-outlined" title="拖拽排序">drag_indicator</span>
        <template v-if="ctx.renamingId === tr.id">
          <input class="layer-rename" v-model="ctx.renameText"
                 @click.stop @dblclick.stop @pointerdown.stop
                 @keydown.enter.prevent="ctx.commitRename" @keydown.esc.prevent="ctx.cancelRename"
                 @blur="ctx.commitRename" v-focus>
        </template>
        <span v-else class="text-xs truncate flex-1">{{ tr.name }}</span>
        <span class="font-mono clip-time">{{ ctx.layerClipCount(tr.id) }}</span>
        <span class="layer-eye material-symbols-outlined"
              :class="{ 'is-off': !ctx.layerVisible(tr.id) }"
              :title="ctx.layerVisible(tr.id) ? '隐藏图层' : '显示图层'"
              @click.stop="ctx.toggleLayerVisible(tr.id)"
              @pointerdown.stop>
          {{ ctx.layerVisible(tr.id) ? 'visibility' : 'visibility_off' }}
        </span>
      </button>
    </vue-draggable>
    <kit-empty v-if="!ctx.layers.length" icon="layers" title="还没有图层" desc="点上方按钮新建"></kit-empty>
    <div class="layer-hint">拖六点排序 · 双击/F2 重命名 · 眼睛控制显示</div>
  </aside>
  `,
};
