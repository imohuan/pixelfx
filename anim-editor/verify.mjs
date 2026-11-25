#!/usr/bin/env node
// anim-editor 自检：帧/秒换算、预设格式、导出脚本、逐帧对拍。
//   node anim-editor/verify.mjs           全部检查
//   node anim-editor/verify.mjs frames    只查换算
import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { createFrame, clearFrame, createAct, createFx, actBounds } from "../src/core/index.js";
import { adoptProject, serializeProject, verifyConversions, setClipFrames, setProjectFps, secondsOfFrames6 } from "./src/lib/frames.js";
import { buildMoveSource } from "./src/lib/exporter.js";
import { localizeImports } from "./src/lib/localize.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const only = process.argv[2];
const fails = [];
const notes = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

function section(name, fn) {
  if (only && only !== name) return;
  try { fn(); console.log(`[ok] ${name}`); }
  catch (e) { fails.push(`${name}: ${e.message}`); console.log(`[!!] ${name}: ${e.message}`); }
}

// 1. 帧 ⇄ 秒：任意帧号往返必须回到原值
section("frames", () => {
  const errs = verifyConversions();
  ok(errs.length === 0, "换算自检失败：" + errs.slice(0, 3).join(" / "));
  // 记录具体数字，方便肉眼复核
  for (const fps of [24, 30, 60]) {
    for (const f of [0, 1, 12, 19, 27, 72, 104]) {
      const sec = secondsOfFrames6(f, fps);
      ok(Math.round(sec * fps) === f, `${fps}fps 第 ${f} 帧：${sec}s 反算成 ${Math.round(sec * fps)}`);
    }
  }
});

// 2. 预设：必须写 fps 和帧号，且能无损读写
section("presets", () => {
  const dir = join(HERE, "data", "presets");
  const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8"));
  ok(Array.isArray(index.presets) && index.presets.length >= 2, "预设清单为空");
  for (const p of index.presets) {
    const file = join(dir, p.file);
    ok(existsSync(file), `预设文件不存在：${p.file}`);
    const raw = JSON.parse(readFileSync(file, "utf8"));
    const { project, fpsFromFile } = adoptProject(raw);
    ok(fpsFromFile, `预设「${p.name}」没有写 fps`);
    ok(Number.isInteger(project.durationFrames), `预设「${p.name}」总帧不是整数`);
    for (const c of project.clips) {
      ok(Number.isInteger(c.f) && Number.isInteger(c.fEnd), `预设「${p.name}」片段 ${c.id} 的帧不是整数`);
      ok(c.fEnd > c.f, `预设「${p.name}」片段 ${c.id} 结束帧不大于开始帧`);
      ok(Math.abs(c.f / project.fps - c.t) < 1e-5, `预设「${p.name}」片段 ${c.id} 的秒和帧对不上`);
    }
    // 序列化后再读回来，逐帧必须完全一致
    const round = adoptProject(JSON.parse(JSON.stringify(serializeProject(project))));
    ok(round.project.fps === project.fps, `预设「${p.name}」往返后 fps 变了`);
    ok(round.project.durationFrames === project.durationFrames, `预设「${p.name}」往返后总帧变了`);
    const a = project.clips.map((c) => `${c.f}-${c.fEnd}`).join(",");
    const b = round.project.clips.map((c) => `${c.f}-${c.fEnd}`).join(",");
    ok(a === b, `预设「${p.name}」往返后片段帧变化：${a} != ${b}`);
  }
});

