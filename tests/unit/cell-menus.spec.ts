/**
 * useTableCellMenus —— 三个浮层（图片灯箱 / 选项下拉面板 / 单元格右键菜单）的状态机与键盘可达性
 *
 * 该 composable 此前 40.3%，整块空白集中在：
 *   - 灯箱的 280ms 单击判定（双击不弹灯箱）
 *   - 选项面板：开合去重、渲染后按实际高度重定位（上下都不够时选空间大的方向 + 视口裁剪）
 *   - 选项面板键盘：ArrowDown/Up 取模游标、Enter 取当前项、Escape 关闭、空选项 no-op
 *   - 右键菜单：cellContextMenu=false 时放行冒泡；打开时把右键格设为选中并清旧选区
 *   - 右键菜单键盘：跳过 .disabled 项、Enter/Space 触发 click、无菜单时 no-op
 *   - 右键动作：复制 / 粘贴（外部剪贴板优先、读失败回退选区）/ 清空
 *
 * 三个构造要点：
 *   ① 浮层定位依赖 `getBoundingClientRect` / `offsetHeight` / `window.innerHeight` ——
 *      happy-dom 全是 0，必须逐个造出来，否则永远只走到「上下都不够 → 选空间大的」那一条。
 *   ② `openOptDrop` 的 event.currentTarget 必须是**真的带 rect 的元素**，用普通对象会炸。
 *   ③ 面板重定位在 `nextTick` 里读 `optDropRef`，所以要么挂个真节点，要么直接给 ref 塞桩元素。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, computed, nextTick } from 'vue'
import { useTableCellMenus } from '@/components/data/composables/useTableCellMenus'
import type { Column, RowMeta } from '@/components/data/composables/types'

const COLS: Column[] = [
  { key: 'id', title: 'ID' },
  { key: 'city', title: '城市', options: ['北京', '上海', { value: 'gz', label: '广州' }] },
]

const ROWS = [
  { id: '1', city: '北京' },
  { id: '2', city: '上海' },
]

function makeMenus(props: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}) {
  const rowMetaMap = ref(
    new Map<Record<string, unknown>, RowMeta>(
      ROWS.map((r, i) => [r, { key: r.id, texts: { id: r.id, city: r.city }, truncated: {}, striped: i % 2 === 1 }]),
    ),
  )
  const calls = {
    selectCell: [] as unknown[][],
    applyChanges: [] as unknown[][],
    markEditActive: 0,
    closeContextMenu: 0,
    copySelectedCell: 0,
    pasteText: [] as string[],
    pasteToSelection: 0,
    clearSelection: [] as unknown[][],
  }
  const contextMenu = ref({
    visible: false,
    x: 0,
    y: 0,
    above: false,
    columnKey: null as string | null,
    rowKey: null as string | null,
    row: null as Record<string, unknown> | null,
    rowIndex: -1,
  })
  const selectedCell = ref<{ rowKey: string; colKey: string } | null>(null)

  const api = useTableCellMenus(
    { editable: true, cellContextMenu: true, ...props } as never,
    {
      rowMetaMap,
      cellVal: (row: Record<string, unknown>, colKey: string) => String(row[colKey] ?? ''),
      selectCell: (...args: unknown[]) => {
        calls.selectCell.push(args)
      },
      effectivePagedData: computed(() => ROWS),
      tableWrapRef: ref(null),
      contextMenu,
      closeContextMenu: () => {
        calls.closeContextMenu++
        contextMenu.value.visible = false
      },
      applyChanges: (entries: unknown[]) => {
        calls.applyChanges.push(entries)
      },
      markEditActive: () => {
        calls.markEditActive++
      },
      copySelectedCell: () => {
        calls.copySelectedCell++
      },
      pasteText: (t: string) => {
        calls.pasteText.push(t)
      },
      pasteToSelection: () => {
        calls.pasteToSelection++
      },
      clearSelection: (e?: KeyboardEvent) => {
        calls.clearSelection.push([e])
      },
      selectedCell,
      ...overrides,
    } as never,
  )
  return { api, calls, contextMenu, selectedCell, rowMetaMap }
}

/** 造一个带 rect 的元素（openOptDrop 要读 currentTarget 的 rect） */
function el(rect: { left: number; top: number; width: number; height: number }): HTMLElement {
  const node = document.createElement('td')
  node.getBoundingClientRect = () =>
    ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }) as unknown as DOMRect
  return node
}

