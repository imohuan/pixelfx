// 纯函数：文案与图标映射（无状态）。
export const ROW_H = 30;
export const TYPE_ICON = { character: "person", fx: "auto_awesome", target: "my_location", state: "blur_on" };
export const PALETTE_OPTIONS = [
  { label: "默认（原色）", value: "default" },
  { label: "火", value: "火" }, { label: "冰", value: "冰" }, { label: "雷", value: "雷" },
  { label: "毒", value: "毒" }, { label: "金", value: "金" }, { label: "血", value: "血" },
  { label: "暗", value: "暗" }, { label: "圣", value: "圣" },
];
export const PAL_HEX = { 火: "#ff6a2b", 冰: "#7fd6ff", 雷: "#ffe14a", 毒: "#5fc24a", 金: "#ffc93c", 血: "#e0334b", 暗: "#7d5bc6", 圣: "#fff2b8" };

export const hexOf = (rgb) => "#" + rgb.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");

export function typeIcon(t) { return TYPE_ICON[t] ?? "circle"; }
export function labelOf(c) {
  if (!c) return "";
  if (c.type === "character") return "角色 / " + (c.actRef ? c.actRef.split("/")[1] : "站姿");
  if (c.type === "fx") return c.label || String(c.fxId || "特效").split("/").pop();
  if (c.type === "target") return "靶子";
  if (c.type === "state") return "叠加态 / " + c.skin;
  return c.id;
}
export const skinColor = (skin) => (window.SKIN_TINT_HEX?.[skin] ? window.SKIN_TINT_HEX[skin] : "#c8c5ca");
export const actLabel = (c) => (c.actRef ? c.actRef.split("/")[1] : "站姿");
export const actShort = (c) => (c?.actRef ? c.actRef.split("/")[1] : "站姿");
