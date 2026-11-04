/**
 * useSelectDatePanel — Select 日期族面板逻辑（2026-10-23）
 *
 * ## 为什么补
 *
 * 185 行，完全没测。它是 Select.vue `date` / `date-range` / `time` 三种模式的
 * 全部编排逻辑（草稿态、modelValue 同步、选中/确认/取消）—— 纯逻辑易测，
 * 也是 Select.vue 136 条未覆盖的主要来源。
 *
 * ## 最该锁住的契约
 *
 *   ① **区间草稿三态机**：无起点 → 设起点；有起点无终点 → 设终点（且起 > 点时
 *      **自动交换**）；两端齐 → 重开新起点
 *   ② **确认时终点缺省 = 起点**（用户只点一天就点确认，区间是 [d, d] 不是报错）
 *   ③ **无起点时确认是 no-op**（不 emit 不关面板）
 *   ④ **三个 immediate watch 各管各的模式**：date 同步月份、range 同步草稿、
 *      time 同步草稿时间 —— 模式不匹配时不动作
 *   ⑤ **取消只关面板不 emit**（草稿丢弃，modelValue 不变）
 */
import { describe, it, expect, vi } from 'vitest'
import { ref, reactive, nextTick } from 'vue'
import { useSelectDatePanel } from '@/components/form/useSelectDatePanel'
import type { DatePanelProps } from '@/components/form/useSelectDatePanel'

function makeOpts(canWrite: () => boolean = () => true) {
  return {
    closePanel: vi.fn(),
    markTouched: vi.fn(),
    measureOptionRow: vi.fn(async () => {}),
    emit: vi.fn(),
    canWrite,
  }
}

function makePanel(type: string, modelValue: unknown = '', format?: string, opts: { canWrite?: () => boolean } = {}) {
  // ⚠️ props 必须 reactive：composable 里 watch(() => props.modelValue) 需要
  // 响应式源，普通对象改字段不会触发后续 watch（immediate 只吃到初值）
  const props = reactive<DatePanelProps>({
    type,
    modelValue,
    format,
    rangePlaceholder: ['开始日期', '结束日期'],
  }) as DatePanelProps
  const open = ref(false)
  const o = makeOpts(opts.canWrite)
  const panel = useSelectDatePanel(props, open, o)
  return { panel, open, o, props }
}

describe('类型标志与格式', () => {
  it('date → isDate=true，其余 false', () => {
    const { panel } = makePanel('date')
    expect(panel.isDate.value).toBe(true)
    expect(panel.isDateRange.value).toBe(false)
    expect(panel.isTime.value).toBe(false)
  })

  it('date-range → isDateRange=true', () => {
    const { panel } = makePanel('date-range')
    expect(panel.isDateRange.value).toBe(true)
  })

  it('time → isTime=true', () => {
    const { panel } = makePanel('time')
    expect(panel.isTime.value).toBe(true)
  })

  it('dateFmt：未传 format → 默认 YYYY-MM-DD', () => {
    const { panel } = makePanel('date')
    expect(panel.dateFmt.value).toBe('YYYY-MM-DD')
  })

  it('dateFmt：传了就用传入的', () => {
    const { panel } = makePanel('date', '', 'YYYY/MM/DD')
    expect(panel.dateFmt.value).toBe('YYYY/MM/DD')
  })
})

describe('triggerDisplayText / dateTimePlaceholder', () => {
  it('date：modelValue 字符串直出', () => {
    const { panel } = makePanel('date', '2026-05-01')
    expect(panel.triggerDisplayText.value).toBe('2026-05-01')
  })

  it('date：空值 → 空串', () => {
    const { panel } = makePanel('date', '')
    expect(panel.triggerDisplayText.value).toBe('')
  })

  it('**date-range：两端齐 → "起 ~ 止"**', () => {
    const { panel } = makePanel('date-range', ['2026-05-01', '2026-05-10'])
    expect(panel.triggerDisplayText.value).toBe('2026-05-01 ~ 2026-05-10')
  })

  it('date-range：只有一端 → 空串（不显示半截区间）', () => {
    const { panel } = makePanel('date-range', ['2026-05-01'])
    expect(panel.triggerDisplayText.value).toBe('')
  })

  it('date-range 占位符 = "起占位 ~ 止占位"', () => {
    const { panel } = makePanel('date-range', '')
    expect(panel.dateTimePlaceholder.value).toContain('开始日期')
    expect(panel.dateTimePlaceholder.value).toContain('~')
    expect(panel.dateTimePlaceholder.value).toContain('结束日期')
  })
})

