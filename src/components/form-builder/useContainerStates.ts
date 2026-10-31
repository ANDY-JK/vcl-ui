/**
 * useContainerStates — FormBuilder 的容器状态层下沉（TD-54 第一刀，2026-10-31）
 *
 * 三种容器（tabs / collapse / steps）各自的"当前激活项"状态 + 读取函数：
 * 状态 ref、激活名解析（失效回落）、展开态查询、步骤下标、按槽位切字段。
 * 纯状态与纯查询，无表单数据耦合 —— FormBuilder 只消费返回值。
 */
import { ref } from 'vue'
import { resolveActiveTab, resolveCollapsed, fieldsInSlot } from './container-render'
import type { FormField, RenderSection, FieldContainer } from './types'

export function useContainerStates() {
  /** tabs 容器：当前激活 tab 名 */
  const tabStates = ref<Record<string, string>>({})
  /** collapse 容器：展开状态（collapseIndex → bool） */
  const collapseStates = ref<Record<string, boolean>>({})
  /** steps 容器：当前步骤下标 */
  const stepStates = ref<Record<string, number>>({})

  /** flex 容器：容器配置 → CSS 变量（换行/对齐/间距） */
  function flexStyle(c: FieldContainer): Record<string, string> {
    const s: Record<string, string> = {
      '--fb-flex-wrap': c.wrap === false ? 'nowrap' : 'wrap',
      '--fb-flex-justify':
        c.justify === 'center' ? 'center' : c.justify === 'space-between' ? 'space-between' : 'flex-start',
    }
    if (c.gap !== undefined) s['--fb-flex-gap'] = `${Math.max(0, Number(c.gap) || 0)}px`
    return s
  }

  /** tabs 容器：当前激活 tab 名（存的名字失效时回落第一个，见 container-render.ts） */
  function activeTabOf(section: RenderSection): string {
    const tabs = section.container?.tabs ?? []
    return resolveActiveTab(tabs, tabStates.value[section.container?.id ?? ''])
  }

  /** 取 collapse 容器某折叠项展开状态 */
  function collapseOpen(section: RenderSection, index: number): boolean {
    const items = section.container?.collapseItems ?? []
    const stored = collapseStates.value[`${section.container?.id ?? ''}:${index}`]
    return resolveCollapsed(items, index, stored)
  }

  /** 取 steps 容器当前步骤 */
  function stepIndexOf(section: RenderSection): number {
    return stepStates.value[section.container?.id ?? ''] ?? 0
  }

  /** tabs 容器：按槽位过滤出当前 tab 的字段 */
  function fieldsInTab(section: RenderSection, tabName: string): FormField[] {
    const idx = (section.container?.tabs ?? []).findIndex((t) => t.name === tabName)
    return fieldsInSlot(section.fields, idx)
  }

  /** 按「容器槽位」过滤字段（collapse 与 steps 共用；语义：slot 就是第几个折叠项/步骤） */
  function fieldsBySlot(section: RenderSection, index: number): FormField[] {
    return fieldsInSlot(section.fields, index)
  }

  return {
    tabStates,
    collapseStates,
    stepStates,
    flexStyle,
    activeTabOf,
    collapseOpen,
    stepIndexOf,
    fieldsInTab,
    fieldsBySlot,
  }
}
