<script setup lang="ts">
// ⛔ 保护 — 切换列表，禁止：clamp() → px，展开/折叠动画
//    需我确认：ExtraColumn 接口扩展、toggle 行为
import IconSvg from '@/components/basic/IconSvg.vue'
import type { TableRow } from '@/components/_internal/api-any'
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
  items: TableRow[]
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
  toggle: [item: TableRow, newValue: boolean]
  /** 行点击 */
  'item-click': [item: TableRow]
  /** variant='button' 时点击按钮，payload: { name, phone, address, item } */
  'button-click': [payload: { name: string; phone: string; address: string; item: TableRow }]
}>()

/** switch toggle — 同步更新 item 数据，使 extraColumns 等状态标签立即更新 */
function onToggle(item: TableRow, newValue: boolean) {
  if (props.toggleField) {
    item[props.toggleField] = newValue
  }
  emit('toggle', item, newValue)
}

/** 行点击/键盘激活：事件来自行内真实控件（开关/按钮）时不抢发 itemClick。
    click 的 detail>0 说明是真实点击且已由 label @click.stop 拦截内层；
    keydown 只认 target 为行本身（内层控件自己的 Enter/Space 行为归控件） */
function onItemClick(e: MouseEvent | KeyboardEvent, item: TableRow) {
  if (e.type === 'keydown' && e.target !== e.currentTarget) return
  emit('item-click', item)
}

/**
 * 行内空格键（第 166 轮修）：`@keydown.space.prevent` 写在**整行**上时，焦点若在内层
 * `<input type="checkbox">`（或 button 变体的 `<button type="button">`），按键冒泡到行 → `.prevent`
 * 把默认行为（空格切换复选框）吃掉，而 `onItemClick` 又因 `target !== currentTarget`
 * 提前 return —— 结果**键盘用户完全无法用空格切换开关**（鼠标能点、Tab 能聚焦，但按空格没反应）。
 * 现在只有"焦点在行本身"时才拦截空格并发整行点击；焦点在内层控件时一律放行。
 */
function onRowSpace(e: KeyboardEvent, item: Parameters<typeof onItemClick>[1]) {
  if (e.target !== e.currentTarget) return // 内层控件自己的空格行为归控件
  e.preventDefault() // 行本身按空格：阻止页面滚动
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
        已登记为取舍项（见 docs/tech-debt.md 的 a11y 条目）。
      -->
      <div
        v-for="item in items"
        :key="item[idKey]"
        class="list-item"
        role="button"
        tabindex="0"
        @click="onItemClick($event, item)"
        @keydown.enter="onItemClick($event, item)"
        @keydown.space="onRowSpace($event, item)"
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
          type="button"
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

<style src="./toggle-list-scoped.css" scoped></style>
