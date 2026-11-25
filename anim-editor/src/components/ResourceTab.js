// 右侧「资源」tab：动作脚本 / 武器 / 特效，统一用瀑布流 + 卡片渲染。
// 只显示当前标签能用的资源：角色 → 动作脚本 + 武器；特效标签 → 特效。
// 点一张卡 = 直接套到当前选中的标签上。
import { categoryNameCn } from "../lib/fx-names.js";
import { actName, weaponName, fxName } from "../lib/labels.js";

const ALL_KINDS = [
  { id: "move", name: "动作脚本", icon: "directions_run", field: "actRef" },
  { id: "weapon", name: "武器", icon: "swords", field: "weapon" },
  { id: "fx", name: "特效", icon: "auto_awesome", field: "fxId" },
];

export const ResourceTab = {
  name: "ResourceTab",
  props: { ctx: { type: Object, required: true } },
  data() {
    return { cat: "all" };
  },
  computed: {
    // 当前标签支持哪几类资源
    kinds() {
      const t = this.ctx.selected?.type;
      if (t === "character") return ALL_KINDS.filter((k) => k.id !== "fx");
      if (t === "fx") return ALL_KINDS.filter((k) => k.id === "fx");
      return [];
    },
    // ctx.assetKind 里存的类别不合法时，退回这一类支持的第一种
    kind() {
      const list = this.kinds;
      if (!list.length) return "";
      if (list.some((k) => k.id === this.ctx.assetKind)) return this.ctx.assetKind;
      return list[0].id;
    },
    // 每一类自己的“全部 + 分类”筛选条
    cats() {
      if (this.kind === "weapon") return [];
      const all = this.allCards;
      const counts = new Map();
      for (const c of all) {
        const id = String(c.value || "");
        if (!id || id === "none") continue;
        const k = id.split("/")[0];
        counts.set(k, (counts.get(k) || 0) + 1);
      }
      const list = [...counts].sort((a, b) => a[0].localeCompare(b[0]))
        .map(([id, n]) => ({ id, name: categoryNameCn(id), n }));
      return [{ id: "all", name: "全部", n: all.length }].concat(list);
    },
    allCards() {
      if (this.kind === "move") return this.ctx.moveCards;
      if (this.kind === "weapon") return this.ctx.weaponCards;
      return this.ctx.allFxCards;
    },
    cards() {
      const all = this.allCards;
      const list = all.filter((c) => c.value === "none").concat(all.filter((c) => c.value && c.value !== "none"));
      if (this.cat === "all") return list;
      return list.filter((c) => c.value === "none" || String(c.value).startsWith(this.cat + "/"));
    },
    current() {
      const c = this.ctx.selected;
      if (!c) return "";
      if (this.kind === "move") return c.type === "character" ? (c.actRef || "none") : "";
      if (this.kind === "weapon") return c.type === "character" ? (c.weapon || "none") : "";
      return c.type === "fx" ? (c.fxId || "") : "";
    },
    // 顶栏显示的当前资源名（中文）
    currentName() {
      const c = this.ctx.selected;
      if (!c) return "";
      if (this.kind === "move") return c.type === "character" ? actName(c) : "";
      if (this.kind === "weapon") return c.type === "character" ? weaponName(c) : "";
      return c.type === "fx" ? fxName(c) : "";
    },
    // 这一类现在能不能套：动作/武器只能给角色，特效只能给特效标签
    usable() {
      const c = this.ctx.selected;
      if (!c) return false;
      return this.kind === "fx" ? c.type === "fx" : c.type === "character";
    },
    title() {
      return ALL_KINDS.find((k) => k.id === this.kind)?.name ?? "";
    },
    // 没有可选资源时（靶子 / 叠加态）给一句解释
    noKind() {
      return !this.ctx.selected ? "先在左侧列表或时间轴里点一个标签" : "这个标签没有可替换的资源";
    },
  },
  watch: {
    // 卡片变了（切类别、切分类、资源加载完）：重新量高度排一次
    cards() { this.$nextTick(() => this.$refs.grid?.schedule?.()); },
    cat() { this.$nextTick(() => this.$refs.grid?.schedule?.()); },
    kind() { this.cat = "all"; this.$nextTick(() => this.$refs.grid?.schedule?.()); },
    // 选中特效标签时自动切到「特效」；选中角色时切到动作脚本或武器
    "ctx.selected.type"(t) {
      if (t === "fx") this.ctx.assetKind = "fx";
      else if (t === "character" && this.ctx.assetKind === "fx") this.ctx.assetKind = "move";
    },
  },
  methods: {
    selectKind(id) {
      this.ctx.assetKind = id;
      this.cat = "all";
    },
    pick(item) {
      if (!this.usable) return;
      if (this.kind === "move") this.ctx.onActChange(item.value);
      else if (this.kind === "weapon") this.ctx.onWeaponChange(item.value);
      else this.ctx.onFxChange(item.value);
    },
  },
  template: `
  <div class="res-tab">
    <div class="res-kinds" role="tablist" aria-label="资源类型" v-if="kinds.length > 1">
      <button v-for="k in kinds" :key="k.id" type="button" class="res-kind"
              :class="{ 'is-on': kind === k.id }" @click="selectKind(k.id)">
        <span class="material-symbols-outlined">{{ k.icon }}</span><span>{{ k.name }}</span>
      </button>
    </div>
    <div class="res-note" v-if="!kinds.length">
      <span class="material-symbols-outlined">info</span><span>{{ noKind }}</span>
    </div>
    <template v-else>
    <div class="res-head">
      <span class="res-title">{{ title }}</span>
      <span class="res-now" v-if="currentName">{{ currentName }}</span>
      <span class="flex-1"></span>
      <span class="res-count">{{ cards.length }}</span>
    </div>
    <div class="lib-cats" v-if="cats.length > 1" role="group" aria-label="分类">
      <button v-for="g in cats" :key="g.id" type="button" class="lib-cat"
              :class="{ 'is-on': cat === g.id }" @click="cat = g.id">
        <span>{{ g.name }}</span><span class="lib-cat-n">{{ g.n }}</span>
      </button>
    </div>
    <div class="res-scroll">
      <masonry-grid ref="grid" :items="cards" :gap="8" :three-at="400">
        <template #default="{ item }">
          <resource-card :item="item" :kind="item.value === 'none' ? 'icon' : kind"
                         :selected="usable && item.value === current"
                         @pick="pick"></resource-card>
        </template>
      </masonry-grid>
    </div>
    </template>
  </div>`,
};
