/**
 * 格式化函数的「用户可见文本卫生」全量扫描（TD-84 修法落地）
 *
 * ## 为什么需要这条
 *
 * TD-84 的形态是：`toChineseAmount(1e16)` 曾拼出 `壹undefined元整` —— 查表
 * `bigRadices[groups.length - 1 - i]` 越界取到 `undefined`，JS 不报错，
 * 这个字符串直接显示给用户。第 186 轮加了界，但**同类写法遍布各格式化函数**：
 * 单位表、量词表、星期/月份名、大写数字，任何一处索引越界都会把 `undefined`
 * 拼进用户可见文本。
 *
 * 所以这里不再逐个函数写"某个输入对不对"，而是做**一次全量扫描**：
 * 把 utils 里所有返回字符串的格式化函数拉出来，用一批极端输入（超大数/负数/
 * 非有限数/空值/超长串）各跑一遍，断言输出里不含
 * `undefined` / `NaN` / `[object Object]` / `Infinity`。
 *
 * 这条断言的价值在于**覆盖面**：将来新增一个查表拼接的函数，只要它被加进
 * PROBES，就会自动受这条约束；即使漏加，也提醒维护者"格式化输出必须是干净的
 * 用户可见文本"这一口径。
 */
import { describe, it, expect } from 'vitest'
import {
  formatNumber,
  formatMoney,
  formatSize,
  toChineseAmount,
  truncate,
  maskName,
  maskPhone,
  maskIdCard,
  formatRegion,
  formatRelativeTime,
  errMessage,
  escapeHtml,
  unescapeHtml,
  splitRegionDetail,
  parseRegion,
  sanitizeDownloadName,
} from '@/components/_internal/utils'

/** 用户可见文本里绝不能出现的片段 */
const DIRTY = /undefined|NaN|\[object Object\]|Infinity/

/** 数值类函数的极端输入：越界/非有限/精度边界/负数 */
const NUMERIC_EXTREMES: unknown[] = [
  0,
  -1,
  1,
  1e15,
  1e16,
  1e17,
  -1e16,
  Number.MAX_SAFE_INTEGER,
  Number.MAX_VALUE,
  Infinity,
  -Infinity,
  NaN,
  0.1 + 0.2,
]

/** 字符串/未知值类函数的极端输入 */
const VALUE_EXTREMES: unknown[] = ['', 'A', '张三', null, undefined, 123, {}, [], true]

interface Probe {
  name: string
  fn: (v: never) => unknown
  inputs: unknown[]
}

const PROBES: Probe[] = [
  { name: 'formatNumber', fn: (v: never) => formatNumber(v), inputs: NUMERIC_EXTREMES },
  { name: 'formatMoney', fn: (v: never) => formatMoney(v), inputs: NUMERIC_EXTREMES },
  { name: 'formatSize', fn: (v: never) => formatSize(v), inputs: NUMERIC_EXTREMES },
  { name: 'toChineseAmount', fn: (v: never) => toChineseAmount(v), inputs: NUMERIC_EXTREMES },
  { name: 'truncate', fn: (v: never) => truncate(v, 5), inputs: VALUE_EXTREMES },
  { name: 'maskName', fn: (v: never) => maskName(v), inputs: VALUE_EXTREMES },
  { name: 'maskPhone', fn: (v: never) => maskPhone(v), inputs: VALUE_EXTREMES },
  { name: 'maskIdCard', fn: (v: never) => maskIdCard(v), inputs: VALUE_EXTREMES },
  { name: 'formatRegion', fn: (v: never) => formatRegion(v), inputs: VALUE_EXTREMES },
  { name: 'errMessage', fn: (v: never) => errMessage(v), inputs: VALUE_EXTREMES },
  { name: 'formatRelativeTime', fn: (v: never) => formatRelativeTime(v), inputs: [0, -1, 1, null, undefined] },
]

