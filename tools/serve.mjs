#!/usr/bin/env node
// Serve the repo so the gallery can load the effects as modules: node tools/serve.mjs [port]
// then open http://localhost:8080/gallery/

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { join, extname, normalize, sep } from "node:path";
import { ROOT } from "./lib/fxlib.mjs";

const PORT = +(process.argv[2] ?? 8080);
// the root page: pick a destination
const HOME = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>pixelfx</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Funnel+Sans:wght@400;500&family=Red+Hat+Mono:wght@400;500&display=swap">
<style>
@font-face { font-family: "Patch Pixel"; font-weight: 400; font-display: swap; src: url(/gallery/fonts/PatchPixel-Regular.woff2) format("woff2"); }
:root { --ground: #000; --ink: #fff; --quiet: #999; --line: #333; --patch: #f53cd1; --display: "Patch Pixel", ui-monospace, monospace; --mono: "Red Hat Mono", ui-monospace, monospace; color-scheme: dark; }
* { box-sizing: border-box; }
html { background: var(--ground); }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--ground); color: var(--ink); font: 400 15px/1.5 system-ui, sans-serif; }
.home { width: min(680px, calc(100vw - 48px)); }
h1 { margin: 0 0 4px; font: 400 54px/60px var(--display); }
p.sub { margin: 0 0 40px; color: var(--quiet); }
.cards { display: grid; gap: 14px; }
.card { display: block; border: 1px solid var(--line); padding: 22px 24px; text-decoration: none; }
.card:hover, .card:focus-visible { border-color: var(--ink); }
.card b { display: block; font: 400 24px/28px var(--display); }
.card small { display: block; margin-top: 6px; font: 400 12px/1.5 var(--mono); color: var(--quiet); letter-spacing: 0.04em; }
.card small::after { content: "\\u2192"; margin-left: 10px; color: var(--patch); }
</style>
</head>
<body>
<div class="home">
<h1>pixelfx.</h1>
<p class="sub">pixel art effects and animation, as code.</p>
<div class="cards">
<a class="card" href="/gallery/"><b>gallery</b><small>every effect, playing live</small></a>
<a class="card" href="/editor/"><b>rig editor</b><small>drag the skeleton, export poses</small></a>
</div>
</div>
</body>
</html>`;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".gif": "image/gif",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".md": "text/plain; charset=utf-8", ".mp4": "video/mp4",
};

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path === "/") return res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(HOME);
  // POST /api/reload: regenerate the effect registry, then tell the caller. gallery's reload
  // button hits this, waits for the reply, and refreshes the page.
  if (path === "/api/reload" && req.method === "POST") {
    const started = Date.now();
    try {
      await new Promise((ok, no) => execFile(process.execPath, [join(ROOT, "tools", "index.mjs")], { cwd: ROOT }, (e, so, se) => (e ? no(se || e) : ok(so))));
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      return res.end(JSON.stringify({ ok: true, ms: Date.now() - started }));
    } catch (e) {
      res.writeHead(500, { "content-type": "application/json", "cache-control": "no-store" });
      return res.end(JSON.stringify({ ok: false, error: String(e.message ?? e) }));
    }
  }
  if (path.endsWith("/")) path += "index.html";
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT + sep)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(PORT, () => console.log(`gallery: http://localhost:${PORT}/gallery/`));
