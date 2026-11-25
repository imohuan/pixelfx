// 纯函数：文案与图标映射（无状态）。
// 名称规则：所有 id 都翻成中文再显示，角色名 = 角色 · 动作 · 武器。
import { fxNameCn } from "./fx-names.js";

export const ROW_H = 30;
export const TYPE_ICON = { character: "person", fx: "auto_awesome", target: "my_location", state: "blur_on" };
export const WEAPON_LABELS = {
  sword: "长剑", greatsword: "巨剑", dagger: "匕首", spear: "长矛", hammer: "战锤",
  scythe: "镰刀", claw: "利爪", bow: "弓", pistol: "手枪", launcher: "火箭筒", handle: "空手",
};
export const SKIN_LABELS = {
  ice: "冰冻", char: "焦黑", poison: "中毒", shadow: "暗影",
  holy: "圣光", red: "红血", shock: "触电", flash: "闪白",
};
export const PALETTE_OPTIONS = [
  { label: "默认（原色）", value: "default" },
  { label: "火", value: "火" }, { label: "冰", value: "冰" }, { label: "雷", value: "雷" },
  { label: "毒", value: "毒" }, { label: "金", value: "金" }, { label: "血", value: "血" },
  { label: "暗", value: "暗" }, { label: "圣", value: "圣" },
];
export const PAL_HEX = { 火: "#ff6a2b", 冰: "#7fd6ff", 雷: "#ffe14a", 毒: "#5fc24a", 金: "#ffc93c", 血: "#e0334b", 暗: "#7d5bc6", 圣: "#fff2b8" };

export const hexOf = (rgb) => "#" + rgb.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");

export function typeIcon(t) { return TYPE_ICON[t] ?? "circle"; }
/** 角色名（可改；没写时叫“角色”） */
export const characterName = (c) => c?.label || "角色";
/** 动作名：动作脚本的中文名，没选就是“站姿” */
export const actName = (c) => (c?.actRef ? fxNameCn(c.actRef) : "站姿");
/** 武器名：没覆盖时用动作脚本自带的武器，界面写作“武器默认” */
export const weaponName = (c) => (c?.weapon ? (WEAPON_LABELS[c.weapon] || c.weapon) : "武器默认");
/** 特效名：用户改过的名字优先，否则用特效 id 的中文名 */
export function fxName(c) {
  if (!c) return "";
  const custom = String(c.label ?? "").trim();
  // 旧数据里可能把 id 直接塞进 label，这种不算自定义名字
  if (custom && !custom.includes("/")) return custom;
  return c.fxId ? fxNameCn(c.fxId) : "";
}

/** 时间轴 / 左侧列表上显示的完整名字 */
export function labelOf(c) {
  if (!c) return "";
  if (c.type === "character") return [characterName(c), actName(c), weaponName(c)].join(" · ");
  if (c.type === "fx") return fxName(c);
  if (c.type === "target") return "靶子";
  if (c.type === "state") return "叠加态 · " + (SKIN_LABELS[c.skin] || c.skin);
  return c.id;
}
export const skinColor = (skin) => (window.SKIN_TINT_HEX?.[skin] ? window.SKIN_TINT_HEX[skin] : "#c8c5ca");
export const actLabel = actName;
export const actShort = actName;
