// 左侧标签列表（一期保持标签列表，二期再换图层面板）。
export const ClipLibrary = {
  name: "ClipLibrary",
  props: { ctx: { type: Object, required: true } },
  template: `
  <aside class="left-pane">
    <div class="pane-head">
      <span class="material-symbols-outlined" style="font-size:16px">layers</span>
      <span class="pane-title">标签</span>
      <span class="flex-1"></span>
      <span class="pane-count">{{ ctx.sortedClips.length }}</span>
    </div>
    <div class="add-group">
      <kit-button size="sm" variant="outlined" icon="person" @click="ctx.addClip('character')">角色标签</kit-button>
      <kit-button size="sm" variant="outlined" icon="auto_awesome" @click="ctx.addClip('fx')">特效标签</kit-button>
      <kit-button size="sm" variant="outlined" icon="blur_on" @click="ctx.addClip('state')">状态标签</kit-button>
      <kit-button size="sm" variant="outlined" icon="my_location" @click="ctx.addClip('target')">靶子标签</kit-button>
    </div>
    <div class="clip-list">
      <button v-for="c in ctx.sortedClips" :key="c.id" type="button"
              class="kit-list-item clip-row"
              :class="{ 'kit-list-item--active': c.id === ctx.selectedId }"
              @click="ctx.selectClip(c.id)">
        <span class="material-symbols-outlined clip-ico" :class="'ico-' + c.type">{{ ctx.typeIcon(c.type) }}</span>
        <span class="text-xs truncate flex-1">{{ ctx.labelOf(c) }}</span>
        <span class="font-mono clip-time">{{ c.t.toFixed(2) }}s</span>
      </button>
      <kit-empty v-if="!ctx.sortedClips.length" icon="inbox" title="还没有标签" desc="用上方按钮添加一个"></kit-empty>
    </div>
  </aside>
  `,
};
