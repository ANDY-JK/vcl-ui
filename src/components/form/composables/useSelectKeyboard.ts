/**
 * useSelectKeyboard — Select 的键盘导航（#454 从 Select.vue 下沉）
 *
 * 输入型（select/combobox）与触发器型两套 keydown 处理器 + 高亮游标（highlightIdx）。
 * 游标与"选中动作"留在本文件；选项来源（navItems/navCount/visibleTreeNodes）由宿主注入，
 * 选中回调经 selectOption/onMenuClick/onTreeNodeClick 注入。
 *
 * 与 useSelectOption 的分工：那边管"点选/清空"的状态机，这边只管键位。
 */
import { ref, type ComputedRef, type Ref } from 'vue'
import type { Option, MenuItem } from '@/components/shared/types'
import type { FlattenNode } from '@/components/_internal/useTreeFlatten'
import type { CascaderOption } from '@/components/shared/types'

export interface SelectKeyboardDeps {
  navItems: ComputedRef<(Option | MenuItem)[]>
  navCount: ComputedRef<number>
  visibleTreeNodes: ComputedRef<unknown[]>
  isMenu: ComputedRef<boolean>
  isTreeSelect: ComputedRef<boolean>
  open: Ref<boolean>
  comboText: Ref<string>
  modelValue: ComputedRef<unknown>
  multiple: boolean
  allowCreate: boolean
  isImeComposing: (e: KeyboardEvent) => boolean
  externalHighlight?: Ref<number>
  matchOptions: (text: string) => Option[]
  findExact: (text: string) => Option | undefined
  commitComboValue: (text: string) => void
  toggleOpen: () => void
  closePanel: () => void
  selectOption: (item: Option) => void
  onMenuClick: (item: MenuItem) => void
  onTreeNodeClick: (node: FlattenNode<CascaderOption>) => void
  focusComboInput: () => void
  emitValue: (vals: (string | number | boolean)[]) => void
}

export function useSelectKeyboard(d: SelectKeyboardDeps) {
  const highlightIdx = d.externalHighlight ?? ref(-1)
  const navItems = d.navItems
  const navCount = d.navCount

  function onComboKeydown(e: KeyboardEvent): void {
    if (d.isImeComposing(e)) return
    if (e.key === 'Escape') {
      e.preventDefault?.()
      d.comboText.value = ''
      d.closePanel()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault?.()
      if (!d.open.value) {
        d.toggleOpen()
        return
      }
      highlightIdx.value = Math.min(highlightIdx.value + 1, navItems.value.length - 1)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault?.()
      highlightIdx.value = Math.max(highlightIdx.value - 1, 0)
      return
    }
    // Home / End（#317）：与 onTriggerKeydown 同口径；未打开时不拦截（留给页面滚动）
    if (e.key === 'Home' || e.key === 'End') {
      if (!d.open.value) return
      e.preventDefault?.()
      highlightIdx.value = e.key === 'Home' ? 0 : Math.max(navCount.value - 1, 0)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault?.()
      if (highlightIdx.value >= 0) {
        const item = navItems.value[highlightIdx.value]
        if (!d.isMenu.value) d.selectOption(item as Option)
        return
      }
      const text = d.comboText.value.trim()
      if (!text) return
      const exact = d.findExact(text)
      if (d.multiple) {
        if (exact) {
          const vals = [...((d.modelValue.value || []) as unknown as (string | number | boolean)[])]
          if (!exact.disabled && !vals.some((v) => String(v) === String(exact.value))) {
            vals.push(exact.value)
            d.emitValue(vals)
          }
          d.comboText.value = ''
          d.focusComboInput()
          return
        }
        if (d.allowCreate) {
          const vals = [...((d.modelValue.value || []) as (string | number | boolean)[])]
          // 即时匹配（不走 200ms 防抖）：快速输入+回车时防抖列表尚未更新，取 stale 首项会静默失败
          let addVal: string | number | boolean = text
          const fresh = d.matchOptions(text).filter((o) => !o.disabled)
          if (fresh.length > 0) addVal = fresh[0].value
          if (!vals.some((v) => String(v) === String(addVal))) {
            vals.push(addVal)
            d.emitValue(vals)
          }
          d.comboText.value = ''
          d.focusComboInput()
        }
        return
      }
      if (exact || d.allowCreate) {
        d.commitComboValue(text)
        d.closePanel()
      }
    }
  }

  function onTriggerKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault?.()
      d.closePanel()
      return
    }
    if (e.key === 'Tab') {
      d.closePanel()
      return
    }
    if (d.isMenu.value) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault?.()
        if (!d.open.value) {
          d.toggleOpen()
          return
        }
        if (e.key === 'ArrowDown') highlightIdx.value = Math.min(highlightIdx.value + 1, navCount.value - 1)
        else highlightIdx.value = Math.max(highlightIdx.value - 1, 0)
      } else if (e.key === 'Home' || e.key === 'End') {
        if (!d.open.value) return
        e.preventDefault?.()
        highlightIdx.value = e.key === 'Home' ? 0 : Math.max(navCount.value - 1, 0)
      } else if (e.key === 'Enter' && d.open.value) {
        e.preventDefault?.()
        const item = navItems.value[highlightIdx.value]
        if (item) d.onMenuClick(item as MenuItem)
      } else if ((e.key === 'Enter' || e.key === ' ') && !d.open.value) {
        e.preventDefault?.()
        d.toggleOpen()
      }
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault?.()
      if (!d.open.value) {
        d.toggleOpen()
        return
      }
      if (e.key === 'ArrowDown') highlightIdx.value = Math.min(highlightIdx.value + 1, navCount.value - 1)
      if (e.key === 'Enter' && highlightIdx.value >= 0) {
        if (d.isTreeSelect.value) {
          const flatNode = d.visibleTreeNodes.value[highlightIdx.value] as FlattenNode<CascaderOption> | undefined
          if (flatNode) d.onTreeNodeClick(flatNode)
        } else {
          const item = navItems.value[highlightIdx.value]
          if (d.isMenu.value) d.onMenuClick(item as MenuItem)
          else d.selectOption(item as Option)
        }
      }
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault?.()
      highlightIdx.value = Math.max(highlightIdx.value - 1, 0)
      return
    }
    if (e.key === 'Home' || e.key === 'End') {
      if (!d.open.value) return
      e.preventDefault?.()
      highlightIdx.value = e.key === 'Home' ? 0 : Math.max(navCount.value - 1, 0)
    }
  }

  return { highlightIdx, onComboKeydown, onTriggerKeydown }
}
