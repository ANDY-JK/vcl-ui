/**
 * `useCellWrite` 写入漏斗的只读闸口（第 178 轮）
 *
 * 漏斗头部自称「所有单元格写入的唯一入口」，此前只做三件事（记已修改行 / emit / 整批撤销），
 * **没有只读校验**；于是各入口各自判、口径不齐：清空判了 `editable === false`，
 * 粘贴（7 个写入点）却没判 —— 实测只读列被整列粘贴覆盖。
 *
 * 这里直接锁住漏斗这道兜底闸口：即使某个入口漏判，`applyChanges` 也不能把值写进只读列。
 * 入口层的判据另由 `cell-clipboard.spec.ts`（粘贴）与 `cell-tab-edit.spec.ts`（Tab）覆盖。
 */
import { describe, it, expect, vi } from 'vitest'
import { useCellWrite } from '@/components/data/composables/cell-write'
import type { CellWriteDeps } from '@/components/data/composables/cell-write'
import { useTableEdit } from '@/components/data/composables/useTableEdit'

function makeWrite(isWritable?: (rk: string, ck: string) => boolean) {
  const cellChange = vi.fn()
  const deps: CellWriteDeps = {
    getDisplayValue: () => undefined,
    onAfterHistory: vi.fn(),
    ...(isWritable ? { isWritable } : {}),
  }
  const write = useCellWrite({ cellChange } as never, deps)
  return { write, cellChange }
}

const editableCols = new Set(['a', 'b'])

describe('useCellWrite · 只读闸口', () => {
  it('可写列照常写入并 emit', () => {
    const { write, cellChange } = makeWrite((_rk, ck) => editableCols.has(ck))
    write.applyChange('r1', 'a', 'v')
    expect(cellChange).toHaveBeenCalledWith('r1', 'a', 'v')
    expect(write.getCellValue('r1', 'a', 'orig'), 'override 生效').toBe('v')
  })

  it('**只读列写入被漏斗拦下：不 emit、不记已修改、不进撤销栈**', () => {
    const { write, cellChange } = makeWrite((_rk, ck) => editableCols.has(ck))
    write.applyChange('r1', 'ro', '想改只读列')
    expect(cellChange, '不能 emit cellChange').not.toHaveBeenCalled()
    expect(write.getCellValue('r1', 'ro', '原值'), 'override 不该被写').toBe('原值')
    expect(write.modifiedRows.value.has('r1'), '不该标记已修改').toBe(false)
    expect(write.canUndo(), '不该产生撤销记录').toBe(false)
  })

  it('**批量写入：只读列条目被剔除，其余条目照写**（整片粘贴的典型形态）', () => {
    const { write, cellChange } = makeWrite((_rk, ck) => editableCols.has(ck))
    write.applyChanges([
      { rowKey: 'r1', colKey: 'a', value: '1' },
      { rowKey: 'r1', colKey: 'ro', value: '2' },
      { rowKey: 'r2', colKey: 'b', value: '3' },
    ])
    expect(cellChange.mock.calls.map((c) => c[1])).toEqual(['a', 'b'])
    expect(write.getCellValue('r1', 'ro', '原值')).toBe('原值')
  })

  it('全部条目都不可写 → 连撤销记录都不产生（避免空步）', () => {
    const { write } = makeWrite(() => false)
    write.applyChanges([{ rowKey: 'r1', colKey: 'ro', value: 'x' }])
    expect(write.canUndo()).toBe(false)
  })

  it('未提供 isWritable 时行为不变（既有调用与测试不受影响）', () => {
    const { write, cellChange } = makeWrite()
    write.applyChange('r1', 'ro', 'v')
    expect(cellChange).toHaveBeenCalledWith('r1', 'ro', 'v')
  })
})

describe('useTableEdit · 漏斗闸口已接线（端到端）', () => {
  it('**经 useTableEdit 写入只读列 → 被漏斗挡下**（columns 里的 editable:false 生效）', () => {
    const cellChange = vi.fn()
    const api = useTableEdit(
      {
        editable: true,
        columns: [
          { key: 'a', title: 'A' },
          { key: 'ro', title: '只读', editable: false },
        ],
      } as never,
      { cellChange } as never,
    )
    api.applyChanges([{ rowKey: 'r1', colKey: 'ro', value: '想改只读列' }])
    expect(cellChange, '只读列不该 emit').not.toHaveBeenCalled()
    expect(api.getCellValue('r1', 'ro', '原值'), 'override 不该被写').toBe('原值')

    // 同一漏斗下可写列照常写
    api.applyChanges([{ rowKey: 'r1', colKey: 'a', value: 'ok' }])
    expect(cellChange).toHaveBeenCalledWith('r1', 'a', 'ok')
  })
})