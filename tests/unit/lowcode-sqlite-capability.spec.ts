// @vitest-environment node —— node:sqlite 是内置模块：在 happy-dom 环境下 vitest 会
// 尝试 bundle 它并报 "Cannot bundle built-in module"（CI 上这条必红）
// TD-22 收口：node:sqlite 能力探针（sqlite-capability.mjs）
//
// 钉三件事：
//   ① 真实环境下 probeSqlite() 通过（模块在、方法面齐、冒烟全通）；
//   ② assertSqliteSurface 在方法被删/改名时**抛带行动指引的错误**（不静默）；
//   ③ API 面清单与存储层实际用法一致（清单少一项 = 探针失准）。
import { describe, it, expect } from 'vitest'
import {
  probeSqlite,
  assertSqliteSurface,
  assertSqliteUsable,
  SQLITE_API_SURFACE,
} from '../../examples/lowcode-backend/sqlite-capability.mjs'

describe('probeSqlite（node:sqlite 能力探测，TD-22）', () => {
  it('真实环境：ok=true，冒烟全通，报告 Node 版本', async () => {
    const r = await probeSqlite()
    expect(r.ok).toBe(true)
    expect(r.node).toBe(process.versions.node)
    expect(r.smoke).toContain('全通')
  })

  it('API 面清单：模块 1 项 / 实例 3 项 / 语句 3 项（与存储层用法一致）', () => {
    expect(SQLITE_API_SURFACE.module).toEqual(['DatabaseSync'])
    expect(SQLITE_API_SURFACE.instance).toEqual(['exec', 'prepare', 'close'])
    expect(SQLITE_API_SURFACE.statement).toEqual(['get', 'all', 'run'])
  })

  it('assertSqliteUsable：可用时原样返回结论', async () => {
    const r = await assertSqliteUsable()
    expect(r.ok).toBe(true)
  })
})

describe('assertSqliteSurface（API 形态漂移的守卫）', () => {
  it('真实 db：方法面齐全 → 不抛', async () => {
    const { DatabaseSync } = await import('node:sqlite')
    const db = new DatabaseSync(':memory:')
    expect(() => assertSqliteSurface(db, db.prepare('SELECT 1'))).not.toThrow()
    db.close()
  })

  it('缺 exec/prepare → 抛错，错误信息含"锁 Node 版本"与"better-sqlite3"', () => {
    expect(() => assertSqliteSurface({})).toThrow(/锁 Node 版本/)
    expect(() => assertSqliteSurface({})).toThrow(/better-sqlite3/)
  })

  it('语句对象缺 run → 报 stmt.run', () => {
    const db = { exec() {}, prepare() {}, close() {} }
    expect(() => assertSqliteSurface(db, { get() {}, all() {} })).toThrow(/stmt\.run/)
  })

  it('反向保护：只传 db 不传 stmt 时，不检查语句面（避免误伤）', () => {
    const db = { exec() {}, prepare() {}, close() {} }
    expect(() => assertSqliteSurface(db)).not.toThrow()
  })
})

describe('createSqliteStore 入口守卫（集成）', () => {
  it('建店成功且契约方法齐（13 个）', async () => {
    const { createSqliteStore } = await import('../../examples/lowcode-backend/sqlite-store.mjs')
    const store = createSqliteStore(':memory:') as unknown as Record<string, unknown>
    expect(typeof store.listForms).toBe('function')
    expect(typeof store.saveForm).toBe('function')
    expect(typeof store.loadRecords).toBe('function')
    expect(typeof store.clearRecords).toBe('function')
    expect(Object.keys(store).length).toBe(13)
  })
})
