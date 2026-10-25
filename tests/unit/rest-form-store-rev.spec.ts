// @vitest-environment node
/**
 * 官方 REST 仓储的**并发（乐观锁）**行为（第 112 轮）。
 *
 * 为什么单独一套：`rest-form-store.spec.ts` 锁的是"每个方法打到哪个路由、body 长什么样"（契约），
 * 这里锁的是**版本号怎么传、冲突怎么处置**（并发语义）。两者混在一起会让"body 精确相等"的断言
 * 一改 rev 就碎，而 rev 恰恰是"有时有、有时没有"的。
 *
 * 规矩：**读到过版本号才带**（`listForms` / `loadRecords` 会填缓存），没读到就不带 ——
 * 这是与老后端兼容的关键（老后端没有 `rev` 字段，行为必须与改造前完全一致）。
 */
import { describe, it, expect } from 'vitest'
import { createRestFormStore, RestStoreConflictError } from '../../src/components/form-builder/designer/rest-form-store'

const BASE = 'http://api.test'
type Call = { method: string; path: string; body: Record<string, unknown> | undefined }
type Reply = { status?: number; json?: unknown }

/** 极简假后端：按 `method path` 查表回放，并把每次调用记下来（含解析后的 body） */
function fakeBackend(routes: Record<string, Reply | ((call: Call) => Reply)>) {
  const calls: Call[] = []
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const path = url.replace(BASE, '')
    const method = (init?.method ?? 'GET').toUpperCase()
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined
    const call: Call = { method, path, body }
    calls.push(call)
    const hit = routes[`${method} ${path}`]
    if (!hit) throw new Error(`未预期的请求：${method} ${path}`)
    const reply = typeof hit === 'function' ? hit(call) : hit
    const status = reply.status ?? 200
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => reply.json,
      text: async () => (reply.json === undefined ? '' : JSON.stringify(reply.json)),
    } as unknown as Response
  }
  return { calls, fetchImpl: fetchImpl as unknown as typeof fetch }
}

const KEY = 'fd_collect_f1'
const PATCH_REC = `PATCH /records/${KEY}/r1`

