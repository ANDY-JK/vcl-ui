// storage-scope：多租户/工作区隔离（H.1 第 4 项）
//
// 要证明的：① 默认作用域为空时键**与改造前逐字一致**（老数据不受影响）；
//          ② 设了作用域后，两个租户的键不重叠 → 读不到彼此的数据（真隔离，不是字符串拼接好看）。
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { setStorageScope, getStorageScope, scopedKey } from '@/components/form-builder/designer/storage-scope'
import { useDesignerDraft, DRAFT_STORE, DRAFT_KEY } from '@/components/form-builder/designer/useDesignerDraft'
import { createField } from '@/components/form-builder/designer/types'

// happy-dom 无 IndexedDB：用内存实现替换（同 designer-draft.spec 的做法）
const mem = vi.hoisted(() => new Map<string, unknown>())
vi.mock('@/components/storage/indexedDB', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/storage/indexedDB')>()
  return {
    ...actual,
    dbPut: vi.fn(async (store: string, key: string, value: unknown) => {
      mem.set(`${store}::${key}`, value)
    }),
    dbGet: vi.fn(async (store: string, key: string) => mem.get(`${store}::${key}`) ?? null),
    dbDelete: vi.fn(async (store: string, key: string) => {
      mem.delete(`${store}::${key}`)
    }),
  }
})

beforeEach(() => {
  mem.clear()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  setStorageScope(null)
  vi.restoreAllMocks()
})

describe('作用域基础行为', () => {
  it('默认无作用域：键原样返回（改造前后逐字一致）', () => {
    expect(getStorageScope()).toBe('')
    expect(scopedKey('fd_forms_index')).toBe('fd_forms_index')
  })

  it('设了作用域：加前缀', () => {
    setStorageScope('tenant-a')
    expect(getStorageScope()).toBe('tenant-a')
    expect(scopedKey('fd_forms_index')).toBe('tenant-a::fd_forms_index')
  })

  it('传 null / 空串清除作用域', () => {
    setStorageScope('tenant-a')
    setStorageScope(null)
    expect(getStorageScope()).toBe('')
    setStorageScope('tenant-b')
    setStorageScope('')
    expect(scopedKey('k')).toBe('k')
  })

  it('非法作用域被拒绝（不生效、保持原值）', () => {
    setStorageScope('tenant-a')
    // 含空格 / 冒号 / 超长 / 空 —— 都会破坏键结构或造成歧义
    for (const bad of ['has space', 'a::b', 'x'.repeat(65), '中文租户']) {
      setStorageScope(bad)
      expect(getStorageScope(), `应拒绝：${bad}`).toBe('tenant-a')
    }
  })

  it('允许的字符集：字母数字与 _ . -', () => {
    for (const good of ['a', 'A1', 'tenant_a', 'tenant.a', 'tenant-a', 'x'.repeat(64)]) {
      setStorageScope(good)
      expect(getStorageScope()).toBe(good)
    }
  })
})

describe('隔离是真的（数据不串租）', () => {
  it('两个租户写同名表单：存储键不重叠，互相读不到', async () => {
    setStorageScope('tenant-a')
    const draftA = useDesignerDraft()
    await draftA.saveDraft([createField('text', 1)], { title: 'A 的草稿' })

    setStorageScope('tenant-b')
    const draftB = useDesignerDraft()
    // B 租户看不到 A 的草稿
    await expect(draftB.loadDraft()).resolves.toBeNull()
    await draftB.saveDraft([createField('text', 1)], { title: 'B 的草稿' })

    // 各自读回自己的
    expect((await draftB.loadDraft())?.meta.title).toBe('B 的草稿')
    setStorageScope('tenant-a')
    expect((await useDesignerDraft().loadDraft())?.meta.title).toBe('A 的草稿')
  })

  it('清除只影响当前租户，不误删他人草稿', async () => {
    setStorageScope('tenant-a')
    await useDesignerDraft().saveDraft([createField('text', 1)], { title: 'A' })
    setStorageScope('tenant-b')
    await useDesignerDraft().saveDraft([createField('text', 1)], { title: 'B' })

    await useDesignerDraft().clearDraft()
    await expect(useDesignerDraft().loadDraft()).resolves.toBeNull()

    setStorageScope('tenant-a')
    expect((await useDesignerDraft().loadDraft())?.meta.title, 'A 的草稿不应被 B 的清除误删').toBe('A')
  })

  it('无作用域与有作用域也互不干扰（升级路径安全）', async () => {
    // 先按老行为（无作用域）存一份
    setStorageScope(null)
    await useDesignerDraft().saveDraft([createField('text', 1)], { title: '老数据' })

    // 切到租户作用域：看不到老数据（这是刻意的——避免把"全局数据"误当本租户数据）
    setStorageScope('tenant-a')
    await expect(useDesignerDraft().loadDraft()).resolves.toBeNull()

    // 切回来仍在（老数据没被破坏）
    setStorageScope(null)
    expect((await useDesignerDraft().loadDraft())?.meta.title).toBe('老数据')
  })

  it('底层确实写了带作用域的键（可人工核验）', async () => {
    setStorageScope('tenant-a')
    await useDesignerDraft().saveDraft([createField('text', 1)], { title: 'x' })
    expect([...mem.keys()]).toContain(`${DRAFT_STORE}::tenant-a::${DRAFT_KEY}`)
  })
})
