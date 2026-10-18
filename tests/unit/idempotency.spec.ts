// idempotency：提交幂等键（H.1 第 3 项）
//
// 为什么客户端守卫不够：FormBuilder 的 `submitting` 有 3 秒硬上限，且网络超时时请求可能
// 已经到达服务端——两种情况都会让「同一次提交」在服务端变成两条记录。
// 幂等键的正确语义是：**一次逻辑提交期间键不变（失败重试仍带同一个键），成功后才换新键**。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ref } from 'vue'
import {
  createIdempotencyKey,
  makeIdempotencyKey,
  setIdempotencyKeyFactory,
  IDEMPOTENCY_HEADER,
} from '@/components/form-builder/idempotency'
import { useFormRemote } from '@/components/form-builder/useFormRemote'

afterEach(() => {
  setIdempotencyKeyFactory(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('createIdempotencyKey', () => {
  it('非空且形状合理', () => {
    const k = createIdempotencyKey()
    expect(typeof k).toBe('string')
    expect(k.length).toBeGreaterThan(8)
  })

  it('批量生成不撞车（幂等键的最低要求）', () => {
    const set = new Set(Array.from({ length: 2000 }, () => createIdempotencyKey()))
    expect(set.size).toBe(2000)
  })

  it('宿主可替换生成器（如接入统一 traceId）', () => {
    setIdempotencyKeyFactory(() => 'fixed-key-1')
    expect(makeIdempotencyKey()).toBe('fixed-key-1')
    setIdempotencyKeyFactory(null)
    expect(makeIdempotencyKey()).not.toBe('fixed-key-1')
  })
})

describe('submitRemote：幂等键的复用与轮换', () => {
  const okRes = () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown as Response
  const badRes = (s = 500) => ({ ok: false, status: s, json: async () => ({}) }) as unknown as Response

  function setup(fetchImpl: ReturnType<typeof vi.fn>) {
    vi.stubGlobal('fetch', fetchImpl)
    const submitConfig = ref({ saveUrl: '/api/save' })
    const formData = ref<Record<string, unknown>>({ name: 'x' })
    const api = useFormRemote(
      submitConfig as never,
      formData as never,
      () => [],
      () => {},
      () => {},
      (e: string) => e,
    )
    return api
  }

  const keyOf = (call: unknown[]) => (call[1] as RequestInit).headers as Record<string, string>

  it('提交带上 Idempotency-Key 头', async () => {
    const fetchImpl = vi.fn(async () => okRes())
    const api = setup(fetchImpl)
    await api.submitRemote({ name: 'a' })
    const h = keyOf(fetchImpl.mock.calls[0])
    expect(h[IDEMPOTENCY_HEADER]).toBeTruthy()
  })

  it('失败后重试 → 同一个键（服务端可据此去重）', async () => {
    const fetchImpl = vi.fn(async () => badRes(500))
    const api = setup(fetchImpl)

    await expect(api.submitRemote({ name: 'a' })).rejects.toThrow()
    await expect(api.submitRemote({ name: 'a' })).rejects.toThrow()

    const k1 = keyOf(fetchImpl.mock.calls[0])[IDEMPOTENCY_HEADER]
    const k2 = keyOf(fetchImpl.mock.calls[1])[IDEMPOTENCY_HEADER]
    expect(k2, '同一次提交的重试必须复用同一个键').toBe(k1)
    expect(api.currentIdempotencyKey()).toBe(k1)
  })

  it('成功后 → 下一次提交换新键（不被误判成重复）', async () => {
    const fetchImpl = vi.fn(async () => okRes())
    const api = setup(fetchImpl)

    await api.submitRemote({ name: 'a' })
    const k1 = keyOf(fetchImpl.mock.calls[0])[IDEMPOTENCY_HEADER]
    expect(api.currentIdempotencyKey(), '成功应清空挂起键').toBeNull()

    await api.submitRemote({ name: 'b' })
    const k2 = keyOf(fetchImpl.mock.calls[1])[IDEMPOTENCY_HEADER]
    expect(k2).not.toBe(k1)
  })

  it('失败 → 成功：键在成功前保持不变，成功后清空', async () => {
    let fail = true
    const fetchImpl = vi.fn(async () => (fail ? badRes(500) : okRes()))
    const api = setup(fetchImpl)

    await expect(api.submitRemote({ name: 'a' })).rejects.toThrow()
    const k1 = api.currentIdempotencyKey()
    expect(k1).toBeTruthy()

    fail = false
    await api.submitRemote({ name: 'a' })
    expect(keyOf(fetchImpl.mock.calls[1])[IDEMPOTENCY_HEADER]).toBe(k1)
    expect(api.currentIdempotencyKey()).toBeNull()
  })

  it('提交地址被安全策略拒绝时不产生请求，也不占用幂等键', async () => {
    const fetchImpl = vi.fn(async () => okRes())
    vi.stubGlobal('fetch', fetchImpl)
    const submitConfig = ref({ saveUrl: 'https://attacker.example/save' })
    const formData = ref<Record<string, unknown>>({})
    const api = useFormRemote(
      submitConfig as never,
      formData as never,
      () => [],
      () => {},
      () => {},
      (e: string) => e,
    )
    await expect(api.submitRemote({})).rejects.toThrow(/安全策略拒绝/)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(api.currentIdempotencyKey()).toBeNull()
  })
})
