/**
 * cell-select.ts 的深水区 —— 导航早退 / moveToEdge / 编辑准入 / 选区边界 / 矩阵快照
 *
 * ## 为什么补（单文件口径 语句 72.5% / 分支 62.8% / 函数 90.9%，39/153 行未覆盖）
 *
 * 这是四套选择模型（单选 / Ctrl 多选 / 列选 / 矩形选区）的唯一状态机。既有 spec 只覆盖了
 * 「点击选中 + Ctrl 多选 + Shift+Arrow 扩展」的主干，未覆盖的都是**准入与早退**：
 *
 * ① **`splitCellKey`（L45-48）整函数零覆盖**：rowKey 本身可能含 `|`，拆分必须取**第一个** `|`。
 * ② **`moveToEdge`（L234-242）整函数零覆盖**：Ctrl+Home/End 跳首末格。
 * ③ **`moveSelection` 的五条早退**（无锚点 / 索引为负 / 越界 / 目标 key 缺失）：
 *    每条都对应「按了方向键但什么都没发生」的一种具体原因，少一条就会误触发滚动或选中。
 * ④ **`enterEditFromSelection` 的四重准入**（不可编辑 / 列不存在 / 列被标记不可编辑 /
 *    options 列 / 图片列）：图片与下拉列进编辑会炸，这层是唯一防线。
 * ⑤ **`selectCell` 的 Ctrl 分支边界**：多选清空后主选格要变 null、列选要清空。
 * ⑥ **`startRange` 的非法索引守卫（L143）**：锚点取不到 key 时直接放弃，不留半截选区。
 * ⑦ **`updateRange` 的钳位（L169-170）**：拖到表格外时焦点必须夹在矩阵内。
 * ⑧ **`isInRange` 的行列负索引（L117）**：key 不在快照里要返回 false，不能靠 Math.min 兜。
 */
import { describe, it, expect, vi } from 'vitest'
import { useCellSelect } from '@/components/data/composables/cell-select'
import type { CellEditProps, TableEditHooks } from '@/components/data/composables/cell-types'

type ColDef = NonNullable<CellEditProps['columns']>[number]

function setup(opts: { columns?: ColDef[]; editable?: boolean; hooks?: TableEditHooks } = {}) {
  const startEdit = vi.fn()
  const api = useCellSelect({
    props: {
      editable: opts.editable !== false,
      columns: opts.columns ?? [
        { key: 'c1', title: 'C1' },
        { key: 'c2', title: 'C2' },
        { key: 'c3', title: 'C3' },
      ],
    } as CellEditProps,
    hooks: opts.hooks,
    editKey: {},
    startEdit,
  })
  api.setDisplayMatrix(['r1', 'r2', 'r3'], ['c1', 'c2', 'c3'])
  return { api, startEdit }
}

function key(name: string): KeyboardEvent {
  return { key: name, preventDefault: vi.fn() } as unknown as KeyboardEvent
}

/* ═══════════ ① splitCellKey ═══════════ */

describe('splitCellKey', () => {
  it('**常规 "row|col" 拆成两半**', () => {
    const { api } = setup()
    expect(api.splitCellKey('r1|c1')).toEqual(['r1', 'c1'])
  })

  it('**rowKey 内含 | 时按第一个 | 切**（否则列 key 会被截断）', () => {
    const { api } = setup()
    expect(api.splitCellKey('a|b|c1')).toEqual(['a', 'b|c1'])
  })

  it('**没有 | → 返回 null**', () => {
    const { api } = setup()
    expect(api.splitCellKey('nocollider')).toBeNull()
  })

  it('**| 在开头（idx===0）→ 返回 null**（空 rowKey 视为非法）', () => {
    const { api } = setup()
    expect(api.splitCellKey('|c1')).toBeNull()
  })

  it('**空串 → 返回 null**', () => {
    const { api } = setup()
    expect(api.splitCellKey('')).toBeNull()
  })

  it('**"row|" → 合法，列 key 为空串**（只有左侧要有内容）', () => {
    const { api } = setup()
    expect(api.splitCellKey('row|')).toEqual(['row', ''])
  })
})

/* ═══════════ ② cellKey / displayValue / setDisplayMatrix ═══════════ */

