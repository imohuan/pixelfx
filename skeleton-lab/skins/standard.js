// 标准人形：rig 默认体型 + 默认灰白皮肤
export default {
  name: "标准人形",
  proportions: { torso: 1, head: 1, legs: 1, arms: 1, bulk: 1 },
  skin: null,   // null = 默认 DUMMY_PAL
  presets: {
    "站立": "stand",
    "挥拳": "swing",
    "踢腿": "kick",
    "跳跃": "jump",
  },
};
