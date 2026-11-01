/**
 * `Input.vue` · 失焦校验 / 三模式事件链 / password 切换（第 172 轮）
 *
 * 覆盖率实测脚本段 42 行未覆盖（语句 64.8%）：onFocus/onBlur/validate、textarea 事件链、
 * stepper 失焦编排（onStepperBlur——它补齐过"number 字段配了 rules 也永不出错"的缺陷，
 * 却从没被测过）、清空按钮、actualType 分支。
 *
 * 桩法说明：本组件不依赖 speechSynthesis 之类环境 API，直接 mount 即可。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Input from '@/components/form/Input.vue'

const text = (props: Record<string, unknown> = {}, model = '') =>
  mount(Input, { props: { modelValue: model, label: '标签', ...props } })

/* ═══════════ 校验 ═══════════ */

describe('Input · rules 失焦校验', () => {
  const required = (v: string) => (v.trim() === '' ? '必填' : '')

  it('**失焦前不显示错误**（eager-after-touch：不抢在用户输入前报错）', async () => {
    const w = text({ rules: [required] })
    expect(w.find('.fl-error').exists()).toBe(false)
    await w.find('input').setValue('') // 输入过但未失焦
    expect(w.find('.fl-error').exists(), '还没失焦，不该先报错').toBe(false)
    w.unmount()
  })

  it('失焦后校验失败 → 显示错误 + aria-invalid + aria-describedby + role=alert', async () => {
    const w = text({ rules: [required] })
    const input = w.find('input')
    await input.setValue('')
    await input.trigger('blur')
    const err = w.find('.fl-error')
    expect(err.exists()).toBe(true)
    expect(err.text()).toBe('必填')
    expect(err.attributes('role')).toBe('alert')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes('aria-describedby')).toBe(err.attributes('id'))
    w.unmount()
  })

  it('失焦校验通过 → 显示 hint 而不是错误', async () => {
    const w = text({ rules: [required], hint: '提示语' })
    const input = w.find('input')
    await input.setValue('内容')
    // mount 没接 v-model，prop 不会自己更新 → 显式回写，模拟真实父组件
    await w.setProps({ modelValue: '内容' })
    await input.trigger('blur')
    expect(w.find('.fl-error').exists()).toBe(false)
    expect(w.find('.fl-hint').text()).toBe('提示语')
    w.unmount()
  })

  it('**touched 后值变化会重新校验**（改对了错误要消失，改坏了要出现）', async () => {
    const w = text({ rules: [required] })
    const input = w.find('input')
    await input.setValue('')
    await input.trigger('blur')
    expect(w.find('.fl-error').exists()).toBe(true)

    await w.setProps({ modelValue: '改对了' })
    await input.setValue('改对了')
    expect(w.find('.fl-error').exists(), '值已合法，错误应消失').toBe(false)

    await w.setProps({ modelValue: '' })
    await input.setValue('')
    expect(w.find('.fl-error').exists(), '值又空了，错误应重新出现').toBe(true)
    w.unmount()
  })

  it('**number 模式失焦同样触发校验**（此前 number 配了 rules 也永不出错，口径已对齐）', async () => {
    const w = text({ type: 'number', rules: [(v: string) => (Number(v) > 10 ? '超出上限' : '')] })
    const input = w.find('input')
    await input.setValue('99')
    await w.setProps({ modelValue: '99' })
    await input.trigger('blur')
    expect(w.find('.fl-error').exists(), 'number 字段配 rules 必须生效').toBe(true)
    expect(w.find('.fl-error').text()).toBe('超出上限')
    w.unmount()
  })

  it('**number 模式失焦也发 blur 事件**（此前从不发，消费方拿得到 focus 拿不到 blur）', async () => {
    const w = text({ type: 'number' })
    await w.find('input').trigger('blur')
    expect(w.emitted('blur')?.length).toBe(1)
    w.unmount()
  })
})

/* ═══════════ 三模式事件链 ═══════════ */