describe('键与显示值', () => {
  it('**cellKey 用 | 拼接**', () => {
    const { api } = setup()
    expect(api.cellKey('r', 'c')).toBe('r|c')
  })

  it('**displayValue 走 hook**', () => {
    const { api } = setup({ hooks: { getCellDisplayValue: (r, c) => `${r}-${c}` } })
    expect(api.displayValue('r1', 'c2')).toBe('r1-c2')
  })

  it('**没有 hook → 空串兜底**（不能返回 undefined 让模板印出 undefined）', () => {
    const { api } = setup()
    expect(api.displayValue('r1', 'c1')).toBe('')
  })

  it('**hook 返回空串时不吞**', () => {
    const { api } = setup({ hooks: { getCellDisplayValue: () => '' } })
    expect(api.displayValue('r', 'c')).toBe('')
  })

  it('**setDisplayMatrix 覆盖两份快照**', () => {
    const { api } = setup()
    api.setDisplayMatrix(['x'], ['y', 'z'])
    expect(api.displayRows.value).toEqual(['x'])
    expect(api.displayCols.value).toEqual(['y', 'z'])
  })
})

/* ═══════════ ③ selectCell 的 Ctrl 分支边界 ═══════════ */

describe('selectCell 边界', () => {
  it('**Ctrl 加选：主选格跟着最后一次点击**', () => {
    const { api } = setup()
    api.selectCell('r1', 'c1', 'v1', false)
    api.selectCell('r2', 'c2', 'v2', true)
    expect(api.selectedCell.value).toEqual({ rowKey: 'r2', colKey: 'c2' })
    expect(api.selectedCellValue.value).toBe('v2')
    expect(api.multiSelection.value.size).toBe(1)
  })

  it('**Ctrl 取消唯一选中 → 主选格变 null**', () => {
    const { api } = setup()
    api.selectCell('r1', 'c1', 'v1', true)
    expect(api.multiSelection.value.size).toBe(1)
    api.selectCell('r1', 'c1', 'v1', true) // 再点一次取消
    expect(api.multiSelection.value.size).toBe(0)
    expect(api.selectedCell.value, '多选空了主选格也要清').toBeNull()
  })

  it('**Ctrl 点击会清掉列选**（两种选择模型互斥）', () => {
    const { api } = setup()
    api.toggleSelectColumn('c1')
    expect(api.selectedColKey.value).toBe('c1')
    api.selectCell('r1', 'c2', 'v', true)
    expect(api.selectedColKey.value).toBeNull()
  })

  it('**普通点击清空多选**（不借助列选的副作用）', () => {
    const { api } = setup()
    api.selectCell('r1', 'c1', 'a', true)
    api.selectCell('r2', 'c2', 'b', true)
    expect(api.multiSelection.value.size, '前置：多选有 2 格').toBe(2)
    api.selectCell('r3', 'c3', 'z', false)
    expect(api.multiSelection.value.size, '普通点击清多选').toBe(0)
    expect(api.selectedCell.value).toEqual({ rowKey: 'r3', colKey: 'c3' })
  })

  it('**普通点击清空列选**', () => {
    const { api } = setup()
    api.toggleSelectColumn('c1')
    expect(api.selectedColKey.value, '前置：列选已选').toBe('c1')
    api.selectCell('r2', 'c2', 'v', false)
    expect(api.selectedColKey.value, '普通点击清列选').toBeNull()
  })

  it('**任何点击都清矩形选区**（选区优先级最高，点击即退出）', () => {
    const { api } = setup()
    api.startRange(0, 0, ['r1', 'r2'], ['c1', 'c2'], 'v')
    expect(api.rangeSel.value).not.toBeNull()
    api.selectCell('r2', 'c2', 'x', false)
    expect(api.rangeSel.value).toBeNull()
  })
})

/* ═══════════ ④ toggleSelectColumn ═══════════ */

describe('列选', () => {
  it('**同列再点 → 取消列选**', () => {
    const { api } = setup()
    api.toggleSelectColumn('c1')
    api.toggleSelectColumn('c1')
    expect(api.selectedColKey.value).toBeNull()
  })

  it('**换列 → 列选切换且清掉单选/多选**', () => {
    const { api } = setup()
    api.selectCell('r1', 'c1', 'v', true)
    api.toggleSelectColumn('c2')
    expect(api.selectedColKey.value).toBe('c2')
    expect(api.selectedCell.value).toBeNull()
    expect(api.multiSelection.value.size).toBe(0)
  })

  it('**列选时该列所有格都算选中**', () => {
    const { api } = setup()
    api.toggleSelectColumn('c2')
    expect(api.isCellSelected('r1', 'c2')).toBe(true)
    expect(api.isCellSelected('r3', 'c2')).toBe(true)
    expect(api.isCellSelected('r1', 'c1')).toBe(false)
  })

  it('**列选也会清矩形选区**', () => {
    const { api } = setup()
    api.startRange(0, 0, ['r1'], ['c1'], 'v')
    api.toggleSelectColumn('c1')
    expect(api.rangeSel.value).toBeNull()
  })
})

