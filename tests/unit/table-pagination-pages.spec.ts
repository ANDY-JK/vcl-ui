/**
 * 分页页码列表 `displayPages` 与分页脚注组件（第 123 轮）。
 *
 * 为什么盯这里：页码列表是**差一错误**的高发区，而且错了之后**看起来完全正常** ——
 * 用户看到 `1 3 4 5 … 10` 只会觉得"这分页有点怪"，不会报 bug；但**第 2 页点不到**。
 * 本文件用手算的期望序列逐个场景对账（`tp<=9` 全展开 / 首段 / 中段 / 尾段 / 边界），
 * 再用组件挂载验"该显示什么、不该显示什么、点了跳到哪页"。
 */
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, computed, nextTick } from 'vue'
import { provideDataTableContext, type DataTableContext } from '@/components/data/composables/context'
import { useTableCore } from '@/components/data/composables/useTableCore'

/**
 * 页码算法**直接取真源**（`useTableCore` 产出的 `displayPages`）。
 *
 * 第一版这里复刻了一份算法，结果负向对照暴露了致命弱点：
 * 探针只改真源、复刻没变 → **用例仍全绿**，等于测的是自己的副本。
 * 现在改成建一个真的 core 去读它的 `displayPages`，改真源必然让用例变红。
 */
function coreWith(total: number, pageSize = 10) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: String(i), v: i }))
  const core = useTableCore(
    { data: rows, pageSize } as never,
    (() => {}) as never,
    ref({}),
    ref(new Set<string>()),
    computed(() => [{ key: 'id', title: 'ID' }, { key: 'v', title: 'V' }]) as never,
    ref(''),
  )
  return core
}

/** 取真源算出的页码序列（把 `currentPage` 拨到 cp 再读 computed） */
function pagesOf(tp: number, cp: number): Array<number | string> {
  const core = coreWith(tp * 10, 10) // 总页数 = tp
  core._currentPage.value = cp
  return core.displayPages.value as Array<number | string>
}

