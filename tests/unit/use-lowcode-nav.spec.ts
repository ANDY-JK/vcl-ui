/**
 * useLowCodeNav —— 导航外壳的状态层契约
 *
 * 这是"宿主只搭一个导航框架，其余导航项由用户自建"里的**框架那半**。三条来源
 * （static / api / forms）都要能用，且两处易错点必须钉死（都由真实故障模式反推）：
 *
 *  1. **选中态不能悬空**：refresh 后原选中 key 可能已被用户删掉，外壳会去渲染一个
 *     指向不存在项的页面 —— 必须收敛（回落第一个可选项或置空）。
 *  2. **迟到结果不得覆盖新结果**：连续刷新 / 卸载后到达的响应一律丢弃，
 *     否则快速切换数据源会看到旧导航闪回（与 `useDisplayData` 同款 token 处理）。
 *
 * 另外钉住分工边界：本层**只通知选中**（`onSelect`），不碰宿主的路由与数据。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { mountLowCodeHost } from './lowcode-nav-host'
import type { NavSource } from '@/components/form-builder/lowcode/useLowCodeNav'
import type { NavNode } from '@/components/form-builder/lowcode/nav-schema'
import { policyFromOrigins } from '@/components/form-builder/api-url-guard'
import type { FormStore } from '@/components/form-builder/designer/store'

let hosts: ReturnType<typeof mountLowCodeHost>[] = []
const mountHost = (...args: Parameters<typeof mountLowCodeHost>) => {
  const h = mountLowCodeHost(...args)
  hosts.push(h)
  return h
}
const flush = async () => {
  await nextTick()
  await nextTick()
}
/** 造一个假 FormStore（只用到 listForms） */
const fakeStore = (forms: Array<{ id: string; name: string }>, fail?: string): FormStore =>
  ({
    listForms: vi.fn(async () => {
      if (fail) throw new Error(fail)
      return forms.map((f, i) => ({
        id: f.id,
        name: f.name,
        updatedAt: `2026-10-0${i + 1}T00:00:00Z`,
        collectKey: `fd_collect_${f.id}`,
      }))
    }),
    loadForm: vi.fn(async () => null),
    saveForm: vi.fn(async (id: string) => id),
    removeForm: vi.fn(async () => undefined),
  }) as unknown as FormStore

const jsonRes = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response

