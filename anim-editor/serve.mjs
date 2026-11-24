#!/usr/bin/env node
// anim-editor 独立服务: node serve.mjs [port]
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, extname, normalize, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = +(process.argv[2] ?? 8610);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".gif": "image/gif", ".jpg": "image/jpeg" };

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  let path = decodeURIComponent(url.pathname);
  // 保存/载入项目 JSON
  if (path === "/api/project" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => body += c);
    req.on("end", async () => {
      try {
        await mkdir(join(HERE, "data"), { recursive: true });
        await writeFile(join(HERE, "data", "project.json"), body);
        res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
      } catch (e) { res.writeHead(500).end(String(e.message)); }
    });
    return;
  }
  if (path === "/api/project" && req.method === "GET") {
    try {
      const body = await readFile(join(HERE, "data", "project.json"));
      res.writeHead(200, { "content-type": "application/json" }).end(body);
    } catch { res.writeHead(404).end("{}"); }
    return;
  }
  if (path === "/") path = "/index.html";
  if (path.endsWith("/")) path += "index.html";
  // /pixelfx/* 映射到仓库的 src/（浏览器 import fx 模块用）
  let base = HERE, rel = path;
  if (path.startsWith("/pixelfx/")) { base = join(HERE, "..", "src"); rel = path.slice("/pixelfx".length); }
  const file = normalize(join(base, rel));
  if (!file.startsWith(base + sep) && file !== join(base, "index.html")) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" }).end(body);
  } catch { res.writeHead(404).end("not found"); }
}).listen(PORT, () => console.log("anim-editor: http://localhost:" + PORT + "/"));
