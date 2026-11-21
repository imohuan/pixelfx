#!/usr/bin/env node
// Serve the repo so the gallery can load the effects as modules: node tools/serve.mjs [port]
// then open http://localhost:8080/gallery/

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { join, extname, normalize, sep } from "node:path";
import { ROOT } from "./lib/fxlib.mjs";

const PORT = +(process.argv[2] ?? 8080);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".gif": "image/gif",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".md": "text/plain; charset=utf-8", ".mp4": "video/mp4",
};

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path === "/") return res.writeHead(302, { location: "/gallery/" }).end();
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
