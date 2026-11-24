import {
  clamp,
  normalizeConfig,
  quantize,
  formatNumber,
  parseNumber,
} from "./number-field-core.js";

const CSS = [
  ":host{",
  "  --nf-h:24px;",
  "  --nf-radius:4px;",
  "  --nf-font:'Geist',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;",
  "  --nf-mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;",
  "  --nf-size:12px;",
  "  --nf-num:11px;",
  "  --nf-ink:#000000;",
  "  --nf-on-ink:#ffffff;",
  "  --nf-muted:#47464a;",
  "  --nf-soft:#8a888d;",
  "  --nf-border:#c8c5ca;",
  "  --nf-track:#d8d5da;",
  "  --nf-surface:#ffffff;",
  "  --nf-surface-low:#f3f3f4;",
  "  display:block;",
  "  width:100%;",
  "  min-width:0;",
  "  color:var(--nf-ink);",
  "  font:400 var(--nf-size)/1.4 var(--nf-font);",
  "  -webkit-font-smoothing:antialiased;",
  "}",
  ":host([size='sm']){--nf-h:20px;--nf-size:11px;--nf-num:10px;}",
  ":host([size='lg']){--nf-h:28px;--nf-size:12px;--nf-num:12px;}",
  ":host([theme='dark']){",
  "  --nf-ink:#ffffff;",
  "  --nf-on-ink:#000000;",
  "  --nf-muted:#b9b7bc;",
  "  --nf-soft:#8f8d92;",
  "  --nf-border:#4a484d;",
  "  --nf-track:#4a484d;",
  "  --nf-surface:#191919;",
  "  --nf-surface-low:#262626;",
  "}",
  ":host([disabled]){opacity:.42;pointer-events:none;}",
  "*{box-sizing:border-box;}",
  ".field{position:relative;width:100%;min-width:0;}",
  ".row{display:flex;align-items:center;gap:6px;height:var(--nf-h);min-width:0;}",
  ".lock{",
  "  appearance:none;",
  "  flex:none;",
  "  display:grid;",
  "  place-items:center;",
  "  width:calc(var(--nf-h) - 2px);",
  "  height:calc(var(--nf-h) - 2px);",
  "  padding:0;",
  "  border:1px solid transparent;",
  "  border-radius:var(--nf-radius);",
  "  background:transparent;",
  "  color:var(--nf-soft);",
  "  cursor:pointer;",
  "  transition:background-color .12s ease,color .12s ease,border-color .12s ease,transform .12s ease;",
  "}",
  ".lock:hover{background:var(--nf-surface-low);color:var(--nf-ink);}",
  ".lock:active{transform:scale(.94);}",
  ".lock[aria-pressed='true']{background:var(--nf-ink);border-color:var(--nf-ink);color:var(--nf-on-ink);}",
  ".lock:focus-visible{outline:2px solid var(--nf-ink);outline-offset:1px;}",
  ".lock .ico{display:grid;place-items:center;width:100%;height:100%;}",
  ".lock .ico-locked{display:none;}",
  ".lock[aria-pressed='true'] .ico-unlocked{display:none;}",
  ".lock[aria-pressed='true'] .ico-locked{display:grid;}",
  ".track{",
  "  position:relative;",
  "  flex:1 1 auto;",
  "  min-width:48px;",
  "  height:100%;",
  "  margin:0 5px;",
  "  cursor:pointer;",
  "  touch-action:none;",
  "  outline:none;",
  "  --p:0;",
  "}",
  ".track:focus-visible{outline:2px solid var(--nf-ink);outline-offset:2px;border-radius:3px;}",
  ".track:focus:not(:focus-visible){outline:none;}",
  ".rail,.fill{position:absolute;top:50%;height:2px;border-radius:1px;transform:translateY(-50%);pointer-events:none;}",
  ".rail{left:0;right:0;background:var(--nf-track);}",
  ".fill{left:0;width:0;background:var(--nf-ink);}",
  ".thumb{",
  "  position:absolute;",
  "  top:50%;",
  "  left:0;",
  "  width:10px;",
  "  height:10px;",
  "  border:2px solid var(--nf-ink);",
  "  border-radius:50%;",
  "  background:var(--nf-surface);",
  "  transform:translate(-50%,-50%);",
  "  transition:transform .12s ease,box-shadow .12s ease;",
  "  pointer-events:none;",
  "}",
  ".track:hover .thumb{transform:translate(-50%,-50%) scale(1.18);}",
  ".track.is-active .thumb{transform:translate(-50%,-50%) scale(1.24);box-shadow:0 0 0 4px var(--nf-surface-low);}",
  ".box{",
  "  flex:none;",
  "  display:flex;",
  "  align-items:center;",
  "  gap:3px;",
  "  height:calc(var(--nf-h) - 2px);",
  "  padding:0 6px;",
  "  border:1px solid var(--nf-border);",
  "  border-radius:var(--nf-radius);",
  "  background:var(--nf-surface);",
  "  cursor:text;",
  "  transition:border-color .12s ease,box-shadow .12s ease;",
  "}",
  ".box:hover{border-color:var(--nf-soft);}",
  ".box:focus-within{border-color:var(--nf-ink);box-shadow:0 0 0 1px var(--nf-ink);}",
  "input{",
  "  appearance:none;",
  "  display:block;",
  "  width:calc(var(--nf-ch,5) * 1ch + 2px);",
  "  min-width:0;",
  "  padding:0;",
  "  border:0;",
  "  outline:0;",
  "  background:transparent;",
  "  color:var(--nf-ink);",
  "  font:500 var(--nf-num)/1 var(--nf-mono);",
  "  font-variant-numeric:tabular-nums;",
  "  text-align:right;",
  "  caret-color:var(--nf-ink);",
  "}",
  "input::selection{background:var(--nf-ink);color:var(--nf-on-ink);}",
  ".unit{flex:none;color:var(--nf-soft);font:400 10px/1 var(--nf-mono);white-space:nowrap;}",
  ".unit:empty{display:none;}",
  ".field.is-invalid .box{border-color:var(--nf-ink);animation:nf-shake .24s ease both;}",
  "@keyframes nf-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-2px)}75%{transform:translateX(2px)}}",
  ".toast{",
  "  position:fixed;",
  "  top:16px;",
  "  left:50%;",
  "  z-index:2147483000;",
  "  display:flex;",
  "  align-items:center;",
  "  gap:8px;",
  "  max-width:calc(100vw - 32px);",
  "  padding:8px 14px;",
  "  border-radius:999px;",
  "  background:var(--nf-ink);",
  "  color:var(--nf-on-ink);",
  "  font:500 11px/1 var(--nf-font);",
  "  white-space:nowrap;",
  "  box-shadow:0 8px 30px rgba(0,0,0,.22);",
  "  opacity:0;",
  "  pointer-events:none;",
  "  transform:translate(-50%,-10px);",
  "  transition:opacity .16s ease,transform .16s ease;",
  "}",
  ".toast.is-on{opacity:1;transform:translate(-50%,0);}",
  ".toast svg{flex:none;opacity:.8;}",
  ".toast b{font:600 12px/1 var(--nf-mono);font-variant-numeric:tabular-nums;}",
  ".toast em{font-style:normal;opacity:.62;}",
  ".toast .sep{width:1px;height:12px;background:currentColor;opacity:.24;}",
  ":host([size='sm']) .toast{padding:7px 12px;}",
  "@media (max-width:560px){.toast .keys{display:none;}}",
  "@media (pointer:coarse){.lock{display:none;}}",
  "@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;}}",
  ".sr-only{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;}",
].join("");

