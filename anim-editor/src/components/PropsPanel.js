// 右侧属性面板：随选中类型分块。接收一份组装好的 ctx（含全部回调）。
export const PropsPanel = {
  name: "PropsPanel",
  props: { ctx: { type: Object, required: true } },
  template: `
  <aside class="panel">
    <div class="panel-tabs">
      <button type="button" class="ptab" :class="{ 'is-on': ctx.rightTab === 'props' }" @click="ctx.rightTab = 'props'">
        <span class="material-symbols-outlined">tune</span><span>属性</span>
      </button>
      <button type="button" class="ptab" :class="{ 'is-on': ctx.rightTab === 'library' }" @click="ctx.rightTab = 'library'">
        <span class="material-symbols-outlined">grid_view</span><span>资源标签</span>
        <span class="ptab-count" v-if="ctx.libCount">{{ ctx.libCount }}</span>
      </button>
    </div>
    <div class="pane-head" v-show="ctx.rightTab === 'props'">
      <span class="material-symbols-outlined" style="font-size:16px">tune</span>
      <span class="pane-title">属性</span>
      <span class="flex-1"></span>
      <span v-if="ctx.selected" class="font-mono pane-id">{{ ctx.selected.id }}</span>
    </div>
    <div class="panel-body">
      <div class="panel-props-inner" v-show="ctx.rightTab === 'props'">
        <kit-empty v-if="!ctx.selected" icon="ads_click" title="先选一个标签" desc="在左侧列表或时间轴里点一下"></kit-empty>
        <template v-else>
          <div class="prop-group">
            <div class="group-title">时间</div>
            <kit-field label="开始（秒）" layout="row">
              <kit-number-field :model-value="ctx.selected.t" :min="0" :max="ctx.project.duration" :step="0.01" precision="2" @update:model-value="ctx.onStartChange"></kit-number-field>
            </kit-field>
            <kit-field label="结束（秒）" layout="row">
              <kit-number-field :model-value="ctx.clipEnd(ctx.selected)" :min="0" :max="ctx.project.duration" :step="0.01" precision="2" @update:model-value="ctx.setEnd"></kit-number-field>
            </kit-field>
            <kit-field label="所在轨道" layout="row">
              <kit-select v-model="ctx.selected.trackId" :options="ctx.trackOptions" size="sm"></kit-select>
            </kit-field>
          </div>
          <!-- 角色 -->
          <template v-if="ctx.selected.type === 'character'">
            <div class="prop-group">
              <div class="group-title">角色</div>
              <div class="pick-block">
                <div class="pick-title">动作脚本<em>{{ ctx.actShort(ctx.selected) }}</em></div>
                <pick-cards kind="move" :options="ctx.moveCards" :model-value="ctx.selected.actRef || 'none'" card-w="120px" card-ratio="9 / 16" card-minh="160px" @update:model-value="ctx.onActChange"></pick-cards>
              </div>
              <div class="pick-block">
                <div class="pick-title">武器（覆盖脚本）<em>{{ ctx.weaponShort(ctx.selected) }}</em></div>
                <pick-cards kind="weapon" :options="ctx.weaponCards" :model-value="ctx.selected.weapon || 'none'" card-w="80px" card-ratio="1 / 1" card-minh="70px" @update:model-value="ctx.onWeaponChange"></pick-cards>
              </div>
              <kit-field label="角色图（留空则用骨骼渲染）">
                <kit-input :model-value="ctx.selected.src || ''" size="sm" placeholder="图片地址" @update:model-value="(v) => { ctx.selected.src = v; ctx.redraw(); }"></kit-input>
              </kit-field>
              <kit-field label="坐标 X" layout="row"><kit-number-field :model-value="ctx.selected.x" :min="-400" :max="400" @update:model-value="(v) => { ctx.selected.x = v; ctx.redraw(); }"></kit-number-field></kit-field>
              <kit-field label="坐标 Y" layout="row"><kit-number-field :model-value="ctx.selected.y" :min="-300" :max="200" @update:model-value="(v) => { ctx.selected.y = v; ctx.redraw(); }"></kit-number-field></kit-field>
              <kit-field label="缩放" layout="row"><kit-number-field :model-value="ctx.selected.scale" :min="0.2" :max="4" :step="0.05" @update:model-value="(v) => { ctx.selected.scale = v; ctx.redraw(); }"></kit-number-field></kit-field>
              <kit-field label="角度" layout="row"><kit-number-field :model-value="ctx.selected.angle" :min="-180" :max="180" @update:model-value="(v) => { ctx.selected.angle = v; ctx.redraw(); }"></kit-number-field></kit-field>
            </div>
            <kit-alert v-if="ctx.actionInfo(ctx.selected)" type="info">
              当前动作：{{ ctx.actLabel(ctx.selected) }}<br>
              局部时间 {{ ctx.actionInfo(ctx.selected).local.toFixed(2) }}s · 关键帧 {{ ctx.actionInfo(ctx.selected).keyFrom }}s → {{ ctx.actionInfo(ctx.selected).keyTo === null ? '结束' : ctx.actionInfo(ctx.selected).keyTo + 's' }}
            </kit-alert>
            <kit-alert v-else type="warning">当前时间不在这段标签里，角色未激活。</kit-alert>
          </template>
          <!-- 特效 -->
          <template v-else-if="ctx.selected.type === 'fx'">
            <div class="prop-group">
              <div class="group-title">特效</div>
              <div class="pick-block">
                <div class="pick-title">特效<em>{{ ctx.fxShort(ctx.selected) }}</em></div>
                <pick-cards kind="fx" :options="ctx.fxCards" :model-value="ctx.selected.fxId" card-w="120px" card-ratio="16 / 9" card-minh="80px" @update:model-value="ctx.onFxChange"></pick-cards>
              </div>
              <kit-field label="名称" layout="row"><kit-input :model-value="ctx.selected.label || ''" size="sm" @update:model-value="(v) => { ctx.selected.label = v; }"></kit-input></kit-field>
              <kit-field label="起点 X" layout="row"><kit-number-field :model-value="ctx.selected.from[0]" :min="-800" :max="800" @update:model-value="(v) => ctx.setFrom(0, v)"></kit-number-field></kit-field>
              <kit-field label="起点 Y" layout="row"><kit-number-field :model-value="ctx.selected.from[1]" :min="-600" :max="600" @update:model-value="(v) => ctx.setFrom(1, v)"></kit-number-field></kit-field>
              <kit-field label="移动到终点" hint="开启后按时间从起点插值到终点" layout="row"><kit-switch :model-value="!!ctx.selected.to" @update:model-value="ctx.onToggleTo"></kit-switch></kit-field>
              <template v-if="ctx.selected.to">
                <kit-field label="终点 X" layout="row"><kit-number-field :model-value="ctx.selected.to[0]" :min="-800" :max="800" @update:model-value="(v) => ctx.setTo(0, v)"></kit-number-field></kit-field>
                <kit-field label="终点 Y" layout="row"><kit-number-field :model-value="ctx.selected.to[1]" :min="-600" :max="600" @update:model-value="(v) => ctx.setTo(1, v)"></kit-number-field></kit-field>
              </template>
              <kit-field label="缩放" layout="row"><kit-number-field :model-value="ctx.selected.scale" :min="0.2" :max="4" :step="0.05" @update:model-value="(v) => { ctx.selected.scale = v; ctx.redraw(); }"></kit-number-field></kit-field>
              <kit-field label="角度" layout="row"><kit-number-field :model-value="ctx.selected.angle" :min="-180" :max="180" @update:model-value="(v) => { ctx.selected.angle = v; ctx.redraw(); }"></kit-number-field></kit-field>
              <kit-field label="随机种子" layout="row"><kit-number-field :model-value="ctx.selected.seed" :min="1" :max="99" @update:model-value="ctx.onSeedChange"></kit-number-field></kit-field>
              <div class="pick-block">
                <div class="pick-title">配色<em>{{ ctx.selected.palette || '默认' }}</em></div>
                <pick-swatch :options="ctx.paletteCards" :model-value="ctx.selected.palette || 'default'" :cols="5" @update:model-value="ctx.onPaletteChange"></pick-swatch>
              </div>
            </div>
          </template>
          <!-- 靶子 -->
          <template v-else-if="ctx.selected.type === 'target'">
            <div class="prop-group">
              <div class="group-title">靶子</div>
              <kit-field label="坐标 X" layout="row"><kit-number-field :model-value="ctx.selected.x" :min="-200" :max="500" @update:model-value="(v) => { ctx.selected.x = v; ctx.redraw(); }"></kit-number-field></kit-field>
              <kit-field label="坐标 Y" layout="row"><kit-number-field :model-value="ctx.selected.y" :min="-300" :max="200" @update:model-value="(v) => { ctx.selected.y = v; ctx.redraw(); }"></kit-number-field></kit-field>
            </div>
            <kit-alert type="info">靶子的外观变化由「状态」标签控制，把它绑定到这个靶子上就行。</kit-alert>
          </template>
          <!-- 状态 -->
          <template v-else-if="ctx.selected.type === 'state'">
            <div class="prop-group">
              <div class="group-title">叠加态</div>
              <kit-field label="绑定到" hint="决定这个状态作用在谁身上" layout="row">
                <pick-seg v-if="ctx.bindOptions.length <= 4" :options="ctx.bindOptions" :model-value="ctx.selected.bindTo || 'none'" @update:model-value="ctx.onBindChange"></pick-seg>
                <kit-select v-else :model-value="ctx.selected.bindTo || 'none'" :options="ctx.bindOptions" size="sm" @update:model-value="ctx.onBindChange"></kit-select>
              </kit-field>
              <div class="pick-block">
                <div class="pick-title">外观类型<em>{{ ctx.selected.skin }}</em></div>
                <pick-swatch :options="ctx.skinCards" :model-value="ctx.selected.skin" :cols="4" @update:model-value="(v) => { ctx.selected.skin = v; ctx.redraw(); }"></pick-swatch>
              </div>
              <kit-field label="含命中判定" layout="row"><kit-switch v-model="ctx.selected.hit"></kit-switch></kit-field>
              <template v-if="ctx.selected.hit">
                <kit-field label="伤害" layout="row"><kit-number-field :model-value="ctx.selected.damage" :min="0" :max="9999" @update:model-value="(v) => { ctx.selected.damage = v; }"></kit-number-field></kit-field>
                <kit-field label="推力" layout="row"><kit-number-field :model-value="ctx.selected.push" :min="0" :max="5" :step="0.1" @update:model-value="(v) => { ctx.selected.push = v; }"></kit-number-field></kit-field>
                <kit-field label="稻草量" layout="row"><kit-number-field :model-value="ctx.selected.straw" :min="0" :max="40" @update:model-value="(v) => { ctx.selected.straw = v; }"></kit-number-field></kit-field>
                <kit-field label="抖动量" layout="row"><kit-number-field :model-value="ctx.selected.shiver" :min="0" :max="3" :step="0.1" @update:model-value="(v) => { ctx.selected.shiver = v; ctx.redraw(); }"></kit-number-field></kit-field>
                <div class="box-label">判定框 X / Y / 宽 / 高</div>
                <div class="box-row">
                  <kit-number-field :model-value="ctx.selected.box[0]" :slider="false" :min="-400" :max="800" @update:model-value="(v) => ctx.setBox(0, v)"></kit-number-field>
                  <kit-number-field :model-value="ctx.selected.box[1]" :slider="false" :min="-400" :max="800" @update:model-value="(v) => ctx.setBox(1, v)"></kit-number-field>
                  <kit-number-field :model-value="ctx.selected.box[2]" :slider="false" :min="-400" :max="800" @update:model-value="(v) => ctx.setBox(2, v)"></kit-number-field>
                  <kit-number-field :model-value="ctx.selected.box[3]" :slider="false" :min="-400" :max="800" @update:model-value="(v) => ctx.setBox(3, v)"></kit-number-field>
                </div>
              </template>
            </div>
            <kit-alert type="info">标签的开始 / 结束时间，就是这个状态出现和恢复的时间。</kit-alert>
          </template>
          <div class="prop-actions">
            <kit-button size="sm" variant="outlined" icon="content_copy" @click="ctx.duplicate">复制</kit-button>
            <kit-button size="sm" variant="error" icon="delete" @click="ctx.removeSelected">删除</kit-button>
          </div>
        </template>
      </div>
      <div class="panel-body panel-lib" v-show="ctx.rightTab === 'library'"
           @dragover.prevent @drop.prevent="ctx.onLibDrop">
        <div class="lib-cats" role="group" aria-label="特效分类">
          <button v-for="g in ctx.libGroups" :key="g.id" type="button" class="lib-cat"
                  :class="{ 'is-on': ctx.libCat === g.id }" :title="g.blurb" @click="ctx.libCat = g.id">
            <span>{{ g.name }}</span><span class="lib-cat-n">{{ g.ids.length }}</span>
          </button>
        </div>
        <div class="lib-desc" v-if="ctx.libGroups.find((g) => g.id === ctx.libCat)">
          {{ ctx.libGroups.find((g) => g.id === ctx.libCat).blurb }}
        </div>
        <fx-library :cards="ctx.libCards" card-w="104px"></fx-library>
      </div>
    </div>
  </aside>
  `,
};
