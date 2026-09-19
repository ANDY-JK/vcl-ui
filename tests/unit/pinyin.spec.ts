import { describe, it, expect } from 'vitest'
import { matchPinyin, createPinyinMatcher } from '@/components/_internal/usePinyinSearch'

describe('usePinyinSearch', () => {
  it('matchPinyin 空文本/空词返回 true', () => {
    expect(matchPinyin('', '')).toBe(true)
    expect(matchPinyin('北京', '')).toBe(true)
  })

  it('matchPinyin 拼音匹配', () => {
    expect(matchPinyin('北京', 'beijing')).toBe(true)
    expect(matchPinyin('北京', 'bj')).toBe(true)
  })

  it('matchPinyin 中文直接匹配', () => {
    expect(matchPinyin('北京', '北京')).toBe(true)
    expect(matchPinyin('北京', '上海')).toBe(false)
  })

  it('createPinyinMatcher 文本匹配', () => {
    const matcher = createPinyinMatcher(() => true)
    expect(matcher.match('北京', '北京')).toBe(true)
    // 首字母匹配（全拼带空格，首字母无空格）
    expect(matcher.match('北京', 'bj')).toBe(true)
    expect(matcher.match('北京', 'shanghai')).toBe(false)
  })

  it('createPinyinMatcher 禁用拼音时降级为纯文本', () => {
    const matcher = createPinyinMatcher(() => false)
    expect(matcher.match('北京', '北京')).toBe(true)
    expect(matcher.match('北京', 'beijing')).toBe(false)
  })

  it('getIndex 缓存 + clearCache 清空', () => {
    const matcher = createPinyinMatcher(() => true)
    const idx1 = matcher.getIndex('测试')
    const idx2 = matcher.getIndex('测试')
    expect(idx1).toBe(idx2) // 缓存命中同一引用
    matcher.clearCache()
    const idx3 = matcher.getIndex('测试')
    expect(idx3).not.toBe(idx1)
  })

  it('pruneCache 清理无效标签', () => {
    const matcher = createPinyinMatcher(() => true)
    matcher.getIndex('保留')
    matcher.getIndex('删除')
    matcher.pruneCache(new Set(['保留']))
    // 清理后 '删除' 的缓存被移除，重新匹配首字母仍能正确（shanchu 首字母 sc）
    expect(matcher.match('删除', 'sc')).toBe(true)
  })
})
