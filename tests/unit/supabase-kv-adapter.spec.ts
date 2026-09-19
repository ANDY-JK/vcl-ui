// SupabaseKVAdapter / SupabaseTransport 单元测试：mock 全局 fetch 验证 REST 语义
// 背景：两套云端存储合并后，KV 适配器（CloudKVAdapter 官方实现）建立在共用传输层上，
// 此处锁定请求形态（路径/方法/头/upsert）、miss 语义（400/404 → null）与幂等删除。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { SupabaseTransport, SupabaseKVAdapter, createSupabaseKVAdapter } from '@/components/storage/supabase-transport'

const CFG = { url: 'https://sup.example.com', anonKey: 'anon-key', bucket: 'test-bucket' }

/** 按请求序列返回预设响应的 fetch mock；calls 记录每次请求的 (url, init) */
function installFetch(resps: Array<{ status: number; body?: string }>) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  let i = 0
  const fetchMock = vi.fn(async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init })
    const r = resps[Math.min(i, resps.length - 1)]
    i++
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      text: async () => r.body ?? '',
      json: async () => JSON.parse(r.body || '[]'),
    } as unknown as Response
  })
  vi.stubGlobal('fetch', fetchMock)
  return { calls, fetchMock }
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('SupabaseTransport', () => {
  it('非法配置（缺 bucket）构造即拒绝', () => {
    expect(() => new SupabaseTransport({ url: 'https://x.com', anonKey: 'k', bucket: '' })).toThrow()
  })

  it('request 命中 apikey/Authorization 头与 base 路径', async () => {
    const { calls } = installFetch([{ status: 200 }])
    const tr = new SupabaseTransport(CFG)
    await tr.request('/object/list/test-bucket', { method: 'POST' })
    expect(calls[0].url).toBe('https://sup.example.com/storage/v1/object/list/test-bucket')
    const headers = calls[0].init.headers as Record<string, string>
    expect(headers.apikey).toBe('anon-key')
    expect(headers.Authorization).toBe('Bearer anon-key')
  })

  it('非 ok 状态按归类抛错（400 → bucket 提示）', async () => {
    installFetch([{ status: 400 }])
    const tr = new SupabaseTransport(CFG)
    await expect(tr.request('/object/test-bucket/x', { method: 'DELETE' })).rejects.toThrow(/test-bucket/)
  })
})

describe('SupabaseKVAdapter（CloudKVAdapter 官方实现）', () => {
  it('set：POST x-upsert + JSON 体，对象名 _kv/ 前缀 + 键名 ASCII 化', async () => {
    const { calls } = installFetch([{ status: 200 }])
    const kv = createSupabaseKVAdapter(CFG)
    await kv.set('user:token', { v: 1 })
    const { url, init } = calls[0]
    // 'user:token' 经 sanitizeObjectKeyPart（: → _）成为 user_token
    expect(url).toBe('https://sup.example.com/storage/v1/object/test-bucket/_kv/user_token')
    expect((init.headers as Record<string, string>)['x-upsert']).toBe('true')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(init.body).toBe('{"v":1}')
  })

  it('get 命中：200 → 解析 JSON', async () => {
    installFetch([{ status: 200, body: '{"v":1}' }])
    const kv = createSupabaseKVAdapter(CFG)
    await expect(kv.get('k')).resolves.toEqual({ v: 1 })
  })

  it('get miss：400 → null（不抛错，与权限故障区分）', async () => {
    installFetch([{ status: 400 }])
    const kv = createSupabaseKVAdapter(CFG)
    await expect(kv.get('missing')).resolves.toBeNull()
  })

  it('get miss：404 → null', async () => {
    installFetch([{ status: 404 }])
    const kv = createSupabaseKVAdapter(CFG)
    await expect(kv.get('missing2')).resolves.toBeNull()
  })

  it('get 权限故障（403）：上抛不静默当 miss', async () => {
    installFetch([{ status: 403 }])
    const kv = createSupabaseKVAdapter(CFG)
    await expect(kv.get('k')).rejects.toThrow()
  })

  it('remove：DELETE；对象不存在（400）幂等成功不抛', async () => {
    let status = 200
    const calls: Array<{ url: string; init: RequestInit }> = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, init: RequestInit = {}) => {
        calls.push({ url: String(url), init })
        return {
          ok: status >= 200 && status < 300,
          status,
          text: async () => '',
          json: async () => ({}),
        } as unknown as Response
      }),
    )
    const kv = createSupabaseKVAdapter(CFG)
    await kv.remove('gone')
    expect(calls[0].url).toContain('/object/test-bucket/_kv/gone')
    expect(calls[0].init.method).toBe('DELETE')
    status = 400 // 第二次删除：对象已不存在 → 幂等成功
    await expect(kv.remove('gone')).resolves.toBeUndefined()
  })

  it('结构与 CloudKVAdapter 匹配（get/set/remove 三方法签名）', () => {
    const kv = createSupabaseKVAdapter(CFG)
    expect(typeof kv.get).toBe('function')
    expect(typeof kv.set).toBe('function')
    expect(typeof kv.remove).toBe('function')
    expect(kv).toBeInstanceOf(SupabaseKVAdapter)
  })
})
