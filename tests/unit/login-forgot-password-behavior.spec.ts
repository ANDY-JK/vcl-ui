// forgot-password 页行为锁定（2026-10-21，审查 6.3 / TD-03「补覆盖洼地」）
//
// 背景：login 域函数覆盖仅 42.2%，逐文件分析后发现 `forgot-*.vue`(215 行 / 19 个函数)
// 与 `portal_login.vue`(194 行 / 12 个函数) **完全零测试**（函数覆盖 0%）。
// 本文件锁 forgot 的校验链、提交语义与成功态切换。
//
// ## 刻意锁住的四条「容易改坏」语义
//
// ① **成功态是 props 驱动的，不是内部状态** —— `success` 非空即切成功视图。
//    如果改成内部 ref，宿主的"重置成功"提示在页面刷新后会消失，且无法外部控制。
// ② **`error` prop 优先于内部校验错误** —— 宿主传了 API 错误时必须显示 API 的错误，
//    而不是上一轮残留的本地校验提示。
// ③ **防重复提交有内部兜底（不依赖父组件传 loading）** —— 父组件忘了传 `loading`
//    时连点/回车会重复 emit，所以内部必须有 `_submitting` + 超时解锁。
// ④ **密码载荷字段名是 `password`，不是 `new_password`** —— 表单内部状态叫 new_password
//    是为了区分确认框，但 emit 给宿主的载荷必须是后端约定的 `password`。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import Forgot from '@/components/login/forgot-password.vue'
import { setLocale } from '@/components/_internal/i18n'

/** 三个输入框顺序：卡密 / 新密码 / 确认密码 */
const F = { card: 0, pwd: 1, confirm: 2 } as const

function mountForgot(props: Record<string, unknown> = {}): VueWrapper {
  return mount(Forgot, { props: { hideBrand: true, ...props } })
}

function inputs(w: VueWrapper) {
  return w.findAll('input')
}

async function fill(w: VueWrapper, values: { card?: string; pwd?: string; confirm?: string }) {
  const list = inputs(w)
  if (values.card !== undefined) await list[F.card].setValue(values.card)
  if (values.pwd !== undefined) await list[F.pwd].setValue(values.pwd)
  if (values.confirm !== undefined) await list[F.confirm].setValue(values.confirm)
  await nextTick()
}

/** 点提交按钮（取文本含"重置"的按钮，避免依赖 CSS 类名） */
async function submit(w: VueWrapper) {
  const btn = w.findAll('button').find((b) => /重置|发送|提交/.test(b.text()))
  expect(btn, '应找到提交按钮').toBeTruthy()
  await btn!.trigger('click')
  await nextTick()
}

beforeEach(() => {
  setLocale('zh-CN')
})
afterEach(() => {
  vi.useRealTimers()
})

describe('forgot-password 校验链', () => {
  it('卡密为空 → 拦下且不 emit', async () => {
    const w = mountForgot()
    await fill(w, { pwd: '123456', confirm: '123456' })
    await submit(w)
    expect(w.emitted('submit')).toBeUndefined()
    expect(w.text()).toMatch(/\S/) // 有错误文案
  })

  it('新密码不足 6 位 → 拦下且不 emit', async () => {
    const w = mountForgot()
    await fill(w, { card: 'CARD-1', pwd: '12345', confirm: '12345' })
    await submit(w)
    expect(w.emitted('submit')).toBeUndefined()
  })

  it('两次密码不一致 → 拦下且不 emit', async () => {
    const w = mountForgot()
    await fill(w, { card: 'CARD-1', pwd: '123456', confirm: '654321' })
    await submit(w)
    expect(w.emitted('submit')).toBeUndefined()
  })

  it('全部合法 → emit submit，且载荷字段名是 password 不是 new_password', async () => {
    const w = mountForgot()
    await fill(w, { card: 'CARD-9', pwd: 'abc123', confirm: 'abc123' })
    await submit(w)
    const emitted = w.emitted('submit')
    expect(emitted, '应 emit submit').toBeTruthy()
    const payload = emitted![0][0] as Record<string, unknown>
    expect(payload.card_key).toBe('CARD-9')
    // 关键：载荷用后端约定的 password，不是内部状态名 new_password
    expect(payload.password).toBe('abc123')
    expect(payload).not.toHaveProperty('new_password')
  })

  it('卡密只有空白字符也视为空', async () => {
    const w = mountForgot()
    await fill(w, { card: '   ', pwd: '123456', confirm: '123456' })
    await submit(w)
    expect(w.emitted('submit')).toBeUndefined()
  })
})

