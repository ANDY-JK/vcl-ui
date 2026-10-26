/**
 * 设计器属性面板·高级字段（第 129 轮）。此前**分支覆盖 0%**（52 个分支一个没走到）。
 *
 * 这类"属性面板"组件的风险不在渲染，而在 **patch 的键名**：
 * 面板改了设置 → `emit('update', { someKey: v })` → 上游把 patch 合并进节点。
 * 键名打错一个字母，**界面上一切正常、保存也不报错，只是那个设置永远存不进 schema** ——
 * 用户配了"流水号前缀"，导出后是空的。这类缺陷没有报错、没有崩溃，只能靠契约测试兜住。
 *
 * 因此本文件的核心是一条**机械契约**：SFC 源码里出现的每个 `emit('update', { key: ... })`
 * 的 key，必须在 `DesignerNode` 类型里声明过（读 domain.ts 原文比对）。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import PropsAdvancedFields from '@/components/form-builder/designer/PropsAdvancedFields.vue'
import type { DesignerNode } from '@/components/form-builder/designer/types'

const SFC = 'src/components/form-builder/designer/PropsAdvancedFields.vue'
const DOMAIN = 'src/components/form-builder/designer/types/domain.ts'

function mountFields(node: Partial<DesignerNode>) {
  const w = mount(PropsAdvancedFields, {
    props: { node: { id: 'n1', key: 'k1', label: '字段', ...node } as DesignerNode },
  })
  /** 最后一次 update 的 patch */
  const lastPatch = () => {
    const evs = w.emitted('update') as Array<[Record<string, unknown>]> | undefined
    return evs?.at(-1)?.[0]
  }
  return { w, lastPatch }
}

/**
 * 从 zh-CN 词典读某个 key 的真实文案。
 *
 * 为什么不直接写死中文：`Select` 渲染的是**本地化文案**而不是原始值（`YYYYMMDD` 实际显示成
 * "年月日 (20240101)"）；写死文案的话，文案一调整用例就红，而被测行为其实没变。
 * `{'|'}` 是 vue-i18n 的字面竖线转义，读回来要还原成 `|`。
 */
const ZH_DICT = readFileSync('src/components/_internal/locales/chunks/zh-CN/formBuilder.ts', 'utf8')
function labelOf(key: string): string {
  const m = ZH_DICT.match(new RegExp(`^[ \\t]*${key}:\\s*(?:'([^']*)'|"([^"]*)")`, 'm'))
  if (!m) throw new Error(`词典里没有 ${key}`)
  return (m[1] ?? m[2] ?? '').replace(/\{'\|'\}/g, '|')
}

