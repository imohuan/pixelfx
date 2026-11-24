// 兽人战士：宽壮、褐肤、皮甲配色（参考绿发兽人攻击预备姿势的像素图）
export default {
  name: "兽人战士",
  proportions: { torso: 1.1, head: 0.85, legs: 0.95, arms: 1.1, bulk: 1.35 },
  skin: {
    A: "#e8a86c", B: "#d18c50", C: "#a86a3c", D: "#7c4c28",   // 褐肤
    E: "#5c3a24", F: "#462c1c", G: "#32200f",                  // 皮甲深棕
    k: "#16100c", J: "#241812", m: "#c83c28",                  // 墨线/缝线/胸标
  },
  presets: {
    "站立": { crouch: 14, fx: 22, fy: -95, bx: -14, by: -90, weapon: "greatsword", sa: 0.9, ffx: 20, ffy: -6, fbx: -18, fby: -6 },
    "举剑预备": { crouch: 22, lean: 6, yaw: -0.5, fx: 15, fy: -175, bx: 30, by: -120, two: true, weapon: "greatsword", sa: -2.4, ffx: 25, ffy: -14, fbx: -28, fby: -8 },
    "挥砍": { crouch: 26, lean: 20, fx: 110, fy: -60, bx: -30, by: -140, two: true, weapon: "greatsword", sa: 0.5, ffx: 30, ffy: -16, fbx: -30, fby: -10 },
  },
};
