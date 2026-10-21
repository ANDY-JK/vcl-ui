// register 页行为锁定（2026-10-21，审查 6.2 #5「补覆盖洼地」）
//
// 背景：login 域函数覆盖只有 37.3%，因为 `login.vue` 被两个 spec 覆盖得不错，
// 而 `register.vue`(319 行) / `forgot-*`(215 行) / `portal_login.vue`(194 行) **共 728 行零测试**。
// 本文件覆盖 register 的校验链与提交语义。
//
// 刻意锁住的两条"反直觉"语义：
//   ① **「可选必填」只在字段实际渲染时生效** —— `requireEmail && !showOptionalFields`
//      必须放行，否则字段不渲染 + 校验要求必填 = 表单**永远提交不了**；
//   ② **载荷里 card_key 随 requireCardKey 走** —— 不需要卡密时不能把空串塞给宿主，
//      否则后端会收到一个"有卡密但为空"的请求，与"不启用卡密"语义不同。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import Register from '@/components/login/register.vue'
import { setLocale } from '@/components/_internal/i18n'

/** 6 个输入框的顺序：昵称 / 卡密 / 账号 / 密码 / 邮箱 / 手机 */
const F = { name: 0, card: 1, user: 2, pwd: 3, email: 4, phone: 5 } as const

function mountRegister(props: Record<string, unknown> = {}): VueWrapper {
  return mount(Register, { props: { hideBrand: true, ...props } })
}

/**
 * 按 props 推导**实际渲染**的输入框顺序。
 *
 * 不能固定索引：`requireCardKey=false` 时卡密框不渲染、`showOptionalFields=false` 时
 * 邮箱/手机不渲染 —— 固定索引会把值填到错的框里（第一版就栽在这，两个用例报
 * "Cannot read properties of undefined"）。
 */
function inputOrder(props: Record<string, unknown>): (keyof typeof F)[] {
  const order: (keyof typeof F)[] = ['name']
  if (props.requireCardKey !== false) order.push('card')
  order.push('user', 'pwd')
  if (props.showOptionalFields !== false) order.push('email', 'phone')
  return order
}

/** 一次性填好必填项，并可选填邮箱/手机 */
async function fillValid(w: VueWrapper, props: Record<string, unknown> = {}, over: Record<string, string> = {}): Promise<void> {
  const vals: Record<string, string> = {
    name: '张三',
    card: 'CARD-123',
    user: 'zhangsan',
    pwd: 'secret123',
    email: '',
    phone: '',
    ...over,
  }
  const inputs = w.findAll('input')
  const order = inputOrder(props)
  expect(inputs.length, `渲染了 ${inputs.length} 个输入框，期望 ${order.length}`).toBe(order.length)
  for (let i = 0; i < order.length; i++) {
    const v = vals[order[i]]
    if (v !== '') await inputs[i].setValue(v)
  }
}

/** 点提交按钮（按文案找，避免依赖 DOM 结构） */
async function submit(w: VueWrapper): Promise<void> {
  const btn = w.findAll('button').find((b) => /注\s*册/.test(b.text()))
  if (!btn) throw new Error('找不到注册按钮')
  await btn.trigger('click')
  await nextTick()
}

