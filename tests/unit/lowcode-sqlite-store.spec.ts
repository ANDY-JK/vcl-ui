// @vitest-environment node
// 存储层专项：这三例要证的事与"HTTP 契约"不同 —— 它证明"**真数据库**"这条路是真的。
//
// 为什么单独一个文件：`node:sqlite` 是 Node 内置的实验性模块（会打 ExperimentalWarning），
// 只在这个文件里 import，别让整个测试套件都背上它；同时 `node:fs` 的临时库也要 node 环境。
//
// 用深路径导入（与 lowcode-backend-example.spec.ts 同理）：node 环境 import barrel
// 会让 v8 覆盖把无关域拉低，第 106 轮已踩过（见该文件顶部注释）。
import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { createMemoryStore } from '../../examples/lowcode-backend/server.mjs'
import { createSqliteStore } from '../../examples/lowcode-backend/sqlite-store.mjs'

/** 存储接口的最小形状（本文件只用到这几个方法） */
interface Store {
  listForms: () => Promise<{ id: string; name: string; updatedAt: string; collectKey: string }[]>
  loadForm: (id: string) => Promise<unknown>
  saveForm: (id: string | null, design: unknown, name?: string) => Promise<{ collectKey: string }>
  renameForm: (id: string, name: string) => Promise<void>
  deleteForm: (id: string) => Promise<void>
  loadRecords: (key: string) => Promise<{ id: string; time: string; data?: Record<string, unknown> }[]>
  appendRecord: (key: string, rec: { id: string; time: string; data?: Record<string, unknown> }) => Promise<void>
  updateRecord: (key: string, id: string, data: Record<string, unknown>) => Promise<void>
  removeRecord: (key: string, id: string) => Promise<void>
  clearRecords: (key: string) => Promise<void>
  stats: () => Promise<{ forms: number; records: number }>
  raw?: { prepare: (sql: string) => { all: (...p: unknown[]) => unknown[]; get: (...p: unknown[]) => unknown } }
  close?: () => void
}

const dirs: string[] = []

function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'lowcode-store-'))
  dirs.push(dir)
  return join(dir, 'lowcode.db')
}

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

const design = (title: string) => ({
  schemaVersion: 3,
  meta: { title },
  nodes: [{ id: 'n1', type: 'text', label: `${title}·名称`, key: 'name' }],
})

/**
 * 起一个**真进程**的参考后端（`node examples/lowcode-backend/server.mjs`）。
 * 用 `PORT=0` 让系统分配端口，再从启动行里读回**真端口**（CLI 现在打印实际绑定端口）。
 */
function startRealCli(dbFile: string, token: string) {
  return new Promise<{ origin: string; stop: () => Promise<void> }>((resolve, reject) => {
    const child = spawn(process.execPath, ['examples/lowcode-backend/server.mjs'], {
      env: { ...process.env, LOWCODE_TOKEN: token, LOWCODE_DB: dbFile, PORT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`CLI 启动超时。输出：${out.slice(0, 400)}`))
    }, 15_000)
    const onData = (chunk: Buffer) => {
      out += chunk.toString()
      const hit = out.match(/http:\/\/127\.0\.0\.1:(\d+)\/api\/lowcode/)
      if (!hit) return
      clearTimeout(timer)
      child.stdout.off('data', onData)
      resolve({
        origin: `http://127.0.0.1:${hit[1]}`,
        stop: () =>
          new Promise<void>((done) => {
            child.once('exit', () => done())
            child.kill()
          }),
      })
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', (c: Buffer) => {
      out += c.toString()
    })
    child.once('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
  })
}

