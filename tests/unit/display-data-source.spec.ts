// display-data-source：展示类字段的数据源解析（业务方选定：静态 / 绑定字段 / 接口 三种都要）
//
// 三种模式各自对应真实用法，本文件逐条锁定；另锁两条容易写坏的：
//   · api 模式必须复用**同一套外发守卫**（默认同源）——不给展示类开新口子
//   · 切换数据源时**迟到结果不得覆盖新结果**（同类竞态在分享码切换上已经栽过一次）
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick, ref } from 'vue'
import {
  extractByPath,
  toRows,
  useDisplayData,
  type DisplayDataSource,
} from '@/components/form-builder/display-data-source'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('extractByPath · 点路径取值', () => {
  it('不传路径 → 原样返回', () => {
    expect(extractByPath({ a: 1 }, undefined)).toEqual({ a: 1 })
  })
  it('多级路径', () => {
    expect(extractByPath({ data: { rows: [1, 2] } }, 'data.rows')).toEqual([1, 2])
  })
  it('路径缺失 → undefined（不抛错）', () => {
    expect(extractByPath({ data: {} }, 'data.rows')).toBeUndefined()
    expect(extractByPath(null, 'a.b')).toBeUndefined()
    expect(extractByPath({ a: 1 }, 'a.b.c')).toBeUndefined()
  })
})

describe('toRows · 归一化成行数组', () => {
  it('数组原样', () => {
    expect(toRows([{ a: 1 }])).toEqual([{ a: 1 }])
  })
  it('对象上的 rows/list/items/data 数组会被取出', () => {
    expect(toRows({ rows: [1] })).toEqual([1])
    expect(toRows({ list: [2] })).toEqual([2])
    expect(toRows({ items: [3] })).toEqual([3])
    expect(toRows({ data: [4] })).toEqual([4])
  })
  it('普通对象包成单行（表格至少显示一行，好过空白）', () => {
    expect(toRows({ total: 3 })).toEqual([{ total: 3 }])
  })
  it('null / 原始值 → 空数组', () => {
    expect(toRows(null)).toEqual([])
    expect(toRows(undefined)).toEqual([])
    expect(toRows('abc')).toEqual([])
    expect(toRows(42)).toEqual([])
  })
})

/** 把 composable 放进真实组件里跑（onMounted / watch 才生效） */
function mountDisplay(source: () => DisplayDataSource | undefined, formData: () => Record<string, unknown>, opts: { fetcher?: typeof fetch; policy?: () => Record<string, unknown> } = {}) {
  let api!: ReturnType<typeof useDisplayData>
  const w = mount(
    defineComponent({
      setup() {
        api = useDisplayData({
          source,
          formData: formData as never,
          fetcher: opts.fetcher,
          apiUrlPolicy: opts.policy as never,
        })
        return () => h('div', `${api.rows.value.length}|${api.error.value ?? ''}`)
      },
    }),
  )
  return { w, api }
}

describe('static 静态配置', () => {
  it('直接使用配置里的数据', async () => {
    const { api } = mountDisplay(
      () => ({ kind: 'static', staticData: [{ a: 1 }, { a: 2 }] }),
      () => ({}),
    )
    await vi.waitFor(() => expect(api.rows.value).toHaveLength(2))
    expect(api.error.value).toBeNull()
  })
})

describe('field 绑定字段', () => {
  it('取绑定字段的当前值', async () => {
    const data = ref<Record<string, unknown>>({ lines: [{ x: 1 }] })
    const { api } = mountDisplay(() => ({ kind: 'field', fieldKey: 'lines' }), () => data.value)
    await vi.waitFor(() => expect(api.rows.value).toHaveLength(1))

    // 随填随变：绑定值改了，展示跟着变（这是 field 模式存在的全部意义）
    data.value = { lines: [{ x: 1 }, { x: 2 }, { x: 3 }] }
    await vi.waitFor(() => expect(api.rows.value).toHaveLength(3))
  })

  it('绑定字段为空 → 空行且不报错', async () => {
    const { api } = mountDisplay(() => ({ kind: 'field', fieldKey: 'missing' }), () => ({}))
    await nextTick()
    expect(api.rows.value).toEqual([])
    expect(api.error.value).toBeNull()
  })
})

