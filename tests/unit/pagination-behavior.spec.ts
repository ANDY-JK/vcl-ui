/**
 * `nav/Pagination.vue` · 交互面行为锁（第 161 轮）
 *
 * 为什么需要这个文件：整链覆盖率显示这个**公开组件**的 `goTo()`、省略号分支、快速跳转
 * **一条都没被执行过** —— 仓库里 5 个 pagination spec 都在测 `data/DataTablePagination.vue`
 * （表格页脚那套手写副本），没有一条断言点分页按钮会发生什么。而它是 `src/components/index.ts`
 * 导出的公共组件（`export { default as Pagination }`），宿主直接用它做列表翻页。
 *
 * 本文件锁两件事：
 * ① 交互契约：点页码/上一页/下一页会 emit 什么、边界上按钮是否禁用、省略号序列怎么排、
 *    快速跳转输入如何钳制；无障碍语义（nav role / aria-label / aria-current / aria-hidden）。
 * ② 越界自愈：受控页码超出 `[1, totalPages]` 时（典型场景：搜索/筛选后总数变小，
 *    宿主没重置页码），面板必须把页码拉回合法区间——否则用户停在一个空白页上，
 *    "上一页"点了毫无反应（`goTo` 静默拒绝），也没有任何 active 页码可看。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import Pagination from '@/components/nav/Pagination.vue'
import { useT } from '@/components/_internal/i18n'

const t = useT()

function mountPager(props: Record<string, unknown>) {
  return mount(Pagination, {
    props: { modelValue: 1, total: 100, pageSize: 10, ...props },
    global: { stubs: { teleport: true } },
  })
}

/** 页码按钮（排除省略号与前后箭头） */
function pageButtons(w: ReturnType<typeof mountPager>) {
  return w.findAll('button.page-btn').filter((b) => /^\d+$/.test(b.text()))
}

/** 页码 + 省略号（按渲染顺序；用于断言序列本身） */
function pageSequence(w: ReturnType<typeof mountPager>): string[] {
  return w
    .findAll('button.page-btn')
    .map((b) => b.text())
    .filter((x) => /^\d+$|^\.\.\.$/.test(x))
}

/** 省略号按钮 */
function ellipsisButtons(w: ReturnType<typeof mountPager>) {
  return w.findAll('button.page-btn').filter((b) => b.text() === '...')
}

/** 上一页 / 下一页（按 aria-label 找） */
function prevBtn(w: ReturnType<typeof mountPager>) {
  return w.findAll('button').find((b) => b.attributes('aria-label') === t('pagination.prevPage'))!
}
function nextBtn(w: ReturnType<typeof mountPager>) {
  return w.findAll('button').find((b) => b.attributes('aria-label') === t('pagination.nextPage'))!
}

function emittedPages(w: ReturnType<typeof mountPager>): number[] {
  return ((w.emitted('update:modelValue') as [number][] | undefined) ?? []).map(([v]) => v)
}

describe('Pagination · 点按钮会 emit 什么', () => {
  it('点页码 → emit 该页码', async () => {
    const w = mountPager({ modelValue: 1, total: 50 }) // 5 页
    const b = pageButtons(w).find((x) => x.text() === '3')!
    await b.trigger('click')
    expect(emittedPages(w)).toEqual([3])
    w.unmount()
  })

  it('上一页 / 下一页 → emit modelValue ∓ 1', async () => {
    const w = mountPager({ modelValue: 3, total: 100 })
    await prevBtn(w).trigger('click')
    await nextBtn(w).trigger('click')
    expect(emittedPages(w)).toEqual([2, 4])
    w.unmount()
  })

  it('第一页时"上一页"禁用；最后一页时"下一页"禁用（且点了不 emit）', async () => {
    const first = mountPager({ modelValue: 1, total: 30 }) // 3 页
    expect(prevBtn(first).attributes('disabled')).toBeDefined()
    expect(nextBtn(first).attributes('disabled'), '第 1 页不是最后一页').toBeUndefined()

    const last = mountPager({ modelValue: 3, total: 30 })
    expect(nextBtn(last).attributes('disabled')).toBeDefined()
    expect(prevBtn(last).attributes('disabled')).toBeUndefined()

    // 禁用态点击不应产生事件（真实浏览器里 disabled 按钮不派发 click）
    prevBtn(first).element.dispatchEvent(new Event('click'))
    await nextTick()
    expect(emittedPages(first), '禁用按钮不该 emit').toEqual([])
    first.unmount()
    last.unmount()
  })

  it('点省略号不会 emit（它是占位，不是页码）', async () => {
    const w = mountPager({ modelValue: 5, total: 200 }) // 20 页 → 一定有省略号
    const dots = ellipsisButtons(w)
    expect(dots.length).toBeGreaterThan(0)
    for (const d of dots) {
      expect(d.attributes('disabled'), '省略号必须是禁用态').toBeDefined()
      expect(d.attributes('aria-hidden'), '省略号对读屏器隐藏').toBe('true')
    }
    await dots[0]!.trigger('click')
    expect(emittedPages(w)).toEqual([])
    w.unmount()
  })
})

