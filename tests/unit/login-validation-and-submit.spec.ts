// 四个登录页的**校验规则 + 提交路径**覆盖（#474）
//
// 背景：login 域函数覆盖 67.3%（地板 58）是全库余量最小的域，逐文件看下来缺的是一整类：
// 四个页面都把 `rules` 传给 `<Input>`、并把 rules 的结果交给 Input 的 blur 校验去渲染，
// 而既有 spec 只断言了「canSubmit / 是否 emit」——**规则函数本身、提交后的表单复位、
// IME 合成期守卫、authResult 回写**全都没有被任何用例走到（coverage 里是成片的 0）。
//
// 本文件按「真 UI 路径」补：type + blur 触发 Input.validate() → 断言 `.fl-error` 文案；
// 提交路径用 mount 后的 wrapper 直接调 resetForm / 派发事件。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import Login from '@/components/login/login.vue'
import PortalLogin from '@/components/login/portal_login.vue'
import Register from '@/components/login/register.vue'
import ForgotPassword from '@/components/login/forgot-password.vue'
import { setLocale } from '@/components/_internal/i18n'

beforeEach(() => setLocale('zh-CN'))
afterEach(() => {
  vi.useRealTimers()
})

/** 该页所有输入框 */
function inputs(w: VueWrapper) {
  return w.findAll('input')
}

/** 输入并失焦 —— Input 只在 touched 后才跑 rules（见 Input.vue 的 watch + validate） */
async function typeAndBlur(w: VueWrapper, index: number, value: string) {
  const el = inputs(w)[index]
  await el.setValue(value)
  await el.trigger('blur')
  await nextTick()
}

/** 当前所有非空的 `.fl-error` 文案。
 *
 *  ⚠ 必须取**全部**：每个 Input 的错误是各自保留的 —— 先 blur 昵称留下「至少 2 个字符」，
 *  再 blur 卡密留下「请输入注册卡密」，两个会同时在 DOM 里；取 `find()`（第一个）
 *  会一直读到上一个字段的错误，断言就变成「拿旧错当新错」。
 */
function errors(w: VueWrapper) {
  return w.findAll('.fl-error').map((e) => e.text()).filter((t) => t.length > 0)
}

/** 该字段当前是否报错（供「到门限应清空」类断言） */
function hasError(w: VueWrapper, text: string) {
  return errors(w).includes(text)
}

function submitBtn(w: VueWrapper) {
  const btn = w.findAll('button').find((b) => /登\s*录|注\s*册|重置|提交/.test(b.text()))
  expect(btn, '应找到提交按钮').toBeTruthy()
  return btn!
}

async function clickSubmit(w: VueWrapper) {
  await submitBtn(w).trigger('click')
  await nextTick()
}

describe('portal_login 校验规则（type + blur → .fl-error）', () => {
  it('账号空 → accountRequired；账号 2 字符 → accountHint；3 字符 → 无错', async () => {
    const w = mount(PortalLogin)
    await typeAndBlur(w, 0, '')
    expect(hasError(w, '请输入账号')).toBe(true)
    await typeAndBlur(w, 0, 'ab')
    expect(hasError(w, '账号至少 3 个字符')).toBe(true)
    await typeAndBlur(w, 0, 'abc')
    expect(errors(w), '到门限应清空错误').toEqual([])
  })

  it('密码空 → passwordRequired；5 字符 → passwordHint；6 字符 → 无错', async () => {
    const w = mount(PortalLogin)
    await typeAndBlur(w, 1, '')
    expect(hasError(w, '请输入密码')).toBe(true)
    await typeAndBlur(w, 1, '12345')
    expect(hasError(w, '密码至少 6 个字符')).toBe(true)
    await typeAndBlur(w, 1, '123456')
    expect(errors(w)).toEqual([])
  })

  it('按钮在 canSubmit=false 时 disabled（点不动）；回车才走内部分支显示 invalidCredentialsFull', async () => {
    const w = mount(PortalLogin)
    await inputs(w)[0].setValue('ab')
    await inputs(w)[1].setValue('123456')
    await clickSubmit(w)
    expect(w.emitted('submit'), 'disabled 按钮不该 emit').toBeUndefined()
    expect(w.text(), '点不动也不该凭空报错').not.toContain('请输入正确的用户名和密码')
    // 回车不受 disabled 影响 —— 内部校验分支只从这里进
    await inputs(w)[1].trigger('keyup', { key: 'Enter' })
    await nextTick()
    expect(w.text()).toContain('请输入正确的用户名和密码')
    expect(w.emitted('submit')).toBeUndefined()
  })

  it('resetForm 清空两个字段与内部错误', async () => {
    const w = mount(PortalLogin)
    await inputs(w)[0].setValue('ab')
    await inputs(w)[1].setValue('123456')
    await inputs(w)[1].trigger('keyup', { key: 'Enter' })
    await nextTick()
    expect(w.text()).toContain('请输入正确的用户名和密码')
    ;(w.vm as unknown as { resetForm: () => void }).resetForm()
    await nextTick()
    expect((inputs(w)[0].element as HTMLInputElement).value).toBe('')
    expect((inputs(w)[1].element as HTMLInputElement).value).toBe('')
    expect(w.text()).not.toContain('请输入正确的用户名和密码')
  })
})

