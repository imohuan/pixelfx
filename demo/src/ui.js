// The whole visible page, built by the script. A demo HTML carries one script holding `fx`; everything
// else — header, stage, controls, facts, the note — comes from here.
//
// Style follows docs/UI-STYLE.md: one dark theme, black ground, no rounded corners, borders only,
// mono labels at 11–13px with 0.04em tracking, brand pink used sparingly.

const CSS = `
@font-face { font-family: "Patch Pixel"; font-weight: 400; font-display: swap; src: url(__FONT__) format("woff2"); }
:root {
  --ground: #000000; --panel: #111111; --stage: #15131d;
  --ink: #ffffff; --quiet: #999999; --line: #333333; --patch: #f53cd1;
  --display: "Patch Pixel", ui-monospace, "SFMono-Regular", monospace;
  --text: "Funnel Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "Red Hat Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;
  color-scheme: dark;
}
* { box-sizing: border-box; }
html, body { height: 100%; }
body {
  margin: 0; background: var(--ground); color: var(--ink);
  font: 400 15px/1.5 var(--text);
  display: flex; flex-direction: column; min-height: 100%;
  padding-left: max(16px, env(safe-area-inset-left, 0px));
  padding-right: max(16px, env(safe-area-inset-right, 0px));
  padding-bottom: 28px;
}
a { color: inherit; }
button, input { font: inherit; color: inherit; }
:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }

.fx-head { max-width: 1240px; width: 100%; margin: 0 auto; padding-block: 30px 18px; }
.fx-title { display: flex; gap: 16px; align-items: flex-start; }
.fx-mark { width: 40px; height: 40px; flex: none; image-rendering: pixelated; margin-top: 5px; }
.fx-head h1 { margin: 0; font: 400 46px/56px var(--display); letter-spacing: -0.01em; }
.fx-sub { margin: 4px 0 0; color: var(--quiet); font: 500 16px/1.45 var(--text); max-width: 70ch; }

main { flex: 1; width: 100%; max-width: 1240px; margin: 0 auto; display: flex; flex-direction: column; }
.fx-stage {
  flex: 1; background: var(--stage); border: 1px solid var(--line);
  display: grid; place-items: center; overflow: hidden;
  min-height: 320px; padding: 16px;
}
.fx-stage canvas { display: block; image-rendering: pixelated; }
.fx-stage.is-clear { background: transparent; }

.fx-bar {
  display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
  padding-block: 12px; border-bottom: 1px solid var(--line);
}
.fx-btn, .fx-chip {
  flex: none; border: 1px solid var(--line); background: none; padding: 6px 10px;
  font: 500 12px/1 var(--mono); letter-spacing: 0.04em; cursor: pointer; border-radius: 0;
}
.fx-btn:hover, .fx-chip:hover { border-color: var(--quiet); }
.fx-btn[aria-pressed="true"], .fx-chip[aria-pressed="true"] { background: var(--ink); color: var(--ground); border-color: var(--ink); }
.fx-lbl { color: var(--quiet); font: 400 11px/1 var(--mono); letter-spacing: 0.04em; margin-left: 8px; }
.fx-seek { flex: 1; min-width: 120px; accent-color: var(--ink); }

.fx-facts {
  display: grid; grid-template-columns: max-content 1fr; gap: 2px 16px;
  margin: 14px 0 0; font: 400 12px/1.8 var(--mono); letter-spacing: 0.04em;
}
.fx-facts dt { color: var(--quiet); }
.fx-facts dd { margin: 0; font-variant-numeric: tabular-nums; }

.fx-note { margin: 18px 0 0; border-top: 1px solid var(--line); padding-top: 18px; }
.fx-note summary {
  cursor: pointer; color: var(--quiet); font: 500 12px/1.4 var(--mono); letter-spacing: 0.04em;
  list-style: none; user-select: none;
}
.fx-note summary::-webkit-details-marker { display: none; }
.fx-note summary::before { content: "+ "; color: var(--patch); }
.fx-note[open] summary::before { content: "− "; }
.fx-note summary:hover { color: var(--ink); }
.fx-note p { margin: 12px 0 10px; max-width: 70ch; }
.fx-note code { font: 400 13px/1.5 var(--mono); background: var(--panel); padding: 1px 5px; border: 1px solid var(--line); }
.fx-note pre {
  margin: 0; background: var(--panel); border: 1px solid var(--line); padding: 14px 16px;
  overflow: auto; font: 400 12px/1.7 var(--mono); color: var(--quiet);
}

@media (max-width: 900px) {
  .fx-head h1 { font-size: 32px; line-height: 40px; }
  .fx-head { padding-block: 22px 14px; }
  .fx-mark { width: 28px; height: 28px; }
}
`;

const MARK = '<svg class="fx-mark" viewBox="0 0 7 7" shape-rendering="crispEdges" role="img" aria-label="Patch">' +
  '<rect x="1" y="1" width="6" height="6" fill="#ffffff"/><rect x="0" y="0" width="3" height="3" fill="#f53cd1"/></svg>';

const BG = [
  ["stage", "舞台"],
  ["none", "透明"],
  ["black", "纯黑"],
  ["dark", "暗"],
  ["ground", "地面"],
];

