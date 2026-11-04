/**
 * 表格排序比较器（#419）
 *
 * 缺陷现场：`displayData` 原来把单元格先 `String(v ?? '')` 再比较。文本列没事，
 * **日期列**却是在按"星期几的英文名"排 —— `String(new Date('2026-01-02'))` 是
 * `'Fri Jan 02 2026 …'`。宿主传 `Date` 对象完全合法（`getCellText` 会格式化成 `YYYY-MM-DD`），
 * 于是用户点「按日期升序」，看到的是周内乱序，而数据一个字都没错。
 *
 * 这一组用例同时钉两件事：
 *   ① 新口径（日期/数字按值排、空值最小）；
 *   ② **反向保护** —— 既有行为不许被顺手改掉（数字、中文、空值位置、降序取反）。
 */
import { describe, it, expect } from 'vitest'
import { compareCellValues } from '@/components/data/composables/table-sort'

const sortBy = <T>(rows: T[], pick: (r: T) => unknown): T[] =>
  [...rows].sort((a, b) => compareCellValues(pick(a), pick(b)))

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

describe('compareCellValues · 日期（本缺陷的现场）', () => {
  const d = (month: number, day: number) => new Date(2026, month - 1, day) // 本地时区构造，避免 toISOString 的 UTC 位移

  it('**Date 对象按时间戳排，不按 String(Date) 排**', () => {
    const rows = [d(1, 2), d(1, 1), d(1, 3)]
    expect(sortBy(rows, (x) => x).map(ymd)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03'])
  })

  it('反证：按 `String(Date)` 排会得到"按星期几"的顺序（这就是原缺陷）', () => {
    const rows = [d(1, 2), d(1, 1)] // 1-02 是周五、1-01 是周四
    const legacy = [...rows].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))
    expect(legacy.map(ymd)[0], '旧实现真的把 1-02 排在 1-01 前面（按周五/周四）').toBe('2026-01-02')
    expect(sortBy(rows, (x) => x).map(ymd)[0]).toBe('2026-01-01')
  })

  it('非法日期当空值（NaN 参与比较会让排序失去传递性）', () => {
    const bad = new Date('nope')
    expect(compareCellValues(bad, d(1, 1))).toBe(-1)
    expect(compareCellValues(bad, bad)).toBe(0)
  })
})

describe('compareCellValues · 数字与文本', () => {
  it('number 与纯数字文本都按数值（9 < 10）', () => {
    expect(compareCellValues(9, 10)).toBeLessThan(0)
    expect(compareCellValues('9', '10')).toBeLessThan(0)
    expect(compareCellValues('-2', '1.5')).toBeLessThan(0)
  })

  it('相等返回 0（不是 -0/NaN）', () => {
    expect(compareCellValues(5, '5')).toBe(0)
    expect(Object.is(compareCellValues(5, 5), 0)).toBe(true)
  })

  it('中文按 locale 排（拼音序），不按码点排', () => {
    // 码点序：'张'(U+5F20) < '王'(U+738B) → 会返回负；拼音序（zh-CN 默认）：王(wang) < 张(zhang) → 正
    expect(compareCellValues('张三', '王五'), '返回负说明退回了码点比较').toBeGreaterThan(0)
  })

  it('**空值最小**（null/undefined/空串一视同仁）—— 既有用例依赖这条', () => {
    for (const empty of [null, undefined, '']) {
      expect(compareCellValues(empty, 0)).toBe(-1)
      expect(compareCellValues(empty, 'a')).toBe(-1)
      expect(compareCellValues(0, empty)).toBe(1)
      expect(compareCellValues(empty, empty)).toBe(0)
    }
  })

  it('混合类型（数 vs 文本）也有确定顺序，不会因为比较器返回 NaN 而抖', () => {
    const a = compareCellValues('abc', 2)
    const b = compareCellValues('abc', 2)
    expect(a).toBe(b)
    expect(Number.isFinite(a)).toBe(true)
  })

  it('布尔按 1/0 排（避免 true/false 的文本序反过来）', () => {
    expect(compareCellValues(false, true)).toBeLessThan(0)
  })

  it('bigint 按数值（String(10n) 与 9n 的文本序是错的）', () => {
    expect(compareCellValues(9n, 10n)).toBeLessThan(0)
  })
})
