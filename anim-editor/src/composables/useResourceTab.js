// 右侧「资源标签」tab 的分组数据 + 选项卡片。
import * as EN from "../../engine.js";
import { WEAPON_LABELS } from "../../pick-cards.js";
import { PALETTE_OPTIONS, PAL_HEX } from "../lib/labels.js";
import { fxNameCn, categoryNameCn } from "../lib/fx-names.js";

const { FX_TAGS, MOVE_TAGS, isMoveFx, SKIN_NAMES, SKIN_TINT, WEAPONS, loadAllActTags, loadFxLibrary } = EN;

export function useResourceTab(project) {
  const rightTab = Vue.ref("props");
  const libCat = Vue.ref("moves");
  const libGroups = Vue.ref([]);
  loadFxLibrary().then((lib) => {
    const groups = [];
    const ids = Object.keys(lib.effects).sort((a, b) => a.localeCompare(b));
    const moves = ids.filter((id) => isMoveFx(id));
    groups.push({ id: "moves", name: "chain 编排", blurb: "由内部特效按时间串起来的完整动作", ids: moves });
    const chainIds = new Set(moves);
    for (const cat of lib.categories) {
      if (cat.id === "moves") continue;
      groups.push({ id: cat.id, name: categoryNameCn(cat.id), blurb: cat.blurb, ids: ids.filter((id) => id.startsWith(cat.id + "/") && !chainIds.has(id)) });
      for (const id of groups[groups.length - 1].ids) chainIds.add(id);
    }
    const seen = new Set(groups.flatMap((g) => g.ids));
    const rest = ids.filter((id) => !seen.has(id));
    if (rest.length) groups.push({ id: "other", name: "其他", blurb: "未归类的特效", ids: rest });
    libGroups.value = groups;
  }).catch(() => {});
  const libCards = Vue.computed(() => {
    const g = libGroups.value.find((x) => x.id === libCat.value);
    if (!g) return [];
    return g.ids.map((id) => ({ value: id, label: id, short: fxNameCn(id) }));
  });
  const libCount = Vue.computed(() => libGroups.value.reduce((s, g) => s + g.ids.length, 0));

  const actTags = Vue.ref(MOVE_TAGS);
  loadAllActTags().then((tags) => { actTags.value = tags; }).catch(() => {});
  const moveOptions = Vue.computed(() => [{ label: "站姿（无动作）", value: "none" }].concat(actTags.value.map((id) => ({ label: id, value: id }))));
  const weaponOptions = [{ label: "跟随动作脚本", value: "none" }].concat(WEAPONS.map((w) => ({ label: w, value: w })));
  const moveCards = Vue.computed(() => [{ value: "none", label: "站姿（无动作）", short: "站姿", icon: "accessibility_new" }]
    .concat(actTags.value.map((id) => ({ value: id, label: id, short: fxNameCn(id) }))));
  const weaponCards = [{ value: "none", label: "跟随动作脚本", short: "自动", icon: "auto_mode" }]
    .concat(WEAPONS.map((w) => ({ value: w, label: w, short: WEAPON_LABELS[w] || w })));
  const fxOptionsAll = Vue.computed(() => FX_TAGS.concat(actTags.value)
    .map((id) => ({ label: (isMoveFx(id) ? "[动作] " : "") + id, value: id })));
  const fxCards = Vue.computed(() => fxOptionsAll.value.map((o) => ({ value: o.value, label: o.label, short: fxNameCn(o.value) })));

  const paletteOptions = PALETTE_OPTIONS;
  const skinOptions = SKIN_NAMES.map((s) => ({ label: s, value: s }));
  const paletteCards = PALETTE_OPTIONS.map((o) => ({
    ...o,
    short: o.value === "default" ? "原色" : o.label,
    color: o.value === "default" ? "linear-gradient(135deg,#e8edf6,#a4afc6)" : (PAL_HEX[o.value] || "#999"),
  }));
  const skinCards = SKIN_NAMES.map((s) => {
    const rgb = SKIN_TINT[s];
    const color = Array.isArray(rgb) ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : "#ccc";
    return { value: s, label: s, short: s, color };
  });
  const bindOptions = Vue.computed(() => {
    const out = [{ label: "默认（第一个靶子）", short: "默认靶子", value: "none" }];
    for (const t of project.clips.filter((c) => c.type === "target")) out.push({ label: "靶子 / " + t.id, short: "靶子", value: t.id });
    for (const c of project.clips.filter((c) => c.type === "character")) out.push({ label: "角色 / " + (c.actRef ? c.actRef.split("/")[1] : "站姿"), short: (c.actRef ? c.actRef.split("/")[1] : "站姿"), value: c.id });
    out.push({ label: "角色（任意一个）", short: "任意角色", value: "character" });
    return out;
  });
  return { rightTab, libCat, libGroups, libCards, libCount, actTags, moveOptions, weaponOptions, moveCards, weaponCards, fxCards, fxOptionsAll, paletteOptions, skinOptions, paletteCards, skinCards, bindOptions };
}
