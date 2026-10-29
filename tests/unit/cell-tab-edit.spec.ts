/**
 * `useCellEdit` · Tab 连续录入（第 177 轮）
 *
 * 覆盖率实测 `cell-edit.ts` 语句 81.4% / **分支 63.6%**，未执行行集中在
 * Tab 分支（L162-173）与 Escape 分支 —— 即"连续录入时按 Tab 换到下一列"这条路径，
 * 既有 30 例 `cell-input.spec.ts` 只测归一化，`useCellEdit` 本身没有任何直达用例。
 *
 * 读码发现两处与全仓口径不一致的缺陷：
 *   ① Tab 选下一列时只排除 `accept === 'image'` 与 `options`，**没排除只读列**
 *      （`editable === false`）。而模板的编辑框渲染条件也只判 `editable && !col.options`，
 *      于是 Tab 会把编辑态落进只读列，提交时 `applyChange` 真的写进去。
 *      全仓另外 5 处（cell-clipboard / cell-fill / cell-select / moveAfterCommit /
 *      DataTable.canEdit）都排除了只读列 —— 只有 Tab 漏了。
 *   ② Tab 进入下一格时直接把 `value: ''` 写进编辑态，**不预填该格已有值**；
 *      而 Enter 路径（moveAfterCommit → startEdit）是预填的。用户 Tab 到有内容的格子
 *      看到的却是空白框，容易误判"这格是空的"而复写。
 *      手工赋值还绕过了 `startEdit` 的三个副作用（markActive / preEditCell / 清选区），
 *      导致 Tab 进入后按 Escape，选中格会恢复到上一个格子。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useCellEdit } from '@/components/data/composables/cell-edit'
import type { CellEditDeps } from '@/components/data/composables/cell-edit'
import type { Column } from '@/components/data/composables/types'

vi.mock('@/components/data/composables/cell-active', () => ({ markActive: vi.fn() }))

const ROWS = ['r1', 'r2']

/** 造表格数据（displayValue 从这里取，模拟真实单元格内容） */
const DATA: Record<string, Record<string, string>> = {
  r1: { name: '老王', id: 'ID-1', amount: '100' },
  r2: { name: '小李', id: 'ID-2', amount: '200' },
}

function makeHarness(columns: Column[]) {
  const selectedCell = ref<{ rowKey: string; colKey: string } | null>(null)
  const selectedCellValue = ref('')
  const applyChange = vi.fn()
  const selectCell = vi.fn((rowKey: string, colKey: string, value: string) => {
    selectedCell.value = { rowKey, colKey }
    selectedCellValue.value = value
  })

  const deps = {
    props: { editable: true, columns },
    editKey: {},
    write: { applyChange },
    select: {
      displayRows: ref(ROWS),
      displayCols: ref(columns.map((c) => c.key)),
      displayValue: (rowKey: string, colKey: string) => DATA[rowKey]?.[colKey] ?? '',
      selectedCell,
      selectedCellValue,
      multiSelection: ref(new Set<string>()),
      selectedColKey: ref<string | null>(null),
      clearRange: vi.fn(),
      selectCell,
    },
  } as unknown as CellEditDeps

  const edit = useCellEdit(deps)
  return { edit, applyChange, selectedCell, selectCell }
}

/** 造一个 Tab 键事件 */
function tabEvent(): KeyboardEvent {
  return { key: 'Tab', preventDefault: vi.fn() } as unknown as KeyboardEvent
}

/** 造一个 Enter 键事件 */
function enterEvent(): KeyboardEvent {
  return { key: 'Enter', preventDefault: vi.fn() } as unknown as KeyboardEvent
}

const COL_NAME: Column = { key: 'name', title: '姓名', type: 'text' } as Column
/** 只读列（如系统编号）：editable === false */
const COL_ID: Column = { key: 'id', title: '编号', editable: false } as Column
const COL_AMOUNT: Column = { key: 'amount', title: '金额', type: 'number' } as Column
const COL_IMAGE: Column = { key: 'photo', title: '照片', accept: 'image' } as Column
const COL_OPTIONS: Column = { key: 'status', title: '状态', options: [{ label: 'A', value: 'a' }] } as Column

let h: ReturnType<typeof makeHarness>

beforeEach(() => {
  h = makeHarness([COL_NAME, COL_ID, COL_AMOUNT])
})

