// P0-5 行为锁定：useFormLinkage 联动求值必须走安全求值器（evaluateFormula），无 new Function
// 审计 P0-5（发布阻断）：联动表达式 new Function 动态求值 → 代码注入
// 现状：expression-evaluator.ts 受限求值器已替代 new Function（无标识符/属性访问/函数调用），
// 本测试锁定 useFormLinkage 消费方行为 + 注入 payload 不执行任意代码
import { describe, it, expect } from 'vitest'
import { ref, computed, nextTick } from 'vue'
import { useFormLinkage } from '@/components/form-builder/useFormLinkage'
import type { FormField, FormData } from '@/components/form-builder/types'

function makeField(key: string, linkage: FormField['linkage']): FormField {
  return {
    type: 'text',
    key,
    label: key,
    props: {},
    linkage,
  } as FormField
}

describe('P0-5 联动求值安全（evaluateFormula 替代 new Function）', () => {
  it('followValue：公式计算目标字段值', async () => {
    const fields = ref<FormField[]>([
      makeField('total', { type: 'followValue', formula: '{{price}} * 2', targetField: 'total' }),
    ])
    const formData = ref<FormData>({ price: 5 })
    const rp = useFormLinkage(
      computed(() => fields.value),
      formData,
    )
    rp.setupWatchers() // immediate watch 立即执行一次 processLinkages
    // 此时 price=5 → total = 5*2 = 10
    expect(formData.value.total).toBe(10)
    // 改 price 触发 watch
    formData.value = { price: 8 }
    await nextTick()
    expect(formData.value.total).toBe(16)
  })

  it('showHide：条件为 false 时隐藏目标字段', async () => {
    const fields = ref<FormField[]>([
      makeField('agree', { type: 'showHide', formula: "{{agree}} == 'yes'", targetField: 'detail' }),
    ])
    const formData = ref<FormData>({ agree: 'no' })
    const rp = useFormLinkage(
      computed(() => fields.value),
      formData,
    )
    rp.setupWatchers()
    expect(rp.isHiddenByLinkage('detail')).toBe(true)
    // 条件变 true → 显示
    formData.value = { agree: 'yes' }
    await nextTick()
    expect(rp.isHiddenByLinkage('detail')).toBe(false)
  })

  it('注入 payload 公式不执行任意代码（安全降级）', async () => {
    const fields = ref<FormField[]>([
      makeField('x', { type: 'followValue', formula: '{{x}}; process.exit(1)', targetField: 'y' }),
    ])
    const formData = ref<FormData>({ x: 'safe' })
    const rp = useFormLinkage(
      computed(() => fields.value),
      formData,
    )
    // 不抛错（求值器拒绝非法字符，退化为字符串拼接）
    expect(() => rp.setupWatchers()).not.toThrow()
    await nextTick()
    // 不执行 process.exit，进程仍在；y 被设为降级字符串
    expect(formData.value.y).toBeDefined()
  })

  it('useFormLinkage 源码无 new Function / eval（源码锁定）', () => {
    const src = useFormLinkage.toString()
    expect(src).not.toContain('new Function')
    expect(src).not.toContain('eval(')
  })
})
