/**
 * TimeColumns · 分钟 step 对齐与选择一致性（第 165 轮）
 *
 * 覆盖率实测该文件分支仅 42.1%、函数 44.4%（全库倒数第二）。它是 Select type="time" 的面板，
 * 而"分钟按 step 对齐"这段（`curM`）是**受保护逻辑**（文件头写明禁止删除对齐），
 * 但受保护 ≠ 不能修：本轮先证明它在一个常见 step 上会算出**列表里不存在的分钟**。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import TimeColumns from '@/components/form/date-panel/TimeColumns.vue'

function mountTc(props: Record<string, unknown> = {}) {
  return mount(TimeColumns, { props: { value: '10:30', format: 'HH:mm', step: 1, ...props } })
}

/** 第 n 列（0=时 1=分 2=秒）所有单元格文本 */
const colText = (w: ReturnType<typeof mountTc>, n: number) => {
  const cols = w.findAll('.tp-column')
  return cols[n].findAll('.tp-cell').map((c) => c.text())
}
const selectedText = (w: ReturnType<typeof mountTc>) => w.findAll('.tp-cell.selected').map((c) => c.text())

describe('TimeColumns · 分钟 step 对齐', () => {
  it('step=15：分钟列只列 0/15/30/45', () => {
    const w = mountTc({ step: 15 })
    expect(colText(w, 1)).toEqual(['00', '15', '30', '45'])
    w.unmount()
  })

  it('step=15 + value 10:30 → 选中 30（正好在步进点上）', () => {
    const w = mountTc({ step: 15, value: '10:30' })
    expect(selectedText(w)).toEqual(['10', '30'])
    w.unmount()
  })

  it('step=15 + value 10:37 → 对齐到最近的步进点 30（37 更近 30 而非 45）', () => {
    const w = mountTc({ step: 15, value: '10:37' })
    expect(selectedText(w)).toContain('30')
    w.unmount()
  })

  it('**step 不整除 60 且对齐结果超出末项时，选中值必须是列表里真实存在的分钟**', () => {
    // step=9 → 分钟列 [00,09,...,54]（末项 54）。value=10:59 → round(59/9)*9 = 63 → 夹到 59，
    // 而 59 不在这份列表里 → 界面上"没有任何分钟被选中"
    const w = mountTc({ step: 9, value: '10:59' })
    const list = colText(w, 1)
    const sel = selectedText(w)
    expect(list.includes('59'), '前置：59 本来就不该出现在 step=9 的列表里').toBe(false)
    const minuteSel = sel.find((s) => list.includes(s))
    expect(minuteSel, `分钟列没有任何选中项（选中值=${JSON.stringify(sel)}，列表末项=${list.at(-1)}）`).toBeTruthy()
    w.unmount()
  })

  it('对齐结果必须落在列表内：穷举 step 1..59 × value 分钟 0..59', () => {
    const bad: string[] = []
    for (const step of [2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 16, 17, 18, 19, 21, 22, 23, 24, 25, 26, 27, 28, 29, 31, 35, 40, 45]) {
      const w = mountTc({ step })
      const list = colText(w, 1)
      for (const m of [0, 1, 29, 30, 31, 44, 45, 55, 58, 59]) {
        const v = mountTc({ step, value: `10:${String(m).padStart(2, '0')}` })
        const sel = selectedText(v).find((s) => list.includes(s))
        if (!sel) bad.push(`step=${step} value=10:${String(m).padStart(2, '0')}`)
        v.unmount()
      }
      w.unmount()
    }
    expect(bad, `这些组合下分钟列没有选中项：${bad.slice(0, 8).join(' / ')}${bad.length > 8 ? ` …共 ${bad.length} 个` : ''}`).toEqual([])
  })

  it('step 为小数（2.5）→ 必须整数化为 2，列表不能出现半个分钟', () => {
    const w = mountTc({ step: 2.5 })
    const list = colText(w, 1)
    expect(list.every((x) => Number.isInteger(Number(x))), `非整数分钟项：${list.slice(0, 6).join(',')}`).toBe(true)
    expect(list[1], 'step 2.5 应退化为 2').toBe('02')
    w.unmount()
  })

  it('step 大于 59 时只有 00 一项可选（不崩、不渲染一堆）', () => {
    const w = mountTc({ step: 90 })
    expect(colText(w, 1)).toEqual(['00'])
    w.unmount()
  })

  it('step=0 / 负数 / NaN 退化为 step=1（不能除零或死循环）', () => {
    for (const step of [0, -5, Number.NaN]) {
      const w = mountTc({ step })
      expect(colText(w, 1).length, `step=${step} 应退化为 60 项`).toBe(60)
      w.unmount()
    }
  })
})

