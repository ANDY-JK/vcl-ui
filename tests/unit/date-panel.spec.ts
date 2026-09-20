// DatePanel 行为锁定（Q4 后半·form 域）——日历网格构建、禁用规则、切月越年、范围高亮。
// DatePanel.vue 377 行此前 1.1% 覆盖（91 条语句几乎全裸奔），是 form 域最大单文件缺口。
// ⛔ 头注禁令（本地时区构造、display:contents 行包装）由本组变成可执行断言。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DatePanel from '@/components/form/date-panel/DatePanel.vue'
import { todayISO } from '@/components/form/utils/date-utils'

const SEP = { year: 2026, month: 9 } // 2026-09（9 月 1 日是周二）
const mountDP = (props = {}) => mount(DatePanel, { props: { modelMonth: SEP, ...props } })

const cellByIso = (w: ReturnType<typeof mountDP>, iso: string) => w.find(`[data-iso="${iso}"]`)

describe('DatePanel · 42 格日历构建', () => {
  it('固定 42 格，6 行 × 7 列', () => {
    const w = mountDP()
    expect(w.findAll('.dp-cell')).toHaveLength(42)
    expect(w.findAll('[role="row"]')).toHaveLength(6)
    expect(w.findAll('[role="gridcell"]')).toHaveLength(42)
  })

  it('当月 30 天全部在列，且标记为当前月', () => {
    const w = mountDP() // 2026-09 有 30 天
    const cur = w.findAll('.dp-cell').filter((c) => c.classes().includes('is-current') || !c.classes().includes('other-month'))
    expect(cur).toHaveLength(30)
    expect(cur.map((c) => c.text())).toEqual(Array.from({ length: 30 }, (_, i) => String(i + 1)))
  })

  it('前置补齐是上月（8 月）尾部：2026-09-01 是周二 → 补 2 天（8/30、8/31）', () => {
    const w = mountDP()
    const first = w.findAll('.dp-cell')[0]!
    const second = w.findAll('.dp-cell')[1]!
    expect(first.text()).toBe('30')
    expect(second.text()).toBe('31')
    expect(first.attributes('data-iso')).toBe('2026-08-30')
    expect(second.attributes('data-iso')).toBe('2026-08-31')
    expect(first.classes()).toContain('other-month')
  })

  it('后置补齐是下月（10 月）开头，补满 42 格', () => {
    const w = mountDP()
    const cells = w.findAll('.dp-cell')
    const last = cells[41]!
    // 2（前置）+ 30（当月）+ 10（后置）= 42 → 最后一个是 10-10
    expect(last.attributes('data-iso')).toBe('2026-10-10')
    expect(last.classes()).toContain('other-month')
  })

  it('本地时区口径：iso 与展示日一致，无 UTC 偏移（9/1 → 2026-09-01）', () => {
    const w = mountDP()
    expect(cellByIso(w, '2026-09-01').text()).toBe('1')
    expect(cellByIso(w, '2026-09-30').text()).toBe('30')
  })
})

describe('DatePanel · 禁用规则', () => {
  it('非当月格子一律禁用（disabled 属性 + 类）', () => {
    const w = mountDP()
    const other = w.findAll('.dp-cell').filter((c) => c.classes().includes('other-month'))
    expect(other.length).toBeGreaterThan(0)
    for (const c of other) {
      expect(c.attributes('disabled')).toBeDefined()
      expect(c.classes()).toContain('disabled')
    }
  })

  it('min/max 按 iso 字典序钳制当月格子', () => {
    const w = mountDP({ min: '2026-09-10', max: '2026-09-20' })
    expect(cellByIso(w, '2026-09-09').attributes('disabled')).toBeDefined()
    expect(cellByIso(w, '2026-09-10').attributes('disabled')).toBeUndefined()
    expect(cellByIso(w, '2026-09-20').attributes('disabled')).toBeUndefined()
    expect(cellByIso(w, '2026-09-21').attributes('disabled')).toBeDefined()
  })

  it('只传 min 或只传 max 时另一侧不钳', () => {
    const wMin = mountDP({ min: '2026-09-28' })
    expect(cellByIso(wMin, '2026-09-30').attributes('disabled')).toBeUndefined()
    const wMax = mountDP({ max: '2026-09-02' })
    expect(cellByIso(wMax, '2026-09-01').attributes('disabled')).toBeUndefined()
  })
})

describe('DatePanel · 切月与越年', () => {
  it('上/下月按钮 emit update:modelMonth', async () => {
    const w = mountDP()
    await w.find('.dp-nav-btn').trigger('click')
    expect(w.emitted('update:modelMonth')).toEqual([[{ year: 2026, month: 8 }]])
    await w.findAll('.dp-nav-btn')[1]!.trigger('click')
    expect(w.emitted('update:modelMonth')![1]).toEqual([{ year: 2026, month: 10 }])
  })

  it('1 月上翻 → 去年 12 月；12 月下翻 → 明年 1 月', async () => {
    const jan = mountDP({ modelMonth: { year: 2026, month: 1 } })
    await jan.find('.dp-nav-btn').trigger('click')
    expect(jan.emitted('update:modelMonth')![0]).toEqual([{ year: 2025, month: 12 }])

    const dec = mountDP({ modelMonth: { year: 2026, month: 12 } })
    await dec.findAll('.dp-nav-btn')[1]!.trigger('click')
    expect(dec.emitted('update:modelMonth')![0]).toEqual([{ year: 2027, month: 1 }])
  })
})

