// DataTable 的总页数公式今天有两份内联拷贝（useTableCore 与主文件），收进 calcTableTotalPages。
// 这条对账锁三件事：
//  ① 收口后与旧内联公式在全部正常入参上逐点相等 —— 零行为变化；
//  ② 退化入参要落到 1：pageSize<=0 是「关掉分页」的显式语义，total=NaN 不能把 NaN 递给页码列表；
//  ③ 与 nav/Pagination.vue 的 calcTotalPages 口径**不同且刻意不合**（那边把 pageSize<=0 当录入错误，
//     按每页 1 条夹紧 → totalPages=total），把差异写成断言，免得以后有人顺手"统一"掉。
import { describe, expect, it } from 'vitest'
import { calcTableTotalPages } from '@/components/data/composables/utils'
import { calcTotalPages } from '@/components/nav/utils/pagination-utils'

/** 收口前两处内联的公式，原样抄回来做逐点对账 */
const legacyInline = (total: number, pageSize: number) => {
  if (!pageSize || pageSize <= 0) return 1
  return Math.max(1, Math.ceil(total / pageSize))
}

describe('calcTableTotalPages 与旧内联公式对账', () => {
  it('正常入参逐点相等（收口零行为变化）', () => {
    for (const total of [0, 1, 9, 10, 11, 25, 99, 100, 101, 4999]) {
      for (const pageSize of [1, 5, 10, 20, 50, 100]) {
        expect(calcTableTotalPages(total, pageSize)).toBe(legacyInline(total, pageSize))
      }
    }
  })

  it('关掉分页（pageSize 为 0 / 负数 / 缺省）→ 1 页', () => {
    for (const pageSize of [0, -10, undefined, NaN]) {
      expect(calcTableTotalPages(100, pageSize)).toBe(1)
    }
  })

  it('total=NaN 兜到 1：旧内联会把 NaN 交给页码列表（displayPages 会渲染出一个 NaN 按钮）', () => {
    expect(Number.isNaN(legacyInline(NaN, 10))).toBe(true) // 前提：旧写法确实漏
    expect(calcTableTotalPages(NaN, 10)).toBe(1)
  })

  it('与 Pagination 口径的差异是刻意的，不是待统一的重复', () => {
    expect(calcTotalPages(100, 0)).toBe(100) // 那边：pageSize<=0 按每页 1 条夹紧
    expect(calcTableTotalPages(100, 0)).toBe(1) // 这边：pageSize<=0 = 不分页
    expect(calcTotalPages(100, 10)).toBe(calcTableTotalPages(100, 10)) // 正常入参两边同值
  })
})
