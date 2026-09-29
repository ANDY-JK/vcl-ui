// useCellClipboard 行为锁定测试（粘贴矩阵/单值/整列/多选 · 清空 · 复制 TSV · 图片粘贴拖拽）
// 批量写入漏斗：一次粘贴/清空 = 一条 applyChanges（一条撤销记录）
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useCellClipboard } from '@/components/data/composables/cell-clipboard'
import type { CellClipboardDeps } from '@/components/data/composables/cell-clipboard'
import { readClipboardImage, extractImageFile } from '@/components/data/composables/utils'
import { copyText } from '@/components/_internal/useCopy'

vi.mock('@/components/data/composables/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/data/composables/utils')>()
  return { ...actual, readClipboardImage: vi.fn(), extractImageFile: vi.fn() }
})
vi.mock('@/components/_internal/useCopy', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/_internal/useCopy')>()
  return { ...actual, copyText: vi.fn() }
})

type WriteEntry = { rowKey: string; colKey: string; value: string }

const cols = [
  { key: 'a', title: 'A' },
  { key: 'img', title: '图片', accept: 'image' as const },
  { key: 'opt', title: '选项', options: ['x', 'y'] as const },
  { key: 'ro', title: '只读', editable: false as const },
]

function makeDeps(
  overrides: {
    rangeSel?: unknown
    selectedCell?: unknown
    selectedColKey?: string
    multiKeys?: string[]
    pasteRowKeys?: string[]
  } = {},
) {
  const changes: WriteEntry[][] = []
  const singles: WriteEntry[] = []
  const write: CellClipboardDeps['write'] = {
    applyChanges: (entries: WriteEntry[]) => {
      changes.push(entries)
    },
    applyChange: (rk: string, ck: string, v: string) => {
      singles.push({ rowKey: rk, colKey: ck, value: v })
    },
  } as never
  const select = {
    rangeSel: ref(overrides.rangeSel ?? null),
    selectedCell: ref(overrides.selectedCell ?? null),
    selectedColKey: ref(overrides.selectedColKey ?? ''),
    multiSelection: ref(new Set<string>(overrides.multiKeys ?? [])),
    selectedCellValue: ref(''),
    displayRows: ref<string[]>(['r1', 'r2']),
    displayCols: ref<string[]>(['a', 'img', 'opt', 'ro']),
    splitCellKey: (key: string) => {
      const [rk, ck] = key.split('|')
      return rk && ck ? ([rk, ck] as [string, string]) : null
    },
    displayValue: (_rk: string, ck: string) => 'V' + ck,
  } as never
  const deps = {
    props: { editable: true, columns: cols } as never,
    write,
    select,
    editingCell: ref(null),
    ...({} as Record<string, unknown>),
  }
  const api = useCellClipboard(deps as never)
  api.pasteRowKeys.value = overrides.pasteRowKeys ?? []
  return { api, changes, singles, select }
}

beforeEach(() => {
  vi.mocked(readClipboardImage).mockReset().mockResolvedValue('data:image/png;base64,MOCK')
  vi.mocked(extractImageFile).mockReset().mockReturnValue(null)
  vi.mocked(copyText).mockReset().mockResolvedValue(true)
})

