// v-focus：元素插入后自动聚焦（重命名输入框用）。
export const vFocus = {
  mounted(el) { Vue.nextTick(() => el.focus()); },
};
