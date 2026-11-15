// #481：`toSize` 的边界 —— 「数字补 px」的承诺在 NaN / 空白 / 前置小数点处断掉
//
// 症状：Chart.vue / BaseChart.vue 把 width/height 直接喂给 `:style`。
// 旧实现把非有限数字拼成 `NaNpx` / `Infinitypx`，把 `'-20'`、`.5`、`' 20 '`
// 原样返回 —— 这几种都是**浏览器会整条丢弃的无效 CSS 声明**：图表容器高度突然
// 变成 auto（图消失），且控制台没有任何警告。`NaN` 不是边缘输入：宿主写
// `parseFloat(config.height)` 或 `containerH - padding` 就能造出来。
//
// 文档承诺（docs-site/components/chart.md）：「数字 px 或 CSS 值」。
// 所以有限数字必须落成 px，非有限数字/空值必须回 fallback，其余 CSS 值原样透传。
import { describe, it, expect } from 'vitest'
import { toSize } from '@/components/chart/utils/chart-utils'

const F = '100%'

describe('toSize · 空值与非有限数字（#481）', () => {
  it.each([undefined, null, ''])('空值 %p → fallback', (v) => {
    expect(toSize(v as never, F)).toBe(F)
  })

  it('纯空白字符串 → fallback（旧实现返回 "   "，是无效 CSS）', () => {
    expect(toSize('   ', F)).toBe(F)
    expect(toSize('\t\n ', F)).toBe(F)
  })

  it.each([NaN, Infinity, -Infinity])('非有限数字 %p → fallback，不能拼出 NaNpx', (v) => {
    expect(toSize(v, F)).toBe(F)
  })

  it.each(['NaN', 'Infinity', '-Infinity'])('字符串形式的非有限数 %p → fallback', (v) => {
    expect(toSize(v, F)).toBe(F)
  })
})

describe('toSize · 数字一律补 px', () => {
  it.each([
    [20, '20px'],
    [0, '0px'],
    [12.5, '12.5px'],
    [-20, '-20px'],
  ])('number %p → %s', (v, want) => {
    expect(toSize(v, F)).toBe(want)
  })

  it.each([
    ['20', '20px'],
    ['12.5', '12.5px'],
    ['020', '20px'],
    ['.5', '0.5px'],
    ['-20', '-20px'],
    ['+8', '8px'],
  ])('纯数字字符串 %p → %s', (v, want) => {
    expect(toSize(v, F)).toBe(want)
  })

  it('带首尾空白的数字 → 去掉空白后补 px', () => {
    expect(toSize(' 20 ', F)).toBe('20px')
    expect(toSize('\t12.5\n', F)).toBe('12.5px')
  })
})

describe('toSize · CSS 值原样透传（不误改单位）', () => {
  it.each(['100%', 'auto', '20rem', 'calc(100% - 8px)', 'var(--chart-h)', 'clamp(280px, 50vh, 480px)'])(
    '%p 不变',
    (v) => {
      expect(toSize(v, F)).toBe(v)
    },
  )

  it('CSS 值首尾空白去掉（不影响语义，避免拼接出畸形值）', () => {
    expect(toSize('  100%  ', F)).toBe('100%')
    expect(toSize(' calc(100% - 8px) ', F)).toBe('calc(100% - 8px)')
  })

  it('fallback 原样返回（fallback 可以是复杂 CSS 值）', () => {
    expect(toSize(NaN, 'clamp(280px, 50vh, 480px)')).toBe('clamp(280px, 50vh, 480px)')
  })
})
