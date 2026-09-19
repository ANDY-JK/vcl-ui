// useDesignerDraft 逻辑锁定（P2-13 设计器草稿自动保存）
// happy-dom 无 IndexedDB：mock @/components/storage/indexedDB 为内存实现，
// 覆盖 存取回路 / 无草稿 / 清除 / 容量保护 / 脏数据拒载 五条路径
import { describe, it, expect, vi, beforeEach } from 'vitest'

// 内存 IndexedDB（vi.hoisted 保证与 mock 工厂同生命周期，暴露给测试直接注入脏数据）
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

import { useDesignerDraft, DRAFT_STORE, DRAFT_KEY } from '@/components/form-builder/designer/useDesignerDraft'
import { createField } from '@/components/form-builder/designer/types'
import { reactive } from 'vue'

beforeEach(() => {
  mem.clear()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('useDesignerDraft · 存取回路', () => {
  it('save 后 load 原样取回 nodes + meta + savedAt', async () => {
    const { loadDraft, saveDraft } = useDesignerDraft()
    const nodes = [createField('text', 1)]
    const meta = { title: '草稿表单' }
    await saveDraft(nodes, meta)
    const draft = await loadDraft()
    expect(draft).not.toBeNull()
    expect(draft!.nodes).toHaveLength(1)
    expect(draft!.nodes[0].type).toBe('text')
    expect(draft!.meta.title).toBe('草稿表单')
    expect(draft!.savedAt).toBeTruthy()
  })

  it('无草稿时 load 返回 null', async () => {
    const { loadDraft } = useDesignerDraft()
    await expect(loadDraft()).resolves.toBeNull()
  })

  it('clear 后 load 返回 null', async () => {
    const { loadDraft, saveDraft, clearDraft } = useDesignerDraft()
    await saveDraft([createField('text', 1)], {})
    await clearDraft()
    await expect(loadDraft()).resolves.toBeNull()
  })
})

describe('useDesignerDraft · 防御', () => {
  it('响应式 Proxy 节点入库前被纯化（structuredClone 兼容，根因修复锁定）', async () => {
    const { saveDraft } = useDesignerDraft()
    // 模拟 FormDesigner 实况：nodes/meta 均来自响应式 props
    const nodes = reactive([createField('text', 1)])
    const meta = reactive({ title: '响应式' })
    await saveDraft(nodes, meta)
    const stored = [...mem.values()][0] as { nodes: unknown[]; meta: unknown }
    // 纯化后可被 IndexedDB structuredClone 克隆（Proxy 会抛 DataCloneError）
    expect(() => structuredClone(stored)).not.toThrow()
    expect(stored.nodes).toHaveLength(1)
    expect((stored.meta as { title: string }).title).toBe('响应式')
  })

  it('超 2MB 的设计拒绝写入（存储无残留）', async () => {
    const { loadDraft, saveDraft } = useDesignerDraft()
    // 构造超限 meta：单个字符串字段 > 2MB
    const bigMeta = { title: 'x'.repeat(2 * 1024 * 1024 + 1) } as unknown as DesignerDraft['meta']
    await saveDraft([], bigMeta)
    // 无效写入被跳过 → 无草稿可读
    await expect(loadDraft()).resolves.toBeNull()
  })

  it('存储中是数组/原始值等脏数据时 load 返回 null（不崩溃）', async () => {
    const { loadDraft } = useDesignerDraft()
    // 直接向真实 store 名注入脏数据
    mem.set(`${DRAFT_STORE}::${DRAFT_KEY}`, [1, 2, 3])
    await expect(loadDraft()).resolves.toBeNull()
    mem.set(`${DRAFT_STORE}::${DRAFT_KEY}`, 'polluted')
    await expect(loadDraft()).resolves.toBeNull()
    // nodes 缺失的设计对象同样拒载
    mem.set(`${DRAFT_STORE}::${DRAFT_KEY}`, { meta: {} })
    await expect(loadDraft()).resolves.toBeNull()
  })
})
