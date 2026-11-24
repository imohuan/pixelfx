// 右侧属性面板的卡片选择器：武器是静态模型，动作 / 特效是实时播放的小预览。
import { drawWeaponThumb, makeFxPreview } from "./engine.js";

export const WEAPON_LABELS = {
  sword: "长剑", greatsword: "巨剑", dagger: "匕首", spear: "长矛", hammer: "战锤",
  scythe: "镰刀", claw: "利爪", bow: "弓", pistol: "手枪", launcher: "火箭筒", handle: "空手",
};

/* ---------------- 武器静态缩略图（只画一次） ---------------- */
const weaponCache = new Map();
function weaponThumb(value) {
  let c = weaponCache.get(value);
  if (!c) {
    c = document.createElement("canvas");
    // 画布尺寸由 drawWeaponThumb 按武器实际大小决定，这里只建壳
    drawWeaponThumb(c, value);
    weaponCache.set(value, c);
  }
  return c;
}

/* ---------------- 实时预览主循环（所有卡片共用一个 rAF） ---------------- */
const previews = new Set();
let rafId = 0, clock = 0, lastTs = 0;
const previewByCanvas = new Map();

// Masonry 防抖重排：瀑布流卡片尺寸异步就绪后统一触发一次
let masonryRelayoutFn = null, masonryRelayoutTimer = 0;
export function setMasonryRelayout(fn) {
  masonryRelayoutFn = fn;
}
function scheduleMasonryRelayout() {
  if (!masonryRelayoutFn) return;
  clearTimeout(masonryRelayoutTimer);
  masonryRelayoutTimer = setTimeout(() => masonryRelayoutFn?.(), 250);
}

function tick(ts) {
  if (!lastTs) lastTs = ts;
  const dt = Math.min(0.05, (ts - lastTs) / 1000);
  lastTs = ts;
  clock += dt;
  for (const p of previews) {
    if (!p.canvas.isConnected) { io?.unobserve(p.canvas); previewByCanvas.delete(p.canvas); previews.delete(p); continue; }
    if (p.active === false) continue;   // 滚出视口 / 面板藏起来：暂停这张卡的预览
    p.acc += dt;
    if (p.acc < 1 / 24) continue;
    p.acc = 0;
    window.__previewPaints = (window.__previewPaints || 0) + 1;
    try {
      p.handle.paint((clock + p.phase) % p.handle.duration);
    } catch (e) {
      // 单个特效出错只跳过它，不能让整个主循环停掉
      if (!p.warned) { p.warned = true; console.warn("preview", e && e.message); }
    }
  }
  let live = 0;
  for (const p of previews) if (p.active !== false && p.canvas.isConnected) live++;
  rafId = live ? requestAnimationFrame(tick) : 0;
  if (!live) lastTs = 0;
  window.__previewTicks = (window.__previewTicks || 0) + 1;
  window.__previewCount = live;
  window.__previewStates = [...previews].map((p) => ({ id: p.canvas.dataset.value, active: p.active, connected: p.canvas.isConnected }));
}

function schedule() {
  if (rafId) return;
  for (const p of previews) {
    if (p.active !== false && p.canvas.isConnected) { lastTs = 0; rafId = requestAnimationFrame(tick); return; }
  }
}

// 只有出现在视口附近的预览才真正播放，240+ 张卡不至于全部同时渲染
const io = typeof IntersectionObserver !== "undefined"
  ? new IntersectionObserver((ents) => {
      let woke = false;
      for (const en of ents) {
        for (const p of previews) {
          if (p.canvas === en.target) { p.active = en.isIntersecting; if (p.active) woke = true; }
        }
      }
      if (woke) schedule();
    }, { rootMargin: "80px" })
  : null;

async function attachPreview(canvas, id, ratio, kind) {
  // "auto"：按特效自身 meta.size 取景（引擎里钳制 0.5~2.2），竖长的特效不再被 16:9 裁切
  const aspect = ratio === "9 / 16" ? 9 / 16 : ratio === "1 / 1" ? 1 : ratio === "auto" ? "auto" : 16 / 9;
  // 动作宫格里的卡：只演人物本体（不带武器/技能特效）
  // 特效宫格里的动作卡：完整表演（人物+特效，方便看清这个技能的全貌）
  const handle = await makeFxPreview(canvas, id, { aspect, bodyOnly: kind === "move" });
  if (!handle) return null;
  // 让画布在卡片里按整数倍放大到最大（1 舞台像素 = N 屏幕像素），人物才够大
  const fit = () => {
    const box = canvas.parentElement.getBoundingClientRect();
    if (box.width < 10 || canvas.width < 10) return;
    if (canvas.dataset.masonry === "1") {
      // 瀑布流卡片：宽度占满卡片，高度按画布比例，pixelated 最近邻采样保像素硬边不模糊
      const w = Math.floor(box.width) - 1;   // 只留 1px 给边框圆整，其余全部贴满
      canvas.style.width = w + "px";
      canvas.style.height = Math.round(w * canvas.height / canvas.width) + "px";
      canvas.style.imageRendering = w < canvas.width ? "auto" : "pixelated";
      scheduleMasonryRelayout();   // 尺寸就绪后触发瀑布流重排（防抖合并）
      return;
    }
    // 整个舞台按整数倍放大到卡片能装下的最大值（舞台本身已贴内容，不再按内容二次缩放，
    // 否则实时预览时内容范围每帧变化会导致画布忽大忽小）
    const s = Math.max(1, Math.floor(Math.min((box.width - 8) / canvas.width, (box.height - 8) / canvas.height)));
    const dw = canvas.width * s, dh = canvas.height * s;
    canvas.style.width = dw + "px";
    canvas.style.height = dh + "px";
  };
  requestAnimationFrame(fit);
  const entry = { canvas, handle, acc: 0, phase: Math.random() * handle.duration, active: true, fit };
  previewByCanvas.set(canvas, entry);
  handle.paint(entry.phase);
  previews.add(entry);
  io?.observe(canvas);
  schedule();
  return entry;
}