const SCALES = [1, 2, 3, 4, 6, 8];

const el = (tag, props = {}, kids = []) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const kid of [].concat(kids)) if (kid) node.append(kid);
  return node;
};

const press = (node, on) => node.setAttribute("aria-pressed", String(!!on));

/** Build the page around a canvas and return the parts the boot code drives. */
export function buildShell(meta) {
  // Resolve the font next to the bundle, wherever the page that loaded it lives. The last classic script
  // on the page is this bundle, which works for both the script-tag and module builds.
  const scripts = [...document.querySelectorAll("script[src]")];
  const base = scripts.length ? scripts[scripts.length - 1].src : location.href;
  const font = new URL("fonts/PatchPixel-Regular.woff2", base).href;
  const style = el("style", { textContent: CSS.replace("__FONT__", font) });
  document.head.append(style);
  document.documentElement.lang = "zh-CN";
  document.title = `${meta.name ?? "pixelfx"} — pixelfx`;

  const desc = el("meta", { name: "description" });
  desc.content = meta.desc ?? "";
  document.head.append(desc);

  const canvas = el("canvas");
  canvas.setAttribute("data-pixelfx", "");
  const stage = el("div", { className: "fx-stage" }, canvas);

  const head = el("header", { className: "fx-head" }, [
    el("div", { className: "fx-title" }, [
      el("div", { innerHTML: MARK }),
      el("div", {}, [
        el("h1", { textContent: meta.name ?? "pixelfx" }),
        el("p", { className: "fx-sub", textContent: meta.desc ?? "" }),
      ]),
    ]),
  ]);

  // controls
  const replay = el("button", { className: "fx-btn", type: "button", textContent: "重播" });
  const pause = el("button", { className: "fx-btn", type: "button", textContent: "暂停" });
  press(pause, true);

  const bgButtons = BG.map(([id, label]) => {
    const b = el("button", { className: "fx-chip", type: "button", textContent: label });
    b.dataset.bg = id;
    press(b, id === "stage");
    return b;
  });

  const scaleButtons = SCALES.map((k) => {
    const b = el("button", { className: "fx-chip", type: "button", textContent: `${k}x` });
    b.dataset.scale = String(k);
    press(b, k === 4);
    return b;
  });

  const flip = el("button", { className: "fx-chip", type: "button", textContent: "镜像" });
  press(flip, false);

  const sheet = el("button", { className: "fx-chip", type: "button", textContent: "精灵图" });
  const seek = el("input", { className: "fx-seek", type: "range", min: 0, max: 1, step: 0.001, value: 0 });
  seek.setAttribute("aria-label", "进度");

  const bar = el("div", { className: "fx-bar" }, [
    replay,
    pause,
    el("span", { className: "fx-lbl", textContent: "背景" }),
    ...bgButtons,
    el("span", { className: "fx-lbl", textContent: "大小" }),
    ...scaleButtons,
    flip,
    sheet,
    seek,
  ]);

  // facts: filled in once the player exists
  const facts = el("dl", { className: "fx-facts" });

  // the note explains the format this page is in; it is generated, not hand-written in the HTML
  const note = el("details", { className: "fx-note" }, [
    el("summary", { textContent: "这个网页的 HTML 里只有一段特效代码" }),
    el("p", {
      innerHTML:
        "整个页面由 <code>pixelfx.js</code> 生成：标题、舞台、按钮、进度条都在入口脚本里。" +
        "你的网页只需要引入它，再写一个 <code>fx</code> 对象。",
    }),
    el("pre", {
      textContent: [
        '<script src="pixelfx.js"></script>',
        "",
        "<script>",
        "const fx = {",
        '  meta: { name: "Spark", size: [64, 64], origin: [32, 56], duration: 1, loop: true },',
        "  draw(p, t) {",
        '    p.glow(0, -10, 20 * (1 - t), hex("#ffd166"), 1 - t);',
        "  },",
        "};",
        "</script>",
      ].join("\n"),
    }),
  ]);

  const main = el("main", {}, [stage, bar, facts, note]);
  document.body.replaceChildren(head, main);

  return { canvas, stage, bar, facts, note, replay, pause, bgButtons, scaleButtons, flip, sheet, seek };
}

/** Fill the facts list from what the player reports. */
export function showFacts(facts, { id, meta, player }) {
  const [w, h] = meta.size;
  const rows = [
    ["effect", id || meta.name],
    ["canvas", `${w} × ${h} px`],
    ["time", `${+(meta.duration ?? 1).toFixed(2)}s @ ${meta.fps ?? 30} fps`],
    ["kind", meta.loop ? "loop" : "one-shot"],
    ["scale", `${player.scale}x`],
  ];
  facts.replaceChildren(...rows.flatMap(([k, v]) => [el("dt", { textContent: k }), el("dd", { textContent: String(v) })]));
}

/** Integer scale that fits the stage, so pixels stay square whatever the window does. */
export function fitScale(stage, meta) {
  const box = stage.getBoundingClientRect();
  const [w, h] = meta.size;
  if (!box.width || !box.height) return 4;
  const room = Math.floor(Math.min((box.width - 36) / w, (box.height - 36) / h));
  return Math.max(1, Math.min(room || 1, 8));
}
