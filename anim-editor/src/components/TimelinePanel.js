// 底部时间轴：工具栏、标尺、轨道头、片段、播放头。
export const TimelinePanel = {
  name: "TimelinePanel",
  props: { ctx: { type: Object, required: true } },
  template: `
  <div class="timeline">
    <div class="tl-toolbar">
      <div class="tl-modes" role="group" aria-label="时间轴显示模式">
        <button type="button" class="tl-mode" :class="{ 'is-on': ctx.tlMode === 'frame' }" @click="ctx.setTlMode('frame')" title="按帧显示">帧</button>
        <button type="button" class="tl-mode" :class="{ 'is-on': ctx.tlMode === 'time' }" @click="ctx.setTlMode('time')" title="按秒显示">轨道帧</button>
      </div>
      <span class="tl-sep"></span>
      <button type="button" class="tl-icon" title="上一帧（←）" @click="ctx.stepFrame(-1)"><span class="material-symbols-outlined">skip_previous</span></button>
      <button type="button" class="tl-play" :class="{ 'is-playing': ctx.playing }" @click="ctx.togglePlay" :title="ctx.playing ? '暂停（空格）' : '播放（空格）'">
        <span class="material-symbols-outlined">{{ ctx.playing ? 'pause' : 'play_arrow' }}</span>
        <span>{{ ctx.playing ? '暂停' : '播放' }}</span>
      </button>
      <button type="button" class="tl-icon" title="下一帧（→）" @click="ctx.stepFrame(1)"><span class="material-symbols-outlined">skip_next</span></button>
      <button type="button" class="tl-icon" title="停止并回到开头" @click="ctx.stop"><span class="material-symbols-outlined">stop</span></button>
      <span class="tl-sep"></span>
      <span class="tl-readout" title="当前时间"><span>{{ ctx.tlMode === 'frame' ? '帧号' : '时间' }}</span><b>{{ ctx.tlMode === 'frame' ? ctx.frameNo : ctx.time.toFixed(3) + 's' }}</b></span>
      <span class="tl-readout" title="当前帧 / 总帧"><span>帧</span><b>{{ ctx.frameNo }} / {{ ctx.totalFrames }}</b></span>
      <label class="tl-readout" title="编排帧率：保存、导出、时间轴格子都用它">
        <span>FPS</span>
        <kit-number-field class="tl-nf" :slider="false" :precision="0" :model-value="ctx.project.fps" :min="1" :max="240" @update:model-value="ctx.onFpsChange"></kit-number-field>
      </label>
      <label class="tl-readout" title="总帧数：改帧率时保持不变，播放速度随之变化">
        <span>总帧</span>
        <kit-number-field class="tl-nf" :slider="false" :model-value="ctx.project.durationFrames" :min="1" :max="7200" :step="1" :precision="0" @update:model-value="ctx.onDurationChange"></kit-number-field>
      </label>
      <span class="tl-readout tl-dur" title="换算出来的总时长"><span>时长</span><b>{{ ctx.project.duration.toFixed(3) }}s</b></span>
      <span class="tl-spacer"></span>
      <span class="tl-sel">已选 <b>{{ ctx.selected ? 1 : 0 }}</b> 段</span>
      <button type="button" class="tl-btn" @click="ctx.addTrack"><span class="material-symbols-outlined">add</span>轨道</button>
    </div>
    <div class="tl-ruler-row">
      <div class="tl-corner">
        <span class="tl-zoom-label">缩放</span>
        <input class="tl-zoom" type="range" min="60" max="640" step="20" :value="ctx.pxPerSec" @input="ctx.onZoomInput($event.target.value)" title="时间轴横向缩放">
      </div>
      <div class="tl-ruler-viewport">
        <div class="tl-ruler-content"
             :style="{ width: ctx.totalW + 'px', transform: 'translateX(' + (-ctx.scrollLeft) + 'px)' }" @pointerdown="ctx.onRulerDown">
          <div v-for="tk in ctx.ticks" :key="'r' + tk.t" class="tl-tick" :class="{ major: tk.major }" :style="{ left: tk.x + 'px' }">
            <span v-if="tk.major">{{ tk.label }}</span>
          </div>
          <div class="tl-ruler-head" :style="{ left: (ctx.time * ctx.pxPerSec) + 'px' }"></div>
        </div>
      </div>
    </div>
    <div class="tl-tracks-row">
      <div class="tl-headers">
        <div class="tl-headers-inner" :style="{ transform: 'translateY(' + (-ctx.scrollTop) + 'px)' }">
          <div v-for="tr in ctx.project.tracks" :key="'h' + tr.id"
               class="tl-head" :class="{ 'is-active': ctx.trackActive(tr.id) }"
               :style="{ height: ctx.laneHeight(tr.id) + 'px' }" @click="ctx.selectTrack(tr.id)">
            <span class="material-symbols-outlined tl-head-ico">{{ ctx.trackIcon(tr.id) }}</span>
            <span class="tl-head-name">{{ tr.name }}</span>
            <span v-if="ctx.rowCount(tr.id) > 1" class="tl-head-layers" :title="ctx.rowCount(tr.id) + ' 层重叠'">{{ ctx.rowCount(tr.id) }}</span>
            <button type="button" class="tl-head-del material-symbols-outlined" title="删除轨道" @click.stop="ctx.removeTrack(tr.id)">close</button>
          </div>
        </div>
      </div>
      <div class="tl-viewport" @scroll="ctx.onTlScroll" @wheel="ctx.onTlWheel">
        <div class="tl-content" :style="{ width: ctx.totalW + 'px', height: ctx.totalH + 'px' }">
          <div class="tl-grid-layer" :style="ctx.gridStyle"></div>
          <div v-for="tr in ctx.project.tracks" :key="tr.id"
               class="tl-lane" :class="{ 'is-active': ctx.trackActive(tr.id) }"
               :data-track="tr.id" :style="{ height: ctx.laneHeight(tr.id) + 'px' }"
               @pointerdown="ctx.onLaneDown($event, tr.id)">
            <div v-if="ctx.dragGhost && ctx.dragGhost.trackId === tr.id" class="tl-ghost"
                 :style="{ left: (ctx.dragGhost.left * ctx.pxPerSec) + 'px', width: Math.max(14, ctx.dragGhost.width * ctx.pxPerSec) + 'px', top: (ctx.dragGhost.row * ctx.ROW_H + 4) + 'px', height: (ctx.ROW_H - 8) + 'px' }"></div>
            <div v-for="p in ctx.packed(tr.id)" :key="p.clip.id"
                 class="tl-clip"
                 :class="[p.clip.type, { 'is-sel': p.clip.id === ctx.selectedId, 'is-dragging': p.clip.id === ctx.dragId }]"
                 :style="{ left: (p.clip.t * ctx.pxPerSec) + 'px', width: Math.max(14, (ctx.clipEnd(p.clip) - p.clip.t) * ctx.pxPerSec) + 'px', top: (p.row * ctx.ROW_H + 4) + 'px', height: (ctx.ROW_H - 8) + 'px', '--clip-cell': ctx.clipCell + 'px' }"
                 :title="ctx.labelOf(p.clip) + '  帧 ' + p.clip.f + ' - ' + p.clip.fEnd + '  (' + p.clip.t.toFixed(3) + 's - ' + p.clip.until.toFixed(3) + 's)'"
                 @pointerdown.stop="ctx.onClipDown($event, p.clip)">
              <span class="tl-clip-lbl">{{ ctx.labelOf(p.clip) }}</span>
              <span v-if="ctx.tlMode === 'frame' && (ctx.clipEnd(p.clip) - p.clip.t) * ctx.pxPerSec >= 96" class="tl-clip-frames">{{ ctx.framesOf(p.clip) }}f</span>
              <span v-if="p.clip.type === 'state'" class="tl-clip-skin" :style="{ background: ctx.skinColor(p.clip.skin) }"></span>
              <span class="tl-clip-handle left"></span>
              <span class="tl-clip-handle right"></span>
            </div>
            <div v-for="s in ctx.hitMarks(tr.id)" :key="'hit' + s.id"
                 class="tl-hit" :style="{ left: (s.t * ctx.pxPerSec) + 'px' }"
                 :title="'HIT 第 ' + Math.round(s.t * ctx.project.fps) + ' 帧（' + s.t.toFixed(3) + 's）'"></div>
          </div>
          <div class="tl-playhead" :style="{ left: (ctx.time * ctx.pxPerSec) + 'px' }">
            <span class="tl-playhead-cap"></span>
          </div>
        </div>
      </div>
    </div>
    <div class="tl-hint">
      <span><b>拖动</b> 移动</span>
      <span><b>拉两端</b> 改长短</span>
      <span><b>点标尺</b> 跳时间</span>
      <span><b>Alt</b> 关吸附</span>
      <span><b>Ctrl+滚轮</b> 缩放时间轴</span>
    </div>
  </div>
  `,
};