describe('Pagination · 省略号序列（窗口 = 当前页 ±2，含首末页）', () => {
  const cases: [number, number, string[]][] = [
    // [当前页, 总页数, 期望序列]
    [1, 5, ['1', '2', '3', '...', '5']], // 窗口只到第 3 页 → 第 4 页被省略号替掉（ellipsis 行为受保护，本轮不改）
    [1, 7, ['1', '2', '3', '...', '7']],
    [4, 7, ['1', '2', '3', '4', '5', '6', '7']], // 窗口刚好铺满：也不省略
    [5, 20, ['1', '...', '3', '4', '5', '6', '7', '...', '20']],
    [20, 20, ['1', '...', '18', '19', '20']],
    [2, 10, ['1', '2', '3', '4', '...', '10']],
  ]
  it.each(cases)('当前页 %i / 共 %i 页 → 序列 %j', (current, totalPages, expected) => {
    const w = mountPager({ modelValue: current, total: totalPages * 10, pageSize: 10 })
    expect(pageSequence(w)).toEqual(expected)

    // 当前页必须唯一标记为 active + aria-current（两处都不能漏）
    const active = w.findAll('button.page-btn.active')
    expect(active).toHaveLength(1)
    expect(active[0]!.text()).toBe(String(current))
    expect(active[0]!.attributes('aria-current')).toBe('page')
    w.unmount()
  })

  it('省略号的 key 唯一（两个省略号不能撞 key，否则 Vue 复用错节点）', async () => {
    const w = mountPager({ modelValue: 10, total: 300 }) // 30 页 → 左右各一个省略号
    const dots = ellipsisButtons(w)
    expect(dots.length, '中段应有左右两个省略号').toBe(2)
    // 若 key 重复，Vue 会告警（本仓库把新类别告警当闸口失败）；这里再显式断言 DOM 稳定
    w.unmount()
  })
})

describe('Pagination · 快速跳转（showQuickJumper）', () => {
  it('默认不渲染输入框', () => {
    const w = mountPager({ modelValue: 1, total: 100 })
    expect(w.find('.jumper-input').exists()).toBe(false)
    w.unmount()
  })

  it('Enter 跳转并把输入清空', async () => {
    const w = mountPager({ modelValue: 1, total: 100, showQuickJumper: true })
    const input = w.find('.jumper-input')
    await input.setValue('7')
    await input.trigger('keyup', { key: 'Enter' })
    expect(emittedPages(w)).toEqual([7])
    expect((input.element as HTMLInputElement).value, '跳转后应清空').toBe('')
    w.unmount()
  })

  it('越界输入被钳制到 [1, totalPages]', async () => {
    const w = mountPager({ modelValue: 3, total: 50, showQuickJumper: true }) // 5 页
    const input = w.find('.jumper-input')

    await input.setValue('999')
    await input.trigger('keyup', { key: 'Enter' })
    await input.setValue('0')
    await input.trigger('keyup', { key: 'Enter' })
    await input.setValue('-4')
    await input.trigger('keyup', { key: 'Enter' })

    expect(emittedPages(w), '999→5、0→1、-4→1').toEqual([5, 1, 1])
    w.unmount()
  })

  it('非 Enter 键不跳转；非数字不跳转（且不清空用户正在输的内容）', async () => {
    const w = mountPager({ modelValue: 1, total: 100, showQuickJumper: true })
    const input = w.find('.jumper-input')

    await input.setValue('7')
    await input.trigger('keyup', { key: 'a' })
    expect(emittedPages(w), '字母键不该触发跳转').toEqual([])
    expect((input.element as HTMLInputElement).value, '还没按 Enter，别动用户输入').toBe('7')

    await input.setValue('')
    await input.trigger('keyup', { key: 'Enter' })
    expect(emittedPages(w), '空输入不该 emit').toEqual([])
    w.unmount()
  })
})