describe('register 校验规则与提交载荷', () => {
  it('昵称空/过短、卡密空、账号过短、密码过短各自的文案', async () => {
    const w = mount(Register)
    await typeAndBlur(w, 0, '')
    expect(hasError(w, '请输入昵称或公司名称')).toBe(true)
    await typeAndBlur(w, 0, 'a')
    expect(hasError(w, '至少 2 个字符')).toBe(true)

    await typeAndBlur(w, 1, '')
    expect(hasError(w, '请输入注册卡密')).toBe(true)

    await typeAndBlur(w, 2, 'ab')
    expect(hasError(w, '至少 3 个字符')).toBe(true)

    await typeAndBlur(w, 3, '12345')
    expect(hasError(w, '至少 6 个字符')).toBe(true)
  })

  it('邮箱/手机号：必填时漏填与格式错误各有文案（requireEmail/requirePhone）', async () => {
    const w = mount(Register, { props: { requireEmail: true, requirePhone: true } })
    // 输入顺序：0 昵称 1 卡密 2 账号 3 密码 4 邮箱 5 手机
    await typeAndBlur(w, 4, '')
    expect(hasError(w, '请输入邮箱')).toBe(true)
    await typeAndBlur(w, 4, 'not-an-email')
    expect(hasError(w, '邮箱格式不正确')).toBe(true)

    await typeAndBlur(w, 5, '')
    expect(hasError(w, '请输入手机号')).toBe(true)
    await typeAndBlur(w, 5, 'abc')
    expect(hasError(w, '手机号格式不正确')).toBe(true)
  })

  it('非必填时漏填不报错、格式错误仍报（emailRequired 依赖字段渲染）', async () => {
    const w = mount(Register, { props: { requireEmail: false, requirePhone: false } })
    await typeAndBlur(w, 4, '')
    expect(errors(w), '非必填漏填不该报错').toEqual([])
    await typeAndBlur(w, 4, 'still-bad')
    expect(hasError(w, '邮箱格式不正确')).toBe(true)
  })

  it('合法提交 → 载荷含卡密；requireCardKey=false → card_key 为 undefined', async () => {
    const w = mount(Register)
    await inputs(w)[0].setValue('张三')
    await inputs(w)[1].setValue('CARD-1')
    await inputs(w)[2].setValue('zhangsan')
    await inputs(w)[3].setValue('secret123')
    await clickSubmit(w)
    const payload = w.emitted('submit')![0][0] as Record<string, unknown>
    expect(payload.card_key).toBe('CARD-1')

    const w2 = mount(Register, { props: { requireCardKey: false } })
    await inputs(w2)[0].setValue('张三')
    await inputs(w2)[1].setValue('zhangsan')
    await inputs(w2)[2].setValue('secret123')
    await clickSubmit(w2)
    const p2 = w2.emitted('submit')![0][0] as Record<string, unknown>
    expect(p2.card_key, '不要卡密时不该带这个键').toBeUndefined()
  })

  it('requirePhone 但漏填 → internalError = phoneRequired（提交入口自己的守卫）', async () => {
    const w = mount(Register, { props: { requirePhone: true } })
    await inputs(w)[0].setValue('张三')
    await inputs(w)[1].setValue('CARD-1')
    await inputs(w)[2].setValue('zhangsan')
    await inputs(w)[3].setValue('secret123')
    await clickSubmit(w)
    expect(w.text()).toContain('请输入手机号')
    expect(w.emitted('submit')).toBeUndefined()
  })

  it('resetForm 清空全部字段', async () => {
    const w = mount(Register)
    await inputs(w)[0].setValue('张三')
    await inputs(w)[2].setValue('zhangsan')
    await inputs(w)[3].setValue('secret123')
    ;(w.vm as unknown as { resetForm: () => void }).resetForm()
    await nextTick()
    for (const el of inputs(w)) expect((el.element as HTMLInputElement).value).toBe('')
  })
})

