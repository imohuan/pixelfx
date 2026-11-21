#!/usr/bin/env node
/**
 * 动作库批量转换脚本
 *
 * 用法：
 *   node tools/rig/motion2actions.mjs [--source <动作库 docs 目录>] [--out <输出目录>] [--limit N]
 *
 * 干什么：
 *   把 motion-room 动作库（约 2480 个动作）里的 MVP 姿态流，批量转成编辑器（editor/）
 *   能直接播放的姿势 JSON。转换后按动作分类分目录存放，并生成 index.json 供编辑器读取。
 *
 * 为什么要单独转：
 *   原库给的是已解析好的骨骼世界坐标（MVP2 格式，Y 轴向上、单位米），不是原始 FBX。
 *   直接读它比解析 FBX 又快又准，但坐标系和像素骨骼引擎不同，所以需要换算。
 *
 * 输入：
 *   <source>/data/catalog/navigation*.json.gz   动作清单（含分类、名称、时长、循环标记）
 *   <source>/data/clips/*.mvp.gz                每个动作的姿态流
 *
 * 输出：
 *   <out>/<分类>/<动作id>.json                  单个动作（逐帧姿势）
 *   <out>/index.json                            分类与动作索引
 *
 * 注意：motion-source/ 体积约 730MB，已在 .gitignore 里忽略，不入库。
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { inflateSync } from "node:zlib";
import { join, dirname } from "node:path";

const argv = process.argv.slice(2);
const arg = (name, dflt) => { const i = argv.indexOf("--" + name); return i >= 0 ? argv[i + 1] : dflt; };
const SRC = arg("source", "motion-source/motion-room-main/docs");
const OUT = arg("out", "editor/actions");
const LIMIT = +(arg("limit", "0")) || 0;

// 动作清单是 gzip 压缩的，同名文件有好几个（不同快照）。
// 选最大的那个，它是完整清单。
const catDir = join(SRC, "data/catalog");
const navFile = readdirSync(catDir)
  .filter((f) => f.startsWith("navigation") && f.endsWith(".json.gz"))
  .map((f) => ({ f, size: readFileSync(join(catDir, f)).length }))
  .sort((a, b) => b.size - a.size)[0].f;
const catalog = JSON.parse(gunzipSync(readFileSync(join(catDir, navFile))).toString("utf8"));
const F = Object.fromEntries(catalog.fields.map((f, i) => [f, i]));
const clips = catalog.clips;

/**
 * 解析一个 MVP1/MVP2 姿态流文件。
 *
 * 文件结构（全部小端）：
 *   0..4     魔数 "MVP1"（只有位移）或 "MVP2"（位移+旋转）
 *   4..8     元数据 JSON 的字节长度
 *   8..      UTF-8 的元数据 JSON（含 fps、帧数、骨骼数、骨骼名、父子关系）
 *   对齐到 4 字节后：
 *             每帧时间戳（float32 × 帧数）
 *             每个关节的位移（float32 × 帧数 × 骨骼数 × 3）
 *             MVP2 在后面还有旋转数据
 */
function parseMvp(file) {
  const gz = readFileSync(file);
  const bytes = gz[0] === 0x1f && gz[1] === 0x8b ? gunzipSync(gz) : gz;
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  const metaLen = bytes.readUInt32LE(4);
  const meta = JSON.parse(bytes.subarray(8, 8 + metaLen).toString("utf8"));
  const hasRot = magic === "MVP2";
  const dataOff = Math.ceil((8 + metaLen) / 4) * 4;
  const { frameCount: fc, jointCount: jc } = meta;
  const times = new Float32Array(bytes.buffer.slice(bytes.byteOffset + dataOff, bytes.byteOffset + dataOff + fc * 4));
  const stride = hasRot ? 7 : 3;
  const posOff = dataOff + fc * 4;
  const pos = new Float32Array(bytes.buffer.slice(bytes.byteOffset + posOff, bytes.byteOffset + posOff + fc * jc * 3 * 4));
  return { meta, times, pos, hasRot, stride, fc, jc };
}

/** 按骨骼名找索引，兼容不同来源的命名（Mixamo 原版 / 简写 / 带后缀）。 */
const jointIndex = (meta, ...names) => {
  for (const n of names) { const i = meta.names.indexOf(n); if (i >= 0) return i; }
  return -1;
};

