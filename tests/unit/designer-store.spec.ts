/**
 * designer/store.ts — 表单存储抽象层（2026-10-23）
 *
 * ## 为什么补
 *
 * 460 行、未覆盖 123 行。虽有 10 个 spec 间接引用，但都只用到
 * 「createLocalFormStore 存/取」这一条路径。以下分支零覆盖：
 *
 *   · migrateCollectKeys 读时迁移（老指纹键 → fd_collect_<id>，
 *     被单表单引用时清老键、被多表单共用时保留）
 *   · MAX_RECORDS=500 超限淘汰最旧
 *   · updateRecord 的 idx===-1 早退
 *   · saveForm 的 id 不存在时抛 formNotFound
 *   · renameForm / deleteForm 的 not-found 早退
 *   · createCloudFormStore 全部方法（走 SupabaseKVAdapter，可注入假适配器）
 *   · loadStoreMode / saveStoreMode / loadCloudConfig / saveCloudConfig
 *     （含非法 JSON、缺字段、配额满）
 *   · getActiveFormStore 的三级回退（cloud 成功 / cloud 抛错回退 local /
 *     无配置回退 local）
 *   · createFormStore 的 cloud 缺配置抛错
 *   · envCloudConfig 三键齐全才返回
 *
 * ## 测法
 *
 * 本地实现：真 localStorage（happy-dom 有），每个用例前清空。
 * 云端实现：mock SupabaseKVAdapter 成内存 KV。
 * 活动 store 是模块级单例 —— 用 vi.resetModules() + 动态 import 隔离。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/* ═══════════ 依赖 mock ═══════════ */

const h = vi.hoisted(() => ({
  /** SupabaseKVAdapter 的内存后端 */
  kv: new Map<string, unknown>(),
  /** 各方法调用记录 */
  kvCalls: [] as string[],
  /** validateSupabaseConfig 返回值（空串=合法） */
  cfgInvalid: '' as string,
  /** envValue 返回值表 */
  env: {} as Record<string, string | undefined>,
}))

vi.mock('@/components/storage/supabase-transport', () => {
  class SupabaseKVAdapter {
    constructor(public cfg: unknown) {}
    async get<T>(k: string): Promise<T | null> {
      h.kvCalls.push(`get:${k}`)
      return (h.kv.get(k) as T) ?? null
    }
    async set(k: string, v: unknown): Promise<void> {
      h.kvCalls.push(`set:${k}`)
      h.kv.set(k, v)
    }
    async remove(k: string): Promise<void> {
      h.kvCalls.push(`remove:${k}`)
      h.kv.delete(k)
    }
  }
  return {
    SupabaseKVAdapter,
    validateSupabaseConfig: vi.fn(() => h.cfgInvalid),
  }
})

vi.mock('@/components/_internal/env-guard', () => ({
  envValue: vi.fn((k: string) => h.env[k]),
}))

import type { FormDesign, CollectRecord, FormMetaItem } from '@/components/form-builder/designer/types'

/* ═══════════ 夹具 ═══════════ */

const design = (title = '表单'): FormDesign =>
  ({ schemaVersion: 1, meta: { title }, nodes: [{ id: 'n1', type: 'text', label: 'a' }] }) as unknown as FormDesign

const rec = (id: string): CollectRecord => ({ id, time: '2026-01-01 10:00', data: { a: 1 } }) as unknown as CollectRecord

/** 每个用例前重置模块缓存，拿干净的模块级单例 */
async function freshStore() {
  vi.resetModules()
  return (await import('@/components/form-builder/designer/store')) as typeof import('@/components/form-builder/designer/store')
}

