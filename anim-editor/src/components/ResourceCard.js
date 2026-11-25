// 瀑布流里的一张卡：只负责“画好这一张”，布局交给 MasonryGrid。
// kind 决定缩略图怎么来：fx / move 是实时循环预览，weapon 是静态模型，icon 是图标。
import {
  attachCardPreview, detachCardPreview, attachWeaponThumb,
} from "../../pick-cards.js";

export const ResourceCard = {
  name: "ResourceCard",
  props: {
    item: { type: Object, required: true },
    kind: { type: String, default: "fx" },     // fx | move | weapon | icon
    selected: { type: Boolean, default: false },
    draggable: { type: Boolean, default: false },
    showLabel: { type: Boolean, default: true },
  },
  emits: ["pick"],
  mounted() { this.bind(); },
  updated() { this.bind(); },
  watch: {
    // 卡片换了资源（同一位置复用时）要重画，否则会显示上一张的图
    "item.value"() { this.bind(true); },
    "kind"() { this.bind(true); },
  },
  beforeUnmount() {
    const c = this.$refs.cv;
    if (c) detachCardPreview(c);
  },
  methods: {
    bind(force) {
      const c = this.$refs.cv;
      if (!c || this.kind === "icon") return;
      const id = this.item.value;
      if (!id) return;
      const key = this.kind + "|" + id;
      if (!force && c.dataset.bound === key) return;
      // 同一个卡片位置换了资源（例如在动作 / 特效之间切换）：先把旧预览拆掉，否则两个特效会叠着画
      if (c.dataset.bound) detachCardPreview(c);
      c.dataset.bound = key;
      if (this.kind === "weapon") {
        // 武器本身很小，画成两倍像素再交给 CSS 等比缩放
        attachWeaponThumb(c, id, 2);
        return;
      }
      c.dataset.masonry = "1";
      // 动作卡只演人物本体；特效卡要完整光效
      attachCardPreview(c, id, "auto", this.kind === "move" ? "move" : "fx");
    },
    onDragStart(e) {
      if (!this.draggable) return;
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setData("text/fx-id", this.item.value);
      e.dataTransfer.setData("text/plain", this.item.value);
    },
  },
  template: `
    <button type="button" class="pk-card rc-card" :class="['rc-' + kind, { 'is-on': selected }]"
      :draggable="draggable" :title="item.label"
      @click="$emit('pick', item)" @dragstart="onDragStart">
      <span class="pk-thumb rc-thumb">
        <span v-if="kind === 'icon'" class="material-symbols-outlined pk-ico">{{ item.icon }}</span>
        <canvas v-else ref="cv" :data-value="item.value"></canvas>
      </span>
      <span v-if="showLabel" class="pk-label">{{ item.short || item.label }}</span>
    </button>`,
};
