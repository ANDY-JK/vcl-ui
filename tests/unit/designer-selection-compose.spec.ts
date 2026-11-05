/* useDesignerSelection 编排层 · 选中与提示（#457）
 *
 * 从 FormDesigner.vue 下沉：单击/多选点选的状态迁移、主选中跟随、TTL 提示。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, computed } from 'vue'
import { useDesignerSelection } from '@/components/form-builder/designer/composables/useDesignerSelection'
import type { DesignerNode } from '@/components/form-builder/designer/types'

const nodes: DesignerNode[] = [
  { id: 'a', type: 'input', label: 'A' },
  { id: 'b', type: 'input', label: 'B' },
  { id: 'c', type: 'input', label: 'C' },
] as unknown as DesignerNode[]

function harness() {
  return useDesignerSelection({
    nodes: computed(() => nodes),
    findNode: (list, id) => list.find((n) => n.id === id) ?? null,
    tipTtlMs: 2500,
  })
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useDesignerSelection · 选中态', () => {
  it('普通点选：清空多选、主选中置为该节点', () => {
    const s = harness()
    s.handleSelect('a', true) // 先进多选
    expect(s.selectedIds.value.size).toBe(1)
    s.handleSelect('b') // 普通点选
    expect(s.selectedIds.value.size).toBe(0)
    expect(s.selectedId.value).toBe('b')
    expect(s.selectedNode.value?.id).toBe('b')
  })

  it('Ctrl/Cmd 点选：切换集合成员，主选中跟随最后点击', () => {
    const s = harness()
    s.handleSelect('a', true)
    s.handleSelect('b', true)
    expect([...s.selectedIds.value]).toEqual(['a', 'b'])
    expect(s.selectedId.value).toBe('b')
    s.handleSelect('a', true) // 再点一次 = 取消
    expect([...s.selectedIds.value]).toEqual(['b'])
  })

  it('反向保护：清空后无主选中，selectedNode 为 null', () => {
    const s = harness()
    s.handleSelect('a', true)
    s.clearSelection()
    expect(s.selectedId.value).toBe(null)
    expect(s.selectedIds.value.size).toBe(0)
    expect(s.selectedNode.value).toBe(null)
    expect(s.isMultiSelect.value).toBe(false)
  })

  it('悬空 id：树里找不到时不抛错，selectedNode 为 null', () => {
    const s = harness()
    s.handleSelect('ghost')
    expect(s.selectedId.value).toBe('ghost')
    expect(s.selectedNode.value).toBe(null)
  })

  it('提示：TTL 到点自清；重复调用重置计时（不叠加）', () => {
    const s = harness()
    s.showTip('已复制')
    expect(s.tip.value).toBe('已复制')
    vi.advanceTimersByTime(2000)
    s.showTip('再复制')
    vi.advanceTimersByTime(2000)
    expect(s.tip.value).toBe('再复制') // 未到新计时
    vi.advanceTimersByTime(600)
    expect(s.tip.value).toBe('')
  })
})