beforeEach(() => {
  h.kv = new Map()
  h.kvCalls = []
  h.cfgInvalid = ''
  h.env = {}
  localStorage.clear()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

/* ═══════════ 本地实现：表单 CRUD ═══════════ */

describe('createLocalFormStore：表单 CRUD', () => {
  it('**saveForm 无 id → 新建并 unshift 到索引首位**', async () => {
    const { createLocalFormStore } = await freshStore()
    const s = createLocalFormStore()
    const a = await s.saveForm(null, design('A'), '表单A')
    const b = await s.saveForm(null, design('B'), '表单B')

    expect(a.id, '应有 id').toMatch(/^f_/)
    expect(a.collectKey, 'collectKey 以表单 id 为锚').toBe(`fd_collect_${a.id}`)

    const list = await s.listForms()
    expect(list.length, '应有 2 个').toBe(2)
    expect(list[0]?.id, '新建的在前').toBe(b.id)
  })

  it('**saveForm 无 name → 回落 design.meta.title**', async () => {
    const { createLocalFormStore } = await freshStore()
    const s = createLocalFormStore()
    const item = await s.saveForm(null, design('标题兜底'))
    expect(item.name, '应用 meta.title').toBe('标题兜底')
  })

  it('**saveForm 有 id → 覆盖更新 name/updatedAt，不新增**', async () => {
    const { createLocalFormStore } = await freshStore()
    const s = createLocalFormStore()
    const a = await s.saveForm(null, design('A'), '旧名')
    const again = await s.saveForm(a.id, design('A2'), '新名')

    expect(again.id, 'id 不变').toBe(a.id)
    expect(again.name, '名字已改').toBe('新名')
    const list = await s.listForms()
    expect(list.length, '不该新增').toBe(1)
  })

  it('**saveForm 有 id 但不存在 → 抛 formNotFound**', async () => {
    const { createLocalFormStore } = await freshStore()
    const s = createLocalFormStore()
    await expect(s.saveForm('f_missing', design(), 'x'), '应抛错').rejects.toThrow()
  })

  it('**loadForm 存在/不存在**', async () => {
    const { createLocalFormStore } = await freshStore()
    const s = createLocalFormStore()
    const a = await s.saveForm(null, design('有'), '有')
    const loaded = await s.loadForm(a.id)
    expect(loaded?.meta.title, '应读回设计').toBe('有')
    expect(await s.loadForm('f_nope'), '不存在返回 null').toBeNull()
  })

  it('**renameForm 成功 / not-found 早退（不抛）**', async () => {
    const { createLocalFormStore } = await freshStore()
    const s = createLocalFormStore()
    const a = await s.saveForm(null, design(), '原名')
    await s.renameForm(a.id, '改名')
    expect((await s.listForms())[0]?.name, '应改名').toBe('改名')
    // not-found 不抛错
    await expect(s.renameForm('f_nope', 'x'), 'not-found 应静默').resolves.toBeUndefined()
  })

  it('**deleteForm 清索引 + 删设计 + 删收集桶**', async () => {
    const { createLocalFormStore } = await freshStore()
    const s = createLocalFormStore()
    const a = await s.saveForm(null, design(), 'A')
    await s.appendRecord(a.collectKey, rec('r1'))
    expect((await s.loadRecords(a.collectKey)).length, '前置应有 1 条').toBe(1)

    await s.deleteForm(a.id)
    expect((await s.listForms()).length, '索引应空').toBe(0)
    expect(await s.loadForm(a.id), '设计应删').toBeNull()
    expect((await s.loadRecords(a.collectKey)).length, '收集桶应清').toBe(0)
  })

  it('**deleteForm not-found 早退（不抛）**', async () => {
    const { createLocalFormStore } = await freshStore()
    const s = createLocalFormStore()
    await expect(s.deleteForm('f_nope'), 'not-found 应静默').resolves.toBeUndefined()
  })
})

/* ═══════════ 本地实现：收集记录 ═══════════ */

describe('createLocalFormStore：收集记录', () => {
  it('**appendRecord unshift 到最前**', async () => {
    const { createLocalFormStore } = await freshStore()
    const s = createLocalFormStore()
    await s.appendRecord('k', rec('r1'))
    await s.appendRecord('k', rec('r2'))
    const list = await s.loadRecords('k')
    expect(list[0]?.id, '最新在前').toBe('r2')
    expect(list.length).toBe(2)
  })

  it('**appendRecord 超 MAX_RECORDS(500) 淘汰最旧**', async () => {
    const { createLocalFormStore } = await freshStore()
    const s2 = createLocalFormStore()
    await s2.clearRecords('k')
    for (let i = 0; i < 500; i++) {
      await s2.appendRecord('k', rec(`r${i}`))
    }
    expect((await s2.loadRecords('k')).length, '前置应有 500').toBe(500)

    await s2.appendRecord('k', rec('newest'))
    const after = await s2.loadRecords('k')
    expect(after.length, '应截断到 500').toBe(500)
    expect(after[0]?.id, '最新在最前').toBe('newest')
    expect(
      after.some((r) => r.id === 'r0'),
      '最旧的 r0 应被淘汰',
    ).toBe(false)
  })

  it('**updateRecord 命中 → 合并 data；未命中 → 静默早退**', async () => {
    const { createLocalFormStore } = await freshStore()
    const s = createLocalFormStore()
    await s.appendRecord('k', rec('r1'))

    await s.updateRecord('k', 'r1', { a: 99 })
    const got = (await s.loadRecords('k'))[0]
    expect(got?.id, 'id 应保留（整条替换会丢）').toBe('r1')
    expect(got?.time, 'time 应保留（整条替换会丢）').toBe('2026-01-01 10:00')
    expect(got?.data, 'data 应换成新值').toEqual({ a: 99 })

    // 未命中：长度不变 + 首条内容不变（越界写会新增元素/改写 undefined）
    const before = await s.loadRecords('k')
    await s.updateRecord('k', 'nope', { a: 1 })
    const after = await s.loadRecords('k')
    expect(after.length, '未命中不该改变条数').toBe(before.length)
    expect(after[0]?.id, '首条应仍是 r1').toBe('r1')
    expect(after[0]?.data, '首条 data 不该被覆盖').toEqual({ a: 99 })
    // 越界写 list[-1] 在普通数组上只是加了个 "-1" 非索引属性，
    // JSON.stringify 会忽略它 —— 但先序列化就能看出差异（快照对比）
    expect(JSON.stringify(after), '持久化内容不该变').toBe(JSON.stringify(before))
  })

  it('**removeRecord 按 id 过滤**', async () => {
    const { createLocalFormStore } = await freshStore()
    const s = createLocalFormStore()
    await s.appendRecord('k', rec('r1'))
    await s.appendRecord('k', rec('r2'))
    await s.removeRecord('k', 'r1')
    const list = await s.loadRecords('k')
    expect(list.length).toBe(1)
    expect(list[0]?.id).toBe('r2')
  })

  it('**clearRecords 清空该键**', async () => {
    const { createLocalFormStore } = await freshStore()
    const s = createLocalFormStore()
    await s.appendRecord('k', rec('r1'))
    await s.clearRecords('k')
    expect((await s.loadRecords('k')).length).toBe(0)
  })
})

/* ═══════════ 本地实现：collectKey 读时迁移 ═══════════ */

describe('migrateCollectKeys：老指纹键 → fd_collect_<id>', () => {
  /** 直接写索引（模拟老版本落盘格式） */
  function seedIndex(list: Array<Partial<FormMetaItem>>) {
    localStorage.setItem('fd_forms_index', JSON.stringify(list))
    return list
  }

  it('**单表单引用老键 → 数据搬到新键并删老键**', async () => {
    const { createLocalFormStore } = await freshStore()
    // 老格式：collectKey 是结构指纹（不含 fd_collect_ 前缀）
    seedIndex([{ id: 'f_1', name: 'A', updatedAt: '', collectKey: 'legacy_fp_abc' }])
    localStorage.setItem('legacy_fp_abc', JSON.stringify([rec('r1')]))

    const s = createLocalFormStore()
    const list = await s.listForms()

    expect(list[0]?.collectKey, '应迁移成 fd_collect_ 前缀').toBe('fd_collect_f_1')
    expect((await s.loadRecords('fd_collect_f_1')).length, '数据应搬过来').toBe(1)
    expect(localStorage.getItem('legacy_fp_abc'), '单引用应删老键').toBeNull()

    // 迁移必须**落盘**：直接读原始索引（不经 store 重算）。
    // 只靠 listForms() 二次调用看不出差异 —— 迁移是幂等重算，不保存下次也会再算一遍，
    // 唯一可观察的差别就是持久化本身。
    const rawIndex = JSON.parse(localStorage.getItem('fd_forms_index') ?? '[]') as Array<{ collectKey: string }>
    expect(rawIndex[0]?.collectKey, '迁移结果应写回 localStorage 索引').toBe('fd_collect_f_1')
  })

  it('**多表单共用老键 → 各留副本、老键保留**', async () => {
    const { createLocalFormStore } = await freshStore()
    seedIndex([
      { id: 'f_1', name: 'A', updatedAt: '', collectKey: 'shared_fp' },
      { id: 'f_2', name: 'B', updatedAt: '', collectKey: 'shared_fp' },
    ])
    localStorage.setItem('shared_fp', JSON.stringify([rec('r1')]))

    const s = createLocalFormStore()
    const list = await s.listForms()

    expect(list[0]?.collectKey, '表1 迁到自己的桶').toBe('fd_collect_f_1')
    expect(list[1]?.collectKey, '表2 迁到自己的桶').toBe('fd_collect_f_2')
    expect((await s.loadRecords('fd_collect_f_1')).length, '表1 有副本').toBe(1)
    expect((await s.loadRecords('fd_collect_f_2')).length, '表2 有副本').toBe(1)
    expect(localStorage.getItem('shared_fp'), '共用键不该删（宁可重复不丢数据）').not.toBeNull()
  })

  it('**新键已有数据 → 不覆盖（老数据不搬）**', async () => {
    const { createLocalFormStore } = await freshStore()
    seedIndex([{ id: 'f_1', name: 'A', updatedAt: '', collectKey: 'legacy_fp' }])
    localStorage.setItem('legacy_fp', JSON.stringify([rec('old')]))
    localStorage.setItem('fd_collect_f_1', JSON.stringify([rec('existing'), rec('existing2')]))

    const s = createLocalFormStore()
    await s.listForms()

    const got = await s.loadRecords('fd_collect_f_1')
    expect(got.length, '应保留已有 2 条（不覆盖）').toBe(2)
    expect(got[0]?.id, '仍是原数据').toBe('existing')
  })

  it('**老键无数据 → 只改 collectKey，不写新键**', async () => {
    const { createLocalFormStore } = await freshStore()
    seedIndex([{ id: 'f_1', name: 'A', updatedAt: '', collectKey: 'empty_fp' }])

    const s = createLocalFormStore()
    const list = await s.listForms()
    expect(list[0]?.collectKey).toBe('fd_collect_f_1')
    expect((await s.loadRecords('fd_collect_f_1')).length, '无数据可搬').toBe(0)
  })

  it('**已迁移过的索引 → 不再改动**（幂等）', async () => {
    const { createLocalFormStore } = await freshStore()
    seedIndex([{ id: 'f_1', name: 'A', updatedAt: '', collectKey: 'fd_collect_f_1' }])
    const s = createLocalFormStore()
    const list = await s.listForms()
    expect(list[0]?.collectKey, '保持原值').toBe('fd_collect_f_1')
  })
})

/* ═══════════ 云端实现 ═══════════ */

describe('createCloudFormStore', () => {
  const cfg = { url: 'https://x.supabase.co', anonKey: 'anon', bucket: 'b' }

  it('**配置非法 → 抛错（调用方决定降级）**', async () => {
    h.cfgInvalid = '缺 bucket'
    const { createCloudFormStore } = await freshStore()
    expect(() => createCloudFormStore(cfg), '应抛错').toThrow(/缺 bucket/)
  })

  it('**表单 CRUD 走 KV 适配器**', async () => {
    const { createCloudFormStore } = await freshStore()
    const s = createCloudFormStore(cfg)

    const a = await s.saveForm(null, design('云表单'), '云A')
    expect(a.id).toMatch(/^f_/)
    expect(h.kvCalls.some((c) => c.includes('fd_forms_index')), '应写索引').toBe(true)

    const loaded = await s.loadForm(a.id)
    expect(loaded?.meta.title, '应读回').toBe('云表单')

    const list = await s.listForms()
    expect(list.length).toBe(1)

    await s.renameForm(a.id, '云改名')
    expect((await s.listForms())[0]?.name).toBe('云改名')

    const collectKey = (await s.listForms())[0]!.collectKey
    h.kv.set(collectKey, [rec('r1')])

    await s.deleteForm(a.id)
    expect((await s.listForms()).length).toBe(0)
    expect(await s.loadForm(a.id), '设计应删').toBeNull()
    expect(h.kv.get(collectKey), '收集桶应一并删除').toBeUndefined()
  })

  it('**saveForm 有 id 但索引里没有 → 抛 formNotFound**', async () => {
    const { createCloudFormStore } = await freshStore()
    const s = createCloudFormStore(cfg)
    await expect(s.saveForm('f_nope', design(), 'x'), '应抛错').rejects.toThrow()
  })

  it('**renameForm / deleteForm not-found → 静默早退**', async () => {
    const { createCloudFormStore } = await freshStore()
    const s = createCloudFormStore(cfg)
    await expect(s.renameForm('nope', 'x')).resolves.toBeUndefined()
    await expect(s.deleteForm('nope')).resolves.toBeUndefined()
  })

  it('**收集记录四法**（append unshift / update 合并 / remove 过滤 / clear 删键）', async () => {
    const { createCloudFormStore } = await freshStore()
    const s = createCloudFormStore(cfg)

    await s.appendRecord('k', rec('r1'))
    await s.appendRecord('k', rec('r2'))
    expect((await s.loadRecords('k'))[0]?.id, '最新在前').toBe('r2')

    await s.updateRecord('k', 'r1', { a: 9 })
    expect((await s.loadRecords('k')).find((r) => r.id === 'r1')?.data, '应合并').toEqual({ a: 9 })

    // 未命中静默：不该产生新的 **set**（loadRecords 本身会调 kv.get，故只能数 set）
    const setsBefore = h.kvCalls.filter((c) => c.startsWith('set:')).length
    await s.updateRecord('k', 'nope', { a: 1 })
    const setsAfter = h.kvCalls.filter((c) => c.startsWith('set:')).length
    expect(setsAfter, '未命中不该写 KV').toBe(setsBefore)
    await s.removeRecord('k', 'r2')
    expect((await s.loadRecords('k')).length).toBe(1)

    await s.clearRecords('k')
    expect((await s.loadRecords('k')).length, '应清空').toBe(0)
  })

  it('**appendRecord 超 MAX_RECORDS 截断**', async () => {
    const { createCloudFormStore } = await freshStore()
    const s = createCloudFormStore(cfg)
    // 预置 500 条到 KV
    h.kv.set('k', Array.from({ length: 500 }, (_, i) => rec(`r${i}`)))
    await s.appendRecord('k', rec('newest'))
    const list = await s.loadRecords('k')
    expect(list.length, '应截断到 500').toBe(500)
    expect(list[0]?.id).toBe('newest')
  })

  it('**云端也做 collectKey 读时迁移**', async () => {
    const { createCloudFormStore } = await freshStore()
    h.kv.set('fd_forms_index', [{ id: 'f_1', name: 'A', updatedAt: '', collectKey: 'legacy_fp' }])
    h.kv.set('legacy_fp', [rec('r1')])

    const s = createCloudFormStore(cfg)
    const list = await s.listForms()
    expect(list[0]?.collectKey, '应迁移').toBe('fd_collect_f_1')
    expect((await s.loadRecords('fd_collect_f_1')).length, '数据应搬').toBe(1)
    expect(h.kv.get('legacy_fp'), '单引用应删老键').toBeUndefined()
  })
})

/* ═══════════ 模式与配置持久化 ═══════════ */

describe('loadStoreMode / saveStoreMode', () => {
  it('**默认 local；存 cloud 后读回 cloud**', async () => {
    const m = await freshStore()
    expect(m.loadStoreMode(), '默认 local').toBe('local')
    m.saveStoreMode('cloud')
    expect(m.loadStoreMode(), '应读回 cloud').toBe('cloud')
  })

  it('**非法值回落 local**', async () => {
    const m = await freshStore()
    localStorage.setItem('fd_store_mode_v1', 'weird')
    expect(m.loadStoreMode(), '非法值应回落').toBe('local')
  })
})

describe('loadCloudConfig / saveCloudConfig', () => {
  const cfg = { url: 'https://x.supabase.co', anonKey: 'anon', bucket: 'b' }

  it('**未配置 → null；存后读回完整三字段**', async () => {
    const m = await freshStore()
    expect(m.loadCloudConfig(), '未配置 null').toBeNull()
    m.saveCloudConfig(cfg)
    expect(m.loadCloudConfig(), '应读回').toEqual(cfg)
  })

  it('**传 null → 清除配置**', async () => {
    const m = await freshStore()
    m.saveCloudConfig(cfg)
    m.saveCloudConfig(null)
    expect(m.loadCloudConfig(), '应清除').toBeNull()
  })

  it('**缺字段 → 返回 null**（不返回半残配置）', async () => {
    const m = await freshStore()
    localStorage.setItem('fd_cloud_cfg_v1', JSON.stringify({ url: 'x' }))
    expect(m.loadCloudConfig(), '缺字段应 null').toBeNull()
  })

  it('**非法 JSON → null（不抛）**', async () => {
    const m = await freshStore()
    localStorage.setItem('fd_cloud_cfg_v1', '{bad json')
    expect(m.loadCloudConfig(), '应吞掉解析错误').toBeNull()
  })
})

describe('envCloudConfig', () => {
  it('**三键齐全 → 返回配置**', async () => {
    h.env = {
      VITE_SUPABASE_URL: 'https://env.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'env-anon',
      VITE_SUPABASE_BUCKET: 'env-b',
    }
    const m = await freshStore()
    expect(m.envCloudConfig(), '应返回').toEqual({
      url: 'https://env.supabase.co',
      anonKey: 'env-anon',
      bucket: 'env-b',
    })
  })

  it('**缺任一键 → null**', async () => {
    h.env = { VITE_SUPABASE_URL: 'https://x' } // 缺 key/bucket
    const m = await freshStore()
    expect(m.envCloudConfig(), '缺键应 null').toBeNull()
  })
})

/* ═══════════ 全局活动 store ═══════════ */

describe('getActiveFormStore / setActiveFormStore', () => {
  it('**默认创建本地 store（单例复用）**', async () => {
    const m = await freshStore()
    const a = m.getActiveFormStore()
    const b = m.getActiveFormStore()
    expect(a, '应复用同一实例').toBe(b)
  })

  it('**setActiveFormStore 覆盖后 getActiveFormStore 返回新实例**', async () => {
    const m = await freshStore()
    const custom = m.createLocalFormStore()
    m.setActiveFormStore(custom)
    expect(m.getActiveFormStore(), '应返回注入的实例').toBe(custom)
  })

  it('**模式=cloud 且有配置 → 创建云端 store**', async () => {
    const m = await freshStore()
    m.saveStoreMode('cloud')
    m.saveCloudConfig({ url: 'https://x.supabase.co', anonKey: 'a', bucket: 'b' })
    const s = m.getActiveFormStore()
    // 云端 store 的 listForms 会走 KV（h.kvCalls 有记录）
    await s.listForms()
    expect(h.kvCalls.length, '应走云端 KV').toBeGreaterThan(0)
  })

  it('**模式=cloud 但 createCloudFormStore 抛错 → 诚实回退本地**', async () => {
    h.cfgInvalid = '坏配置'
    const m = await freshStore()
    m.saveStoreMode('cloud')
    m.saveCloudConfig({ url: 'https://x.supabase.co', anonKey: 'a', bucket: 'b' })

    const s = m.getActiveFormStore()
    // 回退到本地：listForms 不碰 KV
    h.kvCalls = []
    await s.listForms()
    expect(h.kvCalls.length, '应回退本地（不碰 KV）').toBe(0)
  })

  it('**模式=cloud 但无配置 → 回退本地**', async () => {
    const m = await freshStore()
    m.saveStoreMode('cloud')
    // 无 loadCloudConfig、无 env
    const s = m.getActiveFormStore()
    h.kvCalls = []
    await s.listForms()
    expect(h.kvCalls.length, '应回退本地').toBe(0)
  })
})

/* ═══════════ createFormStore 工厂 ═══════════ */

describe('createFormStore', () => {
  it('**mode=local → 本地 store**', async () => {
    const m = await freshStore()
    const s = m.createFormStore('local')
    h.kvCalls = []
    await s.listForms()
    expect(h.kvCalls.length, '不该碰 KV').toBe(0)
  })

  it('**mode=cloud + 显式配置 → 云端 store**', async () => {
    const m = await freshStore()
    const s = m.createFormStore('cloud', { url: 'https://x.supabase.co', anonKey: 'a', bucket: 'b' })
    await s.listForms()
    expect(h.kvCalls.length, '应走 KV').toBeGreaterThan(0)
  })

  it('**mode=cloud 但无任何配置 → 抛 cloudConfigMissing**', async () => {
    const m = await freshStore()
    expect(() => m.createFormStore('cloud'), '应抛错').toThrow()
  })

  it('**mode=cloud 用持久化配置**', async () => {
    const m = await freshStore()
    m.saveCloudConfig({ url: 'https://x.supabase.co', anonKey: 'a', bucket: 'b' })
    const s = m.createFormStore('cloud')
    await s.listForms()
    expect(h.kvCalls.length, '应走持久化配置').toBeGreaterThan(0)
  })
})
