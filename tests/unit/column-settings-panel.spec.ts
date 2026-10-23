/**
 * DataTableColumnSettings 列设置面板（显隐 / 顺序 / 宽度 / 固定）
 *
 * ## 为什么单独挂这个组件
 *
 * 380 行、此前 58.5% —— 而且**没有任何 spec 直接挂载它**：所有列相关用例都打在
 * composables（useTableColumns）上，面板本身只在 DataTable 的集成用例里被顺带渲染。
 * 于是「按钮 disabled 条件」「点了不生效」「文案与状态不一致」这类**只在面板上存在**的
 * 缺陷全部测不到。本 spec 直接挂载面板，用 provide/inject 注入一份真实的响应式上下文。
 *
 * ## 注入手法
 *
 * `DATA_TABLE_CONTEXT_KEY` 是模块内 `Symbol` 且未导出，无法走 VTU 的 `global.provide`。
 * 改为 `vi.mock` 掉 `injectDataTableContext`，让它返回测试里刚构造的上下文：
 * `vi.hoisted` 先占一个可写槽位（此时还拿不到 `ref`），在 `beforeEach` 里用真 ref 填充
 * ——mock 工厂只在组件 setup 时被调用，此时槽位已就绪。
 *
 * ## 覆盖重点（都是「面板独有」的判定，composable 层测不到）
 *
 *   · 宽度微调的**下限 disabled**（`colWidthPx(col) <= max(headerMinW, 30)`）
 *   · 「全部隐藏」保留的是**排序后第一列**（不是原始 columns[0]）
 *   · 单列「无」按钮的**断开语义**：左侧区域从该列起向右清、右侧区域从该列起向左清
 *   · 固定区高亮 `in-left-fixed` / `in-right-fixed` 与「连续」前缀/后缀计数一致
 *   · 重置列宽的 disabled 条件由 `userResizedCols` 驱动（不是由 columnWidths 驱动）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { computed, nextTick, ref } from 'vue'
import type { Column } from '@/components/data/composables/types'

/* ═══════════ 上下文注入 ═══════════ */

const ctxSlot = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('@/components/data/composables/context', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return { ...actual, injectDataTableContext: () => ctxSlot.current }
})

import DataTableColumnSettings from '@/components/data/DataTableColumnSettings.vue'

const COLS: Column[] = [
  { key: 'name', title: '姓名' },
  { key: 'code', title: '编号' },
  { key: 'city', title: '城市' },
  { key: 'age', title: '年龄' },
]

interface Ctx {
  hiddenColumns: ReturnType<typeof ref<Set<string>>>
  columnWidths: ReturnType<typeof ref<Record<string, number>>>
  columnOrder: ReturnType<typeof ref<string[]>>
  userResizedCols: ReturnType<typeof ref<Set<string>>>
  dynamicFixedLeft: ReturnType<typeof ref<Set<string>>>
  dynamicFixedRight: ReturnType<typeof ref<Set<string>>>
  visibleColumns: ReturnType<typeof computed<Column[]>>
  isColumnFixed: (col: Column) => 'left' | 'right' | false
  fixLeftCascade: ReturnType<typeof vi.fn>
  fixRightCascade: ReturnType<typeof vi.fn>
  headerMinW: (col: Column) => number
  clearPersisted: ReturnType<typeof vi.fn>
  applyAutoFit: ReturnType<typeof vi.fn>
  notify: ReturnType<typeof vi.fn>
  closeFilter: ReturnType<typeof vi.fn>
}

