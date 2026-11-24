// 中部画布：gizmo 开关、缩放工具、时间徽标、拖入特效。
export const CanvasStage = {
  name: "CanvasStage",
  props: { ctx: { type: Object, required: true } },
  template: `
  <div class="stage-wrap"
       :class="{ 'stage-dark': ctx.darkBg }"
       @dragover.prevent="ctx.onStageDragOver" @dragleave="ctx.onStageDragLeave" @drop.prevent="ctx.onStageDrop">
    <canvas ref="canvasElRef" class="stage-canvas"></canvas>
    <div class="stage-badge">
      <span class="tg-group" @pointerdown.stop @click.stop>
        <button type="button" class="tg-btn" :class="{ 'is-on': ctx.handMode }" title="手抓模式（Q）" @click.stop="ctx.toggleHand">
          <span class="material-symbols-outlined">pan_tool</span>
        </button>
        <button type="button" class="tg-btn" :class="{ 'is-on': ctx.showBox }" title="选中框 + 四角缩放点（W）" @click.stop="ctx.toggleBox">
          <span class="material-symbols-outlined">{{ ctx.showBox ? 'select' : 'highlight_alt' }}</span>
        </button>
        <button type="button" class="tg-btn" :class="{ 'is-on': ctx.showAxes }" title="原点 + X/Y 轴箭头（E）" @click.stop="ctx.toggleAxes">
          <span class="material-symbols-outlined">{{ ctx.showAxes ? 'open_with' : 'close_fullscreen' }}</span>
        </button>
      </span>
      <span class="badge-sep"></span>
      <span class="font-mono">{{ ctx.time.toFixed(2) }}s / {{ ctx.project.duration.toFixed(2) }}s</span>
      <span class="font-mono">{{ ctx.viewScale.toFixed(2) }}x</span>
    </div>
    <div class="stage-tools">
      <kit-icon-button :icon="ctx.darkBg ? 'light_mode' : 'dark_mode'" size="sm" :title="ctx.darkBg ? '切换回白色背景（D）' : '切换成黑色背景（D）'" @click="ctx.toggleDarkBg"></kit-icon-button>
      <kit-icon-button icon="zoom_out" size="sm" title="缩小" @click="ctx.zoomBy(1 / 1.25)"></kit-icon-button>
      <span class="stage-zoom-val">{{ Math.round(ctx.viewScale * 100) }}%</span>
      <kit-icon-button icon="zoom_in" size="sm" title="放大" @click="ctx.zoomBy(1.25)"></kit-icon-button>
      <kit-icon-button icon="fit_screen" size="sm" title="适应窗口（0 / R）" @click="ctx.autoFit"></kit-icon-button>
      <kit-icon-button icon="center_focus_strong" size="sm" title="聚焦选中元素（F）" @click="ctx.focusSelection"></kit-icon-button>
      <span class="badge-sep"></span>
      <kit-icon-button icon="undo" size="sm" title="撤销（Ctrl+Z）" :disabled="!ctx.canUndo" @click="ctx.undo"></kit-icon-button>
      <kit-icon-button icon="redo" size="sm" title="重做（Ctrl+Y / Ctrl+Shift+Z）" :disabled="!ctx.canRedo" @click="ctx.redo"></kit-icon-button>
    </div>
    <div class="stage-help">滚轮缩放 · 拖拽平移 · F 聚焦 · R 复位</div>
    <div v-if="ctx.selected && ctx.selected.type === 'character'" class="stage-act">
      <span class="dot" :class="{ on: !!ctx.actionInfo(ctx.selected) }"></span>
      <span v-if="ctx.actionInfo(ctx.selected)">{{ ctx.actLabel(ctx.selected) }} · {{ ctx.actionInfo(ctx.selected).local.toFixed(2) }}s</span>
      <span v-else>未激活</span>
    </div>
  </div>
  `,
};
