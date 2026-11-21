#!/usr/bin/env node
// Draw the demo page's effect without a browser: read demo/index.html, evaluate its script with the kit as
// globals (exactly what the bundle does), and count pixels. Exits non-zero when nothing is drawn.
//
//   node demo/verify.mjs

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const core = await import(pathToFileURL(join(ROOT, "src", "core", "index.js")).href);
const { kit } = await import(pathToFileURL(join(HERE, "src", "kit.js")).href);

const html = readFileSync(join(HERE, "index.html"), "utf8");
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
if (!script.trim()) throw new Error("demo/index.html has no inline script");

// The kit is spread onto globalThis the way installKit does it, so effect-local names (a file's own `const P`)
// keep their own scope instead of colliding with a kit parameter.
Object.assign(globalThis, core, kit);
const fx = new Function(
  `${script}\n;return { meta: typeof meta !== "undefined" ? meta : null, draw: typeof draw !== "undefined" ? draw : null, create: typeof create !== "undefined" ? create : null };`
)();

if (!fx.meta) throw new Error("the page declares no meta");
if (!fx.draw && !fx.create) throw new Error("the page declares neither draw nor create");

const meta = { fps: 30, duration: 1, loop: false, size: [64, 64], origin: [0, 0], options: {}, ...fx.meta };
const [W, H] = meta.size;
const inst = core.createFx(fx, { x: meta.origin[0], y: meta.origin[1], ...meta.options });
const frames = Math.max(1, Math.round(meta.duration * meta.fps));

let lit = 0, sample = 0;
for (let i = 0; i < frames; i++) {
  if (i) inst.update(1 / meta.fps);
  const frame = core.createFrame(W, H);
  inst.draw(frame);
  const rgba = core.composite(frame, new Uint8ClampedArray(W * H * 4), null);
  let n = 0;
  for (let k = 3; k < rgba.length; k += 4) if (rgba[k]) n++;
  lit += n;
  sample = Math.max(sample, n);
}

console.log(`${meta.name}: ${frames} frames, ${W}x${H}, busiest frame ${sample} px, ${lit} px over the run`);
if (!lit) {
  console.error("nothing drawn");
  process.exit(1);
}
