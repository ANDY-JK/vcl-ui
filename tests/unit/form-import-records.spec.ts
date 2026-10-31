// P1-8 数据导入——解析/归一化/去重纯函数行为锁定测试
import { describe, it, expect } from 'vitest'
import {
  buildHeaderMap,
  parseCsvRecords,
  parseJsonRecords,
  normalizeRecords,
  dedupeRecords,
  readFileToRows,
  MAX_IMPORT_FILE_BYTES,
  ImportFileTooLargeError,
  type ImportField,
} from '@/components/form-builder/importRecords'
import type { CollectRecord } from '@/components/form-builder/designer/types'

function field(key: string, label: string, type = 'text'): ImportField {
  return { key, label, type }
}

describe('buildHeaderMap', () => {
  it('label 与 key 都映射到 field.key', () => {
    const map = buildHeaderMap([field('name', '姓名'), field('age', '年龄')])
    expect(map['姓名']).toBe('name')
    expect(map['name']).toBe('name')
    expect(map['年龄']).toBe('age')
  })
})

describe('parseCsvRecords', () => {
  it('解析含引号转义的表头+数据行', () => {
    const csv = '姓名,年龄\n张三,30\n"李,四",25\n'
    const rows = parseCsvRecords(csv)
    expect(rows).toEqual([
      ['姓名', '年龄'],
      ['张三', '30'],
      ['李,四', '25'],
    ])
  })

  it('忽略空行', () => {
    const rows = parseCsvRecords('a,b\n1,2\n\n3,4\n')
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ])
  })

  it('引号内的双引号按 "" 转义还原', () => {
    // 既有实现有这条分支，但从未被测试（CSV 标准转义）
    expect(parseCsvRecords('a\n"说 ""你好"""\n')).toEqual([['a'], ['说 "你好"']])
  })

  it('**只含 CR 换行的文件也按行切分**（老式导出常见；否则整份文件变成 1 行、静默导入 0 条）', () => {
    const rows = parseCsvRecords('姓名,年龄\r甲,30\r乙,25\r')
    expect(rows).toEqual([
      ['姓名', '年龄'],
      ['甲', '30'],
      ['乙', '25'],
    ])
  })

  it('CRLF 与 LF 混排同样按行切分', () => {
    const rows = parseCsvRecords('a,b\r\n1,2\n3,4\r\n')
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ])
  })
})

describe('parseJsonRecords', () => {
  it('解析 key 格式数组', () => {
    const recs = parseJsonRecords('[{"name":"张三","age":30}]')
    expect(recs).toEqual([{ name: '张三', age: 30 }])
  })

  it('非法 JSON 抛错', () => {
    expect(() => parseJsonRecords('not-json')).toThrow()
  })

  it('**容忍 UTF-8 BOM**（Windows 记事本 / PowerShell 导出的 JSON 默认带 BOM）', () => {
    const bom = '\uFEFF'
    expect(parseJsonRecords(bom + '[{"name":"甲"}]')).toEqual([{ name: '甲' }])
  })

  it('JSON 根节点不是数组 → 明确抛错（不是静默空结果）', () => {
    expect(() => parseJsonRecords('{"name":"甲"}')).toThrow()
  })
})

describe('normalizeRecords', () => {
  const fields = [field('name', '姓名'), field('tags', '标签', 'checkbox'), field('age', '年龄', 'number')]
  const headerMap = buildHeaderMap(fields)

  it('按表头映射到 key，只保留已知字段', () => {
    const rows = [
      ['姓名', '标签', '年龄', '未知列'],
      ['张三', 'a,b', '30', 'x'],
    ]
    const { records, invalid } = normalizeRecords(rows, headerMap, fields)
    expect(invalid).toBe(0)
    expect(records[0]).toEqual({ name: '张三', tags: ['a', 'b'], age: 30 })
  })

  it('数组字段（checkbox）按逗号拆分为数组', () => {
    const rows = [
      ['姓名', '标签'],
      ['李四', 'x; y'],
    ]
    const { records } = normalizeRecords(rows, headerMap, fields)
    expect(records[0].tags).toEqual(['x', 'y'])
  })

  it('number 字段转为数字', () => {
    const rows = [
      ['姓名', '年龄'],
      ['王五', '25'],
    ]
    const { records } = normalizeRecords(rows, headerMap, fields)
    expect(records[0].age).toBe(25)
  })

  it('**number 列只接受有限数：Infinity / 1e400 保留原串**（否则序列化成 null，静默丢值）', () => {
    const rows = [['年龄'], ['Infinity'], ['-Infinity'], ['1e400'], ['42']]
    const { records } = normalizeRecords(rows, headerMap, fields)
    expect(records.map((r) => r.age), '非有限数不该被转成数字').toEqual(['Infinity', '-Infinity', '1e400', 42])
    // 转成 ±Infinity 后 JSON.stringify 会写成 null —— 用户数据静默变成"空"
    expect(JSON.stringify(records[0])).toContain('Infinity')
  })

  it('全空行视为无效并计数', () => {
    const rows = [
      ['姓名', '标签', '年龄'],
      ['', '', ''],
    ]
    const { records, invalid } = normalizeRecords(rows, headerMap, fields)
    expect(records.length).toBe(0)
    expect(invalid).toBe(1)
  })
})

