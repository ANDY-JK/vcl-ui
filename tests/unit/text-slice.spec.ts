// 按「用户感知字符」切分/截断（2026-11-01 #277）
//
// 缺陷背景：`truncate` 用 `s.slice(0, len)` 按 **UTF-16 码元**切。
// emoji 占 2 码元 → 切在中间会留下孤立代理（lone surrogate），渲染成豆腐块；
// `'😀'.length === 2` 还让"限 N 字"对 emoji 只能输一半。
// 同一口径问题另有两处：canvas 截断按码元逐个删、Avatar 首字母用 `s[0]`。
import { describe, it, expect } from 'vitest'
import { toGraphemes, graphemeLength, truncateGraphemes, trimToFit } from '@/components/_internal/text-slice'

/** 孤立代理 = 渲染成豆腐块的根源 */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/
const FAMILY = '👨‍👩‍👧‍👦'

describe('toGraphemes / graphemeLength', () => {
  it('emoji 算 1 个字符（`.length` 算 2 个）', () => {
    expect('😀'.length, '码元口径').toBe(2)
    expect(graphemeLength('😀'), '用户感知口径').toBe(1)
    expect(graphemeLength('😀😀😀')).toBe(3)
  })

  it('ZWJ 组合 emoji 整簇算 1 个', () => {
    expect(graphemeLength(FAMILY)).toBe(1)
    expect(toGraphemes(FAMILY + '家')).toEqual([FAMILY, '家'])
  })

  it('中文/英文/混排口径不变', () => {
    expect(graphemeLength('张三丰')).toBe(3)
    expect(graphemeLength('hello')).toBe(5)
    expect(graphemeLength('张三a😀')).toBe(4)
    expect(toGraphemes('')).toEqual([])
  })

  it('切出的每个单元都不含孤立代理', () => {
    for (const u of toGraphemes('😀a' + FAMILY + '张')) {
      expect(u, `单元 ${JSON.stringify(u)}`).not.toMatch(LONE_SURROGATE)
    }
  })
})

describe('truncateGraphemes', () => {
  it.each([1, 2, 3, 5, 7])('「😀😀😀😀」截 %i 字：不产生孤立代理', (n) => {
    const out = truncateGraphemes('😀😀😀😀', n)
    expect(out, `→ ${JSON.stringify(out)}`).not.toMatch(LONE_SURROGATE)
  })

  it('限 2 字保留 2 个 emoji（旧实现会切出半个）', () => {
    expect(truncateGraphemes('😀😀😀', 2)).toBe('😀😀…')
  })

  it('组合 emoji 不被切碎', () => {
    const out = truncateGraphemes(FAMILY + '家', 1)
    expect(out).toBe(FAMILY + '…')
    expect(out).not.toMatch(LONE_SURROGATE)
  })

  it('未超限原样返回（不追加后缀）', () => {
    expect(truncateGraphemes('张三', 3)).toBe('张三')
    expect(truncateGraphemes('😀', 1)).toBe('😀')
  })

  it('len ≤ 0：非空串只留后缀，空串保持空', () => {
    expect(truncateGraphemes('abc', 0)).toBe('…')
    expect(truncateGraphemes('', 0)).toBe('')
  })

  it('自定义后缀', () => {
    expect(truncateGraphemes('hello world', 5, '...')).toBe('hello...')
  })
})

describe('trimToFit（canvas 宽度适配）', () => {
  /** 模拟 ctx.measureText：按码点等宽 */
  const measure = (t: string): number => graphemeLength(t)

  it('**逐个字符删，不留半个 emoji**（旧实现 slice(0,-1) 按码元删）', () => {
    // '…' 本身占 1，budget = 5 → 最多留 4 个 emoji
    const out = trimToFit('😀😀😀😀😀😀', (c) => measure(c + '…') <= 5)
    expect(out, `→ ${JSON.stringify(out)}`).not.toMatch(LONE_SURROGATE)
    expect(measure(out), '结果不能超过预算').toBeLessThanOrEqual(4)
  })

  it('组合 emoji 作为整体保留或整体丢弃', () => {
    const out = trimToFit(FAMILY + FAMILY, (c) => measure(c) <= 1)
    expect(out, '只放得下 1 个就保留 1 个整簇').toBe(FAMILY)
  })

  it('全部放不下时返回空串（调用方据此只画省略号）', () => {
    expect(trimToFit('😀😀', () => false)).toBe('')
  })
})