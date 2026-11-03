// 字段显示名去重：导出与导入共用的唯一口径（#305 / #400）
import { describe, it, expect } from 'vitest'
import { dedupeFieldLabels } from '@/components/form-builder/fieldLabels'
import { buildHeaderMap } from '@/components/form-builder/importRecords'

function labels(...names: string[]) {
  return dedupeFieldLabels(names.map((label, i) => ({ label, key: `k${i}` })))
}

describe('dedupeFieldLabels', () => {
  it('同名标签按出现顺序加序号', () => {
    expect(labels('姓名', '姓名', '姓名').map((c) => c.label)).toEqual(['姓名', '姓名 (2)', '姓名 (3)'])
  })

  it('不改动唯一名（导出/导入往返要稳定）', () => {
    expect(labels('姓名', '手机号').map((c) => c.label)).toEqual(['姓名', '手机号'])
  })

  it('只改 label，其余字段原样保留', () => {
    const out = dedupeFieldLabels([
      { label: '合计', key: 'a' },
      { label: '合计', key: 'b' },
    ])
    expect(out[1].key).toBe('b')
    expect(out[1].label).toBe('合计 (2)')
  })

  // #400：字段本来就叫「姓名 (2)」（上一次导出再导入很常见），此时再出现同名，
  // 旧实现会分配出第二个「姓名 (2)」→ 两列同名 → 导出静默覆盖一列（#304 复发）
  it('**序号要避开已被实体字段占用的名字**', () => {
    const out = labels('姓名', '姓名 (2)', '姓名')
    const names = out.map((c) => c.label)
    expect(new Set(names).size, `列名必须唯一，实际：${names.join(' / ')}`).toBe(3)
    expect(names, '已存在的那列保持原名').toContain('姓名 (2)')
  })

  it('唯一字段永远保住原名，重名的才顺延（往返稳定）', () => {
    // 「姓名 (2)」在这里是唯一字段 → 必须不动；两个「姓名」里的第二个顺延到 (3)
    const names = labels('姓名', '姓名', '姓名 (2)').map((c) => c.label)
    expect(names).toEqual(['姓名', '姓名 (3)', '姓名 (2)'])
  })

  it('**导出表头 → 导入映射**：去重后的每个表头都能反查回各自的 key', () => {
    const cols = labels('姓名', '姓名 (2)', '姓名')
    const map = buildHeaderMap(cols.map((c) => ({ key: c.key, label: c.label })))
    for (const c of cols) {
      expect(map[c.label], `表头「${c.label}」要映射回自己的 key`).toBe(c.key)
    }
  })
})