// 3. 改帧率：真实时长不变，片段最多挪半帧
section("fps-change", () => {
  const raw = JSON.parse(readFileSync(join(HERE, "data", "presets", "sword-combo.json"), "utf8"));
  const { project } = adoptProject(raw);
  const before = project.clips.map((c) => ({ id: c.id, t: c.t, until: c.until, f: c.f, fEnd: c.fEnd }));
  setProjectFps(project, 30);
  ok(project.fps === 30, "帧率没改成功");
  for (const b of before) {
    const c = project.clips.find((x) => x.id === b.id);
    ok(Math.abs(c.t - b.t) <= 0.5 / 30 + 1e-6, `片段 ${c.id} 改帧率后开始时间挪了 ${Math.abs(c.t - b.t).toFixed(4)}s`);
    ok(Math.abs(c.until - b.until) <= 0.5 / 30 + 1e-6, `片段 ${c.id} 改帧率后结束时间挪了 ${Math.abs(c.until - b.until).toFixed(4)}s`);
    ok(Number.isInteger(c.f) && Number.isInteger(c.fEnd), `片段 ${c.id} 改帧率后不是整数帧`);
  }
  ok(Math.abs(project.duration - 3) < 1e-6, `改帧率后总时长变了：${project.duration}`);
  for (const c of project.clips) ok(c.fEnd <= project.durationFrames, `片段 ${c.id} 超出总长`);
  // 再改回来，应该几乎回到原样
  setProjectFps(project, 24);
  for (const b of before) {
    const c = project.clips.find((x) => x.id === b.id);
    ok(Math.abs(c.f - b.f) <= 1, `片段 ${c.id} 改回 24 后帧号差太多：${c.f} vs ${b.f}`);
    ok(Math.abs(c.fEnd - b.fEnd) <= 1, `片段 ${c.id} 改回 24 后结束帧差太多：${c.fEnd} vs ${b.fEnd}`);
  }
});

// 3b. 老文件（只有秒、没有 fps）：必须按 24 换算并提示
section("legacy", () => {
  const legacy = {
    duration: 2.975,
    tracks: [{ id: "tr-char", name: "角色" }, { id: "tr-fx", name: "特效" }],
    clips: [
      { id: "a", trackId: "tr-char", type: "character", t: 0, until: 2.975, actRef: null },
      { id: "b", trackId: "tr-fx", type: "fx", t: 0.5, until: 1.04, fxId: "melee/double-slash" },
    ],
  };
  const { project, fpsFromFile } = adoptProject(legacy);
  ok(fpsFromFile === false, "老文件不该报告「有帧率」");
  ok(project.fps === 24, "老文件应按 24 换算");
  ok(project.durationFrames === Math.round(2.975 * 24), "老文件总帧换算不对");
  const b = project.clips.find((c) => c.id === "b");
  ok(b.f === 12 && b.fEnd === 25, `老文件片段换算不对：${b.f}-${b.fEnd}`);
  // 再存再读一次，必须稳定不变
  const again = adoptProject(JSON.parse(JSON.stringify(serializeProject(project))));
  ok(again.fpsFromFile === true, "新文件应当带帧率");
  ok(again.project.clips.map((c) => `${c.f}-${c.fEnd}`).join() === project.clips.map((c) => `${c.f}-${c.fEnd}`).join(), "老文件转新格式后往返变了");
});

// 4. 导出：生成的脚本能被 pixelfx 加载、播放，且时间与编排一致
const CASES = [
  { file: "ice-lance.json", act: "moves/ice-lance-throw", out: "_verify-ice-lance" },
  { file: "sword-combo.json", act: "moves/sword-combo", out: "_verify-sword-combo" },
];

