/**
 * InputOTP · 验证码分格输入
 *
 * 这个组件的价值全在**边界交互**上，所以用例照边界写：
 *   1. 逐位输入 → 自动前进、整串值一路正确
 *   2. 粘贴整串 → 从当前格往后铺，多余的截断
 *   3. 退格 → 当前格有值先清；已空则回退清理前一格
 *   4. 方向键 → 格间移动（不能越界）
 *   5. numeric 过滤非数字；alphanumeric 保留字母并统一大写
 *   6. 输满抛 complete，且只抛一次（值没变不重复抛）
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import InputOTP from '@/components/form/InputOTP.vue'

const cells = (w: ReturnType<typeof mount>) => w.findAll<HTMLInputElement>('input.otp-cell')

/** 模拟在某一格敲一个字（真实 input 会先有 value 再触发 input 事件） */
async function typeAt(w: ReturnType<typeof mount>, i: number, ch: string) {
  const cell = cells(w)[i]!
  await cell.setValue(ch)
}

function lastEmitted(w: ReturnType<typeof mount>, name: string): unknown[] {
  const ev = w.emitted(name)
  return (ev?.[ev.length - 1] ?? []) as unknown[]
}

describe('InputOTP · 逐位输入', () => {
  it('按 length 渲染格子数', () => {
    const w = mount(InputOTP, { props: { modelValue: '', length: 4 } })
    expect(cells(w).length).toBe(4)
    w.unmount()
  })

  it('逐位输入后整串值正确（每敲一位都 emit 一次）', async () => {
    const w = mount(InputOTP, { props: { modelValue: '' } })
    for (const [i, ch] of ['1', '2', '3', '4', '5', '6'].entries()) {
      await typeAt(w, i, ch)
      await nextTick()
    }
    expect(w.emitted('update:modelValue')?.length).toBe(6)
    expect(lastEmitted(w, 'update:modelValue')[0]).toBe('123456')
    w.unmount()
  })

  it('**输满抛 complete，且值没变不重复抛**', async () => {
    const w = mount(InputOTP, { props: { modelValue: '12345', length: 6 } })
    await typeAt(w, 5, '6')
    await nextTick()
    expect(w.emitted('complete')?.length).toBe(1)
    expect(lastEmitted(w, 'complete')[0]).toBe('123456')

    // 再敲同一格同一个字：值不变 → 不应再抛
    await typeAt(w, 5, '6')
    await nextTick()
    expect(w.emitted('complete')?.length).toBe(1)
    w.unmount()
  })
})

describe('InputOTP · 粘贴与退格', () => {
  it('**粘贴整串从当前格往后铺**', async () => {
    const w = mount(InputOTP, { props: { modelValue: '' } })
    const cell = cells(w)[0]!
    const clipboardData = { getData: () => '123456' }
    await cell.trigger('paste', { clipboardData })
    await nextTick()
    expect(lastEmitted(w, 'update:modelValue')[0]).toBe('123456')
    w.unmount()
  })

  it('粘贴超长截断到 length；粘贴含非法字符时过滤', async () => {
    const w = mount(InputOTP, { props: { modelValue: '', length: 4 } })
    const cell = cells(w)[0]!
    await cell.trigger('paste', { clipboardData: { getData: () => '12-34-5678' } })
    await nextTick()
    expect(lastEmitted(w, 'update:modelValue')[0]).toBe('1234')
    w.unmount()
  })

  it('**退格：当前格有值先清当前格**', async () => {
    const w = mount(InputOTP, { props: { modelValue: '123' } })
    await cells(w)[2]!.trigger('keydown', { key: 'Backspace' })
    await nextTick()
    expect(lastEmitted(w, 'update:modelValue')[0]).toBe('12')
    w.unmount()
  })

  it('**退格：当前格已空则回退清理前一格**', async () => {
    const w = mount(InputOTP, { props: { modelValue: '12' } })
    // 第 3 格（索引 2）为空 → 退格应清掉索引 1
    await cells(w)[2]!.trigger('keydown', { key: 'Backspace' })
    await nextTick()
    expect(lastEmitted(w, 'update:modelValue')[0]).toBe('1')
    w.unmount()
  })

  it('Delete 只清当前格，不回退', async () => {
    const w = mount(InputOTP, { props: { modelValue: '123' } })
    await cells(w)[1]!.trigger('keydown', { key: 'Delete' })
    await nextTick()
    expect(lastEmitted(w, 'update:modelValue')[0]).toBe('13')
    w.unmount()
  })
})

describe('InputOTP · 字符过滤与大小写', () => {
  it('numeric 过滤非数字', async () => {
    const w = mount(InputOTP, { props: { modelValue: '' } })
    await typeAt(w, 0, 'a')
    await nextTick()
    // 全是非法字符 → 值不变，不 emit
    expect(w.emitted('update:modelValue')).toBeUndefined()
    await typeAt(w, 0, '7')
    await nextTick()
    expect(lastEmitted(w, 'update:modelValue')[0]).toBe('7')
    w.unmount()
  })

  it('**alphanumeric 保留字母并统一大写**（TOTP 约定）', async () => {
    const w = mount(InputOTP, { props: { modelValue: '', type: 'alphanumeric' } })
    await typeAt(w, 0, 'a')
    await nextTick()
    expect(lastEmitted(w, 'update:modelValue')[0]).toBe('A')
    w.unmount()
  })
})

describe('InputOTP · 禁用与只读', () => {
  it('disabled 时整组 input 都禁用，且退格不生效', async () => {
    const w = mount(InputOTP, { props: { modelValue: '12', disabled: true } })
    expect(cells(w).every((c) => c.element.disabled)).toBe(true)
    await cells(w)[1]!.trigger('keydown', { key: 'Backspace' })
    await nextTick()
    expect(w.emitted('update:modelValue')).toBeUndefined()
    w.unmount()
  })

  it('readonly 时不写值但仍可聚焦（能复制）', async () => {
    const w = mount(InputOTP, { props: { modelValue: '123456', readonly: true } })
    expect(cells(w).every((c) => c.element.readOnly)).toBe(true)
    expect(cells(w).every((c) => c.element.disabled)).toBe(false)
    await cells(w)[0]!.trigger('keydown', { key: 'Backspace' })
    await nextTick()
    expect(w.emitted('update:modelValue')).toBeUndefined()
    w.unmount()
  })

  it('expose focusFirstEmpty：聚焦到第一个空格子', async () => {
    const w = mount(InputOTP, { props: { modelValue: '12' } })
    const spy = vi.spyOn(cells(w)[2]!.element, 'focus')
    ;(w.vm as unknown as { focusFirstEmpty: () => void }).focusFirstEmpty()
    await nextTick()
    expect(spy).toHaveBeenCalled()
    w.unmount()
  })
})