describe('DatePanel · 选中与悬停', () => {
  it('点可用格子 emit select（iso）；禁用格子不 emit', async () => {
    const w = mountDP()
    await cellByIso(w, '2026-09-15').trigger('click')
    expect(w.emitted('select')).toEqual([['2026-09-15']])

    const other = w.findAll('.dp-cell').filter((c) => c.classes().includes('other-month'))[0]!
    await other.trigger('click')
    expect(w.emitted('select')).toHaveLength(1) // 没有新增
  })

  it('单选模式：selected 格子带 selected 类与 aria-current=date', () => {
    const w = mountDP({ selected: '2026-09-15' })
    const c = cellByIso(w, '2026-09-15')
    expect(c.classes()).toContain('selected')
    expect(c.attributes('aria-current')).toBe('date')
    expect(cellByIso(w, '2026-09-16').classes()).not.toContain('selected')
  })

  it('范围模式：range-start/range-end 标记两端', () => {
    const w = mountDP({ range: true, selected: ['2026-09-10', '2026-09-20'] })
    expect(cellByIso(w, '2026-09-10').classes()).toContain('range-start')
    expect(cellByIso(w, '2026-09-20').classes()).toContain('range-end')
  })

  it('范围模式：区间内（不含两端）标 in-range；起点乱序时自动 lo/hi', () => {
    const w = mountDP({ range: true, selected: ['2026-09-15', '2026-09-10'] }) // 故意倒序
    expect(cellByIso(w, '2026-09-12').classes()).toContain('in-range')
    expect(cellByIso(w, '2026-09-10').classes()).not.toContain('in-range')
    expect(cellByIso(w, '2026-09-15').classes()).not.toContain('in-range')
    expect(cellByIso(w, '2026-09-09').classes()).not.toContain('in-range')
  })

  it('范围模式：终点未定时用 hoverEnd 预览区间', () => {
    const w = mountDP({ range: true, selected: ['2026-09-10'], hoverEnd: '2026-09-13' })
    expect(cellByIso(w, '2026-09-12').classes()).toContain('in-range')
    expect(cellByIso(w, '2026-09-14').classes()).not.toContain('in-range')
  })

  it('hover 只在范围模式且格子可用时 emit', async () => {
    const single = mountDP()
    await cellByIso(single, '2026-09-15').trigger('mouseenter')
    expect(single.emitted('hover')).toBeUndefined()

    const range = mountDP({ range: true })
    await cellByIso(range, '2026-09-15').trigger('mouseenter')
    expect(range.emitted('hover')).toEqual([['2026-09-15']])

    const other = range.findAll('.dp-cell').filter((c) => c.classes().includes('other-month'))[0]!
    await other.trigger('mouseenter')
    expect(range.emitted('hover')).toHaveLength(1) // 禁用格不 emit
  })
})

describe('DatePanel · 今天按钮', () => {
  it('点今天 emit 今天 iso（当月视图内）', async () => {
    const now = new Date()
    const w = mountDP({ modelMonth: { year: now.getFullYear(), month: now.getMonth() + 1 } })
    await w.find('.dp-today-btn').trigger('click')
    expect(w.emitted('select')).toEqual([[todayISO('YYYY-MM-DD')]])
  })

  it('今天不在 min/max 内 → 不 emit', async () => {
    const now = new Date()
    const iso = todayISO('YYYY-MM-DD')
    const w = mountDP({
      modelMonth: { year: now.getFullYear(), month: now.getMonth() + 1 },
      max: '2000-01-01', // 今天必然晚于 max
    })
    await w.find('.dp-today-btn').trigger('click')
    expect(w.emitted('select')).toBeUndefined()
    void iso
  })
})

describe('DatePanel · 无障碍语义', () => {
  it('grid/row/gridcell 三件套 + aria-label 含日期与星期', () => {
    const w = mountDP()
    expect(w.find('[role="grid"]').exists()).toBe(true)
    // 2026-09-01 是周二 → 星期表头下标 2（idx%7，网格从周日开始）
    const c = cellByIso(w, '2026-09-01')
    expect(c.attributes('aria-label')).toBe('2026-09-01 星期二')
  })

  it('actions 插槽渲染，footer 类随有无插槽切换', () => {
    const bare = mountDP()
    expect(bare.find('.dp-footer').classes()).toContain('dp-footer--center')
    const withActions = mount(DatePanel, {
      props: { modelMonth: SEP },
      slots: { actions: '<button class="my-action">确定</button>' },
    })
    expect(withActions.find('.dp-footer').classes()).toContain('dp-footer--actions')
    expect(withActions.find('.my-action').exists()).toBe(true)
  })
})
