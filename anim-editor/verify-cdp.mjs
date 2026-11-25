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

await cdp("Runtime.enable");
const logs = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method === "Runtime.exceptionThrown") logs.push("EXC " + String(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text).slice(0, 300));
  if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) logs.push(m.params.type + " " + m.params.args.map(a => String(a.value ?? a.description ?? "")).join(" ").slice(0, 240));
});

for (let i = 0; i < 80; i++) { if (await evaluate("!!(window.__editor && window.__editor.ready)")) break; await sleep(250); }
const out = {};
out.title = await evaluate("document.title");
out.ready = await evaluate("!!window.__editor.ready");
out.defaultTlMode = await evaluate("document.querySelector('.tl-mode.is-on')?.textContent?.trim()");
out.presetButtons = await evaluate("[...document.querySelectorAll('.topbar button')].map(b => b.textContent.trim()).filter(Boolean).join('|')");
out.fps = await evaluate("window.__editor.project.fps");
out.frames = await evaluate("window.__editor.project.durationFrames");
out.clipFrames = await evaluate("window.__editor.project.clips.map(c => c.id + ':' + c.f + '-' + c.fEnd).join(',')");

// 点「三连斩」预设
out.clickPreset = await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('三连斩')); if (!b) return 'not found'; b.click(); return 'clicked'; })()`);
await sleep(2000);
out.afterPreset = await evaluate("window.__editor.project.name + '|' + window.__editor.project.fps + '|' + window.__editor.project.durationFrames + '|' + window.__editor.project.clips.map(c => c.f + '-' + c.fEnd).join(',')");
out.durReadout = await evaluate("document.querySelector('.tl-dur')?.textContent?.replace(/\\s+/g,' ').trim()");
out.selectedFrames = await evaluate("window.__editor.project.clips.find(c => c.id === window.__editor.selected)?.f");
out.propsText = await evaluate("[...document.querySelectorAll('.prop-time-hint')].map(e => e.textContent.replace(/\\s+/g,' ').trim()).join('')");

// 改帧率：帧号必须不动，时长跟着变
out.fpsBefore = await evaluate("window.__editor.project.clips.map(c => c.id + ':' + c.f + '-' + c.fEnd).join(',')");
out.changeFps = await evaluate(`(() => { window.__editor.onFpsChange(30); return window.__editor.project.fps; })()`);
await sleep(600);
out.afterFps = await evaluate("window.__editor.project.fps + '|' + window.__editor.project.durationFrames + '|' + window.__editor.project.duration.toFixed(3) + '|' + window.__editor.project.clips.map(c => c.id + ':' + c.f + '-' + c.fEnd).join(',')");
out.fpsKeptFrames = out.fpsBefore === out.afterFps.split('|')[3];

// 导出脚本（会写入 src/fx/moves）
out.exportResult = await evaluate("(async () => { try { const r = await window.__editor.exportMove(); return r.filename + '|' + r.cues + '|' + r.totalFrames + '|' + r.warnings.join(';'); } catch (e) { return 'ERR ' + e.message; } })()");

// 画面自检：在几个时间点截图，看画布有没有实际画出内容
await evaluate("window.__editor.loadPreset('ice-lance')");
await sleep(1200);
out.shots = [];
for (const t of [0.3, 0.9, 1.2, 2.2]) {
  await evaluate(`window.__editor.setTime(${t})`);
  await sleep(260);
  const shot = await cdp("Page.captureScreenshot", { format: "png" });
  const data = shot.result?.data;
  if (data) { const { writeFileSync } = await import("node:fs"); writeFileSync(process.env.TEMP + `\\animfx-${String(t).replace(".", "_")}.png`, Buffer.from(data, "base64")); }
  out.shots.push(t + (data ? " ok" : " none"));
}
out.pixelCheck = await evaluate("(() => { const c = document.querySelector('.stage-canvas'); return c ? c.width + 'x' + c.height : 'no canvas'; })()");

// 真实拖拽一个片段：松手后必须落在整数帧，且不能重叠
await evaluate("window.__editor.loadPreset('sword-combo')");
await sleep(1200);
out.dragBefore = await evaluate("window.__editor.project.clips.filter(c=>c.type==='fx').map(c=>c.id+':'+c.f+'-'+c.fEnd).join(',')");
const dragInfo = await evaluate(`(() => {
  const el = document.querySelector('.tl-clip.fx');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width) };
})()`);
if (dragInfo) {
  const send = (type, x, y) => cdp("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
  await send("mousePressed", dragInfo.x, dragInfo.y);
  for (let i = 1; i <= 6; i++) { await send("mouseMoved", dragInfo.x + i * 9, dragInfo.y); await sleep(40); }
  await send("mouseReleased", dragInfo.x + 54, dragInfo.y);
  await sleep(500);
}
out.dragAfter = await evaluate("window.__editor.project.clips.filter(c=>c.type==='fx').map(c=>c.id+':'+c.f+'-'+c.fEnd+':'+(c.f/Math.round(window.__editor.project.fps))).join(',')");
out.dragOk = await evaluate("window.__editor.project.clips.every(c => Number.isInteger(c.f) && Number.isInteger(c.fEnd))");
out.dragTrack = await evaluate("window.__editor.project.clips.filter(c=>c.type==='fx').map(c=>c.id+'@'+(c.row??0)).join(',')");
out.dragOverlap = await evaluate(`(() => { const fx = window.__editor.project.clips.filter(c=>c.type==='fx'); const bad=[]; for (const a of fx) for (const b of fx) if (a!==b && a.row===b.row && a.f < b.fEnd && a.fEnd > b.f) bad.push(a.id+'-'+b.id); return bad.join(',') || 'none'; })()`);

// 保存 → 载入：帧号必须一模一样
await evaluate("window.__editor.loadPreset('ice-lance')");
await sleep(1200);
out.saveLoadBefore = await evaluate("window.__editor.project.fps + '|' + window.__editor.project.durationFrames + '|' + window.__editor.project.clips.map(c => c.id + ':' + c.f + '-' + c.fEnd).join(',')");
out.saveResult = await evaluate("(async () => { try { await window.__editor.save(); const j = await (await fetch('/api/project')).json(); return j.fps + '|' + j.durationFrames + '|' + j.clips.map(c => c.id + ':' + c.f + '-' + c.fEnd).join(',') + '|cache:' + j.clips.some(c => Object.keys(c).some(k => k.startsWith('_'))); } catch (e) { return 'ERR ' + e.message; } })()");
await evaluate("window.__editor.loadPreset('sword-combo')");
await sleep(1000);
out.reloadResult = await evaluate("(async () => { await window.__editor.load(); return window.__editor.project.fps + '|' + window.__editor.project.durationFrames + '|' + window.__editor.project.clips.map(c => c.id + ':' + c.f + '-' + c.fEnd).join(','); })()");
out.topbarName = await evaluate("!!document.querySelector('.topbar-name')");
const finalShot = await cdp("Page.captureScreenshot", { format: "png" });
if (finalShot.result?.data) {
  const { writeFileSync } = await import("node:fs");
  writeFileSync(process.env.TEMP + "\\animfx-final.png", Buffer.from(finalShot.result.data, "base64"));
  console.log("截图：" + process.env.TEMP + "\\animfx-final.png");
}

console.log(JSON.stringify(out, null, 2));
console.log("console:", logs.length ? logs.slice(0, 8) : "none");
const bad = !out.ready || logs.some(l => l.startsWith("EXC")) || out.afterPreset?.startsWith("undefined");
chrome.kill();
process.exit(bad ? 1 : 0);