/* ---------------- 卡片宫格 ---------------- */
export const PickCards = {
  name: "PickCards",
  props: {
    modelValue: { type: [String, Number], default: "" },
    options: { type: Array, default: () => [] },
    kind: { type: String, default: "fx" },   // weapon | move | fx
    cardW: { type: String, default: "150px" }, // 每张卡的目标宽度（grid 里会被 clamp）
    cardRatio: { type: String, default: "16 / 9" },
    cardMinh: { type: String, default: "120px" }, // 卡片最小高度（预览区域自适应）
  },
  emits: ["update:modelValue"],
  mounted() { this.attachAll(); },
  updated() { this.attachAll(); },
  methods: {
    attachAll() {
      const nodes = this.$refs.cvs;
      if (!nodes) return;
      const list = Array.isArray(nodes) ? nodes : [nodes];
      for (const c of list) {
        const value = c.dataset.value;
        if (!value || c.dataset.bound === value) continue;
        c.dataset.bound = value;
        if (this.kind === "weapon") {
          const thumb = weaponThumb(value);
          c.width = thumb.width;
          c.height = thumb.height;
          // 直接把内容复制到卡片画布（尺寸=内容尺寸），CSS object-fit 放大到卡片
          c.getContext("2d").drawImage(thumb, 0, 0);
          // 武器画布尺寸就是内容尺寸，CSS 拉满缩略图区域即可（object-fit contain 保比例）
          continue;
        }
        attachPreview(c, value, this.cardRatio, this.kind);
      }
    },
  },
  template: `
    <div class="pk-grid" :style="{ '--pk-card-w': cardW, '--pk-card-ar': cardRatio, '--pk-card-minh': cardMinh }">
      <button v-for="o in options" :key="o.value" type="button"
        class="pk-card" :class="{ 'is-on': o.value === modelValue }"
        :title="o.label" @click="$emit('update:modelValue', o.value)">
        <span class="pk-thumb">
          <span v-if="o.icon" class="material-symbols-outlined pk-ico">{{ o.icon }}</span>
          <canvas v-else ref="cvs" :data-value="o.value"></canvas>
        </span>
        <span class="pk-label">{{ o.short || o.label }}</span>
      </button>
    </div>`,
};

/* ---------------- 分段切换（选项 <= 4 个） ---------------- */
export const PickSeg = {
  name: "PickSeg",
  props: {
    modelValue: { type: [String, Number], default: "" },
    options: { type: Array, default: () => [] },
  },
  emits: ["update:modelValue"],
  template: `
    <div class="pk-seg" role="group">
      <button v-for="o in options" :key="o.value" type="button"
        class="pk-seg__item" :class="{ 'is-on': o.value === modelValue }"
        :title="o.label" @click="$emit('update:modelValue', o.value)">
        <span v-if="o.icon" class="material-symbols-outlined">{{ o.icon }}</span>
        <span class="pk-seg__txt">{{ o.short || o.label }}</span>
      </button>
    </div>`,
};

/* ---------------- 色块宫格：配色 / 外观 ---------------- */
export const PickSwatch = {
  name: "PickSwatch",
  props: {
    modelValue: { type: [String, Number], default: "" },
    options: { type: Array, default: () => [] },
    cols: { type: Number, default: 5 },
  },
  emits: ["update:modelValue"],
  template: `
    <div class="pk-swatch" :style="{ '--pk-cols': cols }">
      <button v-for="o in options" :key="o.value" type="button"
        class="pk-sw" :class="{ 'is-on': o.value === modelValue }" :title="o.label"
        @click="$emit('update:modelValue', o.value)">
        <span class="pk-sw__dot" :style="{ background: o.color || 'transparent' }"></span>
        <span class="pk-sw__txt">{{ o.short || o.label }}</span>
      </button>
    </div>`,
};