describe('api 接口拉取', () => {
  const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as unknown as Response

  it('GET 拉取 + dataPath 提取 + 归一化', async () => {
    const fetcher = vi.fn(async () => ok({ data: { rows: [{ id: 1 }, { id: 2 }] } }))
    const { api } = mountDisplay(
      () => ({ kind: 'api', apiUrl: '/api/rows', dataPath: 'data.rows' }),
      () => ({}),
      { fetcher: fetcher as never },
    )
    await vi.waitFor(() => expect(api.rows.value).toHaveLength(2))
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(api.rows.value).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('非 2xx → error 有值且清空数据（不保留陈旧数据）', async () => {
    const fetcher = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response)
    const { api } = mountDisplay(() => ({ kind: 'api', apiUrl: '/api/rows' }), () => ({}), {
      fetcher: fetcher as never,
    })
    await vi.waitFor(() => expect(api.error.value).toContain('500'))
    expect(api.rows.value, '失败时不得留着上一次的数字').toEqual([])
  })

  it('未配地址 → 明确提示，不发请求', async () => {
    const fetcher = vi.fn()
    const { api } = mountDisplay(() => ({ kind: 'api', apiUrl: '' }), () => ({}), { fetcher: fetcher as never })
    await nextTick()
    await vi.waitFor(() => expect(api.error.value).toContain('未配置'))
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('跨域地址默认被拦下：进 error 且**不发请求**（与提交/联动同一套守卫）', async () => {
    const fetcher = vi.fn()
    const { api } = mountDisplay(
      () => ({ kind: 'api', apiUrl: 'https://attacker.example/rows' }),
      () => ({}),
      { fetcher: fetcher as never },
    )
    await vi.waitFor(() => expect(api.error.value).toMatch(/安全策略拒绝/))
    expect(fetcher, '被策略拒绝就绝不能发出去').not.toHaveBeenCalled()
  })

  it('宿主显式放行后同一地址可正常拉取', async () => {
    const fetcher = vi.fn(async () => ok([{ a: 1 }]))
    const { api } = mountDisplay(
      () => ({ kind: 'api', apiUrl: 'https://cdn.example/rows' }),
      () => ({}),
      { fetcher: fetcher as never, policy: () => ({ allowCrossOrigin: true, allowlist: ['https://cdn.example'] }) },
    )
    await vi.waitFor(() => expect(api.rows.value).toHaveLength(1))
  })

  it('POST 模式带 JSON 体', async () => {
    const fetcher = vi.fn(async () => ok([]))
    mountDisplay(() => ({ kind: 'api', apiUrl: '/api/q', method: 'POST', body: { q: 1 } }), () => ({}), {
      fetcher: fetcher as never,
    })
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalled())
    const init = (fetcher.mock.calls[0] as unknown[])[1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.body).toBe(JSON.stringify({ q: 1 }))
  })
})

describe('竞态：迟到结果不得覆盖新结果', () => {
  it('连续切换数据源，只保留最后一次的结果', async () => {
    let release: (() => void) | null = null
    const slow = new Promise<void>((r) => (release = r))
    const fetcher = vi.fn(async (url: string) => {
      if (String(url).includes('slow')) {
        await slow
        return { ok: true, status: 200, json: async () => [{ from: 'slow' }] } as unknown as Response
      }
      return { ok: true, status: 200, json: async () => [{ from: 'fast' }] } as unknown as Response
    })

    const src = ref<DisplayDataSource>({ kind: 'api', apiUrl: '/slow' })
    const { api } = mountDisplay(() => src.value, () => ({}), { fetcher: fetcher as never })
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))

    // 第一个请求还挂着，就切到第二个源
    src.value = { kind: 'api', apiUrl: '/fast' }
    await vi.waitFor(() => expect(api.rows.value).toEqual([{ from: 'fast' }]))

    // 放行慢请求：它的结果必须被丢弃
    release?.()
    await new Promise((r) => setTimeout(r, 30))
    expect(api.rows.value, '慢请求的迟到结果不得覆盖').toEqual([{ from: 'fast' }])
  })
})
