<script setup lang="ts">
/**
 * 字段组渲染（2026-10-21，审查 TD-02 后续 / FormBuilder 第十三刀）
 *
 * ## 为什么需要这个组件
 *
 * `FormBuilder.vue` 模板里有 **4 处 `<FieldList>` 调用**，它们传的 8 个 props 与
 * 2 个事件**完全相同**，只有 `:fields` 的表达式不同：
 *
 *   · tabs 容器     → `fieldsInTab(section, activeTabOf(section))`
 *   · collapse 容器 → `fieldsInCollapse(section, ci)`
 *   · steps 容器    → `fieldsInStep(section, stepIndexOf(section))`
 *   · 普通分组      → `section.fields`
 *
 * 4 × 10 行 = 40 行**完全重复**的模板。它们的危险不在于行数，而在于：
 * **改一处忘了另外三处** —— 比如给 FieldList 加一个新 prop，容易只加在一两个分支上，
 * 于是"tabs 里的必填红框不显示"这类 bug 只在某个布局下出现。
 *
 * 收敛成一个组件后，`FieldList` 的契约变化只改这里一处。
 *
 * ## 为什么不直接把 4 处合并成 1 处（用 v-for）
 *
 * 因为四个分支的**外层容器不同**（Tabs / Collapse / Steps / 直接渲染），
 * 合并会引入 `v-if` 嵌套地狱。这里只收敛"叶子"（FieldList 及其 props），
 * 容器结构仍归 FormBuilder —— 那是真正的差异，不该抽象掉。
 */
import type { FormField, RenderSection, FormErrors } from './types'
// Option 来自 shared 域（不是本域 types）—— 与 FieldList.vue 的来源保持一致
import type { Option } from '@/components/shared/types'
import FieldList from './FieldList.vue'

const props = defineProps<{
  /** 要渲染的字段（四个分支各算各的） */
  fields: FormField[]
  /** 所属 section（FieldList 用它算 span / flex basis） */
  section: RenderSection
  /** 表单数据 */
  formData: Record<string, unknown>
  /** 校验错误 */
  errors: FormErrors
  /** 是否禁用（含只读折算，由父级算好） */
  disabled: boolean
  /** 动态选项取数 */
  getOptions: (field: FormField) => Option[] | undefined
  /**
   * 可选统一事件出口（field, trigger）—— 2026-10-31 加：FormBuilder 的 4 个分支
   * 各自写 @change/@focus/@blur 三行模板是 12 行完全重复；收敛成一个 prop 后
   * 4 处各 1 行。仍 emit change/focus/blur（旧契约测试锁着组件间转发），
   * 传了 onEvent 就额外调用它 —— 两种消费方式并存。
   */
  onEvent?: (field: FormField, trigger: 'change' | 'focus' | 'blur') => void
}>()

const emit = defineEmits<{
  /** 字段值变更 → 转发给 FormBuilder 的 onFieldUpdate */
  'update:field': [key: string, value: unknown]
  /** 字段值交互 → 转发给 FormBuilder 的 handleFieldChange(field, 'change') */
  change: [field: FormField]
  /** 字段获得焦点 → handleFieldChange(field, 'focus')（2026-10-31 接通 onFocus） */
  focus: [field: FormField]
  /** 字段失去焦点 → handleFieldChange(field, 'blur')（2026-10-31 修复 onBlur 从未派发） */
  blur: [field: FormField]
}>()
</script>

<template>
  <!--
    只收敛 FieldList 及其 8 个 props / 2 个事件 —— **不碰外层容器**。

    ## 为什么试过吸收 Card 又撤回了
    4 个分支的 `<Card class="fb-group-card" :title :no-body-padding>` 看起来完全相同，
    一度把它们也收进本组件（FormBuilder 少 18 行）。**但跑测试就发现结构坏了**：
    tabs/collapse/steps 分支里 Card 原本包住「容器组件 + 字段列表」整体，
    吸收后变成「容器组件在 Card 外面」—— 视觉分组与 e2e 断言都不对。

    这是「相同 ≠ 可合并」的典型：**文本相同但层级语义不同**。
    容器结构是分支间真正的差异，不该被抽象掉。
  -->
  <FieldList
    :fields="fields"
    :section="section"
    :form-data="formData"
    :errors="errors"
    :disabled="disabled"
    :get-options="getOptions"
    @update:field="(key: string, value: unknown) => emit('update:field', key, value)"
    @change="
      (f: FormField) => {
        emit('change', f)
        props.onEvent?.(f, 'change')
      }
    "
    @focus="
      (f: FormField) => {
        emit('focus', f)
        props.onEvent?.(f, 'focus')
      }
    "
    @blur="
      (f: FormField) => {
        emit('blur', f)
        props.onEvent?.(f, 'blur')
      }
    "
  />
</template>