function makeCtx(over: Partial<Ctx> = {}): Ctx {
  const hiddenColumns = ref(new Set<string>())
  const columnWidths = ref<Record<string, number>>({})
  const columnOrder = ref<string[]>(COLS.map((c) => c.key))
  const userResizedCols = ref(new Set<string>())
  const dynamicFixedLeft = ref(new Set<string>())
  const dynamicFixedRight = ref(new Set<string>())
  const visibleColumns = computed(() => COLS.filter((c) => !hiddenColumns.value.has(c.key)))
  // 与 useTableColumns.isColumnFixed 同语义：动态优先，其次静态 fixed
  const isColumnFixed = (col: Column): 'left' | 'right' | false => {
    if (dynamicFixedLeft.value.has(col.key)) return 'left'
    if (dynamicFixedRight.value.has(col.key)) return 'right'
    return col.fixed ?? false
  }
  const fixLeftCascade = vi.fn((key: string) => {
    const idx = columnOrder.value.indexOf(key)
    dynamicFixedLeft.value = new Set(columnOrder.value.slice(0, idx + 1))
    dynamicFixedRight.value = new Set(
      [...dynamicFixedRight.value].filter((k) => !dynamicFixedLeft.value.has(k)),
    )
  })
  const fixRightCascade = vi.fn((key: string) => {
    const idx = columnOrder.value.indexOf(key)
    dynamicFixedRight.value = new Set(columnOrder.value.slice(idx))
    dynamicFixedLeft.value = new Set(
      [...dynamicFixedLeft.value].filter((k) => !dynamicFixedRight.value.has(k)),
    )
  })
  const ctx: Ctx = {
    hiddenColumns,
    columnWidths,
    columnOrder,
    userResizedCols,
    dynamicFixedLeft,
    dynamicFixedRight,
    visibleColumns,
    isColumnFixed,
    fixLeftCascade,
    fixRightCascade,
    headerMinW: () => 60,
    clearPersisted: vi.fn(),
    applyAutoFit: vi.fn(),
    notify: vi.fn(),
    closeFilter: vi.fn(),
    ...over,
  }
  ctxSlot.current = ctx
  return ctx
}

let ctx: Ctx
let wrapper: ReturnType<typeof mount>

async function openPanel(): Promise<void> {
  wrapper = mount(DataTableColumnSettings, { props: { columns: COLS }, attachTo: document.body })
  ;(wrapper.vm as unknown as { toggle: () => void }).toggle()
  await nextTick()
  await nextTick()
}

async function closePanel(): Promise<void> {
  if (wrapper) wrapper.unmount()
  document.body.innerHTML = ''
}

/* ═══════════ 查询器（全部取自源码实测选择器） ═══════════ */

const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T | null
const items = () => [...document.querySelectorAll('.dt-col-item')] as HTMLElement[]
const itemByTitle = (title: string) =>
  items().find((el) => el.querySelector('.dt-col-title')?.textContent?.trim() === title)!
const quickBtn = (label: string) => {
  const btns = [...document.querySelectorAll('.dt-col-quick-actions button')] as HTMLButtonElement[]
  return btns.find((b) => b.textContent?.trim() === label)
}
const searchInput = () => q<HTMLInputElement>('.dt-col-search')
const widthText = (title: string) => itemByTitle(title).querySelector('.dt-col-width span')?.textContent?.trim()
const opsOf = (title: string) => [...itemByTitle(title).querySelectorAll('.dt-col-ops button')] as HTMLButtonElement[]
const footerFixed = () => q('.dt-col-footer-fixed')?.textContent?.trim() ?? ''

beforeEach(() => {
  ctx = makeCtx()
  document.body.innerHTML = ''
})

afterEach(async () => {
  await closePanel()
  vi.restoreAllMocks()
})

/* ═══════════ 面板开关与定位 ═══════════ */

describe('面板开关与定位', () => {
  it('**未打开时不渲染面板**（Teleport 内容也不该存在）', async () => {
    wrapper = mount(DataTableColumnSettings, { props: { columns: COLS }, attachTo: document.body })
    await nextTick()
    expect(q('.dt-col-settings')).toBeNull()
    wrapper.unmount()
  })

  it('**toggle 打开、close 关闭**（主文件外部关闭路径依赖它）', async () => {
    await openPanel()
    expect(q('.dt-col-settings')).toBeTruthy()

    ;(wrapper.vm as unknown as { close: () => void }).close()
    await nextTick()
    expect(q('.dt-col-settings'), 'close() 应关闭').toBeNull()
  })

  it('**无事件触发时用默认右上角定位**（键盘打开 / 程序化打开的兜底）', async () => {
    await openPanel()
    const style = q('.dt-col-settings')!.getAttribute('style') ?? ''
    expect(style, '默认落在右上角').toContain('top: 56px')
    expect(style).toContain('right: 16px')
  })

  it('**有触发按钮时按其 rect 定位到下方**', async () => {
    const btn = document.createElement('button')
    document.body.appendChild(btn)
    Object.defineProperty(btn, 'getBoundingClientRect', {
      value: () => ({ top: 100, bottom: 132, left: 40, right: 160, width: 120, height: 32, x: 40, y: 100, toJSON: () => ({}) }),
    })
    wrapper = mount(DataTableColumnSettings, { props: { columns: COLS }, attachTo: document.body })
    ;(wrapper.vm as unknown as { toggle: (e?: MouseEvent) => void }).toggle({
      currentTarget: btn,
    } as unknown as MouseEvent)
    await nextTick()
    await nextTick()
    const style = q('.dt-col-settings')!.getAttribute('style') ?? ''
    expect(style, '贴在按钮下方 4px').toContain('top: 136px')
  })

  it('**打开时会先关掉筛选面板**（两个浮层不能同时存在）', async () => {
    await openPanel()
    expect(ctx.closeFilter, '打开列设置应收起筛选').toHaveBeenCalled()
  })
})

