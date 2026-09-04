/**
 * 字段事件动作 composable — 拆分自 FormBuilder（超 800 行约束整改）
 *
 * 执行字段配置的事件动作（由 FormRenderer @change/@blur 触发）：
 * - onChange: setValue / toggleVisible / showTip / callApi / linkField
 * - onBlur:   autoValidate / format / submit
 *
 * 隐藏集合（toggleVisible）与表单数据写入由宿主注入，保持与渲染/提交链路解耦。
 */
import { ref, type Ref } from 'vue'
import type { FormField, FormData } from './types'

export function useFormEvents(
  formData: Ref<FormData>,
  showToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info', ms: number) => void,
  onAutoValidate: (key: string) => void,
  onSubmit: () => void,
) {
  /** 事件动作隐藏的字段 key 集合（toggleVisible 用） */
  const hiddenByEvent = ref<Set<string>>(new Set())

  /** 字段是否被事件动作隐藏 */
  function isHiddenByEvent(key: string): boolean {
    return hiddenByEvent.value.has(key)
  }

  /** 执行单个字段事件动作 */
  function handleFieldChange(field: FormField, trigger: 'change' | 'blur'): void {
    const evt = field.events?.[trigger === 'change' ? 'onChange' : 'onBlur']
    if (!evt?.action) return
    const target = evt.targetField

    switch (evt.action) {
      case 'setValue': {
        if (target) {
          // 把当前字段值同步给目标字段
          formData.value = { ...formData.value, [target]: formData.value[field.key] }
        }
        break
      }
      case 'toggleVisible': {
        if (target) {
          const next = new Set(hiddenByEvent.value)
          if (next.has(target)) next.delete(target)
          else next.add(target)
          hiddenByEvent.value = next
        }
        break
      }
      case 'showTip': {
        showToast(t('formBuilder.eventTip', { field: field.label }), 'info', 1500)
        break
      }
      case 'callApi': {
        const url = evt.apiUrl
        if (!url) {
          showToast(t('formBuilder.eventNoApi'), 'warning', 2000)
          break
        }
        // 后台调用接口，不阻塞交互；结果作为提示反馈
        const value = formData.value[field.key]
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ field: field.key, value }),
        })
          .then((resp) => {
            if (!resp.ok) throw new Error('HTTP ' + resp.status)
            return resp.json().catch(() => ({}))
          })
          .then(() => showToast(t('formBuilder.eventApiDone', { field: field.label }), 'success', 1500))
          .catch((err) =>
            showToast(
              t('formBuilder.eventApiFail', { field: field.label, err: String(err?.message ?? err) }),
              'error',
              2500,
            ),
          )
        break
      }
      case 'linkField': {
        // 联动字段：linkage 引擎已处理 followValue/showHide，这里无需额外动作
        break
      }
      case 'autoValidate': {
        onAutoValidate(field.key)
        break
      }
      case 'format': {
        const v = formData.value[field.key]
        if (typeof v === 'string' && v !== v.trim()) {
          formData.value = { ...formData.value, [field.key]: v.trim() }
        }
        break
      }
      case 'submit': {
        onSubmit()
        break
      }
    }
  }

  return { hiddenByEvent, isHiddenByEvent, handleFieldChange }
}

// 模块级 t：本文件纯逻辑层复用 FormBuilder 的 i18n 域
import { useT } from '@/components/_internal/i18n'
const t = useT()
