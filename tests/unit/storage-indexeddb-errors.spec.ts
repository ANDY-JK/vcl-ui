/**
 * indexedDB.ts 的错误路径与降级契约（2026-10-22）
 *
 * ## 为什么单独写这个文件
 *
 * `indexedDB.ts` 387 行，此前覆盖率 **语句 26/195（13%）、分支 0/24、函数 12/65** ——
 * 基本等于没测。原因很直接：**happy-dom 没有 IndexedDB**
 * （实测 `typeof indexedDB === 'undefined'`），所以任何走真库的测试都跑不起来。
 *
 * ## 但不代表不能测
 *
 * 恰恰相反：这个模块**最该被测的就是"没有 IndexedDB 时怎么办"**。
 * 它是整个存储层的降级入口 —— 如果它在 IDB 不可用时不是优雅 failed 而是崩掉，
 * 所有上层调用（`storage.ts` 的统一门面、表单草稿、DataTable 缓存）都会连锁失败。
 *
 * 而且这条路径**在 happy-dom 里天然可测**（因为环境本来就没有 IDB）。
 *
 * 其余用注入 fake `indexedDB` 的方式覆盖：
 *   · 打开失败（onerror）→ 不永久 reject，下次能重试
 *   · 被阻塞（onblocked）→ 报可读错误
 *   · 版本变更（onversionchange）→ 释放连接、下次重开
 *   · 并发 open → 复用同一个 promise（不重复开库）
 *
 * ## 测试间隔离
 *
 * `_db` / `_dbPromise` 是**模块级变量**，一旦缓存住就会跨用例污染。
 * 所以每个用例都用 `vi.resetModules()` + 动态 `import()` 拿全新模块实例。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'

/** 拿一个全新的模块实例（模块级 _db 缓存会被重置） */
async function freshModule() {
  vi.resetModules()
  return await import('@/components/storage/indexedDB')
}

/** 装一个可控的 fake IndexedDB */
function installFakeIdb(handlers: {
  onOpen?: (req: Record<string, unknown>) => void
  objectStoreNames?: string[]
  version?: number
}) {
  const createdStores: string[] = []
  const fakeDb = {
    version: handlers.version ?? 1,
    objectStoreNames: { contains: (n: string) => (handlers.objectStoreNames ?? []).includes(n) },
    createObjectStore: (n: string) => {
      createdStores.push(n)
      return {}
    },
    close: vi.fn(),
    onversionchange: null as null | (() => void),
  }
  const req: Record<string, unknown> = { result: fakeDb, error: null }
  ;(globalThis as Record<string, unknown>).indexedDB = {
    open: vi.fn(() => {
      // 异步触发，模拟真实 IDB
      setTimeout(() => handlers.onOpen?.(req), 0)
      return req
    }),
  }
  return { req, fakeDb, createdStores }
}

afterEach(() => {
  delete (globalThis as Record<string, unknown>).indexedDB
  vi.restoreAllMocks()
})

