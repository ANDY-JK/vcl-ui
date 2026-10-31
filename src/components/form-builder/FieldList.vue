<script setup lang="ts">
/**
 * 字段列表渲染器 — FormBuilder 内部的字段列表复用片段
 *
 * 接收一个（已按容器/分组切分好的）字段数组 + 共享表单数据对象，
 * 逐个渲染 FormRenderer，统一处理 v-model 绑定、网格 span、错误与禁用态。
 * formData 传入的是响应式对象（按引用），子组件内直接写其属性即可触发父级深 watcher。
 */
import FormRenderer from './FormRenderer.vue'
import type { FormField, FormErrors, RenderSection } from './types'
import type { Option } from '@/components/shared/types'

const props = defineProps<{
  fields: FormField[]
  section: RenderSection
  formData: Record<string, unknown>
  errors: FormErrors
  disabled: boolean
  getOptions: (field: FormField) => Option[] | undefined
}>()

const emit = defineEmits<{
  change: [field: FormField]
  'update:field': [key: string, value: unknown]
  /** 字段获得焦点（focusin 冒泡，2026-10-31 接通 onFocus 动作） */
  focus: [field: FormField]
  /** 字段失去焦点（focusout 冒泡，2026-10-31 修复 onBlur 动作从未派发） */
  blur: [field: FormField]
}>()

/**
 * 字段包装样式（span 统一为 24 全域语义：12 = 半宽，与 PropsPanel/flex 一致）：
 * - 网格 section：--fb-span 下发折算后的跨列数（span/24×列数，2 列 span 12 → 1 格）
 * - flex section：--fb-span 保持 24 全域，追加 --fb-basis（span 折算宽度占比，
 *   消费在 FormBuilder 的 .fb-flex :deep(.fb-field)；FieldList 是多根片段，
 *   不继承父组件 scope id，父级 scoped 选择器选不中这里的 .fb-field）
 */
function fieldStyle(field: FormField): Record<string, string | number> {
  const raw = Math.min(Math.max(1, field.span || props.section.defaultSpan), 24)
  if (props.section.container?.type === 'flex') {
    return { '--fb-span': raw, '--fb-basis': `${(raw / 24) * 100}%` }
  }
  const cells = Math.max(1, Math.min(props.section.columns, Math.round((raw / 24) * props.section.columns)))
  return { '--fb-span': cells }
}
</script>

<template>
  <!--
    focusin / focusout 而不是 focus / blur：后两者**不冒泡**，原子字段组件（Input/Select/
    DatePicker/自定义渲染）各不相同、要一一补 emit；前两者从任何内部元素都能冒泡到本包裹层，
    一处接住全部字段类型的"获得焦点 / 失去焦点"，不必改 20 多个原子组件。
  -->
  <div
    v-for="field in fields"
    :key="field.key"
    class="fb-field"
    :style="fieldStyle(field)"
    @focusin="emit('focus', field)"
    @focusout="emit('blur', field)"
  >
    <FormRenderer
      :model-value="formData[field.key]"
      :field="field"
      :error="errors[field.key]"
      :disabled="disabled || field.disabled"
      :dynamic-options="getOptions(field)"
      @update:model-value="emit('update:field', field.key, $event)"
      @change="emit('change', field)"
    />
  </div>
</template>
