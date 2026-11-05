/* ═══════════ TD-41：toggleVisible 的 invert 方向 ═══════════
 *
 * 第 139 轮把 `toggleVisible` 从「每事件翻转」改成「值驱动」（有内容→显示、清空→隐藏），
 * 修掉了逐键 change 造成的奇偶抖动；代价是**反方向不再可达** ——
 * 单选/复选这类"选了就隐藏后续字段"的语义无法表达。TD-41 记账待办。
 *
 * 本轮收口：给 `FieldEventAction` 加 `invert?: boolean`，`true` 时方向取反。
 *
 * 关键约束（也是本 spec 的重点）：
 *   - 反转**只改方向，不改幂等性** —— 同一状态重复派发仍不翻转（否则第 139 轮的坑回来了）；
 *   - 反转必须能被 schema 导出带走（to-schema），否则设计器配了、运行时收不到；
 *   - 设计器开关必须写回 `onChange.invert`，且**不能顺手抹掉 apiUrl/targetField**
 *     （第 131 轮在同类 UI 上踩过：重建整个 onChange 把接口地址弄丢）。
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope, ref, type EffectScope } from 'vue'
import { useFormEvents } from '@/components/form-builder/useFormEvents'
import type { FormField } from '@/components/form-builder/types'

type Api = ReturnType<typeof useFormEvents>

function setup(initial: Record<string, unknown> = {}) {
  const scope: EffectScope = effectScope()
  const formData = ref<Record<string, unknown>>(initial)
  const api = scope.run(() => useFormEvents(formData, vi.fn(), vi.fn(), vi.fn())) as Api
  return { api, formData, scope }
}

const src = (events: FormField['events']): FormField =>
  ({ key: 'src', label: '来源', type: 'radio', events }) as unknown as FormField

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('toggleVisible · invert 方向（TD-41）', () => {
  it('**invert：有内容 → 隐藏目标**（单选"选了就隐藏后续字段"）', () => {
    const { api, formData, scope } = setup({ src: 'A' })
    api.handleFieldChange(src({ onChange: { action: 'toggleVisible', targetField: 'dst', invert: true } }), 'change')
    expect(formData.value.src).toBe('A')
    expect(api.isHiddenByEvent('dst'), 'invert 时有内容应隐藏').toBe(true)
    scope.stop()
  })

  it('**invert：清空 → 重新显示**（方向反转的另一半，不能只反转一半）', () => {
    const { api, formData, scope } = setup({ src: '' })
    const f = src({ onChange: { action: 'toggleVisible', targetField: 'dst', invert: true } })
    api.handleFieldChange(f, 'change')
    expect(api.isHiddenByEvent('dst'), 'invert 且空值应显示').toBe(false)

    formData.value = { ...formData.value, src: 'A' }
    api.handleFieldChange(f, 'change')
    expect(api.isHiddenByEvent('dst'), '填了内容应隐藏').toBe(true)

    formData.value = { ...formData.value, src: '' }
    api.handleFieldChange(f, 'change')
    expect(api.isHiddenByEvent('dst'), '清空应回到显示').toBe(false)
    scope.stop()
  })

  it('**invert 仍幂等**：同一状态重复派发不会来回翻（第 139 轮的坑不能因反转回来）', () => {
    const { api, formData, scope } = setup({ src: 'A' })
    const f = src({ onChange: { action: 'toggleVisible', targetField: 'dst', invert: true } })
    for (let i = 0; i < 4; i++) {
      formData.value = { ...formData.value, src: 'A' }
      api.handleFieldChange(f, 'change')
      expect(api.isHiddenByEvent('dst'), `第 ${i + 1} 次派发后应保持隐藏`).toBe(true)
    }
    scope.stop()
  })

  it('**invert 与默认方向互为补集**（同一源值，两种配置结果相反）', () => {
    for (const value of ['A', '', true, false, 0, [1], []]) {
      const a = setup({ src: value })
      a.api.handleFieldChange(src({ onChange: { action: 'toggleVisible', targetField: 'dst' } }), 'change')
      const normal = a.api.isHiddenByEvent('dst')
      a.scope.stop()

      const b = setup({ src: value })
      b.api.handleFieldChange(src({ onChange: { action: 'toggleVisible', targetField: 'dst', invert: true } }), 'change')
      const inverted = b.api.isHiddenByEvent('dst')
      b.scope.stop()

      expect(inverted, `源值 ${JSON.stringify(value)}：反转结果应是默认的补集`).toBe(!normal)
    }
  })
})

describe('toggleVisible · invert 的接线（静态判据）', () => {
  const toSchema = readFileSync('src/components/form-builder/designer/types/to-schema.ts', 'utf8')
  const eventPage = readFileSync('src/components/form-builder/designer/PropsEventPage.vue', 'utf8')

  it('**to-schema 导出 invert**（设计器配了要能带到运行时）', () => {
    expect(toSchema).toMatch(/evt\.onChange\.invert \? \{ invert: true \}/)
  })

  it('**设计器开关写回 onChange.invert 且不重建事件对象**（保留 apiUrl / targetField）', () => {
    expect(eventPage).toMatch(/onChange: \{ \.\.\.node\.eventConfig\?\.onChange, enabled: true, invert: !!\$event \}/)
  })

  it('**开关只在 toggleVisible 动作下出现**（别的动作不该多一个无意义的开关）', () => {
    const block = eventPage.slice(eventPage.indexOf('toggleInvert') - 400, eventPage.indexOf('toggleInvert') + 200)
    expect(block, '开关的 v-if 应绑定 toggleVisible').toContain("action === 'toggleVisible'")
  })
})