for (const c of CASES) {
  if (only && only !== "export") break;
  const raw = JSON.parse(readFileSync(join(HERE, "data", "presets", c.file), "utf8"));
  const { project } = adoptProject(raw);
  const actMod = await import(`../src/fx/${c.act}.js`);
  const built = buildMoveSource({
    project, name: project.name, size: [320, 200], origin: [120, 180],
    metaOf: () => null,
    actModules: new Map([[c.act, actMod]]),
  });
  // 写进临时目录再 import：不在特效库里留下测试产物
  const tmp = mkdtempSync(join(tmpdir(), "animfx-verify-"));
  const file = join(tmp, c.out + ".js");
  writeFileSync(file, localizeImports(built.source, join(HERE, "..")));
  const mod = await import(pathToFileURL(file).href + "?v=" + Date.now());
  const tag = `导出 ${project.name}`;
  ok(mod.meta.arrangement.fps === project.fps, `${tag}：文件里没有记录编排帧率`);
  ok(mod.meta.arrangement.frames === project.durationFrames, `${tag}：文件里的总帧数不一致`);
  ok(Math.abs(mod.meta.duration - project.duration) < 1e-6, `${tag}：总时长不一致`);
  ok(typeof mod.create === "function", `${tag}：没有 create`);
  ok((mod.act?.poses?.length ?? 0) > 0, `${tag}：没有角色动作`);
  // 时长换算：帧 → 秒，必须精确回来
  ok(Math.abs(mod.meta.duration * project.fps - project.durationFrames) < 1e-3, `${tag}：时长换算后帧数对不上`);

  // cue 时间：每段必须正好落在片段的帧边界上
  const cueTimes = [...built.source.matchAll(/t: F\((\d+)\)/g)].map((m) => +m[1]);
  const fxClips = project.clips.filter((x) => x.type === "fx");
  for (const clip of fxClips) {
    ok(cueTimes.includes(clip.f), `${tag}：「${clip.label}」的开始帧 ${clip.f} 没有出现在 cue 里`);
  }
  ok(cueTimes.length >= fxClips.length, `${tag}：cue 数量少于特效片段数`);
  for (const f of cueTimes) ok(f >= 0 && f <= project.durationFrames, `${tag}：cue 在第 ${f} 帧，超出 0..${project.durationFrames}`);

  // 动作关键帧：单角色时应当和源动作逐键一致（只是平移）
  const chars = project.clips.filter((x) => x.type === "character");
  if (chars.length === 1) {
    const src = actMod.act.poses;
    const got = mod.act.poses;
    const shift = chars[0].t;
    const dx = Math.round(chars[0].x ?? 0);
    ok(got.length === src.length, `${tag}：动作关键帧数量不一致（导出 ${got.length}，源 ${src.length}）`);
    for (let i = 0; i < Math.min(got.length, src.length); i++) {
      const [st, sp] = src[i];
      const [gt, gp] = got[i];
      ok(Math.abs(gt - (st + shift)) < 1e-5, `${tag}：第 ${i} 个关键帧时间 ${gt}，应为 ${(st + shift).toFixed(6)}`);
      ok((gp.x ?? 0) === (sp.x ?? 0) + dx, `${tag}：第 ${i} 个关键帧的 x 不一致`);
      for (const k of ["fx", "fy", "bx", "by", "sa", "weapon", "crouch", "lean"]) {
        if (sp[k] === undefined) continue;
        ok(gp[k] === sp[k], `${tag}：第 ${i} 个关键帧的 ${k} 被改了（${gp[k]} != ${sp[k]}）`);
      }
    }
  }

  // 播放一帧不抛错
  const frame = createFrame(mod.meta.size[0], mod.meta.size[1], -mod.meta.origin[0], -mod.meta.origin[1]);
  const inst = createAct(mod, { x: 0, y: 0 });
  for (let i = 0; i < Math.round(mod.meta.duration * 24); i++) {
    clearFrame(frame);
    inst.draw(frame, { body: true, target: true });
    inst.update(1 / 24);
  }
  console.log(`  ${project.name}: ${built.cues} cues, ${mod.act.poses.length} poses, ${mod.act.hits.length} hits`);
  for (const w of built.warnings) notes.push(`${project.name}: ${w}`);
}

if (notes.length) {
  console.log("\n提示：");
  for (const n of notes) console.log("  - " + n);
}
if (fails.length) {
  console.log("\n失败：");
  for (const f of fails) console.log("  - " + f);
  process.exit(1);
}
console.log("\n全部通过");
