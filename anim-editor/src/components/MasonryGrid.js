// 通用瀑布流布局：固定 2 或 3 列，每张卡放进当前最矮的一列。
// 只负责“排”，卡片内容由父组件用默认插槽传入（作用域参数 item / index）。
import { setMasonryRelayout, refitCardPreview } from "../../pick-cards.js";

export const MasonryGrid = {
  name: "MasonryGrid",
  props: {
    items: { type: Array, default: () => [] },
    itemKey: { type: String, default: "value" },
    gap: { type: Number, default: 8 },
    // 面板宽度到这个值就排 3 列，否则 2 列
    threeAt: { type: Number, default: 400 },
    emptyText: { type: String, default: "没有可以显示的资源" },
  },
  data() {
    return { cols: 2 };
  },
  mounted() {
    // 卡片里的画布尺寸是异步就绪的，排好后要重新量一次高度
    this._offRelayout = setMasonryRelayout(() => this.schedule());
    // 卡片自身高度变了（画布尺寸就绪、换类别）也要重排
    this._itemRo = new ResizeObserver(() => this.schedule());
    // 只盯宽度：容器高度由我们自己算，盯高度会互相触发
    this._lastW = 0;
    this._ro = new ResizeObserver(() => {
      const w = this.$el?.clientWidth || 0;
      if (!w || Math.abs(w - this._lastW) < 1) return;
      this._lastW = w;
      this.schedule();
    });
    this._ro.observe(this.$el);
    // 先用当前尺寸排一次，避免卡片全都叠在左上角；缩略图就绪后再量一次真实高度
    this.observeItems();
    this.kick();
  },
  updated() { this.observeItems(); this.kick(); },
  beforeUnmount() {
    this._destroyed = true;
    cancelAnimationFrame(this._raf);
    clearTimeout(this._kickTimer);
    clearTimeout(this._rafTimer);
    this._offRelayout?.();
    this._ro?.disconnect();
    this._itemRo?.disconnect();
  },
  methods: {
    // 面板在 v-show 里时宽度是 0，等它露出宽度后再排（最多等 4 秒）
    kick(tries = 40) {
      this.$nextTick(() => {
        if (this._destroyed) return;
        if (this.$el && this.$el.clientWidth > 40) { this.layout(); return; }
        if (tries > 0) this._kickTimer = setTimeout(() => this.kick(tries - 1), 100);
      });
    },
    observeItems() {
      if (!this._itemRo) return;
      // 列表换了就重新观察，避免积累已经移出 DOM 的旧卡片
      this._itemRo.disconnect();
      this.$el?.querySelectorAll(".mg-item").forEach((el) => this._itemRo.observe(el));
    },
    schedule() {
      if (this._raf) return;
      // 用 setTimeout 而不是 rAF：标签页在后台 / 内嵌预览里 rAF 可能被完全暂停
      this._rafTimer = setTimeout(() => { this._raf = 0; this.layout(); }, 16);
      this._raf = 1;
    },
    layout() {
      const el = this.$el;
      if (!el || !el.clientWidth) return;
      const gap = this.gap;
      const cols = el.clientWidth >= this.threeAt ? 3 : 2;
      this.cols = cols;
      const cardW = Math.max(60, Math.floor((el.clientWidth - gap * (cols - 1)) / cols));
      const widthChanged = this._cardW !== cardW;
      this._cardW = cardW;
      el.style.setProperty("--mg-card-w", cardW + "px");
      const boxes = [...el.querySelectorAll(".mg-item")];
      if (!boxes.length) { el.style.height = ""; return; }
      // 卡宽变了：卡片里的缩略图要重新铺满
      if (widthChanged) {
        el.querySelectorAll("canvas").forEach((c) => refitCardPreview(c));
      }
      const heights = new Array(cols).fill(0);
      for (const box of boxes) {
        box.style.width = cardW + "px";
        const card = box.firstElementChild;
        if (card) card.style.width = "100%";
        const h = box.offsetHeight;
        let c = 0;
        for (let i = 1; i < cols; i++) if (heights[i] < heights[c] - 0.5) c = i;
        box.style.left = (c * (cardW + gap)) + "px";
        box.style.top = heights[c] + "px";
        heights[c] += h + gap;
      }
      el.style.height = (Math.max(...heights) - gap) + "px";
    },
  },
  template: `
    <div class="mg-root">
      <div v-for="(item, i) in items" :key="item[itemKey] ?? i" class="mg-item">
        <slot :item="item" :index="i"></slot>
      </div>
      <div v-if="!items.length" class="mg-empty">{{ emptyText }}</div>
    </div>`,
};
