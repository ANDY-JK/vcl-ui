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
  const totalSteps = computed(() => normalized.value.steps?.length ?? 0)

  /**
   * 当前步骤（**读写都夹紧在 [0, totalSteps-1]**）。
   *
   * 为什么不用裸 ref（第 163 轮实测）：步骤数会变（设计器删步骤、宿主切换 schema），
   * 而 `currentStep` 也对外暴露成可写。一旦它指向不存在的步骤：
   *   - `stepFields` 里 `steps[currentStep]` 取不到 → 直接 return [] →
   *     表单**一个字段都不显示**，步骤头却还写着"第 N 步"；
   *   - `isLastStep` 恒为 false，用户点"下一步"没有任何反应（nextStep 的 < 判断已不成立）。
   * 用带 setter 的 computed 把夹紧收在一处：读（渲染/校验）与写（nextStep/prevStep/宿主直写）
   * 拿到的永远是合法步骤，不需要在每个调用点各写一遍 Math.min/Math.max。
   */
  const _currentStep = ref(0)
  const currentStep = computed<number>({
    get: () => Math.min(Math.max(0, _currentStep.value), Math.max(0, totalSteps.value - 1)),
    set: (v: number) => {
      _currentStep.value = Math.min(Math.max(0, Math.trunc(v) || 0), Math.max(0, totalSteps.value - 1))
    },
  })

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
