/**
 * 变异清单漂移诊断（#420）
 *
 * 现场：清单里的 `find` 是三行写法，提交钩子的 prettier 压成一行 → 闸口只报
 * 「目标片段出现 0 次」。这句话把**格式化**和**实现改了**混成同一个症状：
 * 前者只要把片段改成单行，后者才需要重写变异。当时的判断成本是多跑一次整链（第 10 步断）。
 *
 * 这里锁住三档诊断：exact / whitespace（只是写法变了）/ missing（实现真的改了）。
 */
import { describe, it, expect } from 'vitest'
import { normalizeFragment, diagnoseFragment } from '../../scripts/mutation-audit-fragments.mjs'

describe('diagnoseFragment', () => {
  it('逐字节命中 → exact（并给出次数）', () => {
    const src = 'const a = 1\nconst b = 2\n'
    expect(diagnoseFragment(src, 'const b = 2')).toEqual({ kind: 'exact', count: 1 })
  })

  it('**只差空白与行尾逗号 → whitespace，并给出源码原文**（本缺陷的现场）', () => {
    // 清单里是三行（prettier 多行时补的尾逗号），源码被单行化后尾逗号也没了
    const find = `result = [...result].sort(
  (a, b) => cmp(a, b),
)`
    const src = `if (x) {\n  result = [...result].sort((a, b) => cmp(a, b))\n}\n`
    const diag = diagnoseFragment(src, find)
    expect(diag.kind, '报 missing 会让人去查实现，其实只是写法变了').toBe('whitespace')
    // 建议必须是"能直接粘回清单"的源码原文，而不是归一后的变体
    expect(diag.suggestion).toBe('result = [...result].sort((a, b) => cmp(a, b))')
    expect(src.includes(diag.suggestion)).toBe(true)
    // 归一口径：空白与行尾逗号都不参与比较
    expect(normalizeFragment(find)).toBe(normalizeFragment(diag.suggestion))
  })

  it('实现真改了 → missing（折叠空白后也找不到）', () => {
    expect(diagnoseFragment('const a = 1\n', 'const gone = 2').kind).toBe('missing')
  })

  it('片段出现多次 → exact 且 count=2（调用方据此判"不唯一"）', () => {
    expect(diagnoseFragment('x(); x();', 'x();')).toEqual({ kind: 'exact', count: 2 })
  })

  it('空片段不误报 whitespace（`split(\'\')` 会把它变成"到处都有"）', () => {
    expect(diagnoseFragment('anything', '   \n  ').kind).toBe('missing')
  })
})
