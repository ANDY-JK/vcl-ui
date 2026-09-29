// P1-8 数据导入——解析/归一化/去重纯函数行为锁定测试
import { describe, it, expect } from 'vitest'
import {
  buildHeaderMap,
  parseCsvRecords,
  parseJsonRecords,
  normalizeRecords,
  dedupeRecords,
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
})

describe('parseJsonRecords', () => {
  it('解析 key 格式数组', () => {
    const recs = parseJsonRecords('[{"name":"张三","age":30}]')
    expect(recs).toEqual([{ name: '张三', age: 30 }])
  })

  it('非法 JSON 抛错', () => {
    expect(() => parseJsonRecords('not-json')).toThrow()
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