describe('modelValue 的 immediate watch（按模式同步）', () => {
  it('**date：modelValue 变化 → modelMonth 跳到对应月份**', async () => {
    const { panel, props } = makePanel('date', '2026-03-15')
    await nextTick()
    expect(panel.modelMonth.value, '初始就该同步（immediate）').toEqual({ year: 2026, month: 3 })

    props.modelValue = '2025-11-20'
    await nextTick()
    expect(panel.modelMonth.value).toEqual({ year: 2025, month: 11 })
  })

  it('**date：解析失败（非法值）→ modelMonth 不动**', async () => {
    const { panel, props } = makePanel('date', '2026-03-15')
    await nextTick()
    const before = { ...panel.modelMonth.value }

    props.modelValue = '垃圾'
    await nextTick()
    expect(panel.modelMonth.value, '解析失败不该跳月').toEqual(before)
  })

  it('**date-range：modelValue 变化 → 草稿两端同步**', async () => {
    const { panel, props } = makePanel('date-range', '')
    await nextTick()

    props.modelValue = ['2026-01-05', '2026-01-20']
    await nextTick()
    expect(panel.draftStart.value).toBe('2026-01-05')
    expect(panel.draftEnd.value).toBe('2026-01-20')
    expect(panel.draftHover.value, '同步时清 hover').toBe('')
  })

  it('**time：modelValue 变化 → draftTime 同步**', async () => {
    const { panel, props } = makePanel('time', '')
    await nextTick()

    props.modelValue = '08:30'
    await nextTick()
    expect(panel.draftTime.value).toBe('08:30')
  })

  it('**模式不匹配时 watch 不动作**（date 的 watch 不处理 range 值）', async () => {
    const { panel, props } = makePanel('date', '')
    await nextTick()

    props.modelValue = ['2026-01-05', '2026-01-20'] // 传数组给 date 模式
    await nextTick()
    // date watch 走 parseDate(String(数组)) → 解析失败 → 不跳月
    expect(panel.draftStart.value, 'date 模式不该写 range 草稿').toBe('')
  })
})

describe('onDateSelect（单日期）', () => {
  it('**选中 → markTouched + 关面板 + emit 两个事件**', () => {
    const { panel, o } = makePanel('date', '')
    panel.onDateSelect('2026-06-01')

    expect(o.markTouched, '应标记 touched').toHaveBeenCalledTimes(1)
    expect(o.closePanel, '应关面板').toHaveBeenCalledTimes(1)
    expect(o.emit).toHaveBeenCalledWith('update:modelValue', '2026-06-01')
    expect(o.emit).toHaveBeenCalledWith('change', '2026-06-01')
  })
})

describe('onDateRangeClick（区间三态机）', () => {
  it('**无起点 → 设起点**', () => {
    const { panel } = makePanel('date-range', '')
    panel.onDateRangeClick('2026-05-01')
    expect(panel.draftStart.value).toBe('2026-05-01')
    expect(panel.draftEnd.value).toBe('')
  })

  it('**有起点无终点 → 设终点**', () => {
    const { panel } = makePanel('date-range', '')
    panel.onDateRangeClick('2026-05-01')
    panel.onDateRangeClick('2026-05-10')
    expect(panel.draftStart.value).toBe('2026-05-01')
    expect(panel.draftEnd.value).toBe('2026-05-10')
  })

  it('**点击早于起点 → 自动交换**（保证区间有序）', () => {
    const { panel } = makePanel('date-range', '')
    panel.onDateRangeClick('2026-05-10')
    panel.onDateRangeClick('2026-05-01') // 更早
    expect(panel.draftStart.value, '早的应成为起点').toBe('2026-05-01')
    expect(panel.draftEnd.value, '原起点成为终点').toBe('2026-05-10')
  })

  it('**两端齐后再点 → 重开新起点**（draftEnd 清空）', () => {
    const { panel } = makePanel('date-range', '')
    panel.onDateRangeClick('2026-05-01')
    panel.onDateRangeClick('2026-05-10')
    panel.onDateRangeClick('2026-06-01')
    expect(panel.draftStart.value, '应重开新起点').toBe('2026-06-01')
    expect(panel.draftEnd.value, '终点应清空').toBe('')
  })

  it('每次点击都清 draftHover', () => {
    const { panel } = makePanel('date-range', '')
    panel.onDateRangeClick('2026-05-01')
    panel.onDateRangeHover('2026-05-05')
    expect(panel.draftHover.value).toBe('2026-05-05')

    panel.onDateRangeClick('2026-05-10')
    expect(panel.draftHover.value, '点击后 hover 应清').toBe('')
  })
})

describe('onDateRangeHover', () => {
  it('**有起点无终点才记录 hover**（否则忽略）', () => {
    const { panel } = makePanel('date-range', '')
    panel.onDateRangeHover('2026-05-05')
    expect(panel.draftHover.value, '无起点不该记录').toBe('')

    panel.onDateRangeClick('2026-05-01')
    panel.onDateRangeHover('2026-05-05')
    expect(panel.draftHover.value).toBe('2026-05-05')

    panel.onDateRangeClick('2026-05-10')
    panel.onDateRangeHover('2026-05-15')
    expect(panel.draftHover.value, '两端齐后不该记录').toBe('')
  })
})

