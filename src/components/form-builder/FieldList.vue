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
}>()

/** 计算字段在网格里的跨列 span */
function spanOf(field: FormField): number {
  return Math.max(1, Math.min(field.span || props.section.defaultSpan, props.section.columns))
}
</script>

<template>
  <div
    v-for="field in fields"
    :key="field.key"
    class="fb-field"
    :style="{ '--fb-span': spanOf(field) }"
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
