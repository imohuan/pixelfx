#!/usr/bin/env node
// Merge demo/docs/*.md (in filename order) into docs/INTEGRATION.md, so the shards stay editable and the
// single file handed to a third party always exists.
//
//   node demo/build-docs.mjs

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const dir = join(HERE, "docs");

const parts = readdirSync(dir)
  .filter((f) => f.endsWith(".md"))
  .sort()
  .map((f) => readFileSync(join(dir, f), "utf8").trim());

if (!parts.length) {
  console.error("no .md shards in demo/docs/");
  process.exit(1);
}

const out = join(ROOT, "docs", "INTEGRATION.md");
writeFileSync(out, parts.join("\n\n") + "\n");
console.log(`${parts.length} shards -> docs/INTEGRATION.md  (${(parts.reduce((n, p) => n + p.length, 0) / 1024).toFixed(1)} KB)`);
