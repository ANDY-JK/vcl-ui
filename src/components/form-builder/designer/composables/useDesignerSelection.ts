/**
 * useDesignerSelection — 设计器的选中态与操作提示（#457 从 FormDesigner.vue 下沉）
 *
 * 两件事，都是"纯 UI 状态 + 一个定时器"：
 *   1. 选中：单击（清空多选）/ Ctrl-Cmd 点选（切换多选集合，主选中跟随最后点击）；
 *   2. 提示：一次性 toast 文案，TTL 后自清，重复调用重置计时。
 *
 * 为什么放一起：两者都只被画布/大纲/工具栏读写，且共用 onUnmounted 清理；
 * 与节点数据、撤销栈、面板尺寸无耦合。
 */
import { ref, computed, onUnmounted, type ComputedRef } from 'vue'
import type { DesignerNode } from '../types'

export interface DesignerSelectionDeps {
  /** 当前节点树（用于解析主选中节点的完整对象） */
  nodes: ComputedRef<DesignerNode[]>
  /** 按 id 在树里找节点（容器与嵌套都要支持） */
  findNode: (list: DesignerNode[], id: string) => DesignerNode | null
  /** 提示停留时长 */
  tipTtlMs: number
}

export function useDesignerSelection(d: DesignerSelectionDeps) {
  const selectedId = ref<string | null>(null)
  /** 多选集合（Ctrl/Cmd+点选进入；空 = 单选模式） */
  const selectedIds = ref<Set<string>>(new Set())

  const selectedNode = computed(() => {
    if (!selectedId.value) return null
    return d.findNode(d.nodes.value, selectedId.value)
  })

  /** 是否处于多选模式 */
  const isMultiSelect = computed(() => selectedIds.value.size > 0)

  /** 处理画布/大纲树选中事件（additive = Ctrl/Cmd+点选） */
  function handleSelect(id: string, additive = false): void {
    if (additive) {
      const next = new Set(selectedIds.value)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      selectedIds.value = next
      // 主选中保持为最后点击的节点（属性面板编辑用）
      selectedId.value = id
    } else {
      selectedIds.value = new Set()
      selectedId.value = id
    }
  }

  /** 清除选中（含多选） */
  function clearSelection(): void {
    selectedId.value = null
    selectedIds.value = new Set()
  }

  const tip = ref('')
  let _tipTimer: ReturnType<typeof setTimeout> | null = null

  function showTip(msg: string): void {
    tip.value = msg
    if (_tipTimer) clearTimeout(_tipTimer)
    _tipTimer = setTimeout(() => {
      tip.value = ''
    }, d.tipTtlMs)
  }

  onUnmounted(() => {
    if (_tipTimer) clearTimeout(_tipTimer)
  })

  return { selectedId, selectedIds, selectedNode, isMultiSelect, handleSelect, clearSelection, tip, showTip }
}
