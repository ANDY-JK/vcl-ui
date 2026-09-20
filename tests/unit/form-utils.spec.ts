// date-utils / slider-utils 行为锁定（Q4 后半·form 域）
// 这两个纯函数模块此前零单测（date-utils 10.5%、slider-utils 0%），却是 Select 的
// date/date-range/time 模式与 Slider 步进的公共地基——⛔ 头注已禁改，本组把禁改线
// 变成可执行断言：本地时区口径、浮点安全步进、钳制边界、平年/闰年判定。
import { describe, it, expect } from 'vitest'
import {
  pad2,
  formatDate,
  parseDate,
  isValidDate,
  todayISO,
  formatDateZh,
  formatDateTimeZh,
} from '@/components/form/utils/date-utils'
import { clamp, alignStep } from '@/components/form/utils/slider-utils'

describe('pad2', () => {
  it('单位数补零，十位以上原样', () => {
    expect(pad2(0)).toBe('00')
    expect(pad2(7)).toBe('07')
    expect(pad2(10)).toBe('10')
    expect(pad2(59)).toBe('59')
  })
})

describe('formatDate', () => {
  it('按 YYYY/MM/DD 占位符替换', () => {
    expect(formatDate(new Date(2026, 8, 5), 'YYYY-MM-DD')).toBe('2026-09-05')
    expect(formatDate(new Date(2026, 0, 1), 'YYYY/MM/DD')).toBe('2026/01/01')
  })

  it('保留格式串里的其他字符', () => {
    expect(formatDate(new Date(2026, 11, 31), 'YYYY年MM月DD日')).toBe('2026年12月31日')
  })
})

describe('parseDate', () => {
  it('按格式串切分并映射 Y/M/D', () => {
    expect(parseDate('2026-09-05', 'YYYY-MM-DD')).toEqual({ y: 2026, m: 9, d: 5 })
    expect(parseDate('05/09/2026', 'DD/MM/YYYY')).toEqual({ y: 2026, m: 9, d: 5 })
  })

  it('空串/无分隔符/段数不符 → null', () => {
    expect(parseDate('', 'YYYY-MM-DD')).toBeNull()
    expect(parseDate('20260905', 'YYYYMMDD')).toBeNull() // 无分隔符
    expect(parseDate('2026-09', 'YYYY-MM-DD')).toBeNull() // 段数不符
  })

  it('非数字段 → null', () => {
    expect(parseDate('abcd-09-05', 'YYYY-MM-DD')).toBeNull()
  })

  it('不校验真实日期（2024-02-31 也解析出数字，校验是 isValidDate 的职责）', () => {
    expect(parseDate('2024-02-31', 'YYYY-MM-DD')).toEqual({ y: 2024, m: 2, d: 31 })
  })
})

describe('isValidDate', () => {
  it('闰年 2 月 29 合法，平年非法', () => {
    expect(isValidDate(2024, 2, 29)).toBe(true)
    expect(isValidDate(2023, 2, 29)).toBe(false)
  })

  it('溢出日期非法（2/30、4/31、13 月、0 日）', () => {
    expect(isValidDate(2026, 2, 30)).toBe(false)
    expect(isValidDate(2026, 4, 31)).toBe(false)
    expect(isValidDate(2026, 13, 1)).toBe(false)
    expect(isValidDate(2026, 1, 0)).toBe(false)
  })

  it('非整数/越界年份非法', () => {
    expect(isValidDate(2026.5, 1, 1)).toBe(false)
    expect(isValidDate(0, 1, 1)).toBe(false)
  })

  it('0-99 年不被构造器映射到 1900+（setFullYear 口径）', () => {
    expect(isValidDate(24, 1, 1)).toBe(true)
    expect(isValidDate(99, 12, 31)).toBe(true)
  })
})

describe('todayISO', () => {
  it('按传入格式输出今天', () => {
    const now = new Date()
    expect(todayISO('YYYY-MM-DD')).toBe(formatDate(now, 'YYYY-MM-DD'))
  })
})

describe('中文展示格式化', () => {
  it('formatDateZh：zh-CN 短日期', () => {
    expect(formatDateZh(new Date(2026, 8, 5))).toBe('2026/9/5')
  })

  it('formatDateTimeZh：24 小时制含时间', () => {
    const s = formatDateTimeZh(new Date(2026, 8, 5, 14, 30, 0))
    expect(s).toContain('2026/9/5')
    expect(s).toContain('14:30:00')
    expect(s).not.toContain('下午')
  })
})

describe('clamp', () => {
  it('区间内原样，越界钳到边界', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-3, 0, 10)).toBe(0)
    expect(clamp(99, 0, 10)).toBe(10)
    expect(clamp(5, 5, 5)).toBe(5)
  })
})

describe('alignStep', () => {
  it('按 step 对齐到 min 起的整数倍', () => {
    expect(alignStep(23, 0, 100, 10)).toBe(20)
    expect(alignStep(25, 0, 100, 10)).toBe(30) // .5 向上取整
    expect(alignStep(7, 0, 100, 5)).toBe(5)
  })

  it('浮点边缘：0.35 在二进制下是 3.4999…，round 得 3 → 0.3（不是 0.4）', () => {
    // 这不是 bug 是契约：Math.round(0.35/0.1) = Math.round(3.4999999999999996) = 3。
    // 「修成 half-up」会让所有 .x5 边界值跳档，属破坏性变更——本断言锁住现状。
    expect(alignStep(0.35, 0, 1, 0.1)).toBeCloseTo(0.3, 10)
    expect(alignStep(0.31, 0, 1, 0.1)).toBeCloseTo(0.3, 10)
    expect(alignStep(0.5, 0, 1, 0.1)).toBeCloseTo(0.5, 10)
  })

  it('非零 min：步进从 min 起算', () => {
    expect(alignStep(17, 10, 30, 5)).toBe(15)
    expect(alignStep(12, 10, 30, 5)).toBe(10)
  })

  it('对齐后仍钳制在 [min, max]', () => {
    expect(alignStep(99, 0, 50, 10)).toBe(50)
    expect(alignStep(-5, 0, 50, 10)).toBe(0)
  })

  it('step<=0 按 1 处理（防除零/死循环）', () => {
    expect(alignStep(3.4, 0, 10, 0)).toBe(3)
    expect(alignStep(3.6, 0, 10, -2)).toBe(4)
  })
})
