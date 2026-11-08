<script setup lang="ts">
/**
 * SegmentedControl — 分段控制器（单选，值语义）
 *
 * 与 Tabs 的区别（别重复造）：
 *   - Tabs = `tablist`，切**视图**，选中即切换面板内容；
 *   - 本组件 = `radiogroup`，切**值**，选中即一个表单值（筛选粒度、时间范围、视图模式）。
 *   两者在读屏与表单语义上完全不同，不能互相顶替。
 *
 * 密排取向：一排全部选项摊平，**不换行、不开下拉**。选项多到放不下时横向滚动，
 * 而不是折行撑高面板 —— 一个 300px 的筛选条不该因为 5 个选项变成两行。
 */
import { computed } from 'vue'
import IconSvg from '@/components/basic/IconSvg.vue'
import { useIdSafe } from '@/components/_internal/useIdCompat'
import { useRovingTabindex } from '@/components/_internal/useRovingTabindex'
import type { Option } from '@/components/shared/types'

interface Props {
  /** 当前选中值。只收 string | number —— 布尔值属于 Switch 的语义，不属于分段选择 */
  modelValue: string | number
  /** 选项列表（复用全局 Option 结构；`value` 为布尔值的选项不在本组件契约内） */
  options: Option[]
  /** 整组禁用 */
  disabled?: boolean
  /** 无障碍组名：读屏念「<名字>，单选组」 */
  ariaLabel?: string
  /** sm = 更矮一档，用于工具条内嵌；md = 常规 */
  size?: 'sm' | 'md'
  /** 撑满容器宽度，每段等分（筛选条常用） */
  block?: boolean
}

/** 本组件认的键类型：roving tabindex 与 Option 的公共可比较子集 */
type SegValue = string | number

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  size: 'md',
  block: false,
})

const emit = defineEmits<{
  /** 选中值变化（配合 v-model 使用） */
  'update:modelValue': [value: SegValue]
  /** 选中值变化，附带被选中的选项，便于宿主做联动（如切换后重新拉数据） */
  change: [value: SegValue, option: Option]
}>()

const groupId = useIdSafe('seg')

/** 可聚焦的 key 只含未禁用项：禁用项既不该被 Tab 停靠，也不该被方向键选中 */
const enabledKeys = computed<SegValue[]>(() =>
  props.options.filter((o) => !isOptionDisabled(o)).map((o) => o.value as SegValue),
)

function isOptionDisabled(o: Option): boolean {
  return props.disabled || !!o.disabled
}

const roving = useRovingTabindex({
  keys: () => enabledKeys.value,
  activeKey: () => props.modelValue,
  orientation: 'horizontal',
})

function isActive(o: Option): boolean {
  return (o.value as SegValue) === props.modelValue
}

/** 模板里取 key 的唯一出口：Option.value 含 boolean，而 roving 只认 string | number */
function keyOf(o: Option): SegValue {
  return o.value as SegValue
}

function select(o: Option): void {
  // 写入口统一判可写（与 Group/Input 同一口径：禁用态不许落值）
  if (isOptionDisabled(o)) return
  const value = o.value as SegValue
  if (value === props.modelValue) return
  emit('update:modelValue', value)
  emit('change', value, o)
}

function selectByKey(key: string | number): void {
  const o = props.options.find((x) => x.value === key)
  if (o) select(o)
}

function onKeydown(e: KeyboardEvent): void {
  // 方向键 / Home / End：先让 roving 移动停靠点与真实焦点
  if (!roving.onKeydown(e)) return
  // radiogroup 语义是「焦点即选中」：箭头一按，值就跟着换（原生 radio 的行为）
  const key = roving.tabKey.value
  if (key != null) selectByKey(key)
}
</script>

<template>
  <div
    :id="groupId"
    class="seg"
    :class="[`seg-${size}`, { 'seg-block': block, 'seg-disabled': disabled }]"
    role="radiogroup"
    :aria-label="ariaLabel"
    :aria-disabled="disabled || undefined"
    @keydown="onKeydown"
  >
    <button
      v-for="o in options"
      :key="String(keyOf(o))"
      type="button"
      class="seg-btn"
      :class="{ active: isActive(o) }"
      role="radio"
      :aria-checked="isActive(o)"
      :disabled="isOptionDisabled(o)"
      :tabindex="roving.tabindexFor(keyOf(o))"
      :data-roving-key="String(keyOf(o))"
      @click="select(o)"
      @focus="roving.focusKey(keyOf(o))"
    >
      <IconSvg v-if="o.icon" :type="o.icon" size="xs" class="seg-icon" />
      <span class="seg-label" :title="o.label">{{ o.label }}</span>
    </button>
  </div>
</template>

<style src="./segmented-control-scoped.css" scoped></style>
