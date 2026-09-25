// buildTsv 纯函数锁定：TSV 构建器 + 公式注入防护（CSV 注入的 TSV 变体）
// 背景：逻辑原在 DataTable.copyTableData 内联（jsdom e2e 之外零直接单测），
// 下沉 useTableScreenshot.ts 后以纯函数形态锁定。
import { describe, it, expect } from 'vitest'
import { buildTsv } from '@/components/data/composables/useTableScreenshot'

describe('buildTsv · 公式注入防护', () => {
  // 用整行相等断言：含制表符/换行的单元格会让 split 恢复法失真（TSV 中原样保留属既有语义）
  it.each([
    ['=HYPERLINK("http://evil")'],
    ['+SUM(A1)'],
    ['-1+1'],
    ['@cmd'],
    ['\tx'],
    ['\r\nx'],
  ])('危险开头加单引号前缀：%j', (cell) => {
    const out = buildTsv(['列'], [[cell]])
    expect(out.startsWith('列\n')).toBe(true)
    // 含换行/制表符的内容会让行切分失真，用「包含加前缀后的原值」断言
    expect(out).toContain(`'${cell}`)
  })

  it('普通值与含危险字符但不居首的值不加前缀', () => {
    const out = buildTsv(['列'], [['正常值'], ['a=b'], ['金额-100'], ['x@y']])
    expect(out.split('\n').slice(1).map((r) => r.split('\t')[0])).toEqual(['正常值', 'a=b', '金额-100', 'x@y'])
  })

  it('空串不误伤；多列行内对齐；表头不加防护（列名非用户数据）', () => {
    const out = buildTsv(['名=称', '值'], [['', 'a'], ['=x', 'b']])
    const [header, r1, r2] = out.split('\n')
    expect(header).toBe('名=称\t值')
    expect(r1).toBe('\ta')
    expect(r2).toBe("'=x\tb")
  })

  it('整体可被 Excel 语义解析：行数/列数守恒', () => {
    const header = ['a', 'b', 'c']
    const rows = Array.from({ length: 5 }, (_, i) => ['x', `=p${i}`, ''])
    const out = buildTsv(header, rows)
    const lines = out.split('\n')
    expect(lines).toHaveLength(6)
    expect(lines[0].split('\t')).toEqual(header)
    expect(lines.slice(1).every((l) => l.split('\t').length === 3)).toBe(true)
  })
})
