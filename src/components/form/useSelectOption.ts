/**
 * useSelectOption — Select 选项的选中/提交/清除逻辑（自 Select.vue 下沉，M3 持续拆分）
 *
 * 承接：selectedValueKeys（多选值索引）、isSelected（面板高亮判定）、selectOption
 *（单选/多选提交 + disabled 守卫）、onClear（统一清空 emit null）。
 * 依赖面收窄：props 取 getter 形态（宿主重渲染时读最新值，不快照过期）；
 * comboText/comboInputRef 由宿主注入（组合块高频读写同一 ref），
 * closePanel/markTouched/emit 走注入。
 * selectedValueKeys 也供树形区块的 isTreeSelected 使用（主文件经本模块引用）。
 */
import { computed } from 'vue'
import type { Ref } from 'vue'
import type { Option } from '@/components/shared/types'

/** 提交/清空时发出的模型值（与 Select 本地 SelectModelValue 一致，不反向 import 主文件） */
type SelectModelValue = string | number | (string | number | boolean)[] | [string, string] | null

export function useSelectOption(o: {
  /** 当前模型值（getter：宿主重渲染/更新时读最新 props.modelValue） */
  modelValue: () => SelectModelValue
  multiple: () => boolean
  isInputable: () => boolean
  comboText: Ref<string>
  /** 输入型提交后恢复焦点（宿主：nextTick focus/blur） */
  focusCombo: () => void
  blurCombo: () => void
  closePanel: () => void
  markTouched: () => void
  emit: (event: 'update:modelValue' | 'change', value: SelectModelValue) => void
}) {
  const selectedValueKeys = computed<Set<string> | null>(() => {
    const mv = o.modelValue()
    if (!Array.isArray(mv)) return null
    return new Set((mv as (string | number | boolean)[]).map((v) => String(v)))
  })

  function isSelected(opt: Option): boolean {
    if (o.multiple()) return selectedValueKeys.value?.has(String(opt.value)) ?? false
    // 单选：未输入时按当前值高亮；输入中按输入内容匹配（便于看到即将提交的项）
    const combo = o.comboText.value
    if (!combo) return String(o.modelValue()) === String(opt.value)
    return opt.label === combo || String(opt.value) === combo
  }

  function selectOption(opt: Option): void {
    if (opt.disabled) return
    o.markTouched()
    if (o.multiple()) {
      const vals = [...((o.modelValue() || []) as (string | number | boolean)[])]
      const idx = vals.findIndex((v) => String(v) === String(opt.value))
      if (idx >= 0) vals.splice(idx, 1)
      else vals.push(opt.value)
      o.emit('update:modelValue', vals)
      o.emit('change', vals)
      if (o.isInputable()) {
        o.comboText.value = ''
        o.focusCombo()
      }
    } else {
      o.closePanel()
      o.emit('update:modelValue', opt.value as SelectModelValue)
      o.emit('change', opt.value as SelectModelValue)
      if (o.isInputable()) {
        o.comboText.value = ''
        o.blurCombo()
      }
    }
  }

  /** 清空值统一 emit null：此前单选清空发 ''、多选/树/区间发 null，同组件两种"空"导致消费方判断漏网 */
  function onClear(e: MouseEvent): void {
    e.stopPropagation()
    o.markTouched()
    o.comboText.value = ''
    o.emit('update:modelValue', null)
    o.emit('change', null)
  }

  return { selectedValueKeys, isSelected, selectOption, onClear }
}
