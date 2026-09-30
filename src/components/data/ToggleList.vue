<script setup lang="ts">
// ⛔ 保护 — 切换列表，禁止：clamp() → px，展开/折叠动画
//    需我确认：ExtraColumn 接口扩展、toggle 行为
import IconSvg from '@/components/basic/IconSvg.vue'
import Loading from '@/components/feedback/Loading.vue'
import Empty from './Empty.vue'
import { computed } from 'vue'
import { useT } from '@/components/_internal/i18n'

const t = useT()

interface ExtraColumn {
  key: string
  label: string
}

interface Props {
  /** 列表数据（行对象按各 *Field prop 取列） */
  items: Record<string, any>[]
  /** 行唯一键字段名（默认 'id'） */
  idKey?: string
  /** 标题字段名（默认 'display_name'） */
  titleField?: string
  /** 描述字段名（默认 'description'） */
  descriptionField?: string
  /** 图标字段名（默认 'icon'） */
  iconField?: string
  /** 开关绑定字段名（默认 'is_enabled'） */
  toggleField?: string
  /** 追加列（状态标签等，ExtraColumn：取值字段/格式化/标签色） */
  extraColumns?: ExtraColumn[]
  /** 整列禁用（开关与按钮不可操作） */
  disabled?: boolean
  /** 加载态（显示骨架行） */
  isLoading?: boolean
  /** 空数据文案（空串用内置 i18n） */
  emptyText?: string
  /** 'switch' = 开关列表, 'button' = 操作按钮（发快递等场景） */
  variant?: 'switch' | 'button'
  /** variant='button' 时按钮文字（空串用内置 i18n） */
  buttonLabel?: string
  /** variant='button' 时手机号字段 */
  phoneField?: string
}

const props = withDefaults(defineProps<Props>(), {
  idKey: 'id',
  titleField: 'display_name',
  descriptionField: 'description',
  iconField: 'icon',
  toggleField: 'is_enabled',
  extraColumns: () => [],
  disabled: false,
  isLoading: false,
  emptyText: '',
  variant: 'switch',
  buttonLabel: '',
  phoneField: 'phone',
})

// 默认文案走 i18n：emptyText/buttonLabel 未传时用词条，加载态固定用 common.loading
const effectiveEmptyText = computed(() => props.emptyText || t('common.empty'))
const effectiveButtonLabel = computed(() => props.buttonLabel || t('common.sendExpress'))

const emit = defineEmits<{
  /** 开关切换：[行对象, 切换后的新值]（内部同步回写行数据，extraColumns 状态标签立即更新） */
  toggle: [item: Record<string, any>, newValue: boolean]
  /** 行点击 */
  'item-click': [item: Record<string, any>]
  /** variant='button' 时点击按钮，payload: { name, phone, address, item } */
  'button-click': [payload: { name: string; phone: string; address: string; item: Record<string, any> }]
}>()

/** switch toggle — 同步更新 item 数据，使 extraColumns 等状态标签立即更新 */
function onToggle(item: Record<string, any>, newValue: boolean) {
  if (props.toggleField) {
    item[props.toggleField] = newValue
  }
  emit('toggle', item, newValue)
}

/** 行点击/键盘激活：事件来自行内真实控件（开关/按钮）时不抢发 itemClick。
    click 的 detail>0 说明是真实点击且已由 label @click.stop 拦截内层；
    keydown 只认 target 为行本身（内层控件自己的 Enter/Space 行为归控件） */
function onItemClick(e: MouseEvent | KeyboardEvent, item: Record<string, any>) {
  if (e.type === 'keydown' && e.target !== e.currentTarget) return
  emit('item-click', item)
}
</script>