/* ═══════════ ⑤ isCellSelected 三态 ═══════════ */

describe('isCellSelected', () => {
  it('**矩形选区内为 true**', () => {
    const { api } = setup()
    api.startRange(0, 0, ['r1', 'r2'], ['c1', 'c2'], 'v')
    api.updateRange(1, 1)
    expect(api.isCellSelected('r2', 'c2')).toBe(true)
  })

  it('**多选集合命中为 true**', () => {
    const { api } = setup()
    api.selectCell('r2', 'c3', 'v', true)
    expect(api.isCellSelected('r2', 'c3')).toBe(true)
  })

  it('**单选格且多选为空 → true；多选非空且该格不在多选里 → false**', () => {
    const { api } = setup()
    // 造出「selectedCell 指向 A，但 A 已从多选里移除、多选仍非空」的真实序列：
    // ctrl 点 A → multi={A}, selected=A；ctrl 点 B → multi={A,B}, selected=B；
    // ctrl 再点 A → multi={B}, selected=A（size>0 所以 selected 更新为 A）
    api.selectCell('r1', 'c1', 'v', true)
    api.selectCell('r2', 'c2', 'w', true)
    api.selectCell('r1', 'c1', 'v', true)
    expect(api.multiSelection.value.has('r1|c1'), '前置：A 已移出多选').toBe(false)
    expect(api.multiSelection.value.size, '前置：多选仍非空').toBe(1)
    expect(api.selectedCell.value, '前置：selected 指向 A').toEqual({ rowKey: 'r1', colKey: 'c1' })
    // 判据：多选非空时，单选格不该单独算选中（否则 A 会同时"选中"又"未在多选里"）
    expect(api.isCellSelected('r1', 'c1'), '多选态下单选格让位').toBe(false)
  })

  it('**多选为空时单选格才算选中**', () => {
    const { api } = setup()
    api.selectCell('r1', 'c1', 'v', false)
    expect(api.multiSelection.value.size, '前置：无多选').toBe(0)
    expect(api.isCellSelected('r1', 'c1'), '单选态命中').toBe(true)
  })
})

/* ═══════════ ⑥ isInRange 的边界与钳位 ═══════════ */

