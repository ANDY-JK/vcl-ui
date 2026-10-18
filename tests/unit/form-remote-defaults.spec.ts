// api 型动态默认值（defaultMeta.type='api'）— 行为锁定
// 背景：P1-5 默认值动态化的最后一个留待项——打开表单时 GET 接口回填默认值
// 覆盖：applyRemoteDefaults 拉取/dataPath/去重/失败降级/超时 + FormBuilder 挂载接线（含用户已填不覆盖）
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { applyRemoteDefaults } from '@/components/form-builder/useFormSchema'
import FormBuilder from '@/components/form-builder/FormBuilder.vue'
import type { FormField, FormSchema } from '@/components/form-builder/types'

function field(over: Partial<FormField>): FormField {
  return { key: 'f1', label: '字段', type: 'text', ...over }
}

/**
 * 本组用例用 `https://x/...` 当跨域占位地址，而 applyRemoteDefaults 现在默认只允许同源
 * （第五轮审查 R5-C3：defaultMeta.apiUrl 可经无签名分享码跨信任边界流入）。
 * 宿主合法使用跨域接口是正常场景，故这里显式给策略——**放开跨域是有意为之，不是绕过校验**。
 */
const CROSS_ORIGIN_POLICY = { allowCrossOrigin: true, allowlist: ['https://x'] }

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('applyRemoteDefaults · 拉取与取值', () => {
  it('GET 拉取 + dataPath 路径取值回填', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ data: { value: '远程值' } }))
    const out = await applyRemoteDefaults(
      [field({ key: 'k', defaultMeta: { type: 'api', apiUrl: 'https://x/api', dataPath: 'data.value' } })],
      { fetcher, apiUrlPolicy: CROSS_ORIGIN_POLICY },
    )
    expect(out.k).toBe('远程值')
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(String(fetcher.mock.calls[0]![0])).toBe('https://x/api')
  })

  it('同 URL 多字段去重：一次请求，各自 dataPath 取值', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ data: { a: 1, b: 'x' } }))
    const out = await applyRemoteDefaults(
      [
        field({ key: 'a', defaultMeta: { type: 'api', apiUrl: 'https://x/api', dataPath: 'data.a' } }),
        field({ key: 'b', defaultMeta: { type: 'api', apiUrl: 'https://x/api', dataPath: 'data.b' } }),
      ],
      { fetcher, apiUrlPolicy: CROSS_ORIGIN_POLICY },
    )
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(out.a).toBe(1)
    expect(out.b).toBe('x')
  })

  it('无 dataPath 取整个响应体（数组可用于多选默认）', async () => {
    const fetcher = vi.fn(async () => jsonResponse(['x', 'y']))
    const out = await applyRemoteDefaults(
      [field({ key: 'k', type: 'checkbox', defaultMeta: { type: 'api', apiUrl: 'https://x/list' } })],
      { fetcher, apiUrlPolicy: CROSS_ORIGIN_POLICY },
    )
    expect(out.k).toEqual(['x', 'y'])
  })

  it('非 JSON 响应按文本回填', async () => {
    const fetcher = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => {
            throw new Error('not json')
          },
          text: async () => 'plain-text',
        }) as unknown as Response,
    )
    const out = await applyRemoteDefaults([field({ defaultMeta: { type: 'api', apiUrl: 'https://x/txt' } })], {
      fetcher, apiUrlPolicy: CROSS_ORIGIN_POLICY,
    })
    expect(out.f1).toBe('plain-text')
  })
})

describe('applyRemoteDefaults · 防御', () => {
  it('请求失败：跳过该字段（不抛错、不回填）', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('boom')
    })
    const out = await applyRemoteDefaults([field({ defaultMeta: { type: 'api', apiUrl: 'https://x/api' } })], {
      fetcher, apiUrlPolicy: CROSS_ORIGIN_POLICY,
    })
    expect(out).toEqual({})
  })

  it('超时：在 timeoutMs 内未响应即放弃（不悬挂）', async () => {
    const fetcher = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )
    const out = await applyRemoteDefaults([field({ defaultMeta: { type: 'api', apiUrl: 'https://x/slow' } })], {
      fetcher, apiUrlPolicy: CROSS_ORIGIN_POLICY,
      timeoutMs: 30,
    })
    expect(out).toEqual({})
  })

  it('对象值/空值路径不回填（无法作为字段默认值）', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ data: { nested: { x: 1 }, empty: null } }))
    const out = await applyRemoteDefaults(
      [
        field({ key: 'a', defaultMeta: { type: 'api', apiUrl: 'https://x/api', dataPath: 'data.nested' } }),
        field({ key: 'b', defaultMeta: { type: 'api', apiUrl: 'https://x/api', dataPath: 'data.empty' } }),
        field({ key: 'c', defaultMeta: { type: 'api', apiUrl: 'https://x/api', dataPath: 'data.miss' } }),
      ],
      { fetcher, apiUrlPolicy: CROSS_ORIGIN_POLICY },
    )
    expect(out).toEqual({})
  })

  it('apiUrl 缺失/无 api 字段：返回空对象且不请求', async () => {
    const fetcher = vi.fn(async () => jsonResponse({}))
    const out = await applyRemoteDefaults(
      [field({ defaultMeta: { type: 'api' } }), field({ defaultMeta: { type: 'currentTime' } }), field({})],
      { fetcher, apiUrlPolicy: CROSS_ORIGIN_POLICY },
    )
    expect(out).toEqual({})
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('FormBuilder · api 默认值挂载接线', () => {
  const schema: FormSchema = {
    meta: { title: '' },
    fields: [
      {
        key: 'k',
        label: 'K',
        type: 'text',
        defaultMeta: { type: 'api', apiUrl: 'https://x/api', dataPath: 'data.value' },
      },
    ],
  }

  it('挂载后异步回填 api 默认值', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ data: { value: 'API默认' } })),
    )
    const w = mount(FormBuilder, { props: { schema, modelValue: {}, apiAllowOrigins: ['https://x'] } })
    await flushPromises()
    const last = w.emitted('update:modelValue')!.at(-1)![0] as Record<string, unknown>
    expect(last.k).toBe('API默认')
    w.unmount()
  })

  it('宿主/用户已填的值不被覆盖', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ data: { value: 'API默认' } })),
    )
    const w = mount(FormBuilder, { props: { schema, modelValue: { k: '用户已填' }, apiAllowOrigins: ['https://x'] } })
    await flushPromises()
    // 守卫生效时无新变更（可能一次 emit 都没有）；若有 emit，最后一条也必须保持用户已填
    const evts = (w.emitted('update:modelValue') ?? []) as [Record<string, unknown>][]
    expect(evts.length === 0 || (evts.at(-1)![0] as Record<string, unknown>).k === '用户已填').toBe(true)
    w.unmount()
  })
})