beforeEach(() => {
  localStorage.clear()
  setLocale('zh-CN')
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('register · 必填校验链', () => {
  it('全空提交：显示"请完整填写"且不 emit', async () => {
    const w = mountRegister()
    await submit(w)
    expect(w.emitted('submit')).toBeUndefined()
    expect(w.text()).toContain('请完整填写所有必填项')
  })

  it.each([
    ['昵称只有 1 字符', { name: '张' }],
    ['账号只有 2 字符', { user: 'ab' }],
    ['密码只有 5 字符', { pwd: '12345' }],
  ])('%s → 不 emit', async (_label, over) => {
    const w = mountRegister()
    await fillValid(w, {}, over as Record<string, string>)
    await submit(w)
    expect(w.emitted('submit')).toBeUndefined()
  })

  it('requireCardKey 默认开启：卡密为空 → 不 emit', async () => {
    const w = mountRegister()
    await fillValid(w, {}, { card: '' })
    await submit(w)
    expect(w.emitted('submit')).toBeUndefined()
    expect(w.text()).toContain('请输入注册卡密')
  })
})

describe('register · 提交载荷', () => {
  it('全部合法 → emit submit，载荷字段完整', async () => {
    const w = mountRegister()
    await fillValid(w)
    await submit(w)
    const payload = w.emitted('submit')?.[0]?.[0] as Record<string, unknown>
    expect(payload).toMatchObject({
      display_name: '张三',
      card_key: 'CARD-123',
      username: 'zhangsan',
      password: 'secret123',
    })
    // 未填的可选字段是 undefined，而不是 ''
    expect(payload.email).toBeUndefined()
    expect(payload.phone).toBeUndefined()
  })

  it('**requireCardKey=false → 载荷里 card_key 是 undefined**（不是空串）', async () => {
    const w = mountRegister({ requireCardKey: false })
    await fillValid(w, { requireCardKey: false }, { card: '' })
    await submit(w)
    const payload = w.emitted('submit')?.[0]?.[0] as Record<string, unknown>
    expect(payload.card_key, '不启用卡密时不该给宿主一个空串').toBeUndefined()
  })

  it('可选字段填了就带上', async () => {
    const w = mountRegister()
    await fillValid(w, {}, { email: 'a@b.com', phone: '13800138000' })
    await submit(w)
    const payload = w.emitted('submit')?.[0]?.[0] as Record<string, unknown>
    expect(payload.email).toBe('a@b.com')
    expect(payload.phone).toBe('13800138000')
  })
})

describe('register · 格式与「可选必填」', () => {
  it('邮箱格式非法 → 不 emit 且提示格式', async () => {
    const w = mountRegister()
    await fillValid(w, {}, { email: 'not-an-email' })
    await submit(w)
    expect(w.emitted('submit')).toBeUndefined()
    expect(w.text()).toContain('邮箱格式不正确')
  })

  it('手机格式非法 → 不 emit 且提示格式', async () => {
    const w = mountRegister()
    await fillValid(w, {}, { phone: '123' })
    await submit(w)
    expect(w.emitted('submit')).toBeUndefined()
    expect(w.text()).toContain('手机号格式不正确')
  })

  it('requireEmail + showOptionalFields：邮箱空 → 不 emit', async () => {
    const w = mountRegister({ requireEmail: true, showOptionalFields: true })
    await fillValid(w)
    await submit(w)
    expect(w.emitted('submit')).toBeUndefined()
    expect(w.text()).toContain('请输入邮箱')
  })

  it('**requireEmail 但 showOptionalFields=false：邮箱空也放行**（否则表单永远提交不了）', async () => {
    const props = { requireEmail: true, showOptionalFields: false }
    const w = mountRegister(props)
    // 该配置下不渲染卡密？——卡密由 requireCardKey 控制（默认 true），与 showOptionalFields 无关
    await fillValid(w, props)
    await submit(w)
    expect(w.emitted('submit'), '字段没渲染就不该要求必填').toBeTruthy()
  })
})

describe('register · 防重复提交与外部状态', () => {
  it('连点两次只 emit 一次（内部 _submitting 兜底）', async () => {
    const w = mountRegister()
    await fillValid(w)
    await submit(w)
    await submit(w)
    expect((w.emitted('submit') as unknown[])?.length).toBe(1)
  })

  it('loading=true 时不 emit', async () => {
    const w = mountRegister({ loading: true })
    await fillValid(w)
    await submit(w)
    expect(w.emitted('submit')).toBeUndefined()
  })

  it('props.error 优先于内部错误显示', async () => {
    const w = mountRegister({ error: '服务端说不行' })
    await nextTick()
    expect(w.text()).toContain('服务端说不行')
  })
})

describe('register · 交互细节', () => {
  it('回车提交', async () => {
    const w = mountRegister()
    await fillValid(w)
    const pwdInput = w.findAll('input')[F.pwd]
    await pwdInput.trigger('keyup', { key: 'Enter' })
    await nextTick()
    expect(w.emitted('submit')).toBeTruthy()
  })

  it('非回车键不提交', async () => {
    const w = mountRegister()
    await fillValid(w)
    await w.findAll('input')[F.pwd].trigger('keyup', { key: 'a' })
    await nextTick()
    expect(w.emitted('submit')).toBeUndefined()
  })

  it('点「返回登录」→ emit go-login', async () => {
    const w = mountRegister()
    const link = w.findAll('button').find((b) => b.text().includes('返回登录'))
    expect(link, '应有返回登录入口').toBeTruthy()
    await link!.trigger('click')
    expect(w.emitted('go-login')).toBeTruthy()
  })

  it.each([
    ['昵称 1 字符', F.name, '张', '至少 2 个字符'],
    ['账号 2 字符', F.user, 'ab', '至少 3 个字符'],
    ['密码 5 字符', F.pwd, '12345', '至少 6 个字符'],
  ])('实时提示：%s', async (_label, idx, val, hint) => {
    const w = mountRegister()
    await w.findAll('input')[idx].setValue(val as string)
    await nextTick()
    expect(w.text()).toContain(hint as string)
  })
})