describe('dedupeRecords', () => {
  it('内容指纹去重：与已有记录重复的跳过', () => {
    const records: Record<string, unknown>[] = [
      { name: '张三', age: 30 },
      { name: '李四', age: 25 },
    ]
    const existing: CollectRecord[] = [{ id: 'r1', time: '2026-08-30 10:00', data: { name: '张三', age: 30 } }]
    const { toImport, skipped } = dedupeRecords(records, existing)
    expect(skipped).toBe(1)
    expect(toImport.map((r) => r.name)).toEqual(['李四'])
  })

  it('批量内部重复也只保留一条', () => {
    const records: Record<string, unknown>[] = [
      { name: '张三', age: 30 },
      { name: '张三', age: 30 },
    ]
    const { toImport, skipped } = dedupeRecords(records, [])
    expect(skipped).toBe(1)
    expect(toImport.length).toBe(1)
  })

  it('键顺序不同但内容相同视为重复', () => {
    const records: Record<string, unknown>[] = [{ age: 30, name: '张三' }]
    const existing: CollectRecord[] = [{ id: 'r1', time: 'x', data: { name: '张三', age: 30 } }]
    const { skipped } = dedupeRecords(records, existing)
    expect(skipped).toBe(1)
  })
})

// ════════════════════════════════════════
// TD-78：导入链路的另外三类真实文件形态（第 26 轮）
// ════════════════════════════════════════

describe('TD-78 ① 单元格内制表符', () => {
  it('TSV 另存 CSV 的 `a\\tb` 归一成空格（不原样入库，避免下游列错位）', () => {
    // 值里出现制表符没有合法语义（分列已由 CSV 逗号承担）；留着会原样入库，
    // 下游导出/打印时表现为列错位。
    const TAB = String.fromCharCode(9)
    const rows = [['姓名', '备注'], ['张三', 'a' + TAB + 'b']]
    const { records } = normalizeRecords(rows, buildHeaderMap([field('name', '姓名'), field('memo', '备注')]), [
      field('name', '姓名'),
      field('memo', '备注'),
    ])
    expect(records[0].memo, '制表符应变空格').toBe('a b')
    expect(records[0].name).toBe('张三')
  })

  it('引号内的多行文本不受影响（CSV 合法内容，不能一刀切清洗）', () => {
    const rows = parseCsvRecords('姓名,备注\n张三,"第一行\n第二行"')
    expect(rows[1][1], '换行应保留').toBe('第一行\n第二行')
  })
})

describe('TD-78 ② Excel 千分位数字', () => {
  const fields = [field('amount', '金额', 'number'), field('note', '备注')]
  const headerMap = buildHeaderMap(fields)

  it('严格千分位形态 `1,234` → 1234（不再原样保留成字符串）', () => {
    const { records } = normalizeRecords([['金额', '备注'], ['1,234', 'x']], headerMap, fields)
    expect(records[0].amount, '应转成数字 1234').toBe(1234)
  })

  it('负号与小数也认：`-1,234.56` → -1234.56', () => {
    const { records } = normalizeRecords([['金额', '备注'], ['-1,234.56', 'x']], headerMap, fields)
    expect(records[0].amount).toBe(-1234.56)
  })

  it('非千分位形态不剥（`1,2` 是真·多值/编码，不是数字）', () => {
    const { records } = normalizeRecords([['金额', '备注'], ['1,2', 'x']], headerMap, fields)
    expect(records[0].amount, '不应被当成 12').toBe('1,2')
  })

  it('普通数字不受影响', () => {
    const { records } = normalizeRecords([['金额', '备注'], ['1234', 'x']], headerMap, fields)
    expect(records[0].amount).toBe(1234)
  })
})

