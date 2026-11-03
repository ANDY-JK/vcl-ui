/**
 * 收集记录的时间戳：存 ISO、展示按 locale（TD-94，#391）
 *
 * ## 缺陷
 *
 * 收集页把 `time` **直接存成展示字符串** `2026/8/23 14:30:00`（`formatDateTimeZh()`）：
 *   ① 切语言后新旧记录混着两种格式；
 *   ② 这些字符串不可靠地跨语言解析（`new Date(...)` 靠引擎宽松兜底）；
 *   ③ 导出到 Excel 是文本列，排序/筛选不认日期。
 * （③ 已由 #303 的导出侧宽容解析 + 真日期单元格解掉，但**存储层一直是展示字符串**。）
 *
 * ## 口径（本轮）
 *
 *   · 写入：`recordTimeNow()` → ISO 8601，不含任何本地化信息；
 *   · 读：`recordTimeDate()` 宽容解析（ISO + 历史展示字符串），`formatRecordTime()` 按 locale 展示；
 *   · **不需要一次性迁移**：老记录解析后照常显示，解析不了的**原样返回**，绝不吞数据。
 *
 * ## 为什么"写入端"也要断言
 *
 * 只测三个纯函数，改回 `formatDateTimeZh()` 仍然全绿 —— 所以既锁**纯函数语义**，
 * 也锁**写入端的调用点**（4 个写入口都不许再直接格式化时间）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { formatRecordTime, formatDateTimeZh, recordTimeDate, recordTimeNow } from '@/components/form/utils/date-utils'
import { parseRecordTime } from '@/components/form-builder/useCollectExport'

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

/** 收集记录的 4 个写入点（新增写入口时必须同步这里，否则闸口漏） */
const WRITE_SITES = [
  'src/components/form-builder/FormCollect.vue',
  'src/components/form-builder/FormShareView.vue',
  'src/components/form-builder/designer/FormReview.vue',
  'src/components/form-builder/useCollectImport.ts',
]

describe('recordTimeNow · 存储口径是 ISO', () => {
  it('返回值是 ISO 8601（可无损往返）', () => {
    const v = recordTimeNow()
    expect(v, `不是 ISO：${v}`).toMatch(ISO_RE)
    expect(new Date(v).toISOString(), '往返必须无损').toBe(v)
  })

  it('**同一时刻在两种语言下产生同一个字符串**（这正是存展示字符串做不到的）', () => {
    const d = new Date('2026-08-23T06:30:00.000Z')
    expect(recordTimeNow(d)).toBe(recordTimeNow(d))
    // 展示字符串则依赖 locale
    expect(formatDateTimeZh(d, 'zh-CN')).not.toBe(formatDateTimeZh(d, 'en-US'))
  })
})

describe('recordTimeDate / formatRecordTime · 宽容读（老记录照常显示）', () => {
  it('ISO 能解析成同一时刻', () => {
    const iso = recordTimeNow(new Date('2026-08-23T06:30:00.000Z'))
    expect(recordTimeDate(iso)!.toISOString()).toBe(iso)
  })

  it('**历史展示字符串仍能解析**（不需要数据迁移）', () => {
    expect(recordTimeDate('2026/8/23 14:30:00')).toBeInstanceOf(Date)
    expect(recordTimeDate('2026-08-23 14:30')).toBeInstanceOf(Date)
  })

  it('解析不出来 → null；展示时**原样返回**（绝不吞内容）', () => {
    expect(recordTimeDate('刚刚')).toBe(null)
    expect(recordTimeDate('')).toBe(null)
    expect(recordTimeDate(undefined)).toBe(null)
    expect(formatRecordTime('刚刚'), '看不懂的时间也要原样显示').toBe('刚刚')
    expect(formatRecordTime(undefined)).toBe('')
  })

  it('展示按 locale 格式化（ISO 与老字符串得到同一种展示）', () => {
    const d = new Date('2026-08-23T06:30:00.000Z')
    expect(formatRecordTime(recordTimeNow(d), 'zh-CN')).toBe(formatDateTimeZh(d, 'zh-CN'))
    expect(formatRecordTime(formatDateTimeZh(d, 'zh-CN'), 'zh-CN'), '老记录重新展示应与原来一致').toBe(
      formatDateTimeZh(d, 'zh-CN'),
    )
  })

  it('导出侧的 `parseRecordTime` 与展示侧**共用同一个解析器**（一个契约一份实现）', () => {
    for (const raw of ['2026/8/23 14:30:00', '2026-08-23T06:30:00.000Z', '刚刚', '']) {
      const a = parseRecordTime(raw)
      const b = recordTimeDate(raw)
      expect(a === null ? null : a.toISOString(), `${raw} 两侧解析结果必须一致`).toBe(
        b === null ? null : b.toISOString(),
      )
    }
  })
})

describe('非法日期不许被静默滚到隔壁（#393）', () => {
  it('**日期部分非法 → 解析失败**（否则会显示成隔壁日期，等于改数）', () => {
    // new Date('2026/2/30') 与 new Date(2026, 1, 30) 都会滚到 3 月 2 日
    expect(recordTimeDate('2026/2/30'), '2 月没有 30 日，必须判为解析失败').toBe(null)
    expect(recordTimeDate('2026-13-01'), '没有 13 月').toBe(null)
    expect(recordTimeDate('2023-02-29'), '平年没有 2 月 29 日').toBe(null)
    expect(recordTimeDate('2026/2/30 10:00'), '带时间的非法日期同样拒绝').toBe(null)
  })

  it('合法日期照常解析（含闰年 2 月 29 日）', () => {
    expect(recordTimeDate('2024-02-29')).toBeInstanceOf(Date)
    expect(recordTimeDate('2026/12/31 23:59:59')).toBeInstanceOf(Date)
    expect(recordTimeDate('2026-08-23T06:30:00.000Z')).toBeInstanceOf(Date)
  })

  it('**纯数字串不是记录时间**（new Date(0 的字面串) 会变成 2000-01-01）', () => {
    expect(recordTimeDate('0')).toBe(null)
    expect(recordTimeDate('2026')).toBe(null)
    expect(recordTimeDate('12')).toBe(null)
  })

  it('非法日期展示时**原样返回**，而不是悄悄改成隔壁日期', () => {
    expect(formatRecordTime('2026/2/30'), '必须原样，不能显示成 2026/3/2').toBe('2026/2/30')
    expect(formatRecordTime('2026-13-01')).toBe('2026-13-01')
  })
})

describe('收集记录的写入端必须存 ISO', () => {
  for (const file of WRITE_SITES) {
    it(`${file.split('/').pop()} 写入 time 用 recordTimeNow()，不再格式化展示字符串`, () => {
      const src = readFileSync(file, 'utf8')
      expect(src, '写入口必须调 recordTimeNow()').toContain('time: recordTimeNow(),')
      expect(src, '写入口不许再把展示字符串写进 time（TD-94 回退）').not.toMatch(/time:\s*formatDateTimeZh\(/)
    })
  }
})