describe('isInRange', () => {
  it('**反向拖选（锚点右下、焦点左上）仍覆盖矩形**', () => {
    const { api } = setup()
    // 锚点 (2,2)、焦点 (1,1) → 矩形是 [1..2]×[1..2]，(r1,c1) 与 (r1,c3) 都在矩形外
    api.startRange(2, 2, ['r1', 'r2', 'r3'], ['c1', 'c2', 'c3'], 'v')
    api.updateRange(1, 1)
    expect(api.isInRange('r2', 'c2'), '左上角（反向的起点）').toBe(true)
    expect(api.isInRange('r3', 'c3'), '右下角（锚点）').toBe(true)
    expect(api.isInRange('r1', 'c1'), '矩形外（行在上方）').toBe(false)
    expect(api.isInRange('r1', 'c3'), '矩形外（行在上方）').toBe(false)
    expect(api.isInRange('r3', 'c1'), '矩形外（列在左侧）').toBe(false)
  })

  it('**行不在快照里 → false**（不能靠 -1 参与比较）', () => {
    const { api } = setup()
    api.startRange(0, 0, ['r1', 'r2'], ['c1', 'c2'], 'v')
    api.updateRange(1, 1)
    expect(api.isInRange('ghost', 'c1')).toBe(false)
  })

  it('**列不在快照里 → false**', () => {
    const { api } = setup()
    api.startRange(0, 0, ['r1', 'r2'], ['c1', 'c2'], 'v')
    api.updateRange(1, 1)
    expect(api.isInRange('r1', 'ghost')).toBe(false)
  })

  it('**没有选区 → 一律 false**', () => {
    const { api } = setup()
    expect(api.isInRange('r1', 'c1')).toBe(false)
  })

  it('**updateRange 把越界焦点钳回矩阵内**（拖到表格外不产生非法索引）', () => {
    const { api } = setup()
    api.startRange(1, 1, ['r1', 'r2', 'r3'], ['c1', 'c2', 'c3'], 'v')
    api.updateRange(99, 99)
    expect(api.rangeSel.value!.focus).toEqual({ rowIndex: 2, colIndex: 2 })
    api.updateRange(-5, -5)
    expect(api.rangeSel.value!.focus).toEqual({ rowIndex: 0, colIndex: 0 })
  })

  it('**没有选区时 updateRange 是空操作**（不能凭空造选区）', () => {
    const { api } = setup()
    api.updateRange(1, 1)
    expect(api.rangeSel.value).toBeNull()
  })

  it('**isRangeAnchor 只认锚点格**', () => {
    const { api } = setup()
    api.startRange(1, 1, ['r1', 'r2'], ['c1', 'c2'], 'v')
    api.updateRange(1, 0)
    expect(api.isRangeAnchor('r2', 'c2'), '锚点').toBe(true)
    expect(api.isRangeAnchor('r2', 'c1'), '焦点不是锚点').toBe(false)
    expect(api.isRangeAnchor('r1', 'c1')).toBe(false)
  })

  it('**isRangeAnchor 同列不同行 → false**（必须同时比对行，不能只比列）', () => {
    const { api } = setup()
    api.startRange(1, 1, ['r1', 'r2', 'r3'], ['c1', 'c2', 'c3'], 'v') // 锚点 (r2,c2)
    expect(api.isRangeAnchor('r1', 'c2'), '同列不同行不是锚点').toBe(false)
    expect(api.isRangeAnchor('r3', 'c2'), '同列不同行不是锚点').toBe(false)
    expect(api.isRangeAnchor('r2', 'c1'), '同行不同列不是锚点').toBe(false)
    expect(api.isRangeAnchor('r2', 'c2'), '锚点本身').toBe(true)
  })

  it('**isRangeAnchor 无选区时 false**', () => {
    const { api } = setup()
    expect(api.isRangeAnchor('r1', 'c1')).toBe(false)
  })
})

/* ═══════════ ⑦ startRange 的非法索引守卫 ═══════════ */

describe('startRange 守卫', () => {
  it('**行索引越界 → 不建选区**', () => {
    const { api } = setup()
    api.startRange(9, 0, ['r1'], ['c1'], 'v')
    expect(api.rangeSel.value).toBeNull()
  })

  it('**列索引越界 → 不建选区**', () => {
    const { api } = setup()
    api.startRange(0, 9, ['r1'], ['c1'], 'v')
    expect(api.rangeSel.value).toBeNull()
  })

  it('**负索引 → 不建选区**', () => {
    const { api } = setup()
    api.startRange(-1, -1, ['r1'], ['c1'], 'v')
    expect(api.rangeSel.value).toBeNull()
  })

  it('**合法时锚点带值快照与 rowIndexOf**', () => {
    const { api } = setup()
    api.startRange(1, 2, ['r1', 'r2'], ['c1', 'c2', 'c3'], 'VAL')
    const r = api.rangeSel.value!
    expect(r.anchor).toEqual({ rowKey: 'r2', colKey: 'c3', rowIndex: 1, colIndex: 2, value: 'VAL' })
    expect(r.focus).toEqual({ rowIndex: 1, colIndex: 2 })
    expect(r.rows).toEqual(['r1', 'r2'])
    expect(r.rowIndexOf('r1')).toBe(0)
    expect(r.rowIndexOf('ghost')).toBe(-1)
  })

  it('**建选区时清掉单选格**（不借助列选的副作用）', () => {
    const { api } = setup()
    api.selectCell('r1', 'c1', 'v', false)
    expect(api.selectedCell.value, '前置：有单选格').not.toBeNull()
    api.startRange(0, 0, ['r1'], ['c1'], 'v')
    expect(api.selectedCell.value, '建选区清单选格').toBeNull()
  })

  it('**建选区时清掉多选**（不借助列选的副作用）', () => {
    const { api } = setup()
    api.selectCell('r1', 'c1', 'v', true)
    api.selectCell('r2', 'c2', 'w', true)
    expect(api.multiSelection.value.size, '前置：多选 2 格').toBe(2)
    api.startRange(0, 0, ['r1'], ['c1'], 'v')
    expect(api.multiSelection.value.size, '建选区清多选').toBe(0)
  })

  it('**建选区时清掉列选**', () => {
    const { api } = setup()
    api.toggleSelectColumn('c2')
    expect(api.selectedColKey.value, '前置：列选已选').toBe('c2')
    api.startRange(0, 0, ['r1'], ['c1'], 'v')
    expect(api.selectedColKey.value, '建选区清列选').toBeNull()
  })
})

