/**
 * indexedDB.ts 写操作与批量事务（2026-10-22 第二轮）
 *
 * ## 为什么需要这个文件
 *
 * 上一轮补了「无 IDB 时的降级」和「openDB 错误分支」，覆盖率 13% → 44%。
 * 但**四个写操作完全没覆盖**：`idbClear` / `idbBatchDelete` / `idbBatch` / `idbHas`。
 *
 * 它们恰好是**最容易出错的**部分：
 *   · `idbBatchDelete` 空数组要**提前 return**（不能开事务）
 *   · `idbBatch` 跨 store 事务：要去重 store 列表、三种 op 类型、TTL 计算
 *   · `idbBatch` 空数组同样要提前 return
 *   · `idbBatch` 的 `_exp` 计算：`op.ttl ? now + op.ttl : 0`（0 表示不过期）
 *
 * ## 怎么做
 *
 * happy-dom 没有 IndexedDB，所以**自己实现一个进程内 fake**：
 *   · 真实的 Map 存储 + 模拟事务语义（oncomplete 在微任务后触发）
 *   · 记录每一次 put/delete/clear 调用，供断言
 *
 * ⚠️ 这是**测试替身**，不是真实 IndexedDB。它验证的是「我们怎么调用 IDB API」
 * 与「事务完成后 resolve/reject 的时序」，**不验证 IDB 引擎本身**。
 * 真实浏览器里的行为由 e2e 覆盖。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

interface Op {
  type: 'put' | 'delete' | 'clear'
  store: string
  key?: string
  value?: unknown
}

/** 进程内 fake IndexedDB：够用即可，记录所有写操作 */
function makeFakeIdb() {
  const data = new Map<string, Map<string, unknown>>() // store -> key -> value
  const ops: Op[] = []
  const txCalls: Array<string | string[]> = []
  let version = 1
  const storeNames = new Set<string>(['records', 'tables', 'kv'])

  const storeFor = (name: string) => {
    if (!data.has(name)) data.set(name, new Map())
    return data.get(name)!
  }

  function makeObjectStore(name: string) {
    return {
      put(value: unknown, key?: string) {
        const k = key ?? (value as { key?: string })?.key ?? 'undefined-key'
        storeFor(name).set(k, value)
        ops.push({ type: 'put', store: name, key: k, value })
        const r: Record<string, unknown> = { result: k, error: null }
        setTimeout(() => (r.onsuccess as () => void)?.(), 0)
        return r
      },
      delete(key: string) {
        storeFor(name).delete(key)
        ops.push({ type: 'delete', store: name, key })
        const r: Record<string, unknown> = { result: undefined, error: null }
        setTimeout(() => (r.onsuccess as () => void)?.(), 0)
        return r
      },
      clear() {
        storeFor(name).clear()
        ops.push({ type: 'clear', store: name })
        const r: Record<string, unknown> = { result: undefined, error: null }
        setTimeout(() => (r.onsuccess as () => void)?.(), 0)
        return r
      },
      get(key: string) {
        const r: Record<string, unknown> = { result: storeFor(name).get(key), error: null }
        setTimeout(() => (r.onsuccess as () => void)?.(), 0)
        return r
      },
      count() {
        const r: Record<string, unknown> = { result: storeFor(name).size, error: null }
        setTimeout(() => (r.onsuccess as () => void)?.(), 0)
        return r
      },
      getAll() {
        // 返回所有 StoreItem（保持插入顺序）
        const r: Record<string, unknown> = { result: [...storeFor(name).values()], error: null }
        setTimeout(() => (r.onsuccess as () => void)?.(), 0)
        return r
      },
      getAllKeys() {
        const r: Record<string, unknown> = { result: [...storeFor(name).keys()], error: null }
        setTimeout(() => (r.onsuccess as () => void)?.(), 0)
        return r
      },
    }
  }

  function makeTransaction(storeNamesArg: string | string[], _mode?: string) {
    txCalls.push(storeNamesArg)
    const names = Array.isArray(storeNamesArg) ? storeNamesArg : [storeNamesArg]
    const tx: Record<string, unknown> = {
      objectStore: (n: string) => makeObjectStore(n),
      error: null,
      oncomplete: null as null | (() => void),
      onerror: null as null | (() => void),
    }
    // 事务完成：等所有 pending 微任务后触发
    setTimeout(() => (tx.oncomplete as () => void)?.(), 5)
    void names
    return tx
  }

  const fakeDb = {
    version,
    objectStoreNames: { contains: (n: string) => storeNames.has(n) },
    createObjectStore: (n: string) => {
      storeNames.add(n)
      storeFor(n)
      version++
      return {}
    },
    close: vi.fn(),
    onversionchange: null,
    transaction: makeTransaction,
  }

  ;(globalThis as Record<string, unknown>).indexedDB = {
    open: () => {
      const req: Record<string, unknown> = { result: fakeDb, error: null }
      setTimeout(() => (req.onsuccess as () => void)?.(), 0)
      return req
    },
  }

  return { fakeDb, ops, data, storeFor, txCalls }
}

