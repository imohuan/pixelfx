// CDP 自动化验证（不依赖浏览器扩展）：headless Chrome + 原生 WebSocket。
import { spawn } from "node:child_process";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9333;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  "--headless=new", "--remote-debugging-port=" + PORT,
  "--user-data-dir=" + process.env.TEMP + "\\animfx-cdp-profile",
  "--window-size=1920,1080", "http://localhost:8610/",
], { stdio: "ignore" });

let targets = null;
for (let i = 0; i < 30; i++) {
  await sleep(500);
  try {
    const res = await fetch("http://127.0.0.1:" + PORT + "/json");
    targets = await res.json();
    if (targets.some(t => t.type === "page")) break;
  } catch {}
}
if (!targets) { console.error("CDP not reachable"); chrome.kill(); process.exit(1); }
const page = targets.find(t => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);

let id = 0;
const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const cdp = (method, params = {}) => new Promise((resolve) => {
  const mid = ++id;
  pending.set(mid, resolve);
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evaluate = async (expr) => {
  const r = await cdp("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  return r.result?.result?.value ?? r.result?.result?.description ?? JSON.stringify(r.result?.result ?? r.result);
};

await sleep(2500);
const out = {};
out.title = await evaluate("document.title");
out.layers = await evaluate("[...document.querySelectorAll('.layer-row')].map(r => r.textContent.trim()).join('|')");
out.defaultTlMode = await evaluate("document.querySelector('.tl-mode.is-on')?.textContent?.trim()");
out.rowLayout = await evaluate("[...document.querySelectorAll('.layer-row')].map(r => [...r.children].map(c => c.className.split(' ')[0]).join(',')).join(' || ')");
console.log(JSON.stringify(out, null, 2));
chrome.kill();
process.exit(0);