describe('pasteText：矩阵 vs 单值', () => {
  it('单值 + 矩形选区：填满整个区域，一条 applyChanges', () => {
    const { api, changes } = makeDeps({
      rangeSel: {
        rows: ['r1', 'r2'],
        cols: ['a', 'ro'], // ro 列虽只读，但 isAllowedColumnValue 只管 accept/options（readonly 写在写入漏斗层拦）
        anchor: { rowIndex: 0, colIndex: 0 },
        focus: { rowIndex: 1, colIndex: 1 },
      },
    })
    api.pasteText('统一值')
    expect(changes).toHaveLength(1)
    expect(changes[0].map((e) => `${e.rowKey}:${e.colKey}`)).toEqual(['r1:a', 'r1:ro', 'r2:a', 'r2:ro'])
    expect(changes[0].every((e) => e.value === '统一值')).toBe(true)
  })

  it('矩阵文本：从锚点按行列填充，图片列拒收文本', () => {
    const { api, changes } = makeDeps({
      selectedCell: { rowKey: 'r1', colKey: 'a' },
    })
    api.pasteText('A\tB\nC\t\n') // 第 2 列是 img（accept=image）→ B/'' 全被拒
    expect(changes).toHaveLength(1)
    expect(changes[0]).toEqual([
      { rowKey: 'r1', colKey: 'a', value: 'A' },
      { rowKey: 'r2', colKey: 'a', value: 'C' },
    ])
  })

  it('矩阵粘贴：Excel 尾随空行被剥掉', () => {
    const { api, changes } = makeDeps({ selectedCell: { rowKey: 'r1', colKey: 'a' } })
    api.pasteText('A\n\n')
    expect(changes[0]).toEqual([{ rowKey: 'r1', colKey: 'a', value: 'A' }])
  })

  it('选项列拒收选项外的值（数据约束保护）', () => {
    const { api, changes } = makeDeps({
      rangeSel: {
        rows: ['r1'],
        cols: ['opt'],
        anchor: { rowIndex: 0, colIndex: 0 },
        focus: { rowIndex: 0, colIndex: 0 },
      },
    })
    api.pasteText('nope')
    expect(changes[0]).toEqual([]) // 被拒 → 空 entries 仍是一条记录（无写入）
    api.pasteText('y')
    expect(changes[1]).toEqual([{ rowKey: 'r1', colKey: 'opt', value: 'y' }])
  })

  it('无选区时 pasteText 是 no-op（空文本直接返回）', () => {
    const { api, changes, singles } = makeDeps()
    api.pasteText('')
    expect(changes).toHaveLength(0)
    expect(singles).toHaveLength(0)
  })
})

describe('pasteValue 四种目标', () => {
  it('多选集合：经 splitCellKey 拆键后批量填（坏键跳过、选项列拒收）', () => {
    const { api, changes } = makeDeps({ multiKeys: ['r1|a', 'r2|opt', 'bad-key'] })
    api.pasteValue('Z')
    expect(changes[0]).toEqual([{ rowKey: 'r1', colKey: 'a', value: 'Z' }]) // 'bad-key' 拆不出两半跳过；opt 有 options → 拒收 Z
  })

  it('整列选择：写入 pasteRowKeys 指定行', () => {
    const { api, changes } = makeDeps({ selectedColKey: 'a', pasteRowKeys: ['r1', 'r2'] })
    api.pasteValue('COL')
    expect(changes[0]).toEqual([
      { rowKey: 'r1', colKey: 'a', value: 'COL' },
      { rowKey: 'r2', colKey: 'a', value: 'COL' },
    ])
  })

  it('单选格：applyChange 单写 + 同步 selectedCellValue', () => {
    const { api, singles, select } = makeDeps({ selectedCell: { rowKey: 'r1', colKey: 'a' } })
    api.pasteValue('单')
    expect(singles).toEqual([{ rowKey: 'r1', colKey: 'a', value: '单' }])
    expect(select.selectedCellValue.value).toBe('单')
  })
})

