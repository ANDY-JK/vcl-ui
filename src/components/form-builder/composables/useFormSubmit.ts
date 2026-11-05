/**
 * useFormSubmit — FormBuilder 的提交编排（#455 从 FormBuilder.vue 下沉）
 *
 * 管四件事：入口守卫（submitting / once-unique 锁）、失败路径（toast + 跳首个错误 + 滚动定位）、
 * 成功收尾（锁提交 / 清空 / 清草稿 / 卡死自复位）、以及对外暴露的 stopSubmit/setSubmitting。
 *
 * 与 useFormRemote 的分工：那边管传输（POST 与失败事件），这边管状态机与提示。
 */
import { ref, computed, onUnmounted, nextTick, type ComputedRef, type Ref } from 'vue'
import type { FormData, FormField, FormSchema } from '../types'

export interface FormSubmitDeps {
  t: (key: string, params?: Record<string, unknown>) => string
  emitValidate: (ok: boolean) => void
  emitSubmit: (data: FormData) => void
  validate: () => boolean
  firstErrorKey: Ref<string | null>
  effectiveFields: ComputedRef<FormField[]>
  formData: Ref<FormData>
  collectVisibleData: (fields: FormField[], data: FormData, pred: (f: FormField) => boolean) => FormData
  isFieldVisibleWithLinkage: (f: FormField, data: FormData) => boolean
  isHiddenByEvent: (key: string) => boolean
  normalized: ComputedRef<FormSchema>
  submitConfig: ComputedRef<{ saveUrl?: string; mode?: string } | undefined>
  initialData: Ref<FormData>
  clearErrors: () => void
  clearDraft: (key: string) => Promise<void>
  storageKey: string
  showToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info', ms: number) => void
  rootEl: Ref<HTMLElement | null>
  jumpToFieldStep: (key: string) => void
  submitRemote: (data: FormData) => Promise<void>
  /** 卸载时的额外清理（disposeRemote） */
  onTeardown?: () => void
}

const _SUBMIT_STUCK_RESET_MS = 3000

export function useFormSubmit(d: FormSubmitDeps) {
  const submitting = ref(false)
  const hasSubmitted = ref(false)
  let submitTimer: ReturnType<typeof setTimeout> | null = null

  /** 提交按钮锁定：once/unique 提交成功后置灰（multiple 恒不锁） */
  const submitLocked = computed(() => d.normalized.value.submitMode !== 'multiple' && hasSubmitted.value)

  function stopSubmit(): void {
    if (submitTimer) {
      clearTimeout(submitTimer)
      submitTimer = null
    }
    submitting.value = false
  }

  function setSubmitting(v: boolean): void {
    if (submitTimer) {
      clearTimeout(submitTimer)
      submitTimer = null
    }
    submitting.value = v
  }

  function finishSubmit(): void {
    if (d.normalized.value.submitMode !== 'multiple') {
      hasSubmitted.value = true
    }
    if (d.normalized.value.clearAfterSubmit) {
      d.formData.value = { ...d.initialData.value }
      d.clearErrors()
    }
    if (d.storageKey) {
      d.clearDraft(d.storageKey).catch(() => {})
    }
    if (submitTimer) clearTimeout(submitTimer)
    submitTimer = setTimeout(() => {
      submitting.value = false
    }, _SUBMIT_STUCK_RESET_MS)
  }

  function handleSubmit(): void {
    if (submitting.value) return
    const isValid = d.validate()
    d.emitValidate(isValid)

    if (!isValid) {
      d.showToast(d.t('formBuilder.requiredAll'), 'error', 2000)
      if (d.firstErrorKey.value) d.jumpToFieldStep(d.firstErrorKey.value)
      nextTick(() => {
        const firstErrEl = d.rootEl.value?.querySelector('.fb-field-error')
        if (firstErrEl) {
          const fieldEl = firstErrEl.closest('.fb-field')
          fieldEl?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      })
      return
    }

    const submitData = d.collectVisibleData(
      d.effectiveFields.value,
      d.formData.value,
      (f) => d.isFieldVisibleWithLinkage(f, d.formData.value) && !d.isHiddenByEvent(f.key),
    )

    if (d.normalized.value.submitMode !== 'multiple' && hasSubmitted.value) {
      d.showToast(d.t('formBuilder.submitOnce'), 'warning', 2000)
      return
    }

    submitting.value = true

    const rc = d.submitConfig.value
    if (rc?.saveUrl) {
      d.submitRemote(submitData)
        .then(() => {
          if (d.submitConfig.value?.mode !== 'view') {
            d.showToast(d.t('formBuilder.submitSuccess'), 'success', 2000)
          }
          d.emitSubmit(submitData)
          finishSubmit()
        })
        .catch((e: unknown) => {
          d.showToast(d.t('formBuilder.submitFail', { err: String((e as Error)?.message ?? e) }), 'error', 2500)
          stopSubmit()
        })
      return
    }

    d.emitSubmit(submitData)
    finishSubmit()
  }

  onUnmounted(() => {
    if (submitTimer) clearTimeout(submitTimer)
    d.onTeardown?.()
  })

  return { submitting, hasSubmitted, submitLocked, handleSubmit, finishSubmit, stopSubmit, setSubmitting }
}
