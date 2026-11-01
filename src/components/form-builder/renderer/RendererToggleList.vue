<!--
  RendererToggleList —— 开关列表（输入型字段）

  组件自身的模型是"就地改行"（ToggleList 内部直接 `item[toggleField] = newValue`），
  而低代码字段需要的是一个**受控值**。两者对接的关键是：

  · **必须传本地副本**，不能把数据源的行直接交给 ToggleList —— 否则用户在表单里拨一下开关，
    就把数据源（可能是共享的静态配置或缓存）改了，下次打开表单看到的已经不是原始数据。
  · 字段值 = **被打开行的 id 数组**（提交后消费侧最直接想知道的就是"选了哪几项"），
    而不是整个行对象数组 —— 后者会把标题、描述等展示信息一起塞进提交数据。

  行 id 的取法：优先字段配置的 `rowKey`，否则用数据源的 `id`，都没有就按序补内部键
  （与明细表同一套约定）。
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import ToggleList from '@/components/data/ToggleList.vue'
import Empty from '@/components/data/Empty.vue'
import Skeleton from '@/components/data/Skeleton.vue'
import { useDisplayData } from '../display-data-source'
import type { ApiUrlPolicy } from '../api-url-guard'
import type { FormField } from '../types'

type Row = Record<string, unknown>

const props = defineProps<{
  /** 字段定义（displaySource / rowKey / toggleField 等取自这里） */
  field: FormField
  /** 当前值：被打开行的 id 数组 */
  modelValue: unknown
  /** 整个表单的数据（`field` 模式取值用） */
  formData?: Record<string, unknown>
  /** 外发 URL 策略（api 模式用；不传 = 只允许同源） */
  apiUrlPolicy?: ApiUrlPolicy
  /**
   * 外部判定为无效（不带文案）：挂到**组容器**上（#346）。
   * 三处都没有单一可聚焦控件（签名 canvas / 内嵌地图 / 子组件的多个开关），
   * 错误描述的是整组，所以挂容器。
   */
  invalid?: boolean
  /** 外部错误元素的 id：挂到 aria-describedby，读屏可回查「为什么无效」 */
  describedby?: string
}>()

const emit = defineEmits<{
  /** 开关变化后回填"被打开的 id 数组" */
  'update:modelValue': [v: unknown]
}>()

const { rows, loading, error } = useDisplayData({
  source: () => props.field.displaySource,
  formData: () => props.formData ?? {},
  apiUrlPolicy: () => props.apiUrlPolicy ?? {},
})

/** 行 id 字段：配置优先，否则 id，最后退回内部键 */
const INTERNAL_KEY = '__vcl_row_key'
const idField = computed(() => props.field.rowKey ?? 'id')
/** 开关字段：配置优先，否则 is_enabled（与组件默认一致） */
const toggleField = computed(() => (props.field as { toggleField?: string }).toggleField ?? 'is_enabled')
/** 标题/描述字段：配置优先，否则组件默认 */
const titleField = computed(() => (props.field as { titleField?: string }).titleField ?? 'display_name')
const descriptionField = computed(
  () => (props.field as { descriptionField?: string }).descriptionField ?? 'description',
)

/** 当前值 → 已打开 id 集合（容错：非数组当空） */
const currentIds = computed(() => {
  const v = props.modelValue
  if (!Array.isArray(v)) return new Set<string>()
  return new Set(v.map((x) => String(x)))
})

/** 本地副本：**绝不把数据源的行直接交给 ToggleList**（它会展就地改写它们） */
const localRows = ref<Row[]>([])

watch(
  rows,
  (list) => {
    const selected = currentIds.value
    localRows.value = list.map((r, i) => {
      const src = r && typeof r === 'object' && !Array.isArray(r) ? (r as Row) : { [INTERNAL_KEY]: i, value: r }
      const id = src[idField.value] !== undefined ? String(src[idField.value]) : `${INTERNAL_KEY}_${i}`
      // 复制一份，并把"是否打开"按字段值初始化——这样外部传进来的值能正确回显
      return { ...src, [INTERNAL_KEY]: id, [toggleField.value]: selected.has(id) }
    })
  },
  { immediate: true, deep: true },
)

/** 打开着的 id 列表 */
function emitValue(): void {
  const on = localRows.value.filter((r) => r[toggleField.value]).map((r) => String(r[INTERNAL_KEY]))
  emit('update:modelValue', on)
}

/** ToggleList 已经就地改好了本地副本，这里只需把结果同步成字段值 */
function onToggle(): void {
  emitValue()
}
</script>

<template>
  <div
    class="fb-toggle-list"
    role="group"
    :aria-label="field.label"
    :aria-invalid="invalid || undefined"
    :aria-describedby="describedby"
  >
    <Skeleton v-if="loading" :rows="3" />
    <Empty v-else-if="error" :description="error" />
    <Empty v-else-if="!localRows.length" />
    <ToggleList
      v-else
      :items="localRows"
      :id-key="INTERNAL_KEY"
      :toggle-field="toggleField"
      :title-field="titleField"
      :description-field="descriptionField"
      @toggle="onToggle"
    />
  </div>
</template>
