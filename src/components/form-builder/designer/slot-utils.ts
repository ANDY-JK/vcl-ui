/**
 * 设计器画布容器槽位辅助 — 拆分自 DesignerCanvas（超 800 行约束整改）
 *
 * 内容：
 * - 槽位列表回退（tabSlots/collapseSlots/stepSlots，未配置时用字段 label 兜底）
 * - 子字段归属（childrenInSlot，按 containerSlot 匹配）
 * - 画布本地交互状态（激活 tab / 折叠展开 / 当前步骤——不写回 schema，不进撤销栈）
 */
import { ref } from 'vue'
import { useT } from '@/components/_internal/i18n'
import type { DesignerNode } from './types'

const t = useT()

/** 取 tabs 容器槽位列表（label/name），缺省回退 */
function tabSlots(node: DesignerNode): { label: string; name: string }[] {
  return node.containerConfig?.tabs?.length
    ? node.containerConfig.tabs
    : [{ label: node.label || t('fb.tabN', { n: 1 }), name: 'tab1' }]
}

/** 取 collapse 容器槽位列表 */
function collapseSlots(node: DesignerNode): { title: string; expanded: boolean }[] {
  return node.containerConfig?.collapseItems?.length
    ? node.containerConfig.collapseItems
    : [{ title: node.label || t('fb.collapseItemN', { n: 1 }), expanded: true }]
}

/** 取 steps 容器槽位列表 */
function stepSlots(node: DesignerNode): { title: string }[] {
  return node.containerConfig?.steps?.length
    ? node.containerConfig.steps
    : [{ title: node.label || t('fb.stepN', { n: 1 }) }]
}

/** 取容器某槽位下的子字段（按 containerSlot 匹配，缺省按 0） */
function childrenInSlot(node: DesignerNode, slot: number): DesignerNode[] {
  return (node.children ?? []).filter((c) => (c.containerSlot ?? 0) === slot)
}

// ════════════════════════════════════════
// 容器交互状态（画布本地 UI 状态，不写回 schema，不进撤销栈）
// 目标：设计时与运行时 FormBuilder 的容器行为一致（所见即所得）
// ════════════════════════════════════════

/** tabs 容器：画布当前激活 tab（nodeId → tabName） */
const localActiveTab = ref<Record<string, string>>({})
/** collapse 容器：画布折叠展开状态（nodeId:index → 是否展开） */
const localCollapseOpen = ref<Record<string, boolean>>({})
/** collapse 容器：最后交互的折叠项（nodeId → index，拖入时的默认槽位） */
const localActiveCollapse = ref<Record<string, number>>({})
/** steps 容器：画布当前步骤（nodeId → index） */
const localActiveStep = ref<Record<string, number>>({})

/** tabs 容器：当前激活 tab 名（本地状态 → containerConfig.activeTab → 第一个） */
function activeTabName(node: DesignerNode): string {
  const tabs = tabSlots(node)
  const local = localActiveTab.value[node.id]
  if (local && tabs.some((t) => t.name === local)) return local
  const saved = node.containerConfig?.activeTab
  if (saved && tabs.some((t) => t.name === saved)) return saved
  return tabs[0]?.name ?? ''
}

/** tabs 容器：当前激活 tab 下标 */
function activeTabIndex(node: DesignerNode): number {
  return Math.max(
    0,
    tabSlots(node).findIndex((t) => t.name === activeTabName(node)),
  )
}

/** collapse 容器：某折叠项是否展开（本地状态 → 配置 expanded 缺省 true） */
function isCollapseOpen(node: DesignerNode, index: number): boolean {
  const v = localCollapseOpen.value[`${node.id}:${index}`]
  if (v !== undefined) return v
  return collapseSlots(node)[index]?.expanded ?? true
}

/** collapse 容器：当前激活折叠项下标（拖入默认槽位：最后交互项 → 首个展开项 → 0） */
function collapseActiveIndex(node: DesignerNode): number {
  const items = collapseSlots(node)
  const local = localActiveCollapse.value[node.id]
  if (local !== undefined && local >= 0 && local < items.length) return local
  const openIdx = items.findIndex((i) => i.expanded)
  return openIdx >= 0 ? openIdx : 0
}

/** steps 容器：当前步骤下标（本地状态 → containerConfig.activeStep → 0） */
function activeStepIndex(node: DesignerNode): number {
  const v = localActiveStep.value[node.id]
  if (v !== undefined && v >= 0 && v < stepSlots(node).length) return v
  return node.containerConfig?.activeStep ?? 0
}

/** tabs/collapse/steps 容器当前激活槽位（拖拽落入用）；card/grid 返回 undefined */
function activeSlotOf(node: DesignerNode): number | undefined {
  if (node.type === 'tabs') return activeTabIndex(node)
  if (node.type === 'collapse') return collapseActiveIndex(node)
  if (node.type === 'steps') return activeStepIndex(node)
  return undefined
}

/** 切换 tabs 容器激活 tab */
function setActiveTab(node: DesignerNode, name: string): void {
  localActiveTab.value = { ...localActiveTab.value, [node.id]: name }
}

/** 切换 collapse 容器折叠项展开状态 */
function toggleCollapse(node: DesignerNode, index: number): void {
  const key = `${node.id}:${index}`
  localCollapseOpen.value = { ...localCollapseOpen.value, [key]: !isCollapseOpen(node, index) }
  localActiveCollapse.value = { ...localActiveCollapse.value, [node.id]: index }
}

/** 切换 steps 容器当前步骤（下标越界时钳制） */
function setActiveStep(node: DesignerNode, index: number): void {
  const max = stepSlots(node).length - 1
  const next = Math.min(Math.max(index, 0), Math.max(0, max))
  localActiveStep.value = { ...localActiveStep.value, [node.id]: next }
}

/**
 * grid 子列跨列数：span 24 全域折算为格数（与运行时 FieldList 同语义）
 * 例：2 列容器 span 12 → 1 格（半行）；span 24 → 2 格（整行）；4 列容器 span 6 → 1 格
 */

export {
  tabSlots,
  collapseSlots,
  stepSlots,
  childrenInSlot,
  activeTabName,
  activeTabIndex,
  isCollapseOpen,
  collapseActiveIndex,
  activeStepIndex,
  setActiveTab,
  toggleCollapse,
  setActiveStep,
  activeSlotOf,
  localActiveTab,
  localCollapseOpen,
  localActiveCollapse,
  localActiveStep,
}