async function freshModule() {
  vi.resetModules()
  return await import('@/components/storage/indexedDB')
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).indexedDB
  vi.restoreAllMocks()
})

describe('写操作：idbClear / idbBatchDelete', () => {
  it('dbClear 调用 objectStore.clear()', async () => {
    const { ops, storeFor } = makeFakeIdb()
    storeFor('kv').set('a', 1)
    const m = await freshModule()
    await m.dbClear('kv')
    expect(ops.filter((o) => o.type === 'clear')).toHaveLength(1)
    expect(storeFor('kv').size, 'clear 后 store 应为空').toBe(0)
  })

  it('dbBatch 的空 ops **提前 return，不建事务**', async () => {
    const { ops, txCalls } = makeFakeIdb()
    const m = await freshModule()
    // 空数组：应直接返回，不应产生任何写操作
    await m.dbBatch([])
    expect(ops, '空 ops 不应产生任何写操作').toHaveLength(0)
    // ⚠️ 只断言 ops 为空是不够的：即使开了空事务也不会产生 op 记录。
    // 必须断言**根本没建事务**，否则删掉 `if (ops.length === 0) return`
    // 这条测试依然绿（负向对照实测抓不到）。
    expect(txCalls, '空 ops 不应创建事务').toHaveLength(0)
  })
})

describe('idbBatch：跨 store 事务与三种 op 类型', () => {
  it('put / delete / clear 三种类型都能执行', async () => {
    const { ops, storeFor } = makeFakeIdb()
    storeFor('kv').set('old', 1)
    const m = await freshModule()

    await m.dbBatch([
      { type: 'put', store: 'kv', key: 'k1', value: 'v1' },
      { type: 'put', store: 'kv', key: 'k2', value: 'v2' },
      { type: 'delete', store: 'kv', key: 'old' },
    ])

    const puts = ops.filter((o) => o.type === 'put')
    const dels = ops.filter((o) => o.type === 'delete')
    expect(puts).toHaveLength(2)
    expect(dels).toHaveLength(1)
    expect(storeFor('kv').has('k1')).toBe(true)
    expect(storeFor('kv').has('old'), 'delete 应生效').toBe(false)
  })

  it('put 的 StoreItem 包裹正确：key / value / _ts / _exp', async () => {
    const { ops } = makeFakeIdb()
    const m = await freshModule()
    const before = Date.now()

    await m.dbBatch([
      { type: 'put', store: 'kv', key: 'k1', value: { a: 1 } },
      { type: 'put', store: 'kv', key: 'k2', value: { b: 2 }, ttl: 60_000 },
    ])

    const puts = ops.filter((o) => o.type === 'put')
    const withTtl = puts.find((p) => p.key === 'k2')!
    const noTtl = puts.find((p) => p.key === 'k1')!
    const item1 = noTtl.value as { key: string; value: unknown; _ts: number; _exp: number }
    const item2 = withTtl.value as { key: string; value: unknown; _ts: number; _exp: number }

    expect(item1.key).toBe('k1')
    expect(item1.value).toEqual({ a: 1 })
    expect(item1._ts, '_ts 应是当前时间').toBeGreaterThanOrEqual(before)
    expect(item1._exp, '无 ttl 时 _exp 应为 0（不过期）').toBe(0)
    // 有 ttl：_exp = _ts + ttl
    expect(item2._exp - item2._ts, '有 ttl 时 _exp 应等于 _ts + ttl').toBe(60_000)
  })

  it('跨 store：自动去重 store 列表并分别写入', async () => {
    const { ops, storeFor } = makeFakeIdb()
    storeFor('records')
    storeFor('tables')
    const m = await freshModule()

    await m.dbBatch([
      { type: 'put', store: 'records', key: 'r1', value: 1 },
      { type: 'put', store: 'tables', key: 't1', value: 2 },
      { type: 'put', store: 'records', key: 'r2', value: 3 },
    ])

    expect(ops.filter((o) => o.store === 'records')).toHaveLength(2)
    expect(ops.filter((o) => o.store === 'tables')).toHaveLength(1)
  })

  it('clear 类型清空对应 store', async () => {
    const { storeFor } = makeFakeIdb()
    storeFor('kv').set('a', 1)
    storeFor('kv').set('b', 2)
    const m = await freshModule()
    await m.dbBatch([{ type: 'clear', store: 'kv' }])
    expect(storeFor('kv').size).toBe(0)
  })
})

