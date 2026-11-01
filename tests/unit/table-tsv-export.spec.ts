// buildTsv 纯函数锁定：TSV 构建器 + 公式注入防护（CSV 注入的 TSV 变体）
// 背景：逻辑原在 DataTable.copyTableData 内联（jsdom e2e 之外零直接单测），
// 下沉 useTableScreenshot.ts 后以纯函数形态锁定。
import { describe, it, expect } from 'vitest'
import { buildTsv } from '@/components/data/composables/useTableScreenshot'

describe('buildTsv · 公式注入防护', () => {
  // 口径（#282）：**先清洗控制字符、再判公式前缀** —— 清洗后以空格开头的内容 Excel 按文本处理，
  // 不需要再加引号前缀；清洗后仍以 `= + - @` 打头的才加。
  it.each([['=HYPERLINK("http://evil")'], ['+SUM(A1)'], ['-1+1'], ['@cmd']])(
    '清洗后仍危险的开头加单引号前缀：%j',
    (cell) => {
      const out = buildTsv(['列'], [[cell]])
      expect(out.startsWith('列\n')).toBe(true)
      expect(out).toContain(`'${cell}`)
    },
  )

  it.each([['\tx'], ['\r\nx'], ['\nx']])('控制字符打头：清洗成空格即安全，不加前缀：%j', (cell) => {
    const out = buildTsv(['列'], [[cell]])
    const value = out.split('\n')[1]!
    expect(value.startsWith(' '), '清洗后以空格开头').toBe(true)
    expect(value.startsWith("'"), '不应多出引号前缀').toBe(false)
  })

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

  it('控制字符打头的值：清洗后以空格开头，不再需要注入前缀', () => {
    // 口径变更（#282，收敛到 _internal/tabular-export）：**先清洗控制字符、再判公式前缀**。
    //
    // 旧口径用「原始值」判前缀，于是 \t / \r 打头会加 `'`，而它们清洗后本来就变成空格 ——
    // 前缀挡不住任何东西（Excel 见到前导空格就当文本），只是多出一个肉眼可见的引号；
    // 更不一致的是 \n 不在旧的危险正则里，`\n=x` 反而不加前缀。
    //
    // 新口径：控制字符一律先变空格 → 单元格以空格开头 → Excel 按文本处理，天然安全；
    // 真正需要防的是**清洗后仍以 `= + - @` 打头**的值，那种照样加前缀。
    expect(buildTsv(['a'], [['\tx']]).split('\n')).toHaveLength(2)
    expect(buildTsv(['a'], [['\tx']]).split('\n')[1]).toBe(' x')
    expect(buildTsv(['a'], [['\r\n=x']]).split('\n')[1]).toBe(' =x')
    expect(buildTsv(['a'], [['\n=x']]).split('\n')[1]).toBe(' =x')
    // 清洗后仍然危险的，必须加前缀
    expect(buildTsv(['a'], [['=x']]).split('\n')[1]).toBe("'=x")
    expect(buildTsv(['a'], [['\t=x']]).split('\n')[1]).toBe(' =x')
  })
})
