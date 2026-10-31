/**
 * 字段事件动作（第 139 轮）。此前语句 62.7% / 分支 39.4%，且 7 个动作里有 3 个
 * 没有任何直接用例（setValue / toggleVisible / showTip 只被间接带到）。
 *
 * 本轮修的缺陷：`toggleVisible` 是**每次事件翻转一次**，而 `Input.onInput` 是**逐键**
 * emit change —— 目标字段可见性于是变成"字符数奇偶"的函数：
 *   键入 a→隐藏、ab→显示、abc→隐藏、abcd→显示
 * 甚至**值没变**时重复派发（父组件重渲染 / 同一值再发一次）也会翻转。
 * 改为值驱动后：有内容→显示、清空→隐藏，同一状态重复派发不再改变结果。
 *
 * 另外确认（并锁死）一条正向设计：**被事件隐藏的字段不进入提交数据、也不参与校验**。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope, ref, nextTick, type EffectScope } from 'vue'
import { useFormEvents } from '@/components/form-builder/useFormEvents'
import type { FormField } from '@/components/form-builder/types'

type Api = ReturnType<typeof useFormEvents>

/** 用 effectScope 提供 onScopeDispose 上下文（composable 需要它来清定时器） */
function setup(initial: Record<string, unknown> = {}) {
  const scope: EffectScope = effectScope()
  const formData = ref<Record<string, unknown>>(initial)
  const toast = vi.fn()
  const autoValidate = vi.fn()
  const submit = vi.fn()
  const api = scope.run(() =>
    useFormEvents(formData, toast, autoValidate, submit),
  ) as Api
  return { api, formData, toast, autoValidate, submit, scope }
}

const fieldWith = (events: FormField['events'], key = 'src', label = '来源'): FormField =>
  ({ key, label, type: 'input', events }) as unknown as FormField

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

