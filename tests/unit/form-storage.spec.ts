// useFormStorage 降级行为测试（happy-dom 无 IndexedDB/navigator.storage）
// 锁定：环境不支持时优雅降级（不抛错、返回安全值），而非崩溃
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useFormStorage } from '@/components/form-builder/useFormStorage'

// 无 IndexedDB 时 loadDraft 走 catch 预期 console.warn——静默避免污染测试日志
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('useFormStorage 降级行为（无 IndexedDB 环境）', () => {
  it('loadDraft：IndexedDB 不可用时返回 null（不抛错）', async () => {
    const { loadDraft } = useFormStorage()
    // happy-dom 无 indexedDB，dbGet 打开失败 → catch → 返回 null
    await expect(loadDraft('test-key')).resolves.toBeNull()
  })

  it('saveDraft：IndexedDB 不可用时静默失败（不抛错）', async () => {
    const { saveDraft } = useFormStorage()
    await expect(saveDraft('test-key', { name: 'x' })).resolves.toBeUndefined()
  })

  it('clearDraft：IndexedDB 不可用时静默失败（不抛错）', async () => {
    const { clearDraft } = useFormStorage()
    await expect(clearDraft('test-key')).resolves.toBeUndefined()
  })

  it('checkStorageStatus：无 navigator.storage 时返回 unknown', async () => {
    const { checkStorageStatus } = useFormStorage()
    // happy-dom 无 navigator.storage → estimateStorage 返回 null → unknown
    await expect(checkStorageStatus()).resolves.toBe('unknown')
  })

  it('estimateStorage：无 navigator.storage 时返回 null', async () => {
    const { estimateStorage } = useFormStorage()
    await expect(estimateStorage()).resolves.toBeNull()
  })
})