beforeEach(() => {
  hosts = []
})
afterEach(() => {
  for (const h of hosts) h.wrapper.unmount()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('useLowCodeNav · static 来源', () => {
  it('**挂载即加载并自动选中第一个可选项**', async () => {
    const h = mountHost({
      source: {
        kind: 'static',
        nodes: [
          { key: 'a', label: 'A', kind: 'custom' },
          { key: 'b', label: 'B', kind: 'custom' },
        ],
      },
    })
    await flush()
    expect(h.api.nodes.value.map((n) => n.key)).toEqual(['a', 'b'])
    expect(h.api.selectedKey.value, '默认选中第一个').toBe('a')
    expect(h.api.current.value?.label).toBe('A')
    expect(h.api.loading.value).toBe(false)
    expect(h.api.error.value).toBeNull()
  })

  it('**autoSelect: false → 不替宿主做选中决定**', async () => {
    const h = mountHost({
      source: { kind: 'static', nodes: [{ key: 'a', label: 'A', kind: 'custom' }] },
      autoSelect: false,
    })
    await flush()
    expect(h.api.selectedKey.value).toBeNull()
    expect(h.api.current.value).toBeNull()
  })

  it('**autoLoad: false → 挂载不加载，手动 refresh 才加载**', async () => {
    const h = mountHost({
      source: { kind: 'static', nodes: [{ key: 'a', label: 'A', kind: 'custom' }] },
      autoLoad: false,
    })
    await flush()
    expect(h.api.nodes.value).toEqual([])
    await h.api.refresh()
    expect(h.api.nodes.value.map((n) => n.key)).toEqual(['a'])
  })

  it('**无来源 → 空导航且不报错**（外壳显示空态，不显示假页签）', async () => {
    const h = mountHost({})
    await flush()
    expect(h.api.nodes.value).toEqual([])
    expect(h.api.error.value).toBeNull()
    expect(h.api.current.value).toBeNull()
  })

  it('**非法配置：可用项照常渲染，问题清单同时给**（不静默过滤）', async () => {
    const h = mountHost({
      source: {
        kind: 'static',
        nodes: [
          { key: 'ok', label: 'OK', kind: 'custom' },
          { key: 'bad', label: 'BAD', kind: 'nope' },
          { label: 'NO-KEY', kind: 'custom' },
        ],
      },
    })
    await flush()
    expect(h.api.nodes.value.map((n) => n.key)).toEqual(['ok'])
    expect(h.api.issues.value.map((i) => i.code)).toEqual(['unknown-kind', 'missing-key'])
    expect(h.api.error.value, '校验问题不算加载失败').toBeNull()
  })

  it('**leaves 展平且不含分组**', async () => {
    const h = mountHost({
      source: {
        kind: 'static',
        nodes: [
          { key: 'g', label: 'G', kind: 'group', children: [{ key: 'a', label: 'A', kind: 'custom' }] },
          { key: 'b', label: 'B', kind: 'custom' },
        ],
      },
    })
    await flush()
    expect(h.api.leaves.value.map((n) => n.key)).toEqual(['a', 'b'])
  })
})

describe('useLowCodeNav · 权限过滤（判定交宿主，本层只调）', () => {
  it('**filter 返回 false 的项不进导航**', async () => {
    const h = mountHost({
      source: {
        kind: 'static',
        nodes: [
          { key: 'a', label: 'A', kind: 'custom' },
          { key: 'b', label: 'B', kind: 'custom' },
        ],
      },
      filter: (n: NavNode) => n.key !== 'b',
    })
    await flush()
    expect(h.api.nodes.value.map((n) => n.key)).toEqual(['a'])
    expect(h.api.selectedKey.value).toBe('a')
  })

  it('**分组子项全被过滤 → 分组本身也不出现**（不留空菜单）', async () => {
    const h = mountHost({
      source: {
        kind: 'static',
        nodes: [
          { key: 'g', label: 'G', kind: 'group', children: [{ key: 'x', label: 'X', kind: 'custom' }] },
          { key: 'keep', label: 'K', kind: 'custom' },
        ],
      },
      filter: (n: NavNode) => n.key !== 'x',
    })
    await flush()
    expect(h.api.nodes.value.map((n) => n.key)).toEqual(['keep'])
  })

  it('**分组里还剩可见子项 → 分组保留**', async () => {
    const h = mountHost({
      source: {
        kind: 'static',
        nodes: [
          {
            key: 'g',
            label: 'G',
            kind: 'group',
            children: [
              { key: 'x', label: 'X', kind: 'custom' },
              { key: 'y', label: 'Y', kind: 'custom' },
            ],
          },
        ],
      },
      filter: (n: NavNode) => n.key !== 'x',
    })
    await flush()
    const g = h.api.nodes.value[0] as Extract<NavNode, { kind: 'group' }>
    expect(g.kind).toBe('group')
    expect(g.children.map((c) => c.key)).toEqual(['y'])
  })

  it('**过滤后第一个可选项被选中（不是"原本的第一项"）**', async () => {
    const h = mountHost({
      source: {
        kind: 'static',
        nodes: [
          { key: 'a', label: 'A', kind: 'custom' },
          { key: 'b', label: 'B', kind: 'custom' },
        ],
      },
      filter: (n: NavNode) => n.key !== 'a',
    })
    await flush()
    expect(h.api.selectedKey.value).toBe('b')
  })
})

describe('useLowCodeNav · 选中态与悬空收敛', () => {
  const twoItems: NavSource = {
    kind: 'static',
    nodes: [
      { key: 'a', label: 'A', kind: 'custom' },
      { key: 'b', label: 'B', kind: 'custom' },
    ],
  }

  it('**select 命中 → 返回 true、current 跟着变、onSelect 通知一次**', async () => {
    const h = mountHost({ source: twoItems })
    await flush()
    expect(h.api.select('b')).toBe(true)
    await flush()
    expect(h.api.selectedKey.value).toBe('b')
    expect(h.api.current.value?.key).toBe('b')
    expect(h.selectCalls.map((n) => n.key)).toEqual(['b'])
  })

  it('**分组不可选；不存在的 key 不可选 —— 都返回 false 且不通知**', async () => {
    const h = mountHost({
      source: {
        kind: 'static',
        nodes: [
          { key: 'g', label: 'G', kind: 'group', children: [{ key: 'a', label: 'A', kind: 'custom' }] },
        ],
      },
    })
    await flush()
    expect(h.api.select('g'), '分组自身不可选').toBe(false)
    expect(h.api.select('nope')).toBe(false)
    expect(h.selectCalls).toEqual([])
    expect(h.api.selectedKey.value, '失败不改状态').toBe('a')
  })

  it('**refresh 后原选中项消失 → 收敛到第一个可选项**（否则渲染一个不存在的页）', async () => {
    const nodes = ref<unknown>([
      { key: 'a', label: 'A', kind: 'custom' },
      { key: 'b', label: 'B', kind: 'custom' },
    ])
    const h = mountHost({ source: () => ({ kind: 'static', nodes: nodes.value }) })
    await flush()
    h.api.select('b')
    await flush()
    expect(h.api.current.value?.key).toBe('b')

    nodes.value = [{ key: 'a', label: 'A', kind: 'custom' }] // 用户删掉了 b
    await flush()
    expect(h.api.selectedKey.value, '悬空选中被收敛').toBe('a')
    expect(h.api.current.value?.key).toBe('a')
  })

  it('**收敛在 autoSelect: false 时置空而不是乱选**', async () => {
    const nodes = ref<unknown>([{ key: 'a', label: 'A', kind: 'custom' }])
    const h = mountHost({ source: () => ({ kind: 'static', nodes: nodes.value }), autoSelect: false })
    await flush()
    h.api.select('a')
    await flush()
    nodes.value = [{ key: 'z', label: 'Z', kind: 'custom' }]
    await flush()
    expect(h.api.selectedKey.value).toBeNull()
  })

  it('**当前选中项是分组（异常态）→ current 为 null**（不把分组当页面渲染）', async () => {
    const h = mountHost({
      source: {
        kind: 'static',
        nodes: [
          { key: 'g', label: 'G', kind: 'group', children: [{ key: 'a', label: 'A', kind: 'custom' }] },
        ],
      },
      autoSelect: false,
    })
    await flush()
    h.api.selectedKey.value = 'g' // 宿主/持久化恢复出来的脏值
    await flush()
    expect(h.api.current.value).toBeNull()
  })

  it('**refresh 后原选中项仍在 → 保持不动**（收敛只在悬空时发生，不替用户改选）', async () => {
    const h = mountHost({ source: twoItems })
    await flush()
    h.api.select('b')
    await flush()
    await h.api.refresh()
    await flush()
    expect(h.api.selectedKey.value, '原选中仍有效就不该被重选成第一个').toBe('b')
    expect(h.api.current.value?.key).toBe('b')
  })

  it('**宿主交出 ref 时本层直接写它（单一真源，不做双向回环）**', async () => {
    const h = mountHost({ source: twoItems }, { withModel: true })
    await flush()
    expect(h.selected.value, '首次加载后写的是宿主那枚 ref').toBe('a')
    h.api.select('b')
    await flush()
    expect(h.selected.value).toBe('b')
    expect(h.api.selectedKey.value).toBe('b')
  })
})

describe('useLowCodeNav · api 来源', () => {
  it('**GET 拉导航定义 + dataPath 取数组**', async () => {
    const fetcher = vi.fn(async () =>
      jsonRes({ data: { rows: [{ key: 'a', label: 'A', kind: 'custom' }] } }),
    )
    const h = mountHost({
      source: { kind: 'api', url: '/api/nav', dataPath: 'data.rows' },
      fetcher,
    })
    await flush()
    expect(fetcher).toHaveBeenCalledTimes(1)
    // checkApiUrl 会把相对地址**绝对化**后再返回（守卫的既有行为，这里如实钉住）
    expect(String(fetcher.mock.calls[0]![0])).toBe(`${location.origin}/api/nav`)
    expect(h.api.nodes.value.map((n) => n.key)).toEqual(['a'])
    expect(h.api.error.value).toBeNull()
  })

  it('**POST 带 Content-Type 与 body**', async () => {
    const fetcher = vi.fn(async () => jsonRes([]))
    const h = mountHost({
      source: { kind: 'api', url: '/api/nav', method: 'POST', body: { env: 'prod' } },
      fetcher,
    })
    await flush()
    const init = fetcher.mock.calls[0]![1] as RequestInit
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' })
    expect(init.body).toBe(JSON.stringify({ env: 'prod' }))
    expect(h.api.nodes.value).toEqual([])
  })

  it('**跨源默认被拒：不发请求，error 说明被安全策略拒绝**', async () => {
    const fetcher = vi.fn(async () => jsonRes([]))
    const h = mountHost({ source: { kind: 'api', url: 'https://evil.com/nav' }, fetcher })
    await flush()
    expect(fetcher, '被拒时不该发出请求').not.toHaveBeenCalled()
    expect(h.api.error.value).toContain('安全策略拒绝')
    expect(h.api.nodes.value).toEqual([])
  })

  it('**宿主显式放行的来源可以拉取**（策略来自宿主，不硬编码）', async () => {
    const fetcher = vi.fn(async () => jsonRes([{ key: 'a', label: 'A', kind: 'custom' }]))
    const h = mountHost({
      source: { kind: 'api', url: 'https://api.mycorp.com/nav' },
      apiUrlPolicy: () => policyFromOrigins(['https://api.mycorp.com']),
      fetcher,
    })
    await flush()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(h.api.nodes.value.map((n) => n.key)).toEqual(['a'])
    expect(h.api.error.value).toBeNull()
  })

  it('**HTTP 非 2xx / 网络异常 → error 有值，不崩**', async () => {
    const h1 = mountHost({
      source: { kind: 'api', url: '/api/nav' },
      fetcher: vi.fn(async () => jsonRes({}, 500)),
    })
    await flush()
    expect(h1.api.error.value).toBe('HTTP 500')

    const h2 = mountHost({
      source: { kind: 'api', url: '/api/nav' },
      fetcher: vi.fn(async () => {
        throw new Error('boom')
      }),
    })
    await flush()
    expect(h2.api.error.value).toBe('boom')
  })

  it('**url 运行时缺失（类型说必填、数据不一定）→ 报未配置，不发请求**', async () => {
    const fetcher = vi.fn(async () => jsonRes([]))
    const h = mountHost({
      // 数据来自后端下发时并不受 TS 约束 —— 这里就是那条 `?? ''` 兜底的路径
      source: { kind: 'api', url: undefined as unknown as string },
      fetcher,
    })
    await flush()
    expect(fetcher).not.toHaveBeenCalled()
    expect(h.api.error.value).toContain('未配置导航接口地址')
  })

  it('**POST 不带 body → 发 {}（不是 "undefined" 字符串）**', async () => {
    const fetcher = vi.fn(async () => jsonRes([]))
    mountHost({ source: { kind: 'api', url: '/api/nav', method: 'POST' }, fetcher })
    await flush()
    const init = fetcher.mock.calls[0]![1] as RequestInit
    expect(init.body).toBe('{}')
  })

  it('**缺接口地址 → error 说明未配置（不发请求）**', async () => {
    const fetcher = vi.fn(async () => jsonRes([]))
    const h = mountHost({ source: { kind: 'api', url: '  ' }, fetcher })
    await flush()
    expect(fetcher).not.toHaveBeenCalled()
    expect(h.api.error.value).toContain('未配置导航接口地址')
  })

  it('**加载中 loading 为真，结束后为假**', async () => {
    let resolve!: (v: Response) => void
    const pending = new Promise<Response>((r) => {
      resolve = r
    })
    const h = mountHost({
      source: { kind: 'api', url: '/api/nav' },
      fetcher: vi.fn(() => pending),
    })
    await flush()
    expect(h.api.loading.value).toBe(true)
    resolve(jsonRes([{ key: 'a', label: 'A', kind: 'custom' }]))
    await flush()
    await flush()
    expect(h.api.loading.value).toBe(false)
    expect(h.api.nodes.value.map((n) => n.key)).toEqual(['a'])
  })
})

describe('useLowCodeNav · 竞态与卸载', () => {
  it('**慢的旧请求不得覆盖新的结果**（连续 refresh，token 序号）', async () => {
    const resolvers: Array<(v: Response) => void> = []
    const fetcher = vi.fn(() => new Promise<Response>((r) => resolvers.push(r)))
    const src = ref<NavSource>({ kind: 'api', url: '/api/v1' })
    const h = mountHost({ source: () => src.value, fetcher })
    await flush()
    expect(resolvers).toHaveLength(1)

    src.value = { kind: 'api', url: '/api/v2' } // 切换来源 → 第二次请求
    await flush()
    expect(resolvers).toHaveLength(2)

    // 新请求先回，旧请求后回
    resolvers[1]!(jsonRes([{ key: 'v2', label: 'V2', kind: 'custom' }]))
    await flush()
    await flush()
    resolvers[0]!(jsonRes([{ key: 'v1', label: 'V1', kind: 'custom' }]))
    await flush()
    await flush()
    expect(h.api.nodes.value.map((n) => n.key), '旧结果被丢弃').toEqual(['v2'])
  })

  it('**卸载后到达的响应不写状态**（token++ 作废）', async () => {
    const resolvers: Array<(v: Response) => void> = []
    const fetcher = vi.fn(() => new Promise<Response>((r) => resolvers.push(r)))
    const h = mountHost({ source: { kind: 'api', url: '/api/nav' }, fetcher })
    await flush()
    h.wrapper.unmount()
    resolvers[0]!(jsonRes([{ key: 'late', label: 'L', kind: 'custom' }]))
    await flush()
    await flush()
    expect(h.api.nodes.value, '卸载后不写入').toEqual([])
    expect(h.api.loading.value, '卸载后不残留 loading').toBe(false)
  })

  it('**加载失败保留上一次的导航**（一次抖动不该让整条导航消失）', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonRes([{ key: 'a', label: 'A', kind: 'custom' }]))
      .mockRejectedValueOnce(new Error('offline'))
    const h = mountHost({ source: { kind: 'api', url: '/api/nav' }, fetcher })
    await flush()
    expect(h.api.nodes.value.map((n) => n.key)).toEqual(['a'])
    await h.api.refresh()
    await flush()
    expect(h.api.error.value).toBe('offline')
    expect(h.api.nodes.value.map((n) => n.key), '导航不清空').toEqual(['a'])
  })

  it('**卸载后再调 refresh → 直接返回，不抛也不写状态**', async () => {
    const fetcher = vi.fn(async () => jsonRes([{ key: 'a', label: 'A', kind: 'custom' }]))
    const h = mountHost({ source: { kind: 'api', url: '/api/nav' }, fetcher })
    await flush()
    h.wrapper.unmount()
    await expect(h.api.refresh()).resolves.toBeUndefined()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('**迟到的旧请求失败时，不得覆盖新请求的成功结果**', async () => {
    const resolvers: Array<{ ok: (v: Response) => void; fail: (e: unknown) => void }> = []
    const fetcher = vi.fn(
      () =>
        new Promise<Response>((ok, fail) => {
          resolvers.push({ ok, fail })
        }),
    )
    const src = ref<NavSource>({ kind: 'api', url: '/api/v1' })
    const h = mountHost({ source: () => src.value, fetcher })
    await flush()
    src.value = { kind: 'api', url: '/api/v2' }
    await flush()
    resolvers[1]!.ok(jsonRes([{ key: 'v2', label: 'V2', kind: 'custom' }]))
    await flush()
    await flush()
    expect(h.api.error.value).toBeNull()
    resolvers[0]!.fail(new Error('旧请求失败'))
    await flush()
    await flush()
    expect(h.api.error.value, '迟到失败不得污染新结果').toBeNull()
    expect(h.api.nodes.value.map((n) => n.key)).toEqual(['v2'])
  })

  it('**抛出非 Error（字符串）也要变成可读文案**', async () => {
    const h = mountHost({
      source: { kind: 'api', url: '/api/nav' },
      fetcher: vi.fn(async () => {
        throw 'raw-string-failure'
      }),
    })
    await flush()
    expect(h.api.error.value).toBe('raw-string-failure')
  })

  it('**来源不变时不重复加载**（deep watcher 不得空转）', async () => {
    const fetcher = vi.fn(async () => jsonRes([{ key: 'a', label: 'A', kind: 'custom' }]))
    const h = mountHost({ source: { kind: 'api', url: '/api/nav' }, fetcher })
    await flush()
    await flush()
    await flush()
    expect(fetcher, '没有来源变化就不该再拉一次').toHaveBeenCalledTimes(1)
    expect(h.api.nodes.value.map((n) => n.key)).toEqual(['a'])
  })

  it('**原地改配置对象里的字段也会重载**（deep 遍历嵌套字段，不只是换对象）', async () => {
    const fetcher = vi.fn(async () =>
      jsonRes([{ key: 'a', label: 'A', kind: 'custom' }]),
    )
    const src = ref<NavSource>({ kind: 'api', url: '/api/v1' })
    const h = mountHost({ source: () => src.value, fetcher })
    await flush()
    expect(fetcher).toHaveBeenCalledTimes(1)
    // 宿主原地改 url（不是换对象）—— deep 必须把它当变化
    ;(src.value as Extract<NavSource, { kind: 'api' }>).url = '/api/v2'
    await flush()
    expect(fetcher, '原地改字段也要重载').toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[1]![0]).toContain('/api/v2')
    expect(h.api.nodes.value.map((n) => n.key)).toEqual(['a'])
  })

  it('**refresh 后原选中 key 变成了分组 → 也按悬空收敛**（配置被后端换过结构）', async () => {
    const src = ref<unknown>([
      { key: 'x', label: 'X', kind: 'custom' },
      { key: 'y', label: 'Y', kind: 'custom' },
    ])
    const h = mountHost({ source: () => ({ kind: 'static', nodes: src.value }) })
    await flush()
    h.api.select('x')
    await flush()
    expect(h.api.current.value?.key).toBe('x')
    // 后端把 x 从"叶子"改成了"分组"：选中项已不可选
    src.value = [
      { key: 'x', label: 'X', kind: 'group', children: [{ key: 'x1', label: 'X1', kind: 'custom' }] },
      { key: 'y', label: 'Y', kind: 'custom' },
    ]
    await flush()
    expect(h.api.selectedKey.value, '分组不可选 → 收敛到第一个叶子').toBe('x1')
    expect(h.api.current.value?.key).toBe('x1')
  })

  it('**抛出非 Error 且非字符串（对象）时，error 仍是字符串**', async () => {
    const h = mountHost({
      source: { kind: 'api', url: '/api/nav' },
      fetcher: vi.fn(async () => {
        throw { code: 500, msg: '对象形态的失败' }
      }),
    })
    await flush()
    expect(typeof h.api.error.value).toBe('string')
    expect(h.api.error.value).toBe('[object Object]')
  })

  it('**来源 getter 变化 → 自动重新加载**（宿主换接口）', async () => {
    const src = ref<NavSource>({
      kind: 'static',
      nodes: [{ key: 'a', label: 'A', kind: 'custom' }],
    })
    const h = mountHost({ source: () => src.value })
    await flush()
    expect(h.api.nodes.value.map((n) => n.key)).toEqual(['a'])
    src.value = { kind: 'static', nodes: [{ key: 'b', label: 'B', kind: 'custom' }] }
    await flush()
    expect(h.api.nodes.value.map((n) => n.key)).toEqual(['b'])
    expect(h.api.selectedKey.value, '旧选中已收敛').toBe('b')
  })
})

describe('useLowCodeNav · forms 来源（用户在低代码入口建的表单自动成导航项）', () => {
  it('**委托 useFormNav：表单列表 → 表单页项（带 formId）**', async () => {
    const store = fakeStore([
      { id: 'f2', name: '订单' },
      { id: 'f1', name: '客户' },
    ])
    const h = mountHost({ source: { kind: 'forms' }, formStore: store })
    await flush()
    expect(store.listForms).toHaveBeenCalled()
    expect(h.api.nodes.value.map((n) => n.key).sort()).toEqual(['f1', 'f2'])
    expect(h.api.nodes.value.every((n) => n.kind === 'form' && 'formId' in n)).toBe(true)
    expect(h.api.error.value).toBeNull()
  })

  it('**表单列表为空 → 空导航，不报错**（还有"新建表单"入口，不是错误）', async () => {
    const h = mountHost({ source: { kind: 'forms' }, formStore: fakeStore([]) })
    await flush()
    expect(h.api.nodes.value).toEqual([])
    expect(h.api.error.value).toBeNull()
    expect(h.api.current.value).toBeNull()
  })

  it('**listForms 抛错 → error 透出原因**（不静默吞）', async () => {
    const h = mountHost({ source: { kind: 'forms' }, formStore: fakeStore([], '后端 500') })
    await flush()
    expect(h.api.error.value).toBe('后端 500')
    expect(h.api.nodes.value).toEqual([])
  })

  it('**forms 模式可传 icon，并透传到导航项**', async () => {
    const store = fakeStore([{ id: 'f1', name: '客户' }])
    const h = mountHost({
      source: { kind: 'forms', icon: 'file' },
      formStore: store,
    })
    await flush()
    expect(h.api.nodes.value[0]).toMatchObject({ kind: 'form', formId: 'f1', icon: 'file' })
  })

  it('**forms 模式：图标可以按表单计算**（与 useFormNav 同名能力）', async () => {
    const store = fakeStore([
      { id: 'f1', name: '客户' },
      { id: 'f2', name: '订单' },
    ])
    const h = mountHost({
      source: { kind: 'forms', icon: (f: { name: string }) => (f.name === '订单' ? 'cart' : 'user') },
      formStore: store,
    })
    await flush()
    const byKey = Object.fromEntries(h.api.nodes.value.map((n) => [n.key, n.icon]))
    expect(byKey).toEqual({ f1: 'user', f2: 'cart' })
  })

  it('**forms 模式不传 formStore → 用宿主注入的活动 FormStore**（setActiveFormStore 那条线）', async () => {
    const { getActiveFormStore, setActiveFormStore } = await import('@/components/form-builder/designer/store')
    const prev = getActiveFormStore()
    const injected = fakeStore([{ id: 'fromActive', name: '活动存储里的表单' }])
    try {
      setActiveFormStore(injected)
      const h = mountHost({ source: { kind: 'forms' } })
      await flush()
      expect(injected.listForms).toHaveBeenCalled()
      expect(h.api.nodes.value.map((n) => n.key)).toEqual(['fromActive'])
    } finally {
      setActiveFormStore(prev)
    }
  })

  it('**forms 模式也有竞态：慢的旧结果不得覆盖新结果**', async () => {
    const resolvers: Array<(v: unknown) => void> = []
    const slowStore = {
      listForms: vi.fn(
        () =>
          new Promise((r) => {
            resolvers.push(r)
          }),
      ),
      loadForm: vi.fn(async () => null),
      saveForm: vi.fn(async (id: string) => id),
      removeForm: vi.fn(async () => undefined),
    } as unknown as FormStore
    const src = ref<NavSource>({ kind: 'forms', icon: 'a' })
    const h = mountHost({ source: () => src.value, formStore: slowStore })
    await flush()
    expect(resolvers).toHaveLength(1)
    src.value = { kind: 'forms', icon: 'b' }
    await flush()
    expect(resolvers).toHaveLength(2)

    // 新请求先回，旧请求后回 —— 旧结果必须被丢弃
    resolvers[1]!([{ id: 'new', name: '新', updatedAt: '2026-10-02T00:00:00Z', collectKey: 'fd_collect_new' }])
    await flush()
    await flush()
    expect(h.api.nodes.value.map((n) => n.key)).toEqual(['new'])
    resolvers[0]!([{ id: 'old', name: '旧', updatedAt: '2026-10-01T00:00:00Z', collectKey: 'fd_collect_old' }])
    await flush()
    await flush()
    expect(h.api.nodes.value.map((n) => n.key), '旧结果被丢弃').toEqual(['new'])
  })

  it('**forms 项也能被权限过滤 / 选中**', async () => {
    const store = fakeStore([
      { id: 'f1', name: '客户' },
      { id: 'f2', name: '订单' },
    ])
    const h = mountHost({
      source: { kind: 'forms' },
      formStore: store,
      filter: (n: NavNode) => n.key !== 'f2',
    })
    await flush()
    expect(h.api.nodes.value.map((n) => n.key)).toEqual(['f1'])
    expect(h.api.selectedKey.value).toBe('f1')
    expect(h.api.select('f2')).toBe(false)
  })
})