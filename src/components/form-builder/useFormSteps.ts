/**
 * 步骤模式 composable — 拆分自 FormBuilder（超 800 行约束整改）
 *
 * 提供 steps 布局的步进状态与字段裁剪：
 * - currentStep/totalSteps/stepFields：当前步骤与该步字段（按 effectiveFields 裁剪）
 * - nextStep：推进前对当前步骤字段做校验（回调注入），失败提示并拦截
 * - stepCompletion：各步骤完成度（已填/总数，只统计可见字段），供步骤头进度展示
 */
import { computed, ref, type Ref, type ComputedRef } from 'vue'
import type { FormSchema, FormField, FormData } from './types'

export function useFormSteps(
  normalized: ComputedRef<FormSchema>,
  effectiveFields: ComputedRef<FormField[]>,
  formData: Ref<FormData>,
  isVisibleWithLinkage: (field: FormField, data: FormData) => boolean,
  validateKeys: (keys: string[]) => boolean,
) {
  const currentStep = ref(0)
  const totalSteps = computed(() => normalized.value.steps?.length ?? 0)

  /** 当前步骤的字段列表（按 effectiveFields 裁剪，条件禁用/必填已合成） */
  const stepFields = computed<FormField[]>(() => {
    if (normalized.value.layout !== 'steps' || !normalized.value.steps) return []
    const step = normalized.value.steps[currentStep.value]
    if (!step) return []
    return effectiveFields.value.filter((f) => step.fields.includes(f.key))
  })

  function nextStep(): void {
    const stepFieldKeys = normalized.value.steps?.[currentStep.value]?.fields ?? []
    if (!validateKeys(stepFieldKeys)) return
    if (currentStep.value < totalSteps.value - 1) {
      currentStep.value++
    }
  }

  function prevStep(): void {
    if (currentStep.value > 0) currentStep.value--
  }

  /** 跳到指定 key 字段所在步骤（提交失败定位用；找不到不动） */
  function jumpToFieldStep(key: string): void {
    if (normalized.value.layout !== 'steps' || !normalized.value.steps) return
    const idx = normalized.value.steps.findIndex((s) => s.fields.includes(key))
    if (idx >= 0) currentStep.value = idx
  }

  const isLastStep = computed(() => currentStep.value === totalSteps.value - 1)

  /** 每步的字段完成度（已填/总数），只统计可见字段，供步骤头进度展示 */
  const stepCompletion = computed(() => {
    if (normalized.value.layout !== 'steps' || !normalized.value.steps) return []
    return normalized.value.steps.map((step) => {
      const fields = effectiveFields.value.filter(
        (f) => step.fields.includes(f.key) && isVisibleWithLinkage(f, formData.value),
      )
      const filled = fields.filter((f) => {
        const v = formData.value[f.key]
        return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
      }).length
      return { filled, total: fields.length }
    })
  })

  return { currentStep, totalSteps, stepFields, nextStep, prevStep, jumpToFieldStep, isLastStep, stepCompletion }
}
