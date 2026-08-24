/**
 * usePinyinSearch — 统一的拼音搜索 composable
 *
 * 合并了 Select.vue 的缓存预计算方案和 DataTable utils.ts 的 matchPinyin 方案：
 * - createPinyinMatcher(): 返回带缓存的匹配器（适合选项列表场景，如 Select）
 * - matchPinyin(): 简单匹配函数（适合一次性搜索场景，如 DataTable 过滤）
 *
 * 底层依赖 pinyin-pro 的 pinyin() 和 match() 函数
 */
import { pinyin, match as pinyinMatch } from './pinyin-pro'
import { warnOnce } from './warnOnce'

export interface PinyinIndex {
  /** 全拼（无声调，小写） */
  full: string
  /** 首字母（无声调，小写，无空格） */
  first: string
}

/**
 * 简单拼音匹配（无缓存，适合一次性搜索）
 * 从 utils.ts matchPinyin 迁移
 */
export function matchPinyin(text: string, term: string): boolean {
  if (!text || !term) return true
  const lower = term.toLowerCase()
  try {
    return pinyinMatch(text, lower) !== null
  } catch {
    return text.toLowerCase().includes(lower)
  }
}

/**
 * 创建带缓存的拼音匹配器（适合选项列表场景）
 * 从 Select.vue getPinyinIndex/matchPinyinFast 迁移
 *
 * @param enabled 是否启用拼音（false 时降级为纯文本匹配）
 * @returns { match, clearCache, pruneCache }
 */
export function createPinyinMatcher(enabled: () => boolean) {
  const _cache = new Map<string, PinyinIndex>()

  /** 获取文本的拼音索引（带缓存） */
  function getIndex(text: string): PinyinIndex {
    if (!text) return { full: '', first: '' }
    const cached = _cache.get(text)
    if (cached) return cached
    let result: PinyinIndex
    if (!enabled()) {
      result = { full: text.toLowerCase(), first: '' }
    } else {
      try {
        // 去空格：pinyin() 输出 "zhang san"，搜索 "zhangsan" 时需无空格全拼
        const full = pinyin(text, { toneType: 'none', type: 'string' }).replace(/\s/g, '').toLowerCase()
        const first = pinyin(text, { pattern: 'first', toneType: 'none', type: 'string' })
          .replace(/\s/g, '')
          .toLowerCase()
        result = { full, first }
      } catch {
        warnOnce('usePinyinSearch', '拼音解析失败，已降级为普通搜索')
        result = { full: text.toLowerCase(), first: '' }
      }
    }
    _cache.set(text, result)
    return result
  }

  /** 快速拼音匹配（使用预计算索引） */
  function match(text: string, keyword: string): boolean {
    const lower = keyword.toLowerCase()
    if (text.toLowerCase().includes(lower)) return true
    if (!enabled()) return false
    const idx = getIndex(text)
    if (idx.full.includes(lower)) return true
    if (idx.first && idx.first.includes(lower)) return true
    return false
  }

  /** 清空全部缓存 */
  function clearCache(): void {
    _cache.clear()
  }

  /** 清理不在有效标签集合中的缓存项（防止内存泄漏） */
  function pruneCache(validLabels: Set<string>): void {
    for (const key of _cache.keys()) {
      if (!validLabels.has(key)) _cache.delete(key)
    }
  }

  return { match, getIndex, clearCache, pruneCache }
}