/* ═══════════ ⑧ navAnchor ═══════════ */

describe('navAnchor', () => {
  it('**有矩形选区 → 取选区锚点**（而非单选格）', () => {
    const { api } = setup()
    api.selectCell('r3', 'c3', 'v', false)
    api.startRange(0, 1, ['r1', 'r2', 'r3'], ['c1', 'c2', 'c3'], 'a')
    expect(api.navAnchor()).toEqual({ rowKey: 'r1', colKey: 'c2' })
  })

  it('**无选区 → 取单选格**', () => {
    const { api } = setup()
    api.selectCell('r2', 'c2', 'v', false)
    expect(api.navAnchor()).toEqual({ rowKey: 'r2', colKey: 'c2' })
  })

  it('**什么都没有 → null**', () => {
    const { api } = setup()
    expect(api.navAnchor()).toBeNull()
  })
})

/* ═══════════ ⑨ moveSelection 五条早退 + 正常移动 ═══════════ */

describe('moveSelection', () => {
  it('**无锚点 → 什么都不做**', () => {
    const { api } = setup()
    const e = key('ArrowDown')
    api.moveSelection(e)
    expect(e.preventDefault).not.toHaveBeenCalled()
    expect(api.selectedCell.value).toBeNull()
  })

  it('**锚点不在显示矩阵里 → 不动**', () => {
    const { api } = setup()
    api.selectedCell.value = { rowKey: 'ghost', colKey: 'c1' }
    const e = key('ArrowDown')
    api.moveSelection(e)
    expect(e.preventDefault).not.toHaveBeenCalled()
  })

  it('**向上越界（第一行再按上）→ 不动**', () => {
    const { api } = setup()
    api.selectCell('r1', 'c1', 'v', false)
    const e = key('ArrowUp')
    api.moveSelection(e)
    expect(e.preventDefault).not.toHaveBeenCalled()
    expect(api.selectedCell.value).toEqual({ rowKey: 'r1', colKey: 'c1' })
  })

  it('**向右越界（最后一列再按右）→ 不动**', () => {
    const { api } = setup()
    api.selectCell('r1', 'c3', 'v', false)
    const e = key('ArrowRight')
    api.moveSelection(e)
    expect(e.preventDefault).not.toHaveBeenCalled()
  })

  it('**向下越界（最后一行再按下）→ 不动**', () => {
    const { api } = setup()
    api.selectCell('r3', 'c1', 'v', false)
    const e = key('ArrowDown')
    api.moveSelection(e)
    expect(e.preventDefault).not.toHaveBeenCalled()
  })

  it('**向左越界（第一列再按左）→ 不动**', () => {
    const { api } = setup()
    api.selectCell('r1', 'c1', 'v', false)
    const e = key('ArrowLeft')
    api.moveSelection(e)
    expect(e.preventDefault).not.toHaveBeenCalled()
  })

  it('**正常四向移动都更新选中并 preventDefault**', () => {
    const { api } = setup()
    // 每个方向都给一个不会立刻越界的起点（从第一行出发按 ArrowUp 是合法早退，见上面的越界用例）
    for (const [from, k, expectCell] of [
      [{ rowKey: 'r1', colKey: 'c2' }, 'ArrowDown', { rowKey: 'r2', colKey: 'c2' }],
      [{ rowKey: 'r1', colKey: 'c2' }, 'ArrowRight', { rowKey: 'r1', colKey: 'c3' }],
      [{ rowKey: 'r2', colKey: 'c2' }, 'ArrowUp', { rowKey: 'r1', colKey: 'c2' }],
      [{ rowKey: 'r1', colKey: 'c2' }, 'ArrowLeft', { rowKey: 'r1', colKey: 'c1' }],
    ] as const) {
      api.selectCell(from.rowKey, from.colKey, 'v', false)
      const e = key(k)
      api.moveSelection(e)
      expect(e.preventDefault, `${k} 应阻止默认`).toHaveBeenCalled()
      expect(api.selectedCell.value, `${k} 的目标`).toEqual(expectCell)
    }
  })

  it('**非方向键 → 原地重选并 preventDefault**（调用方只对方向键调用，故实际不可达）', () => {
    const { api, } = setup()
    api.selectCell('r1', 'c1', 'v', false)
    const e = key('Tab')
    api.moveSelection(e)
    // 实测行为：nr/nc 保持原值 → 边界检查通过 → 重新选中同一格并 preventDefault。
    // cell-keyboard.ts L71 只在 isArrow 时才调 moveSelection，所以真实运行到不了这里；
    // 但这意味着「moveSelection 自身不区分方向键」是隐含契约，注释在此钉死。
    expect(e.preventDefault, '未知键也会 preventDefault').toHaveBeenCalled()
    expect(api.selectedCell.value, '仍停在原格').toEqual({ rowKey: 'r1', colKey: 'c1' })
  })

  it('**移动后调 scrollCellIntoView**（把新格滚进视口）', () => {
    const scrollCellIntoView = vi.fn()
    const { api } = setup({ hooks: { scrollCellIntoView } })
    api.selectCell('r1', 'c1', 'v', false)
    api.moveSelection(key('ArrowDown'))
    expect(scrollCellIntoView).toHaveBeenCalledWith('r2', 'c1')
  })

  it('**稀疏矩阵：索引合法但取到 undefined → 早退**（L202 的 !nk 守卫）', () => {
    const { api } = setup()
    // 索引 1 是空穴：bounds 检查通过（1 < 3），但 displayRows[1] 是 undefined。
    // 用 new Array + 赋值构造（不能用字面量 [a, , b]，eslint no-sparse-arrays 会报错）
    const sparse = new Array<string>(3)
    sparse[0] = 'r1'
    sparse[2] = 'r3'
    api.setDisplayMatrix(sparse, ['c1', 'c2'])
    api.selectCell('r1', 'c1', 'v', false)
    const e = key('ArrowDown')
    api.moveSelection(e)
    expect(e.preventDefault, '取不到 key 就不该动').not.toHaveBeenCalled()
    expect(api.selectedCell.value, '仍停在原格').toEqual({ rowKey: 'r1', colKey: 'c1' })
  })

  it('**从矩形选区导航时以锚点为基准**', () => {
    const { api } = setup()
    api.startRange(0, 0, ['r1', 'r2', 'r3'], ['c1', 'c2', 'c3'], 'v')
    api.updateRange(2, 2) // 焦点在右下
    api.moveSelection(key('ArrowDown'))
    // 锚点是 (0,0)，所以下移应落在 (1,0)
    expect(api.selectedCell.value).toEqual({ rowKey: 'r2', colKey: 'c1' })
  })
})

