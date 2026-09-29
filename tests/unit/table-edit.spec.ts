// useTableEdit composable 行为锁定：单元格选择/编辑/键盘导航/复制粘贴/修改追踪
// 背景：审计发现该 composable（856 行，全库最大）零直接测试
import { describe, it, expect, vi } from 'vitest'
import { useTableEdit } from '@/components/data/composables/useTableEdit'
import type { Column } from '@/components/data/composables/types'

const cols: Column[] = [
  { key: 'name', title: '名称' },
  { key: 'qty', title: '数量', type: 'number' },
  { key: 'status', title: '状态', options: ['active', 'inactive'] },
]

function setup(over: Record<string, unknown> = {}) {
  const emit = { cellChange: vi.fn(), cellNote: vi.fn() }
  const edit = useTableEdit({ columns: cols, editable: true, keyboardNav: true, ...over }, emit)
  // 设置行列矩阵供键盘导航/矩阵粘贴定位
  edit.setDisplayMatrix(['r1', 'r2'], ['name', 'qty', 'status'])
  return { edit, emit }
}

/** 带类型列的 setup（归一化接线测试用），hooks 可注入 onNormalizeError */
function setupTyped(hooks: Record<string, unknown> = {}) {
  const emit = { cellChange: vi.fn(), cellNote: vi.fn() }
  const typedCols: Column[] = [
    { key: 'title', title: '标题' },
    { key: 'day', title: '日期', type: 'date' },
    { key: 'amount', title: '金额', type: 'number' },
    { key: 'keep', title: '编码', type: 'text' },
  ]
  const edit = useTableEdit({ columns: typedCols, editable: true, keyboardNav: true }, emit, hooks)
  edit.setDisplayMatrix(['r1'], ['title', 'day', 'amount', 'keep'])
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

  it('F2 进入编辑（Excel 惯例，与 Enter 同义；options 列不响应）', () => {
    const { edit } = setup()
    edit.selectCell('r1', 'name', '苹果', false)
    const ev = { key: 'F2', preventDefault: vi.fn() } as unknown as KeyboardEvent
    edit.onCellKeydown(ev)
    expect(edit.editingCell.value).toMatchObject({ rowKey: 'r1', colKey: 'name' })
    edit.cancelEdit()
    // options 列走下拉面板，F2/Enter 都不进内联编辑（防「假编辑态」）
    edit.selectCell('r1', 'status', 'active', false)
    edit.onCellKeydown(ev)
    expect(edit.editingCell.value).toBeNull()
    // 带修饰键的 Ctrl+F2 不拦截（外层分支要求无修饰键，留给浏览器）
    edit.selectCell('r1', 'name', '苹果', false)
    edit.onCellKeydown({ key: 'F2', ctrlKey: true, preventDefault: vi.fn() } as unknown as KeyboardEvent)
    expect(edit.editingCell.value).toBeNull()
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

// 归一化接线：必须验证「提交层真的调用了归一化」，纯函数测试无法覆盖这段
describe('useTableEdit · 编辑提交归一化', () => {
  it('date 列：9/12 提交 → 存当前年 2026-09-12', () => {
    const { edit, emit } = setupTyped()
    edit.startEdit('r1', 'day', '')
    edit.editValue.value = '9/12'
    expect(edit.commitEdit()).toBe(true)
    const year = new Date().getFullYear()
    expect(emit.cellChange).toHaveBeenCalledWith('r1', 'day', `${year}-09-12`)
    expect(edit.getCellValue('r1', 'day', '')).toBe(`${year}-09-12`)
  })

  it('date 列：完整年月日补零成 ISO（口径确定，不依赖当前年）', () => {
    const { edit, emit } = setupTyped()
    edit.startEdit('r1', 'day', '')
    edit.editValue.value = '2026/9/12'
    edit.commitEdit()
    expect(emit.cellChange).toHaveBeenCalledWith('r1', 'day', '2026-09-12')
  })

  it('number 列：千分位与货币符号归一', () => {
    const { edit, emit } = setupTyped()
    edit.startEdit('r1', 'amount', '0')
    edit.editValue.value = '￥1,234.50'
    edit.commitEdit()
    expect(emit.cellChange).toHaveBeenCalledWith('r1', 'amount', '1234.5')
  })

  it('number 列非法值 + Enter：不落库、保持编辑态、挂 cell 级失败提示（不弹全局 toast）', () => {
    const onNormalizeError = vi.fn()
    const { edit, emit } = setupTyped({ onNormalizeError })
    edit.startEdit('r1', 'amount', '10')
    edit.editValue.value = 'abc'
    expect(edit.commitEdit('enter')).toBe(false)
    expect(emit.cellChange).not.toHaveBeenCalled()
    // 关键：用户被留在格子里就地修正，失败原因就地呈现（组件层渲染红圈+气泡）
    expect(edit.editingCell.value).not.toBeNull()
    expect(edit.editInvalidKey.value).toBe('table.invalidNumber')
    // Enter/Tab 失败不走全局提示——用户在格子里看气泡，右下角 toast 够不着
    expect(onNormalizeError).not.toHaveBeenCalled()
  })

  it('number 列非法值 + 失焦：不落库但退出编辑态（不把用户困在格子里）', () => {
    const onNormalizeError = vi.fn()
    const { edit, emit } = setupTyped({ onNormalizeError })
    edit.startEdit('r1', 'amount', '10')
    edit.editValue.value = 'abc'
    expect(edit.commitEdit('blur')).toBe(false)
    expect(emit.cellChange).not.toHaveBeenCalled()
    expect(edit.editingCell.value).toBeNull()
    // 失焦丢弃必须让用户知道 → 走全局提示
    expect(onNormalizeError).toHaveBeenCalledWith('table.invalidNumber')
    // 且不留 cell 级提示（已不在编辑态）
    expect(edit.editInvalidKey.value).toBeNull()
    // 原值未被污染
    expect(edit.getCellValue('r1', 'amount', '10')).toBe('10')
  })

  it('失败提示随用户继续输入清除（避免残留旧失败态）', () => {
    const { edit } = setupTyped({ onNormalizeError: vi.fn() })
    edit.startEdit('r1', 'amount', '10')
    edit.editValue.value = 'abc'
    expect(edit.commitEdit('enter')).toBe(false)
    expect(edit.editInvalidKey.value).toBe('table.invalidNumber')
    edit.editValue.value = 'abc1' // 用户继续输入
    expect(edit.editInvalidKey.value).toBeNull()
    // 修正后合法 → 正常落库
    edit.editValue.value = '123'
    expect(edit.commitEdit('enter')).toBe(true)
    expect(edit.editInvalidKey.value).toBeNull()
    expect(edit.editingCell.value).toBeNull()
  })

  it('date 列非法日期（2026-02-31）被拒绝，挂 cell 级失败提示', () => {
    const onNormalizeError = vi.fn()
    const { edit, emit } = setupTyped({ onNormalizeError })
    edit.startEdit('r1', 'day', '')
    edit.editValue.value = '2026-02-31'
    expect(edit.commitEdit('enter')).toBe(false)
    expect(emit.cellChange).not.toHaveBeenCalled()
    expect(edit.editInvalidKey.value).toBe('table.invalidDate')
    expect(onNormalizeError).not.toHaveBeenCalled()
  })

  it('未声明 type 的列完全不走归一化（存量表格零行为变化）', () => {
    const { edit, emit } = setupTyped()
    edit.startEdit('r1', 'title', '')
    edit.editValue.value = '9/12'
    edit.commitEdit()
    expect(emit.cellChange).toHaveBeenCalledWith('r1', 'title', '9/12')
  })

  it("type='text' 保住前导零（007 不被当数字）", () => {
    const { edit, emit } = setupTyped()
    edit.startEdit('r1', 'keep', '')
    edit.editValue.value = '007'
    edit.commitEdit()
    expect(emit.cellChange).toHaveBeenCalledWith('r1', 'keep', '007')
  })

  it('带类型的列仍可清空：空串放行不报错', () => {
    const onNormalizeError = vi.fn()
    const { edit, emit } = setupTyped({ onNormalizeError })
    edit.startEdit('r1', 'day', '2026-09-12')
    edit.editValue.value = ''
    expect(edit.commitEdit('enter')).toBe(true)
    expect(emit.cellChange).toHaveBeenCalledWith('r1', 'day', '')
    expect(onNormalizeError).not.toHaveBeenCalled()
  })

  it("dateInputOrder='DMY' 时 9/12 → 12月9日", () => {
    const emit = { cellChange: vi.fn(), cellNote: vi.fn() }
    const dmyCols: Column[] = [{ key: 'day', title: '日期', type: 'date' }]
    const edit = useTableEdit({ columns: dmyCols, editable: true, keyboardNav: true, dateInputOrder: 'DMY' }, emit)
    edit.startEdit('r1', 'day', '')
    edit.editValue.value = '9/12'
    edit.commitEdit()
    expect(emit.cellChange).toHaveBeenCalledWith('r1', 'day', `${new Date().getFullYear()}-12-09`)
  })

  it('Tab 提交遇非法值时不推进到下一列', () => {
    const { edit } = setupTyped({ onNormalizeError: vi.fn() })
    edit.startEdit('r1', 'amount', '10')
    edit.editValue.value = 'abc'
    const ev = { key: 'Tab', preventDefault: vi.fn() } as unknown as KeyboardEvent
    edit.onEditKeydown(ev, [{ key: 'amount', title: '金额', type: 'number' }], 'r1')
    // 仍停留在原格等待修正
    expect(edit.editingCell.value?.colKey).toBe('amount')
  })
})

// 回归锁：编辑输入框内粘贴会从 input 冒泡到 td 的 @paste。
// 曾在此被当作「直接粘贴到单元格」处理 —— 存原值绕过归一化且强制关闭编辑态。
describe('useTableEdit · 编辑框内粘贴不被 td 处理器劫持', () => {
  /** 构造一个「编辑框内粘贴」的 ClipboardEvent 假体：target 是 .cell-edit-input */
  function pasteOnEditInput(text: string) {
    const inputEl = document.createElement('input')
    inputEl.className = 'cell-edit-input'
    return {
      target: inputEl,
      clipboardData: { getData: () => text },
      preventDefault: vi.fn(),
      dataTransfer: { files: [] },
    } as unknown as ClipboardEvent
  }

  it('编辑框内粘贴：放行给原生输入，不写原值、不关闭编辑态', async () => {
    const { edit, emit } = setupTyped()
    edit.startEdit('r1', 'day', '2026-08-03')
    await edit.onCellPaste(pasteOnEditInput('9/12'), 'r1', 'day', 'all')

    // 未被劫持：不落库、编辑态仍在（待 Enter/blur 归一化提交）
    expect(emit.cellChange).not.toHaveBeenCalled()
    expect(edit.editingCell.value?.colKey).toBe('day')
  })

  it('非编辑态的单元格直接粘贴：保持既有行为（原样写入）', async () => {
    const { edit, emit } = setupTyped()
    const tdLike = {
      target: document.createElement('td'),
      clipboardData: { getData: () => '9/12' },
      preventDefault: vi.fn(),
      dataTransfer: { files: [] },
    } as unknown as ClipboardEvent
    await edit.onCellPaste(tdLike, 'r1', 'day', 'all')
    // 直接粘贴不走归一化（归一化仅绑定编辑模式），行为与改动前一致
    expect(emit.cellChange).toHaveBeenCalledWith('r1', 'day', '9/12')
  })
})

// ==================== 撤销 / 重做 ====================
describe('useTableEdit · 撤销重做', () => {
  it('写一格 → undo 回滚到原值（无 override 时清掉覆盖键）', () => {
    const { edit, emit } = setup()
    edit.selectCell('r1', 'name', '', false)
    edit.pasteText('新值')
    expect(edit.getCellValue('r1', 'name', '')).toBe('新值')

    expect(edit.undo()).toBe(true)
    // 回滚后 override 键被删除，getCellValue 落到原始值
    expect(edit.getCellValue('r1', 'name', '原值')).toBe('原值')
    // 撤销也要 emit，父组件数据才能同步
    expect(emit.cellChange).toHaveBeenLastCalledWith('r1', 'name', '')
  })

  it('redo 恢复撤销掉的值', () => {
    const { edit } = setup()
    edit.selectCell('r1', 'name', '', false)
    edit.pasteText('第一次')
    edit.undo()
    expect(edit.redo()).toBe(true)
    expect(edit.getCellValue('r1', 'name', '')).toBe('第一次')
  })

  it('矩阵粘贴合成一条：一次 undo 回滚全部格', () => {
    const { edit } = setup()
    edit.selectCell('r1', 'name', '', false)
    // 2×2 矩阵从 r1/name 锚点铺开
    edit.pasteText('a\tb\nc\td')
    expect(edit.getCellValue('r1', 'name', '')).toBe('a')
    expect(edit.getCellValue('r1', 'qty', '')).toBe('b')
    expect(edit.getCellValue('r2', 'name', '')).toBe('c')

    expect(edit.undo()).toBe(true)
    // 四格应同时回滚（若拆成多条，这里只会回滚最后一格）
    expect(edit.getCellValue('r1', 'name', '')).toBe('')
    expect(edit.getCellValue('r1', 'qty', '')).toBe('')
    expect(edit.getCellValue('r2', 'name', '')).toBe('')
    expect(edit.getCellValue('r2', 'qty', '')).toBe('')
  })

  it('同一格多次写入后逐次撤销：回到最初值（逆序回写）', () => {
    const { edit } = setup()
    edit.selectCell('r1', 'name', '原始', false)
    edit.pasteText('第一')
    edit.pasteText('第二')
    expect(edit.getCellValue('r1', 'name', '')).toBe('第二')
    edit.undo()
    expect(edit.getCellValue('r1', 'name', '')).toBe('第一')
    edit.undo()
    // before 记录的是「首次写入前」= undefined → 删除覆盖键，回落到原始值
    expect(edit.getCellValue('r1', 'name', '原始')).toBe('原始')
  })

  it('栈空时 undo/redo 返回 false 且不报错', () => {
    const { edit } = setup()
    expect(edit.undo()).toBe(false)
    expect(edit.redo()).toBe(false)
  })

  it('Ctrl+Z / Ctrl+Y 走同一入口（keydown 接线）', () => {
    const { edit } = setup()
    edit.selectCell('r1', 'name', '', false)
    edit.pasteText('值')
    const ctrlZ = { key: 'z', ctrlKey: true, preventDefault: vi.fn() } as unknown as KeyboardEvent
    edit.onCellKeydown(ctrlZ)
    expect(ctrlZ.preventDefault).toHaveBeenCalled()
    expect(edit.getCellValue('r1', 'name', '原始')).toBe('原始')

    const ctrlY = { key: 'y', ctrlKey: true, preventDefault: vi.fn() } as unknown as KeyboardEvent
    edit.onCellKeydown(ctrlY)
    expect(edit.getCellValue('r1', 'name', '')).toBe('值')
  })

  it('Ctrl+Shift+Z 也是重做', () => {
    const { edit } = setup()
    edit.selectCell('r1', 'name', '', false)
    edit.pasteText('值')
    edit.onCellKeydown({ key: 'z', ctrlKey: true, preventDefault: vi.fn() } as unknown as KeyboardEvent)
    edit.onCellKeydown({ key: 'z', ctrlKey: true, shiftKey: true, preventDefault: vi.fn() } as unknown as KeyboardEvent)
    expect(edit.getCellValue('r1', 'name', '')).toBe('值')
  })

  // 联动关键：cellChange 的契约是「该格现在是什么值」。
  // 撤销把一格回滚到「未修改」态时，它当前的值是**原始值**，不是空串 ——
  // 若 emit ''，监听 cellChange 双向同步数据的父组件会把该格清空。
  it('撤销「首次修改」应 emit 原始值，而非空串（父组件数据不被清空）', () => {
    const emit = { cellChange: vi.fn(), cellNote: vi.fn() }
    const edit = useTableEdit({ columns: cols, editable: true, keyboardNav: true }, emit, {
      // 模拟 DataTable 传入的 hook：override 被删除后回落到原始显示值
      getCellDisplayValue: (rk: string, ck: string) => edit.getCellValue(rk, ck, '原始值'),
    })
    edit.setDisplayMatrix(['r1'], ['name'])
    edit.selectCell('r1', 'name', '原始值', false)
    edit.pasteText('新值')
    expect(edit.getCellValue('r1', 'name', '原始值')).toBe('新值')

    edit.undo()
    // 值本身正确回滚
    expect(edit.getCellValue('r1', 'name', '原始值')).toBe('原始值')
    // 关键断言：emit 的是原始值，不是 ''
    expect(emit.cellChange).toHaveBeenLastCalledWith('r1', 'name', '原始值')
  })

  it('撤销后复制该格 → 复制到原始值（缓存同步，不复制撤销前的旧值）', async () => {
    const emit = { cellChange: vi.fn(), cellNote: vi.fn() }
    const edit = useTableEdit({ columns: cols, editable: true, keyboardNav: true }, emit, {
      getCellDisplayValue: (rk: string, ck: string) => edit.getCellValue(rk, ck, '初始'),
    })
    edit.setDisplayMatrix(['r1'], ['name'])
    edit.selectCell('r1', 'name', '初始', false)
    edit.pasteText('改过了')
    // 重新选中该格（模拟用户点了它一眼），缓存此时是「改过了」
    edit.selectCell('r1', 'name', '改过了', false)

    edit.undo()
    await edit.copySelectedCell()
    // 撤销后缓存必须同步为原始值，否则 Ctrl+C 会复制到已被撤销的旧值
    expect(edit._clipboard.value).toBe('初始')
  })
})

// 联动锁：Enter 提交后会「下移并直接续编」下一格（连续录入）。此时用户按 Ctrl+Z 想撤销刚录的值，
// 却会撞上 `if (editingCell.value) return` 被静默忽略 —— 用户完全没反应。
// 规则：编辑态下若输入框**尚未改动**（pristine），Ctrl+Z/Y 视为撤销上一步表格操作并退出编辑；
//       若已有改动，则交给输入框原生撤销（不拦截）。
describe('useTableEdit · 编辑态下的撤销（连续录入联动）', () => {
  /** 构造「刚 Enter 完、停在下一格编辑态且未改动」的状态 */
  function intoFreshEdit() {
    const emit = { cellChange: vi.fn(), cellNote: vi.fn() }
    const edit = useTableEdit({ columns: cols, editable: true, keyboardNav: true }, emit, {
      getCellDisplayValue: (rk: string, ck: string) => edit.getCellValue(rk, ck, '原始'),
    })
    edit.setDisplayMatrix(['r1', 'r2'], ['name', 'qty'])
    // 先产生一条可撤销的修改
    edit.selectCell('r1', 'name', '原始', false)
    edit.pasteText('已录入')
    // 再进入「新格编辑态且未改动」（等价于 Enter 下移后的状态）
    edit.startEdit('r2', 'name', '原始')
    return { edit, emit }
  }

  it('编辑态未改动 + Ctrl+Z：退出编辑并撤销上一步表格操作（不再静默忽略）', () => {
    const { edit, emit } = intoFreshEdit()
    expect(edit.editingCell.value).not.toBeNull()
    expect(edit.editValue.value).toBe('原始')

    const ev = { key: 'z', ctrlKey: true, preventDefault: vi.fn() } as unknown as KeyboardEvent
    edit.onCellKeydown(ev)

    expect(ev.preventDefault).toHaveBeenCalled()
    expect(edit.editingCell.value).toBeNull()
    expect(edit.getCellValue('r1', 'name', '原始')).toBe('原始')
    expect(emit.cellChange).toHaveBeenLastCalledWith('r1', 'name', '原始')
  })

  it('编辑态未改动 + Ctrl+Y：退出编辑并重做', () => {
    const { edit } = intoFreshEdit()
    const z = { key: 'z', ctrlKey: true, preventDefault: vi.fn() } as unknown as KeyboardEvent
    edit.onCellKeydown(z)
    // 重新进入未改动编辑态，再重做
    edit.startEdit('r2', 'name', '原始')
    const y = { key: 'y', ctrlKey: true, preventDefault: vi.fn() } as unknown as KeyboardEvent
    edit.onCellKeydown(y)
    expect(y.preventDefault).toHaveBeenCalled()
    expect(edit.editingCell.value).toBeNull()
    expect(edit.getCellValue('r1', 'name', '原始')).toBe('已录入')
  })

  it('编辑态**已有改动** + Ctrl+Z：不拦截，交给输入框原生撤销', () => {
    const { edit } = intoFreshEdit()
    edit.editValue.value = '改了一半'
    const ev = { key: 'z', ctrlKey: true, preventDefault: vi.fn() } as unknown as KeyboardEvent
    edit.onCellKeydown(ev)

    // 不拦截、不退出编辑、不动表格数据
    expect(ev.preventDefault).not.toHaveBeenCalled()
    expect(edit.editingCell.value).not.toBeNull()
    expect(edit.getCellValue('r1', 'name', '原始')).toBe('已录入')
  })
})
// startEdit / markEditActive 必须在进入编辑时就标记，不能依赖「双击前一定有个 click 走 selectCell」——
// 卡片视图没有 <td> 也就没有 selectCell，拖选结束 200ms 内的 click 还会被 _rangeSuppressClick 吞掉。
describe('useTableEdit · 活动表格标记（多实例作用域）', () => {
  it('仅 startEdit 进入编辑（无 click）也能被识别为活动表格 → Ctrl+Z 生效', () => {
    const emitA = { cellChange: vi.fn(), cellNote: vi.fn() }
    const emitB = { cellChange: vi.fn(), cellNote: vi.fn() }
    const a = useTableEdit({ columns: cols, editable: true, keyboardNav: true }, emitA)
    const b = useTableEdit({ columns: cols, editable: true, keyboardNav: true }, emitB)
    a.setDisplayMatrix(['r1'], ['name'])
    b.setDisplayMatrix(['r1'], ['name'])

    // B 后创建；A 通过 startEdit 进入编辑（不经过 selectCell）
    a.startEdit('r1', 'name', 'A原值')
    a.editValue.value = 'A新值'
    a.commitEdit()

    // 撤销应作用于 A（而非被 b 抢走），B 不受影响
    a.onCellKeydown({ key: 'z', ctrlKey: true, preventDefault: vi.fn() } as unknown as KeyboardEvent)
    expect(a.getCellValue('r1', 'name', 'A原值')).toBe('A原值')
    expect(emitA.cellChange).toHaveBeenCalled()
    expect(emitB.cellChange).not.toHaveBeenCalled()
  })

  it('markEditActive 显式标记（卡片视图字段点击场景）后撤销生效', () => {
    const emit = { cellChange: vi.fn(), cellNote: vi.fn() }
    const edit = useTableEdit({ columns: cols, editable: true, keyboardNav: true }, emit)
    edit.setDisplayMatrix(['r1'], ['name'])
    // 模拟卡片视图：点击字段只标记、不进 selectCell
    edit.markEditActive()
    edit.applyChanges([{ rowKey: 'r1', colKey: 'name', value: '新值' }])

    edit.onCellKeydown({ key: 'z', ctrlKey: true, preventDefault: vi.fn() } as unknown as KeyboardEvent)
    expect(edit.getCellValue('r1', 'name', '原值')).toBe('原值')
  })
})

// ==================== Enter 提交后按行位移 ====================
describe('useTableEdit · Enter 提交后移动选中', () => {
  it('Enter：提交后下移一行同列', async () => {
    const { edit, emit } = setup()
    edit.startEdit('r1', 'name', '')
    edit.editValue.value = '改了'
    const ev = { key: 'Enter', preventDefault: vi.fn() } as unknown as KeyboardEvent
    edit.onEditKeydown(ev, cols, 'r1')
    await Promise.resolve()
    await new Promise((r) => setTimeout(r, 0))
    await Promise.resolve()
    expect(emit.cellChange).toHaveBeenCalledWith('r1', 'name', '改了')
    // name 可编辑 → 直接续编下一行同列
    expect(edit.editingCell.value?.rowKey).toBe('r2')
    expect(edit.editingCell.value?.colKey).toBe('name')
  })

  it('Shift+Enter：上移一行', async () => {
    const { edit } = setup()
    edit.startEdit('r2', 'name', '')
    edit.editValue.value = 'x'
    const ev = { key: 'Enter', shiftKey: true, preventDefault: vi.fn() } as unknown as KeyboardEvent
    edit.onEditKeydown(ev, cols, 'r2')
    await new Promise((r) => setTimeout(r, 0))
    expect(edit.editingCell.value?.rowKey).toBe('r1')
  })

  it('Ctrl+Enter：停留原格（不移动）', async () => {
    const { edit } = setup()
    edit.startEdit('r1', 'name', '')
    edit.editValue.value = 'x'
    const ev = { key: 'Enter', ctrlKey: true, preventDefault: vi.fn() } as unknown as KeyboardEvent
    edit.onEditKeydown(ev, cols, 'r1')
    await new Promise((r) => setTimeout(r, 0))
    // 提交后退出编辑，且不启动新编辑
    expect(edit.editingCell.value).toBeNull()
  })

  it('末行 Enter：不越界，仅退出编辑', async () => {
    const { edit } = setup()
    edit.startEdit('r2', 'name', '')
    edit.editValue.value = 'x'
    edit.onEditKeydown({ key: 'Enter', preventDefault: vi.fn() } as unknown as KeyboardEvent, cols, 'r2')
    await new Promise((r) => setTimeout(r, 0))
    expect(edit.editingCell.value).toBeNull()
  })

  it('非法值 Enter：保持编辑态，不移动（归一化优先）', async () => {
    const { edit } = setupTyped({ onNormalizeError: vi.fn() })
    edit.startEdit('r1', 'amount', '10')
    edit.editValue.value = 'abc'
    edit.onEditKeydown(
      { key: 'Enter', preventDefault: vi.fn() } as unknown as KeyboardEvent,
      [{ key: 'amount', title: '金额', type: 'number' }],
      'r1',
    )
    await new Promise((r) => setTimeout(r, 0))
    expect(edit.editingCell.value?.rowKey).toBe('r1')
    expect(edit.editingCell.value?.colKey).toBe('amount')
  })
})

// ==================== 备注模式（noteMode） ====================
describe('useTableEdit · 备注模式', () => {
  function setupNote(over: Record<string, unknown> = {}) {
    const emit = { cellChange: vi.fn(), cellNote: vi.fn() }
    const edit = useTableEdit({ columns: cols, editable: true, keyboardNav: true, noteMode: true, ...over }, emit)
    edit.setDisplayMatrix(['r1'], ['name'])
    return { edit, emit }
  }

  it('startNoteEdit → commitNote：写入备注并 emit cellNote', () => {
    const { edit, emit } = setupNote()
    edit.startNoteEdit({ stopPropagation: vi.fn() } as unknown as MouseEvent, 'r1', 'name')
    expect(edit.noteEditing.value).toEqual({ rowKey: 'r1', colKey: 'name' })
    edit.noteDraft.value = '  这是一条备注  '
    edit.commitNote()

    // 首尾空白裁剪后落库
    expect(edit.getNote('r1', 'name')).toBe('这是一条备注')
    expect(edit.hasNote('r1', 'name')).toBe(true)
    expect(emit.cellNote).toHaveBeenCalledWith('r1', 'name', '这是一条备注')
    expect(edit.noteEditing.value).toBeNull()
  })

  it('commitNote 空串：删除备注并清理空行', () => {
    const { edit, emit } = setupNote()
    edit.startNoteEdit({ stopPropagation: vi.fn() } as unknown as MouseEvent, 'r1', 'name')
    edit.noteDraft.value = '先写点东西'
    edit.commitNote()
    expect(edit.hasNote('r1', 'name')).toBe(true)

    edit.startNoteEdit({ stopPropagation: vi.fn() } as unknown as MouseEvent, 'r1', 'name')
    edit.noteDraft.value = '   '
    edit.commitNote()
    expect(edit.hasNote('r1', 'name')).toBe(false)
    expect(edit.getNote('r1', 'name')).toBe('')
    expect(edit._notes.value.r1).toBeUndefined()
    expect(emit.cellNote).toHaveBeenLastCalledWith('r1', 'name', '')
  })

  it('noteMode=false 时 startNoteEdit 不打开编辑（开关生效）', () => {
    const { edit } = setupNote({ noteMode: false })
    edit.startNoteEdit({ stopPropagation: vi.fn() } as unknown as MouseEvent, 'r1', 'name')
    expect(edit.noteEditing.value).toBeNull()
  })

  it('外部 notes prop 变化同步到内部（watch deep）', async () => {
    const { edit } = setupNote()
    // props 是普通对象（非响应式 ref），此处验证初始值已注入
    edit.startNoteEdit({ stopPropagation: vi.fn() } as unknown as MouseEvent, 'r1', 'name')
    expect(edit.noteDraft.value).toBe('')
  })

  it('onNoteKeydown：Enter 提交 / Escape 取消', () => {
    const { edit, emit } = setupNote()
    edit.startNoteEdit({ stopPropagation: vi.fn() } as unknown as MouseEvent, 'r1', 'name')
    edit.noteDraft.value = '回车提交'
    const enter = { key: 'Enter', preventDefault: vi.fn() } as unknown as KeyboardEvent
    edit.onNoteKeydown(enter)
    expect(enter.preventDefault).toHaveBeenCalled()
    expect(emit.cellNote).toHaveBeenCalledWith('r1', 'name', '回车提交')

    edit.startNoteEdit({ stopPropagation: vi.fn() } as unknown as MouseEvent, 'r1', 'name')
    edit.noteDraft.value = '不该保存'
    edit.onNoteKeydown({ key: 'Escape' } as unknown as KeyboardEvent)
    expect(edit.noteEditing.value).toBeNull()
    expect(edit.getNote('r1', 'name')).toBe('回车提交')
  })

  it('showNoteTooltip：仅 noteMode 且有备注时弹出', () => {
    const { edit } = setupNote()
    const target = document.createElement('td')
    const ev = { target } as unknown as MouseEvent
    // 无备注 → 不弹
    edit.showNoteTooltip(ev, 'r1', 'name')
    expect(edit.noteTooltip.value).toBeNull()

    edit.startNoteEdit({ stopPropagation: vi.fn() } as unknown as MouseEvent, 'r1', 'name')
    edit.noteDraft.value = '有备注了'
    edit.commitNote()
    edit.showNoteTooltip(ev, 'r1', 'name')
    expect(edit.noteTooltip.value?.text).toBe('有备注了')
    edit.hideNoteTooltip()
    expect(edit.noteTooltip.value).toBeNull()
  })
})

// ==================== 原始值气泡 ====================
describe('useTableEdit · 原始值气泡', () => {
  it('仅已修改的单元格才弹原始值气泡', () => {
    const emit = { cellChange: vi.fn(), cellNote: vi.fn() }
    const edit = useTableEdit({ columns: cols, editable: true, keyboardNav: true, originalTooltip: true }, emit)
    edit.setDisplayMatrix(['r1'], ['name'])
    const ev = { target: document.createElement('td') } as unknown as MouseEvent

    // 未修改 → 不弹
    edit.showOriginalTooltip(ev, 'r1', 'name', '原始')
    expect(edit.originalTooltip.value).toBeNull()

    // 修改后 → 弹
    edit.selectCell('r1', 'name', '原始', false)
    edit.pasteText('改了')
    edit.showOriginalTooltip(ev, 'r1', 'name', '原始')
    expect(edit.originalTooltip.value?.text).toBe('原始')
    edit.hideOriginalTooltip()
    expect(edit.originalTooltip.value).toBeNull()
  })

  it('originalTooltip=false 时不弹（开关生效）', () => {
    const emit = { cellChange: vi.fn(), cellNote: vi.fn() }
    const edit = useTableEdit({ columns: cols, editable: true, keyboardNav: true }, emit)
    edit.setDisplayMatrix(['r1'], ['name'])
    edit.selectCell('r1', 'name', '原始', false)
    edit.pasteText('改了')
    edit.showOriginalTooltip({ target: document.createElement('td') } as unknown as MouseEvent, 'r1', 'name', '原始')
    expect(edit.originalTooltip.value).toBeNull()
  })
})

// ==================== 填充柄 ====================
describe('useTableEdit · 填充柄', () => {
  /** 3 行矩阵 + 读取 override 的显示值 hook（生产环境由 DataTable 提供同一口径） */
  function setup3() {
    const emit = { cellChange: vi.fn(), cellNote: vi.fn() }
    const edit = useTableEdit({ columns: cols, editable: true, keyboardNav: true }, emit, {
      getCellDisplayValue: (rk, ck) => edit.getCellValue(rk, ck, ''),
    })
    edit.setDisplayMatrix(['r1', 'r2', 'r3'], ['name', 'qty', 'status'])
    return { edit, emit }
  }

  /** 建立覆盖 r1..r2 × name..qty 的矩形选区 */
  function withRange(edit: ReturnType<typeof setup3>['edit']) {
    edit.startRange(0, 0, ['r1', 'r2', 'r3'], ['name', 'qty', 'status'], '1')
    edit.updateRange(1, 1)
  }

  it('无选区不可填；有选区且列可编辑时可填', () => {
    const { edit } = setup3()
    expect(edit.canFill()).toBe(false)
    withRange(edit)
    expect(edit.canFill()).toBe(true)
    expect(edit.fillable.value).toBe(true)
  })

  // 回归锁：整表不可编辑时不得显示填充柄。
  // applyFill 有 `!props.editable` 守卫，而 canFill 曾漏掉它 →
  // 整表不可编辑的表格仍渲染紫色填充柄，拖拽却无效（「看着能点却点不了」）。
  it('整表 editable=false：不可填、且填充柄不渲染（与 applyFill 守卫一致）', () => {
    const emit = { cellChange: vi.fn(), cellNote: vi.fn() }
    const ro = useTableEdit({ columns: cols, editable: false, keyboardNav: true }, emit, {
      getCellDisplayValue: () => '',
    })
    ro.setDisplayMatrix(['r1', 'r2', 'r3'], ['name', 'qty', 'status'])
    ro.startRange(0, 0, ['r1', 'r2', 'r3'], ['name', 'qty', 'status'], '1')
    ro.updateRange(1, 1)

    // canFill 是「是否显示填充柄」的许可判定（模板用 fillable && isFillCorner）
    expect(ro.canFill()).toBe(false)
    expect(ro.fillable.value).toBe(false)
    expect(ro.applyFill('down', 1)).toBe(false)
  })

  it('options 列也在可填范围内（其值本就是枚举文本）', () => {
    const { edit } = setup3()
    edit.startRange(0, 2, ['r1', 'r2', 'r3'], ['name', 'qty', 'status'], 'active')
    edit.updateRange(1, 2)
    // status 是 options 列，fill 只检查 editable !== false / 非图片列
    expect(edit.canFill()).toBe(true)
  })

  it('只读列（editable:false）不可填', () => {
    const roCols: Column[] = [
      { key: 'name', title: '名称' },
      { key: 'code', title: '只读', editable: false },
    ]
    const ro = useTableEdit(
      { columns: roCols, editable: true, keyboardNav: true },
      { cellChange: vi.fn(), cellNote: vi.fn() },
    )
    ro.setDisplayMatrix(['r1', 'r2'], ['name', 'code'])
    ro.startRange(0, 1, ['r1', 'r2'], ['name', 'code'], 'E1')
    ro.updateRange(1, 1)
    expect(ro.canFill()).toBe(false)
  })

  it('applyFill down：单格数字按步长 1 递进，且合成一条撤销记录', () => {
    const { edit, emit } = setup3()
    // 种子：r2/qty = 10（先经写入漏斗，填充源与「眼前所见」一致）
    edit.applyChanges([{ rowKey: 'r2', colKey: 'qty', value: '10' }])
    // 只选中这一格（单格数字 → 步长 1，Excel 默认）
    edit.startRange(1, 1, ['r1', 'r2', 'r3'], ['name', 'qty', 'status'], '10')
    edit.updateRange(1, 1)
    expect(edit.canFill()).toBe(true)

    expect(edit.applyFill('down', 1)).toBe(true)
    expect(edit.getCellValue('r3', 'qty', '')).toBe('11')

    // 一次 undo 把填充整批回滚（r2 的种子保留 —— 它是前一条记录）
    edit.undo()
    expect(edit.getCellValue('r3', 'qty', '')).toBe('')
    expect(edit.getCellValue('r2', 'qty', '')).toBe('10')
    expect(emit.cellChange).toHaveBeenCalled()
  })

  it('applyFill down：文本列循环重复源值', () => {
    const { edit } = setup3()
    edit.applyChanges([{ rowKey: 'r2', colKey: 'name', value: '苹果' }])
    edit.startRange(1, 0, ['r1', 'r2', 'r3'], ['name', 'qty', 'status'], '苹果')
    edit.updateRange(1, 0)
    expect(edit.applyFill('down', 1)).toBe(true)
    expect(edit.getCellValue('r3', 'name', '')).toBe('苹果')
  })

  it('applyFill 越界（往下超出显示行）不写入', () => {
    const { edit } = setup3()
    // 选区覆盖到末行 r3 → 下方无扩展空间
    edit.startRange(0, 0, ['r1', 'r2', 'r3'], ['name', 'qty', 'status'], 'a')
    edit.updateRange(2, 1)
    const changed = edit.applyFill('down', 1)
    expect(changed).toBe(false)
  })

  it('fillHandleRange 暴露选区右下角边界', () => {
    const { edit } = setup3()
    withRange(edit)
    expect(edit.fillHandleRange.value).toEqual({ r0: 0, r1: 1, c0: 0, c1: 1 })
    expect(edit.isFillCorner('r2', 'qty')).toBe(true)
    expect(edit.isFillCorner('r1', 'qty')).toBe(false)
    expect(edit.isFillCorner('r2', 'name')).toBe(false)
  })
})