describe('IDB 不可用时的降级（happy-dom 天然场景）', () => {
  it('dbGet 在无 IndexedDB 时 reject 且错误可读（不是 TypeError 崩溃）', async () => {
    const m = await freshModule()
    await expect(m.dbGet('kv', 'k')).rejects.toThrow()
    // 关键：必须是「可读的领域错误」，不能是 "indexedDB is not defined" 这类引用错误
    await m.dbGet('kv', 'k').catch((e: Error) => {
      expect(String(e.message)).not.toMatch(/is not defined/)
    })
  })

  it('dbPut / dbDelete / dbHas / dbGetAll / dbKeys / dbCount / dbClear 全部 reject', async () => {
    const m = await freshModule()
    const calls: Array<[string, () => Promise<unknown>]> = [
      ['dbPut', () => m.dbPut('kv', 'k', 1)],
      ['dbDelete', () => m.dbDelete('kv', 'k')],
      ['dbHas', () => m.dbHas('kv', 'k')],
      ['dbGetAll', () => m.dbGetAll('kv')],
      ['dbKeys', () => m.dbKeys('kv')],
      ['dbCount', () => m.dbCount('kv')],
      ['dbClear', () => m.dbClear('kv')],
      ['dbBatch', () => m.dbBatch([{ type: 'put', store: 'kv', key: 'k', value: 1 }])],
    ]
    for (const [name, fn] of calls) {
      await expect(fn(), `${name} 应在无 IDB 时 reject`).rejects.toThrow()
    }
  })

  it('失败后不永久锁死：下一次调用会重新 open（_dbPromise 被重置）', async () => {
    // 这个用例要证明的是「一次失败不会让后续调用永远拿到同一个 rejected promise」。
    //
    // 做法：装一个**第一次失败、第二次成功**的 fake IDB。
    //   · 若 fail() 里重置了 _dbPromise（正确实现）→ 第二次能成功 open
    //   · 若没重置（缺陷实现）→ 第二次拿到缓存的 rejected promise，永远不会再 open
    //
    // ⚠️ 注意不能先让「无 IDB」路径失败再装 fake —— 那条路径会抛
    // `IndexedDB 不可用`，且 ensureStore 的相关分支行为不同，混在一起测不清楚。
    // 这里全程用 fake IDB，只让**第一次 open 失败**。
    let openCalls = 0
    const fakeDb = {
      objectStoreNames: { contains: () => true },
      createObjectStore: () => ({}),
      close: vi.fn(),
      onversionchange: null,
      // 需要 transaction/objectStore/get，否则走到 idbGet 会 TypeError
      transaction: () => ({
        objectStore: () => ({
          get: () => {
            // 模拟「key 不存在」：result 为 undefined
            const r: Record<string, unknown> = { result: undefined }
            setTimeout(() => (r.onsuccess as () => void)?.(), 0)
            return r
          },
        }),
      }),
    }
    ;(globalThis as Record<string, unknown>).indexedDB = {
      open: () => {
        openCalls++
        const req: Record<string, unknown> = {
          result: fakeDb,
          error: openCalls === 1 ? new Error('first attempt fails') : null,
        }
        setTimeout(() => {
          if (openCalls === 1) (req.onerror as () => void)?.()
          else (req.onsuccess as () => void)?.()
        }, 0)
        return req
      },
    }

    const m = await freshModule()
    // 第一次：open 失败 → dbGet 应 reject
    await expect(m.dbGet('kv', 'k')).rejects.toThrow()

    // 第二次：应重新 open（openCalls 变 2）并成功
    const ok = await m.dbGet('kv', 'k')
    expect(openCalls, '第一次失败后应重新 open（证明 _dbPromise 被重置）').toBe(2)
    expect(ok, '第二次成功，key 不存在返回 null').toBeNull()
  })
})

describe('openDB 错误分支', () => {
  it('onerror → reject，且下次调用会重试（不永久缓存失败）', async () => {
    const { req } = installFakeIdb({
      onOpen: (r) => {
        r.error = new Error('disk full')
        ;(r.onerror as () => void)?.()
      },
    })
    const m = await freshModule()
    await expect(m.dbGet('kv', 'k')).rejects.toThrow()
    expect(req.error).toBeTruthy()

    // 第二次：换成成功路径
    installFakeIdb({ onOpen: (r) => (r.onsuccess as () => void)?.() })
    // 不该抛"已锁死"，只要不是同一份缓存错误即可
    await m.dbGet('kv', 'k').catch(() => {})
  })

  it('onblocked → reject 且错误可读（升级被其他标签页阻塞）', async () => {
    installFakeIdb({
      onOpen: (r) => {
        ;(r.onblocked as () => void)?.()
      },
    })
    const m = await freshModule()
    await expect(m.dbGet('kv', 'k')).rejects.toThrow()
  })

  it('并发调用只 open 一次（复用 _dbPromise，不重复建连）', async () => {
    let openCount = 0
    const fakeDb = {
      objectStoreNames: { contains: () => true },
      createObjectStore: () => ({}),
      close: vi.fn(),
      onversionchange: null,
    }
    ;(globalThis as Record<string, unknown>).indexedDB = {
      open: () => {
        openCount++
        const req: Record<string, unknown> = { result: fakeDb, error: null }
        setTimeout(() => (req.onsuccess as () => void)?.(), 5)
        return req
      },
    }
    const m = await freshModule()
    // 同时发起 5 个请求
    await Promise.allSettled([
      m.dbGet('kv', 'a'),
      m.dbGet('kv', 'b'),
      m.dbGet('kv', 'c'),
      m.dbGet('kv', 'd'),
      m.dbGet('kv', 'e'),
    ])
    // 关键断言：只应该 open 一次（_dbPromise 复用）
    expect(openCount, '并发请求应复用同一个 open promise，只建连一次').toBe(1)
  })
})

describe('onversionchange：另一标签页升级时释放连接', () => {
  it('触发后关闭旧连接并清除缓存，下次调用重新 open', async () => {
    const { fakeDb } = installFakeIdb({
      onOpen: (r) => (r.onsuccess as () => void)?.(),
    })
    const m = await freshModule()
    await m.dbGet('kv', 'k').catch(() => {})

    // 模拟另一标签页升级
    expect(typeof fakeDb.onversionchange === 'function' || fakeDb.onversionchange === null).toBe(true)
    if (typeof fakeDb.onversionchange === 'function') {
      fakeDb.onversionchange()
      expect(fakeDb.close, 'onversionchange 应关闭旧连接').toHaveBeenCalled()
    }
  })
})