describe('TimeColumns · 选择输出与选中态', () => {
  it('点击分钟单元格 → emit 完整时间（含已选的时）', async () => {
    const w = mountTc({ value: '10:30', step: 15 })
    const minuteCol = w.findAll('.tp-column')[1]
    await minuteCol.findAll('.tp-cell')[3].trigger('click') // 45
    expect(w.emitted('select')?.at(-1)).toEqual(['10:45'])
    w.unmount()
  })

  it('点击小时单元格 → 保留原分钟（不把分钟清零）', async () => {
    const w = mountTc({ value: '10:30' })
    await w.findAll('.tp-column')[0].findAll('.tp-cell')[22].trigger('click') // 22 时
    expect(w.emitted('select')?.at(-1)).toEqual(['22:30'])
    w.unmount()
  })

  it('**输出必须与界面高亮一致**：step=15 + 值 10:37（高亮 30）→ 点"时"输出 22:30 而不是 22:37', async () => {
    const w = mountTc({ value: '10:37', step: 15 })
    expect(selectedText(w), '前置：界面高亮的是对齐后的 30').toContain('30')
    await w.findAll('.tp-column')[0].findAll('.tp-cell')[22].trigger('click')
    expect(w.emitted('select')?.at(-1), '输出与用户看到的不一致（看到 30 却提交 37）').toEqual(['22:30'])
    w.unmount()
  })

  it('format 含 ss → 渲染秒列，输出三段', async () => {
    const w = mountTc({ value: '10:30:45', format: 'HH:mm:ss' })
    expect(w.findAll('.tp-column').length).toBe(3)
    expect(selectedText(w)).toEqual(['10', '30', '45'])
    await w.findAll('.tp-column')[2].findAll('.tp-cell')[7].trigger('click')
    expect(w.emitted('select')?.at(-1)).toEqual(['10:30:07'])
    w.unmount()
  })

  it('值为空串 → 三列都选中 0（不出现 NaN 选中）', () => {
    const w = mountTc({ value: '', format: 'HH:mm:ss' })
    expect(selectedText(w)).toEqual(['00', '00', '00'])
    w.unmount()
  })

  it('值越界（99:99:99）→ 夹到 23:59:59 而不是 NaN', () => {
    const w = mountTc({ value: '99:99:99', format: 'HH:mm:ss' })
    expect(selectedText(w)).toEqual(['23', '59', '59'])
    w.unmount()
  })

  it('Enter / 空格也能选中（键盘可达）', async () => {
    const w = mountTc({ value: '10:30' })
    const hourCol = w.findAll('.tp-column')[0]
    await hourCol.findAll('.tp-cell')[5].trigger('keydown.enter')
    expect(w.emitted('select')?.at(-1)).toEqual(['05:30'])
    await hourCol.findAll('.tp-cell')[6].trigger('keydown.space')
    expect(w.emitted('select')?.at(-1)).toEqual(['06:30'])
    w.unmount()
  })

  it('空格键选中必须 preventDefault（否则面板会跟着页面滚动）', async () => {
    const w = mountTc({ value: '10:30' })
    const cell = w.findAll('.tp-column')[0].findAll('.tp-cell')[5]
    const evt = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    cell.element.dispatchEvent(evt)
    await nextTick()
    expect(evt.defaultPrevented, '空格没被 preventDefault → 会连带滚动页面').toBe(true)
    w.unmount()
  })

  it('value 变化后重新对齐到新值', async () => {
    const w = mountTc({ value: '10:30', step: 15 })
    expect(selectedText(w)).toEqual(['10', '30'])
    await w.setProps({ value: '18:45' })
    await nextTick()
    expect(selectedText(w)).toEqual(['18', '45'])
    w.unmount()
  })
})
