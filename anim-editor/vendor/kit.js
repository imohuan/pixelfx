/* ============================================================
   kit.js — UI-Kit 组件库 (Vue 3 + Material 3 黑白风格)
   风格参考: model-search-debug.html
   ------------------------------------------------------------
   使用方式:
     <script src="https://cdn.jsdelivr.net/npm/vue@3/dist/vue.global.prod.js"></script>
     <script src="kit.js"></script>
     <script>
       const app = Vue.createApp({ ... });
       app.use(UIKit);
       app.mount('#app');
     </script>
   在模板中可用:
     全局组件 <kit-button> <kit-input> <kit-dialog> ...
     全局服务  $toast, $confirm, $dialog
     指令      v-tooltip="'提示文字'"
   ============================================================ */

(function (global) {
  'use strict';

  const ICONS = {
    info: 'info',
    success: 'check_circle',
    error: 'error',
    warning: 'warning',
  };

  /* ---------- 工具 ---------- */
  function uid() {
    return 'kit-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  /* 统一的上下方向键识别：兼容方向键与小键盘（NumLock 开时小键盘 key 为空串，
     关时部分浏览器给出 End/Down 之类，因此 code / keyCode 一起兜底） */
  function isUpKey(e) {
    return e.key === 'ArrowUp' || e.code === 'Numpad8' || e.keyCode === 104 || e.keyCode === 38;
  }
  function isDownKey(e) {
    return e.key === 'ArrowDown' || e.code === 'Numpad2' || e.keyCode === 98 || e.keyCode === 40;
  }

  /* ---------- 表单基础组件 ---------- */

  const KitButton = {
    name: 'KitButton',
    props: {
      variant: { type: String, default: 'filled' }, // filled | outlined | text | tonal | error
      size: { type: String, default: 'md' },         // sm | md | lg
      icon: String,
      disabled: Boolean,
      loading: Boolean,
      type: { type: String, default: 'button' },
    },
    emits: ['click'],
    template: `
      <button :type="type" :disabled="disabled || loading"
        class="kit-btn" :class="['kit-btn--' + variant, size === 'sm' ? 'kit-btn--sm' : size === 'lg' ? 'kit-btn--lg' : '']"
        @click="$emit('click', $event)">
        <span v-if="loading" class="spinner material-symbols-outlined icon-sm">progress_activity</span>
        <span v-else-if="icon" class="material-symbols-outlined icon-sm">{{ icon }}</span>
        <slot></slot>
      </button>
    `,
  };

  const KitIconButton = {
    name: 'KitIconButton',
    props: {
      icon: { type: String, required: true },
      size: { type: String, default: 'md' }, // sm | md
      danger: Boolean,
      disabled: Boolean,
      title: String,
    },
    emits: ['click'],
    template: `
      <button class="kit-icon-btn" :class="{ 'kit-icon-btn--sm': size === 'sm', 'kit-icon-btn--danger': danger }"
        :disabled="disabled" :title="title" @click="$emit('click', $event)">
        <span class="material-symbols-outlined">{{ icon }}</span>
      </button>
    `,
  };

  const KitInput = {
    name: 'KitInput',
    props: {
      modelValue: [String, Number],
      type: { type: String, default: 'text' },
      placeholder: String,
      size: { type: String, default: 'md' }, // sm | md | lg
      mono: Boolean,
      disabled: Boolean,
      readonly: Boolean,
      invalid: Boolean,
      icon: String,          // 左侧图标
      prefix: String,        // 左侧文字前缀
      suffix: String,        // 右侧文字后缀
      passwordToggle: Boolean, // 密码可见切换
    },
    emits: ['update:modelValue', 'enter', 'focus', 'blur'],
    data() {
      return { showPwd: false };
    },
    computed: {
      inputType() {
        if (this.type === 'password' && this.passwordToggle) return this.showPwd ? 'text' : 'password';
        return this.type;
      },
    },
    methods: {
      onInput(e) { this.$emit('update:modelValue', e.target.value); },
      onKeydown(e) { if (e.key === 'Enter') this.$emit('enter', e); },
    },
    template: `
      <div class="kit-input-wrap w-full" :class="{ 'kit-input-wrap--right': icon && type === 'password' && !passwordToggle }">
        <span v-if="icon && type !== 'password'" class="kit-icon material-symbols-outlined">{{ icon }}</span>
        <input
          class="kit-input" :class="[
            'kit-input--' + size,
            { 'kit-input--mono': mono, 'kit-input--invalid': invalid,
              'kit-input--has-prefix': prefix, 'kit-input--has-suffix': suffix,
              'kit-input--has-toggle': passwordToggle }]"
          :type="inputType" :value="modelValue" :placeholder="placeholder"
          :disabled="disabled" :readonly="readonly"
          @input="onInput" @keydown="onKeydown" @focus="$emit('focus', $event)" @blur="$emit('blur', $event)">
        <span v-if="prefix" class="kit-input-affix kit-input-affix--prefix">{{ prefix }}</span>
        <span v-if="suffix" class="kit-input-affix kit-input-affix--suffix">{{ suffix }}</span>
        <button v-if="passwordToggle" type="button" class="kit-input-toggle" @click="showPwd = !showPwd">
          <span class="material-symbols-outlined">{{ showPwd ? 'visibility' : 'visibility_off' }}</span>
        </button>
      </div>
    `,
  };

  const KitTextarea = {
    name: 'KitTextarea',
    props: {
      modelValue: String,
      placeholder: String,
      rows: { type: Number, default: 3 },
      mono: Boolean,
      disabled: Boolean,
      invalid: Boolean,
      resize: { type: String, default: 'vertical' }, // none | vertical | both
    },
    emits: ['update:modelValue'],
    methods: {
      onInput(e) { this.$emit('update:modelValue', e.target.value); },
    },
    template: `
      <textarea class="kit-textarea" :class="{ 'kit-textarea--mono': mono, 'kit-input--invalid': invalid }"
        :rows="rows" :value="modelValue" :placeholder="placeholder" :disabled="disabled"
        :style="{ resize }" @input="onInput"></textarea>
    `,
  };

  /* ============================================================
     KitSelect 下拉选择（AxSelect 复刻）
     用法:
       <kit-select v-model="sel" :options="[{label, value}]" placeholder="请选择"/>
       <kit-select v-model="arr" :options="options" multiple searchable/>
     兼容旧用法: <kit-select><option value="x">X</option></kit-select>
     ============================================================ */

  const KitSelect = {
    name: 'KitSelect',
    props: {
      modelValue: [String, Number, Array],
      options: { type: Array, default: () => [] }, // [{label, value, disabled?}]
      placeholder: { type: String, default: '请选择' },
      searchPlaceholder: { type: String, default: '搜索...' },
      searchable: Boolean,
      multiple: Boolean,
      disabled: Boolean,
      mono: Boolean,
      size: { type: String, default: 'md' }, // sm | md | lg
      dropdownWidth: { type: String, default: 'match' }, // match | auto | 具体宽度
      dropdownMaxWidth: { type: String, default: '320px' },
    },
    emits: ['update:modelValue', 'change'],
    data() {
      return {
        open: false,
        searchQuery: '',
        highlightIndex: -1,
        listRef: null,
        focused: false,
      };
    },
    mounted() {
      this._onOpenWatch = this.$watch('open', (v) => {
        if (v) {
          this.highlightIndex = this.selectedIndex();
          this.scrollToHighlight();
        }
      });
    },
    beforeUnmount() {
      if (this._onOpenWatch) this._onOpenWatch();
    },
    computed: {
      /* 从 props.options 或 slot <option> 解析 */
      resolvedOptions() {
        if (this.options.length) return this.options;
        const out = [];
        const slotOpts = this.$slots.default ? this.$slots.default() : [];
        const walk = (vnodes) => {
          for (const v of vnodes) {
            const t = v.type;
            // 原生 <option> 的 type 是 'option'；KitOption 的 name 是 'Option'
            if (t === 'option' || (t && t.name === 'Option')) {
              out.push({
                label: v.children || (v.props && v.props.label) || String(v.props && v.props.value),
                value: v.props && v.props.value,
                disabled: v.props && v.props.disabled,
              });
            } else if (v.children && Array.isArray(v.children)) {
              walk(v.children);
            }
          }
        };
        walk(slotOpts);
        return out;
      },
      selectedValues() {
        if (this.multiple) {
          const mv = this.modelValue;
          if (Array.isArray(mv)) return mv.slice();
          if (mv === '' || mv == null) return [];
          return [mv];
        }
        return this.modelValue !== '' && this.modelValue != null ? [this.modelValue] : [];
      },
      selectedLabels() {
        return this.selectedValues.map(v => {
          const opt = this.resolvedOptions.find(o => o.value === v);
          return opt ? { value: v, label: opt.label } : { value: v, label: String(v) };
        });
      },
      displayLabel() {
        if (this.multiple) return this.selectedLabels.length ? '' : this.placeholder;
        return this.selectedLabels[0]?.label || this.placeholder;
      },
      filteredOptions() {
        const q = this.searchQuery.trim().toLowerCase();
        if (!q) return this.resolvedOptions;
        return this.resolvedOptions.filter(o => String(o.label).toLowerCase().includes(q));
      },
      hasValue() {
        return this.multiple ? this.selectedValues.length > 0 : this.modelValue !== '' && this.modelValue != null;
      },
      isMatchWidth() {
        return this.dropdownWidth === 'match' || this.dropdownWidth === 'auto';
      },
    },
    methods: {
      isSelected(opt) { return this.selectedValues.includes(opt.value); },
      selectOption(opt) {
        if (opt.disabled) return;
        if (this.multiple) {
          const cur = this.selectedValues.slice();
          const idx = cur.indexOf(opt.value);
          if (idx >= 0) cur.splice(idx, 1);
          else cur.push(opt.value);
          this.emitValue(cur);
          this.searchQuery = '';
          this.highlightIndex = -1;
          if (this.$refs.searchInput) this.$refs.searchInput.focus();
        } else {
          this.emitValue(opt.value);
          this.closeDropdown();
        }
      },
      removeOption(value) {
        if (!this.multiple) return;
        this.emitValue(this.selectedValues.filter(v => v !== value));
      },
      emitValue(v) {
        this.$emit('update:modelValue', v);
        this.$emit('change', v);
      },
      handleClear(e) {
        e.stopPropagation();
        this.emitValue(this.multiple ? [] : '');
      },
      onDropdownChange() { /* KitDropdown v-model 同步，无额外逻辑 */ },
      closeDropdown() {
        this.open = false;
        this.searchQuery = '';
        this.highlightIndex = -1;
      },
      /* 当前选中项在列表里的下标（未选中或找不到时返回 -1） */
      selectedIndex() {
        const cur = this.selectedValues[0];
        if (cur === undefined) return -1;
        return this.filteredOptions.findIndex(o => o.value === cur);
      },
      /* 上下循环切换：到底再按回到开头，到头再按回到末尾；跳过禁用项 */
      cycleOption(delta) {
        const opts = this.filteredOptions;
        const len = opts.length;
        if (!len || this.disabled) return false;
        let idx = this.selectedIndex();
        if (idx < 0) idx = delta > 0 ? -1 : 0;
        for (let step = 1; step <= len; step++) {
          const next = ((idx + delta * step) % len + len) % len;
          const opt = opts[next];
          if (opt && !opt.disabled) {
            this.emitValue(opt.value);
            this.highlightIndex = next;
            return true;
          }
        }
        return false;
      },
      onTriggerFocus() {
        this.focused = true;
        if (this.open) this.highlightIndex = this.selectedIndex();
      },
      onTriggerBlur() {
        this.focused = false;
      },
      /* 聚焦状态下按上下键切换选中项（关闭状态也生效） */
      onTriggerKeydown(e) {
        if (this.disabled) return;
        if (isDownKey(e) || isUpKey(e)) {
          if (this.multiple) return;
          e.preventDefault();
          this.cycleOption(isDownKey(e) ? 1 : -1);
          return;
        }
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          this.toggleDropdown();
        }
      },
      toggleDropdown() {
        this.open = !this.open;
        if (this.open) this.highlightIndex = this.selectedIndex();
        if (this.open && this.searchable) {
          this.$nextTick(() => this.$refs.searchInput && this.$refs.searchInput.focus());
        }
      },
      scrollToHighlight() {
        this.$nextTick(() => {
          const items = this.listRef ? this.listRef.querySelectorAll('[data-option]') : [];
          const el = items[this.highlightIndex];
          if (el) el.scrollIntoView({ block: 'nearest' });
        });
      },
      handleKeydown(e) {
        const len = this.filteredOptions.length;
        if (!len) return;
        /* 面板打开时用上下键移动高亮（兼容小键盘） */
        if (isDownKey(e) || isUpKey(e)) {
          e.preventDefault();
          this.highlightIndex = isDownKey(e)
            ? (this.highlightIndex < len - 1 ? this.highlightIndex + 1 : 0)
            : (this.highlightIndex > 0 ? this.highlightIndex - 1 : len - 1);
          this.scrollToHighlight();
          return;
        }
        switch (e.key) {
          case 'Enter':
            e.preventDefault();
            if (this.highlightIndex >= 0 && this.highlightIndex < len) {
              this.selectOption(this.filteredOptions[this.highlightIndex]);
            }
            break;
          case 'Escape':
            e.preventDefault();
            this.closeDropdown();
            break;
        }
      },
    },
    template: `
      <kit-dropdown v-model="open" :match-width="isMatchWidth" :menu-max-width="dropdownMaxWidth"
        @update:model-value="onDropdownChange">
        <template #trigger>
          <div @click.stop>
          <div class="kit-select-trigger" :class="['kit-select-trigger--' + size, { 'kit-select-trigger--open': open, 'kit-select-trigger--focus': focused, 'font-mono': mono }]"
            :disabled="disabled" tabindex="0" role="combobox" aria-haspopup="listbox" :aria-expanded="open"
            @click="!disabled && toggleDropdown()"
            @focus="onTriggerFocus" @blur="onTriggerBlur"
            @keydown="onTriggerKeydown">
            <!-- 已选标签（多选） -->
            <template v-if="multiple && selectedLabels.length">
              <span v-for="opt in selectedLabels" :key="opt.value" class="kit-select-tag">
                <span class="kit-select-tag-label">{{ opt.label }}</span>
                <button type="button" class="kit-select-tag-remove" @click.stop="removeOption(opt.value)">
                  <span class="material-symbols-outlined">close</span>
                </button>
              </span>
            </template>
            <!-- 搜索模式：打开时显示搜索框 -->
            <input v-else-if="searchable && open" ref="searchInput" v-model="searchQuery" type="text"
              class="kit-select-search-input" :placeholder="selectedLabels.length ? '' : searchPlaceholder"
              autocomplete="off" @click.stop @keydown="handleKeydown">
            <!-- 显示值 -->
            <span v-else :class="hasValue ? 'kit-select-value' : 'kit-select-placeholder'">{{ displayLabel }}</span>
            <!-- 清除按钮 -->
            <span v-if="hasValue && !searchable" style="margin-left:auto" class="flex items-center">
              <button v-if="!multiple" type="button" class="kit-select-tag-remove" @click.stop="handleClear">
                <span class="material-symbols-outlined" style="font-size:14px">close</span>
              </button>
            </span>
            <span class="material-symbols-outlined kit-select-arrow" :class="{ 'kit-select-arrow--open': open }">expand_more</span>
          </div>
          </div>
        </template>
        <template #default>
          <div ref="listRef" class="kit-select-options" @keydown="handleKeydown">
            <button v-for="(opt, index) in filteredOptions" :key="opt.value" type="button" data-option
              class="kit-select-option"
              :class="[
                !multiple && selectedValues[0] === opt.value ? 'kit-select-option--selected'
                  : highlightIndex === index ? 'kit-select-option--highlighted'
                  : multiple && isSelected(opt) ? 'kit-select-option--multi-selected' : '',
              ]"
              :disabled="opt.disabled"
              @click="selectOption(opt)" @mouseenter="highlightIndex = index">
              <span v-if="multiple" class="kit-select-checkbox" :class="isSelected(opt) ? 'kit-select-checkbox--checked' : ''">
                <span v-if="isSelected(opt)" class="material-symbols-outlined">check</span>
              </span>
              <span class="kit-select-tag-label">{{ opt.label }}</span>
              <span v-if="!multiple && selectedValues[0] === opt.value" class="material-symbols-outlined" style="margin-left:auto">check</span>
            </button>
            <div v-if="filteredOptions.length === 0" class="kit-select-no-results">无匹配选项</div>
          </div>
        </template>
      </kit-dropdown>
    `,
  };

  /* 兼容 slot 用法的原生 option 注册（KitSelect 内部识别） */
  const KitOption = {
    name: 'Option',
    props: { value: { required: true }, label: String, disabled: Boolean },
    render() { return null; },
  };

  const KitCheckbox = {
    name: 'KitCheckbox',
    props: {
      modelValue: Boolean,
      label: String,
      disabled: Boolean,
      value: { default: undefined }, // 数组 v-model 用法
    },
    emits: ['update:modelValue', 'change'],
    template: `
      <label class="kit-checkbox-label" :class="{ 'opacity-50': disabled }">
        <input type="checkbox" class="kit-checkbox" :disabled="disabled"
          :checked="modelValue" @change="$emit('update:modelValue', $event.target.checked); $emit('change', $event.target.checked)">
        <span v-if="label">{{ label }}</span>
        <slot></slot>
      </label>
    `,
  };

  const KitRadio = {
    name: 'KitRadio',
    props: {
      modelValue: [String, Number, Boolean],
      label: String,
      value: { required: true },
      disabled: Boolean,
      name: String,
    },
    emits: ['update:modelValue'],
    template: `
      <label class="kit-radio-label" :class="{ 'opacity-50': disabled }">
        <input type="radio" class="kit-radio" :name="name" :value="value" :disabled="disabled"
          :checked="modelValue === value"
          @change="$emit('update:modelValue', value)">
        <span v-if="label">{{ label }}</span>
        <slot></slot>
      </label>
    `,
  };

  const KitSwitch = {
    name: 'KitSwitch',
    props: {
      modelValue: Boolean,
      label: String,
      disabled: Boolean,
      size: { type: String, default: 'md' }, // sm | md | lg
    },
    emits: ['update:modelValue', 'change'],
    template: `
      <label class="kit-switch-label" :class="{ 'opacity-50': disabled }">
        <span class="kit-switch" :class="'kit-switch--' + size">
          <input type="checkbox" :checked="modelValue" :disabled="disabled"
            @change="$emit('update:modelValue', $event.target.checked); $emit('change', $event.target.checked)">
          <span class="kit-switch__track"></span>
        </span>
        <span v-if="label">{{ label }}</span>
        <slot></slot>
      </label>
    `,
  };

  const KitSlider = {
    name: 'KitSlider',
    props: {
      modelValue: Number,
      min: { type: Number, default: 0 },
      max: { type: Number, default: 100 },
      step: { type: Number, default: 1 },
      unit: { type: String, default: '' },
      precision: { type: [Number, String], default: null },
      showValue: { type: Boolean, default: true },
      disabled: Boolean,
    },
    emits: ['update:modelValue', 'change', 'input'],
    computed: {
      pct() {
        const span = this.max - this.min;
        if (!(span > 0)) return 0;
        return Math.max(0, Math.min(100, ((this.modelValue - this.min) / span) * 100));
      },
      text() {
        const n = Number(this.modelValue);
        if (!Number.isFinite(n)) return '';
        const places = this.precision === null || this.precision === '' ? null : Number(this.precision);
        const body = places === null || !Number.isFinite(places)
          ? String(Math.round(n * 1e6) / 1e6)
          : n.toFixed(Math.max(0, Math.min(12, places)));
        return body + (this.unit || '');
      },
    },
    template: `
      <div class="kit-slider-row">
        <input type="range" class="kit-slider" :min="min" :max="max" :step="step" :disabled="disabled"
          :value="modelValue" :style="{ '--kit-pct': pct + '%' }"
          @input="$emit('update:modelValue', Number($event.target.value)); $emit('input', Number($event.target.value))"
          @change="$emit('change', Number($event.target.value))">
        <span v-if="showValue" class="kit-slider-value">{{ text }}</span>
      </div>
    `,
  };

  /* ---------- NumberField 数字输入（滑块 + 输入框 + 鼠标锁定） ---------- */

  function nfDecimals(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    const text = String(n);
    if (text.includes('e-')) {
      const [mantissa, exponent] = text.split('e-');
      const fraction = mantissa.includes('.') ? mantissa.split('.')[1].length : 0;
      return fraction + Number(exponent);
    }
    return text.includes('.') ? text.split('.')[1].length : 0;
  }

  function nfRound(value, places) {
    const scale = Math.pow(10, places);
    return Math.round(value * scale) / scale;
  }

  function nfFormat(value, places) {
    if (!Number.isFinite(value)) return '';
    const p = Math.max(0, Math.min(12, places));
    let out = value.toFixed(p);
    if (p > 0) out = out.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    if (out === '-0') out = '0';
    return out;
  }

  function nfParse(text) {
    const cleaned = String(text == null ? '' : text).trim().replace(/\s+/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '+' || cleaned === '.' || cleaned === '-.') return NaN;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : NaN;
  }

  const NF_ICON_UNLOCKED = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3.25" y="7" width="9.5" height="6.25" rx="1.4" stroke="currentColor" stroke-width="1.4"/><path d="M5.6 7V5.3A2.4 2.4 0 0 1 10.4 5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="8" cy="10.15" r=".9" fill="currentColor"/></svg>';
  const NF_ICON_LOCKED = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3.25" y="7" width="9.5" height="6.25" rx="1.4" stroke="currentColor" stroke-width="1.4"/><path d="M5.6 7V5.3A2.4 2.4 0 0 1 10.4 5.3V7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="8" cy="10.15" r=".9" fill="currentColor"/></svg>';

  const KitNumberField = {
    name: 'KitNumberField',
    props: {
      modelValue: Number,
      min: { type: Number, default: 0 },
      max: { type: Number, default: 100 },
      step: { type: Number, default: 1 },
      precision: { type: [Number, String], default: null },
      unit: { type: String, default: '' },
      disabled: Boolean,
      readonly: Boolean,
      label: { type: String, default: '数值' },
      slider: { type: Boolean, default: true },
    },
    emits: ['update:modelValue', 'change', 'input'],
    data() {
      return {
        locked: false,
        dragging: false,
        typing: false,
        text: '',
        toastOn: false,
        chrome: 5,
        iconUnlocked: NF_ICON_UNLOCKED,
        iconLocked: NF_ICON_LOCKED,
      };
    },
    computed: {
      decimals() {
        let d = Math.max(nfDecimals(this.step), nfDecimals(this.min));
        const p = this.precision;
        if (p !== null && p !== undefined && p !== '') {
          const n = Number(p);
          if (Number.isFinite(n)) d = Math.trunc(n);
        }
        return Math.max(0, Math.min(12, d));
      },
      pct() {
        const span = this.max - this.min;
        if (!(span > 0)) return 0;
        return Math.max(0, Math.min(100, ((this.modelValue - this.min) / span) * 100));
      },
      display() {
        return this.typing ? this.text : nfFormat(this.modelValue, this.decimals);
      },
      toastText() {
        return nfFormat(this.modelValue, this.decimals) + (this.unit || '');
      },
      fineQuantum() {
        const places = Math.min(6, Math.max(0, this.decimals + 1));
        const scale = Math.pow(10, places);
        const q = Math.round((this.step / 10) * scale) / scale;
        return q > 0 ? q : 0.000001;
      },
    },
    watch: {
      min() { this.syncChrome(); },
      max() { this.syncChrome(); },
    },
    mounted() {
      this.syncChrome();
      this._onDocMove = (e) => this.handleLockMove(e);
      this._onDocKey = (e) => { if (e.key === 'Escape' && this.locked) this.stopLock(true); };
      this._onLockChange = () => this.onLockChange();
      this._onLockError = () => this.onLockError();
      document.addEventListener('mousemove', this._onDocMove);
      document.addEventListener('keydown', this._onDocKey);
      document.addEventListener('pointerlockchange', this._onLockChange);
      document.addEventListener('pointerlockerror', this._onLockError);
    },
    beforeUnmount() {
      this.stopRepeat();
      document.removeEventListener('mousemove', this._onDocMove);
      document.removeEventListener('keydown', this._onDocKey);
      document.removeEventListener('pointerlockchange', this._onLockChange);
      document.removeEventListener('pointerlockerror', this._onLockError);
      clearTimeout(this._lockTimer);
      if (this.$refs.field && document.pointerLockElement === this.$refs.field) {
        try { document.exitPointerLock(); } catch (err) { /* ignore */ }
      }
    },
    methods: {
      syncChrome() {
        const a = nfFormat(this.min, this.decimals);
        const b = nfFormat(this.max, this.decimals);
        this.chrome = Math.min(10, Math.max(3, a.length, b.length) + 1);
      },
      quantize(value) {
        const n = Number(value);
        const base = Number.isFinite(n) ? Math.max(this.min, Math.min(this.max, n)) : this.min;
        if (!(this.step > 0)) return nfRound(base, this.decimals);
        let cells = Math.round((base - this.min) / this.step);
        let out = this.min + cells * this.step;
        while (out > this.max + this.step * 1e-9 && cells > 0) {
          cells -= 1;
          out = this.min + cells * this.step;
        }
        if (out < this.min) out = this.min;
        return nfRound(out, this.decimals);
      },
      commit(value, final) {
        const next = nfRound(Math.max(this.min, Math.min(this.max, value)), 6);
        if (Math.abs(next - this.modelValue) > 1e-9) {
          this.$emit('update:modelValue', next);
          this.$emit('input', next);
        }
        if (final) this.$emit('change', next);
      },
      onTrackDown(e) {
        if (this.disabled || this.readonly || e.button !== 0) return;
        e.preventDefault();
        const rail = e.currentTarget.querySelector('.kit-number-field__rail');
        if (!rail) return;
        const rect = rail.getBoundingClientRect();
        if (rect.width <= 0) return;
        const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        this._continuous = this.min + ratio * (this.max - this.min);
        this._unitsPerPixel = (this.max - this.min) / rect.width;
        this._dragX = e.clientX;
        this._dragId = e.pointerId;
        this.dragging = true;
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        this.applyDrag(e);
      },
      onTrackMove(e) {
        if (!this.dragging || e.pointerId !== this._dragId) return;
        const dx = e.clientX - this._dragX;
        if (!dx) return;
        this._dragX = e.clientX;
        const speed = e.shiftKey ? 4 : (e.ctrlKey || e.metaKey) ? 0.25 : 1;
        this._continuous = Math.max(this.min, Math.min(this.max, this._continuous + dx * this._unitsPerPixel * speed));
        this.applyDrag(e);
      },
      onTrackUp() {
        if (!this.dragging) return;
        this.dragging = false;
        this._dragId = null;
        this.$emit('change', this.modelValue);
      },
      applyDrag(e) {
        const fine = (e.ctrlKey || e.metaKey) && !e.shiftKey;
        this.commit(fine ? this.snapTo(this._continuous, this.fineQuantum) : this.quantize(this._continuous), false);
      },
      snapTo(value, quantum) {
        const snapped = this.min + Math.round((value - this.min) / quantum) * quantum;
        return nfRound(Math.max(this.min, Math.min(this.max, snapped)), 6);
      },
      stepBy(direction, e) {
        if (this.disabled || this.readonly) return;
        const fast = Boolean(e && e.shiftKey);
        const fine = Boolean(e && (e.ctrlKey || e.metaKey)) && !fast;
        if (fine) {
          this.commit(this.snapTo(this.modelValue + direction * this.fineQuantum, this.fineQuantum), true);
          return;
        }
        this.commit(this.quantize(this.modelValue + direction * this.step * (fast ? 10 : 1)), true);
      },
      onTrackKey(e) {
        if (e.altKey) return;
        const key = e.key;
        let handled = true;
        if (key === 'ArrowRight' || key === 'ArrowUp') this.stepBy(1, e);
        else if (key === 'ArrowLeft' || key === 'ArrowDown') this.stepBy(-1, e);
        else if (key === 'PageUp') this.stepBy(10, e);
        else if (key === 'PageDown') this.stepBy(-10, e);
        else if (key === 'Home') this.commit(this.min, true);
        else if (key === 'End') this.commit(this.max, true);
        else handled = false;
        if (handled) e.preventDefault();
      },
      onInputFocus(e) {
        this.typing = false;
        e.target.select();
      },
      /* 聚焦后按住上下键：先跳一步，停顿后连续步进（长按持续切换） */
      startRepeat(direction, e) {
        this.stopRepeat();
        this.stepBy(direction, e);
        this._repeatTimer = setTimeout(() => {
          this._repeatInt = setInterval(() => this.stepBy(direction, e), 55);
        }, 420);
      },
      stopRepeat() {
        clearTimeout(this._repeatTimer);
        clearInterval(this._repeatInt);
        this._repeatTimer = 0;
        this._repeatInt = 0;
      },
      onInputInput(e) {
        this.typing = true;
        this.text = e.target.value;
      },
      onInputKeyup(e) {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') this.stopRepeat();
      },
      onInputBlur() {
        this.stopRepeat();
        if (this.typing) this.commitInput();
      },
      onInputKey(e) {
        if (e.altKey) return;
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter' || e.key === 'Escape') {
          if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') this.stopRepeat();
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          if (e.repeat) return;
          this.startRepeat(e.key === 'ArrowUp' ? 1 : -1, e);
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          this.commitInput();
          this.$nextTick(() => e.target.select());
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          this.typing = false;
          e.target.blur();
        }
      },
      commitInput() {
        const parsed = nfParse(this.text);
        this.typing = false;
        if (!Number.isFinite(parsed)) {
          this.text = nfFormat(this.modelValue, this.decimals);
          return;
        }
        this.commit(this.quantize(parsed), true);
      },
      onLockClick() {
        if (this.disabled || this.readonly) return;
        if (this.locked) {
          if (document.pointerLockElement) { try { document.exitPointerLock(); } catch (err) { /* ignore */ } }
          else this.stopLock(true);
          return;
        }
        const el = this.$refs.field;
        if (!el) return;
        if (typeof el.requestPointerLock !== 'function') {
          this.startLock();
          return;
        }
        const request = (options) => {
          const result = options ? el.requestPointerLock(options) : el.requestPointerLock();
          if (result && typeof result.catch === 'function') {
            result.catch(() => {
              if (options) request(null);
              else this.onLockError();
            });
          }
        };
        try { request({ unadjustedMovement: true }); }
        catch (err) {
          try { request(null); }
          catch (err2) { this.onLockError(); }
        }
      },
      onLockChange() {
        const el = this.$refs.field;
        if (el && document.pointerLockElement === el) {
          this._viaPointerLock = true;
          this.startLock();
        } else if (this.locked && this._viaPointerLock) {
          this._viaPointerLock = false;
          this.stopLock(true);
        }
      },
      onLockError() {
        clearTimeout(this._lockTimer);
        this._lockTimer = setTimeout(() => {
          if (!this.locked) this.startLock();
        }, 60);
      },
      startLock() {
        this.locked = true;
        this.toastOn = true;
        this.typing = false;
        this._continuous = this.modelValue;
      },
      stopLock(commitResult) {
        this._viaPointerLock = false;
        if (!this.locked) return;
        this.locked = false;
        this.toastOn = false;
        if (this.$refs.field && document.pointerLockElement === this.$refs.field) {
          try { document.exitPointerLock(); } catch (err) { /* ignore */ }
        }
        if (commitResult) this.$emit('change', this.modelValue);
      },
      handleLockMove(e) {
        if (!this.locked) return;
        const dx = e.movementX || 0;
        if (!dx) return;
        const speed = e.shiftKey ? 4 : (e.ctrlKey || e.metaKey) ? 0.25 : 1;
        const units = ((this.max - this.min) / 360) * speed;
        this._continuous = Math.max(this.min, Math.min(this.max, this._continuous + dx * units));
        const fine = (e.ctrlKey || e.metaKey) && !e.shiftKey;
        this.commit(fine ? this.snapTo(this._continuous, this.fineQuantum) : this.quantize(this._continuous), false);
      },
    },
    template: `
      <div ref="field" class="kit-number-field" :class="{ 'is-disabled': disabled, 'is-no-slider': !slider }">
        <button type="button" class="kit-number-field__lock" :aria-pressed="locked ? 'true' : 'false'"
          aria-label="鼠标锁定拖动" title="鼠标锁定：左右无限拖动（Shift 加速 / Ctrl 精调）"
          @click="onLockClick" v-html="locked ? iconLocked : iconUnlocked"></button>
        <div v-if="slider" class="kit-number-field__track" :class="{ 'is-active': dragging }" role="slider" tabindex="0"
          :aria-label="label" :aria-valuemin="min" :aria-valuemax="max" :aria-valuenow="modelValue" :aria-valuetext="toastText"
          @pointerdown="onTrackDown" @pointermove="onTrackMove" @pointerup="onTrackUp" @pointercancel="onTrackUp" @keydown="onTrackKey">
          <div class="kit-number-field__rail"></div>
          <div class="kit-number-field__fill" :style="{ width: pct + '%' }"></div>
          <div class="kit-number-field__thumb" :style="{ left: pct + '%' }"></div>
        </div>
        <label class="kit-number-field__box" :class="{ 'is-grow': !slider }">
          <input class="kit-number-field__input" type="text" inputmode="decimal" autocomplete="off" spellcheck="false"
            :aria-label="label" :disabled="disabled" :readonly="readonly"
            :style="{ width: 'calc(' + chrome + 'ch + 2px)' }" :value="display"
            @input="onInputInput" @focus="onInputFocus" @blur="onInputBlur"
            @keydown="onInputKey" @keyup="onInputKeyup" @dblclick="$event.target.select()">
          <span v-if="unit" class="kit-number-field__unit">{{ unit }}</span>
        </label>
        <div class="kit-number-field__toast" :class="{ 'is-on': toastOn }" aria-hidden="true">
          <span v-html="iconLocked"></span>
          <span>鼠标已锁定</span>
          <span class="sep"></span>
          <b>{{ toastText }}</b>
          <span class="keys">Shift 加速 · Ctrl 精调 · Esc 退出</span>
        </div>
      </div>
    `,
  };


  /* ---------- Split 分割面板（移植自 SplitPane.vue） ----------
   * 1) 两侧各有最小尺寸 minLeft / minRight（px），拖拽时滑块被限制在
   *    [minLeft, 容器宽 - 滑块宽 - minRight] 区间内，永不越过最小限制。
   * 2) snap-edge 开启时：继续往越界方向拖过 snap 阈值，对应一侧塌缩为 0，
   *    另一侧占满整个区域，滑块紧贴塌缩侧的边缘；拖回来即刻恢复。
   * 3) 拖拽期间不做任何过渡动画，滑块精确跟随指针（扣除抓取偏移）。
   * 4) 位置换算严格扣除滑块自身宽度，避免差一像素或溢出。
   */

  const SPLIT_DIVIDER = 10;

  const KitSplit = {
    name: 'KitSplit',
    props: {
      modelValue: { type: Number, default: null }, // 第一块尺寸（px）
      minLeft: { type: Number, default: 180 },
      minRight: { type: Number, default: 180 },
      initial: { type: Number, default: 0.5 },     // 初始占比 0~1
      snap: { type: Number, default: 56 },         // 越过最小限制多少 px 触发塌缩
      snapEdge: { type: Boolean, default: true },  // 是否启用吸附到一侧
      direction: { type: String, default: 'horizontal' },
      storageKey: { type: String, default: '' },
    },
    emits: ['update:modelValue', 'resize', 'resize-end', 'collapse'],
    data() {
      return {
        containerW: 0,
        ratio: this.initial,
        collapsed: null,   // 'a' = 第一块塌缩, 'b' = 第二块塌缩
        dragging: false,
      };
    },
    computed: {
      vertical() { return this.direction === 'vertical'; },
      /* 第一块可用的最大尺寸（不含滑块） */
      maxLeft() {
        return Math.max(this.minLeft, this.containerW - this.minRight);
      },
      /* 第一块当前实际尺寸（px） */
      leftPx() {
        const w = this.containerW;
        if (w <= 0) return 0;
        if (this.collapsed === 'a') return 0;
        if (this.collapsed === 'b') return w;
        return Math.min(Math.max(this.ratio * w, this.minLeft), this.maxLeft);
      },
      paneStyle() {
        return this.vertical
          ? { height: this.leftPx + 'px' }
          : { width: this.leftPx + 'px' };
      },
    },
    watch: {
      modelValue(v) {
        if (this.dragging || !Number.isFinite(Number(v)) || this.containerW <= 0) return;
        const next = Number(v);
        /* 自己刚发出的值回传时忽略，避免比例被反复重置 */
        if (this._emitted !== undefined && Math.abs(next - this._emitted) < 1 && Math.abs(next - this.leftPx) < 1) return;
        if (Math.abs(next - this.leftPx) < 1) return;
        this.collapsed = null;
        this.ratio = Math.min(Math.max(next / this.containerW, this.minLeft / this.containerW), this.maxLeft / this.containerW);
      },
      initial(v) { this.ratio = v; this.collapsed = null; },
    },
    mounted() {
      this.$nextTick(() => {
        this.measure();
        const primary = this.readStored();
        const initialPx = Number.isFinite(primary) ? primary : Number(this.modelValue);
        if (this.containerW > 0) {
          if (Number.isFinite(initialPx)) {
            /* 初次挂载或受控宽度越界时按容器夹取，避免宽度溢出把另一侧压没 */
            this.ratio = Math.min(
              Math.max(initialPx / this.containerW, this.minLeft / this.containerW),
              this.maxLeft / this.containerW,
            );
          }
        }
        this.clampRatio();
        this.emitSize();
      });
      window.addEventListener('resize', this.onWindowResize);
      if (typeof ResizeObserver === 'function' && this.$refs.root) {
        this._ro = new ResizeObserver(() => this.onWindowResize());
        this._ro.observe(this.$refs.root);
      }
    },
    beforeUnmount() {
      window.removeEventListener('resize', this.onWindowResize);
      if (this._ro) { this._ro.disconnect(); this._ro = null; }
      if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
      this.endDrag();
    },
    methods: {
      /* 可用尺寸 = 容器尺寸 - 滑块宽度，保证 两块 + 滑块 = 容器 */
      measure() {
        const root = this.$refs.root;
        if (!root) { this.containerW = 0; return; }
        const total = this.vertical ? root.clientHeight : root.clientWidth;
        this.containerW = Math.max(0, total - SPLIT_DIVIDER);
      },
      clampRatio() {
        const w = this.containerW;
        if (w <= 0) return;
        const minR = this.minLeft / w;
        const maxR = this.maxLeft / w;
        this.ratio = Math.min(Math.max(this.ratio, minR), maxR);
      },
      readStored() {
        if (!this.storageKey) return NaN;
        try {
          const v = parseFloat(localStorage.getItem(this.storageKey));
          return Number.isFinite(v) ? v : NaN;
        } catch (err) {
          return NaN;
        }
      },
      writeStored(size) {
        if (!this.storageKey) return;
        try { localStorage.setItem(this.storageKey, String(size)); } catch (err) { /* ignore */ }
      },
      emitSize() {
        const size = this.leftPx;
        this._emitted = size;
        this.$emit('update:modelValue', size);
        this.$emit('resize', size);
      },
      onWindowResize() {
        if (this.dragging) return;
        if (this._winRaf) return;
        this._winRaf = requestAnimationFrame(() => {
          this._winRaf = 0;
          if (this.dragging) return;
          this.measure();
          if (!this.collapsed) this.clampRatio();
          this.emitSize();
        });
      },
      /* ---- 拖拽 ---- */
      onPointerDown(e) {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        const root = this.$refs.root;
        if (!root) return;
        e.preventDefault();
        this.measure();
        const rect = root.getBoundingClientRect();
        this._containerStart = this.vertical ? rect.top : rect.left;
        this._grabOffset = (this.vertical ? e.clientY : e.clientX) - (this._containerStart + this.leftPx);
        this._dragId = e.pointerId;
        this.dragging = true;
        document.body.classList.add('kit-split-resizing');
        if (this.vertical) document.body.classList.add('kit-split-resizing--vertical');
        window.addEventListener('pointermove', this.onPointerMove);
        window.addEventListener('pointerup', this.endDrag);
        window.addEventListener('pointercancel', this.endDrag);
      },
      onPointerMove(e) {
        if (!this.dragging) return;
        const w = this.containerW;
        if (w <= 0) return;
        const pos = this.vertical ? e.clientY : e.clientX;
        /* 滑块左边缘目标位置（相对容器）。取整到整像素，避免半像素抗锯齿让线看着变粗 */
        const target = Math.round(pos - this._grabOffset - this._containerStart);
        if (this.snapEdge) {
          if (target < this.minLeft - this.snap) {
            if (this.collapsed !== 'a') { this.collapsed = 'a'; this.emitSize(); }
            return;
          }
          if (target > this.maxLeft + this.snap) {
            if (this.collapsed !== 'b') { this.collapsed = 'b'; this.emitSize(); }
            return;
          }
        }
        const wasCollapsed = this.collapsed;
        this.collapsed = null;
        const clamped = Math.min(Math.max(target, this.minLeft), this.maxLeft);
        this.ratio = clamped / w;
        if (wasCollapsed) this.$emit('collapse', null);
        this.emitSize();
      },
      endDrag() {
        if (!this.dragging) return;
        this.dragging = false;
        document.body.classList.remove('kit-split-resizing');
        document.body.classList.remove('kit-split-resizing--vertical');
        window.removeEventListener('pointermove', this.onPointerMove);
        window.removeEventListener('pointerup', this.endDrag);
        window.removeEventListener('pointercancel', this.endDrag);
        this.writeStored(this.leftPx);
        this.$emit('update:modelValue', this.leftPx);
        this.$emit('resize-end', this.leftPx);
        this.$emit('collapse', this.collapsed);
      },
      /* ---- 键盘 ---- */
      onHandleKey(e) {
        const step = e.shiftKey ? 32 : 8;
        let delta = 0;
        if (this.vertical) {
          if (e.key === 'ArrowDown') delta = step;
          else if (e.key === 'ArrowUp') delta = -step;
        } else {
          if (e.key === 'ArrowRight') delta = step;
          else if (e.key === 'ArrowLeft') delta = -step;
        }
        if (delta) {
          e.preventDefault();
          const next = this.leftPx + delta;
          if (this.snapEdge && next < this.minLeft) {
            this.collapsed = 'a';
          } else if (this.snapEdge && next > this.maxLeft) {
            this.collapsed = 'b';
          } else {
            this.collapsed = null;
            this.ratio = Math.min(Math.max(next, this.minLeft), this.maxLeft) / this.containerW;
          }
          this.writeStored(this.leftPx);
          this.emitSize();
          this.$emit('collapse', this.collapsed);
          return;
        }
        if (e.key === 'Home') {
          e.preventDefault();
          this.reset();
        }
      },
      /* ---- 双击复位 ---- */
      onHandleDblClick(e) {
        e.preventDefault();
        this.reset();
      },
      reset() {
        this.collapsed = null;
        this.ratio = this.initial;
        this.clampRatio();
        this.emitSize();
        this.$emit('collapse', null);
        this.writeStored(this.leftPx);
      },
    },
    template: `
      <div ref="root" class="kit-split" :class="['kit-split--' + direction, { 'is-collapsed-a': collapsed === 'a', 'is-collapsed-b': collapsed === 'b', 'is-dragging': dragging }]">
        <div class="kit-split__pane kit-split__pane--a" :style="paneStyle"><slot name="a"></slot></div>
        <div class="kit-split__divider" role="separator"
          :aria-orientation="vertical ? 'horizontal' : 'vertical'"
          aria-label="拖动调整面板大小，双击恢复默认"
          title="拖动调整大小，双击恢复默认"
          tabindex="0"
          :aria-valuemin="minLeft" :aria-valuemax="maxLeft" :aria-valuenow="Math.round(leftPx)"
          @pointerdown="onPointerDown" @keydown="onHandleKey" @dblclick="onHandleDblClick">
          <span class="kit-split__divider-line"></span>
          <span class="kit-split__divider-grip"></span>
        </div>
        <div class="kit-split__pane kit-split__pane--b"><slot name="b"></slot></div>
      </div>
    `,
  };


  const KitChip = {
    name: 'KitChip',
    props: {
      variant: { type: String, default: 'outline' }, // outline | filled | tonal
      closable: Boolean,
      selectable: Boolean,
      selected: Boolean,
    },
    emits: ['close', 'select'],
    template: `
      <span class="kit-chip" :class="[
        'kit-chip--' + (selected && variant === 'outline' ? 'filled' : variant),
        { 'kit-chip--selectable': selectable }]"
        @click="selectable && $emit('select')">
        <slot></slot>
        <button v-if="closable" type="button" class="kit-chip__close material-symbols-outlined"
          @click.stop="$emit('close')">close</button>
      </span>
    `,
  };

  const KitBadge = {
    name: 'KitBadge',
    props: {
      variant: { type: String, default: 'neutral' }, // ok | error | neutral | primary | warning | info
    },
    template: `<span class="kit-badge" :class="'kit-badge--' + variant"><slot></slot></span>`,
  };

  const KitStatusDot = {
    name: 'KitStatusDot',
    props: {
      status: { type: String, default: 'pending' }, // pending | running | ok | error | warning | info
    },
    template: `<span class="kit-status-dot" :class="'kit-status-dot--' + status"></span>`,
  };

  const KitField = {
    name: 'KitField',
    props: {
      label: String,
      icon: String,
      hint: String,
      error: String,
      required: Boolean,
      layout: { type: String, default: 'stacked' }, // stacked: 标题在上 | row: 标题在左控件在右
    },
    computed: {
      isRow() { return this.layout === 'row'; },
    },
    template: `
      <div class="kit-field" :class="{ 'kit-field--row': isRow }">
        <label v-if="label" class="kit-field__label">
          <span v-if="icon" class="material-symbols-outlined">{{ icon }}</span>
          <span class="kit-field__label-txt">{{ label }}</span>
          <span v-if="required" class="text-error">*</span>
          <kit-tooltip v-if="isRow && hint" :text="hint" placement="top">
            <span class="kit-field__tip material-symbols-outlined">info</span>
          </kit-tooltip>
        </label>
        <slot></slot>
        <span v-if="error" class="kit-field__error">
          <span class="material-symbols-outlined icon-xs">error</span>{{ error }}
        </span>
        <span v-else-if="hint && !isRow" class="kit-field__hint">{{ hint }}</span>
      </div>
    `,
  };

  const KitSegmented = {
    name: 'KitSegmented',
    props: {
      modelValue: [String, Number],
      options: { type: Array, required: true }, // [{label, value, icon?}]
    },
    emits: ['update:modelValue'],
    template: `
      <div class="kit-segmented">
        <button v-for="opt in options" :key="opt.value" type="button"
          class="kit-segmented__item" :class="{ 'kit-segmented__item--active': modelValue === opt.value }"
          @click="$emit('update:modelValue', opt.value)">
          <span v-if="opt.icon" class="material-symbols-outlined icon-xs">{{ opt.icon }}</span>
          {{ opt.label }}
        </button>
      </div>
    `,
  };

  const KitTagInput = {
    name: 'KitTagInput',
    props: {
      modelValue: { type: Array, default: () => [] },
      placeholder: String,
      disabled: Boolean,
    },
    emits: ['update:modelValue'],
    data() { return { draft: '' }; },
    methods: {
      add() {
        const v = this.draft.trim();
        if (v && !this.modelValue.includes(v)) {
          this.$emit('update:modelValue', [...this.modelValue, v]);
        }
        this.draft = '';
      },
      remove(tag) {
        this.$emit('update:modelValue', this.modelValue.filter(t => t !== tag));
      },
      onKeydown(e) {
        if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); this.add(); }
        else if (e.key === 'Backspace' && !this.draft && this.modelValue.length) {
          this.remove(this.modelValue[this.modelValue.length - 1]);
        }
      },
    },
    template: `
      <div class="kit-tag-input">
        <span v-for="tag in modelValue" :key="tag" class="kit-tag-input__tag">
          {{ tag }}
          <span class="material-symbols-outlined" @click="remove(tag)">close</span>
        </span>
        <input v-model="draft" :placeholder="placeholder" :disabled="disabled"
          @keydown="onKeydown" @blur="add">
      </div>
    `,
  };

  /* ---------- 反馈组件 ---------- */

  const KitDialog = {
    name: 'KitDialog',
    props: {
      modelValue: Boolean,
      title: String,
      icon: String,
      size: { type: String, default: 'md' }, // sm | md | lg
      showClose: { type: Boolean, default: true },
      showFooter: { type: Boolean, default: true },
      closeOnOverlay: { type: Boolean, default: true },
    },
    emits: ['update:modelValue', 'close'],
    methods: {
      close() { this.$emit('update:modelValue', false); this.$emit('close'); },
      onOverlay(e) { if (this.closeOnOverlay && e.target === e.currentTarget) this.close(); },
    },
    template: `
      <teleport to="body">
        <transition name="fade">
          <div v-if="modelValue" class="kit-overlay" @click.self="onOverlay">
            <transition name="pop" appear>
              <div class="kit-dialog" :class="'kit-dialog--' + size" role="dialog" aria-modal="true">
                <div v-if="title" class="kit-dialog__header">
                  <span class="kit-dialog__title">
                    <span v-if="icon" class="material-symbols-outlined">{{ icon }}</span>
                    {{ title }}
                  </span>
                  <kit-icon-button v-if="showClose" icon="close" size="sm" @click="close()"></kit-icon-button>
                </div>
                <div class="kit-dialog__body"><slot></slot></div>
                <div v-if="showFooter || $slots.footer" class="kit-dialog__footer">
                  <slot name="footer">
                    <kit-button variant="outlined" @click="close()">关闭</kit-button>
                  </slot>
                </div>
              </div>
            </transition>
          </div>
        </transition>
      </teleport>
    `,
  };

  const KitConfirm = {
    name: 'KitConfirm',
    props: {
      modelValue: Boolean,
      title: { type: String, default: '确认操作' },
      message: String,
      type: { type: String, default: 'warning' }, // warning | danger | info
      confirmText: { type: String, default: '确认' },
      cancelText: { type: String, default: '取消' },
    },
    emits: ['update:modelValue', 'confirm', 'cancel'],
    methods: {
      onConfirm() { this.$emit('confirm'); this.$emit('update:modelValue', false); },
      onCancel() { this.$emit('cancel'); this.$emit('update:modelValue', false); },
    },
    computed: {
      iconName() {
        return { warning: 'warning', danger: 'delete', info: 'info' }[this.type] || 'warning';
      },
    },
    template: `
      <teleport to="body">
        <transition name="fade">
          <div v-if="modelValue" class="kit-overlay" @click.self="onCancel">
            <transition name="pop" appear>
              <div class="kit-dialog kit-dialog--sm" role="alertdialog" aria-modal="true">
                <div class="kit-dialog__body flex items-start gap-3 p-4">
                  <span class="kit-confirm-icon" :class="'kit-confirm-icon--' + type">
                    <span class="material-symbols-outlined">{{ iconName }}</span>
                  </span>
                  <div class="flex-1">
                    <div class="font-semibold text-sm text-on-surface mb-1">{{ title }}</div>
                    <div class="text-xs text-on-surface-variant leading-relaxed">{{ message }}</div>
                    <slot></slot>
                  </div>
                </div>
                <div class="kit-dialog__footer">
                  <kit-button variant="outlined" @click="onCancel">{{ cancelText }}</kit-button>
                  <kit-button :variant="type === 'danger' ? 'error' : 'filled'" @click="onConfirm">{{ confirmText }}</kit-button>
                </div>
              </div>
            </transition>
          </div>
        </transition>
      </teleport>
    `,
  };

  /* ---------- Toast / Notify ---------- */

  const KitToastHost = {
    name: 'KitToastHost',
    data() {
      return { toasts: [] };
    },
    methods: {
      add(options) {
        const id = uid();
        const toast = {
          id,
          type: options.type || 'info',
          message: options.message || '',
          duration: options.duration != null ? options.duration : 3000,
          icon: options.icon || ICONS[options.type || 'info'],
        };
        this.toasts.push(toast);
        if (toast.duration > 0) {
          setTimeout(() => this.remove(id), toast.duration);
        }
        return id;
      },
      remove(id) {
        const idx = this.toasts.findIndex(t => t.id === id);
        if (idx >= 0) this.toasts.splice(idx, 1);
      },
    },
    template: `
      <div class="kit-toast-container">
        <transition-group name="kit-toast">
          <div v-for="t in toasts" :key="t.id" class="kit-toast" :class="'kit-toast--' + t.type">
            <span class="kit-toast__icon material-symbols-outlined">{{ t.icon }}</span>
            <span class="kit-toast__msg">{{ t.message }}</span>
            <button class="kit-toast__close" type="button" aria-label="关闭通知" @click="remove(t.id)">
              <span class="material-symbols-outlined icon-xs">close</span>
            </button>
          </div>
        </transition-group>
      </div>
    `,
  };

  const KitTooltip = {
    name: 'KitTooltip',
    props: {
      text: String,
      placement: { type: String, default: 'top' }, // top | bottom | left | right
    },
    data() {
      return { visible: false, x: 0, y: 0 };
    },
    methods: {
      show(e) {
        this.visible = true;
        this.$nextTick(() => this.position(e.currentTarget));
      },
      hide() { this.visible = false; },
      position(el) {
        const rect = el.getBoundingClientRect();
        const tip = this.$refs.tip;
        const tw = tip.offsetWidth, th = tip.offsetHeight;
        const gap = 6;
        const pos = { top: rect.top - th - gap, bottom: rect.bottom + gap, left: rect.left, right: rect.right };
        const x = { top: rect.left + rect.width / 2 - tw / 2, bottom: rect.left + rect.width / 2 - tw / 2, left: rect.left - tw - gap, right: rect.right + gap }[this.placement];
        const y = { top: pos.top, bottom: pos.bottom, left: rect.top + rect.height / 2 - th / 2, right: rect.top + rect.height / 2 - th / 2 }[this.placement];
        // 边界修正
        this.x = Math.max(4, Math.min(x, window.innerWidth - tw - 4));
        this.y = Math.max(4, y);
      },
    },
    template: `
      <span class="inline-flex" @mouseenter="show" @mouseleave="hide">
        <slot></slot>
        <span ref="tip" class="kit-tooltip" :class="{ 'kit-tooltip--visible': visible }"
          :style="{ left: x + 'px', top: y + 'px' }">{{ text }}</span>
      </span>
    `,
  };

  /* ---------- 指令: v-tooltip ---------- */

  const vTooltip = {
    mounted(el, binding) {
      const text = binding.value;
      if (!text) return;
      const tip = document.createElement('span');
      tip.className = 'kit-tooltip';
      tip.textContent = text;
      document.body.appendChild(tip);
      const show = () => {
        tip.classList.add('kit-tooltip--visible');
        const rect = el.getBoundingClientRect();
        tip.style.left = rect.left + rect.width / 2 - tip.offsetWidth / 2 + 'px';
        tip.style.top = rect.top - tip.offsetHeight - 6 + 'px';
      };
      const hide = () => tip.classList.remove('kit-tooltip--visible');
      el.addEventListener('mouseenter', show);
      el.addEventListener('mouseleave', hide);
      el._kitTip = { tip, show, hide };
    },
    updated(el, binding) {
      if (el._kitTip) el._kitTip.tip.textContent = binding.value || '';
    },
    unmounted(el) {
      if (el._kitTip) {
        el.removeEventListener('mouseenter', el._kitTip.show);
        el.removeEventListener('mouseleave', el._kitTip.hide);
        el._kitTip.tip.remove();
        el._kitTip = null;
      }
    },
  };

  /* ---------- Dropdown 下拉（AxDropdown 复刻） ---------- */

  const KitDropdown = {
    name: 'KitDropdown',
    props: {
      modelValue: Boolean,
      items: { type: Array, default: () => [] }, // [{label, value, icon?, danger?, disabled?}]
      placement: { type: String, default: 'bottom-start' }, // bottom-start | bottom-end | top-start | top-end
      offset: { type: Number, default: 4 },
      matchWidth: Boolean,          // 面板宽度与触发器一致
      menuWidth: String,
      menuMaxWidth: String,
      trigger: { type: String, default: 'click' }, // click | hover | contextmenu
      hoverCloseDelay: { type: Number, default: 150 },
      teleport: { type: Boolean, default: true },
    },
    emits: ['update:modelValue', 'select'],
    data() {
      return { isOpen: this.modelValue, pos: { left: 0, top: 0 }, positioned: false, closeTimer: null };
    },
    watch: {
      modelValue(v) { this.isOpen = v; },
      isOpen(v) { this.$emit('update:modelValue', v); },
    },
    computed: {
      triggerEvents() {
        const self = this;
        if (this.trigger === 'hover') {
          return {
            onMouseenter: () => this.open(),
            onMouseleave: () => this.scheduleClose(),
          };
        }
        if (this.trigger === 'contextmenu') {
          return { onContextmenu: (e) => { e.preventDefault(); this.open(); } };
        }
        return { onClick: () => this.toggle() };
      },
      panelEvents() {
        if (this.trigger !== 'hover') return {};
        const self = this;
        return {
          onMouseenter: () => this.clearCloseTimer(),
          onMouseleave: () => this.close(),
        };
      },
    },
    methods: {
      open() { this.clearCloseTimer(); this.isOpen = true; },
      close() { this.clearCloseTimer(); this.isOpen = false; },
      toggle() { this.isOpen ? this.close() : this.open(); },
      clearCloseTimer() {
        if (this.closeTimer) { clearTimeout(this.closeTimer); this.closeTimer = null; }
      },
      scheduleClose() {
        this.clearCloseTimer();
        this.closeTimer = setTimeout(() => this.close(), this.hoverCloseDelay);
      },
      onClickOutside(e) {
        if (!this.isOpen) return;
        const el = this.$refs.container;
        const menu = this.$refs.menu;
        if (el && el.contains(e.target)) return;
        if (menu && menu.contains(e.target)) return;
        this.close();
      },
      onKeydown(e) {
        if (e.key === 'Escape' && this.isOpen) this.close();
      },
      onSelect(item) {
        if (item.disabled) return;
        this.$emit('select', item.value, item);
        this.close();
      },
      positionMenu() {
        const trigger = this.$refs.trigger;
        const menu = this.$refs.menu;
        if (!trigger || !menu) return;
        const tr = trigger.getBoundingClientRect();
        const mr = menu.getBoundingClientRect();
        const gap = this.offset;
        let left, top;
        const alignEnd = this.placement.endsWith('end');
        const alignTop = this.placement.startsWith('top');
        if (this.matchWidth) {
          left = tr.left;
          menu.style.minWidth = tr.width + 'px';
        } else if (alignEnd) {
          left = tr.right - mr.width;
        } else {
          left = tr.left;
        }
        top = alignTop ? tr.top - mr.height - gap : tr.bottom + gap;
        // 视口边界修正
        left = Math.max(4, Math.min(left, window.innerWidth - mr.width - 4));
        if (top < 4) top = tr.bottom + gap;
        if (top + mr.height > window.innerHeight - 4) top = tr.top - mr.height - gap;
        this.pos = { left: Math.round(left), top: Math.round(top) };
        this.positioned = true;
      },
    },
    mounted() {
      document.addEventListener('mousedown', this.onClickOutside);
      document.addEventListener('keydown', this.onKeydown);
      this.$nextTick(() => this.positionMenu());
    },
    updated() {
      if (this.isOpen) this.$nextTick(() => this.positionMenu());
    },
    beforeUnmount() {
      document.removeEventListener('mousedown', this.onClickOutside);
      document.removeEventListener('keydown', this.onKeydown);
      this.clearCloseTimer();
    },
    template: `
      <span ref="container" class="kit-dropdown-base">
        <span ref="trigger" v-bind="triggerEvents"><slot name="trigger" :open="isOpen" :toggle="toggle" :close="close"></slot></span>
        <teleport to="body" :disabled="!teleport">
          <transition name="kit-dropdown">
            <div v-if="isOpen" ref="menu" class="kit-dropdown-menu" :style="{
              position: 'fixed',
              left: pos.left + 'px',
              top: pos.top + 'px',
              minWidth: menuWidth || undefined,
              maxWidth: menuMaxWidth || undefined,
              visibility: positioned ? 'visible' : 'hidden',
            }" v-bind="panelEvents" role="menu">
              <template v-if="items.length">
                <template v-for="(item, i) in items" :key="item.value || i">
                  <div v-if="item.divider" class="kit-dropdown-divider"></div>
                  <button v-else type="button" class="kit-dropdown-item"
                    :class="{ 'kit-dropdown-item--danger': item.danger, 'kit-dropdown-item--active': item.active }"
                    :disabled="item.disabled" @click="onSelect(item)">
                    <span v-if="item.icon" class="material-symbols-outlined">{{ item.icon }}</span>
                    {{ item.label }}
                  </button>
                </template>
              </template>
              <slot :close="close"></slot>
            </div>
          </transition>
        </teleport>
      </span>
    `,
  };

  /* ---------- Tabs ---------- */

  const KitTabs = {
    name: 'KitTabs',
    props: {
      modelValue: [String, Number],
      tabs: { type: Array, required: true }, // [{label, value, icon?}]
    },
    emits: ['update:modelValue'],
    template: `
      <div class="kit-tabs">
        <button v-for="t in tabs" :key="t.value" type="button"
          class="kit-tab" :class="{ 'kit-tab--active': modelValue === t.value }"
          @click="$emit('update:modelValue', t.value)">
          <span v-if="t.icon" class="material-symbols-outlined icon-sm">{{ t.icon }}</span>
          {{ t.label }}
        </button>
      </div>
    `,
  };

  /* ---------- Card ---------- */

  const KitCard = {
    name: 'KitCard',
    props: {
      title: String,
      icon: String,
      elevated: Boolean,
    },
    template: `
      <div class="kit-card" :class="{ 'kit-card--elevated': elevated }">
        <div v-if="title || $slots.header" class="kit-card__header">
          <span class="kit-card__title">
            <span v-if="icon" class="material-symbols-outlined icon-sm">{{ icon }}</span>
            <slot name="title">{{ title }}</slot>
          </span>
          <slot name="header-actions"></slot>
        </div>
        <div class="kit-card__body"><slot></slot></div>
        <div v-if="$slots.footer" class="kit-card__footer"><slot name="footer"></slot></div>
      </div>
    `,
  };

  const KitEmpty = {
    name: 'KitEmpty',
    props: {
      icon: { type: String, default: 'inbox' },
      title: String,
      desc: String,
    },
    template: `
      <div class="kit-empty">
        <span class="material-symbols-outlined">{{ icon }}</span>
        <span v-if="title" class="kit-empty__title">{{ title }}</span>
        <span v-if="desc" class="kit-empty__desc">{{ desc }}</span>
        <slot></slot>
      </div>
    `,
  };

  const KitAlert = {
    name: 'KitAlert',
    props: {
      type: { type: String, default: 'info' }, // info | success | warning | error
      icon: String,
      title: String,
    },
    computed: {
      iconName() {
        return this.icon || ({ info: 'info', success: 'check_circle', error: 'error', warning: 'warning' })[this.type] || 'info';
      },
    },
    template: `
      <div class="kit-alert" :class="'kit-alert--' + type">
        <span class="kit-alert__icon material-symbols-outlined">{{ iconName }}</span>
        <div class="kit-alert__body">
          <strong v-if="title" class="kit-alert__title">{{ title }}</strong>
          <slot></slot>
        </div>
      </div>
    `,
  };

  const KitSkeleton = {
    name: 'KitSkeleton',
    props: {
      width: String,
      height: { type: String, default: '14px' },
      rounded: { type: String, default: '4px' },
    },
    template: `<span class="kit-skeleton inline-block" :style="{ width, height, borderRadius: rounded }"></span>`,
  };

  const KitProgress = {
    name: 'KitProgress',
    props: {
      value: { type: Number, default: 0 }, // 0-100
      status: { type: String, default: '' }, // '' | ok | error
    },
    template: `
      <div class="kit-progress" :class="{ 'kit-progress--ok': status === 'ok', 'kit-progress--error': status === 'error' }">
        <div class="kit-progress__bar" :style="{ width: Math.min(100, Math.max(0, value)) + '%' }"></div>
      </div>
    `,
  };

  /* ---------- Notify 服务 (程序化调用) ---------- */

  let toastHost = null;

  function ensureToastHost(app) {
    if (toastHost) return;
    const host = { render: () => null };
    // 通过一个隐藏组件挂载 host
    const hostDiv = document.createElement('div');
    hostDiv.id = 'kit-toast-host';
    document.body.appendChild(hostDiv);
    const HostApp = global.Vue.createApp({
      template: '<kit-toast-host ref="host"></kit-toast-host>',
    });
    HostApp.component('KitToastHost', KitToastHost);
    const vm = HostApp.mount(hostDiv);
    toastHost = vm.$refs.host;
  }

  const notify = {
    install(app) {
      app.config.globalProperties.$notify = notify;
      app.config.globalProperties.$toast = notify;
      app.config.globalProperties.$confirm = function (options) {
        return notify.confirm(options);
      };
      app.config.globalProperties.$dialog = function (options) {
        return notify.dialog(options);
      };
    },
    show(options) {
      ensureToastHost();
      if (typeof options === 'string') options = { message: options };
      return toastHost.add(options);
    },
    info(message, duration) { return notify.show({ type: 'info', message, duration }); },
    success(message, duration) { return notify.show({ type: 'success', message, duration }); },
    error(message, duration) { return notify.show({ type: 'error', message, duration }); },
    warning(message, duration) { return notify.show({ type: 'warning', message, duration }); },

    /* ---- 程序化 Confirm / Dialog ---- */
    confirm(options) {
      if (typeof options === 'string') options = { message: options };
      const opts = Object.assign({
        title: '确认操作',
        type: 'warning',
        confirmText: '确认',
        cancelText: '取消',
      }, options);
      return new Promise((resolve) => {
        const div = document.createElement('div');
        document.body.appendChild(div);
        const vm = global.Vue.createApp({
          data() { return { visible: true }; },
          methods: {
            onConfirm() { cleanup(true); },
            onCancel() { cleanup(false); },
          },
          template: `
            <kit-confirm v-model="visible" :title="opts.title" :message="opts.message"
              :type="opts.type" :confirm-text="opts.confirmText" :cancel-text="opts.cancelText"
              @confirm="onConfirm" @cancel="onCancel"></kit-confirm>
          `,
          computed: { opts: () => opts },
        });
        vm.component('KitConfirm', KitConfirm);
        vm.component('KitButton', KitButton);
        vm.component('KitIconButton', KitIconButton);
        vm.mount(div);
        function cleanup(result) {
          vm.unmount();
          div.remove();
          resolve(result);
        }
      });
    },
    dialog(options) {
      if (typeof options === 'string') options = { content: options };
      const opts = Object.assign({ title: '', size: 'md', showClose: true }, options);
      return new Promise((resolve) => {
        const div = document.createElement('div');
        document.body.appendChild(div);
        const vm = global.Vue.createApp({
          data() { return { visible: true }; },
          methods: {
            close() { cleanup(); },
          },
          template: `
            <kit-dialog v-model="visible" :title="opts.title" :icon="opts.icon" :size="opts.size"
              :show-close="opts.showClose" @close="close">
              <div v-html="opts.content"></div>
            </kit-dialog>
          `,
          computed: { opts: () => opts },
        });
        vm.component('KitDialog', KitDialog);
        vm.component('KitButton', KitButton);
        vm.component('KitIconButton', KitIconButton);
        vm.mount(div);
        function cleanup() {
          vm.unmount();
          div.remove();
          resolve();
        }
      });
    },
  };

  /* ---------- 插件入口 ---------- */

  const UIKit = {
    install(app) {
      const components = {
        KitButton, KitIconButton, KitInput, KitTextarea, KitSelect,
        KitCheckbox, KitRadio, KitSwitch, KitSlider, KitNumberField, KitSplit,
        KitChip, KitBadge, KitStatusDot, KitField, KitSegmented, KitTagInput,
        KitDialog, KitConfirm, KitToastHost, KitTooltip, KitDropdown, KitTabs,
        KitCard, KitEmpty, KitAlert, KitSkeleton, KitProgress,
      };
      for (const [name, comp] of Object.entries(components)) {
        app.component(name, comp);
      }
      app.component('KitOption', KitOption);
      app.directive('tooltip', vTooltip);
      notify.install(app);
    },
  };

  global.UIKit = UIKit;
  global.KitNotify = notify;

})(typeof window !== 'undefined' ? window : this);