describe('displayPages：页码序列逐场景对账（手算期望）', () => {
  it('总页数 ≤ 9 → 全部展开，没有省略号', () => {
    expect(pagesOf(1, 1)).toEqual([1])
    expect(pagesOf(5, 3)).toEqual([1, 2, 3, 4, 5])
    expect(pagesOf(9, 5)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('**首页段（cp=1..3）左侧不留省略号**：页码从 1 连续展开', () => {
    expect(pagesOf(10, 1)).toEqual([1, 2, '...', 10])
    expect(pagesOf(10, 2)).toEqual([1, 2, 3, '...', 10])
    expect(pagesOf(10, 3)).toEqual([1, 2, 3, 4, '...', 10])
    // cp=4 时第 2 页确实被藏起来了 → 必须**有**左侧省略号代表它。
    // 旧实现在这里判断 `cp > 4` 说不加省略号、但 start 已经是 3，于是渲染成
    // `1 3 4 5 … 10` —— 第 2 页既没显示、也没有省略号代表，**永远点不到**（第 123 轮修掉）。
    expect(pagesOf(10, 4), 'cp=4：第 2 页由省略号代表，不能凭空消失').toEqual([1, '...', 3, 4, 5, '...', 10])
  })

  it('中段：两侧都有省略号，当前页前后各一页', () => {
    expect(pagesOf(10, 5)).toEqual([1, '...', 4, 5, 6, '...', 10])
    expect(pagesOf(10, 6)).toEqual([1, '...', 5, 6, 7, '...', 10])
  })

  it('**尾段（cp≥tp-2）右侧不留省略号**：页码连续到最后一页', () => {
    // cp=7（= tp-3）时第 9 页被藏 → 必须**有**右侧省略号代表它。
    // 旧实现判断 `cp < tp-3` 为假、不加省略号，但 end 只到 8，于是渲染成
    // `1 … 6 7 8 10` —— 第 9 页凭空消失（同一个差一错误的镜像）。
    expect(pagesOf(10, 7), 'cp=7：第 9 页由省略号代表').toEqual([1, '...', 6, 7, 8, '...', 10])
    expect(pagesOf(10, 8)).toEqual([1, '...', 7, 8, 9, 10])
    expect(pagesOf(10, 9)).toEqual([1, '...', 8, 9, 10])
    expect(pagesOf(10, 10)).toEqual([1, '...', 9, 10])
  })

  it('**任何场景下页码都必须"从 1 到 tp 连续可点"**：不许有跳号（跳号 = 那一页永远点不到）', () => {
    for (const tp of [10, 11, 20, 100]) {
      for (let cp = 1; cp <= tp; cp++) {
        const shown = pagesOf(tp, cp).filter((p): p is number => p !== '...')
        // ① 当前页一定在列表里
        expect(shown, `tp=${tp} cp=${cp}：当前页必须可点`).toContain(cp)
        // ② 首页与末页一定在列表里
        expect(shown[0], `tp=${tp} cp=${cp}：首页要在`).toBe(1)
        expect(shown.at(-1), `tp=${tp} cp=${cp}：末页要在`).toBe(tp)
        // ③ 显示出来的数字必须**递增无重复**
        for (let i = 1; i < shown.length; i++) {
          expect(shown[i], `tp=${tp} cp=${cp}：页码必须递增（${shown.join(',')}）`).toBeGreaterThan(shown[i - 1])
        }
        // ④ 省略号两侧的数字之间**确实隔着东西**（不该有 `5 … 6` 这种废话省略号）
        const raw = pagesOf(tp, cp)
        raw.forEach((v, i) => {
          if (v !== '...') return
          const prev = raw[i - 1] as number
          const next = raw[i + 1] as number
          expect(next - prev, `tp=${tp} cp=${cp}：省略号两侧 ${prev}/${next} 必须真隔着页`).toBeGreaterThan(1)
        })
      }
    }
  })

  it('省略号不会出现两个连着（视觉上 `… …` 是明显的实现错误）', () => {
    for (const tp of [10, 11, 12, 30]) {
      for (let cp = 1; cp <= tp; cp++) {
        const raw = pagesOf(tp, cp)
        for (let i = 1; i < raw.length; i++) {
          expect(
            raw[i] === '...' && raw[i - 1] === '...',
            `tp=${tp} cp=${cp}：不该有连续省略号`,
          ).toBe(false)
        }
      }
    }
  })
})

// ════════════════════════════════════════════════════════════════════
// 组件层：该显示什么 / 不该显示什么 / 点了跳哪页
// ════════════════════════════════════════════════════════════════════
/**
 * 挂载分页脚注。
 *
 * 注入必须走**真实的** `provideDataTableContext`（`Symbol` 是模块私有的，自己 new 一个 Symbol
 * 注入不进去 —— 那样组件会抛"缺少 provide 上下文"，看起来像组件坏了）。
 * 这里只填分页用到的四个分片，其余以类型断言补齐。
 */
async function mountPagination(opts: {
  pageSize?: number
  totalPages?: number
  currentPage?: number
  fullscreen?: boolean
  selectable?: boolean
  selected?: string[]
}) {
  const { default: DataTablePagination } = await import('@/components/data/DataTablePagination.vue')
  const tp = opts.totalPages ?? 10
  const currentPage = ref(opts.currentPage ?? 1)
  const selectedKeys = ref<string[]>(opts.selected ?? [])
  // 夹取范围必须用同一个 tp：第一版这里读了 `opts.totalPages`（未传时是 undefined → 兜到 1），
  // 于是每次 setPage 都被夹成 1，看起来像"翻页没生效"
  const setPage = vi.fn((p: number) => {
    currentPage.value = Math.min(Math.max(1, p), tp)
  })
  const displayPages = computed(() => pagesOf(tp, currentPage.value))

  const w = mount(
    {
      components: { DataTablePagination },
      props: ['fullscreen', 'pageSize', 'totalPages', 'selectable'],
      setup() {
        provideDataTableContext({
          selectedKeys,
          currentPage,
          displayPages,
          setPage,
        } as unknown as DataTableContext)
      },
      template: `<DataTablePagination
        :fullscreen="fullscreen"
        :page-size="pageSize"
        :total-pages="totalPages"
        :selectable="selectable" />`,
    },
    {
      props: {
        fullscreen: opts.fullscreen ?? false,
        pageSize: opts.pageSize ?? 10,
        totalPages: tp,
        selectable: opts.selectable ?? false,
      },
    },
  )
  await nextTick()
  return { w, setPage, currentPage }
}

describe('分页脚注组件', () => {
  it('只有一页时不渲染（单页分页条是纯噪音）', async () => {
    const { w } = await mountPagination({ totalPages: 1 })
    expect(w.find('.table-pagination').exists()).toBe(false)
    w.unmount()
  })

  it('pageSize=0（关掉分页）时不渲染', async () => {
    const { w } = await mountPagination({ pageSize: 0 })
    expect(w.find('.table-pagination').exists()).toBe(false)
    w.unmount()
  })

  it('全屏态不渲染分页（全屏是"看全部行"的场景）', async () => {
    const { w } = await mountPagination({ fullscreen: true })
    expect(w.find('.table-pagination').exists()).toBe(false)
    w.unmount()
  })

  it('第一页：上一页禁用、下一页可用；末页反之', async () => {
    const first = await mountPagination({ currentPage: 1 })
    const btns = first.w.findAll('.page-btn')
    expect(btns[0].attributes('disabled'), '第一页不能"上一页"').toBeDefined()
    expect(btns.at(-1)!.attributes('disabled'), '第一页可以"下一页"').toBeUndefined()
    first.w.unmount()

    const last = await mountPagination({ currentPage: 10 })
    const btns2 = last.w.findAll('.page-btn')
    expect(btns2[0].attributes('disabled')).toBeUndefined()
    expect(btns2.at(-1)!.attributes('disabled'), '末页不能"下一页"').toBeDefined()
    last.w.unmount()
  })

  it('点"下一页"跳 cp+1、点"上一页"跳 cp-1（不跳过头也不原地不动）', async () => {
    const { w, setPage, currentPage } = await mountPagination({ currentPage: 5 })
    // 用 aria-label 定位而不是 `btns[0]` / `btns.at(-1)` 的快照：
    // 翻页后页码列表会重渲染，旧快照的下标可能指向别的按钮。
    const next = () => w.findAll('.page-btn').at(-1)!
    const prev = () => w.findAll('.page-btn')[0]

    await next().trigger('click')
    expect(setPage, '下一页 = 当前页 + 1').toHaveBeenLastCalledWith(6)
    expect(currentPage.value).toBe(6)
    await nextTick()

    // 上一页基于**翻页后的当前页**（6）→ 应是 5，不是 4。
    // 第一版用例在这里断言 4，把"模板里读的是响应式当前页"误当成"读的是旧值"。
    await prev().trigger('click')
    expect(setPage, '上一页 = 翻页后的当前页 - 1').toHaveBeenLastCalledWith(5)
    expect(currentPage.value).toBe(5)
    w.unmount()
  })

  it('点具体页码跳到那一页；当前页带 active 类', async () => {
    const { w, setPage } = await mountPagination({ currentPage: 5 })
    const active = w.find('.page-btn.active')
    expect(active.text()).toBe('5')
    // 找到页码为 6 的按钮（跳过"上一页"与省略号）
    const six = w.findAll('.page-btn').find((b) => b.text() === '6')
    expect(six, '当前页附近的页码要可点').toBeTruthy()
    await six!.trigger('click')
    expect(setPage).toHaveBeenLastCalledWith(6)
    w.unmount()
  })

  it('省略号渲染成不可点的 span（不是按钮）', async () => {
    const { w } = await mountPagination({ currentPage: 5 })
    const dots = w.findAll('.page-ellipsis')
    expect(dots.length, '中段两侧各一个省略号').toBe(2)
    for (const d of dots) expect(d.element.tagName.toLowerCase()).toBe('span')
    w.unmount()
  })

  it('可选中 + 已选若干行时显示"已选 N 行"；未选中时不显示', async () => {
    const some = await mountPagination({ selectable: true, selected: ['a', 'b'] })
    expect(some.w.find('.pagination-status').text()).toContain('2')
    some.w.unmount()

    const none = await mountPagination({ selectable: true, selected: [] })
    expect(none.w.find('.pagination-status').text()).not.toContain('已选')
    none.w.unmount()

    // 不可选中的表格即使 selectedKeys 有残留也不该显示"已选"
    const notSelectable = await mountPagination({ selectable: false, selected: ['a'] })
    expect(notSelectable.w.find('.pagination-status').text()).not.toContain('已选')
    notSelectable.w.unmount()
  })

  it('上一页/下一页按钮有 aria-label（图标按钮没有文字，读屏只能靠它）', async () => {
    const { w } = await mountPagination({ currentPage: 5 })
    const btns = w.findAll('.page-btn')
    expect(btns[0].attributes('aria-label')).toBeTruthy()
    expect(btns.at(-1)!.attributes('aria-label')).toBeTruthy()
    w.unmount()
  })
})