/* ═══════════ 搜索过滤 ═══════════ */

describe('列名搜索', () => {
  it('**按中文子串过滤**', async () => {
    await openPanel()
    expect(items().length).toBe(4)

    searchInput()!.value = '编号'
    searchInput()!.dispatchEvent(new Event('input'))
    await nextTick()
    expect(items().length, '只留编号列').toBe(1)
    expect(itemByTitle('编号')).toBeTruthy()
  })

  it('**支持拼音首字母/全拼**（中文键盘用户不方便切输入法）', async () => {
    await openPanel()
    searchInput()!.value = 'bianhao'
    searchInput()!.dispatchEvent(new Event('input'))
    await nextTick()
    expect(items().length, '「bianhao」应命中「编号」').toBe(1)
  })

  it('**无匹配时显示空态文案**（不是留一片空白）', async () => {
    await openPanel()
    searchInput()!.value = 'zzzzz'
    searchInput()!.dispatchEvent(new Event('input'))
    await nextTick()
    expect(items().length).toBe(0)
    expect(q('.dt-col-no-result')?.textContent?.trim()).toBe('无匹配列')
  })

  it('**清空关键词后恢复全量**', async () => {
    await openPanel()
    searchInput()!.value = '编号'
    searchInput()!.dispatchEvent(new Event('input'))
    await nextTick()
    searchInput()!.value = ''
    searchInput()!.dispatchEvent(new Event('input'))
    await nextTick()
    expect(items().length).toBe(4)
  })

  it('**过滤不改变固定区判定**（判定用的是全量索引，不是过滤后下标）', async () => {
    ctx.dynamicFixedLeft.value = new Set(['name', 'code'])
    await openPanel()
    searchInput()!.value = '城市'
    searchInput()!.dispatchEvent(new Event('input'))
    await nextTick()

    const city = itemByTitle('城市')
    expect(city.classList.contains('in-left-fixed'), '城市是第 3 列，不在左固定区').toBe(false)
  })
})

/* ═══════════ 单列显隐 ═══════════ */

describe('单列显隐', () => {
  const checkboxOf = (title: string) => itemByTitle(title).querySelector('input[type="checkbox"]') as HTMLInputElement

  it('**取消勾选 → 该列进 hiddenColumns 并整行置灰**', async () => {
    await openPanel()
    const cb = checkboxOf('城市')
    expect(cb.checked).toBe(true)
    cb.click()
    await nextTick()
    expect([...ctx.hiddenColumns.value]).toEqual(['city'])
    expect(itemByTitle('城市').classList.contains('hidden'), '隐藏行应带 hidden 类').toBe(true)
    expect(checkboxOf('城市').checked, '勾选态应同步').toBe(false)
  })

  it('**重新勾选 → 从 hiddenColumns 删除**（这条 delete 分支最容易漏）', async () => {
    ctx.hiddenColumns.value = new Set(['city'])
    await openPanel()
    const cb = checkboxOf('城市')
    expect(cb.checked).toBe(false)
    cb.click()
    await nextTick()
    expect([...ctx.hiddenColumns.value], '应被移除').toEqual([])
    expect(itemByTitle('城市').classList.contains('hidden')).toBe(false)
  })

  it('**只剩一列可见时拒绝再隐藏**（表格不能一列都没有）', async () => {
    ctx.hiddenColumns.value = new Set(['code', 'city', 'age'])
    await openPanel()
    const cb = checkboxOf('姓名')
    expect(cb.checked).toBe(true)
    cb.click()
    await nextTick()
    expect([...ctx.hiddenColumns.value], '不该再加一列隐藏').toEqual(['code', 'city', 'age'])
  })

  it('**Set 被替换成新引用**（否则 Vue 侦测不到变更）', async () => {
    await openPanel()
    const before = ctx.hiddenColumns.value
    checkboxOf('城市').click()
    await nextTick()
    expect(ctx.hiddenColumns.value).not.toBe(before)
  })

  it('**隐藏列时固定按钮组置灰**（隐藏列不该还能设固定）', async () => {
    ctx.hiddenColumns.value = new Set(['city'])
    await openPanel()
    const fixedBtns = [...itemByTitle('城市').querySelectorAll('.dt-col-fixed-group button')] as HTMLButtonElement[]
    expect(fixedBtns.length).toBe(3)
    expect(fixedBtns.every((b) => b.disabled), '三个固定按钮都应禁用').toBe(true)
    expect(itemByTitle('城市').querySelector('.dt-col-fixed-group')!.classList.contains('disabled')).toBe(true)
  })
})

