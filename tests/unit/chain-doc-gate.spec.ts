/**
 * check:chain-doc 判据的负向对照
 *
 * 背景：README 里「快链 N 步 / 整链 N 步」是**手写数字**，`check:facts` 管不到它，
 * 历史上漂过两次（"6/27" → "18/43" → 实际 28/57）。这道闸口就是为了让它不再漂。
 *
 * 一个只会说"通过"的闸口等于没有，所以这里钉住三件事：
 *   1. 数字不对 → 必须红，且报出"写的是几、真源是几"
 *   2. 句子被改写/删掉 → 也必须红（观测点消失同样是缺陷，不能静默通过）
 *   3. 真源解析要吃得下 QUICK_STEPS 的两种写法（单行 + 跨行带注释）
 */
import { describe, expect, it } from 'vitest'
import { judgeChainDoc, readChainTruth } from '../../scripts/check-chain-doc.mjs'

const README_OK = `
1. **快链**：\`npm run quick-check\` —— **28 步 / 约 5 分钟**（…）
2. **整链**：\`npm run quality-check\` —— **57 步 / 约 23 分钟**（…）
`

describe('check:chain-doc · 判据', () => {
  it('数字与真源一致 → 通过', () => {
    const r = judgeChainDoc(README_OK, { quick: 28, all: 57 })
    expect(r.ok).toBe(true)
    expect(r.issues).toEqual([])
  })

  it('**步数写成旧值 → 红，且明确指出写的是几、真源是几**', () => {
    const stale = README_OK.replace('**28 步', '**18 步').replace('**57 步', '**43 步')
    const r = judgeChainDoc(stale, { quick: 28, all: 57 })
    expect(r.ok).toBe(false)
    expect(r.issues.join('\n')).toContain('快链 18 步')
    expect(r.issues.join('\n')).toContain('整链 43 步')
    expect(r.issues.join('\n')).toContain('真源是 **28** 步')
  })

  it('只错一档也要红（不能因为另一档对就放过）', () => {
    const r = judgeChainDoc(README_OK.replace('**57 步', '**56 步'), { quick: 28, all: 57 })
    expect(r.ok).toBe(false)
    expect(r.issues.length).toBe(1)
  })

  it('**句子被删掉 → 也红**（观测点消失不能静默通过）', () => {
    const r = judgeChainDoc('这里没有任何链步数的说法', { quick: 28, all: 57 })
    expect(r.ok).toBe(false)
    expect(r.issues.join('\n')).toContain('找不到')
  })
})

describe('check:chain-doc · 真源解析', () => {
  it('解析 STEPS（每步一行）与 QUICK_STEPS（单行 + 行内注释）', () => {
    const src = [
      'const STEPS = [',
      "  ['a', 'x'],",
      "  ['b', 'y'],",
      "  ['c', 'z'],",
      ']',
      "const QUICK_STEPS = ['a', 'b',",
      '  // 这是注释，里面的引号不该被算成条目',
      "  'c', 'd']",
    ].join('\n')
    expect(readChainTruth(src)).toEqual({ quick: 4, all: 3 })
  })

  it('块注释里的引号同样不计入', () => {
    const src = [`const QUICK_STEPS = [`, '  /*', "   * 说明：'这不是条目'", '   */', "  'a', 'b']"].join('\n')
    expect(readChainTruth(src).quick).toBe(2)
  })

  it('找不到数组 → 返回 null（CLI 会因此报错退出，而不是当成 0 步）', () => {
    expect(readChainTruth('const NOTHING = 1')).toEqual({ quick: null, all: null })
  })
})