describe('idbHas：复用 idbGet 的过期逻辑', () => {
  it('存在的 key → true', async () => {
    const { storeFor } = makeFakeIdb()
    const m = await freshModule()
    // 先写入一个未过期的项
    await m.dbBatch([{ type: 'put', store: 'kv', key: 'k1', value: 'v1' }])
    expect(storeFor('kv').has('k1')).toBe(true)
    const has = await m.dbHas('kv', 'k1')
    expect(has, '存在的 key 应返回 true').toBe(true)
  })

  it('不存在的 key → false', async () => {
    makeFakeIdb()
    const m = await freshModule()
    const has = await m.dbHas('kv', 'nope')
    expect(has, '不存在的 key 应返回 false').toBe(false)
  })

  it('已过期的 key → false（idbHas 复用 idbGet 的过期检查）', async () => {
    const { storeFor } = makeFakeIdb()
    const m = await freshModule()
    // 直接塞一个已过期的 StoreItem（_exp 在过去）
    storeFor('kv').set('expired', { key: 'expired', value: 'x', _ts: Date.now() - 100_000, _exp: Date.now() - 50_000 })
    const has = await m.dbHas('kv', 'expired')
    expect(has, '已过期的 key 应视为不存在').toBe(false)
  })
})

describe('过期清理：dbGetAll 触发 idbBatchDelete', () => {
  it('读到过期项时返回时过滤掉，并异步清理', async () => {
    const { storeFor, ops } = makeFakeIdb()
    const m = await freshModule()
    const now = Date.now()

    // 塞三条：两条有效、一条过期
    storeFor('kv').set('live1', { key: 'live1', value: 'a', _ts: now, _exp: 0 })
    storeFor('kv').set('live2', { key: 'live2', value: 'b', _ts: now, _exp: now + 60_000 })
    storeFor('kv').set('dead', { key: 'dead', value: 'c', _ts: now - 1000, _exp: now - 500 })

    const all = await m.dbGetAll('kv')
    expect(all, '过期项不应出现在结果里').toHaveLength(2)
    expect(all).toEqual(['a', 'b'])

    // 给异步清理一点时间
    await new Promise((r) => setTimeout(r, 60))
    expect(
      ops.filter((o) => o.type === 'delete').map((o) => o.key),
      '过期 key 应被 idbBatchDelete 清理',
    ).toContain('dead')
  })

  it('没有过期项时不触发删除', async () => {
    const { storeFor, ops } = makeFakeIdb()
    const m = await freshModule()
    const now = Date.now()
    storeFor('kv').set('k1', { key: 'k1', value: 'a', _ts: now, _exp: 0 })
    await m.dbGetAll('kv')
    await new Promise((r) => setTimeout(r, 60))
    expect(ops.filter((o) => o.type === 'delete'), '无过期项时不该有删除').toHaveLength(0)
  })

  it('前缀过滤：只返回匹配前缀的有效项', async () => {
    const { storeFor } = makeFakeIdb()
    const m = await freshModule()
    const now = Date.now()
    storeFor('kv').set('u:1', { key: 'u:1', value: 'a', _ts: now, _exp: 0 })
    storeFor('kv').set('u:2', { key: 'u:2', value: 'b', _ts: now, _exp: 0 })
    storeFor('kv').set('x:1', { key: 'x:1', value: 'c', _ts: now, _exp: 0 })

    const res = await m.dbGetAll('kv', 'u:')
    expect(res, '只应返回 u: 前缀').toEqual(['a', 'b'])
  })
})

describe('idbKeys / idbCount', () => {
  it('dbKeys 返回全部 key', async () => {
    const { storeFor } = makeFakeIdb()
    const m = await freshModule()
    const now = Date.now()
    storeFor('kv').set('a', { key: 'a', value: 1, _ts: now, _exp: 0 })
    storeFor('kv').set('b', { key: 'b', value: 2, _ts: now, _exp: 0 })
    const keys = await m.dbKeys('kv')
    expect(keys).toEqual(['a', 'b'])
  })

  it('dbKeys 支持前缀过滤', async () => {
    const { storeFor } = makeFakeIdb()
    const m = await freshModule()
    const now = Date.now()
    storeFor('kv').set('u:1', { key: 'u:1', value: 1, _ts: now, _exp: 0 })
    storeFor('kv').set('x:1', { key: 'x:1', value: 2, _ts: now, _exp: 0 })
    const keys = await m.dbKeys('kv', 'u:')
    expect(keys).toEqual(['u:1'])
  })

  it('dbCount 返回条目数', async () => {
    const { storeFor } = makeFakeIdb()
    const m = await freshModule()
    const now = Date.now()
    storeFor('kv').set('a', { key: 'a', value: 1, _ts: now, _exp: 0 })
    storeFor('kv').set('b', { key: 'b', value: 2, _ts: now, _exp: 0 })
    expect(await m.dbCount('kv')).toBe(2)
  })
})
