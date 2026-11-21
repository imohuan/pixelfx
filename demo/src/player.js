// The player: one canvas, one effect, integer scale, transparent unless you ask for a backdrop.
// Nothing here knows about files, and nothing beyond <canvas> about the DOM.

import { createFrame, clearFrame, createFx, composite, backdrop, painterFor, drawActor, stockActor, actorAlphaOf } from "../../src/core/index.js";

const DEFAULTS = { fps: 30, bg: "dark", loop: false, duration: 1, tags: [], options: {}, size: [64, 64], origin: [0, 0] };
const CONTROL = new Set(["scale", "loop", "speed", "background", "seed", "flip", "light", "onEnd", "actor", "autoplay", "canvas", "source", "fx", "label"]);

const split = (opts) => {
  const fx = {}, ctl = {};
  for (const [k, v] of Object.entries(opts)) (CONTROL.has(k) ? ctl : fx)[k] = v;
  return { fx, ctl };
};

/** Fill in the meta an effect left out, so the player never has to guard. */
export const withDefaults = (meta = {}) => ({ ...DEFAULTS, ...meta });

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const modulo = (a, n) => ((a % n) + n) % n;

export function create(canvas, mod, opts = {}) {
  return new Player(canvas, mod, opts);
}

class Player {
  constructor(canvas, mod, opts) {
    if (!canvas || typeof canvas.getContext !== "function") throw new Error("pixelfx: needs a <canvas>.");
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { willReadFrequently: true });
    this.mod = mod;
    this.meta = withDefaults(mod.meta);
    this.opts = { ...opts };
    this.scale = opts.scale ?? 1;
    this.speed = opts.speed ?? 1;
    this.background = opts.background ?? "none";
    this.loop = opts.loop ?? this.meta.loop;
    this.playing = opts.autoplay ?? true;
    this.onEnd = opts.onEnd ?? null;
    this.t = 0;
    this.acc = 0;
    this.ended = false;
    this._raf = 0;
    this._last = 0;
    this._resize();
    this._init();
    this._paint();
    if (this.playing) this._start();
  }

  get width() { return this.meta.size[0]; }
  get height() { return this.meta.size[1]; }
  get duration() { return this.meta.duration; }

  // the canvas holds the effect's own pixels; CSS upscales, so every pixel stays a square
  _resize() {
    const [w, h] = this.meta.size;
    this.canvas.width = w;
    this.canvas.height = h;
    if (this.scale > 0) {
      this.canvas.style.width = `${w * this.scale}px`;
      this.canvas.style.height = `${h * this.scale}px`;
    }
    this.canvas.style.imageRendering = "pixelated";
    this.img = this.ctx.createImageData(w, h);
  }

  _init() {
    const [W, H] = this.meta.size, [OX, OY] = this.meta.origin;
    const st = split(this.opts);
    this.frame = createFrame(W, H);
    this.inst = createFx(this.mod, { x: OX, y: OY, ...st.fx, ...(st.ctl.seed !== undefined ? { seed: st.ctl.seed } : {}), flip: !!st.ctl.flip });
    this.actor = this.meta.actor && st.ctl.actor !== false ? this.inst.options.actor ?? stockActor() : null;
    this.bgBuf = this.background === "none" ? null : backdrop(this.background, W, H, OY);
  }

  _paint() {
    const f = clearFrame(this.frame), m = this.meta;
    this.inst.draw(f, "back");
    if (this.actor) {
      const tt = m.loop ? this.t % m.duration : Math.min(this.t, m.duration);
      drawActor(painterFor(f).place(m.origin[0], m.origin[1], !!this.opts.flip), this.actor, actorAlphaOf(this.mod, tt, this.inst.options));
    }
    this.inst.draw(f, "front");
    composite(f, this.img.data, this.bgBuf);
    this.ctx.putImageData(this.img, 0, 0);
    return this;
  }

  _step(dt) {
    const step = 1 / this.meta.fps, D = this.meta.duration;
    this.acc = Math.min(this.acc + dt * this.speed, 0.25);
    let moved = false;
    while (this.acc >= step) {
      this.acc -= step;
      const next = this.t + step;
      // a one-shot has nothing past its last frame, so looping it starts over
      if (next >= D && !this.meta.loop) {
        if (this.loop) {
          this.t = step;
          this._init();
        } else {
          this.t = D;
          this.acc = 0;
          if (!this.ended) {
            this.ended = true;
            this.playing = false;
            this.onEnd?.({ t: this.t });
          }
          break;
        }
      } else this.t = next;
      this.inst.update(step);
      moved = true;
    }
    return moved;
  }

  _start() {
    this._last = now();
    const tick = (ts) => {
      this._raf = 0;
      const dt = Math.min(0.1, (ts - this._last) / 1000);
      this._last = ts;
      if (this._step(dt)) this._paint();
      if (this.playing) this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  play() {
    if (this.playing) return this;
    if (!this.loop && this.ended) this.seek(0);
    this.playing = true;
    if (this._raf === 0) this._start();
    return this;
  }

  pause() { this.playing = false; return this; }
  toggle() { return this.playing ? this.pause() : this.play(); }

  /** Jump to a time and paint it. Exact: a frame only depends on t. */
  seek(t) {
    const D = this.meta.duration;
    this.t = this.loop && !this.meta.loop ? modulo(t, D) : Math.max(0, Math.min(D, t));
    this.acc = 0;
    this.ended = false;
    this._init();
    this.inst.update(this.t);
    this._paint();
    return this;
  }

  /** Change options live, keeping the same moment unless you pass one. */
  setOptions(patch = {}, at = this.t) {
    this.opts = { ...this.opts, ...patch };
    for (const k of ["scale", "speed", "background", "loop", "onEnd"]) if (patch[k] !== undefined) this[k] = patch[k];
    this._resize();
    return this.seek(at);
  }

  resize(scale) {
    this.scale = scale;
    this._resize();
    this._paint();
    return this;
  }

  restart() { this.seek(0); return this.play(); }

  destroy() {
    this.playing = false;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    this.actor = null;
    return this;
  }
}

/** One frame, painted once: drawTo(canvas, mod, 0.6, { scale: 4 }). */
export function drawTo(canvas, mod, t, opts = {}) {
  const meta = withDefaults(mod.meta), [W, H] = meta.size, [OX, OY] = meta.origin;
  const st = split(opts);
  const inst = createFx(mod, { x: OX, y: OY, ...st.fx, ...(st.ctl.seed !== undefined ? { seed: st.ctl.seed } : {}), flip: !!st.ctl.flip });
  const frame = createFrame(W, H);
  const tt = meta.loop ? modulo(t, meta.duration) : Math.max(0, Math.min(meta.duration, t));
  inst.update(tt);
  inst.draw(frame, "back");
  inst.draw(frame, "front");
  if (canvas.width !== W || canvas.height !== H) (canvas.width = W), (canvas.height = H);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const img = ctx.createImageData(W, H);
  const bg = st.ctl.background && st.ctl.background !== "none" ? backdrop(st.ctl.background, W, H, OY) : null;
  composite(frame, img.data, bg);
  ctx.putImageData(img, 0, 0);
  if (st.ctl.scale > 0) (canvas.style.width = `${W * st.ctl.scale}px`), (canvas.style.height = `${H * st.ctl.scale}px`);
  canvas.style.imageRendering = "pixelated";
  return { width: W, height: H, t: tt };
}

/** The whole run as a sprite sheet data URL. */
export function toDataURL(mod, opts = {}) {
  const meta = withDefaults(mod.meta), [W, H] = meta.size, scale = opts.scale ?? 1;
  const n = Math.round(meta.duration * meta.fps) + (meta.loop ? 0 : 1);
  const cols = Math.min(n, Math.max(1, Math.ceil(Math.sqrt((n * H) / W)))), rows = Math.ceil(n / cols);
  const out = document.createElement("canvas");
  out.width = cols * W;
  out.height = rows * H;
  const ctx = out.getContext("2d");
  const st = split(opts);
  const inst = createFx(mod, { x: meta.origin[0], y: meta.origin[1], ...st.fx, flip: !!st.ctl.flip });
  const frame = createFrame(W, H), img = ctx.createImageData(W, H);
  for (let i = 0; i < n; i++) {
    if (i) inst.update(1 / meta.fps);
    inst.draw(clearFrame(frame));
    composite(frame, img.data, null);
    ctx.putImageData(img, (i % cols) * W, Math.floor(i / cols) * H);
  }
  if (scale === 1) return out.toDataURL("image/png");
  const big = document.createElement("canvas");
  big.width = out.width * scale;
  big.height = out.height * scale;
  const bctx = big.getContext("2d");
  bctx.imageSmoothingEnabled = false;
  bctx.drawImage(out, 0, 0, big.width, big.height);
  return big.toDataURL("image/png");
}
