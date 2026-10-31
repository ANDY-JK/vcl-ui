/**
 * 按「用户感知字符」切分/截断文本 —— 中文/emoji 场景的正确口径（2026-11-01 #277）
 *
 * ## 为什么不能用 `s.slice(0, n)`
 *
 * JS 字符串是 UTF-16 码元序列。`slice` 按**码元**切，于是：
 * - emoji（增补平面）占 2 个码元 → 切在中间会留下**孤立代理**（lone surrogate），
 *   渲染成豆腐块。实测 `truncate('😀😀😀😀', 1)` 得到 `"\ud83d…"`。
 * - ZWJ 组合 emoji（家庭 emoji）、带变体选择符/组合附加符的字符、旗帜（两码点组成）同理。
 * - 长度语义也会错：`'😀'.length === 2`，用户以为是一个字，程序算两个 ——
 *   于是"限 10 字"实际只能输 5 个 emoji。
 *
 * ## 口径
 *
 * 优先 `Intl.Segmenter`（按 **grapheme cluster**，与用户看到的"一个字"一致），
 * 环境不支持时退化为**按码点**（`Array.from(s)`）—— 仍不会切出孤立代理。
 * 两者对中文/英文结果相同；对 emoji 只在"组合字符算 1 还是 2"上有差别。
 */

/** 取字符分段器（惰性创建；环境不支持 Intl.Segmenter 时返回 null） */
let segmenter: Intl.Segmenter | null | undefined
function getSegmenter(): Intl.Segmenter | null {
  if (segmenter !== undefined) return segmenter
  try {
    segmenter =
      typeof Intl !== 'undefined' && 'Segmenter' in Intl
        ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
        : null
  } catch {
    segmenter = null
  }
  return segmenter
}

/**
 * 把字符串切成「用户感知字符」数组。
 *
 * 不会产生孤立代理（`Array.from(s)` 本身按码点迭代，安全）。
 */
export function toGraphemes(s: string): string[] {
  if (!s) return []
  const seg = getSegmenter()
  if (seg) return Array.from(seg.segment(s), (x) => x.segment)
  return Array.from(s)
}

/**
 * 按「用户感知字符」计数（`'😀'.length` 是 2，本函数返回 1）。
 *
 * 用于长度限制/字数统计：用户的"几个字"与这里一致。
 */
export function graphemeLength(s: string): number {
  return toGraphemes(s).length
}

/**
 * 截断到 n 个「用户感知字符」并追加后缀。
 *
 * 未超限时原样返回（不追加后缀）；n ≤ 0 视为"全部截掉"。
 */
export function truncateGraphemes(s: string, n: number, suffix = '…'): string {
  if (n <= 0) return s ? suffix : ''
  const units = toGraphemes(s)
  if (units.length <= n) return s
  return units.slice(0, n).join('') + suffix
}

/**
 * 从尾部逐个**字符**删除，直到 `fit()` 返回 true。
 *
 * 用于 canvas 文本宽度适配：按码元删除会留下孤立代理，
 * 导出的图里就是豆腐块。这里每次删一个用户感知字符。
 */
export function trimToFit(s: string, fit: (candidate: string) => boolean): string {
  const units = toGraphemes(s)
  for (let n = units.length; n > 0; n--) {
    const candidate = units.slice(0, n).join('')
    if (fit(candidate)) return candidate
  }
  return ''
}