/**
 * 把一份 MVP 姿态流换算成像素骨骼引擎的姿势数组。
 *
 * 关键换算：
 *   1. 骨骼：取 Hips（骨盆）、双手、双脚（另外可选脚尖，用于判断踮脚）。
 *   2. 缩放：用“骨盆高度 ÷ 脚踝高度”得到人物身高，再等比缩放到引擎的 19.7px 骨盆高度。
 *      每个动作自己算，所以高矮不同的素材都能对上。
 *   3. 原点：引擎把原点放在双脚。这里取整段动作里最低的脚踝当“地面”，
 *      再减 4px（引擎约定脚踝离鞋底 4px），这样站立时脚正好踩在地面线上，
 *      跳跃动作也会真的离地。
 *   4. 踮脚：Mixamo 数据里平踩时“脚踝比脚尖高约 8.7cm”。所以先测这个动作自己的
 *      最小差值作为平踩基准，只有实际抬脚超过基准约 3.5px 才认为在踮脚。
 *      这样走路时的小弹跳不会被误判成踮脚。
 *
 * 返回 null 表示这个动作缺少必要骨骼（比如骑马类用了别的骨架），调用方会跳过。
 */
function toPoses(m) {
  const { meta, pos, fc, jc } = m;
  const iHips = jointIndex(meta, "Hips");
  const iHead = jointIndex(meta, "Head");
  const iHandN = jointIndex(meta, "RightHand", "Hand_R", "RightHand_End");
  const iHandF = jointIndex(meta, "LeftHand", "Hand_L", "LeftHand_End");
  const iFootN = jointIndex(meta, "RightFoot", "Foot_R");
  const iFootF = jointIndex(meta, "LeftFoot", "Foot_L");
  const iToeN = jointIndex(meta, "RightToeBase", "ToeBase_R");
  const iToeF = jointIndex(meta, "LeftToeBase", "ToeBase_L");
  const need = [iHips, iHandN, iHandF, iFootN, iFootF];
  if (need.some((i) => i < 0)) return null;

  const at = (f, j) => { const o = (f * jc + j) * 3; return [pos[o], pos[o + 1], pos[o + 2]]; };

  // 缩放：取整段动作里骨盆的最高点与脚踝的最低点，两者的差就是人物身高（米）
  let hipY = Infinity, footY = Infinity;
  for (let f = 0; f < fc; f++) {
    hipY = Math.min(hipY, at(f, iHips)[1]);
    footY = Math.min(footY, at(f, iFootN)[1], at(f, iFootF)[1]);
  }
  const standH = Math.max(0.35, hipY - footY); // 防止个别坏数据导致除零
  const S = 19.7 / standH; // 米 → 像素的比例
  // 引擎约定脚踝在地面线上方 4px（见 src/core/rig.js 里的 STAND.ffy）。
  // 用整段动作最低的脚踝当地面，跳跃时人物就真的会离地。
  let groundRef = Infinity;
  for (let f = 0; f < fc; f++) groundRef = Math.min(groundRef, at(f, iFootN)[1], at(f, iFootF)[1]);
  // 每个动作自己的“平踩基准”：整段里脚踝与脚尖高度差的最小值，就是脚掌完全放平的时候
  let restHeel = Infinity;
  if (iToeN >= 0) for (let f = 0; f < fc; f++) restHeel = Math.min(restHeel, at(f, iFootN)[1] - at(f, iToeN)[1]);
  if (iToeF >= 0) for (let f = 0; f < fc; f++) restHeel = Math.min(restHeel, at(f, iFootF)[1] - at(f, iToeF)[1]);
  const heelOn = restHeel + 0.05; // 0.05m 约等于 3.5px，只有真正抬脚跟才超过这个阈值
  // 姿势字段要求半像素精度，避免抖动
  const r1 = (v) => Math.round(v * 2) / 2;
  const poses = [];
  let facing = 0; // 整段动作的朝向（弧度），后面用头部位置慢慢估算
  for (let f = 0; f < fc; f++) {
    const hips = at(f, iHips);
    const hands = at(f, iHandN), handf = at(f, iHandF);
    const feet = at(f, iFootN), feetf = at(f, iFootF);
    // 横坐标相对骨盆中心；纵坐标相对地面，并减去 4px 的脚踝基准
    const px = (v) => (v - hips[0]) * S;
    const py = (v) => -(v - groundRef) * S - 4;
    const pose = {
      fx: r1(px(hands[0])), fy: r1(py(hands[1])),
      bx: r1(px(handf[0])), by: r1(py(handf[1])),
      ffx: r1(px(feet[0])), ffy: r1(py(feet[1])),
      fbx: r1(px(feetf[0])), fby: r1(py(feetf[1])),
    };
    // 踮脚判断：脚踝比脚尖高出多少，超过本动作的平踩基准才算抬脚跟
    const heelN = iToeN >= 0 ? feet[1] - at(f, iToeN)[1] : 0;
    const heelF = iToeF >= 0 ? feetf[1] - at(f, iToeF)[1] : 0;
    if (heelN > heelOn) pose.toeF = 1;
    if (heelF > heelOn) pose.toeB = 1;
    // 朝向：用“骨盆 → 头部”的方向估算人物面朝哪边。
    // 引擎里 yaw=0 表示面朝屏幕右方，所以把骨盆到头的方向对上 +x 轴。
    // 用平滑累加，避免单帧头部晃动带来的抖动。
    if (iHead >= 0) {
      const head = at(f, iHead);
      const dx = head[0] - hips[0], dz = head[2] - hips[2];
      if (Math.hypot(dx, dz) > 0.02) facing += (Math.atan2(-dz, dx) - facing) * 0.25;
    }
    poses.push(pose);
  }
  // 手脚坐标已经是身体局部坐标，整体旋转只用一个 yaw 表示
  return { poses, yaw: +facing.toFixed(3) };
}