describe('SQLite 存储层：真落库 · 真持久化 · 宿主可自行 SQL 查询', () => {
  it('**关库重开数据还在**（这才是"持久化"，内存版做不到）', async () => {
    const file = tempDb()
    const first = createSqliteStore(file) as unknown as Store
    await first.saveForm('crm', design('客户台账'), '客户台账')
    const meta = (await first.listForms())[0]
    await first.appendRecord(meta.collectKey, { id: 'r1', time: '2026-10-26 10:00', data: { name: '张三' } })
    await first.appendRecord(meta.collectKey, { id: 'r2', time: '2026-10-26 10:05', data: { name: '李四' } })
    first.close?.()

    // 进程/连接都没了，重新打开同一个文件
    const second = createSqliteStore(file) as unknown as Store
    try {
      expect(await second.listForms(), '表单要从磁盘读回来').toMatchObject([
        { id: 'crm', name: '客户台账', collectKey: 'fd_collect_crm' },
      ])
      expect(await second.loadForm('crm'), '设计文档（JSON）也要读回来').toMatchObject({
        meta: { title: '客户台账' },
      })
      const records = await second.loadRecords('fd_collect_crm')
      expect(records.map((r) => r.id), '记录顺序：后写的在前（与内存版一致）').toEqual(['r2', 'r1'])
      expect(records[0].data).toEqual({ name: '李四' })
      expect(await second.stats()).toEqual({ forms: 1, records: 2 })
    } finally {
      second.close?.()
    }
  })

  it('**真进程 + 真文件 + 真重启**：起 CLI 写一条表单，杀掉进程再起，数据还在', async () => {
    const file = tempDb()
    const token = 'cli-probe-token'
    const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

    // ① 第一次启动：写一张表单
    const first = await startRealCli(file, token)
    try {
      const created = await fetch(`${first.origin}/api/lowcode/forms`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ design: design('真进程表单'), name: '真进程表单' }),
      })
      expect(created.status, '创建表单应 2xx').toBeLessThan(300)
    } finally {
      await first.stop()
    }

    // ② 第二次启动（同一 DB 文件）：数据必须还在 —— 这是"持久化"唯一有说服力的证法
    const second = await startRealCli(file, token)
    try {
      const forms = (await (
        await fetch(`${second.origin}/api/lowcode/forms`, { headers: auth })
      ).json()) as { name: string; collectKey: string }[]
      expect(forms.map((f) => f.name), '重启后表单还在（内存版会空）').toEqual(['真进程表单'])
      expect(forms[0].collectKey).toMatch(/^fd_collect_/)

      const records = await fetch(`${second.origin}/api/lowcode/records/${forms[0].collectKey}`, {
        headers: auth,
      })
      expect(await records.json(), '记录接口在重启后也正常').toEqual([])
    } finally {
      await second.stop()
    }
  }, 60_000)

  it('数据是**真表里的真列**：宿主可以直接用 SQL / json_extract 查业务字段', async () => {
    const store = createSqliteStore(':memory:') as unknown as Store
    try {
      await store.saveForm('orders', design('订单'), '订单')
      const meta = (await store.listForms())[0]
      await store.appendRecord(meta.collectKey, {
        id: 'o1',
        time: '2026-10-26 11:00',
        data: { customer: '张三', amount: 1200 },
      })

      // ① 表结构就是 README 写的那两张表
      const rows = store.raw!.prepare('SELECT collect_key, id FROM records').all() as {
        collect_key: string
        id: string
      }[]
      expect(rows).toEqual([{ collect_key: 'fd_collect_orders', id: 'o1' }])

      // ② 低代码之外的自定义查询：JSON1 直接取业务字段（这是"接自己数据库"的日常用法）
      const sum = store.raw!.prepare("SELECT SUM(json_extract(data, '$.amount')) AS total FROM records").get() as {
        total: number
      }
      expect(sum.total, '宿主自己的聚合查询能读到低代码写进来的数据').toBe(1200)

      // ③ 宿主直接改列（比如加索引/软删除列）也不会破坏低代码读：只要字段口径不变
      const named = store.raw!.prepare("SELECT json_extract(data, '$.customer') AS c FROM records").get() as {
        c: string
      }
      expect(named.c).toBe('张三')
    } finally {
      store.close?.()
    }
  })

  it('**两版实现行为一致**：同一批操作后，表单/记录/统计三样结果相等（时间字段除外）', async () => {
    // 归一化两处**本来就该随机**的东西：`saveForm(null, …)` 生成的 id 与由它派生的 collectKey。
    // 这两个不同是实现无关的（都是 `form_<uuid>`），抹掉后比较的才是真正的行为差异。
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const norm = (forms: { id: string; name: string; collectKey: string; updatedAt: string }[]) =>
      forms.map((f) => {
        const bare = f.id.replace(/^form_/, '')
        const generated = UUID.test(bare)
        return {
          id: generated ? 'form_<uuid>' : f.id,
          name: f.name,
          collectKey: generated ? 'fd_collect_form_<uuid>' : f.collectKey,
        }
      })

    async function script(s: Store) {
      const saved = await s.saveForm(null, design('工单'), '工单')
      const id = (await s.listForms())[0].id
      await s.appendRecord(saved.collectKey, { id: 'a', time: 't1', data: { k: 1 } })
      await s.appendRecord(saved.collectKey, { id: 'b', time: 't2', data: { k: 2 } })
      await s.updateRecord(saved.collectKey, 'a', { k: 11 })
      await s.removeRecord(saved.collectKey, 'b')
      await s.renameForm(id, '工单（改名）')
      const forms = await s.listForms()
      const records = await s.loadRecords(saved.collectKey)
      const stats = await s.stats()
      // 级联删除也要一致：删表单后它的记录必须一起消失
      await s.deleteForm(id)
      const afterDelete = await s.stats()
      return { forms: norm(forms), records, stats, afterDelete }
    }

    const memory = await script(createMemoryStore() as unknown as Store)
    const sqliteStore = createSqliteStore(':memory:') as unknown as Store
    let sqlite
    try {
      sqlite = await script(sqliteStore)
    } finally {
      sqliteStore.close?.()
    }

    expect(sqlite.forms, '表单列表（名字/收集键）一致').toEqual(memory.forms)
    expect(sqlite.records, '记录内容与顺序一致').toEqual(memory.records)
    expect(sqlite.stats, '统计一致').toEqual(memory.stats)
    expect(sqlite.afterDelete, '删表单级联删记录后一致').toEqual(memory.afterDelete)
    expect(sqlite.afterDelete, '级联删除后确实空了').toEqual({ forms: 0, records: 0 })
  })
})