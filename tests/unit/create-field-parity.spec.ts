// createField 的输出必须与注册表一致，且不得退化成"每建一个字段就把整张表翻译一遍"。
// 背景：createField 过去调 getFieldTypes()（全表 40 项 × 80 次 i18n 翻译再 find），
// 现改为按类型直查、只翻译这一条：同机实测直查约为整表翻译的 1/50。
// 下面的对账用例守的是"数量级回归"——慢到整表成本的 1/4 就红，不追精确倍数。
import { describe, it, expect } from 'vitest'
import { createField, getFieldTypes, type DesignerNodeType } from '@/components/form-builder/designer/types'

const table = getFieldTypes()

describe('createField 与注册表对账', () => {
  it('每个注册类型：标签取注册表翻译名，容器给 children、字段给 key', () => {
    table.forEach((m, i) => {
      const n = createField(m.type as DesignerNodeType, i)
      expect(n.type).toBe(m.type)
      expect(n.label).toBe(m.label)
      if (m.isContainer) {
        expect(n.children).toEqual([])
        expect(n.key).toBeUndefined()
      } else {
        expect(n.key).toBe(`field${i}`)
      }
    })
  })

  it('未注册类型不冒充别的字段：标签就是类型名本身，并按字段处理', () => {
    const n = createField('no-such-field-type' as DesignerNodeType, 7)
    expect(n.label).toBe('no-such-field-type')
    expect(n.key).toBe('field7')
  })

  it('建字段的单次成本不许回到"整表翻译"量级（对照同轮实测的整表成本）', () => {
    // 绝对毫秒在共享 CPU 上没有可比性：同一份实现，空跑实测 ≈20ms/500 次，
    // 和其余 128 个文件并行时被顶到 213ms —— 卡绝对阈值必然偶发红。
    // 这里改成跟"整表翻译"的**同轮**实测成本比：两者同受机器负载影响，比值才是稳定的事实。
    const CREATE_CALLS = 500
    const REF_CALLS = 50
    const REPEATS = 3
    const perCall = (fn: () => unknown, n: number) => {
      const from = process.hrtime.bigint()
      for (let i = 0; i < n; i++) fn()
      return Number(process.hrtime.bigint() - from) / 1e6 / n
    }
    const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[(xs.length - 1) >> 1]
    // 交错采样：两种成本在同一轮里各量一遍，这段时间机器变慢会同时抬高两边，
    // 单向漂移（先量完 A 再量 B）才不会变成比值差
    const createRuns: number[] = []
    const refRuns: number[] = []
    for (let k = 0; k <= REPEATS; k++) {
      const c = perCall(() => createField('text', 0), CREATE_CALLS)
      const r = perCall(getFieldTypes, REF_CALLS)
      if (k > 0) {
        createRuns.push(c)
        refRuns.push(r)
      } // 第 0 轮丢弃：首轮含 JIT 与 i18n 惰性初始化
    }
    const create = median(createRuns)
    const wholeTable = median(refRuns)
    // 退回旧实现（每次建字段先 getFieldTypes() 再 find）会让比值变成 ≥1：植入旧实现实测 1.17 → 红。
    // 直查/整表各自的绝对值在不同进程里就能差一倍（整表实测 1.4ms~3.1ms/次），所以两边必须同轮量。
    // 阈值放 4 倍而不是实测的 50 倍：这条守数量级回归，收紧了会被 GC 与负载抖动误报。
    expect(create, `createField ${create}ms/次 vs 整表翻译 ${wholeTable}ms/次`).toBeLessThan(wholeTable * 0.25)
  })
})