const ICON_UNLOCKED = [
  '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">',
  '<rect x="3.25" y="7" width="9.5" height="6.25" rx="1.4" stroke="currentColor" stroke-width="1.4"/>',
  '<path d="M5.6 7V5.3A2.4 2.4 0 0 1 10.4 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  '<circle cx="8" cy="10.15" r=".9" fill="currentColor"/>',
  "</svg>",
].join("");

const ICON_LOCKED = [
  '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">',
  '<rect x="3.25" y="7" width="9.5" height="6.25" rx="1.4" stroke="currentColor" stroke-width="1.4"/>',
  '<path d="M5.6 7V5.3A2.4 2.4 0 0 1 10.4 5.3V7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  '<circle cx="8" cy="10.15" r=".9" fill="currentColor"/>',
  "</svg>",
].join("");

const MARKUP = [
  '<div class="field" part="field">',
  '  <div class="row">',
  '    <button class="lock" part="lock" type="button" aria-pressed="false" aria-label="鼠标锁定拖动" title="鼠标锁定：左右无限拖动（Shift 加速 / Ctrl 精调）">',
  '      <span class="ico ico-unlocked">' + ICON_UNLOCKED + "</span>",
  '      <span class="ico ico-locked">' + ICON_LOCKED + "</span>",
  "    </button>",
  '    <div class="track" part="track" role="slider" tabindex="0" aria-label="数值" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">',
  '      <div class="rail"></div>',
  '      <div class="fill"></div>',
  '      <div class="thumb"></div>',
  "    </div>",
  '    <label class="box" part="input">',
  '      <input part="number" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" aria-label="数值输入">',
  '      <span class="unit" part="unit"></span>',
  "    </label>",
  "  </div>",
  '  <div class="toast" aria-hidden="true">',
  '    <span class="toast-ico"></span>',
  '    <span class="toast-label">鼠标已锁定</span>',
  '    <span class="sep"></span>',
  '    <b class="toast-val">0</b>',
  '    <span class="keys">Shift 加速 · Ctrl 精调 · Esc 退出</span>',
  "  </div>",
  '  <div class="sr-only" aria-live="polite"></div>',
  "</div>",
].join("");