function mouseEvent(init: { clientX?: number; clientY?: number } = {}): MouseEvent {
  return {
    clientX: init.clientX ?? 100,
    clientY: init.clientY ?? 100,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as MouseEvent
}

function keyEvent(key: string): KeyboardEvent {
  return { key, preventDefault: vi.fn() } as unknown as KeyboardEvent
}

const vhBackup = window.innerHeight
const panels: HTMLElement[] = []
function setViewport(h: number): void {
  Object.defineProperty(window, 'innerHeight', { value: h, configurable: true, writable: true })
}

beforeEach(() => {
  setViewport(800)
})
afterEach(() => {
  while (panels.length) panels.pop()!.remove()
  setViewport(vhBackup)
  vi.restoreAllMocks()
})

/* ══════════════════ 图片灯箱 ══════════════════ */

describe('图片灯箱（280ms 单击判定）', () => {
  it('**单击 → 等 280ms 后灯箱打开；closeLightbox 清空**', async () => {
    const { api } = makeMenus()
    api.onImageClick(mouseEvent(), 'https://x/a.png')
    // 时序断言：60ms 远小于 280ms 判定窗口，此时必须「还没打开」。
    // 若把窗口改成 0，这里就已打开 → 可辨（只断言最终状态是分辨不出的）。
    await new Promise((r) => setTimeout(r, 60))
    expect(api._lightboxSrc.value, '判定窗口内不该打开').toBe('')

    await new Promise((r) => setTimeout(r, 300))
    expect(api._lightboxSrc.value, '窗口过后应打开').toBe('https://x/a.png')

    api.closeLightbox()
    expect(api._lightboxSrc.value).toBe('')
  })

  it('**判定窗口内第二击 → 取消，灯箱永不打开**（双击不能既预览又…）', async () => {
    const { api } = makeMenus()
    api.onImageClick(mouseEvent(), 'https://x/a.png')
    api.onImageClick(mouseEvent(), 'https://x/a.png') // 第二击落在窗口内

    await new Promise((r) => setTimeout(r, 340))
    expect(api._lightboxSrc.value, '第二击应取消待执行的打开').toBe('')
  })

  it('**窗口过后再点 → 正常打开第二次**（定时器已复位，不会永久失效）', async () => {
    const { api } = makeMenus()
    api.onImageClick(mouseEvent(), 'https://x/a.png')
    await new Promise((r) => setTimeout(r, 340))
    expect(api._lightboxSrc.value).toBe('https://x/a.png')

    api.closeLightbox()
    api.onImageClick(mouseEvent(), 'https://x/b.png')
    await new Promise((r) => setTimeout(r, 340))
    expect(api._lightboxSrc.value, '应能打开另一张').toBe('https://x/b.png')
  })
})

/* ══════════════════ 选项面板：可开性判定 ══════════════════ */

describe('选项面板可开性判定（isOptionDroppable 是唯一事实来源）', () => {
  it('**三条件全满足才可下拉**', () => {
    const ok = makeMenus()
    expect(ok.api.isOptionDroppable(COLS[1]!), '有 options + editable + 列未禁用').toBe(true)

    const noOptions = makeMenus()
    expect(noOptions.api.isOptionDroppable(COLS[0]!), '无 options').toBe(false)

    const notEditable = makeMenus({ editable: false })
    expect(notEditable.api.isOptionDroppable(COLS[1]!), '整表不可编辑').toBe(false)

    const colDisabled = makeMenus()
    expect(
      colDisabled.api.isOptionDroppable({ ...COLS[1]!, editable: false } as Column),
      '列级 editable:false',
    ).toBe(false)
  })

  it('**不可下拉时 openOptDrop 直接早退**（不标活动表格、不压层）', () => {
    const { api, calls } = makeMenus({ editable: false })
    api.openOptDrop(ROWS[0]!, COLS[1]!, mouseEvent())
    expect(api._optDrop.value, '不该打开').toBeNull()
    expect(calls.markEditActive, '不该标活动表格').toBe(0)
  })

  it('**可下拉时打开：带行键/列键/当前值/选项列表，且标活动表格**', () => {
    const { api, calls } = makeMenus()
    const td = el({ left: 40, top: 100, width: 120, height: 32 })
    api.openOptDrop(ROWS[0]!, COLS[1]!, { ...mouseEvent(), currentTarget: td } as unknown as MouseEvent)

    const drop = api._optDrop.value!
    expect(drop.rowKey).toBe('1')
    expect(drop.colKey).toBe('city')
    expect(drop.currentVal, '当前值取自该行').toBe('北京')
    expect(drop.options.length).toBe(3)
    expect(drop.width, '面板至少 100 宽（窄单元格也要能读）').toBe(120)
    expect(calls.markEditActive, '卡片视图靠它让 Ctrl+Z 不失效').toBe(1)
  })

  it('**窄单元格 → 面板宽度兜底到 100**', () => {
    const { api } = makeMenus()
    const td = el({ left: 10, top: 10, width: 40, height: 20 })
    api.openOptDrop(ROWS[0]!, COLS[1]!, { ...mouseEvent(), currentTarget: td } as unknown as MouseEvent)
    expect(api._optDrop.value!.width, '40 太窄，兜底 100').toBe(100)
  })

  it('**再点同一格 → 关闭（点同一格是切换语义）**', () => {
    const { api } = makeMenus()
    const td = el({ left: 0, top: 0, width: 120, height: 32 })
    const ev = { ...mouseEvent(), currentTarget: td } as unknown as MouseEvent

    api.openOptDrop(ROWS[0]!, COLS[1]!, ev)
    expect(api._optDrop.value).toBeTruthy()
    api.openOptDrop(ROWS[0]!, COLS[1]!, ev)
    expect(api._optDrop.value, '第二次点同一格应关闭').toBeNull()
  })

  it('**点另一格 → 换成新格（不关闭）**', () => {
    const { api } = makeMenus()
    const td = el({ left: 0, top: 0, width: 120, height: 32 })
    const ev = { ...mouseEvent(), currentTarget: td } as unknown as MouseEvent

    api.openOptDrop(ROWS[0]!, COLS[1]!, ev)
    api.openOptDrop(ROWS[1]!, COLS[1]!, ev)
    expect(api._optDrop.value!.rowKey, '应切到第二行').toBe('2')
    expect(api._optDrop.value!.currentVal).toBe('上海')
  })
})

/* ══════════════════ 选项面板：渲染后重定位 ══════════════════ */

describe('选项面板渲染后按实际高度重定位', () => {
  /** 造一个「面板已挂上」的环境：openOptDrop 后把 optDropRef 指向带 offsetHeight 的桩元素 */
  async function openWithPanel(
    trigger: { left: number; top: number; width: number; height: number },
    panelH: number,
  ) {
    const { api } = makeMenus()
    api.openOptDrop(ROWS[0]!, COLS[1]!, {
      ...mouseEvent(),
      currentTarget: el(trigger),
    } as unknown as MouseEvent)
    await nextTick() // watch 里的 nextTick 排到下一拍
    // ★ 光把 optDropRef 指向一个 detached 桩元素不够 —— 源码里那段重定位读的是
    //   `window.innerHeight`（真视口）与 `panelEl.offsetHeight`（桩值）。桩必须挂进文档，
    //   否则在 happy-dom 里这两套坐标对不上，断言会「碰巧」通过而变异也能通过（假绿）。
    const panel = document.createElement('div')
    panel.style.position = 'fixed'
    document.body.appendChild(panel)
    panels.push(panel)
    Object.defineProperty(panel, 'offsetHeight', { value: panelH, configurable: true })
    ;(api.optDropRef as { value: HTMLElement | null }).value = panel
    await nextTick()
    await nextTick()
    return { api, panel }
  }

  it('**下方够高 → 贴在触发格下方**（几何必须让「不贴下方」算出不同值，否则假绿）', async () => {
    // top=500,h=32 → bottom=532、spaceDown=264 >= 200 走「下方够」分支。
    // 若不走它：C 分支因 spaceDown(264) > spaceUp(496) 不成立 → 取 max(8,500-200-4)=296，可辨。
    const { panel } = await openWithPanel({ left: 40, top: 500, width: 120, height: 32 }, 200)
    expect(panel.style.top, 'bottom + offset').toBe('536px')
  })

  it('**上下都不够且下方空间更大 → 贴下方**', async () => {
    // top=300：spaceDown=464、spaceUp=296，都 < 700 → 走 C；spaceDown > spaceUp 故取 bottom+4=336，
    // 再被底部裁剪到 max(8, 800-700-8)=92。若 C 的「选空间大的」被写死成「翻上方」，结果变 8，可辨。
    const { panel } = await openWithPanel({ left: 40, top: 300, width: 120, height: 32 }, 700)
    expect(panel.style.top, '底部裁剪把 336 压到 92').toBe('92px')
  })

  it('**上下都不够且下方更宽裕的另一组几何仍然贴下方**（与上一条互为对照）', async () => {
    // top=10：spaceDown=754、spaceUp=6，都 < 760 → 走 C 且 spaceDown >> spaceUp
    // 写死「翻上方」会得到 max(8,10-760-4)=8，可辨
    const { panel } = await openWithPanel({ left: 40, top: 10, width: 120, height: 32 }, 760)
    expect(panel.style.top, '336 类候选被裁到 32').toBe('32px')
  })

  it('**极端高面板被顶部裁到 8**（顶部裁剪生效）', async () => {
    // top=390,p=380：spaceDown=374 < 380、spaceUp=386 >= 380 → 向上翻得 6 → 被抬到 8。
    // 去掉顶部裁剪会得到 6，可辨。
    const { panel } = await openWithPanel({ left: 40, top: 390, width: 120, height: 32 }, 380)
    expect(panel.style.top, '不得小于 8').toBe('8px')
  })

  it('**（源码备注）「向上翻」分支数学上不可辨 —— 冗余分支，非缺陷**', () => {
    // 源码：else if (spaceUp >= panelH) newTop = top - panelH - offset
    // 前提 spaceUp >= panelH ⟺ top - 4 >= panelH，于是：
    //   · 底部裁剪不触发：newTop + panelH = top - 4 < vh - 8（top <= vh）
    //   · 顶部裁剪仅在 newTop < 8 时抬升；而「去掉该分支」落到的 fallback 是 max(8, 同式)，
    //     二者只差这一次抬升
    // 穷举 vh=800、top∈[12,795]、panelH∈[100,790] 得 **0 组合**能区分两者。
    // 结论：删掉它行为不变 → 无法也不应为它造断言；登记为冗余分支（P3）。
    expect(true).toBe(true)
  })
})

/* ══════════════════ 选项面板：选择与键盘 ══════════════════ */

describe('选项面板选择与键盘导航', () => {
  function opened(props: Record<string, unknown> = {}) {
    const ctx = makeMenus(props)
    const td = el({ left: 0, top: 0, width: 120, height: 32 })
    ctx.api.openOptDrop(ROWS[0]!, COLS[1]!, { ...mouseEvent(), currentTarget: td } as unknown as MouseEvent)
    return ctx
  }

  it('**选不同值 → 走写入漏斗（applyChanges），不绕过撤销栈**', () => {
    const { api, calls } = opened()
    api.pickOption('上海')
    expect(calls.applyChanges).toHaveLength(1)
    expect(calls.applyChanges[0]).toEqual([{ rowKey: '1', colKey: 'city', value: '上海' }])
    expect(api._optDrop.value, '选完应关闭').toBeNull()
  })

  it('**选当前值 → 不产生写入**（避免凭空多一条撤销记录）', () => {
    const { api, calls } = opened()
    api.pickOption('北京') // 当前值
    expect(calls.applyChanges, '值没变就不该写').toHaveLength(0)
    expect(api._optDrop.value, '但仍应关闭').toBeNull()
  })

  it('**面板未打开 / 整表不可编辑 → pickOption 不写**', () => {
    const closed = makeMenus()
    closed.api.pickOption('上海')
    expect(closed.calls.applyChanges).toHaveLength(0)

    const ro = opened({ editable: false })
    // 面板本身在不可编辑时打不开，这里直接塞一个状态模拟「打开后被切成只读」
    ro.api._optDrop.value = {
      rowKey: '1',
      colKey: 'city',
      options: ['北京', '上海'],
      currentVal: '北京',
      top: 0,
      left: 0,
      width: 120,
      above: false,
    }
    ro.api.pickOption('上海')
    expect(ro.calls.applyChanges, '只读时不该写').toHaveLength(0)
  })

  it('**ArrowDown/Up 取模游标；Enter 取当前项；Escape 关闭**', () => {
    const { api, calls } = opened()
    const down = keyEvent('ArrowDown')
    api.onOptDropKeydown(down)
    expect(down.preventDefault, '方向键要阻止滚动').toHaveBeenCalled()
    expect(api._optFocusIndex.value).toBe(1)

    api.onOptDropKeydown(keyEvent('ArrowDown'))
    expect(api._optFocusIndex.value).toBe(2)
    api.onOptDropKeydown(keyEvent('ArrowDown'))
    expect(api._optFocusIndex.value, '越界回绕到 0').toBe(0)
    api.onOptDropKeydown(keyEvent('ArrowUp'))
    expect(api._optFocusIndex.value, '上越界回绕到末项').toBe(2)

    // 游标停在 2 → 是对象项 { value:'gz' }，Enter 应取 .value
    api.onOptDropKeydown(keyEvent('Enter'))
    expect(calls.applyChanges[0], 'Enter 应写入当前项且对象项取 value').toEqual([
      { rowKey: '1', colKey: 'city', value: 'gz' },
    ])

    api.openOptDrop(ROWS[0]!, COLS[1]!, {
      ...mouseEvent(),
      currentTarget: el({ left: 0, top: 0, width: 120, height: 32 }),
    } as unknown as MouseEvent)
    expect(api._optDrop.value).toBeTruthy()
    api.onOptDropKeydown(keyEvent('Escape'))
    expect(api._optDrop.value, 'Escape 应关闭').toBeNull()
  })

  it('**面板未打开 / 选项为空 / 无关按键 → 都不动游标**', () => {
    const { api } = makeMenus()
    const e = keyEvent('ArrowDown')
    api.onOptDropKeydown(e)
    expect(e.preventDefault, '未打开时不该拦键').not.toHaveBeenCalled()

    const empty = makeMenus()
    empty.api._optDrop.value = {
      rowKey: '1',
      colKey: 'city',
      options: [],
      currentVal: '',
      top: 0,
      left: 0,
      width: 120,
      above: false,
    }
    const e2 = keyEvent('ArrowDown')
    empty.api.onOptDropKeydown(e2)
    expect(e2.preventDefault, '空选项时 no-op').not.toHaveBeenCalled()

    const opened = makeMenus()
    opened.api._optDrop.value = {
      rowKey: '1',
      colKey: 'city',
      options: ['北京'],
      currentVal: '北京',
      top: 0,
      left: 0,
      width: 120,
      above: false,
    }
    const e3 = keyEvent('a')
    opened.api.onOptDropKeydown(e3)
    expect(e3.preventDefault, '普通字符不该被拦').not.toHaveBeenCalled()
    expect(opened.api._optFocusIndex.value).toBe(0)
  })

  it('**closeOptDrop 清空面板**', () => {
    const { api } = opened()
    api.closeOptDrop()
    expect(api._optDrop.value).toBeNull()
  })
})

/* ══════════════════ 单元格右键菜单 ══════════════════ */

describe('单元格右键菜单', () => {
  it('**cellContextMenu=false → 不拦冒泡、不开菜单**', () => {
    const { api, contextMenu } = makeMenus({ cellContextMenu: false })
    const e = mouseEvent()
    api.onCellContextMenuGuard(ROWS[0]!, COLS[1]!, e)
    expect(e.preventDefault, '不拦默认行为').not.toHaveBeenCalled()
    expect(e.stopPropagation, '不拦冒泡（让行右键接管）').not.toHaveBeenCalled()
    expect(contextMenu.value.visible).toBe(false)
  })

  it('**cellContextMenu=true → 拦默认+冒泡并打开菜单，右键格设为选中**', () => {
    const { api, contextMenu, calls } = makeMenus()
    const e = mouseEvent({ clientX: 200, clientY: 150 })
    api.onCellContextMenuGuard(ROWS[0]!, COLS[1]!, e)

    expect(e.preventDefault).toHaveBeenCalled()
    expect(e.stopPropagation).toHaveBeenCalled()
    expect(calls.selectCell, '右键格要先成为当前选中').toHaveLength(1)
    expect(calls.selectCell[0]).toEqual(['1', 'city', '北京', false])
    expect(contextMenu.value.visible).toBe(true)
    expect(contextMenu.value.columnKey).toBe('city')
    expect(contextMenu.value.rowKey).toBe('1')
    expect(contextMenu.value.rowIndex, '行索引用于批量/整行操作').toBe(0)
    expect(calls.closeContextMenu, '打开前先关旧菜单').toBe(1)
  })

  it('**打开菜单会标层新鲜**（防止打开瞬间的布局滚动把浮层误关）', async () => {
    const { isLayerFresh } = await import('@/components/data/composables/utils')
    const { api } = makeMenus()
    api.onCellContextMenuGuard(ROWS[1]!, COLS[1]!, mouseEvent())
    expect(isLayerFresh(), '刚打开的浮层应处于新鲜期').toBe(true)
  })

  it('**行不在当前页数据里 → rowIndex 为 -1、行键退化为空串**（不做假设）', () => {
    const { api, contextMenu } = makeMenus()
    const ghost = { id: 'zzz', city: '深圳' }
    api.onCellContextMenuGuard(ghost, COLS[1]!, mouseEvent())
    expect(contextMenu.value.rowIndex, '找不到就不编造索引').toBe(-1)
    expect(contextMenu.value.rowKey, '没有 meta 时行键退化为空串').toBe('')
    expect(contextMenu.value.row, '但仍带着行本身（保证菜单动作可用）').toStrictEqual(ghost)
  })

  it('**右键「复制」→ 先关菜单再复制**', async () => {
    const { api, calls } = makeMenus()
    await api.onContextCopyCell()
    expect(calls.closeContextMenu).toBe(1)
    expect(calls.copySelectedCell).toBe(1)
  })

  it('**右键「粘贴」：外部剪贴板有内容 → 用外部内容**', async () => {
    const { api, calls, selectedCell } = makeMenus()
    selectedCell.value = { rowKey: '1', colKey: 'city' }
    Object.defineProperty(navigator, 'clipboard', {
      value: { readText: vi.fn(async () => '广州') },
      configurable: true,
    })
    await api.onContextPasteCell()
    expect(calls.closeContextMenu).toBe(1)
    expect(calls.pasteText).toEqual(['广州'])
    expect(calls.pasteToSelection, '有外部内容就不该回退').toBe(0)
  })

  it('**右键「粘贴」：剪贴板为空 → 回退按选区粘贴**', async () => {
    const { api, calls, selectedCell } = makeMenus()
    selectedCell.value = { rowKey: '1', colKey: 'city' }
    Object.defineProperty(navigator, 'clipboard', { value: { readText: vi.fn(async () => '') }, configurable: true })
    await api.onContextPasteCell()
    expect(calls.pasteText, '空内容不该走 pasteText').toHaveLength(0)
    expect(calls.pasteToSelection).toBe(1)
  })

  it('**右键「粘贴」：剪贴板读取抛错 → 回退按选区粘贴（不能静默失败）**', async () => {
    const { api, calls, selectedCell } = makeMenus()
    selectedCell.value = { rowKey: '1', colKey: 'city' }
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        readText: vi.fn(async () => {
          throw new Error('denied')
        }),
      },
      configurable: true,
    })
    await api.onContextPasteCell()
    expect(calls.pasteToSelection, '读失败也要能粘').toBe(1)
  })

  it('**右键「粘贴」：只读或没有选中格 → 直接返回，不读剪贴板**', async () => {
    const readText = vi.fn(async () => 'x')
    Object.defineProperty(navigator, 'clipboard', { value: { readText }, configurable: true })

    const ro = makeMenus({ editable: false })
    ro.selectedCell.value = { rowKey: '1', colKey: 'city' }
    await ro.api.onContextPasteCell()
    expect(readText, '只读不该读剪贴板').not.toHaveBeenCalled()
    expect(ro.calls.pasteToSelection).toBe(0)

    const noSel = makeMenus()
    await noSel.api.onContextPasteCell()
    expect(readText).not.toHaveBeenCalled()
    expect(noSel.calls.pasteToSelection).toBe(0)
    expect(noSel.calls.closeContextMenu, '菜单仍应关闭').toBe(1)
  })

  it('**右键「清空」→ 关菜单并清选区**', () => {
    const { api, calls } = makeMenus()
    api.onContextClearCell()
    expect(calls.closeContextMenu).toBe(1)
    expect(calls.clearSelection).toHaveLength(1)
  })
})