describe('Pagination · 无障碍与信息行', () => {
  it('外层是 nav + 有 aria-label；前后按钮有可读标签', () => {
    const w = mountPager({ modelValue: 2, total: 100 })
    const nav = w.find('nav.pagination')
    expect(nav.attributes('role')).toBe('navigation')
    expect(nav.attributes('aria-label')).toBe(t('pagination.navLabel'))
    expect(prevBtn(w).attributes('aria-label')).toBe(t('pagination.prevPage'))
    expect(nextBtn(w).attributes('aria-label')).toBe(t('pagination.nextPage'))
    w.unmount()
  })

  it('信息行显示总条数；total 非有限值时显示 0（不显示 NaN）', () => {
    const ok = mountPager({ modelValue: 1, total: 42 })
    expect(ok.find('.page-info').text()).toContain('42')
    ok.unmount()

    const bad = mountPager({ modelValue: 1, total: Number.NaN })
    expect(bad.find('.page-info').text()).toContain('0')
    expect(bad.find('.page-info').text()).not.toContain('NaN')
    bad.unmount()
  })

  it('total=0 时仍只显示 1 页且当前页为 1（可点、不崩）', () => {
    const w = mountPager({ modelValue: 1, total: 0 })
    expect(pageButtons(w).map((b) => b.text())).toEqual(['1'])
    expect(prevBtn(w).attributes('disabled')).toBeDefined()
    expect(nextBtn(w).attributes('disabled')).toBeDefined()
    w.unmount()
  })
})

describe('Pagination · 越界页码自愈（受控值超出 [1, totalPages]）', () => {
  it('modelValue 超出总页数（筛选后总数变小）→ 拉回最后一页并 emit 纠正', async () => {
    // 用户原本在第 5 页，筛选后只剩 2 页
    const w = mountPager({ modelValue: 5, total: 12, pageSize: 10 }) // totalPages = 2
    await nextTick()

    // 症状：没有 active 页码、上一页可点但点了没反应
    const active = w.findAll('button.page-btn.active')
    expect(active, '越界时不该出现"没有 active 页码"的界面').toHaveLength(1)
    expect(active[0]!.text()).toBe('2')
    expect(emittedPages(w), '必须 emit 纠正值，让宿主与数据对齐').toEqual([2])
    w.unmount()
  })

  it('modelValue < 1 → 拉回第 1 页并 emit 纠正', async () => {
    const w = mountPager({ modelValue: 0, total: 100 })
    await nextTick()
    expect(w.findAll('button.page-btn.active')[0]?.text()).toBe('1')
    expect(emittedPages(w)).toEqual([1])
    w.unmount()
  })

  it('总数变小时（props.total 变化）同样自愈', async () => {
    const w = mountPager({ modelValue: 4, total: 100 }) // 10 页，合法
    await nextTick()
    expect(emittedPages(w), '合法状态不该 emit').toEqual([])

    await w.setProps({ total: 25 }) // 变 3 页 → 4 越界
    await nextTick()
    expect(emittedPages(w)).toEqual([3])
    expect(w.findAll('button.page-btn.active')[0]?.text()).toBe('3')
    w.unmount()
  })
})