/* ---------------- 资源标签宫格：全特效浏览 + 拖拽到画布 ---------------- */
export const FxLibrary = {
  name: "FxLibrary",
  props: {
    cards: { type: Array, default: () => [] },
    cardW: { type: String, default: "104px" },
  },
  mounted() {
    this.attachAll();
    // 专业瀑布流：Masonry（vendor 本地化，离线可用）
    // 面板初始 v-show 隐藏时 Masonry 拿不到尺寸：轮询等首次拿到宽度再布局（比 IO 更可靠）
    const tryInit = (n) => {
      if (this.masonry) return;
      if (this.$el.clientWidth > 50) { this.setupMasonry(); return; }
      if (n > 0) setTimeout(() => tryInit(n - 1), 300);
    };
    tryInit(40);   // 最多重试 12s
    setMasonryRelayout(() => {
      this.masonry?.reloadItems?.();
      this.masonry?.layout?.();
    });
    // 面板从隐藏 tab 切回来 / 宽度变化时，重新布局 + 按整数倍放大缩略图
    this.ro = new ResizeObserver(() => this.fitAll());
    this.ro.observe(this.$el);
  },
  updated() {
    this.attachAll();
    this.$nextTick(() => { this.masonry?.reloadItems?.(); this.masonry?.layout?.(); this.fitAll(); });
  },
  beforeUnmount() { this.ro?.disconnect(); this.masonry?.destroy?.(); },
  methods: {
    setupMasonry() {
      if (this.masonry) { this.applyCardWidth(); this.masonry.option?.({ columnWidth: this.cardPx }); this.masonry.reloadItems?.(); this.masonry.layout?.(); return; }
      if (!window.Masonry) return;
      if (!this.$el.clientWidth) return;   // 容器还没布局出来，等 fitAll 再试
      this.applyCardWidth();
      try {
        this.masonry = new Masonry(this.$el, {
          itemSelector: ".fxlib-card",
          columnWidth: this.cardPx,  // Masonry 内部会自己加 gutter：实际列宽 = cardPx + gutter
          gutter: 6,
          percentPosition: true,
          transitionDuration: "0.15s",
          resizeContainer: false,   // 容器高度由 flex 布局占满面板，Masonry 不要显式设置 height
        });
      } catch (e) { console.warn("masonry init", e); }
    },
    // 列数按容器宽度算：目标卡宽 ~150px，剩余空间均摊到卡片，让每行铺满容器不留右侧空隙
    applyCardWidth() {
      const w = this.$el.clientWidth - 2;   // 减掉容器 1px padding
      const GUTTER = 6, TARGET = 150, MIN = 120, MAX = 200;
      let cols = Math.max(1, Math.round(w / TARGET));
      let cardW = (w - GUTTER * (cols - 1)) / cols;
      while (cardW < MIN && cols > 1) { cols--; cardW = (w - GUTTER * (cols - 1)) / cols; }
      while (cardW > MAX && cols < 12) { cols++; cardW = (w - GUTTER * (cols - 1)) / cols; }
      this.cardPx = cardW;   // 注意：不能用 this.cardW（那是只读 prop），列宽数据存这里
      this.$el.style.setProperty("--fxlib-card-w", cardW + "px");
    },
    attachAll() {
      const nodes = this.$refs.cvs;
      if (!nodes) return;
      const list = Array.isArray(nodes) ? nodes : [nodes];
      for (const c of list) {
        if (!c.dataset.value || c.dataset.bound === c.dataset.value) continue;
        c.dataset.bound = c.dataset.value;
        c.dataset.masonry = "1";
        attachPreview(c, c.dataset.value, "auto", "fx");
      }
    },
    fitAll() {
      try {
        this.applyCardWidth();
        if (this.masonry) this.masonry.option?.({ columnWidth: this.cardPx });
        else this.setupMasonry();
        this.masonry?.reloadItems?.();
        const nodes = this.$refs.cvs;
        if (!nodes) return;
        const list = Array.isArray(nodes) ? nodes : [nodes];
        for (const c of list) previewByCanvas.get(c)?.fit?.();
        this.masonry?.layout?.();
      } catch (e) {
        console.warn("fxlib fit", e);
      }
    },
    onDragStart(e, o) {
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setData("text/fx-id", o.value);
      e.dataTransfer.setData("text/plain", o.value);
    },
  },
  template: `
    <div class="pk-grid fxlib-grid" :style="{ '--pk-card-w': cardW }">
      <button v-for="o in cards" :key="o.value" type="button"
        class="pk-card fxlib-card" draggable="true" :title="o.label"
        @dragstart="onDragStart($event, o)">
        <span class="pk-thumb">
          <canvas ref="cvs" :data-value="o.value"></canvas>
        </span>
        <span class="pk-label">{{ o.short }}</span>
      </button>
    </div>`,
};