// ════════════════════════════════════════════════════════════════════
// 契约：patch 键名必须是 DesignerNode 声明过的字段
// ════════════════════════════════════════════════════════════════════
describe('契约：emit 的 patch 键必须在 DesignerNode 里声明过', () => {
  it('源码里每个 `emit(\'update\', { key: … })` 的 key 都能在类型定义里找到', () => {
    const src = readFileSync(SFC, 'utf8')
    const domain = readFileSync(DOMAIN, 'utf8')

    // 抓 emit('update', { xxx: 这种形态（模板里是单引号，也可能有空白/换行）
    const keys = [...src.matchAll(/emit\(\s*'update'\s*,\s*\{\s*([A-Za-z_$][\w$]*)\s*:/g)].map((m) => m[1])
    expect(keys.length, '前提：确实抓到了 emit 的键').toBeGreaterThanOrEqual(9)

    const missing = keys.filter(
      (k) => !new RegExp(`(^|[\\s{])${k}\\??\\s*:`, 'm').test(domain),
    )
    expect(missing, `这些 patch 键没在 DesignerNode 里声明（写进去会被丢弃）：${missing.join(', ')}`).toEqual([])
    // 去重后应是这 9 个高级字段
    expect([...new Set(keys)].sort()).toEqual(
      [
        'addressDetail',
        'idcardTypes',
        'matrixCols',
        'matrixRows',
        'relateEntityType',
        'richtextToolbar',
        'serialDateFormat',
        'serialPrefix',
        'subformColumns',
      ].sort(),
    )
  })

  it('每个 emit 只带**一个**键（多个键会让上游的"按节点类型合并"出意外）', () => {
    const src = readFileSync(SFC, 'utf8')
    const calls = [...src.matchAll(/emit\(\s*'update'\s*,\s*\{([^}]*)\}/g)].map((m) => m[1])
    expect(calls.length).toBeGreaterThanOrEqual(9)
    for (const body of calls) {
      const inner = body.trim()
      expect(inner.includes(','), `这个 patch 带了多个键：${inner.slice(0, 60)}`).toBe(false)
    }
  })
})

// ════════════════════════════════════════════════════════════════════
// 逐类型：只有对应类型才渲染，默认值与 emit 值都钉住
// ════════════════════════════════════════════════════════════════════
describe('按节点类型渲染（不同时出现别的类型的属性块）', () => {
  const cases: Array<[string, string]> = [
    ['subform', labelOf('sectionSubform')],
    ['relate', labelOf('sectionRelate')],
    ['richtext', labelOf('sectionRichtext')],
    ['address', labelOf('sectionAddress')],
    ['idcard', labelOf('sectionIdcard')],
    ['matrix', labelOf('sectionMatrix')],
    ['serial', labelOf('sectionSerial')],
  ]

  it.each(cases)('%s 节点渲染出「%s」，且不渲染其它类型的专属块', async (type, sectionTitle) => {
    const { w } = mountFields({ type } as Partial<DesignerNode>)
    expect(w.text()).toContain(sectionTitle)
    for (const [otherType, otherTitle] of cases) {
      if (otherType === type) continue
      expect(w.text(), `${type} 节点里不该出现 ${otherType} 的「${otherTitle}」`).not.toContain(otherTitle)
    }
    w.unmount()
  })

  it('普通字段（如 text）不渲染任何高级块（面板不能一片空白控件）', async () => {
    const { w } = mountFields({ type: 'text' } as Partial<DesignerNode>)
    expect(w.text().trim(), '非高级字段应什么都不渲染').toBe('')
    w.unmount()
  })
})

describe('默认值：字段缺失时显示的初值', () => {
  it('subform 列定义缺失 → 空文本', async () => {
    const { w } = mountFields({ type: 'subform' } as Partial<DesignerNode>)
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('')
    w.unmount()
  })

  it('serial 前缀缺失 → 空；日期格式缺失 → **YYYYMMDD**', async () => {
    const { w } = mountFields({ type: 'serial' } as Partial<DesignerNode>)
    expect(w.find('input').exists()).toBe(true)
    expect((w.find('input').element as HTMLInputElement).value).toBe('')
    // 日期格式是 Select：显示的是**本地化文案**（'年月日 (20240101)'），不是原始值，
    // 所以断言词典里 dateYMD 的文案（第一版写死 'YYYYMMDD' 是错的）
    expect(w.text()).toContain(labelOf('dateYMD'))
    w.unmount()
  })

  it('address 详细地址缺失 → 开关为关（`!!undefined === false`）', async () => {
    const { w } = mountFields({ type: 'address' } as Partial<DesignerNode>)
    const sw = w.find('.ldp-prop-switch')
    expect(sw.exists()).toBe(true)
    w.unmount()
  })

  it('matrix 行列缺失 → 两个文本域都空', async () => {
    const { w } = mountFields({ type: 'matrix' } as Partial<DesignerNode>)
    const tas = w.findAll('textarea')
    expect(tas.length, 'matrix 有行/列两个文本域').toBe(2)
    for (const ta of tas) expect((ta.element as HTMLTextAreaElement).value).toBe('')
    w.unmount()
  })

  it('**已有值优先于默认值**（受控组件不能把用户存的值盖掉）', async () => {
    const { w } = mountFields({
      type: 'serial',
      serialPrefix: 'SO-',
      serialDateFormat: 'YYYYMM',
    } as Partial<DesignerNode>)
    expect((w.find('input').element as HTMLInputElement).value).toBe('SO-')
    expect(w.text()).toContain(labelOf('dateYM'))
    w.unmount()
  })
})

describe('编辑：emit 的 patch 内容与键名', () => {
  it('subform 文本域输入 → `{ subformColumns: <原文> }`（含换行的多行内容要原样保留）', async () => {
    const { w, lastPatch } = mountFields({ type: 'subform' } as Partial<DesignerNode>)
    const ta = w.find('textarea')
    const value = '姓名|name\n年龄|age'
    ;(ta.element as HTMLTextAreaElement).value = value
    await ta.trigger('input')
    expect(lastPatch()).toEqual({ subformColumns: value })
    w.unmount()
  })

  it('matrix 两个文本域各自写各自的键（行/列不能串）', async () => {
    const { w, lastPatch } = mountFields({ type: 'matrix' } as Partial<DesignerNode>)
    const tas = w.findAll('textarea')
    ;(tas[0].element as HTMLTextAreaElement).value = '行A\n行B'
    await tas[0].trigger('input')
    expect(lastPatch()).toEqual({ matrixRows: '行A\n行B' })

    ;(tas[1].element as HTMLTextAreaElement).value = '列A'
    await tas[1].trigger('input')
    expect(lastPatch()).toEqual({ matrixCols: '列A' })
    w.unmount()
  })

  it('idcard 文本域 → `{ idcardTypes: … }`', async () => {
    const { w, lastPatch } = mountFields({ type: 'idcard' } as Partial<DesignerNode>)
    const ta = w.find('textarea')
    ;(ta.element as HTMLTextAreaElement).value = '身份证\n护照'
    await ta.trigger('input')
    expect(lastPatch()).toEqual({ idcardTypes: '身份证\n护照' })
    w.unmount()
  })

  it('serial 前缀输入 → `{ serialPrefix: … }`（字符串化，不传 undefined）', async () => {
    const { w, lastPatch } = mountFields({ type: 'serial' } as Partial<DesignerNode>)
    await w.find('input').setValue('INV-')
    expect(lastPatch()).toEqual({ serialPrefix: 'INV-' })
    w.unmount()
  })

  it('**清空输入也要 emit 空串**（而不是什么都不发，否则删不掉已存的配置）', async () => {
    const { w, lastPatch } = mountFields({ type: 'serial', serialPrefix: 'SO-' } as Partial<DesignerNode>)
    await w.find('input').setValue('')
    expect(lastPatch(), '清空必须发 patch，否则上游保留旧值、用户以为删掉了').toEqual({ serialPrefix: '' })
    w.unmount()
  })
})

describe('互斥：切类型后不留上一类型的残影', () => {
  it('从 serial 切到 address，只渲染 address 的块', async () => {
    const { w } = mountFields({ type: 'serial' } as Partial<DesignerNode>)
    expect(w.text()).toContain('前缀')
    await w.setProps({ node: { id: 'n1', key: 'k1', label: 'x', type: 'address' } as DesignerNode })
    expect(w.text()).toContain('显示详细地址')
    expect(w.text(), '切换类型后不该残留 serial 的前缀块').not.toContain('日期格式')
    w.unmount()
  })
})