function round6(value) {
  return Math.round(value * 1000000) / 1000000;
}

function formatDisplay(value, config) {
  if (!Number.isFinite(value)) return "";
  let places = config.decimals;
  if (Math.abs(value - Number(value.toFixed(places))) > 1e-9) {
    for (let i = places + 1; i <= 6; i++) {
      if (Math.abs(value - Number(value.toFixed(i))) < 1e-9) {
        places = i;
        break;
      }
    }
  }
  return formatNumber(value, places);
}

export class KitNumberField extends HTMLElement {
  static formAssociated = true;

  static get observedAttributes() {
    return [
      "min",
      "max",
      "step",
      "value",
      "precision",
      "unit",
      "size",
      "label",
      "aria-label",
      "disabled",
      "readonly",
    ];
  }

  constructor() {
    super();
    this._internals = typeof this.attachInternals === "function" ? this.attachInternals() : null;
    this._cfg = normalizeConfig({});
    this._value = this._cfg.min;
    this._continuous = this._value;
    this._dragging = false;
    this._drag = null;
    this._locked = false;
    this._lockStartValue = this._value;
    this._typing = false;
    this._reflecting = false;
    this._invalidTimer = 0;

    const root = this.attachShadow({ mode: "open", delegatesFocus: true });
    const style = document.createElement("style");
    style.textContent = CSS;
    root.append(style);
    const template = document.createElement("template");
    template.innerHTML = MARKUP;
    root.append(template.content);

    this._field = root.querySelector(".field");
    this._track = root.querySelector(".track");
    this._rail = root.querySelector(".rail");
    this._fill = root.querySelector(".fill");
    this._thumb = root.querySelector(".thumb");
    this._lockBtn = root.querySelector(".lock");
    this._box = root.querySelector(".box");
    this._input = root.querySelector("input");
    this._unit = root.querySelector(".unit");
    this._toast = root.querySelector(".toast");
    this._toastIcon = root.querySelector(".toast-ico");
    this._toastValue = root.querySelector(".toast-val");
    this._sr = root.querySelector(".sr-only");
    this._toastIcon.innerHTML = ICON_LOCKED;

    this._onPointerDown = this._onPointerDown.bind(this);
    this._onPointerMove = this._onPointerMove.bind(this);
    this._onPointerUp = this._onPointerUp.bind(this);
    this._onTrackKey = this._onTrackKey.bind(this);
    this._onInputKey = this._onInputKey.bind(this);
    this._onLockClick = this._onLockClick.bind(this);
    this._onLockChange = this._onLockChange.bind(this);
    this._onLockError = this._onLockError.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);

