// The only entry. demo/build.mjs bundles this into demo/pixelfx.js.
//
// After it loads, a page is one plain script holding `fx`. Every name an effect file imports from src/core
// and the fx kits is already global, so an effect body can be used as it is.

import { kit } from "./kit.js";
import { create, drawTo, toDataURL, withDefaults } from "./player.js";
import { buildShell, fitScale, showFacts } from "./ui.js";

/** Every name an effect may use without importing it. */
export { kit };

// Built by demo/build.mjs alongside kit.js.

const OWN = new Set(["meta", "draw", "drawBack", "create", "act", "update"]);

/** Publish the kit on window, skipping names an effect defines itself. */
export function installKit(target = globalThis) {
  for (const [name, value] of Object.entries(kit)) if (!OWN.has(name)) target[name] = value;
}

/** The effect object a page declares as `const fx = { meta, draw }`. */
function readFx() {
  if (typeof window !== "undefined" && window.fx) return window.fx;
  for (const s of document.querySelectorAll("script:not([src])")) {
    const text = s.textContent;
    if (!text || !/\bmeta\b/.test(text)) continue;
    try {
      // A top-level const is not on window, so the script's own text is evaluated and its declarations read
      // back. An effect file's shape (meta + draw, or meta + create) is what counts, not the variable name.
      const found = new Function(`${text}\n;return typeof fx !== "undefined" && fx ? fx : null;`)();
      if (found && (found.draw || found.create)) return found;
      const parts = new Function(
        `${text}\n;return { meta: typeof meta !== "undefined" ? meta : undefined, draw: typeof draw !== "undefined" ? draw : undefined, drawBack: typeof drawBack !== "undefined" ? drawBack : undefined, create: typeof create !== "undefined" ? create : undefined, act: typeof act !== "undefined" ? act : undefined };`
      )();
      if (parts.meta && (parts.draw || parts.create)) return parts;
    } catch {
      /* a syntax error is already reported by the browser */
    }
  }
  return null;
}

/**
 * Build the page around `fx` and play it. The tab, stage, controls and note all come from ui.js, so the
 * HTML of a demo stays one script.
 */
export function shell(input = readFx(), opts = {}) {
  if (!input) throw new Error("pixelfx: no effect found. Declare one with `const fx = { ... }` or `window.fx = { ... }`.");
  const mod = { ...input, meta: withDefaults(input.meta) };
  const meta = mod.meta;
  const ui = buildShell(meta);

  let background = "stage";
  let scale = opts.scale ?? fitScale(ui.stage, meta);
  const press = (node, on) => node.setAttribute("aria-pressed", String(!!on));

  let player = create(ui.canvas, mod, { ...opts, scale, background: "none", loop: true });

  const sync = () => {
    showFacts(ui.facts, { meta, player });
    ui.seek.max = player.duration;
    for (const b of ui.scaleButtons) press(b, +b.dataset.scale === player.scale);
  };
  sync();

  const tick = setInterval(() => (ui.seek.value = player.t), 100);

  ui.seek.addEventListener("input", (e) => player.seek(+e.target.value));
  ui.replay.addEventListener("click", () => player.restart());
  ui.pause.addEventListener("click", (e) => {
    player.toggle();
    e.currentTarget.textContent = player.playing ? "暂停" : "播放";
    press(e.currentTarget, player.playing);
  });
  ui.flip.addEventListener("click", (e) => {
    const on = e.currentTarget.getAttribute("aria-pressed") !== "true";
    press(e.currentTarget, on);
    player.setOptions({ flip: on });
  });
  for (const b of ui.bgButtons)
    b.addEventListener("click", () => {
      background = b.dataset.bg;
      for (const x of ui.bgButtons) press(x, x === b);
      ui.stage.classList.toggle("is-clear", background === "none");
      player.setOptions({ background: background === "stage" ? "none" : background });
    });
  for (const b of ui.scaleButtons)
    b.addEventListener("click", () => {
      scale = +b.dataset.scale;
      for (const x of ui.scaleButtons) press(x, x === b);
      player.resize(scale);
      sync();
    });
  ui.sheet.addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = toDataURL(mod, { scale: 2 });
    a.download = (meta.name ?? "effect").replace(/\s+/g, "-").toLowerCase() + ".png";
    a.click();
  });

  // an integer scale that fits the stage, kept on resize
  addEventListener("resize", () => {
    if (opts.scale) return;
    player.resize(fitScale(ui.stage, meta));
    sync();
  });

  player.release = () => clearInterval(tick);
  return player;
}

/** Play an effect on a canvas you already own, without the demo page. */
export function play(canvas, input = readFx(), opts = {}) {
  const el = typeof canvas === "string" ? document.querySelector(canvas) : canvas;
  if (!el) throw new Error("pixelfx: no canvas.");
  if (!input) throw new Error("pixelfx: no effect to play.");
  return create(el, { ...input, meta: withDefaults(input.meta) }, opts);
}

/** What the script publishes. */
export const pixelfx = { shell, play, installKit, kit, withDefaults, drawTo, toDataURL };

if (typeof window !== "undefined") {
  installKit(window);
  window.pixelfx = pixelfx;
}

// A demo page holds nothing but `const fx = {...}`, so mounting is automatic.
function autoMount() {
  if (document.body?.hasAttribute("data-pixelfx-manual")) return;
  if (!readFx()) return;
  try {
    shell(readFx(), {});
  } catch (e) {
    console.error(e);
    const box = document.createElement("pre");
    box.style.cssText = "color:#ff6b6b;font:12px/1.6 ui-monospace,monospace;padding:16px;white-space:pre-wrap";
    box.textContent = String(e?.message ?? e);
    document.body.append(box);
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoMount, { once: true });
  else autoMount();
}