/* ═══════════ ⑩ moveToEdge（整函数零覆盖） ═══════════ */

describe('moveToEdge', () => {
  it('**Home → 跳到首格并 preventDefault**', () => {
    const { api } = setup()
    api.selectCell('r2', 'c2', 'v', false)
    const e = key('Home')
    api.moveToEdge(e)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(api.selectedCell.value).toEqual({ rowKey: 'r1', colKey: 'c1' })
  })

  it('**End → 跳到末格**', () => {
    const { api } = setup()
    api.selectCell('r2', 'c2', 'v', false)
    const e = key('End')
    api.moveToEdge(e)
    expect(api.selectedCell.value).toEqual({ rowKey: 'r3', colKey: 'c3' })
  })

  it('**非 Home/End 的键 → 按 End 处理**（只区分首末两个方向）', () => {
    const { api } = setup()
    api.selectCell('r1', 'c1', 'v', false)
    api.moveToEdge(key('PageDown'))
    expect(api.selectedCell.value).toEqual({ rowKey: 'r3', colKey: 'c3' })
  })

  it('**矩阵为空 → 不跳、不 preventDefault**', () => {
    const { api } = setup()
    api.setDisplayMatrix([], [])
    const e = key('Home')
    api.moveToEdge(e)
    expect(e.preventDefault).not.toHaveBeenCalled()
    expect(api.selectedCell.value).toBeNull()
  })

  it('**只有行没有列 → 也不动**（key 取不到就不该硬跳）', () => {
    const { api } = setup()
    api.setDisplayMatrix(['r1'], [])
    const e = key('Home')
    api.moveToEdge(e)
    expect(e.preventDefault).not.toHaveBeenCalled()
  })

  it('**跳到首末后 scrolLCellIntoView 被调用**', () => {
    const scrollCellIntoView = vi.fn()
    const { api } = setup({ hooks: { scrollCellIntoView } })
    api.moveToEdge(key('End'))
    expect(scrollCellIntoView).toHaveBeenCalledWith('r3', 'c3')
  })

  it('**跳首末会清掉矩形选区**（selectCell 内部 clearRange）', () => {
    const { api } = setup()
    api.startRange(1, 1, ['r1', 'r2', 'r3'], ['c1', 'c2', 'c3'], 'v')
    api.moveToEdge(key('End'))
    expect(api.rangeSel.value).toBeNull()
  })
})