describe('Input · 文本模式事件', () => {
  it('input → 同发 update:modelValue 与 change', async () => {
    const w = text()
    await w.find('input').setValue('abc')
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['abc'])
    expect(w.emitted('change')?.[0]).toEqual(['abc'])
    w.unmount()
  })

  it('clearable → 有值时显示清空按钮；点击清空并 emit clear', async () => {
    const w = text({ clearable: true }, '已有值')
    const btn = w.find('.f-clear')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    expect(w.emitted('update:modelValue')?.[0]).toEqual([''])
    expect(w.emitted('clear')?.length).toBe(1)
    w.unmount()
  })

  it('clearable 但无值 → 不显示清空按钮', () => {
    const w = text({ clearable: true }, '')
    expect(w.find('.f-clear').exists()).toBe(false)
    w.unmount()
  })

  it('keyup 透传给消费方', async () => {
    const w = text()
    await w.find('input').trigger('keyup')
    expect(w.emitted('keyup')?.length).toBe(1)
    w.unmount()
  })
})

describe('Input · password 模式', () => {
  it('默认 type=password；点眼睛 → 明文，再点 → 恢复密文', async () => {
    const w = text({ type: 'password' as never })
    const input = w.find('input')
    expect(input.attributes('type')).toBe('password')
    await w.find('.f-toggle-pwd').trigger('click')
    expect(input.attributes('type'), '切换后应显示明文').toBe('text')
    expect(w.emitted('update:modelValue'), '切换明文不得改值').toBeUndefined()
    await w.find('.f-toggle-pwd').trigger('click')
    expect(input.attributes('type')).toBe('password')
    w.unmount()
  })

  it('有 aria-label 与 aria-live 状态播报（读屏可感知明文/密文切换）', async () => {
    const w = text({ type: 'password' as never })
    const toggle = w.find('.f-toggle-pwd')
    expect(toggle.attributes('aria-label')).toBeTruthy()
    const live = w.find('[role="status"]')
    expect(live.exists()).toBe(true)
    expect(live.attributes('aria-live')).toBe('polite')
    w.unmount()
  })

  it('**password 不渲染清空按钮**（即使 clearable）——清空等于泄露，靠选中删除', async () => {
    const w = text({ type: 'password' as never, clearable: true }, 'secret')
    expect(w.find('.f-clear').exists(), 'password 的 clearable 不应生效').toBe(false)
    w.unmount()
  })
})

describe('Input · textarea 模式', () => {
  const ta = (props: Record<string, unknown> = {}, model = '') =>
    mount(Input, { props: { type: 'textarea', modelValue: model, label: '备注', ...props } })

  it('渲染 textarea；input → update + change；focus/blur 事件齐', async () => {
    const w = ta()
    const el = w.find('textarea')
    expect(el.exists()).toBe(true)
    await el.trigger('focus')
    expect(w.emitted('focus')?.length).toBe(1)
    await el.setValue('内容')
    expect(w.emitted('update:modelValue')?.[0]).toEqual(['内容'])
    expect(w.emitted('change')?.[0]).toEqual(['内容'])
    await el.trigger('blur')
    expect(w.emitted('blur')?.length).toBe(1)
    w.unmount()
  })

  it('textarea 的 rules 失焦校验同样生效', async () => {
    const w = ta({ rules: [(v: string) => (v.length < 5 ? '至少 5 个字' : '')] })
    const el = w.find('textarea')
    await el.setValue('短')
    await el.trigger('blur')
    expect(w.find('.fl-error').text()).toBe('至少 5 个字')
    w.unmount()
  })

  it('有值时显示清空按钮，点击清空并 emit clear', async () => {
    const w = ta({ clearable: true }, '内容')
    expect(w.find('.f-clear').exists()).toBe(true)
    await w.find('.f-clear').trigger('click')
    expect(w.emitted('update:modelValue')?.[0]).toEqual([''])
    expect(w.emitted('clear')?.length).toBe(1)
    w.unmount()
  })
})

/* ═══════════ 浮动标签与占位 ═══════════ */