describe('forgot-password 校验规则与守卫', () => {
  it('卡密空 / 新密码过短 / 确认密码不一致各有文案', async () => {
    const w = mount(ForgotPassword)
    // 输入顺序：0 卡密 1 新密码 2 确认密码
    await typeAndBlur(w, 0, '')
    expect(hasError(w, '请输入注册卡密')).toBe(true)
    await typeAndBlur(w, 1, '12345')
    expect(hasError(w, '至少 6 个字符')).toBe(true)
    await typeAndBlur(w, 1, 'secret123')
    await typeAndBlur(w, 2, 'secret999')
    expect(hasError(w, '两次密码不一致')).toBe(true)
  })

  it('resetForm 清空三个字段', async () => {
    const w = mount(ForgotPassword)
    await inputs(w)[0].setValue('CARD-1')
    await inputs(w)[1].setValue('secret123')
    await inputs(w)[2].setValue('secret123')
    ;(w.vm as unknown as { resetForm: () => void }).resetForm()
    await nextTick()
    for (const el of inputs(w)) expect((el.element as HTMLInputElement).value).toBe('')
  })
})

describe('login.vue 校验规则、IME 守卫与 authResult 回写', () => {
  it('用户名空/过短、密码空/过短各有文案', async () => {
    const w = mount(Login)
    await typeAndBlur(w, 0, '')
    expect(hasError(w, '请输入用户名')).toBe(true)
    await typeAndBlur(w, 0, 'ab')
    expect(hasError(w, '用户名至少 3 个字符')).toBe(true)
    await typeAndBlur(w, 1, '')
    expect(hasError(w, '请输入密码')).toBe(true)
    await typeAndBlur(w, 1, '12345')
    expect(hasError(w, '密码至少 6 个字符')).toBe(true)
  })

  it('IME 合成期按回车 → 不提交（isComposing / keyCode 229 两条路径都算）', async () => {
    const w = mount(Login)
    await inputs(w)[0].setValue('zhangsan')
    await inputs(w)[1].setValue('secret123')
    await inputs(w)[1].trigger('keyup', { key: 'Enter', isComposing: true })
    await nextTick()
    expect(w.emitted('submit'), '合成期不该提交').toBeUndefined()
    await inputs(w)[1].trigger('keyup', { key: 'Enter', keyCode: 229 })
    await nextTick()
    expect(w.emitted('submit'), 'keyCode 229 也该放行').toBeUndefined()
    // 非合成期的 Enter 才提交
    await inputs(w)[1].trigger('keyup', { key: 'Enter' })
    await nextTick()
    expect(w.emitted('submit'), '正常回车应提交').toBeTruthy()
  })

  it('resetForm 清空表单与错误', async () => {
    const w = mount(Login)
    await inputs(w)[0].setValue('ab')
    await inputs(w)[1].setValue('secret123')
    await clickSubmit(w)
    expect(w.text()).toContain('请输入正确的用户名和密码')
    ;(w.vm as unknown as { resetForm: () => void }).resetForm()
    await nextTick()
    expect((inputs(w)[0].element as HTMLInputElement).value).toBe('')
    expect((inputs(w)[1].element as HTMLInputElement).value).toBe('')
    expect(w.text()).not.toContain('请输入正确的用户名和密码')
  })

  it('authResult 回写：ok → 结束加载态；!res → 不动（不抛）', async () => {
    const w = mount(Login)
    await inputs(w)[0].setValue('zhangsan')
    await inputs(w)[1].setValue('secret123')
    await clickSubmit(w)
    expect(w.emitted('submit')).toBeTruthy()
    // 空值不该让 watch 抛错
    await w.setProps({ authResult: null })
    await nextTick()
    expect(w.emitted('submit')).toBeTruthy()
    await w.setProps({ authResult: { ok: true, message: '' } })
    await nextTick()
    expect(submitBtn(w).attributes('disabled')).toBeUndefined()
  })
})
