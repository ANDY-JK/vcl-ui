// check-doc-completeness 闸口的纯函数行为锁定（M6 回归防线）
// 夹具覆盖五类表的说明列判定；末条对全库生成产物做 0 断言（防回退的真锁）
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { findDocGaps } from '../../scripts/check-doc-completeness.mjs'

const md = (body) => `# 域\n\n## \`X\`\n\n${body}\n`

describe('findDocGaps：说明列空缺定位', () => {
  it('四类表说明齐全 → 0', () => {
    expect(
      findDocGaps(
        md(`### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| \`a\` | \`string\` | \`'x'\` | 否 | A 属性 |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| \`e\` | \`无\` | E 事件 |

### Slots

| 插槽 | 作用域参数 | 说明 | 兜底内容预览 |
| --- | --- | --- | --- |
| \`default\` | \`a, b\` | 默认槽 | \`{{ v }}\` |

## 组合式函数 / 工具导出

| 导出 | 说明 |
| --- | --- |
| \`u\` | U 工具 |`),
      ),
    ).toEqual([])
  })

  it('Props/Events/导出 的说明列为「—」各记一条，Slots 的兜底预览列允许「—」', () => {
    const gaps = findDocGaps(
      md(`### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| \`a\` | \`string\` | — | 否 | — |

### Events

| 事件 | 载荷 | 说明 |
| --- | --- | --- |
| \`e\` | \`无\` | — |

### Slots

| 插槽 | 作用域参数 | 说明 | 兜底内容预览 |
| --- | --- | --- | --- |
| \`s\` | — | — | — |

## 组合式函数 / 工具导出

| 导出 | 说明 |
| --- | --- |
| \`u\` | — |`),
    )
    expect(gaps).toEqual([
      { component: 'X', table: '属性', label: 'a' },
      { component: 'X', table: '事件', label: 'e' },
      { component: 'X', table: '插槽', label: 's' }, // 见下一断言：本条只验说明列判据
      { component: '组合式函数 / 工具导出', table: '导出', label: 'u' },
    ])
    // 兜底预览列的「—」不算；被记的 s 是说明列（第 3 列）为「—」
    expect(gaps.filter((g) => g.table === '插槽')).toHaveLength(1)
  })

  it('组件一览表（Props 数/Events 数/Slots 数）不参与检查', () => {
    expect(
      findDocGaps(
        md(
          `## 组件一览\n\n| 组件 | Props 数 | Events 数 | Slots 数 |\n| --- | --- | --- | --- |\n| \`X\` | 0 | 0 | 0 |`,
        ),
      ),
    ).toEqual([])
  })

  it('说明文字含转义竖线（\\|）不错位判定', () => {
    // Card type prop 的真实说明含「grid \\| stat」，切片若错位会把末列误判成「—」
    const gaps = findDocGaps(
      md(`### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| \`type\` | \`'grid' \\| 'stat'\` | \`'grid'\` | 否 | 模式：grid 内容卡片（默认）\\| stat 统计卡片 |`),
    )
    expect(gaps).toEqual([])
  })

  it('同一行多段缺口按行各记一条', () => {
    const gaps = findDocGaps(
      md(`### Props

| 属性 | 类型 | 默认值 | 必填 | 说明 |
| --- | --- | --- | --- | --- |
| \`a\` | \`string\` | — | 否 | — |
| \`b\` | \`string\` | — | 否 | — |`),
    )
    expect(gaps.map((g) => g.label)).toEqual(['a', 'b'])
  })
})

describe('回归锁：全库文档产物当前必须是 0 空缺', () => {
  it('docs-site/components 所有域 md 无说明列空缺', () => {
    const dir = path.join(process.cwd(), 'docs-site/components')
    let total = 0
    const where = []
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
      const gaps = findDocGaps(fs.readFileSync(path.join(dir, f), 'utf8'))
      total += gaps.length
      if (gaps.length) where.push(`${f}: ${gaps.map((g) => g.component + '.' + g.label).join(', ')}`)
    }
    expect(total, where.join('; ')).toBe(0)
  })
})
