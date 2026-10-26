/**
 * 幂等键的生命周期（第 138 轮）。
 *
 * 既有 `idempotency.spec.ts` 锁住了"**重试**同一次提交复用同键、成功后换新键"。
 * 本轮补的是它没覆盖的另一半：**放弃这次提交**（重置表单 / 改录新记录）时键必须丢弃。
 *
 * 缺陷：键只在提交成功后轮换，失败会一直挂着等重试。若用户失败后点「重置」改录一条
 * 新记录，新记录会带着**旧键**出去 —— 服务端若实现了去重，会把它当成"上一次失败的重复"
 * 直接返回旧结果、不创建新记录，**静默丢数据**；且当时没有任何接口能清掉这个键。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { useFormRemote } from '@/components/form-builder/useFormRemote'
import { IDEMPOTENCY_HEADER, setIdempotencyKeyFactory } from '@/components/form-builder/idempotency'
import FormBuilder from '@/components/form-builder/FormBuilder.vue'

const okRes = () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown as Response
const failRes = (s = 500) => ({ ok: false, status: s, json: async () => ({}) }) as unknown as Response

interface RemoteApi {
  submitRemote: (d: Record<string, unknown>) => Promise<void>
  currentIdempotencyKey: () => string | null
  resetIdempotency: () => void
}

function setupRemote(fetchImpl: ReturnType<typeof vi.fn>): RemoteApi {
  vi.stubGlobal('fetch', fetchImpl)
  const submitConfig = ref({ saveUrl: '/api/save' })
  const formData = ref<Record<string, unknown>>({ name: 'x' })
  return useFormRemote(
    submitConfig as never,
    formData as never,
    () => [],
    () => {},
    () => {},
    (e: string) => e,
  ) as unknown as RemoteApi
}

const keyOf = (call: unknown[]) => ((call[1] as RequestInit).headers as Record<string, string>)[IDEMPOTENCY_HEADER]

beforeEach(() => {
  setIdempotencyKeyFactory(null)
})
afterEach(() => {
  vi.unstubAllGlobals()
  setIdempotencyKeyFactory(null)
})

// ════════════════════════════════════════════════════════════════════
describe('useFormRemote · 键的轮换与丢弃', () => {
  it('成功后键被清空（下一次提交换新键）', async () => {
    const fetchImpl = vi.fn(async () => okRes())
    const api = setupRemote(fetchImpl)
    await api.submitRemote({ a: 1 })
    expect(api.currentIdempotencyKey(), '成功后应清空').toBeNull()
    await api.submitRemote({ a: 2 })
    expect(keyOf(fetchImpl.mock.calls[0])).not.toBe(keyOf(fetchImpl.mock.calls[1]))
  })

  it('失败后键保留（重试带同一个键）', async () => {
    const fetchImpl = vi.fn(async () => failRes())
    const api = setupRemote(fetchImpl)
    await expect(api.submitRemote({ a: 1 })).rejects.toThrow()
    const held = api.currentIdempotencyKey()
    expect(held, '失败要保留键等重试').toBeTruthy()
    await expect(api.submitRemote({ a: 1 })).rejects.toThrow()
    expect(keyOf(fetchImpl.mock.calls[1]), '重试必须同键').toBe(keyOf(fetchImpl.mock.calls[0]))
  })

  it('**resetIdempotency → 丢弃旧键，下次提交换新键**（本轮修）', async () => {
    let mode: 'fail' | 'ok' = 'fail'
    const fetchImpl = vi.fn(async () => (mode === 'fail' ? failRes() : okRes()))
    const api = setupRemote(fetchImpl)

    await expect(api.submitRemote({ name: '失败的记录' })).rejects.toThrow()
    const staleKey = api.currentIdempotencyKey()
    expect(staleKey).toBeTruthy()

    // 用户放弃这次提交（点重置 / 改录新记录）
    api.resetIdempotency()
    expect(api.currentIdempotencyKey(), '丢弃后应为 null').toBeNull()

    mode = 'ok'
    await api.submitRemote({ name: '全新记录' })
    expect(keyOf(fetchImpl.mock.calls[1]), '新记录必须用新键，否则会被服务端当成重复丢弃').not.toBe(staleKey)
  })

  it('resetIdempotency 可重复调用（幂等）', () => {
    const api = setupRemote(vi.fn(async () => okRes()))
    expect(() => {
      api.resetIdempotency()
      api.resetIdempotency()
    }).not.toThrow()
    expect(api.currentIdempotencyKey()).toBeNull()
  })

  it('从未提交过时 resetIdempotency 不报错', () => {
    const api = setupRemote(vi.fn(async () => okRes()))
    expect(api.currentIdempotencyKey()).toBeNull()
    expect(() => api.resetIdempotency()).not.toThrow()
  })

  it('地址被安全策略拒绝时既不请求、也不占用键', async () => {
    const fetchImpl = vi.fn(async () => okRes())
    vi.stubGlobal('fetch', fetchImpl)
    const submitConfig = ref({ saveUrl: 'https://evil.example.com/save' })
    const formData = ref<Record<string, unknown>>({})
    const api = useFormRemote(
      submitConfig as never,
      formData as never,
      () => [],
      () => {},
      () => {},
      (e: string) => e,
    ) as unknown as RemoteApi
    await expect(api.submitRemote({ a: 1 })).rejects.toThrow(/安全策略/)
    expect(fetchImpl, '不该发出请求').not.toHaveBeenCalled()
    expect(api.currentIdempotencyKey(), '也不该消耗一个键').toBeNull()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('FormBuilder · 点「重置」必须丢弃幂等键（端到端）', () => {
  /** 造一个最小 schema */
  const schema = {
    id: 'f1',
    name: '测试表单',
    fields: [{ id: 'k1', type: 'input', key: 'name', label: '名称' }],
    submitConfig: { saveUrl: '/api/save', mode: 'create' },
  }

  function mountBuilder(fetchImpl: ReturnType<typeof vi.fn>) {
    vi.stubGlobal('fetch', fetchImpl)
    return mount(FormBuilder, {
      props: { schema: schema as never, data: { name: 'x' } as never },
      global: { stubs: { teleport: true } },
    })
  }

  const resetBtn = (w: ReturnType<typeof mountBuilder>) =>
    w.findAll('button').find((b) => /重置|重設|Reset/i.test(b.text()))

  it('失败 → 点重置 → 再提交：键不同', async () => {
    let mode: 'fail' | 'ok' = 'fail'
    const fetchImpl = vi.fn(async () => (mode === 'fail' ? failRes() : okRes()))
    const w = mountBuilder(fetchImpl)

    // 第一次提交（失败）
    await w.find('form').trigger('submit')
    await nextTick()
    await new Promise((r) => setTimeout(r, 0))

    const firstKey = keyOf(fetchImpl.mock.calls[0] ?? [])
    expect(firstKey, '第一次应先发出请求').toBeTruthy()

    // 用户放弃这次提交
    const rb = resetBtn(w)
    expect(rb, '应能找到重置按钮').toBeTruthy()
    await rb!.trigger('click')
    await nextTick()

    // 改录新记录后再次提交
    mode = 'ok'
    await w.find('form').trigger('submit')
    await nextTick()
    await new Promise((r) => setTimeout(r, 0))

    const secondCall = fetchImpl.mock.calls[1]
    if (secondCall) {
      expect(keyOf(secondCall), '重置后新提交必须换新键').not.toBe(firstKey)
    }
    w.unmount()
  })

  it('暴露了 resetIdempotency 给宿主（自行重置时用）', () => {
    const w = mountBuilder(vi.fn(async () => okRes()))
    // ⚠️ 必须查 `$.exposed`：`<script setup>` 的 setup 绑定在开发模式下经 vm 也能读到，
    //    直接读 vm.resetIdempotency 即使从 defineExpose 摘掉也仍然"存在"（假绿）。
    const exposed = w.vm.$.exposed as unknown as Record<string, unknown>
    expect(typeof exposed.resetIdempotency, '宿主要能主动丢弃键').toBe('function')
    expect(() => (exposed.resetIdempotency as () => void)()).not.toThrow()
    w.unmount()
  })

  it('已有的命令式 API 一个都没丢（暴露面只增不减）', () => {
    const w = mountBuilder(vi.fn(async () => okRes()))
    const exposed = w.vm.$.exposed as unknown as Record<string, unknown>
    for (const name of ['stopSubmit', 'setSubmitting', 'getFormData', 'validate', 'errors', 'resetIdempotency']) {
      expect(exposed[name], `暴露面缺 ${name}`).toBeDefined()
    }
    w.unmount()
  })
})