    this._bind();
  }

  connectedCallback() {
    this._syncConfig();
    this._updateAria();
    this._render();
    document.addEventListener("pointerlockchange", this._onLockChange);
    document.addEventListener("pointerlockerror", this._onLockError);
    document.addEventListener("mousemove", this._onMouseMove);
  }

  disconnectedCallback() {
    document.removeEventListener("pointerlockchange", this._onLockChange);
    document.removeEventListener("pointerlockerror", this._onLockError);
    document.removeEventListener("mousemove", this._onMouseMove);
    if (this._locked) document.exitPointerLock();
    this._stopFallbackLock(false);
    clearTimeout(this._invalidTimer);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue || this._reflecting) return;
    if (name === "value") {
      const parsed = parseNumber(newValue);
      if (Number.isFinite(parsed)) {
        this._value = quantize(parsed, this._cfg);
        this._continuous = this._value;
        this._render();
        this._syncForm(this._value);
      }
      return;
    }
    if (name === "min" || name === "max" || name === "step" || name === "precision") {
      this._syncConfig();
      return;
    }
    if (name === "unit" || name === "size" || name === "label" || name === "aria-label") {
      this._updateAria();
      this._syncInputWidth();
      this._render();
      return;
    }
    if (name === "disabled" || name === "readonly") {
      this._applyDisabledState();
      this._render();
    }
  }

  get value() {
    return this._value;
  }

  set value(value) {
    const parsed = typeof value === "number" ? value : parseNumber(value);
    if (!Number.isFinite(parsed)) return;
    this._typing = false;
    this._setValue(quantize(parsed, this._cfg), "api", true, false);
  }

  get min() {
    return this._cfg.min;
  }

  get max() {
    return this._cfg.max;
  }

  get step() {
    return this._cfg.step;
  }

  get locked() {
    return this._locked;
  }

  focus(options) {
    this._input.focus(options);
  }

  stepBy(direction, event) {
    this._step(direction, event);
  }

  _bind() {
    this._lockBtn.addEventListener("click", this._onLockClick);
    this._track.addEventListener("pointerdown", this._onPointerDown);
    this._track.addEventListener("pointermove", this._onPointerMove);
    this._track.addEventListener("pointerup", this._onPointerUp);
    this._track.addEventListener("pointercancel", this._onPointerUp);
    this._track.addEventListener("keydown", this._onTrackKey);

    this._input.addEventListener("keydown", this._onInputKey);
    this._input.addEventListener("input", () => {
      this._typing = true;
    });
    this._input.addEventListener("focus", () => {
      this._typing = false;
      this._input.select();
    });
    this._input.addEventListener("blur", () => {
      if (this._typing) this._commitInput();
    });
    this._input.addEventListener("dblclick", () => this._input.select());
  }

  _applyDisabledState() {
    const disabled = this.hasAttribute("disabled");
    const readonly = this.hasAttribute("readonly");
    this._input.disabled = disabled;
    this._input.readOnly = disabled || readonly;
    this._lockBtn.disabled = disabled;
    this._lockBtn.hidden = readonly;
    this._track.tabIndex = disabled || readonly ? -1 : 0;
    this._track.setAttribute("aria-disabled", disabled || readonly ? "true" : "false");
    if ((disabled || readonly) && this._locked) document.exitPointerLock();
  }

  _syncConfig() {
    this._cfg = normalizeConfig({
      min: this.getAttribute("min"),
      max: this.getAttribute("max"),
      step: this.getAttribute("step"),
      precision: this.getAttribute("precision"),
    });
    const attr = parseNumber(this.getAttribute("value"));
    const base = Number.isFinite(attr) ? attr : this._value;
    this._value = quantize(base, this._cfg);
    this._continuous = this._value;
    this._updateAria();
    this._syncInputWidth();
    this._applyDisabledState();
    this._render();
    this._syncForm(this._value);
  }

  _syncInputWidth() {
    const a = formatNumber(this._cfg.min, this._cfg.decimals);
    const b = formatNumber(this._cfg.max, this._cfg.decimals);
    const chars = Math.min(10, Math.max(3, a.length, b.length) + 1);
    this.style.setProperty("--nf-ch", String(chars));
  }

  _updateAria() {
    const label = this.getAttribute("label") || this.getAttribute("aria-label") || "数值";
    this._track.setAttribute("aria-label", label);
    this._input.setAttribute("aria-label", label);
    this._unit.textContent = this.getAttribute("unit") || "";
    this._applyDisabledState();
  }

  _render() {
    const config = this._cfg;
    const value = this._value;
    const span = config.max - config.min;
    const ratio = span > 0 ? clamp((value - config.min) / span, 0, 1) : 0;
    const pct = ratio * 100;
    const text = formatDisplay(value, config);
    const unit = this.getAttribute("unit") || "";

    this._fill.style.width = pct + "%";
    this._thumb.style.left = pct + "%";
    this._track.setAttribute("aria-valuemin", String(config.min));
    this._track.setAttribute("aria-valuemax", String(config.max));
    this._track.setAttribute("aria-valuenow", String(value));
    this._track.setAttribute("aria-valuetext", unit ? text + " " + unit : text);
    if (!this._typing) this._input.value = text;
    this._toastValue.textContent = text + (unit ? unit : "");
  }

  _syncForm(value) {
    if (this._internals) this._internals.setFormValue(String(value));
  }

  _emit(type, source) {
    this._syncForm(this._value);
    this._reflecting = true;
    this.setAttribute("value", String(round6(this._value)));
    this._reflecting = false;
    this.dispatchEvent(
      new CustomEvent(type, {
        detail: { value: this._value, source },
        bubbles: true,
        composed: true,
      }),
    );
  }

  _setValue(value, source, final, keepContinuous) {
    const config = this._cfg;
    const next = clamp(round6(value), config.min, config.max);
    if (!keepContinuous) this._continuous = next;
    const changed = Math.abs(next - this._value) > 1e-9;
    this._value = next;
    if (changed) {
      this._render();
      this._emit("input", source);
    }
    if (final) {
      this._render();
      this._emit("change", source);
    }
  }

  _mods(event) {
    const shift = Boolean(event && event.shiftKey);
    const ctrl = Boolean(event && (event.ctrlKey || event.metaKey));
    return { fast: shift, fine: ctrl && !shift };
  }

  _fineQuantum() {
    const config = this._cfg;
    const places = Math.min(6, Math.max(0, config.decimals + 1));
    const scale = 10 ** places;
    const q = Math.round((config.step / 10) * scale) / scale;
    return q > 0 ? q : 0.000001;
  }

  _snapTo(value, quantum) {
    const config = this._cfg;
    const snapped = config.min + Math.round((value - config.min) / quantum) * quantum;
    return clamp(round6(snapped), config.min, config.max);
  }

  _onPointerDown(event) {
    if (event.button !== 0 || this.hasAttribute("disabled") || this.hasAttribute("readonly")) return;
    event.preventDefault();
    const rect = this._rail.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const target = this._cfg.min + ratio * (this._cfg.max - this._cfg.min);
    // 按下即落点：滑块先跳到点击处，后续每一步用"上一点到当前点"的增量叠加，修饰键切换不回跳。
    this._continuous = target;
    this._unitsPerPixel = (this._cfg.max - this._cfg.min) / rect.width;
    this._drag = { id: event.pointerId, lastX: event.clientX };
    this._dragging = true;
    this._track.classList.add("is-active");
    try {
      this._track.setPointerCapture(event.pointerId);
    } catch {
      // Some embedded browsers do not support capture; dragging still works through bubbling.
    }
    this._applyDrag(event);
  }

  _onPointerMove(event) {
    if (!this._dragging || !this._drag || event.pointerId !== this._drag.id) return;
    const dx = event.clientX - this._drag.lastX;
    if (!dx) return;
    this._drag.lastX = event.clientX;
    const config = this._cfg;
    const mods = this._mods(event);
    const speed = mods.fast ? 4 : mods.fine ? 0.25 : 1;
    this._continuous = clamp(this._continuous + dx * this._unitsPerPixel * speed, config.min, config.max);
    this._applyDrag(event);
  }

  _applyDrag(event) {
    const mods = this._mods(event);
    const value = mods.fine ? this._snapTo(this._continuous, this._fineQuantum()) : quantize(this._continuous, this._cfg);
    this._setValue(value, "drag", false, true);
  }

  _onPointerUp(event) {
    if (!this._dragging || !this._drag || event.pointerId !== this._drag.id) return;
    this._dragging = false;
    this._drag = null;
    this._track.classList.remove("is-active");
    try {
      this._track.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
    this._setValue(this._value, "drag", true, false);
  }

  _onTrackKey(event) {
    if (event.altKey) return;
    const key = event.key;
    let handled = true;
    if (key === "ArrowRight" || key === "ArrowUp") {
      this._step(1, event);
    } else if (key === "ArrowLeft" || key === "ArrowDown") {
      this._step(-1, event);
    } else if (key === "PageUp") {
      this._step(10, event);
    } else if (key === "PageDown") {
      this._step(-10, event);
    } else if (key === "Home") {
      this._setValue(this._cfg.min, "keyboard", true, false);
    } else if (key === "End") {
      this._setValue(this._cfg.max, "keyboard", true, false);
    } else {
      handled = false;
    }
    if (handled) event.preventDefault();
  }

  _step(direction, event) {
    if (this.hasAttribute("disabled") || this.hasAttribute("readonly")) return;
    const mods = this._mods(event);
    const config = this._cfg;
    if (mods.fine) {
      const q = this._fineQuantum();
      const next = this._snapTo(this._value + direction * q, q);
      this._typing = false;
      this._setValue(next, "keyboard", true, false);
      return;
    }
    const amount = config.step * 10 * Math.abs(Math.trunc(direction / 10) || 1);
    const steps = mods.fast ? 10 : 1;
    const next = quantize(this._value + direction * config.step * steps, config);
    this._typing = false;
    this._setValue(next, "keyboard", true, false);
  }

  _onInputKey(event) {
    if (event.altKey) return;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      this._step(event.key === "ArrowUp" ? 1 : -1, event);
      this._input.select();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      this._commitInput();
      this._input.select();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      this._typing = false;
      this._render();
      this._input.blur();
    }
  }

  _commitInput() {
    const parsed = parseNumber(this._input.value);
    this._typing = false;
    if (!Number.isFinite(parsed)) {
      this._flashInvalid();
      this._render();
      return;
    }
    this._setValue(quantize(parsed, this._cfg), "input", true, false);
  }

  _flashInvalid() {
    clearTimeout(this._invalidTimer);
    this._field.classList.remove("is-invalid");
    void this._field.offsetWidth;
    this._field.classList.add("is-invalid");
    this._invalidTimer = setTimeout(() => this._field.classList.remove("is-invalid"), 320);
  }

  _onLockClick() {
    if (this.hasAttribute("disabled") || this.hasAttribute("readonly")) return;
    if (this._locked) {
      document.exitPointerLock();
      return;
    }
    // Pointer Lock API 被浏览器抹平时（部分内嵌视图/自动化内核），退回模拟锁定：
    // 全窗口监听移动，值持续变化，Esc 退出，行为与真锁定一致。
    if (typeof this.requestPointerLock !== "function") {
      this._startFallbackLock();
      return;
    }
    const request = (options) => {
      const result = options ? this.requestPointerLock(options) : this.requestPointerLock();
      if (result && typeof result.catch === "function") {
        result.catch(() => {
          if (options) request(null);
          else this._onLockError();
        });
      }
    };
    try {
      request({ unadjustedMovement: true });
    } catch {
      try {
        request(null);
      } catch {
        this._onLockError();
      }
    }
  }

  _onLockChange() {
    const locked = document.pointerLockElement === this;
    if (locked === this._locked) return;
    const wasLocked = this._locked;
    this._locked = locked;
    this._lockBtn.setAttribute("aria-pressed", locked ? "true" : "false");
    this._field.classList.toggle("is-locked", locked);
    this._toast.classList.toggle("is-on", locked);
    this._toast.setAttribute("aria-hidden", locked ? "false" : "true");
    if (locked) {
      this._continuous = this._value;
      this._lockStartValue = this._value;
      this._typing = false;
      this._input.blur();
      this._sr.textContent = "鼠标已锁定，左右移动调整数值。";
    } else if (wasLocked) {
      this._continuous = this._value;
      this._sr.textContent = "已退出鼠标锁定。";
      this._setValue(this._value, "lock", true, false);
    }
  }

  _startFallbackLock() {
    this._fallbackLock = true;
    this._lockBtn.setAttribute("aria-pressed", "true");
    this._field.classList.add("is-locked");
    this._toast.classList.add("is-on");
    this._toast.setAttribute("aria-hidden", "false");
    this._continuous = this._value;
    this._lockStartValue = this._value;
    this._typing = false;
    this._input.blur();
    this._sr.textContent = "鼠标已锁定（模拟模式），左右移动调整数值，Esc 退出。";
    this._onFallbackMove = (event) => {
      const delta = typeof event.movementX === "number" ? event.movementX : 0;
      if (!delta) return;
      const config = this._cfg;
      const mods = this._mods(event);
      const speed = mods.fast ? 4 : mods.fine ? 0.25 : 1;
      const units = ((config.max - config.min) / 360) * speed;
      this._continuous = clamp(this._continuous + delta * units, config.min, config.max);
      const value = mods.fine ? this._snapTo(this._continuous, this._fineQuantum()) : quantize(this._continuous, config);
      this._setValue(value, "lock", false, true);
    };
    this._onFallbackKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this._stopFallbackLock(true);
      }
    };
    document.addEventListener("mousemove", this._onFallbackMove);
    document.addEventListener("keydown", this._onFallbackKey);
  }

  _stopFallbackLock(commit) {
    if (!this._fallbackLock) return;
    this._fallbackLock = false;
    document.removeEventListener("mousemove", this._onFallbackMove);
    document.removeEventListener("keydown", this._onFallbackKey);
    this._onFallbackMove = null;
    this._onFallbackKey = null;
    this._lockBtn.setAttribute("aria-pressed", "false");
    this._field.classList.remove("is-locked");
    this._toast.classList.remove("is-on");
    this._toast.setAttribute("aria-hidden", "true");
    this._sr.textContent = "已退出鼠标锁定。";
    if (commit) this._setValue(this._value, "lock", true, false);
  }

  _onLockError() {
    // 真锁定被拒（窗口未激活、权限策略等）时，自动降级为模拟锁定，保证功能可用。
    clearTimeout(this._lockRetryTimer);
    this._lockRetryTimer = setTimeout(() => {
      if (!this._locked && !this._fallbackLock) this._startFallbackLock();
    }, 60);
  }

  _showLockErrorToast() {
    this._toast.querySelector(".toast-label").textContent = "无法锁定鼠标";
    this._toast.classList.add("is-on", "is-error");
    this._toastValue.textContent = "无法锁定";
    this._sr.textContent = "浏览器没有允许锁定鼠标，请再点一次锁按钮。";
    setTimeout(() => {
      if (!this._locked) {
        this._toast.classList.remove("is-on", "is-error");
        this._toast.querySelector(".toast-label").textContent = "鼠标已锁定";
        this._render();
      }
    }, 1600);
  }

  _onMouseMove(event) {
    if (!this._locked) return;
    const dx = event.movementX || 0;
    if (!dx) return;
    const config = this._cfg;
    const mods = this._mods(event);
    const speed = mods.fast ? 4 : mods.fine ? 0.25 : 1;
    const units = ((config.max - config.min) / 360) * speed;
    this._continuous = clamp(this._continuous + dx * units, config.min, config.max);
    const value = mods.fine ? this._snapTo(this._continuous, this._fineQuantum()) : quantize(this._continuous, config);
    this._setValue(value, "lock", false, true);
  }
}

if (!customElements.get("kit-number-field")) {
  customElements.define("kit-number-field", KitNumberField);
}