describe('onDateRangeConfirm', () => {
  it('**两端齐 → emit [起, 止] 并关面板**', () => {
    const { panel, o } = makePanel('date-range', '')
    panel.onDateRangeClick('2026-05-01')
    panel.onDateRangeClick('2026-05-10')
    panel.onDateRangeConfirm()

    expect(o.emit).toHaveBeenCalledWith('update:modelValue', ['2026-05-01', '2026-05-10'])
    expect(o.emit).toHaveBeenCalledWith('change', ['2026-05-01', '2026-05-10'])
    expect(o.closePanel).toHaveBeenCalledTimes(1)
    expect(o.markTouched).toHaveBeenCalledTimes(1)
  })

  it('**只点了起点就确认 → 终点缺省 = 起点**（单日区间 [d, d]）', () => {
    const { panel, o } = makePanel('date-range', '')
    panel.onDateRangeClick('2026-05-01')
    panel.onDateRangeConfirm()

    expect(o.emit).toHaveBeenCalledWith('update:modelValue', ['2026-05-01', '2026-05-01'])
  })

  it('**无起点 → no-op**（不 emit 不关面板）', () => {
    const { panel, o } = makePanel('date-range', '')
    panel.onDateRangeConfirm()

    expect(o.emit, '不该 emit').not.toHaveBeenCalled()
    expect(o.closePanel, '不该关面板').not.toHaveBeenCalled()
  })
})

describe('Time 模式', () => {
  it('onTimePick → 更新 draftTime（不 emit，等确认）', () => {
    const { panel, o } = makePanel('time', '')
    panel.onTimePick('09:15')
    expect(panel.draftTime.value).toBe('09:15')
    expect(o.emit, 'pick 阶段不该 emit').not.toHaveBeenCalled()
  })

  it('**onTimeConfirm → emit draftTime 并关面板**', () => {
    const { panel, o } = makePanel('time', '')
    panel.onTimePick('09:15')
    panel.onTimeConfirm()

    expect(o.emit).toHaveBeenCalledWith('update:modelValue', '09:15')
    expect(o.emit).toHaveBeenCalledWith('change', '09:15')
    expect(o.closePanel).toHaveBeenCalledTimes(1)
  })

  /* ── TD-90 / #427：写入口必须自己判 disabled ──────────────────────────
   * 面板打开后宿主把 disabled 翻成 true（校验失败、权限回收、提交中锁表单），
   * 模板上的「确定」按钮**仍在**（v-if 只覆盖"打开时已禁用"）——
   * 只靠界面隐藏挡不住，写入口必须自己判。*/
  it('**disabled 翻转后点确定：不落值，但仍关面板**（入口级守卫）', () => {
    let writable = true
    const { panel, o } = makePanel('time', '', undefined, { canWrite: () => writable })
    panel.onTimePick('09:15')
    writable = false // 面板开着时被禁用
    panel.onTimeConfirm()

    expect(o.emit, '禁用态下不能把草稿时间落库').not.toHaveBeenCalled()
    expect(o.markTouched, '没写入就不该标脏').not.toHaveBeenCalled()
    expect(o.closePanel, '照常关面板（点了确定却毫无反应更困惑）').toHaveBeenCalledTimes(1)
  })

  it('**可写时确定照常落值**（反向保护：守卫不能把正常路径一起拦掉）', () => {
    const { panel, o } = makePanel('time', '', undefined, { canWrite: () => true })
    panel.onTimePick('09:15')
    panel.onTimeConfirm()
    expect(o.emit).toHaveBeenCalledWith('update:modelValue', '09:15')
    expect(o.markTouched).toHaveBeenCalledTimes(1)
  })

  it('**onTimeCancel → 只关面板不 emit**（草稿丢弃）', () => {
    const { panel, o } = makePanel('time', '')
    panel.onTimePick('09:15')
    panel.onTimeCancel()

    expect(o.closePanel, '应关面板').toHaveBeenCalledTimes(1)
    expect(o.emit, '取消不该 emit').not.toHaveBeenCalled()
    expect(panel.draftTime.value, '草稿应保留（不回写）').toBe('09:15')
  })
})

describe('open watch（面板打开时）', () => {
  it('**非日期型 measureOptionRow；time 模式滚动到当前值**', async () => {
    const { open, o } = makePanel('time', '')
    // time 模式：不 measure，但会 scrollToValue（timeColumnsRef 为 null 时不炸）
    open.value = true
    await new Promise((r) => setTimeout(r, 20))
    expect(o.measureOptionRow, 'time 模式不测量行高').not.toHaveBeenCalled()
  })

  it('**非日期族（如 select）打开 → 只测量行高**', async () => {
    const { open, o } = makePanel('select', '')
    open.value = true
    await new Promise((r) => setTimeout(r, 20))
    expect(o.measureOptionRow, '非日期型应测量行高').toHaveBeenCalledTimes(1)
  })

  it('面板关闭 → 什么都不做', async () => {
    const { open, o } = makePanel('date', '')
    open.value = false
    await new Promise((r) => setTimeout(r, 20))
    expect(o.measureOptionRow).not.toHaveBeenCalled()
  })
})
