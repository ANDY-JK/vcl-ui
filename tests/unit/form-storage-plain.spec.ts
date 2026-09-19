// useFormStorage 运行时草稿 · 纯化锁定（同因修复）
// 背景：运行时 FormBuilder 以 reactive 的 formData.value 调 saveDraft，
// Proxy 无法 structuredClone → IndexedDB put 静默失败（存量 bug，2026-09-05 修复）
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reactive } from 'vue'

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

import { useFormStorage } from '@/components/form-builder/useFormStorage'

beforeEach(() => {
  mem.clear()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('useFormStorage · 运行时草稿纯化（根因修复锁定）', () => {
  it('reactive 表单数据入库前被纯化（structuredClone 兼容）', async () => {
    const { saveDraft } = useFormStorage()
    // 模拟 FormBuilder 实况：formData.value 是深度响应式代理
    const formData = reactive({ field1: '答案', field2: ['a', 'b'] })
    await saveDraft('my-form', formData)
    const stored = mem.get('form-drafts::my-form') as { field1: string; field2: string[] }
    expect(() => structuredClone(stored)).not.toThrow()
    expect(stored.field1).toBe('答案')
    expect(stored.field2).toEqual(['a', 'b'])
  })

  it('纯化后 load 草稿原样取回', async () => {
    const { saveDraft, loadDraft } = useFormStorage()
    const formData = reactive({ field1: 'x' })
    await saveDraft('k', formData)
    await expect(loadDraft('k')).resolves.toEqual({ field1: 'x' })
  })
})
