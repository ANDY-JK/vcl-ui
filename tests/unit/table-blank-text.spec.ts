// DataTable 单元格空白占位（blankText）行为锁定
// 核心动机：占位符只进展示层，绝不进导出数据 —— null 单元格导出 CSV/Excel 必须仍是空，
// 不能被曾用于展示的 '-' 污染。与小程序库 6.14.57 口径对齐。
import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import DataTable from '@/components/data/DataTable.vue'
import type { Column } from '@/components/data/composables/types'

const COLS: Column[] = [
  { key: 'name', title: '名称' },
  { key: 'score', title: '分数' },
  { key: 'remark', title: '备注' },
]

// score 含 0 与 null：验证「0 是合法数据」与「null 需占位」在同一行内并存
const ROWS = [
  { id: 'r0', name: '甲', score: 0, remark: null },
  { id: 'r1', name: '乙', score: 88, remark: '有备注' },
  { id: 'r2', name: '丙', score: null, remark: '' },
]

const mounted: VueWrapper[] = []
afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function mountTable(extra: Record<string, unknown> = {}): VueWrapper {
  const w = mount(DataTable, {
    props: {
      columns: COLS,
      data: ROWS,
      rowKey: 'id',
      virtualScroll: false,
      autoFit: false,
      persistence: 'none',
      ...extra,
    } as never,
    attachTo: document.body,
  })
  mounted.push(w)
  return w
}

/** 表格体各行的纯文本内容（按行分组，便于断言某行的占位符） */
function bodyRowTexts(w: VueWrapper): string[] {
  return w.findAll('tbody tr').map((tr) => tr.text())
}

describe('DataTable 单元格空白占位 — 展示层', () => {
  it('null/空串显示默认占位 -，0 与 false 等合法值原样显示', async () => {
    const w = mountTable()
    await nextTick()
    const rows = bodyRowTexts(w)
    // r0：score=0 显示 0（不占位），remark=null 显示 -
    expect(rows[0]).toContain('0')
    expect(rows[0]).toContain('-')
    // r2：score=null 显示 -，remark='' 显示 -
    expect(rows[2].match(/-/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })

  it('自定义 blankText 生效（含空白串入参）', async () => {
    const w = mountTable({ blankText: '暂无' })
    await nextTick()
    expect(bodyRowTexts(w)[0]).toContain('暂无')
    expect(bodyRowTexts(w)[0]).not.toContain('-')
  })

  it('blankText 传空串 → 关闭占位，空单元格回落为空', async () => {
    const w = mountTable({ blankText: '' })
    await nextTick()
    const cells = w.findAll('tbody tr')[0].findAll('.cell-text-inner')
    // 第 3 列（remark=null）应无文本
    expect(cells[2].text()).toBe('')
  })
})

describe('DataTable 空白占位 — 导出不被污染（核心回归锁）', () => {
  it('导出 CSV：null/空串单元格保持为空，不出现 -', async () => {
    const captured: Blob[] = []
    vi.spyOn(URL, 'createObjectURL').mockImplementation((b: Blob | MediaSource) => {
      captured.push(b as Blob)
      return 'blob:mock'
    })
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    const w = mountTable({ exportable: true })
    await nextTick()

    const exportBtn = w.findAll('button').find((b) => (b.attributes('title') ?? '').includes('下载 CSV'))
    expect(exportBtn, '导出按钮应存在').toBeTruthy()
    await exportBtn!.trigger('click')

    expect(captured.length, '应触发一次 Blob 下载').toBe(1)
    const text = await captured[0].text()

    // 表头正常
    expect(text).toContain('名称')
    // 有值数据保留
    expect(text).toContain('乙')
    expect(text).toContain('88')
    // 关键：数据区不得出现占位符 '-'（表头/数值里也没有合法 '-'）
    expect(text).not.toContain('-')
    // r0 的 score=0 必须原样导出为 0（不能被误当空）
    expect(text).toContain('"0"')
  })
})