describe('REST 仓储 · 乐观锁 rev', () => {
  it('**读到过版本号就带上**：loadRecords 之后 updateRecord 的 body 里出现 rev', async () => {
    const { calls, fetchImpl } = fakeBackend({
      [`GET /records/${KEY}`]: { json: [{ id: 'r1', time: 't', data: {}, rev: 3 }] },
      [PATCH_REC]: { status: 204 },
    })
    const store = createRestFormStore({ baseUrl: BASE, fetchImpl })
    await store.loadRecords(KEY)
    await store.updateRecord(KEY, 'r1', { a: 1 })

    expect(calls[1].body, '带上"我读到的是第 3 版"').toEqual({ data: { a: 1 }, rev: 3 })
  })

  it('**没读到过就不带 rev**（老后端没有 rev 字段，行为必须与改造前一致）', async () => {
    const { calls, fetchImpl } = fakeBackend({ [PATCH_REC]: { status: 204 } })
    const store = createRestFormStore({ baseUrl: BASE, fetchImpl })
    await store.updateRecord(KEY, 'r1', { a: 1 })

    expect(calls[0].body, '不知道版本时不要瞎编一个').toEqual({ data: { a: 1 } })
    expect(calls[0].body).not.toHaveProperty('rev')
  })

  it('写成功后本地版本 +1：连续两次写，第二次带的是 rev+1（不是一直发旧值）', async () => {
    const { calls, fetchImpl } = fakeBackend({
      [`GET /records/${KEY}`]: { json: [{ id: 'r1', time: 't', data: {}, rev: 7 }] },
      [PATCH_REC]: { status: 204 },
    })
    const store = createRestFormStore({ baseUrl: BASE, fetchImpl })
    await store.loadRecords(KEY)
    await store.updateRecord(KEY, 'r1', { a: 1 })
    await store.updateRecord(KEY, 'r1', { a: 2 })

    expect(
      calls.filter((c) => c.method === 'PATCH').map((c) => c.body?.rev),
      '两次写分别是 7 与 8（第二次不能还发 7）',
    ).toEqual([7, 8])
  })

  it('**冲突默认抛出**（`RestStoreConflictError`，带 `currentRev`），且不偷偷重试覆盖', async () => {
    let patched = 0
    const { calls, fetchImpl } = fakeBackend({
      [`GET /records/${KEY}`]: { json: [{ id: 'r1', time: 't', data: {}, rev: 3 }] },
      [PATCH_REC]: () => {
        patched += 1
        return { status: 409, json: { error: 'conflict', currentRev: 5 } }
      },
    })
    const store = createRestFormStore({ baseUrl: BASE, fetchImpl })
    await store.loadRecords(KEY)

    const err = await store.updateRecord(KEY, 'r1', { a: 1 }).catch((e: unknown) => e)
    expect(err, '默认策略是抛出，不是静默覆盖').toBeInstanceOf(RestStoreConflictError)
    expect((err as RestStoreConflictError).code).toBe('conflict')
    expect((err as RestStoreConflictError).currentRev, '把服务端的当前版本带给宿主').toBe(5)
    expect(patched, '默认只发一次：不替用户决定"要不要盖掉别人"').toBe(1)
    expect(calls, '没有额外的读请求').toHaveLength(2)
  })

  it('`onConflict: "retry"` → 重读最新版本后重试**一次**并成功', async () => {
    let reads = 0
    const { calls, fetchImpl } = fakeBackend({
      [`GET /records/${KEY}`]: () => {
        reads += 1
        // 第一次读到 3，冲突后重读拿到 5（期间别人改过）
        return { json: [{ id: 'r1', time: 't', data: {}, rev: reads === 1 ? 3 : 5 }] }
      },
      [PATCH_REC]: (call: Call) =>
        call.body?.rev === 5 ? { status: 204 } : { status: 409, json: { error: 'conflict', currentRev: 5 } },
    })
    const store = createRestFormStore({ baseUrl: BASE, fetchImpl, onConflict: 'retry' })
    await store.loadRecords(KEY)
    await store.updateRecord(KEY, 'r1', { a: 1 })

    const patches = calls.filter((c) => c.method === 'PATCH')
    expect(patches.map((c) => c.body?.rev), '第一次用旧 rev，第二次用重读到的 rev').toEqual([3, 5])
    expect(reads, '冲突后重读了一次').toBe(2)
  })

  it('`onConflict: "retry"` 但重试仍冲突 → 如实抛出（不死循环）', async () => {
    let patched = 0
    const { calls, fetchImpl } = fakeBackend({
      [`GET /records/${KEY}`]: { json: [{ id: 'r1', time: 't', data: {}, rev: 3 }] },
      [PATCH_REC]: () => {
        patched += 1
        return { status: 409, json: { error: 'conflict', currentRev: 9 } }
      },
    })
    const store = createRestFormStore({ baseUrl: BASE, fetchImpl, onConflict: 'retry' })
    await store.loadRecords(KEY)

    await expect(store.updateRecord(KEY, 'r1', { a: 1 })).rejects.toBeInstanceOf(RestStoreConflictError)
    expect(patched, '最多重试一次').toBe(2)
    // GET（初始读）+ PATCH + GET（冲突后重读）+ PATCH（重试）—— 没有第三次写，也没有第三次读
    expect(calls.map((c) => c.method)).toEqual(['GET', 'PATCH', 'GET', 'PATCH'])
    expect(calls.filter((c) => c.method === 'GET'), '重读只发生一次').toHaveLength(2)
  })

  it('表单侧同样带 rev（renameForm），冲突后按策略处置', async () => {
    const { calls, fetchImpl } = fakeBackend({
      'GET /forms': { json: [{ id: 'f1', name: '旧名', updatedAt: 't', collectKey: 'k', rev: 2 }] },
      'PATCH /forms/f1': { status: 409, json: { error: 'conflict', currentRev: 4 } },
    })
    const store = createRestFormStore({ baseUrl: BASE, fetchImpl })
    await store.listForms()
    const err = await store.renameForm('f1', '新名').catch((e: unknown) => e)

    expect(calls[1].body, '改名也带版本号').toEqual({ name: '新名', rev: 2 })
    expect(err).toBeInstanceOf(RestStoreConflictError)
    expect((err as RestStoreConflictError).currentRev).toBe(4)
  })
})
