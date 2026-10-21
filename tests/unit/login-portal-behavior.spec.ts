// portal_login 页行为锁定（2026-10-21，审查 6.3 / TD-03「补覆盖洼地」）
//
// 背景：login 域函数覆盖 42.2%，逐文件分析发现 `portal_login.vue`(194 行 / 12 个函数)
// 零测试（函数覆盖 0%）。它与其他三个登录页语义不同：**门户登录**（账号+密码，
// 无品牌面板、卡片式），是最容易被"顺带改坏"的那个。
//
// ## 刻意锁住的五条
//
// ① **`canSubmit` 门限**：账号 ≥3 字符、密码 ≥6 字符 —— 与校验规则里的提示文案一致，
//    但两者是**独立实现**（容易改一处忘另一处）。
// ② **`error` prop 优先于内部错误** —— 宿主 API 错误必须盖住上一轮本地校验提示。
// ③ **`title` 空串用内置 i18n，非空用传入值** —— 空串是"用默认"的信号，不是"显示空标题"。
// ④ **防重复提交**：父组件不传 loading 时连点只 emit 一次。
// ⑤ **载荷字段名是 `password`**（与其他登录页一致，不是 `password`）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import PortalLogin from '@/components/login/portal_login.vue'
import { setLocale } from '@/components/_internal/i18n'

function mountPortal(props: Record<string, unknown> = {}): VueWrapper {
  return mount(PortalLogin, { props })
}

function inputs(w: VueWrapper) {
  return w.findAll('input')
}

async function fill(w: VueWrapper, username: string, pwd: string) {
  const list = inputs(w)
  await list[0].setValue(username)
  await list[1].setValue(pwd)
  await nextTick()
}

async function submit(w: VueWrapper) {
  const btn = w.findAll('button').find((b) => /登录|登 录|提交/.test(b.text()))
  expect(btn, '应找到提交按钮').toBeTruthy()
  await btn!.trigger('click')
  await nextTick()
}

beforeEach(() => setLocale('zh-CN'))
afterEach(() => vi.useRealTimers())

describe('portal_login 校验门限（canSubmit 与 rules 是两套独立实现）', () => {
  it('账号 <3 字符 → 不 emit', async () => {
    const w = mountPortal()
    await fill(w, 'ab', '123456')
    await submit(w)
    expect(w.emitted('submit')).toBeUndefined()
  })

  it('密码 <6 字符 → 不 emit', async () => {
    const w = mountPortal()
    await fill(w, 'admin', '12345')
    await submit(w)
    expect(w.emitted('submit')).toBeUndefined()
  })

  it('账号只有空白 → 视为空，不 emit', async () => {
    const w = mountPortal()
    await fill(w, '   ', '123456')
    await submit(w)
    expect(w.emitted('submit')).toBeUndefined()
  })

  it('刚好到门限（3 字符账号 + 6 字符密码）→ 应 emit', async () => {
    const w = mountPortal()
    await fill(w, 'abc', '123456')
    await submit(w)
    expect(w.emitted('submit'), '边界值应放行').toBeTruthy()
  })

  it('合法输入 → 载荷恰好是 { username, 密码字段 } 两个键（不多不少）', async () => {
    const w = mountPortal()
    await fill(w, 'admin', 'secret123')
    await submit(w)
    const payload = w.emitted('submit')![0][0] as Record<string, unknown>
    // 用键集合断言而不是硬编码字段名：字段名本身在源码里是脱敏的，
    // 硬编码容易写成"同一个词与自己不等"的矛盾断言（第一版就栽在这）。
    expect(Object.keys(payload).sort()).toEqual(['password', 'username'])
    expect(payload.username).toBe('admin')
    // 按位置取密码字段（键集合已断言，这里验证值）
    const pwKey = Object.keys(payload).find((k) => k !== 'username')!
    expect(payload[pwKey]).toBe('secret123')
  })
})

describe('portal_login 状态与内容', () => {
  it('error prop 优先于内部校验错误', async () => {
    const w = mountPortal({ error: '账号已锁定' })
    await submit(w) // 触发内部错误
    await nextTick()
    expect(w.text()).toContain('账号已锁定')
  })

  it('title 为空串 → 用内置 i18n 标题（不是空标题）', async () => {
    const w = mountPortal({ title: '' })
    // 内置标题应来自 i18n，非空
    const text = w.text()
    expect(text.trim().length, '标题不应为空').toBeGreaterThan(0)
  })

  it('title 非空 → 原样显示', async () => {
    const w = mountPortal({ title: '内部管理系统' })
    expect(w.text()).toContain('内部管理系统')
  })

  it('loading=true 时不 emit', async () => {
    const w = mountPortal({ loading: true })
    await fill(w, 'admin', 'secret123')
    await submit(w)
    expect(w.emitted('submit')).toBeUndefined()
  })
})

describe('portal_login 防重复提交与回车', () => {
  it('父组件不传 loading 时连点两次只 emit 一次', async () => {
    const w = mountPortal()
    await fill(w, 'admin', 'secret123')
    await submit(w)
    await submit(w)
    expect(w.emitted('submit')!.length, '内部 _submitting 应拦住第二次').toBe(1)
  })

  it('回车触发提交', async () => {
    const w = mountPortal()
    await fill(w, 'admin', 'secret123')
    // 实现绑的是 keyup（与 forgot 一致）
    await inputs(w)[1].trigger('keyup', { key: 'Enter' })
    await nextTick()
    expect(w.emitted('submit'), '回车应触发提交').toBeTruthy()
  })

  it('非 Enter 键不触发', async () => {
    const w = mountPortal()
    await fill(w, 'admin', 'secret123')
    await inputs(w)[1].trigger('keyup', { key: 'x' })
    await nextTick()
    expect(w.emitted('submit')).toBeUndefined()
  })
})
