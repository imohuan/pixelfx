#!/usr/bin/env node
// Verify the code examples in demo/docs actually run. Each ```js block that declares meta + draw/create is
// evaluated with the kit as globals; blocks whose source references other effect modules (import * as x)
// get those real modules injected under the names the source uses, exactly as the bundler would.
//
//   node demo/check-docs.mjs

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const core = await import(pathToFileURL(join(ROOT, "src", "core", "index.js")).href);
const { kit } = await import(pathToFileURL(join(HERE, "src", "kit.js")).href);
Object.assign(globalThis, core, kit);

// every effect module, by id, for resolving cross-effect imports
const FX = {};
for (const cat of readdirSync(join(ROOT, "src", "fx"))) {
  const dir = join(ROOT, "src", "fx", cat);
  try {
    for (const f of readdirSync(dir)) if (f.endsWith(".js") && !f.startsWith("_")) {
      FX[`${cat}/${f.slice(0, -3)}`] = await import(pathToFileURL(join(dir, f)).href);
    }
  } catch {}
}

// id -> source, so a doc block can be traced back to its file (the generator leaves a `// <id>` comment)
const SRC = {};
for (const [id, mod] of Object.entries(FX)) {
  try {
    SRC[id] = readFileSync(join(ROOT, "src", "fx", id + ".js"), "utf8");
  } catch {}
}

const dir = join(HERE, "docs");
const shards = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();

let checked = 0, failed = 0;
for (const shard of shards) {
  const md = readFileSync(join(dir, shard), "utf8");
  const blocks = [...md.matchAll(/```js\n([\s\S]*?)```/g)].map((m) => m[1]);
  for (const [bi, code] of blocks.entries()) {
    const runnable = /(function\s+(draw|create)|const\s+create\s*=)/.test(code) && /const (fx|meta) =/.test(code) && /const fx =/.test(code);
    if (!runnable) continue;
    checked++;
    const label = `${shard} block ${bi + 1}`;
    try {
      // find the effect id this block came from: match its meta against the files on disk
      const nameMatch = code.match(/name: "([^"]+)"/);
      const id = nameMatch && Object.keys(SRC).find((id) => SRC[id].includes(`name: "${nameMatch[1]}"`));
      const env = {};
      if (id) {
        for (const [, name, path] of SRC[id].matchAll(/import \* as (\w+) from "([^"]+)"/g)) {
          const hit = path.match(/fx\/([\w-]+)\/([\w-]+)\.js/);
          if (hit) env[name] = FX[`${hit[1]}/${hit[2]}`];
        }
      }
      const fn = new Function(
        ...Object.keys(env),
        `${code}\n;return fx;`,
      )(...Object.values(env));
      if (!fn?.meta) throw new Error("no meta");
      if (!fn.draw && !fn.create) throw new Error("neither draw nor create");
      const meta = { fps: 30, duration: 1, loop: false, size: [64, 64], origin: [0, 0], options: {}, ...fn.meta };
      const inst = core.createFx(fn, { x: meta.origin[0], y: meta.origin[1], ...meta.options });
      const frames = Math.max(1, Math.round(meta.duration * meta.fps));
      let lit = 0;
      for (let i = 0; i < Math.min(frames, 30); i++) {
        if (i) inst.update(1 / meta.fps);
        const frame = core.createFrame(meta.size[0], meta.size[1]);
        inst.draw(frame);
        const rgba = core.composite(frame, new Uint8ClampedArray(meta.size[0] * meta.size[1] * 4), null);
        for (let k = 3; k < rgba.length; k += 4) if (rgba[k]) lit++;
      }
      if (!lit) throw new Error("nothing drawn");
      console.log(`ok    ${label}  (${meta.name}, ${lit} px)`);
    } catch (e) {
      failed++;
      console.error(`FAIL  ${label}  ${e.message}`);
    }
  }
}

console.log(`${checked} examples checked, ${failed} failed`);
process.exit(failed ? 1 : 0);
