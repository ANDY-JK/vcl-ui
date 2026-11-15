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
      // 面板关着时**不动游标**（#499）：ArrowDown 在关着时是"开面板然后 return"，
      // Home/End 在关着时直接 return，只有 ↑ 以前不看 open —— 于是"先按 ↑ 再按 ↓"
      // 打开面板时游标已被偷偷推到 0，用户第一次按 ↓ 会落到第 2 条（跳过第一条）。
      // ↑ 不负责开面板（与既有行为一致），那它就不该改任何状态。
      if (!d.open.value) return
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
        if (item) {
          if (!d.isMenu.value) d.selectOption(item as Option)
          return
        }
        // 陈旧游标（#493）：用户高亮了第 3 项后又输入筛选词，列表只剩 1 项，
        // 而 highlightIdx 没有 watcher 重置。旧实现把 undefined 直接交给 selectOption，
        // 真宿主第一行 `if (opt.disabled)` 就抛 TypeError、面板白掉。
        // 语义上"高亮项已经不存在" == "没有高亮" —— 清掉游标，继续走精确匹配/提交路径。
        highlightIdx.value = -1
        if (d.isMenu.value) return
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
          // 同 #493：列表被筛选缩短后高亮项可能已不存在，不能把 undefined 交给宿主
          if (!item) {
            highlightIdx.value = -1
            return
          }
          d.selectOption(item as Option)
        }
      }
      return
    }
    if (e.key === 'ArrowUp') {
      // 同 #499：面板关着时不动游标（见 onComboKeydown 的同名注释）
      if (!d.open.value) return
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
