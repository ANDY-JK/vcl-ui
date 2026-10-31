// buildTsv 纯函数锁定：TSV 构建器 + 公式注入防护（CSV 注入的 TSV 变体）
// 背景：逻辑原在 DataTable.copyTableData 内联（jsdom e2e 之外零直接单测），
// 下沉 useTableScreenshot.ts 后以纯函数形态锁定。
import { describe, it, expect } from 'vitest'
import { buildTsv } from '@/components/data/composables/useTableScreenshot'

describe('buildTsv · 公式注入防护', () => {
  // 用整行相等断言：含制表符/换行的单元格先被清洗成空格（2026-10-31 起值内控制字符不保留）
  it.each([['=HYPERLINK("http://evil")'], ['+SUM(A1)'], ['-1+1'], ['@cmd'], ['\tx'], ['\r\nx']])(
    '危险开头加单引号前缀：%j',
    (cell) => {
      const out = buildTsv(['列'], [[cell]])
      expect(out.startsWith('列\n')).toBe(true)
      // 注入判定用**原始值**（\t/\r\n 打头即危险，控制字符打头的混淆风险同样要防）；
      // 前缀后的内容已被清洗（\t/\r\n → 空格）。=+-@ 打头 → `'原文`；控制字符打头 → `'清洗后`
      const startsDangerous = /^[=+\-@\t\r]/.test(cell)
      const cleaned = cell.replace(/[\t\r\n]+/g, ' ')
      expect(out).toContain(`'${startsDangerous && /^[=+\-@]/.test(cell) ? cell : cleaned}`)
    },
  )

  it('普通值与含危险字符但不居首的值不加前缀', () => {
    const out = buildTsv(['列'], [['正常值'], ['a=b'], ['金额-100'], ['x@y']])
    expect(
      out
        .split('\n')
        .slice(1)
        .map((r) => r.split('\t')[0]),
    ).toEqual(['正常值', 'a=b', '金额-100', 'x@y'])
  })

  it('空串不误伤；多列行内对齐；表头不加防护（列名非用户数据）', () => {
    const out = buildTsv(
      ['名=称', '值'],
      [
        ['', 'a'],
        ['=x', 'b'],
      ],
    )
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

  it('值内的换行/制表符被替换成空格（粘贴进 Excel 行列不错位）', () => {
    // 用户反馈"细节"类缺陷：col.render 可返回多行文本（"任务1\n任务2"），数据可含 \t ——
    // TSV 用 \t 分列、\n 分行，值里出现会让粘贴后后续列全部串行
    const out = buildTsv(['任\n务', '备注'], [['a\t1', '任务1\n任务2']])
    const lines = out.split('\n')
    expect(lines).toHaveLength(2) // 值内换行不再拆行
    expect(lines[0]).toBe('任 务\t备注') // 表头同样清洗
    expect(lines[1]).toBe('a 1\t任务1 任务2') // \t 与 \n 都变空格
  })

  it('控制字符打头的值：\t/\r 打头仍加注入前缀（清洗后内容不破坏行列）', () => {
    // 既有语义：注入判定用原始值，\t 与 \r 在危险打头正则里（= + - @ \t \r）；
    // \n 不在（历史口径）——清洗后 `\n=x` → ` =x` 不加前缀。三者清洗后的内容都不再含行列破坏符
    expect(buildTsv(['a'], [['\tx']]).split('\n')).toHaveLength(2)
    expect(buildTsv(['a'], [['\tx']]).split('\n')[1]).toBe("' x")
    expect(buildTsv(['a'], [['\r\n=x']]).split('\n')[1]).toBe("' =x")
    expect(buildTsv(['a'], [['\n=x']]).split('\n')[1]).toBe(' =x')
  })
})
