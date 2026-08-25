// useTableEdit composable 行为锁定：单元格选择/编辑/键盘导航/复制粘贴/修改追踪
// 背景：审计发现该 composable（856 行，全库最大）零直接测试
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { useTableEdit } from '@/components/data/composables/useTableEdit'
import type { Column } from '@/components/data/composables/types'

const cols: Column[] = [
  { key: 'name', title: '名称' },
  { key: 'qty', title: '数量', type: 'number' },
  { key: 'status', title: '状态', options: ['active', 'inactive'] },
]

function setup(over: Record<string, unknown> = {}) {
  const emit = { cellChange: vi.fn(), cellNote: vi.fn() }
  const edit = useTableEdit(
    { columns: cols, editable: true, keyboardNav: true, ...over },
    emit,
  )
  // 设置行列矩阵供键盘导航/矩阵粘贴定位
  edit.setDisplayMatrix(['r1', 'r2'], ['name', 'qty', 'status'])
  return { edit, emit }
}

describe('useTableEdit · 单元格选择', () => {
  it('selectCell 选中并记录显示值', () => {
    const { edit } = setup()
    edit.selectCell('r1', 'name', '苹果', false)
    expect(edit.selectedCell.value).toEqual({ rowKey: 'r1', colKey: 'name' })
    expect(edit.isCellSelected('r1', 'name')).toBe(true)
  })

  it('列头 Ctrl 点击整列选中 toggleSelectColumn', () => {
    const { edit } = setup()
    edit.toggleSelectColumn('qty')
    expect(edit._selectedColKey.value).toBe('qty')
    expect(edit.isCellSelected('r1', 'qty')).toBe(true)
    expect(edit.isCellSelected('r2', 'qty')).toBe(true)
    // 再点取消
    edit.toggleSelectColumn('qty')
    expect(edit._selectedColKey.value).toBeNull()
  })
})

describe('useTableEdit · 编辑流程', () => {
  it('startEdit → commitEdit 触发 cellChange 且记录覆盖值', () => {
    const { edit, emit } = setup()
    edit.startEdit('r1', 'name', '苹果')
    expect(edit.editingCell.value).toMatchObject({ rowKey: 'r1', colKey: 'name' })
    edit.editValue.value = '香蕉'
    edit.commitEdit()
    expect(emit.cellChange).toHaveBeenCalledWith('r1', 'name', '香蕉')
    expect(edit.getCellValue('r1', 'name', '苹果')).toBe('香蕉')
    expect(edit.modifiedCount.value).toBe(1)
  })

  it('cancelEdit 不触发 cellChange 且恢复原值', () => {
    const { edit, emit } = setup()
    edit.startEdit('r1', 'name', '苹果')
    edit.editValue.value = '改坏了'
    edit.cancelEdit()
    expect(emit.cellChange).not.toHaveBeenCalled()
    expect(edit.editingCell.value).toBeNull()
  })
})

describe('useTableEdit · 键盘导航', () => {
  it('ArrowDown 移动选中到下一行（不越界）', () => {
    const { edit } = setup()
    edit.selectCell('r1', 'name', '苹果', false)
    const ev = { key: 'ArrowDown', preventDefault: vi.fn() } as unknown as KeyboardEvent
    edit.onCellKeydown(ev)
    expect(edit.selectedCell.value?.rowKey).toBe('r2')
    // 已在末行再下移不越界
    edit.onCellKeydown(ev)
    expect(edit.selectedCell.value?.rowKey).toBe('r2')
  })

  it('Shift+ArrowRight 从锚点扩展矩形选区', () => {
    const { edit } = setup()
    edit.selectCell('r1', 'name', '苹果', false)
    const ev = { key: 'ArrowRight', shiftKey: true, preventDefault: vi.fn() } as unknown as KeyboardEvent
    edit.onCellKeydown(ev)
    expect(edit.rangeSel.value).toBeTruthy()
    expect(edit.isInRange('r1', 'qty')).toBe(true)
    expect(edit.isRangeAnchor('r1', 'name')).toBe(true)
  })

  it('Delete 清空选中单元格', () => {
    const { edit, emit } = setup()
    edit.selectCell('r1', 'qty', '10', false)
    const ev = { key: 'Delete', preventDefault: vi.fn() } as unknown as KeyboardEvent
    edit.onCellKeydown(ev)
    expect(emit.cellChange).toHaveBeenCalledWith('r1', 'qty', '')
  })
})

describe('useTableEdit · 粘贴约束', () => {
  it('下拉选项列仅接受选项内值（保护数据约束）', () => {
    const { edit } = setup()
    edit.selectCell('r1', 'status', 'active', false)
    edit.pasteText('active') // 合法值
    expect(edit.getCellValue('r1', 'status', '')).toBe('active')
    edit.pasteText('hacked') // 非法值被拒绝
    expect(edit.getCellValue('r1', 'status', 'active')).toBe('active')
  })
})

describe('useTableEdit · 修改追踪', () => {
  it('modifiedCount 统计修改行数', () => {
    const { edit } = setup()
    edit.selectCell('r1', 'name', '', false)
    edit.pasteText('新值1')
    edit.selectCell('r2', 'name', '', false)
    edit.pasteText('新值2')
    expect(edit.modifiedCount.value).toBe(2)
  })
})
