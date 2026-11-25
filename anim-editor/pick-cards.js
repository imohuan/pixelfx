// 右侧属性面板的卡片选择器：武器是静态模型，动作 / 特效是实时播放的小预览。
import { drawWeaponThumb, makeFxPreview } from "./engine.js";
import { WEAPON_LABELS } from "./src/lib/labels.js";

// 武器中文名统一在 src/lib/labels.js 定义，这里转出去给旧调用方用
export { WEAPON_LABELS };

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

// Masonry 防抖重排：卡片缩略图尺寸异步就绪后，通知所有瀑布流重新排版。
// 用 Set 而不是单个回调：属性/资源/资源标签可能同时挂着多个瀑布流。
const masonryRelayouts = new Set();
let masonryRelayoutTimer = 0;
/** 注册瀑布流重排回调，返回取消函数（MasonryGrid 用） */
export function setMasonryRelayout(fn) {
  masonryRelayouts.add(fn);
  return () => masonryRelayouts.delete(fn);
}
function scheduleMasonryRelayout() {
  if (!masonryRelayouts.size) return;
  clearTimeout(masonryRelayoutTimer);
  masonryRelayoutTimer = setTimeout(() => {
    for (const fn of masonryRelayouts) { try { fn(); } catch (e) { /* 单个面板出错不影响其他面板 */ } }
  }, 250);
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

export async function attachCardPreview(canvas, id, ratio, kind) {
  // "auto"：按特效自身 meta.size 取景（引擎里钳制 0.5~2.2），竖长的特效不再被 16:9 裁切
  const aspect = ratio === "9 / 16" ? 9 / 16 : ratio === "1 / 1" ? 1 : ratio === "auto" ? "auto" : 16 / 9;
  // 动作宫格里的卡：只演人物本体（不带武器/技能特效）
  // 特效宫格里的动作卡：完整表演（人物+特效，方便看清这个技能的全貌）
  const handle = await makeFxPreview(canvas, id, { aspect, bodyOnly: kind === "move" });
  if (!handle) return null;
  // 让画布在卡片里按整数倍放大到最大（1 舞台像素 = N 屏幕像素），人物才够大
  const fit = () => {
    // 卡片可能已经被列表换掉（切分类），这时直接跳过
    if (!canvas.isConnected || !canvas.parentElement) return;
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

/** 卡片离开 DOM 时主动停掉预览（避免等下一帧轮询才发现） */
export function detachCardPreview(canvas) {
  const entry = previewByCanvas.get(canvas);
  if (!entry) return;
  previews.delete(entry);
  previewByCanvas.delete(canvas);
  io?.unobserve(canvas);
}

/** 容器宽度变了以后，让这张卡重新按整数倍铺满（瀑布流卡片用） */
export function refitCardPreview(canvas) {
  previewByCanvas.get(canvas)?.fit?.();
}

/** 武器静态缩略图画到卡片画布上；scale 2 = 两倍像素（武器本身不大，放大才看得清） */
export function attachWeaponThumb(canvas, value, scale = 2) {
  const thumb = weaponThumb(value);
  const s = Math.max(1, Math.round(scale));
  canvas.width = thumb.width * s;
  canvas.height = thumb.height * s;
  const g = canvas.getContext("2d");
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.imageSmoothingEnabled = false;
  g.drawImage(thumb, 0, 0, canvas.width, canvas.height);
}

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