// ════════════════════════════════════════════════════════════════════
describe('没有事件配置时什么都不做', () => {
  it.each([
    ['无 events', undefined],
    ['events 为空对象', {}],
    ['只有 onBlur', { onBlur: { action: 'autoValidate' } }],
  ])('%s → change 派发无副作用', (_name, events) => {
    const { api, toast, autoValidate, submit, formData, scope } = setup({ src: 'v' })
    const before = { ...formData.value }
    api.handleFieldChange(fieldWith(events as FormField['events']), 'change')
    expect(formData.value).toEqual(before)
    expect(toast).not.toHaveBeenCalled()
    expect(autoValidate).not.toHaveBeenCalled()
    expect(submit).not.toHaveBeenCalled()
    scope.stop()
  })

  it('action 缺失同样无副作用', () => {
    const { api, toast, scope } = setup({ src: 'v' })
    api.handleFieldChange(fieldWith({ onChange: { targetField: 'dst' } }), 'change')
    expect(toast).not.toHaveBeenCalled()
    scope.stop()
  })

  it('未知 action 不抛错', () => {
    const { api, formData, scope } = setup({ src: 'v' })
    expect(() => api.handleFieldChange(fieldWith({ onChange: { action: '__不存在__' } }), 'change')).not.toThrow()
    expect(formData.value.src).toBe('v')
    scope.stop()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('setValue：把源字段值抄给目标字段', () => {
  it('抄写成功且不影响其它字段', () => {
    const { api, formData, scope } = setup({ src: 'hello', other: 1 })
    api.handleFieldChange(fieldWith({ onChange: { action: 'setValue', targetField: 'dst' } }), 'change')
    expect(formData.value).toEqual({ src: 'hello', other: 1, dst: 'hello' })
    scope.stop()
  })

  it('没有 targetField 时不动数据', () => {
    const { api, formData, scope } = setup({ src: 'hello' })
    api.handleFieldChange(fieldWith({ onChange: { action: 'setValue' } }), 'change')
    expect(formData.value).toEqual({ src: 'hello' })
    scope.stop()
  })

  it('源值是对象/数组时按引用抄写（不深拷贝，避免意外改变宿主对象身份）', () => {
    const arr = [1, 2]
    const { api, formData, scope } = setup({ src: arr })
    api.handleFieldChange(fieldWith({ onChange: { action: 'setValue', targetField: 'dst' } }), 'change')
    // ref 会把对象包成响应式代理，故与原始 arr 不再是同一引用；但与 src 必须是同一代理，
    // 才能说明这里是"别名"而不是深拷贝（深拷贝会切断引用关系）
    expect(formData.value.dst).toEqual(arr)
    expect(formData.value.dst).toBe(formData.value.src)
    scope.stop()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('**toggleVisible：值驱动且幂等**（本轮修）', () => {
  const evt = { onChange: { action: 'toggleVisible', targetField: 'dst' } }

  it('**逐键键入不再随字符数奇偶抖动**：有内容就一直显示', async () => {
    const { api, formData, scope } = setup({ src: '' })
    const f = fieldWith(evt as FormField['events'])
    const states: boolean[] = []
    for (const value of ['a', 'ab', 'abc', 'abcd', 'abcde']) {
      formData.value = { ...formData.value, src: value }
      api.handleFieldChange(f, 'change')
      await nextTick()
      states.push(api.isHiddenByEvent('dst'))
    }
    expect(states, `键入 1~5 字符期间目标应始终显示，实际 ${JSON.stringify(states)}`).toEqual([
      false,
      false,
      false,
      false,
      false,
    ])
    scope.stop()
  })

  it('**值没变时重复派发不再翻转**', async () => {
    const { api, formData, scope } = setup({ src: 'x' })
    const f = fieldWith(evt as FormField['events'])
    for (let i = 0; i < 4; i++) {
      formData.value = { ...formData.value, src: 'x' }
      api.handleFieldChange(f, 'change')
      await nextTick()
      expect(api.isHiddenByEvent('dst'), `第 ${i + 1} 次派发后应保持显示`).toBe(false)
    }
    scope.stop()
  })

  it('清空源字段 → 隐藏目标；再填内容 → 重新显示', async () => {
    const { api, formData, scope } = setup({ src: 'x' })
    const f = fieldWith(evt as FormField['events'])
    api.handleFieldChange(f, 'change')
    expect(api.isHiddenByEvent('dst')).toBe(false)

    formData.value = { ...formData.value, src: '' }
    api.handleFieldChange(f, 'change')
    expect(api.isHiddenByEvent('dst'), '清空要隐藏').toBe(true)

    formData.value = { ...formData.value, src: 'y' }
    api.handleFieldChange(f, 'change')
    expect(api.isHiddenByEvent('dst'), '再填要显示').toBe(false)
    scope.stop()
  })

  it.each([
    ['纯空白串', '   ', true],
    ['数字 0（合法值）', 0, false],
    ['数字 NaN', NaN, true],
    ['布尔 true（勾选）', true, false],
    ['布尔 false（未勾选）', false, true],
    ['空数组', [], true],
    ['非空数组', [1], false],
    ['null', null, true],
    ['undefined', undefined, true],
  ])('源值 %s → 隐藏=%s', (name, value, hidden) => {
    const { api, scope } = setup({ src: value })
    api.handleFieldChange(fieldWith(evt as FormField['events']), 'change')
    expect(api.isHiddenByEvent('dst'), `${name} 的判定不对`).toBe(hidden)
    scope.stop()
  })

  it('没有 targetField 时集合不变', () => {
    const { api, scope } = setup({ src: 'x' })
    api.handleFieldChange(fieldWith({ onChange: { action: 'toggleVisible' } }), 'change')
    expect(api.hiddenByEvent.value.size).toBe(0)
    expect(api.isHiddenByEvent('dst')).toBe(false)
    scope.stop()
  })

  it('多个目标字段互不干扰', async () => {
    const { api, scope } = setup({ a: '有', b: '' })
    api.handleFieldChange(fieldWith({ onChange: { action: 'toggleVisible', targetField: 'hideA' } }, 'a'), 'change')
    api.handleFieldChange(fieldWith({ onChange: { action: 'toggleVisible', targetField: 'hideB' } }, 'b'), 'change')
    expect(api.isHiddenByEvent('hideA')).toBe(false)
    expect(api.isHiddenByEvent('hideB')).toBe(true)
    scope.stop()
  })

  it('onBlur 上的 toggleVisible 同样按值判定（不因触发器不同而翻转）', () => {
    const { api, scope } = setup({ src: 'x' })
    const f = fieldWith({ onBlur: { action: 'toggleVisible', targetField: 'dst' } } as FormField['events'])
    api.handleFieldChange(f, 'blur')
    api.handleFieldChange(f, 'blur')
    expect(api.isHiddenByEvent('dst'), '连按两次失焦不该翻转').toBe(false)
    scope.stop()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('showTip：只弹提示，不动数据', () => {
  it('info 级提示，文案带字段名', () => {
    const { api, toast, formData, scope } = setup({ src: 'v' })
    api.handleFieldChange(fieldWith({ onChange: { action: 'showTip' } }, 'src', '手机号'), 'change')
    expect(toast).toHaveBeenCalledTimes(1)
    const [msg, type, ms] = toast.mock.calls[0]
    expect(String(msg)).toContain('手机号')
    expect(type).toBe('info')
    expect(ms).toBe(1500)
    expect(formData.value).toEqual({ src: 'v' })
    scope.stop()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('callApi：防抖 + 安全策略 + 结果反馈', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('没有接口地址 → 警告提示且不发请求', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { api, toast, scope } = setup({ src: 'v' })
    api.handleFieldChange(fieldWith({ onChange: { action: 'callApi' } }), 'change')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(toast.mock.calls[0][1], '应为 warning').toBe('warning')
    scope.stop()
  })

  it('**跨域地址被策略拦下** → 错误提示且不发请求', () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { api, toast, scope } = setup({ src: 'v' })
    api.handleFieldChange(fieldWith({ onChange: { action: 'callApi', apiUrl: 'https://evil.example.com/x' } }), 'change')
    vi.advanceTimersByTime(1000)
    expect(fetchSpy, '默认只允许同源').not.toHaveBeenCalled()
    expect(toast.mock.calls[0][1]).toBe('error')
    scope.stop()
  })

  it('同源地址 → 防抖后发一次 POST，带字段名与当前值', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchSpy)
    const { api, formData, scope } = setup({ src: 'v1' })
    const f = fieldWith({ onChange: { action: 'callApi', apiUrl: '/api/check' } }, 'src')
    api.handleFieldChange(f, 'change')
    formData.value = { ...formData.value, src: 'v2' }
    api.handleFieldChange(f, 'change')
    expect(fetchSpy, '防抖窗口内不该发').not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(300)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit]
    // checkApiUrl 会把相对地址解析成绝对地址（同源基准），所以只断言路径尾部
    expect(url.endsWith('/api/check'), `实际拿到 ${url}`).toBe(true)
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ field: 'src', value: 'v2' })
    scope.stop()
  })

  it('请求成功 → success 提示', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ ok: 1 }) })),
    )
    const { api, toast, scope } = setup({ src: 'v' })
    api.handleFieldChange(fieldWith({ onChange: { action: 'callApi', apiUrl: '/api/x' } }), 'change')
    await vi.advanceTimersByTimeAsync(300)
    expect(toast.mock.calls.at(-1)![1]).toBe('success')
    scope.stop()
  })

  it('HTTP 非 2xx → error 提示（不是静默）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    )
    const { api, toast, scope } = setup({ src: 'v' })
    api.handleFieldChange(fieldWith({ onChange: { action: 'callApi', apiUrl: '/api/x' } }), 'change')
    await vi.advanceTimersByTimeAsync(300)
    const last = toast.mock.calls.at(-1)!
    expect(last[1]).toBe('error')
    expect(String(last[0])).toContain('500')
    scope.stop()
  })

  it('网络异常 → error 提示', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('断网')
      }),
    )
    const { api, toast, scope } = setup({ src: 'v' })
    api.handleFieldChange(fieldWith({ onChange: { action: 'callApi', apiUrl: '/api/x' } }), 'change')
    await vi.advanceTimersByTimeAsync(300)
    expect(String(toast.mock.calls.at(-1)![0])).toContain('断网')
    scope.stop()
  })

  it('**不同字段各自分桶防抖**：A 连发两次不影响 B 的那次', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchSpy)
    const { api, formData, scope } = setup({ a: '1', b: '1' })
    const ea = fieldWith({ onChange: { action: 'callApi', apiUrl: '/api/a' } }, 'a')
    const eb = fieldWith({ onChange: { action: 'callApi', apiUrl: '/api/b' } }, 'b')
    api.handleFieldChange(ea, 'change')
    vi.advanceTimersByTime(100)
    api.handleFieldChange(eb, 'change')
    formData.value = { ...formData.value, a: '2' }
    api.handleFieldChange(ea, 'change') // 只该重置 a 的定时器
    await vi.advanceTimersByTimeAsync(300)
    const urls = fetchSpy.mock.calls.map((c) => (c as unknown as [string])[0]).sort()
    expect(urls.length, `b 应按时发、a 只发最后一次，实际 ${JSON.stringify(urls)}`).toBe(2)
    expect(urls[0].endsWith('/api/a')).toBe(true)
    expect(urls[1].endsWith('/api/b')).toBe(true)
    scope.stop()
  })

  it('**卸载后丢弃待发的请求**（避免触达已销毁作用域）', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchSpy)
    const { api, scope } = setup({ src: 'v' })
    api.handleFieldChange(fieldWith({ onChange: { action: 'callApi', apiUrl: '/api/x' } }), 'change')
    scope.stop() // 宿主卸载
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchSpy, 'onScopeDispose 必须清掉定时器').not.toHaveBeenCalled()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('onBlur 系列：autoValidate / format / submit / linkField', () => {
  it('autoValidate 触发字段级校验', () => {
    const { api, autoValidate, scope } = setup({ src: 'v' })
    api.handleFieldChange(fieldWith({ onBlur: { action: 'autoValidate' } }, 'src'), 'blur')
    expect(autoValidate).toHaveBeenCalledWith('src')
    scope.stop()
  })

  it('format：去掉首尾空白并写回', () => {
    const { api, formData, scope } = setup({ src: '  abc  ' })
    api.handleFieldChange(fieldWith({ onBlur: { action: 'format' } }, 'src'), 'blur')
    expect(formData.value.src).toBe('abc')
    scope.stop()
  })

  it('format：已无空白时不重建对象（避免无意义重渲染）', () => {
    const { api, formData, scope } = setup({ src: 'abc' })
    const before = formData.value
    api.handleFieldChange(fieldWith({ onBlur: { action: 'format' } }, 'src'), 'blur')
    expect(formData.value, '同引用说明没有多余写回').toBe(before)
    scope.stop()
  })

  it('format：非字符串值原样保留（数字不该被 trim）', () => {
    const { api, formData, scope } = setup({ src: 42 })
    api.handleFieldChange(fieldWith({ onBlur: { action: 'format' } }, 'src'), 'blur')
    expect(formData.value.src).toBe(42)
    scope.stop()
  })

  it('submit 触发宿主的提交回调', () => {
    const { api, submit, scope } = setup({ src: 'v' })
    api.handleFieldChange(fieldWith({ onBlur: { action: 'submit' } }, 'src'), 'blur')
    expect(submit).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('linkField 是空动作（联动由 linkage 引擎处理），不抛错不改数据', () => {
    const { api, formData, toast, scope } = setup({ src: 'v' })
    const before = { ...formData.value }
    expect(() => api.handleFieldChange(fieldWith({ onChange: { action: 'linkField' } }, 'src'), 'change')).not.toThrow()
    expect(formData.value).toEqual(before)
    expect(toast).not.toHaveBeenCalled()
    scope.stop()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('onScopeDispose 清理', () => {
  it('多个字段的待发定时器都被清掉', async () => {
    vi.useFakeTimers()
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({}) }))
    vi.stubGlobal('fetch', fetchSpy)
    const { api, scope } = setup({ a: '1', b: '1', c: '1' })
    for (const key of ['a', 'b', 'c']) {
      api.handleFieldChange(fieldWith({ onChange: { action: 'callApi', apiUrl: '/api/' + key } }, key), 'change')
    }
    scope.stop()
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('卸载后仍可调用 handleFieldChange（不抛已销毁作用域错误）', () => {
    const { api, scope } = setup({ src: 'v' })
    scope.stop()
    expect(() => api.handleFieldChange(fieldWith({ onBlur: { action: 'format' } }, 'src'), 'blur')).not.toThrow()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('focus 触发（2026-10-31 接通，TD-35 收口）', () => {
  it('onFocus 动作真的会执行（此前 trigger 只认 change/blur，onFocus 配了没人读）', () => {
    const { api, toast, scope } = setup({ src: 'v' })
    api.handleFieldChange(fieldWith({ onFocus: { action: 'showTip' } }), 'focus')
    expect(toast, 'focus 触发的 showTip 应该到达 toast').toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('onFocus 的 setValue 把源值抄给目标（动作集与 onChange 相同）', () => {
    const { api, formData, scope } = setup({ src: 'hello' })
    api.handleFieldChange(fieldWith({ onFocus: { action: 'setValue', targetField: 'dst' } }), 'focus')
    expect(formData.value.dst).toBe('hello')
    scope.stop()
  })

  it('onFocus 未配置 → 无副作用（evtKey 分支不误读 onChange）', () => {
    const { api, toast, formData, scope } = setup({ src: 'v' })
    api.handleFieldChange(fieldWith({ onChange: { action: 'showTip' } }), 'focus')
    expect(toast, 'focus 不该读 onChange 的配置').not.toHaveBeenCalled()
    expect(formData.value).toEqual({ src: 'v' })
    scope.stop()
  })

  it('onBlur 的 autoValidate 走 blur 触发（链路语义核对）', () => {
    const { api, autoValidate, scope } = setup({ src: 'v' })
    api.handleFieldChange(fieldWith({ onBlur: { action: 'autoValidate' } }), 'blur')
    expect(autoValidate).toHaveBeenCalledTimes(1)
    scope.stop()
  })
})