/* ═══════════ ⑪ enterEditFromSelection 四重准入 ═══════════ */

describe('enterEditFromSelection', () => {
  // ⚠️ 必须「替换同 key 的基列」而不是追加：enterEditFromSelection 用
  // columns.find(c => c.key === anchor.colKey) 取**第一个**匹配，
  // 追加重复 key 会让它永远命中不带 flag 的基列（我第一版就踩了这个坑，3 条用例假失败）
  const cols = (override?: Partial<ColDef>): ColDef[] => [
    { key: 'c1', title: 'C1', ...override },
    { key: 'c2', title: 'C2' },
    { key: 'c3', title: 'C3' },
  ]

  it('**可编辑文本列 → 进入编辑并 preventDefault**', () => {
    const { api, startEdit } = setup({ columns: cols() })
    api.selectCell('r1', 'c1', 'v', false)
    const e = key('Enter')
    api.enterEditFromSelection(e)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(startEdit).toHaveBeenCalledWith('r1', 'c1', '')
  })

  it('**editable=false → 不进编辑**', () => {
    const { api, startEdit } = setup({ columns: cols(), editable: false })
    api.selectCell('r1', 'c1', 'v', false)
    const e = key('Enter')
    api.enterEditFromSelection(e)
    expect(startEdit).not.toHaveBeenCalled()
    expect(e.preventDefault).not.toHaveBeenCalled()
  })

  it('**没有锚点 → 不进编辑**', () => {
    const { api, startEdit } = setup({ columns: cols() })
    api.enterEditFromSelection(key('Enter'))
    expect(startEdit).not.toHaveBeenCalled()
  })

  it('**列不存在于 columns → 不进编辑**', () => {
    const { api, startEdit } = setup({ columns: cols() })
    api.selectCell('r1', 'ghost', 'v', false)
    api.enterEditFromSelection(key('Enter'))
    expect(startEdit).not.toHaveBeenCalled()
  })

  it('**列标记 editable:false → 不进编辑**', () => {
    const { api, startEdit } = setup({ columns: cols({ editable: false }) })
    api.selectCell('r1', 'c1', 'v', false)
    api.enterEditFromSelection(key('Enter'))
    expect(startEdit).not.toHaveBeenCalled()
  })

  it('**options 列（下拉）→ 不进编辑**', () => {
    const { api, startEdit } = setup({ columns: cols({ options: [] }) })
    api.selectCell('r1', 'c1', 'v', false)
    api.enterEditFromSelection(key('Enter'))
    expect(startEdit).not.toHaveBeenCalled()
  })

  it('**图片列（accept=image）→ 不进编辑**', () => {
    const { api, startEdit } = setup({ columns: cols({ accept: 'image' }) })
    api.selectCell('r1', 'c1', 'v', false)
    api.enterEditFromSelection(key('Enter'))
    expect(startEdit).not.toHaveBeenCalled()
  })

  it('**从矩形选区按 Enter 用锚点格的列**', () => {
    const { api, startEdit } = setup({ columns: cols() })
    api.startRange(0, 1, ['r1', 'r2'], ['c1', 'c2', 'c3'], 'cell-val')
    api.enterEditFromSelection(key('Enter'))
    expect(startEdit).toHaveBeenCalledWith('r1', 'c2', '')
  })

  it('**进入编辑时带上当前显示值**', () => {
    const { api, startEdit } = setup({
      columns: cols(),
      hooks: { getCellDisplayValue: (r, c) => `${r}@${c}` },
    })
    api.selectCell('r2', 'c3', 'v', false)
    api.enterEditFromSelection(key('Enter'))
    expect(startEdit).toHaveBeenCalledWith('r2', 'c3', 'r2@c3')
  })
})

/* ═══════════ ⑫ markEditActive ═══════════ */

describe('markEditActive', () => {
  it('**任何选择操作都会标一次活动**（让外部知道编辑面板该刷新）', () => {
    const { api } = setup()
    expect(() => api.markEditActive()).not.toThrow()
  })
})