<template>
  <div class="toggle-list">
    <!-- 加载/空态复用库内统一组件，图标/字号/间距与全库一致 -->
    <Loading v-if="isLoading" variant="spinner" size="md" :text="t('common.loading')" class="list-state" />

    <Empty v-else-if="!items.length" :title="effectiveEmptyText" class="list-state" />

    <div v-else class="list-items">
      <!--
        整行 role=button + tabindex=0：行的主交互是选中（itemClick），回车/空格直达，
        这是库的公开契约（tests/unit/keyboard-a11y.spec.ts 有回归锁）。
        注意：切到 checkbox 未选中态由尾部开关独立处理——axe 会报
        nested-interactive（button 内嵌可聚焦 checkbox）。解除办法是拆掉嵌套
        （行改 group + 复选框独立），但那要改 Enter 契约并动 demo/单测，
        已登记为取舍项（见 docs/全量审查报告-2026-09-20.md Q12）。
      -->
      <div
        v-for="item in items"
        :key="item[idKey]"
        class="list-item"
        role="button"
        tabindex="0"
        @click="onItemClick($event, item)"
        @keydown.enter="onItemClick($event, item)"
        @keydown.space.prevent="onItemClick($event, item)"
      >
        <div v-if="item[iconField]" class="item-icon">
          <IconSvg :type="item[iconField]" size="md" />
        </div>
        <div class="item-content">
          <div class="item-title">
            {{ item[titleField] }}
          </div>
          <div v-if="item[descriptionField]" class="item-desc">
            {{ item[descriptionField] }}
          </div>
        </div>
        <div v-if="extraColumns.length" class="item-extras">
          <span v-for="col in extraColumns" :key="col.key" class="item-extra">{{ item[col.key] }}</span>
        </div>
        <!-- 开关变体：input 视觉隐藏但保留可聚焦（display:none 会退出 Tab 序，键盘无法切换） -->
        <label
          v-if="variant === 'switch' && toggleField && item[toggleField] !== undefined"
          class="item-toggle"
          :aria-label="String(item[titleField] ?? '')"
          @click.stop
        >
          <input
            type="checkbox"
            class="toggle-input"
            :checked="item[toggleField]"
            :disabled="disabled"
            @change="onToggle(item, ($event.target as HTMLInputElement).checked)"
          />
          <span class="toggle-switch" :class="{ disabled }" />
        </label>

        <!-- 按钮变体 -->
        <button
          v-if="variant === 'button'"
          class="item-action-btn"
          :disabled="disabled"
          @click.stop="
            emit('button-click', {
              name: item[titleField],
              phone: item[phoneField] ?? '',
              address: item[descriptionField] ?? '',
              item,
            })
          "
        >
          {{ effectiveButtonLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toggle-list {
  border: 1px solid var(--vcl-color-border);
  border-radius: var(--vcl-radius-lg);
  background: var(--vcl-color-surface);
  overflow: hidden;
}

.list-state {
  padding: calc(40px * var(--vcl-scale)) calc(20px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
  font-size: calc(15px * var(--vcl-scale));
}

.list-item {
  display: flex;
  align-items: center;
  gap: calc(12px * var(--vcl-scale));
  padding: calc(12px * var(--vcl-scale)) calc(16px * var(--vcl-scale));
  border-bottom: 1px solid var(--vcl-color-border-light);
  cursor: pointer;
  transition: background var(--vcl-transition-fast);
}
.list-item:last-child {
  border-bottom: none;
}
.list-item:hover {
  background: var(--vcl-color-bg-alt);
}

.item-icon {
  width: calc(38px * var(--vcl-scale));
  height: calc(38px * var(--vcl-scale));
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--vcl-color-bg-alt);
  border-radius: var(--vcl-radius-md);
  color: var(--vcl-color-text-secondary);
}
.item-content {
  flex: 1;
  min-width: 0;
}
.item-title {
  font-size: calc(15px * var(--vcl-scale));
  font-weight: 500;
}
.item-desc {
  font-size: calc(15px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
  margin-top: var(--vcl-space-1);
}

.item-extras {
  display: flex;
  gap: calc(16px * var(--vcl-scale));
}
.item-extra {
  font-size: calc(15px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
}

/* 开关 */
.item-toggle {
  display: flex;
  flex-shrink: 0;
}
/* 视觉隐藏但保留可聚焦（display:none 会退出 Tab 序，键盘用户无法切换开关） */
.toggle-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
.toggle-input:focus-visible + .toggle-switch {
  outline: 2px solid var(--vcl-color-primary);
  outline-offset: 2px;
}
.toggle-switch {
  width: calc(46px * var(--vcl-scale));
  height: calc(26px * var(--vcl-scale));
  background: var(--vcl-color-border);
  border-radius: var(--vcl-radius-lg);
  position: relative;
  cursor: pointer;
  transition: background var(--vcl-transition-fast);
}
.toggle-switch.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.toggle-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: calc(22px * var(--vcl-scale));
  height: calc(22px * var(--vcl-scale));
  background: white;
  border-radius: 50%;
  transition: transform var(--vcl-transition-fast);
  box-shadow: var(--vcl-shadow-sm);
}
.toggle-input:checked + .toggle-switch {
  background: var(--vcl-color-primary);
}
.toggle-input:checked + .toggle-switch::after {
  transform: translateX(20px);
}

/* 操作按钮 */
.item-action-btn {
  flex-shrink: 0;
  padding: var(--vcl-space-1) calc(14px * var(--vcl-scale));
  font-size: calc(15px * var(--vcl-scale));
  border: 1px solid var(--vcl-color-primary);
  border-radius: var(--vcl-radius-md);
  background: var(--vcl-color-primary);
  color: #fff;
  cursor: pointer;
  transition: opacity var(--vcl-transition-fast);
  white-space: nowrap;
}
.item-action-btn:hover {
  opacity: 0.85;
}
.item-action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
