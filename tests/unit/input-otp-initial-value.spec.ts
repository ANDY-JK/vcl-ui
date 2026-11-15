/**
 * InputOTP · **初始值**与 `length` 变更时的净化（#494）
 *
 * 缺陷：`local` 初始化时直接吃 `props.modelValue`，**不走 `sanitize`**：
 *
 * ```ts
 * const local = ref<string>(props.modelValue ?? '')          // ← 原始值
 * watch(() => props.modelValue, (v) => local.value = sanitize(v ?? ''))  // ← 后续变更才净化
 * ```
 *
 * `sanitize` 做三件事：按 type 去非法字符、统一大写、截断到 `length`。
 * 于是**首次挂载**时宿主给的值可以：
 *   · numeric 里带分隔符/字母（`12-34`、`1a2b`）→ 非法字符原样渲染进格子；
 *   · alphanumeric 里带小写 → 不统一大写，与"TOTP 约定"不符；
 *   · 超过 `length` → `isComplete` 判满，但 `chars` 只画 `length` 个格子，
 *     多出来的字符看不见却留在 `local` 里（宿主拿到的整串与看到的不一致）。
 *
 * 同一个值，挂载时给 vs 挂载后 setProps 给，结果不一样 —— 这就是要修的。
 *
 * 第二条：`length` prop 变化（宿主切换码长，如 6 位短信码 ↔ 8 位 TOTP）时，
 * `chars` 会少画格子，但 `local` 仍是旧的长串，也不重新 emit —— 宿主 modelValue
 * 与组件状态分叉。要按新 length 重新净化并写回。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import InputOTP from '@/components/form/InputOTP.vue'

function cellValues(w: ReturnType<typeof mount>): string[] {
  return w.findAll('.otp-cell').map((i) => (i.element as HTMLInputElement).value)
}

describe('InputOTP · 初始值净化（#494）', () => {
  it('**numeric 初始值含分隔符 → 首次渲染就应过滤掉**', () => {
    const w = mount(InputOTP, { props: { modelValue: '12-34', length: 6 } })
    expect(cellValues(w)).toEqual(['1', '2', '3', '4', '', ''])
    w.unmount()
  })

  it('numeric 初始值含字母 → 只留数字', () => {
    const w = mount(InputOTP, { props: { modelValue: '1a2b3c', length: 6 } })
    expect(cellValues(w)).toEqual(['1', '2', '3', '', '', ''])
    w.unmount()
  })

  it('alphanumeric 初始值小写 → 统一大写', () => {
    const w = mount(InputOTP, { props: { modelValue: 'ab3d', type: 'alphanumeric', length: 6 } })
    expect(cellValues(w)).toEqual(['A', 'B', '3', 'D', '', ''])
    w.unmount()
  })

  it('**初始值"看着很长但合法字符不足" → 不能误判 otp-complete**', () => {
    // 旧实现：local 原样 = 9 个字符 → isComplete(length=6) 判满；
    // 真正合法的数字只有 2 个，净化后应是 '12'（未满）。
    const w = mount(InputOTP, { props: { modelValue: '--1--2--', length: 6 } })
    expect(cellValues(w)).toEqual(['1', '2', '', '', '', ''])
    expect(w.classes(), '值没满就不该带 complete 样式').not.toContain('otp-complete')
    w.unmount()
  })

  it('初始值不足 length → 不判满（回归护栏）', () => {
    const w = mount(InputOTP, { props: { modelValue: '12', length: 6 } })
    expect(w.classes()).not.toContain('otp-complete')
    expect(cellValues(w)).toEqual(['1', '2', '', '', '', ''])
    w.unmount()
  })

  it('初始值为空 → 全空格子', () => {
    const w = mount(InputOTP, { props: { modelValue: '' } })
    expect(cellValues(w)).toEqual(['', '', '', '', '', ''])
    w.unmount()
  })
})

describe('InputOTP · length 变更（#494）', () => {
  it('**length 从 6 缩到 4 → 值截断并写回宿主**', async () => {
    const w = mount(InputOTP, { props: { modelValue: '123456', length: 6 } })
    await w.setProps({ length: 4 })
    await nextTick()
    expect(cellValues(w)).toEqual(['1', '2', '3', '4'])
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['1234'])
    w.unmount()
  })

  it('length 从 4 扩到 6 → 值不变、不误抛 complete', async () => {
    const w = mount(InputOTP, { props: { modelValue: '1234', length: 4 } })
    await w.setProps({ length: 6 })
    await nextTick()
    expect(cellValues(w)).toEqual(['1', '2', '3', '4', '', ''])
    expect(w.classes()).not.toContain('otp-complete')
    expect(w.emitted('complete')).toBeUndefined()
    w.unmount()
  })

  it('length 变更后敲字仍按新长度工作', async () => {
    const w = mount(InputOTP, { props: { modelValue: '123456', length: 6 } })
    await w.setProps({ length: 4 })
    await nextTick()
    const cells = w.findAll('.otp-cell')
    await cells[3].setValue('9')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['1239'])
    w.unmount()
  })
})