/* ═══════════ ⑬ extendSelection（Shift+方向键） ═══════════ */

describe('extendSelection', () => {
  it('**无锚点 → 什么都不做**', () => {
    const { api } = setup()
    const e = key('ArrowDown')
    api.extendSelection(e)
    expect(e.preventDefault).not.toHaveBeenCalled()
    expect(api.rangeSel.value).toBeNull()
  })

  it('**锚点不在显示矩阵里 → 不动**', () => {
    const { api } = setup()
    api.selectedCell.value = { rowKey: 'ghost', colKey: 'c1' }
    const e = key('ArrowDown')
    api.extendSelection(e)
    expect(e.preventDefault).not.toHaveBeenCalled()
  })

  it('**第一次 Shift+Down：从锚点起建选区并扩一行**', () => {
    const { api } = setup()
    api.selectCell('r1', 'c1', 'v', false)
    const e = key('ArrowDown')
    api.extendSelection(e)
    expect(e.preventDefault).toHaveBeenCalled()
    expect(api.rangeSel.value, '建了选区').not.toBeNull()
    expect(api.rangeSel.value!.anchor.rowIndex).toBe(0)
    expect(api.rangeSel.value!.focus).toEqual({ rowIndex: 1, colIndex: 0 })
  })

  it('**已有选区时基于当前焦点累进**（连按两次 Down 扩两行）', () => {
    const { api } = setup()
    api.selectCell('r1', 'c1', 'v', false)
    api.extendSelection(key('ArrowDown'))
    api.extendSelection(key('ArrowDown'))
    expect(api.rangeSel.value!.focus).toEqual({ rowIndex: 2, colIndex: 0 })
    expect(api.rangeSel.value!.anchor.rowIndex, '锚点不动').toBe(0)
  })

  it('**四个方向都能扩**', () => {
    const { api } = setup()
    for (const [k, dir] of [
      ['ArrowDown', { rowIndex: 2, colIndex: 1 }],
      ['ArrowRight', { rowIndex: 1, colIndex: 2 }],
      ['ArrowUp', { rowIndex: 0, colIndex: 1 }],
      ['ArrowLeft', { rowIndex: 1, colIndex: 0 }],
    ] as const) {
      api.clearRange()
      api.selectCell('r2', 'c2', 'v', false)
      api.extendSelection(key(k))
      expect(api.rangeSel.value!.focus, k).toEqual(dir)
    }
  })

  it('**越界（第一行按 Shift+Up）→ 不 preventDefault 也不改选区**', () => {
    const { api } = setup()
    api.selectCell('r1', 'c2', 'v', false)
    const e = key('ArrowUp')
    api.extendSelection(e)
    expect(e.preventDefault).not.toHaveBeenCalled()
    expect(api.rangeSel.value, '不该凭空建选区').toBeNull()
  })

  it('**越界时已有选区保持不动**（扩不出去就停在原地）', () => {
    const { api } = setup()
    api.selectCell('r1', 'c1', 'v', false)
    api.extendSelection(key('ArrowDown')) // 锚点 row0，焦点 row1
    expect(api.rangeSel.value!.focus.rowIndex).toBe(1)
    api.extendSelection(key('ArrowUp')) // 焦点 1 → 0
    expect(api.rangeSel.value!.focus.rowIndex, '收缩回 row0').toBe(0)
    api.extendSelection(key('ArrowUp')) // 焦点 0 → -1 越界 → 早退
    expect(api.rangeSel.value!.focus.rowIndex, '越界后停在 row0').toBe(0)
  })

  it('**扩展后调 scrollCellIntoView**', () => {
    const scrollCellIntoView = vi.fn()
    const { api } = setup({ hooks: { scrollCellIntoView } })
    api.selectCell('r1', 'c1', 'v', false)
    api.extendSelection(key('ArrowDown'))
    expect(scrollCellIntoView).toHaveBeenCalledWith('r2', 'c1')
  })

  it('**扩展会复用已有选区的 rows/cols 快照**（不重建矩阵）', () => {
    const { api } = setup()
    api.selectCell('r1', 'c1', 'v', false)
    api.extendSelection(key('ArrowDown'))
    const rows1 = api.rangeSel.value!.rows
    api.extendSelection(key('ArrowDown'))
    expect(api.rangeSel.value!.rows, '同一份快照').toBe(rows1)
  })
})