/* ═══════════ 全部显示 / 全部隐藏 ═══════════ */

describe('全部显示 / 全部隐藏', () => {
  it('**全部隐藏时保留排序后的第一列**（不是原始 columns[0]）', async () => {
    // 把 city 排到第一位
    ctx.columnOrder.value = ['city', 'name', 'code', 'age']
    await openPanel()
    quickBtn('全部隐藏')!.click()
    await nextTick()
    expect([...ctx.hiddenColumns.value].sort(), '应隐藏后三列，city 保留').toEqual(['age', 'code', 'name'])
    expect(ctx.hiddenColumns.value.has('city')).toBe(false)
  })

  it('**全部隐藏后按钮文案变「全部显示」**（同一按钮双语义）', async () => {
    await openPanel()
    quickBtn('全部隐藏')!.click()
    await nextTick()
    expect(quickBtn('全部显示'), '按钮应切换文案').toBeTruthy()
    expect(quickBtn('全部隐藏')).toBeUndefined()
  })

  it('**点「全部显示」清空隐藏集合**', async () => {
    ctx.hiddenColumns.value = new Set(['city', 'age'])
    await openPanel()
    quickBtn('全部显示')!.click()
    await nextTick()
    expect(ctx.hiddenColumns.value.size).toBe(0)
  })

  it('**只要不是全可见，按钮就显示「全部显示」**（一处隐藏也提示可一键恢复）', async () => {
    ctx.hiddenColumns.value = new Set(['age'])
    await openPanel()
    expect(quickBtn('全部显示'), '部分隐藏时也是「全部显示」').toBeTruthy()
    expect(quickBtn('全部隐藏')).toBeUndefined()

    quickBtn('全部显示')!.click()
    await nextTick()
    expect(ctx.hiddenColumns.value.size).toBe(0)
  })
})

/* ═══════════ 列宽微调与重置 ═══════════ */

describe('列宽', () => {
  const minusOf = (title: string) => itemByTitle(title).querySelectorAll('.dt-col-width button')[0] as HTMLButtonElement
  const plusOf = (title: string) => itemByTitle(title).querySelectorAll('.dt-col-width button')[1] as HTMLButtonElement

  it('**默认宽度回退到表头最小宽与 60 的较大者**', async () => {
    ctx.headerMinW = () => 42
    await openPanel()
    expect(widthText('姓名'), '小于 60 时取 60').toBe('60')
  })

  it('**点「+」加宽 10px 并标记为用户调整**', async () => {
    await openPanel()
    plusOf('姓名').click()
    await nextTick()
    expect(ctx.columnWidths.value.name).toBe(70)
    expect(ctx.userResizedCols.value.has('name'), '应记为用户调整（autoFit 不再覆盖）').toBe(true)
    expect(widthText('姓名')).toBe('70')
  })

  it('**点「−」收窄 10px，但不低于下限**', async () => {
    ctx.columnWidths.value = { name: 65 }
    ctx.userResizedCols.value = new Set(['name'])
    await openPanel()
    minusOf('姓名').click()
    await nextTick()
    expect(ctx.columnWidths.value.name, '65-10=55 但下限 60').toBe(60)
  })

  it('**已在最低宽时「−」按钮禁用**（点了没反应不如一开始就灰掉）', async () => {
    await openPanel()
    expect(minusOf('姓名').disabled, '默认就是 60，已是下限').toBe(true)

    ctx.columnWidths.value = { name: 100 }
    await nextTick()
    expect(minusOf('姓名').disabled, '加宽后应可用').toBe(false)
  })

  it('**「重置列宽」在无手动宽度时禁用**', async () => {
    await openPanel()
    const btn = quickBtn('重置列宽')!
    expect(btn.disabled, '没有手动宽度 → 禁用').toBe(true)
  })

  it('**有手动宽度时「重置列宽」可用，点击后清宽 + 清持久化 + 重新自适应**', async () => {
    ctx.userResizedCols.value = new Set(['name'])
    ctx.columnWidths.value = { name: 120 }
    await openPanel()
    const btn = quickBtn('重置列宽')!
    expect(btn.disabled, '有手动宽度 → 可用').toBe(false)

    btn.click()
    await nextTick()
    expect(ctx.userResizedCols.value.size, '手动标记清空').toBe(0)
    expect(ctx.columnWidths.value, '列宽清空').toEqual({})
    expect(ctx.clearPersisted, '应清掉持久化的 colwidth').toHaveBeenCalledWith('colwidth')
    expect(ctx.applyAutoFit, '应重新自适应').toHaveBeenCalled()
    expect(ctx.notify, '应提示用户').toHaveBeenCalledWith('已重置列宽，恢复自动列宽')
  })

  it('**列宽变化后才响应式亮起重置按钮**（依赖 columnWidths 的 watch 计数）', async () => {
    await openPanel()
    expect(quickBtn('重置列宽')!.disabled).toBe(true)

    ctx.userResizedCols.value = new Set(['name'])
    ctx.columnWidths.value = { name: 88 }
    await nextTick()
    await nextTick()
    expect(quickBtn('重置列宽')!.disabled).toBe(false)
  })
})

