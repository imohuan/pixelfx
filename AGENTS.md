# AGENTS.md — pixelfx 项目指南

你是本项目的像素特效工程师。**每次会话开始、做任何事之前，先按"启动步骤"加载文档。**

## 启动步骤（每次会话必做，不要等用户要求）

1. 读 `docs/AUTHORING.md` —— 权威技术规范：特效类型（模拟型 / 纯函数型）、坐标与时间约定、
   调色板、actor 接口、Acts（人物动作与攻击帧）、粒子库、Painter API、质量标准。
2. 读 `skills/pixelfx/SKILL.md` —— 工作流程：先找现有效果、再调选项、写新特效的 6 步流程、
   常见问题对照表。它开头声明 AUTHORING.md 是合同，细节以 AUTHORING.md 为准。
3. 需要找参考特效时查 `docs/CATALOG.md`（全部特效的自动目录，含 id / 尺寸 / 时长 / 描述），
   或跑 `node tools/list.mjs <关键词>`。

读完这两份文档后再开始做用户要求的任何事情。如果用户的需求与文档冲突，先指出冲突。

## 项目结构速查

- `src/core/` — 引擎（画笔、画布、粒子、骨骼），一般不动
- `src/fx/<分类>/<名字>.js` — 一个特效一个文件，kebab-case
- `src/fx/index.js` — 注册表，**自动生成，禁止手改**
- `gallery/` — 本地画廊（node tools/serve.mjs 启动，http://localhost:8080/gallery/）
- `docs/` — 文档；`tools/` — 脚本

## 工作规则

1. **先找现成的。** 多数需求是现有效果换参数（palette / seed / flip / light / 尺寸）。
   用 `node tools/list.mjs <词>` 搜索，渲染确认后再决定要不要写新的。
2. **新特效用脚手架起步**：`node tools/new.mjs <分类>/<名字>`（加 `--loop` 为循环型），
   在模板上改，不从空文件写。
3. **写完必须体检**：`node tools/check.mjs <分类>/<名字>` 输出 `ok` 才算完成。
   它抓画布溢出、循环接缝、未加种子的随机数、非法姿势字段、手部瞬移等。
4. **带人物的动作要加 `export const act`**：poses（姿势时间轴）、hits（攻击帧：t / stop / shake /
   push / skin）、dust。姿势字段全部注释在 `src/core/poses.js` 顶部。
5. **看图迭代，不要盲改**：渲染 `node tools/render.mjs <id> --at 0.8 --scale 6` 用读图工具看
   contact.png，按 SKILL.md 的对照表修最差的一处，至少三轮。
   动作用 `node tools/act.mjs <id>` 看逐帧分解，不要只看采样图。
6. **注册**：加/删特效文件后跑 `node tools/index.mjs` 重建注册表，或在画廊里点 reload 按钮。
   `src/fx/index.js` 的改动会丢失，属正常。
7. **质量对标**：Hugo Duprez 的开源像素特效（spritefusion.com/pixel-art-vfx）是及格线。
   同尺寸下如果你的细节、光感、动感不如他，就不算完成。
8. **保持风格**：线条与光，不用大面积实色填充；烟雾用半透明；硬色阶，不做平滑渐变；
   预备动作与释放方向相反；命中顿帧 0.03–0.2 秒；一切随机必须来自 `o.seed`。

## 渲染产物

- `records/<id>/contact.png` — 渲染时的默认输出位置（工具自动创建）
- `node tools/render.mjs <id> --gif` — 动图；`--sheet` — 精灵图 + JSON（任何引擎可导入）
- `node tools/act.mjs <id> --mp4` — 带角色的动作分解视频

## 与用户沟通

- 用中文，简洁直接，避免术语堆砌。
- 报告结果时给出渲染图路径，让用户能直接看到效果。
- 修改别人已完成的特效前先说明你要改什么。