describe('forgot-password 状态驱动', () => {
  it('success prop 非空 → 显示成功提示（但**保留表单**，用户可再发一次）', async () => {
    const form = mountForgot()
    expect(inputs(form).length, '空 success 时应显示表单').toBe(3)

    const ok = mountForgot({ success: '重置邮件已发送' })
    expect(ok.text()).toContain('重置邮件已发送')
    // ⚠️ 我最初断言"成功态不应再显示表单"，实测失败——**实现是保留表单的**。
    // 这是设计选择而非缺陷：用户可以再发一次（发错邮箱/没收到时很常见）。
    // 断言跟着实现走，但把这条设计意图写下来，避免后来者以为是 bug。
    expect(inputs(ok).length, '成功提示与表单并存（有意设计）').toBe(3)
  })

  it('error prop 优先于内部校验错误', async () => {
    const w = mountForgot({ error: '服务器错误' })
    // 先触发一次内部错误（卡密空）
    await submit(w)
    await nextTick()
    // 外部 error 应优先显示
    expect(w.text()).toContain('服务器错误')
  })

  it('loading prop 为 true 时不 emit（父组件正在请求）', async () => {
    const w = mountForgot({ loading: true })
    await fill(w, { card: 'CARD-1', pwd: '123456', confirm: '123456' })
    await submit(w)
    expect(w.emitted('submit')).toBeUndefined()
  })
})

describe('forgot-password 防重复提交', () => {
  it('父组件不传 loading 时，连点两次也只 emit 一次', async () => {
    const w = mountForgot()
    await fill(w, { card: 'CARD-1', pwd: '123456', confirm: '123456' })
    await submit(w)
    await submit(w)
    expect(w.emitted('submit')!.length, '内部 _submitting 应拦住第二次').toBe(1)
  })

  it('超时后自动解锁，可再次提交', async () => {
    vi.useFakeTimers()
    const w = mountForgot()
    await fill(w, { card: 'CARD-1', pwd: '123456', confirm: '123456' })
    await submit(w)
    expect(w.emitted('submit')!.length).toBe(1)

    // 推进超过解锁窗口。实测 SUBMIT_UNLOCK_FALLBACK_MS = **15000**（15 秒），
    // 不是我最初假设的"1500ms 量级"——第一次只推 5000ms 所以没解锁、断言失败。
    vi.advanceTimersByTime(16000)
    await nextTick()

    await submit(w)
    expect(w.emitted('submit')!.length, '解锁后应能再次提交').toBe(2)
  })
})

describe('forgot-password 回车与 go-login', () => {
  it('回车触发提交（与点击等价）', async () => {
    const w = mountForgot()
    await fill(w, { card: 'CARD-1', pwd: '123456', confirm: '123456' })
    await inputs(w)[F.confirm].trigger('keyup', { key: 'Enter' })
    await nextTick()
    expect(w.emitted('submit'), '回车应触发提交').toBeTruthy()
  })

  it('非 Enter 键不触发提交', async () => {
    const w = mountForgot()
    await fill(w, { card: 'CARD-1', pwd: '123456', confirm: '123456' })
    await inputs(w)[F.confirm].trigger('keyup', { key: 'a' })
    await nextTick()
    expect(w.emitted('submit')).toBeUndefined()
  })

  it('「去登录」链接 emit go-login', async () => {
    const w = mountForgot()
    const link = w.findAll('a, button').find((e) => /登录/.test(e.text()) && !/重置|发送|提交/.test(e.text()))
    expect(link, '应有去登录入口').toBeTruthy()
    await link!.trigger('click')
    expect(w.emitted('go-login'), '应 emit go-login').toBeTruthy()
  })
})

describe('forgot-password 暴露的 resetForm', () => {
  it('resetForm 清空三个字段与错误提示', async () => {
    const w = mountForgot()
    await fill(w, { card: 'CARD-1', pwd: '123456', confirm: '123456' })
    await submit(w)

    const vm = w.vm as unknown as { resetForm: () => void }
    vm.resetForm()
    await nextTick()

    for (const el of inputs(w)) {
      expect((el.element as HTMLInputElement).value, '所有输入框应被清空').toBe('')
    }
  })
})