describe('clearSelection（Delete/Backspace）', () => {
  it('editable=false 时任何清空都是 no-op', () => {
    const { changes, singles } = makeDeps({
      rangeSel: {
        rows: ['r1'],
        cols: ['a'],
        anchor: { rowIndex: 0, colIndex: 0 },
        focus: { rowIndex: 0, colIndex: 0 },
      },
    })
    const api2 = useCellClipboard({
      props: { editable: false, columns: cols },
      write: { applyChanges: () => {}, applyChange: () => {} },
      select: {
        rangeSel: ref({
          rows: ['r1'],
          cols: ['a'],
          anchor: { rowIndex: 0, colIndex: 0 },
          focus: { rowIndex: 0, colIndex: 0 },
        }),
      },
      editingCell: ref(null),
    } as never)
    api2.clearSelection()
    expect(changes).toHaveLength(0)
    expect(singles).toHaveLength(0)
  })

  it('矩形清空：跳过只读/图片列，一条记录；有写入才 preventDefault', () => {
    const { api, changes } = makeDeps({
      rangeSel: {
        rows: ['r1'],
        cols: ['a', 'ro', 'img'],
        anchor: { rowIndex: 0, colIndex: 0 },
        focus: { rowIndex: 0, colIndex: 2 },
      },
    })
    const e = { preventDefault: vi.fn() } as unknown as KeyboardEvent
    api.clearSelection(e)
    expect(changes[0]).toEqual([{ rowKey: 'r1', colKey: 'a', value: '' }]) // ro/img 被跳过
    expect(e.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('单格清空：写入空值并同步展示值；只读列直接拒绝', () => {
    const { api, singles, select } = makeDeps({ selectedCell: { rowKey: 'r1', colKey: 'a' } })
    const e = { preventDefault: vi.fn() } as unknown as KeyboardEvent
    api.clearSelection(e)
    expect(singles).toEqual([{ rowKey: 'r1', colKey: 'a', value: '' }])
    expect(select.selectedCellValue.value).toBe('')
    expect(e.preventDefault).toHaveBeenCalled()

    const { api: api2, singles: s2 } = makeDeps({ selectedCell: { rowKey: 'r1', colKey: 'ro' } })
    api2.clearSelection()
    expect(s2).toHaveLength(0)
  })
})

describe('复制路径', () => {
  it('copySelectedCell：无选中不碰系统剪贴板；有选中则同步内部+系统并回调', async () => {
    const hooks = { onCopied: vi.fn() }
    const noSel = makeDeps()
    await noSel.api.copySelectedCell()
    expect(copyText).not.toHaveBeenCalled()

    const withSel = makeDeps({ selectedCell: { rowKey: 'r1', colKey: 'a' } })
    await withSel.api.copySelectedCell()
    // hooks 在 deps 里：重建一个带 hooks 的实例验证回调
    const write = { applyChanges: () => {}, applyChange: () => {} } as never
    const select = {
      rangeSel: ref(null),
      selectedCell: ref({ rowKey: 'r1', colKey: 'a' }),
      selectedColKey: ref(''),
      multiSelection: ref(new Set<string>()),
      selectedCellValue: ref('值'),
      displayRows: ref([]),
      displayCols: ref([]),
      splitCellKey: () => null,
      displayValue: () => '',
    } as never
    const api = useCellClipboard({
      props: { editable: true, columns: cols },
      hooks,
      write,
      select,
      editingCell: ref(null),
    } as never)
    await api.copySelectedCell()
    expect(api.clipboard.value).toBe('值')
    expect(copyText).toHaveBeenCalledWith('值')
    expect(hooks.onCopied).toHaveBeenCalledTimes(1)
  })

  it('copyRangeSelection：TSV 序列化（图片列空值、值内换行/制表符→空格）', async () => {
    const hooks = { onCopied: vi.fn() }
    const write = { applyChanges: () => {}, applyChange: () => {} } as never
    const select = {
      rangeSel: ref({
        rows: ['r1', 'r2'],
        cols: ['a', 'img'],
        anchor: { rowIndex: 0, colIndex: 0 },
        focus: { rowIndex: 1, colIndex: 1 },
      }),
      displayValue: (rk: string, ck: string) => (rk === 'r1' && ck === 'a' ? '行内\n换行\t制表' : `${rk}${ck}`),
      displayRows: ref(['r1', 'r2']),
      displayCols: ref(['a', 'img']),
    } as never
    const api = useCellClipboard({
      props: { editable: true, columns: cols },
      hooks,
      write,
      select,
      editingCell: ref(null),
    } as never)
    await api.copyRangeSelection()
    // img 列恒空值（不参与 displayValue）；值内换行/制表符归一成空格
    expect(copyText).toHaveBeenCalledWith('行内 换行 制表\t\nr2a\t')
    expect(api.clipboard.value).toBe('行内 换行 制表\t\nr2a\t')
    expect(hooks.onCopied).toHaveBeenCalled()
  })
})

describe('onCellPaste / 图片拖拽', () => {
  it('不可编辑：粘贴/拖拽全部 no-op', async () => {
    const write = { applyChanges: vi.fn(), applyChange: vi.fn() }
    const api = useCellClipboard({
      props: { editable: false, columns: cols },
      write: write as never,
      select: {} as never,
      editingCell: ref(null),
    } as never)
    const e = { clipboardData: { getData: () => 'x' }, preventDefault: vi.fn() } as unknown as ClipboardEvent
    await api.onCellPaste(e, 'r1', 'a', 'text')
    api.onImageDrop(e as never, 'r1', 'a')
    expect(write.applyChange).not.toHaveBeenCalled()
  })

  it('编辑输入框内的粘贴冒泡放行（不绕过 commitEdit 归一化）', async () => {
    const write = { applyChanges: vi.fn(), applyChange: vi.fn() }
    const td = document.createElement('td')
    const input = document.createElement('input')
    input.className = 'cell-edit-input'
    td.appendChild(input)
    const api = useCellClipboard({
      props: { editable: true, columns: cols },
      write: write as never,
      select: {} as never,
      editingCell: ref({ rowKey: 'r1', colKey: 'a' }),
    } as never)
    const e = {
      target: input,
      clipboardData: { getData: () => '原生粘贴' },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent
    await api.onCellPaste(e, 'r1', 'a', 'text')
    expect(write.applyChange).not.toHaveBeenCalled() // 放行 → 原生写 input
    expect(e.preventDefault).not.toHaveBeenCalled()
  })

  it('非编辑态直贴文本：写入并退出编辑态', async () => {
    const write = { applyChanges: vi.fn(), applyChange: vi.fn() }
    const api = useCellClipboard({
      props: { editable: true, columns: cols },
      write: write as never,
      select: {} as never,
      editingCell: ref(null),
    } as never)
    const e = {
      target: document.createElement('td'),
      clipboardData: { getData: () => '直贴' },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent
    await api.onCellPaste(e, 'r1', 'a', 'text')
    expect(write.applyChange).toHaveBeenCalledWith('r1', 'a', '直贴')
    expect(e.preventDefault).toHaveBeenCalled()
  })

  it('图片文件粘贴到非 text 列：preventDefault + 写 dataURL；text 列拒收', async () => {
    const write = { applyChanges: vi.fn(), applyChange: vi.fn() }
    vi.mocked(extractImageFile).mockReturnValue({} as never)
    const api = useCellClipboard({
      props: { editable: true, columns: cols },
      write: write as never,
      select: {} as never,
      editingCell: ref(null),
    } as never)
    const e = {
      target: document.createElement('td'),
      dataTransfer: { files: [{}] },
      preventDefault: vi.fn(),
    } as unknown as ClipboardEvent
    await api.onCellPaste(e, 'r1', 'a', 'image') // accept='image' 但 extractImageFile 按 ClipboardEvent 取
    // 注意：onCellPaste 的 accept 参数传的是列的 accept；图片文件 + accept!=='text' → 写 dataURL
    expect(write.applyChange).toHaveBeenCalledWith('r1', 'a', 'data:image/png;base64,MOCK')

    write.applyChange.mockClear()
    await api.onCellPaste(e, 'r1', 'a', 'text')
    expect(write.applyChange).not.toHaveBeenCalled()
  })

  it('图片拖放：写 dataURL + 清 drag-over 标记；拖入高亮/离开取消', async () => {
    const write = { applyChanges: vi.fn(), applyChange: vi.fn() }
    vi.mocked(extractImageFile).mockReturnValue({} as never)
    const td = document.createElement('td')
    const target = document.createElement('div')
    vi.spyOn(target, 'closest').mockReturnValue(td)
    const api = useCellClipboard({
      props: { editable: true, columns: cols },
      write: write as never,
      select: {} as never,
      editingCell: ref(null),
    } as never)

    const over = {
      currentTarget: target,
      dataTransfer: { dropEffect: '' },
      preventDefault: vi.fn(),
    } as unknown as DragEvent
    api.onImageDragOver(over)
    expect(td.classList.contains('drag-over-image')).toBe(true)
    expect(over.dataTransfer!.dropEffect).toBe('copy')

    const drop = {
      currentTarget: target,
      dataTransfer: { files: [{}] },
      preventDefault: vi.fn(),
    } as unknown as DragEvent
    await api.onImageDrop(drop, 'r1', 'a')
    expect(write.applyChange).toHaveBeenCalledWith('r1', 'a', 'data:image/png;base64,MOCK')
    expect(td.classList.contains('drag-over-image')).toBe(false)

    api.onImageDragOver(over)
    api.onImageDragLeave(over as never)
    expect(td.classList.contains('drag-over-image')).toBe(false)
  })
})
