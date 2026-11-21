#!/usr/bin/env node
// Generate demo/docs/04-cases.md from real effect files, so the examples in the docs are exactly what is in
// src/fx — not hand-rewritten versions that drift.
//
//   node demo/make-cases.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const read = (id) => {
  const src = readFileSync(join(ROOT, "src", "fx", id + ".js"), "utf8");
  const out = src
    .replace(/^\s*import\s+[^;]*?from\s*["'][^"']+["']\s*;?\s*$/gm, "")
    .replace(/\bexport\s+(const|let|var|function|class)\s+/g, "$1 ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return out;
};

const metaOf = (id) => {
  const s = readFileSync(join(ROOT, "src", "fx", id + ".js"), "utf8");
  const grab = (k) => (s.match(new RegExp(k + ': "([^"]+)')) ?? [])[1];
  const size = (s.match(/size: \[[^\]]+\]/) ?? [""])[0].replace("size: ", "");
  const dur = (s.match(/duration: [\d.]+/) ?? [""])[0].replace("duration: ", "");
  return { name: grab("name"), size, dur };
};

const CASES = [
  {
    id: "impacts/crit-hit",
    kind: "模拟型（create + 手写粒子状态）",
    zh: "暴击命中：比普通命中更重的一击——更大的十字闪光、碎裂的环、地刺弹出、碎屑与火星四溅。带 0.1 秒命中顿帧。",
    notes: [
      "create(o) 里用 new Rng(o.seed) 生成一次性的形状参数（地刺的位置、环的缺口、碎屑的轨迹），存进闭包，draw 每帧按已过时间画对应阶段——同种子永远同画面。",
      "Particles 和 Bits 两个容器分工：粒子管火星（自带重力和落地反弹），Bits 管方块碎屑（翻转、弹跳、停在地上）。",
      "spikes / star / brokenRing 来自 impacts/_lib.js，是命中类特效的现成画法：地刺、星芒、碎裂的环。",
      "阶段划分是打击感的关键：闪光帧、膨胀帧、消散帧各有各的画法，而不是一个形状缩放到底。",
    ],
  },
  {
    id: "scifi/glitch",
    kind: "纯函数型（draw，逐像素处理角色）",
    zh: "信号故障：小人的信号间歇性炸裂——RGB 分离、横向撕裂、行错位、色块噪声、坏像素飞散，然后恢复清晰。2.4 秒循环。",
    notes: [
      "meta.actor: 2 且声明了 act.onBody: true，运行时会把标准小人交给特效：draw 收到的 o.actor 是角色的像素数据 { x, y, w, h, pixels, mask }，特效自己决定画成什么样（这里逐行撕裂重画）。",
      "actorAlpha = () => 0 让运行时不再画干净的小人——画面上只有故障版本。",
      "BURSTS 声明三次爆发的 [起帧, 止帧, 强度]；每帧 rand(S, f, ...) 取随机，f 是帧号，所以 seek 到任何时刻画面一致。",
      "纯函数型的极致用法：不画自己的东西，而是逐像素改写角色本身。",
    ],
  },
  {
    id: "impacts/hit-spark",
    kind: "模拟型（create + 手写粒子状态）",
    zh: "命中火花：沿打击方向的一道长虹、白色菱形核心、锥形火花与碎屑落地弹跳。0.5 秒一次性。",
    notes: [
      "手写模拟型的范本：create(o) 里用 new Rng(o.seed) 生成一次性的形状参数（每道射线的角度、长度、粗细），存进闭包，draw 每帧按已过时间画对应阶段。",
      "Particles({ rng, ground }) 的粒子自带重力、落地反弹；P.SPARK 是线状火花，P.GRIT 是碎屑。",
      "lights.add(...) 三个光源分层爆闪；draw 里用 Math.exp(-t / 0.045) 做光的指数衰减。",
      "阶段划分：t<0.025 全十字闪光，t<0.058 十字变细变长，t<0.092 只剩主射线烧尽——每一阶段画法都不同，这是打击感的关键。",
    ],
  },
];

const fence = (s) => "```js\n" + s + "\n```";

// One line at the bottom of every case: the runtime reads `fx`, so give it a single name no matter what the
// source file called its pieces (some are meta+draw, some meta+create).
const fxLine = (id) => {
  const src = readFileSync(join(ROOT, "src", "fx", id + ".js"), "utf8");
  const parts = ["meta"];
  if (/export function draw/.test(src)) parts.push("draw");
  if (/export function create/.test(src) || /export const create =/.test(src)) parts.push("create");
  if (/export const act/.test(src)) parts.push("act");
  if (/export const actorAlpha/.test(src)) parts.push("actorAlpha");
  return "const fx = { " + parts.join(", ") + " };";
};

let md = "\n## 7. 案例（全部来自仓库现成特效）\n\n";
md += "以下案例的代码**就是 src/fx 里的源文件**，只去掉了 import 行和 export 关键字，一个字没改。\n";
md += "每类特效配了两种运行方式：粘进 HTML 直接跑，或用生成器一键出独立页面。\n\n";
md += "两种特效形态都覆盖了：\n\n| 案例 | 形态 | 一句话 |\n| --- | --- | --- |\n";
md += CASES.map((c) => "| " + metaOf(c.id).name + " | " + c.kind.split("（")[0] + " | " + c.zh.slice(0, 30) + "… |").join("\n");
md += "\n\n---\n";

for (const [i, c] of CASES.entries()) {
  const m = metaOf(c.id);
  md += "\n### 案例 " + String.fromCharCode(65 + i) + " — " + m.name + "（src/fx/" + c.id + ".js）\n\n";
  md += "**" + c.zh + "**\n\n";
  md += "| 项 | 值 |\n| --- | --- |\n| 尺寸 | " + m.size + " |\n| 时长 | " + m.dur + " 秒 |\n| 形态 | " + c.kind + " |\n\n";
  md += "**实现要点**\n\n" + c.notes.map((n) => "- " + n).join("\n") + "\n\n";
  md += "粘进 HTML 时，把下面这行加在代码块末尾（运行时读 `fx` 这个名字）：\n\n" + fence(read(c.id) + "\n\n// —— 运行时读这个名字 ——\n" + fxLine(c.id)) + "\n\n";
  md += "一键生成独立页面：\n\n```bash\nnode demo/make-page.mjs " + c.id + " --out " + c.id.split("/")[1] + ".html\n```\n\n---\n";
}

md += "\n### 想要更多？\n\n仓库里有 246 个现成特效，全部可以这样搬：\n\n```bash\nnode tools/list.mjs fire            # 按关键词过滤\ncat docs/CATALOG.md                 # 全量目录（id / 尺寸 / 时长 / 描述）\nnode demo/make-page.mjs <分类>/<名字> --out 页面.html\n```\n";

writeFileSync(join(HERE, "docs", "04-cases.md"), md);
console.log("demo/docs/04-cases.md  (" + (md.length / 1024).toFixed(1) + " KB, " + CASES.length + " cases)");
