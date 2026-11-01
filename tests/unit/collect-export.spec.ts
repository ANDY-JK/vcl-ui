/**
 * useCollectExport —— 从 FormCollect 抽出的 Excel 导出（TD-29 余量，第 60 轮）
 *
 * ## 为什么抽
 *
 * `FormCollect.vue` 长期贴着 form-builder 域止涨线（810）：改一次就触线。
 * #258 抽分享段、#265 抽记录弹窗段、本轮抽导出段。抽出本身是**行为不变的重构**，
 * 所以先靠既有集成用例（`form-collect-remaining` 里那两条导出失败/成功用例）兜底 ——
 * 实测确实抓到了我抽错的两处（i18n 键前缀 `formBuilder.` 应为 `fbd.`、成功提示 TTL 3000→2600）。
 *
 * ## 这里补的是纯函数层
 *
 * 集成用例覆盖"整条链路"，但摊平规则（数组/布尔/null/时间列）藏在 `buildExportRow` 里，
 * 单独测它比每次都起一个挂载更直接。
 */
import { describe, it, expect } from 'vitest'
import { buildExportRow, parseRecordTime, resolveExportColumns } from '@/components/form-builder/useCollectExport'
import type { DesignerField } from '@/components/form-builder/designer/types'

/** 简易翻译：直接返回 key，便于断言"用的是哪个键"而不是文案 */
const t = (key: string) => key

describe('buildExportRow · 摊平规则', () => {
  const cols = [
    { key: 'name', label: '姓名' },
    { key: 'tags', label: '标签' },
    { key: 'agree', label: '同意' },
    { key: 'memo', label: '备注' },
  ]

  it('首列固定是提交时间（用 i18n 键，不是硬编码文案）', () => {
    const row = buildExportRow({ time: '2026-11-01 10:00', data: {} }, [], t)
    // 可解析的时间写成 Date（Excel 里可排序/筛选，见 #303）
    const v = row['fbd.submittedAt']
    expect(v instanceof Date, `应为 Date，实际：${String(v)}`).toBe(true)
    expect((v as Date).getFullYear()).toBe(2026)
    expect((v as Date).getHours()).toBe(10)
  })

  it('**时间解析不出来时保留原字符串**（导出宁可少类型，不能丢内容）', () => {
    const row = buildExportRow({ time: '未知时间', data: {} }, [], t)
    expect(row['fbd.submittedAt']).toBe('未知时间')
  })

  it('**数组 → 逗号+空格连接**（checkbox/upload 多值）', () => {
    const row = buildExportRow({ time: '', data: { tags: ['甲', '乙', '丙'] } }, cols, t)
    expect(row['标签']).toBe('甲, 乙, 丙')
  })

  it('**布尔 → 是/否**（不是 true/false）', () => {
    expect(buildExportRow({ data: { agree: true } }, cols, t)['同意']).toBe('common.yes')
    expect(buildExportRow({ data: { agree: false } }, cols, t)['同意']).toBe('common.no')
  })

  it('**null / undefined → 空串**（不能让 Excel 里出现 "undefined"）', () => {
    const row = buildExportRow({ data: { memo: null, name: undefined } }, cols, t)
    expect(row['备注']).toBe('')
    expect(row['姓名']).toBe('')
  })

  it('其余类型原样透传（数字不被转成字符串）', () => {
    const row = buildExportRow({ data: { memo: 42 } }, cols, t)
    expect(row['备注']).toBe(42)
  })

  it('缺失的 time 落空串（不影响列结构）', () => {
    expect(buildExportRow({ data: {} }, [], t)['fbd.submittedAt']).toBe('')
  })
})

describe('resolveExportColumns · 列来源优先级', () => {
  const fields = [
    { id: 'n1', key: 'name', type: 'text', label: '姓名' },
    { id: 'n2', key: 'sep', type: 'divider', label: '分隔线' },
    { id: 'n3', key: 'age', type: 'number', label: '年龄' },
  ] as unknown as DesignerField[]

  it('**宿主给了 exportColumns 就用它**（即使字段里还有别的）', () => {
    const cols = resolveExportColumns(fields, [{ key: 'name', label: '姓名（自定义）' }])
    expect(cols).toEqual([{ key: 'name', label: '姓名（自定义）' }])
  })

  it('未给则按字段自动生成，且**过滤掉布局字段**', () => {
    const cols = resolveExportColumns(fields)
    expect(cols.map((c) => c.key)).toEqual(['name', 'age'])
    expect(cols[0]!.label).toBe('姓名')
  })

  it('空的 exportColumns 数组视为未给（回落到字段自动生成）', () => {
    expect(resolveExportColumns(fields, []).map((c) => c.key)).toEqual(['name', 'age'])
  })
})
/* ════════════════════════════════════════
 * 提交时间写成真正的日期单元格（#303）
 *
 * 收集页把 `time` 存成展示字符串（TD-94）。原样写进 Excel 就是**文本列**：
 * 排序按字典序（"2026/10/1" 排到 "2026/9/1" 前面）、筛选不认日期区间。
 * ════════════════════════════════════════ */
describe('parseRecordTime · 宽容解析', () => {
  it('标准展示格式（斜杠 / 空格分隔）', () => {
    const d = parseRecordTime('2026/8/23 14:30:00')!
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(7)
    expect(d.getDate()).toBe(23)
    expect(d.getHours()).toBe(14)
    expect(d.getMinutes()).toBe(30)
  })

  it('没有秒也能解析', () => {
    const d = parseRecordTime('2026-08-23 14:30')!
    expect(d.getMinutes()).toBe(30)
  })

  it('ISO 字符串走原生解析', () => {
    expect(parseRecordTime('2026-08-23T06:30:00.000Z')).toBeInstanceOf(Date)
  })

  it('空值与乱码返回 null（调用方回退原字符串）', () => {
    expect(parseRecordTime(undefined)).toBe(null)
    expect(parseRecordTime('')).toBe(null)
    expect(parseRecordTime('刚刚')).toBe(null)
  })
})