describe('TD-78 ③ 导入文件体量上限', () => {
  it('超过 5MB 抛 ImportFileTooLargeError（带 size 与 limit，宿主可提示）', async () => {
    const big = new File(['x'], 'big.csv')
    Object.defineProperty(big, 'size', { value: MAX_IMPORT_FILE_BYTES + 1 })
    await expect(readFileToRows(big, 'big.csv', [])).rejects.toBeInstanceOf(ImportFileTooLargeError)
    try {
      await readFileToRows(big, 'big.csv', [])
    } catch (e) {
      const err = e as ImportFileTooLargeError
      expect(err.size).toBe(MAX_IMPORT_FILE_BYTES + 1)
      expect(err.limit).toBe(MAX_IMPORT_FILE_BYTES)
    }
  })

  it('刚好等于上限的文件放行（边界不外扩）', async () => {
    const ok = new File(['a,b\n1,2'], 'ok.csv')
    Object.defineProperty(ok, 'size', { value: MAX_IMPORT_FILE_BYTES })
    const rows = await readFileToRows(ok, 'ok.csv', [])
    expect(rows.length).toBe(2)
  })
})

// ════════════════════════════════════════
// TD-83 同族：登记/映射早于校验 → 好数据被静默挤掉（第 36 轮）
// ════════════════════════════════════════

describe('#272 ① 字段 key 不得被别家 label 抢走', () => {
  it('表头写了某字段的 key，就该进那个字段（单趟写法会被后者的 label 覆盖）', () => {
    // A={key:memo,label:备注}、B={key:note,label:memo}
    // 单趟登记顺序：A.label→memo、A.key→memo、B.label→note、B.key→note
    //   ⇒ 'memo' 最终指向 note（A 的 key 被 B 的 label 抢走）
    // 两趟（label 先、key 后）⇒ 'memo' 稳定指向 memo
    const fields = [
      { key: 'memo', label: '备注', type: 'text' },
      { key: 'note', label: 'memo', type: 'text' },
    ]
    const map = buildHeaderMap(fields)
    expect(map['memo'], '表头 memo 应进 memo 字段').toBe('memo')
    expect(map['备注']).toBe('memo')
    expect(map['note']).toBe('note')
  })

  it('label 之间同名时后者覆盖（文档化行为，保持不变）', () => {
    const fields = [
      { key: 'a', label: '同名', type: 'text' },
      { key: 'b', label: '同名', type: 'text' },
    ]
    expect(buildHeaderMap(fields)['同名']).toBe('b')
  })
})

describe('#272 ② 重复表头不再静默覆盖，改为上报 + 保留第一列', () => {
  const fields = [field('name', '姓名'), field('memo', '备注')]
  const headerMap = buildHeaderMap(fields)

  it('CSV 两列都叫「备注」→ 保留第一列，并报出重复列名', () => {
    const rows = [
      ['姓名', '备注', '备注'],
      ['张三', '第一列备注', '第二列备注'],
    ]
    const { records, duplicateHeaders } = normalizeRecords(rows, headerMap, fields)
    expect(records[0].memo, '保留第一列（旧实现是后列覆盖前列）').toBe('第一列备注')
    expect(duplicateHeaders, '必须报出重复的列名').toEqual(['备注'])
  })

  it('三列同名 → 仍只保留第一列，重复名只报一次', () => {
    const rows = [
      ['备注', '备注', '备注'],
      ['一', '二', '三'],
    ]
    const { records, duplicateHeaders } = normalizeRecords(rows, headerMap, [field('memo', '备注')])
    expect(records[0].memo).toBe('一')
    expect(duplicateHeaders).toEqual(['备注'])
  })

  it('无重复表头 → duplicateHeaders 为空（不能误报）', () => {
    const rows = [
      ['姓名', '备注'],
      ['张三', 'x'],
    ]
    const { duplicateHeaders } = normalizeRecords(rows, headerMap, fields)
    expect(duplicateHeaders).toEqual([])
  })

  it('两列映射到同一字段（label 与 key 各写一次）也算重复', () => {
    // 表头「备注」与「memo」都指向 memo 字段
    const rows = [
      ['备注', 'memo'],
      ['来自 label', '来自 key'],
    ]
    const { records, duplicateHeaders } = normalizeRecords(rows, headerMap, fields)
    expect(records[0].memo, '保留靠前那列').toBe('来自 label')
    expect(duplicateHeaders, '按表头原文报出后者').toEqual(['memo'])
  })
})