/* ═══════════ 顺序微调 ═══════════ */

describe('顺序微调', () => {
  it('**上移/下移改的是 columnOrder**', async () => {
    await openPanel()
    opsOf('城市')[0]!.click() // 上移
    await nextTick()
    expect(ctx.columnOrder.value).toEqual(['name', 'city', 'code', 'age'])
  })

  it('**首列「上移」与末列「下移」禁用**（越界按钮不该可点）', async () => {
    await openPanel()
    expect(opsOf('姓名')[0]!.disabled, '首列上移应禁用').toBe(true)
    expect(opsOf('年龄')[1]!.disabled, '末列下移应禁用').toBe(true)
    expect(opsOf('城市')[0]!.disabled).toBe(false)
    expect(opsOf('城市')[1]!.disabled).toBe(false)
  })

  it('**行顺序跟着 columnOrder 走**（面板列表就是表格顺序）', async () => {
    ctx.columnOrder.value = ['city', 'name', 'code', 'age']
    await openPanel()
    expect(items().map((el) => el.querySelector('.dt-col-title')?.textContent?.trim())).toEqual([
      '城市',
      '姓名',
      '编号',
      '年龄',
    ])
  })
})

/* ═══════════ 单列固定（含「无」的断开语义） ═══════════ */

describe('单列固定', () => {
  const fixedBtn = (title: string, label: '无' | '左' | '右') => {
    const btns = [...itemByTitle(title).querySelectorAll('.dt-col-fixed-group button')] as HTMLButtonElement[]
    const btn = btns.find((b) => b.textContent?.trim() === label)
    expect(btn, `「${title}」应有「${label}」按钮`).toBeTruthy()
    return btn!
  }

  it('**「左」走级联固定**（该列及左侧全固定）', async () => {
    await openPanel()
    fixedBtn('编号', '左').click()
    await nextTick()
    expect(ctx.fixLeftCascade, '应调级联而非直接改集合').toHaveBeenCalledWith('code')
    expect([...ctx.dynamicFixedLeft.value]).toEqual(['name', 'code'])
  })

  it('**「右」走级联固定**（该列及右侧全固定）', async () => {
    await openPanel()
    fixedBtn('城市', '右').click()
    await nextTick()
    expect(ctx.fixRightCascade).toHaveBeenCalledWith('city')
    expect([...ctx.dynamicFixedRight.value]).toEqual(['city', 'age'])
  })

  it('**「无」：左固定区从该列起向右断开**（外侧保留）', async () => {
    ctx.dynamicFixedLeft.value = new Set(['name', 'code', 'city'])
    await openPanel()
    fixedBtn('编号', '无').click()
    await nextTick()
    expect([...ctx.dynamicFixedLeft.value], '只留 name').toEqual(['name'])
  })

  it('**「无」：右固定区从该列起向左断开**', async () => {
    ctx.dynamicFixedRight.value = new Set(['code', 'city', 'age'])
    await openPanel()
    fixedBtn('城市', '无').click()
    await nextTick()
    expect([...ctx.dynamicFixedRight.value], '只留 age').toEqual(['age'])
  })

  it('**「无」：同时存在左右区域时两侧都断开**', async () => {
    ctx.dynamicFixedLeft.value = new Set(['name'])
    ctx.dynamicFixedRight.value = new Set(['age'])
    await openPanel()
    fixedBtn('姓名', '无').click() // 只属于左区
    await nextTick()
    expect([...ctx.dynamicFixedLeft.value]).toEqual([])
    expect([...ctx.dynamicFixedRight.value], '右区不该被动到').toEqual(['age'])
  })

  it('**固定态在按钮上有 active 标记**（三态互斥）', async () => {
    ctx.dynamicFixedLeft.value = new Set(['name'])
    await openPanel()
    expect(fixedBtn('姓名', '左').classList.contains('active')).toBe(true)
    expect(fixedBtn('姓名', '右').classList.contains('active')).toBe(false)
    expect(fixedBtn('姓名', '无').classList.contains('active')).toBe(false)
  })

  it('**无固定态时「无」按钮为 active**', async () => {
    await openPanel()
    expect(fixedBtn('城市', '无').classList.contains('active')).toBe(true)
  })

  it('**静态 fixed 列同样显示为固定态**（props 里的 fixed 也要反映）', async () => {
    const withStatic: Column[] = [{ key: 'name', title: '姓名', fixed: 'left' }, { key: 'code', title: '编号' }]
    wrapper = mount(DataTableColumnSettings, { props: { columns: withStatic }, attachTo: document.body })
    ;(wrapper.vm as unknown as { toggle: () => void }).toggle()
    await nextTick()
    await nextTick()
    expect(fixedBtn('姓名', '左').classList.contains('active')).toBe(true)
  })
})

