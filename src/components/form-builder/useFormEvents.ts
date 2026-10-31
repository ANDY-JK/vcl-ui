/**
 * 字段事件动作 composable — 拆分自 FormBuilder（超 800 行约束整改）
 *
 * 执行字段配置的事件动作（由 FieldList 的 focusin/focusout/change 冒泡派发）：
 * - onChange: setValue / toggleVisible（值驱动：有内容显示、清空隐藏）/ showTip / callApi / linkField
 * - onBlur:   autoValidate / format / submit
 * - onFocus:  与 onChange 同一组动作（2026-10-31 接通，此前无任何派发链路）
 *
 * 三种触发都从 FieldList 的 `.fb-field` 包裹元素冒泡出来（focusin/focusout 会冒泡，
 * focus/blur 不会）—— 这样 Input/Select/DatePicker/自定义字段全都不用各自改，
 * 一处接住所有字段类型。
 *
 * 隐藏集合（toggleVisible）与表单数据写入由宿主注入，保持与渲染/提交链路解耦。
 */
import { ref, onScopeDispose, type Ref } from 'vue'
import type { FormField, FormData } from './types'
import { checkApiUrl, type ApiUrlPolicy } from './api-url-guard'

/** callApi 防抖窗口：Input 逐键触发 change，无防抖时每个字符发一次 POST（请求风暴） */
const API_DEBOUNCE_MS = 300

export function useFormEvents(
  formData: Ref<FormData>,
  showToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info', ms: number) => void,
  onAutoValidate: (key: string) => void,
  onSubmit: () => void,
  /** 外发 URL 策略：默认同源 only（schema 里的 apiUrl 可能经分享码跨信任边界流入，见 api-url-guard） */
  apiUrlPolicy: ApiUrlPolicy = {},
) {
  /** 事件动作隐藏的字段 key 集合（toggleVisible 用） */
  const hiddenByEvent = ref<Set<string>>(new Set())
  /** callApi 防抖定时器（按字段 key 分桶，避免不同字段互相推迟） */
  const apiTimers = new Map<string, ReturnType<typeof setTimeout>>()
  // 宿主卸载后丢弃待发的防抖请求，避免回调触达已卸载作用域
  onScopeDispose(() => {
    for (const timer of apiTimers.values()) clearTimeout(timer)
    apiTimers.clear()
  })

  /** 字段是否被事件动作隐藏 */
  function isHiddenByEvent(key: string): boolean {
    return hiddenByEvent.value.has(key)
  }

  /**
   * 源字段是否"有内容"——供 toggleVisible 判定。
   *
   * ⚠️ 第 139 轮修：`toggleVisible` 原来是**每次事件翻转一次**，而 `Input` 的
   * `onInput` 是**逐键** emit change，于是目标字段的可见性变成"字符数奇偶"的函数：
   * 键入 a→隐藏、ab→显示、abc→隐藏、abcd→显示；甚至**值没变**时重复派发
   * （父组件重渲染、同一值再发一次）也会翻转。用户看到的是随机闪动。
   * 改为值驱动：源字段有内容 → 显示目标；清空 → 隐藏。同一状态重复派发不再改变结果。
   */
  function isFilled(v: unknown): boolean {
    if (v === null || v === undefined) return false
    if (typeof v === 'string') return v.trim() !== ''
    if (typeof v === 'boolean') return v
    if (typeof v === 'number') return Number.isFinite(v)
    if (Array.isArray(v)) return v.length > 0
    if (typeof v === 'object') return Object.keys(v as Record<string, unknown>).length > 0
    return true
  }

  /** 执行单个字段事件动作 */
  function handleFieldChange(field: FormField, trigger: 'change' | 'blur' | 'focus'): void {
    const evtKey = trigger === 'change' ? 'onChange' : trigger === 'blur' ? 'onBlur' : 'onFocus'
    const evt = field.events?.[evtKey]
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
          // 值驱动而不是"每事件翻转"：见 isFilled 注释（逐键 change 会造成奇偶抖动）
          const shouldShow = isFilled(formData.value[field.key])
          const currentlyHidden = hiddenByEvent.value.has(target)
          if (shouldShow === currentlyHidden) {
            const next = new Set(hiddenByEvent.value)
            if (shouldShow) next.delete(target)
            else next.add(target)
            hiddenByEvent.value = next
          }
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
        // 外发前置校验：schema 里的 apiUrl 可能来自分享码（无签名，跨信任边界流入）。
        // 默认只允许同源；跨域必须由宿主通过 apiUrlPolicy 显式放行，否则拒绝并提示。
        const verdict = checkApiUrl(url, apiUrlPolicy)
        if (!verdict.ok) {
          showToast(t('formBuilder.eventApiBlocked', { field: field.label, reason: verdict.reason }), 'error', 3000)
          break
        }
        // 后台调用接口，不阻塞交互；结果作为提示反馈。
        // 300ms 防抖（按字段分桶）：Input 逐键 emit change，连打只发最后一次
        const fieldKey = field.key
        const pending = apiTimers.get(fieldKey)
        if (pending) clearTimeout(pending)
        apiTimers.set(
          fieldKey,
          setTimeout(() => {
            apiTimers.delete(fieldKey)
            const value = formData.value[fieldKey]
            fetch(verdict.url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ field: fieldKey, value }),
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
          }, API_DEBOUNCE_MS),
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

  /** FormFieldGroup 的统一事件出口（field, trigger）—— FormBuilder 模板 :on-event 直用 */
  const onFieldEvent = (field: FormField, trigger: 'change' | 'focus' | 'blur'): void =>
    handleFieldChange(field, trigger)

  return { hiddenByEvent, isHiddenByEvent, handleFieldChange, onFieldEvent }
}

// 模块级 t：本文件纯逻辑层复用 FormBuilder 的 i18n 域
import { useT } from '@/components/_internal/i18n'
const t = useT()
