#!/usr/bin/env node
// Write a demo page holding one existing effect, exactly as it is in src/fx.
//
//   node demo/make-page.mjs                       -> demo/index.html from lightning/ball-lightning
//   node demo/make-page.mjs fire/torch            -> any effect
//   node demo/make-page.mjs fire/torch --out x.html
//
// The page is a template: doctype, the bundle, and the effect's own source with `export` dropped so the
// drawing functions are plain declarations. Nothing about the effect is rewritten.

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
const out = outAt >= 0 ? args[outAt + 1] : join(HERE, "index.html");
const id = args.find((a, i) => !a.startsWith("--") && i !== outAt + 1) ?? "lightning/ball-lightning";

const src = readFileSync(join(ROOT, "src", "fx", id + ".js"), "utf8");

// import lines are not needed (the kit is global); `export` goes, because the page declares plain names
const body = src
  .replace(/^\s*import\s+[^;]*?from\s*["'][^"']+["']\s*;?\s*$/gm, "")
  .replace(/\bexport\s+default\s+/g, "")
  .replace(/\bexport\s+(const|let|var|function|class)\s+/g, "$1 ")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

const page = `<!doctype html>
<script src="pixelfx.js"></script>
<script>
// ${id}
${body}
</script>
`;

writeFileSync(out, page);
console.log(`${out.slice(ROOT.length + 1)}  <-  src/fx/${id}.js  (${src.split("\n").length} lines)`);