/* ═══════════ 固定区高亮（连续前缀 / 后缀） ═══════════ */

describe('固定区高亮', () => {
  it('**左固定按「连续前缀」计数**（中间断开的列不算）', async () => {
    ctx.dynamicFixedLeft.value = new Set(['name', 'city']) // code 未固定 → 前缀只到 name
    await openPanel()
    expect(itemByTitle('姓名').classList.contains('in-left-fixed'), '前缀首列').toBe(true)
    expect(itemByTitle('编号').classList.contains('in-left-fixed'), '断点后的列不该高亮').toBe(false)
    expect(itemByTitle('城市').classList.contains('in-left-fixed'), '断点之后同属左集合但非前缀').toBe(false)
  })

  it('**右固定按「连续后缀」计数**', async () => {
    ctx.dynamicFixedRight.value = new Set(['city', 'age'])
    await openPanel()
    expect(itemByTitle('年龄').classList.contains('in-right-fixed'), '后缀末列').toBe(true)
    expect(itemByTitle('城市').classList.contains('in-right-fixed'), '倒数第二列').toBe(true)
    expect(itemByTitle('编号').classList.contains('in-right-fixed'), '后缀之外的列不该高亮').toBe(false)
  })

  it('**页脚摘要显示固定列数**', async () => {
    ctx.dynamicFixedLeft.value = new Set(['name', 'code'])
    ctx.dynamicFixedRight.value = new Set(['age'])
    await openPanel()
    const text = footerFixed()
    expect(text).toContain('已固定左 2 列')
    expect(text).toContain('已固定右 1 列')
  })

  it('**没有固定时页脚显示「未固定」**', async () => {
    await openPanel()
    expect(footerFixed()).toContain('未固定')
  })
})

/* ═══════════ 快捷固定：全部固定左/右/取消 ═══════════ */

