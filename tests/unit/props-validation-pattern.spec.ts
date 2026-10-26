/**
 * 属性面板·校验页：正则配错的即时反馈（第 143 轮）。
 *
 * 运行时（`to-schema.ts`）对非法正则是 `try { new RegExp(...) } catch { 跳过 }` ——
 * 也就是说**面板上规则看着是开的、表单实际一条都不校验**。这类"配了没人读"比没配更危险：
 * 它让人以为校验生效了。面板必须把问题摆在配置时。
 *
 * 同理：只填了"校验提示语"却没填正则 —— 这条提示永远不会显示（同 onFocus 那类死配置）。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PropsValidationPage from '@/components/form-builder/designer/PropsValidationPage.vue'
import { toFormSchema } from '@/components/form-builder/designer/types'

const node = (validation?: Record<string, unknown>) =>
  ({
    id: 'n1',
    key: 'f1',
    type: 'input',
    label: '字段',
    ...(validation ? { validation } : {}),
  }) as never

const mountPage = (validation?: Record<string, unknown>) =>
  mount(PropsValidationPage, { props: { node: node(validation) } })

const hintText = (w: ReturnType<typeof mountPage>) =>
  w.findAll('.ldp-prop-hint').map((h) => h.text())

describe('非法正则：面板必须当场说清楚', () => {
  it('**未闭合字符类 `[` 被判非法并给出提示**', () => {
    const w = mountPage({ pattern: '[' })
    const hints = hintText(w)
    expect(hints.length, `提示：${JSON.stringify(hints)}`).toBe(1)
    expect(hints[0]).toContain('正则')
    w.unmount()
  })

  it('非法时该行打上 data-invalid（机器可判，样式与断言都靠它）', () => {
    const w = mountPage({ pattern: '[a-' })
    const row = w.findAll('.ldp-prop').find((r) => r.attributes('data-invalid') === '1')
    expect(row, '找不到 data-invalid 的行').toBeTruthy()
    w.unmount()
  })

  it('合法正则不提示', () => {
    const w = mountPage({ pattern: '^[0-9]{6}$' })
    expect(hintText(w)).toEqual([])
    w.unmount()
  })

  it('留空不提示（没配正则不是错误）', () => {
    const w = mountPage({ pattern: '' })
    expect(hintText(w)).toEqual([])
    expect(w.findAll('[data-invalid="1"]').length).toBe(0)
    w.unmount()
  })

  it('改回合法正则后提示消失（受控：靠 props 变化）', async () => {
    const w = mountPage({ pattern: '[' })
    expect(hintText(w).length).toBe(1)
    await w.setProps({ node: node({ pattern: '^\\d+$' }) })
    expect(hintText(w)).toEqual([])
    w.unmount()
  })
})

describe('只填提示语没填正则：死配置要标出来', () => {
  it('**有提示语、无正则 → 警告提示**', () => {
    const w = mountPage({ patternMessage: '格式不对' })
    const warn = w.find('.ldp-prop-warn')
    expect(warn.exists(), `实际提示：${JSON.stringify(hintText(w))}`).toBe(true)
    expect(warn.text()).toContain('不会')
    w.unmount()
  })

  it('提示语 + 合法正则 → 不警告', () => {
    const w = mountPage({ pattern: '^a$', patternMessage: '格式不对' })
    expect(w.find('.ldp-prop-warn').exists()).toBe(false)
    w.unmount()
  })

  it('两者都没有 → 不警告', () => {
    const w = mountPage({})
    expect(w.find('.ldp-prop-warn').exists()).toBe(false)
    w.unmount()
  })
})

describe('运行时口径：非法正则确实被跳过（所以只能靠面板把关）', () => {
  it('非法 pattern 不产生 rules；合法 pattern 产生 rules', () => {
    const build = (pattern: string) =>
      toFormSchema(
        [{ id: 'n1', key: 'f1', type: 'input', label: '字段', validation: { pattern } }] as never,
        undefined as never,
      )

    const bad = build('[')
    const badRuleCount = (bad.fields[0] as { rules?: unknown[] }).rules?.length ?? 0
    expect(badRuleCount, '非法正则不该生成校验规则（运行时静默跳过）').toBe(0)

    const good = build('^\\d+$')
    const goodRuleCount = (good.fields[0] as { rules?: unknown[] }).rules?.length ?? 0
    expect(goodRuleCount, '合法正则要生成规则').toBe(1)
  })
})
