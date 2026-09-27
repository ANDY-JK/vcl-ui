// computePageButtons 单测 — 分页按钮序列纯函数（FormCollect 记录列表 / FormDataSummary 明细表共用，此前 >7 分支 0 覆盖）
import { describe, it, expect } from 'vitest'
import { computePageButtons } from '@/components/form/utils/pagination'

describe('computePageButtons', () => {
  it('总页数 ≤7：全量展示，无省略号', () => {
    expect(computePageButtons(1, 5)).toEqual([1, 2, 3, 4, 5])
    expect(computePageButtons(7, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('总页数 8 起走省略号算法：当前页居中时 首 + 邻域 + 尾 + 双省略号', () => {
    expect(computePageButtons(5, 10)).toEqual([1, -1, 4, 5, 6, -1, 10])
  })

  it('当前页靠前：邻域起点与首页之间有缺口才出左省略号，缺口页不得静默丢失', () => {
    // current=1：邻域 [2]，3~9 缺 → 右省略号
    expect(computePageButtons(1, 10)).toEqual([1, 2, -1, 10])
    // current=3：邻域 [2,3,4] 覆盖到首页无缺口，无左省略号
    expect(computePageButtons(3, 10)).toEqual([1, 2, 3, 4, -1, 10])
    // current=4：邻域 [3,4,5]，页码 2 被跳过 → 必须有左省略号（旧算法在此静默吞 2）
    expect(computePageButtons(4, 10)).toEqual([1, -1, 3, 4, 5, -1, 10])
  })

  it('当前页靠后：与右侧对称，缺口页不得静默丢失', () => {
    // current=10：邻域 [9]
    expect(computePageButtons(10, 10)).toEqual([1, -1, 9, 10])
    // current=8：邻域 [7,8,9] 覆盖到尾页，无右省略号
    expect(computePageButtons(8, 10)).toEqual([1, -1, 7, 8, 9, 10])
    // current=7：邻域 [6,7,8]，页码 9 被跳过 → 必须有右省略号（旧算法在此静默吞 9）
    expect(computePageButtons(7, 10)).toEqual([1, -1, 6, 7, 8, -1, 10])
  })

  it('双省略号只在两侧都有缺口时同时出现', () => {
    expect(computePageButtons(6, 12)).toEqual([1, -1, 5, 6, 7, -1, 12])
  })

  it('total=8 最小形态', () => {
    expect(computePageButtons(1, 8)).toEqual([1, 2, -1, 8])
    expect(computePageButtons(8, 8)).toEqual([1, -1, 7, 8])
  })
})