/** 用分类代码反查分类中文名（例如 "11" → "嘻哈与街舞"）。 */
const catName = (code) => {
  const c = clips.find((x) => x[F.categoryCode] === code);
  return c ? String(c[F.subcategory]) : code;
};
/** 生成安全的文件名/目录名：只留字母数字和短横线，避免空格和中文路径问题。 */
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "action";

const index = { categories: [], actions: [] };
const byCat = new Map();
let done = 0, skipped = 0, empty = 0;
const clipDir = join(SRC, "data/clips");
// 逐个动作转换：读姿态流 → 换算姿势 → 写文件 → 记入索引
for (const c of clips) {
  if (LIMIT && done >= LIMIT) break;
  const variants = Array.isArray(c[F.variants]) ? c[F.variants] : [];
  // 优先用 source（原始动作），没有就退回第一个变体
  const src = variants.find((v) => v.key === "source") ?? variants[0];
  if (!src?.url) { skipped++; continue; }
  const file = join(SRC, src.url);
  if (!existsSync(file)) { skipped++; continue; }
  let out;
  // 解析失败（老格式、损坏的压缩包）就跳过，不让整个批次中断
  try { out = toPoses(parseMvp(file)); } catch { skipped++; continue; }
  if (!out?.poses?.length) { empty++; continue; }
  const code = String(c[F.categoryCode]);
  const cat = catName(code);
  // 同一个分类里动作 id 前缀会重复（比如一排“僵尸待机”），
  // 所以保留完整的 mixamo id，避免文件互相覆盖
  const id = slug(c[F.id]);
  const name = String(c[F.name] || c[F.english] || id);
  const dir = join(OUT, slug(cat) || code);
  const action = {
    id, name, category: cat, categoryCode: code, sourceId: c[F.id],
    fps: out.poses.length > 1 ? +(out.poses.length / (c[F.duration] || 1)).toFixed(2) : 30,
    frames: out.poses.length,
    yaw: out.yaw,
    loop: !!c[F.loop],
    poses: out.poses,
  };
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, id + ".json"), JSON.stringify(action));
  // 第一次遇到这个分类时建索引项
  if (!byCat.has(cat)) { byCat.set(cat, []); index.categories.push({ name: cat, code, slug: slug(cat) || code }); }
  byCat.get(cat).push({ id, name, category: cat, dir: slug(cat) || code, frames: action.frames, fps: action.fps });
  done++;
  if (done % 100 === 0) console.log("converted", done);
}

// 把每个分类下的动作列表挂到索引上，编辑器按分类渲染
for (const cat of index.categories) cat.actions = byCat.get(cat.name);
writeFileSync(join(OUT, "index.json"), JSON.stringify(index));
console.log(`完成：${done} 个动作，跳过 ${skipped} 个，空动作 ${empty} 个，${index.categories.length} 个分类`);