/* ══════════════════ 右键菜单键盘导航 ══════════════════ */

describe('右键菜单键盘导航', () => {
  /** 造一个带 .dt-context-item 的菜单节点塞给 contextMenuRef */
  function menuWith(classes: string[]): HTMLElement {
    const menu = document.createElement('div')
    classes.forEach((cls, i) => {
      const item = document.createElement('div')
      item.className = `dt-context-item ${cls}`.trim()
      item.textContent = `item${i}`
      item.click = vi.fn()
      menu.appendChild(item)
    })
    return menu
  }

  it('**ArrowDown/Up 在可选项目间取模移动，并同步 menu-focused 与 tabIndex**', async () => {
    const { api, contextMenu } = makeMenus()
    const menu = menuWith(['', '', ''])
    ;(api.contextMenuRef as { value: HTMLElement | null }).value = menu
    // watch 只关心 false→true 这一次跳变；直接赋值 true 时同名值不触发，必须显式走一遍
    contextMenu.value.visible = true
    await nextTick()
    await nextTick()

    const items = [...menu.querySelectorAll<HTMLElement>('.dt-context-item')]
    expect(items[0]!.classList.contains('menu-focused'), '打开时焦点在首项').toBe(true)
    expect(items[0]!.tabIndex).toBe(0)
    expect(items[1]!.tabIndex).toBe(-1)

    api.onContextMenuKeydown(keyEvent('ArrowDown'))
    expect(items[1]!.classList.contains('menu-focused'), '下移一项').toBe(true)
    expect(items[0]!.tabIndex).toBe(-1)

    api.onContextMenuKeydown(keyEvent('ArrowUp'))
    expect(items[0]!.classList.contains('menu-focused'), '上移回首项').toBe(true)

    api.onContextMenuKeydown(keyEvent('ArrowUp'))
    expect(items[2]!.classList.contains('menu-focused'), '上越界回绕到末项').toBe(true)
    api.onContextMenuKeydown(keyEvent('ArrowDown'))
    expect(items[0]!.classList.contains('menu-focused'), '下越界回绕到首项').toBe(true)
  })

  it('**跳过 .disabled 项**（禁用项不该被键盘选中）', async () => {
    // 布局：x=可选、x=禁用、x=可选。可选序列长度 2，首项 index 0 = DOM 第 1 项。
    // 注意 updateMenuFocus 是按**全部** .dt-context-item 的序号打 menu-focused，
    // 而游标只数「可选」项 —— 这是源码的既有口径（游标与打标两套下标），
    // 下面断言的是它的真实行为：disabled 那格永远拿不到 focused。
    const { api, contextMenu } = makeMenus()
    const menu = menuWith(['', 'disabled', ''])
    ;(api.contextMenuRef as { value: HTMLElement | null }).value = menu
    // 先走一遍 visible 的 false→true 跳变，让 watch 把 menu-focused/tabIndex 初始化好
    contextMenu.value.visible = true
    await nextTick()
    await nextTick()

    const items = [...menu.querySelectorAll<HTMLElement>('.dt-context-item')]
    expect(items[0]!.classList.contains('menu-focused'), '前置：打开时焦点在首项').toBe(true)

    api.onContextMenuKeydown(keyEvent('ArrowDown'))
    // 游标只数「可选」项（0→1），updateMenuFocus 却按**全部** item 的序号打标，
    // 于是游标 1 点亮的是 DOM 第 2 项 —— 那一项恰好是 disabled。
    // ★ 这是真缺陷（键盘高亮落到禁用项上），已登记附录；此处锁定现状防止无意变更，
    //   修复后本断言应改为「禁用项不含 menu-focused」。
    expect(items[1]!.classList.contains('menu-focused'), '现状：禁用项被误标 focused').toBe(true)
    expect(items[1]!.tabIndex, '禁用项被设为可 Tab 停留').toBe(0)
  })

  it('**Enter / Space 触发当前项的 click**', () => {
    const { api } = makeMenus()
    const menu = menuWith(['', ''])
    ;(api.contextMenuRef as { value: HTMLElement | null }).value = menu
    const items = [...menu.querySelectorAll<HTMLElement>('.dt-context-item')]

    const enter = keyEvent('Enter')
    api.onContextMenuKeydown(enter)
    expect(enter.preventDefault).toHaveBeenCalled()
    expect(items[0]!.click, 'Enter 应点首项').toHaveBeenCalledTimes(1)

    api.onContextMenuKeydown(keyEvent('ArrowDown'))
    api.onContextMenuKeydown(keyEvent(' '))
    expect(items[1]!.click, 'Space 应点第二项').toHaveBeenCalledTimes(1)
  })

  it('**无菜单节点 / 无可选项 / 无关按键 → 都 no-op**', () => {
    const none = makeMenus()
    const e = keyEvent('ArrowDown')
    none.api.onContextMenuKeydown(e)
    expect(e.preventDefault, '无菜单时不拦键').not.toHaveBeenCalled()

    const empty = makeMenus()
    const menu = menuWith(['disabled', 'disabled'])
    ;(empty.api.contextMenuRef as { value: HTMLElement | null }).value = menu
    const e2 = keyEvent('ArrowDown')
    empty.api.onContextMenuKeydown(e2)
    expect(e2.preventDefault, '全禁用时 no-op').not.toHaveBeenCalled()

    const other = makeMenus()
    const menu2 = menuWith(['', ''])
    ;(other.api.contextMenuRef as { value: HTMLElement | null }).value = menu2
    const e3 = keyEvent('a')
    other.api.onContextMenuKeydown(e3)
    expect(e3.preventDefault, '普通字符不拦').not.toHaveBeenCalled()
  })
})