describe('格式化函数输出卫生（TD-84 全量扫描）', () => {
  it.each(PROBES)('$name 对极端输入不产出 undefined/NaN 等脏片段', ({ fn, inputs }) => {
    for (const v of inputs) {
      let out: unknown
      try {
        out = fn(v as never)
      } catch (e) {
        // 抛错是可以接受的（比静默拼出脏文本好）；但不能抛完还被当成字符串用
        out = `THREW:${errMessage(e)}`
      }
      const s = String(out)
      expect(s, `${String(fn)}(${JSON.stringify(v)}) → ${JSON.stringify(s)} 含脏片段`).not.toMatch(DIRTY)
    }
  })

  it('toChineseAmount 的越界边界：1e16 起返回空串（不拼 undefined）', () => {
    // 第 186 轮修复的具体回归点，与上面的全量扫描形成"点 + 面"双层保护
    expect(toChineseAmount(1e16)).toBe('')
    expect(toChineseAmount(1e17)).toBe('')
    expect(toChineseAmount(9.999e15), '边界内应正常').not.toBe('')
  })
})

// ════════════════════════════════════════
// TD-85：头注释承诺"接受 unknown 输入" —— 非原始值不得泄漏 / 不得抛错
// ════════════════════════════════════════

/** 非原始值：这些**没有文本形态**，正确降级是空串，不是 `[object Object]` / `Symbol(x)` */
const NON_PRIMITIVES: [string, unknown][] = [
  ['对象', {}],
  ['数组', [1, 2]],
  ['Symbol', Symbol('x')],
  ['函数', () => 1],
  ['Boolean 对象', new Boolean(true)],
]

describe('TD-85 非原始值输入不让脏文本泄漏、也不抛错', () => {
  const fns: [string, (v: never) => unknown][] = [
    ['maskName', (v) => maskName(v)],
    ['maskPhone', (v) => maskPhone(v)],
    ['maskIdCard', (v) => maskIdCard(v)],
    ['truncate', (v) => truncate(v, 5)],
    ['escapeHtml', (v) => escapeHtml(v)],
    ['unescapeHtml', (v) => unescapeHtml(v)],
    ['formatRegion', (v) => formatRegion(v)],
    ['splitRegionDetail', (v) => splitRegionDetail(v)],
    ['parseRegion', (v) => parseRegion(v)],
    ['formatNumber', (v) => formatNumber(v)],
    ['formatMoney', (v) => formatMoney(v)],
    ['formatSize', (v) => formatSize(v)],
    ['toChineseAmount', (v) => toChineseAmount(v)],
    ['sanitizeDownloadName', (v) => sanitizeDownloadName(v)],
    ['formatRelativeTime', (v) => formatRelativeTime(v)],
    ['errMessage', (v) => errMessage(v)],
  ]

  it.each(fns)('$0：对象/数组/Symbol/函数输入不抛错、不产出脏片段', (name, fn) => {
    for (const [label, v] of NON_PRIMITIVES) {
      let out: unknown
      expect(
        () => {
          out = fn(v as never)
        },
        `${name}(${label}) 不该抛错（头注释承诺容错）`,
      ).not.toThrow()
      // 返回值可能是字符串或对象（parseRegion 返回结构体）：两种都要查
      const text = typeof out === 'string' ? out : JSON.stringify(out) ?? ''
      expect(text, `${name}(${label}) → ${text} 含脏片段`).not.toMatch(DIRTY)
      expect(text, `${name}(${label}) → ${text} 泄漏 Symbol`).not.toMatch(/Symbol\(/)
    }
  })

  it('toStr 语义：只有原始值才有文本形态（对象/数组/Symbol/函数 → 空串）', () => {
    // 这条是上面 16 个函数共同的地基：改坏它，上面的用例会成片红
    expect(truncate({}, 5), '对象无文本形态').toBe('')
    expect(truncate([1, 2], 5), '数组不拼成 "1,2"').toBe('')
    expect(escapeHtml({}), '对象不变成 [object Object]').toBe('')
    expect(truncate(12345, 3), '数字照常').toBe('123…')
    expect(truncate(true, 5), '布尔照常').toBe('true')
  })

  it('sanitizeDownloadName 作为下载守卫不抛错（原来对象输入 → name.replace is not a function）', () => {
    expect(sanitizeDownloadName({}), '对象 → 回落默认名').toBe('download')
    expect(sanitizeDownloadName([1]), '数组 → 回落默认名').toBe('download')
    expect(sanitizeDownloadName(undefined, 'file')).toBe('file')
    expect(sanitizeDownloadName('a/b:c'), '正常字符串照旧清洗').toBe('a_b_c')
  })
})