describe('快捷固定', () => {
  it('**「全部固定左」把可见列全固定到左，并清掉右区**', async () => {
    ctx.dynamicFixedRight.value = new Set(['age'])
    await openPanel()
    quickBtn('全部固定左')!.click()
    await nextTick()
    expect([...ctx.dynamicFixedLeft.value].sort()).toEqual(['age', 'city', 'code', 'name'])
    expect(ctx.dynamicFixedRight.value.size, '右区应清空').toBe(0)
  })

  it('**「全部固定右」把可见列全固定到右，并清掉左区**', async () => {
    ctx.dynamicFixedLeft.value = new Set(['name'])
    await openPanel()
    quickBtn('全部固定右')!.click()
    await nextTick()
    expect([...ctx.dynamicFixedRight.value].sort()).toEqual(['age', 'city', 'code', 'name'])
    expect(ctx.dynamicFixedLeft.value.size).toBe(0)
  })

  it('**已全固定左时按钮 active，再点一次取消**（同一按钮切换）', async () => {
    await openPanel()
    quickBtn('全部固定左')!.click()
    await nextTick()
    expect(quickBtn('全部固定左')!.classList.contains('active')).toBe(true)

    quickBtn('全部固定左')!.click()
    await nextTick()
    expect(ctx.dynamicFixedLeft.value.size, '再点应取消').toBe(0)
    expect(quickBtn('全部固定左')!.classList.contains('active')).toBe(false)
  })

  it('**「取消固定」在无任何固定时禁用**', async () => {
    await openPanel()
    expect(quickBtn('取消固定')!.disabled).toBe(true)
  })

  it('**有固定时「取消固定」可用并清空两侧**', async () => {
    ctx.dynamicFixedLeft.value = new Set(['name'])
    ctx.dynamicFixedRight.value = new Set(['age'])
    await openPanel()
    const btn = quickBtn('取消固定')!
    expect(btn.disabled).toBe(false)
    btn.click()
    await nextTick()
    expect(ctx.dynamicFixedLeft.value.size + ctx.dynamicFixedRight.value.size).toBe(0)
  })

  it('**只有单侧固定时「取消固定」也必须可用**（`&&` 与 `||` 的分界就在这）', async () => {
    ctx.dynamicFixedLeft.value = new Set(['name'])
    await openPanel()
    expect(quickBtn('取消固定')!.disabled, '只固定左侧也算「有固定」').toBe(false)

    ctx.dynamicFixedLeft.value = new Set()
    ctx.dynamicFixedRight.value = new Set(['age'])
    await nextTick()
    expect(quickBtn('取消固定')!.disabled, '反过来只固定右侧同样可用').toBe(false)
  })

  it('**只有隐藏列时「全部固定左」判定用可见列**（隐藏列不参与 active 判定）', async () => {
    ctx.hiddenColumns.value = new Set(['age'])
    ctx.dynamicFixedLeft.value = new Set(['name', 'code', 'city'])
    await openPanel()
    expect(quickBtn('全部固定左')!.classList.contains('active'), '可见三列都已固定 → active').toBe(true)
  })
})

/* ═══════════ 列头右键「取消固定」入口 ═══════════ */

describe('unfixFromMenu（主文件列头右键入口）', () => {
  it('**左侧固定的列 → 只保留它之前的左侧固定**', async () => {
    ctx.dynamicFixedLeft.value = new Set(['name', 'code', 'city'])
    await openPanel()
    ;(wrapper.vm as unknown as { unfixFromMenu: (k: string) => void }).unfixFromMenu('city')
    await nextTick()
    expect([...ctx.dynamicFixedLeft.value], 'city 及之后全取消').toEqual(['name', 'code'])
  })

  it('**右侧固定的列 → 只保留它之后的右侧固定**', async () => {
    ctx.dynamicFixedRight.value = new Set(['code', 'city', 'age'])
    await openPanel()
    ;(wrapper.vm as unknown as { unfixFromMenu: (k: string) => void }).unfixFromMenu('city')
    await nextTick()
    expect([...ctx.dynamicFixedRight.value], 'city 及之前全取消').toEqual(['age'])
  })

  it('**未知 key 不产生副作用**（右键菜单可能传已删除列）', async () => {
    ctx.dynamicFixedLeft.value = new Set(['name'])
    await openPanel()
    ;(wrapper.vm as unknown as { unfixFromMenu: (k: string) => void }).unfixFromMenu('ghost')
    await nextTick()
    expect([...ctx.dynamicFixedLeft.value]).toEqual(['name'])
  })

  it('**两侧都固定时该列两侧都断开**', async () => {
    ctx.dynamicFixedLeft.value = new Set(['name', 'code'])
    ctx.dynamicFixedRight.value = new Set(['code', 'city', 'age'])
    await openPanel()
    ;(wrapper.vm as unknown as { unfixFromMenu: (k: string) => void }).unfixFromMenu('code')
    await nextTick()
    expect([...ctx.dynamicFixedLeft.value], '左区只留 name').toEqual(['name'])
    expect([...ctx.dynamicFixedRight.value], '右区只留 city、age').toEqual(['city', 'age'])
  })
})
