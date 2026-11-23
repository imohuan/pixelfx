#!/usr/bin/env node
// skeleton-lab standalone service: node serve.mjs [port]
// After starting, open http://localhost:8787/ (defaults to 8787)

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = +(process.argv[2] ?? 8787);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".md": "text/plain; charset=utf-8",
};

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path === "/") path = "/play.html";
  if (path.endsWith("/")) path += "index.html";
  const file = normalize(join(HERE, path));
  if (!file.startsWith(HERE + sep)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(PORT, () => console.log("skeleton-lab: http://localhost:" + PORT + "/"));