describe('useCellEdit · Tab 换列', () => {
  it('Tab 提交当前格并进入下一可编辑列', async () => {
    h.edit.startEdit('r1', 'amount', '100')
    h.edit.editValue.value = '150'
    h.edit.onEditKeydown(tabEvent(), [COL_NAME, COL_ID, COL_AMOUNT], 'r1')
    await nextTick()
    expect(h.applyChange).toHaveBeenCalledWith('r1', 'amount', '150')
  })

  it('**Tab 必须跳过只读列**（editable === false 不能进编辑态）', async () => {
    // name → 下一列是只读的 id → 应跳过它，落到 amount
    h.edit.startEdit('r1', 'name', '老王')
    h.edit.onEditKeydown(tabEvent(), [COL_NAME, COL_ID, COL_AMOUNT], 'r1')
    await nextTick()
    expect(h.edit.editingCell.value?.colKey, '只读列不该被 Tab 选中').toBe('amount')
  })

  it('**Tab 进入下一格要预填该格已有值**（否则用户以为那格是空的）', async () => {
    h.edit.startEdit('r1', 'name', '老王')
    h.edit.onEditKeydown(tabEvent(), [COL_NAME, COL_AMOUNT], 'r1')
    await nextTick()
    expect(h.edit.editingCell.value?.colKey).toBe('amount')
    expect(h.edit.editValue.value, '应预填 r1 的 amount = 200? 不，r1 是 100').toBe('100')
  })

  it('Tab 到末尾 → 回绕到本行第一个可编辑列，并预填其值', async () => {
    h.edit.startEdit('r1', 'amount', '100')
    h.edit.onEditKeydown(tabEvent(), [COL_NAME, COL_AMOUNT], 'r1')
    await nextTick()
    expect(h.edit.editingCell.value?.colKey).toBe('name')
    expect(h.edit.editValue.value).toBe('老王')
  })

  it('**Tab 跳过图片列与 options 列**（走弹出面板，不做内联编辑）', async () => {
    const cols = [COL_NAME, COL_IMAGE, COL_OPTIONS, COL_AMOUNT]
    h = makeHarness(cols)
    h.edit.startEdit('r1', 'name', '老王')
    h.edit.onEditKeydown(tabEvent(), cols, 'r1')
    await nextTick()
    expect(h.edit.editingCell.value?.colKey).toBe('amount')
  })

  it('**只读列内容不会被 Tab 录入改写**（端到端：Tab 停在可编辑列，只读列零写入）', async () => {
    h.edit.startEdit('r1', 'name', '老王')
    h.edit.editValue.value = '老王2'
    h.edit.onEditKeydown(tabEvent(), [COL_NAME, COL_ID, COL_AMOUNT], 'r1')
    await nextTick()
    // 再 Tab 一次穿过剩余列，全程不应出现对 id 列的写入
    h.edit.onEditKeydown(tabEvent(), [COL_NAME, COL_ID, COL_AMOUNT], 'r1')
    await nextTick()
    const touched = h.applyChange.mock.calls.map((c) => c[1])
    expect(touched, '只读列 id 不该出现在写入列表里').not.toContain('id')
  })

  it('**Tab 之后按 Escape：选中格回到本格，不残留上一格**（手工赋值会绕过 preEditCell）', async () => {
    h.edit.startEdit('r1', 'name', '老王')
    h.edit.onEditKeydown(tabEvent(), [COL_NAME, COL_AMOUNT], 'r1')
    await nextTick()
    expect(h.edit.editingCell.value?.colKey).toBe('amount')

    h.edit.cancelEdit()
    expect(h.edit.editingCell.value, '取消后退出编辑态').toBeNull()
    expect(h.selectedCell.value?.colKey, '应恢复到 amount（Tab 进入的那格）').toBe('amount')
  })
})

describe('useCellEdit · Enter 提交路径（对照）', () => {
  it('Enter 提交后下移一行同列，且预填下一行值', async () => {
    h.edit.startEdit('r1', 'name', '老王')
    h.edit.onEditKeydown(enterEvent(), [COL_NAME, COL_AMOUNT], 'r1')
    await nextTick()
    expect(h.edit.editingCell.value?.rowKey, '应下移到 r2').toBe('r2')
    expect(h.edit.editValue.value, '应预填 r2 的 name').toBe('小李')
  })

  it('Escape 取消：不写入，退出编辑态', () => {
    h.edit.startEdit('r1', 'name', '老王')
    h.edit.editValue.value = '改了但不提交'
    h.edit.onEditKeydown({ key: 'Escape', preventDefault: vi.fn() } as unknown as KeyboardEvent, [COL_NAME], 'r1')
    expect(h.applyChange).not.toHaveBeenCalled()
    expect(h.edit.editingCell.value).toBeNull()
  })
})