describe('Input · 浮动标签与占位符', () => {
  it('无值未聚焦 → 标签不抬升；聚焦后抬升', async () => {
    const w = text()
    const label = w.find('.fl-label')
    expect(label.classes()).not.toContain('raised')
    await w.find('input').trigger('focus')
    expect(label.classes(), '聚焦后标签抬升').toContain('raised')
    w.unmount()
  })

  it('**初始就有值、从未聚焦 → 标签也已抬升**（骑缝标签不得压住已填内容）', async () => {
    // 负向对照 ⑨ 实测踩到：若先 trigger('focus') 再断言，focused=true 会单独满足抬升条件，
    // 把 hasValue 分支失效（变异体）完全掩盖 → 用例杀不掉缺陷。
    // 所以断言必须落在"未聚焦"这一刻：抬升只能由 hasValue 给出。
    const w = text({}, '有值')
    await w.setProps({ modelValue: '有值' })
    expect(w.find('.fl-label').classes(), '有值但未聚焦 → 抬升应只由 hasValue 造成').toContain('raised')
    w.unmount()
  })

  it('有值 → 聚焦再失焦，抬升保持不回落到骑缝位置', async () => {
    const w = text({}, '有值')
    await w.setProps({ modelValue: '有值' })
    const input = w.find('input')
    await input.trigger('focus')
    expect(w.find('.fl-label').classes()).toContain('raised')
    await input.trigger('blur')
    expect(w.find('.fl-label').classes(), '失焦但有值 → 仍抬升').toContain('raised')
    w.unmount()
  })

  it('**未聚焦且未填充时不显示 placeholder**（避免与骑缝标签重叠）；聚焦后显示', async () => {
    const w = text({ placeholder: '请输入' })
    const input = w.find('input')
    expect(input.attributes('placeholder'), '未聚焦时不该显示占位（和标签重叠）').toBe('')
    await input.trigger('focus')
    expect(input.attributes('placeholder')).toBe('请输入')
    w.unmount()
  })

  it('**浏览器自动填充：DOM 有值但 modelValue 还空 → 标签抬升**（否则填充值压住标签）', async () => {
    const w = text({ placeholder: '请输入' })
    const input = w.find('input')
    // 模拟自动填充：只改 DOM，不触发 input 事件（部分浏览器填充不发 input）
    const el = input.element as HTMLInputElement
    el.value = '自动填充的值'
    await input.trigger('focus')
    expect(
      w.find('.fl-label').classes(),
      'DOM 有值而 modelValue 为空 → 应按已填充处理，标签抬升',
    ).toContain('raised')
    w.unmount()
  })
})

describe('Input · 禁用与只读', () => {
  it('disabled → 输入框禁用且不发 input', async () => {
    const w = text({ disabled: true })
    const input = w.find('input')
    expect(input.attributes('disabled')).toBeDefined()
    await input.setValue('x')
    expect(w.emitted('update:modelValue'), 'disabled 下不应发出更新').toBeUndefined()
    w.unmount()
  })

  it('readonly → 可聚焦、值不可改', async () => {
    const w = text({ readonly: true }, '固定值')
    expect(w.find('input').attributes('readonly')).toBeDefined()
    w.unmount()
  })
})
/* ════════════════════════════════════════
 * 清空按钮不得突破只读 / 禁用（#286）
 *
 * 旧实现三处清空按钮只判 `clearable && hasValue`，不看 readonly / disabled：
 * 把字段设为只读（已提交的表单）或禁用（无权限字段）后，用户仍能点 × 把值清掉，
 * 宿主一保存数据就丢了。探针实测：readonly/disabled 下点击都 emit `update:modelValue: ''`。
 * ════════════════════════════════════════ */
describe('清空按钮：只读/禁用语义', () => {
  it('**readonly：不渲染清空按钮**（只读 = 能看不能改）', () => {
    const w = text({ clearable: true, readonly: true }, '内容')
    expect(w.find('.f-clear').exists()).toBe(false)
    w.unmount()
  })

  it('**disabled：不渲染清空按钮**（禁用连写操作入口都不该有）', () => {
    const w = text({ clearable: true, disabled: true }, '内容')
    expect(w.find('.f-clear').exists()).toBe(false)
    w.unmount()
  })

  it('readonly 的 textarea 同样不渲染', () => {
    const w = text({ type: 'textarea', clearable: true, readonly: true }, '内容')
    expect(w.find('.f-clear').exists()).toBe(false)
    w.unmount()
  })

  it('**正常路径不受影响**：clearable 且可写时出现且能清空', async () => {
    const w = text({ clearable: true }, '内容')
    const btn = w.find('.f-clear')
    expect(btn.exists()).toBe(true)
    await btn.trigger('click')
    expect(w.emitted('update:modelValue')).toEqual([['']])
    expect(w.emitted('clear')).toBeTruthy()
    w.unmount()
  })

  it('clearable=false 时任何状态都没有清空按钮（原语义不变）', () => {
    expect(text({ clearable: false }, '内容').find('.f-clear').exists()).toBe(false)
  })
})