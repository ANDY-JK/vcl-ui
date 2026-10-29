/**
 * `useFormStorage` · 草稿校验 / 容量报告 / 配额阈值（第 167 轮）
 *
 * 覆盖率实测该文件**分支仅 46.7%**（全库最差）。原先唯一覆盖它的是 `form-storage.spec.ts`，
 * 但那个文件只在"happy-dom 无 IndexedDB"这一条降级路径上跑——也就是说：
 *   - `loadDraft` 拿到**真实数据**后怎么判有效/无效、无效时会不会清库，**从未被执行**；
 *   - `saveDraft` 的"超容量跳过"与"写入失败"两条分支**从未被执行**；
 *   - `estimateStorage`/`checkStorageStatus` 的**配额阈值分支从未被执行**。
 *
 * 这里桩掉 IndexedDB 层与 `navigator.storage`，把这些分支逐条点亮。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useFormStorage } from '@/components/form-builder/useFormStorage'
import { DRAFT_MAX_SIZE } from '@/components/form-builder/draft-policy'
import { dbGet, dbPut, dbDelete } from '@/components/storage/indexedDB'

vi.mock('@/components/storage/indexedDB', () => ({
  dbGet: vi.fn(),
  dbPut: vi.fn(),
  dbDelete: vi.fn(),
}))

const mockGet = dbGet as unknown as ReturnType<typeof vi.fn>
const mockPut = dbPut as unknown as ReturnType<typeof vi.fn>
const mockDelete = dbDelete as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  mockPut.mockResolvedValue(undefined)
  mockDelete.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
  // 清掉可能被各用例设置的 navigator.storage
  Reflect.deleteProperty(navigator, 'storage')
})

/** 造一个 navigator.storage.estimate 桩 */
function stubEstimate(fn: () => Promise<{ usage?: number; quota?: number }>) {
  Object.defineProperty(navigator, 'storage', {
    configurable: true,
    value: { estimate: fn },
  })
}

describe('useFormStorage · loadDraft 的有效性校验', () => {
  it('存的是合法对象 → 原样返回，且**不清库**', async () => {
    const draft = { name: '张三', age: 30 }
    mockGet.mockResolvedValue(draft)
    const { loadDraft } = useFormStorage()
    await expect(loadDraft('k')).resolves.toEqual(draft)
    expect(mockDelete, '合法草稿不该被清掉').not.toHaveBeenCalled()
  })

  it('存的是数组 → 视为无效，**自动清库**并返回 null', async () => {
    mockGet.mockResolvedValue([1, 2, 3])
    const { loadDraft } = useFormStorage()
    await expect(loadDraft('k')).resolves.toBeNull()
    expect(mockDelete, '无效草稿必须清掉，否则每次打开都再报一次').toHaveBeenCalledWith('form-drafts', 'k')
  })

  it('存的是字符串 / 数字 / 布尔 → 视为无效并清库', async () => {
    const { loadDraft } = useFormStorage()
    for (const bad of ['not-an-object', 42, true]) {
      vi.clearAllMocks()
      mockGet.mockResolvedValue(bad)
      await expect(loadDraft('k'), `坏数据 ${JSON.stringify(bad)} 应返回 null`).resolves.toBeNull()
      expect(mockDelete, `${JSON.stringify(bad)} 应触发清库`).toHaveBeenCalled()
    }
  })

  it('读不到（null）→ 返回 null，**不触发清库**（空就是空，不是坏）', async () => {
    mockGet.mockResolvedValue(null)
    const { loadDraft } = useFormStorage()
    await expect(loadDraft('k')).resolves.toBeNull()
    expect(mockDelete, '没有草稿不等于草稿损坏，不该删').not.toHaveBeenCalled()
  })

  it('读库抛错 → 清掉损坏草稿并返回 null（不把异常抛给宿主）', async () => {
    mockGet.mockRejectedValue(new Error('IDB broken'))
    const { loadDraft } = useFormStorage()
    await expect(loadDraft('k')).resolves.toBeNull()
    expect(mockDelete, '读失败要清掉，否则下次还报错').toHaveBeenCalled()
  })

  it('清库自身也失败时仍然返回 null（不因清理失败而抛错）', async () => {
    mockGet.mockRejectedValue(new Error('boom'))
    mockDelete.mockRejectedValue(new Error('delete failed'))
    const { loadDraft } = useFormStorage()
    await expect(loadDraft('k')).resolves.toBeNull()
  })
})

describe('useFormStorage · saveDraft 的容量保护与失败上报', () => {
  it('正常大小 → ok:true 且回报字节数', async () => {
    const { saveDraft } = useFormStorage()
    const r = await saveDraft('k', { a: 1 })
    expect(r.ok).toBe(true)
    expect(r.ok && r.size).toBeGreaterThan(0)
    expect(mockPut).toHaveBeenCalled()
  })

  it('**超 2MB → 跳过写入并回报 too-large**（用户必须能被告知，不能静默丢）', async () => {
    const { saveDraft } = useFormStorage()
    const huge = { blob: 'x'.repeat(DRAFT_MAX_SIZE + 1024) }
    const r = await saveDraft('k', huge)
    expect(r).toMatchObject({ ok: false, reason: 'too-large' })
    expect(mockPut, '超容量不该再写库').not.toHaveBeenCalled()
    expect(r.ok === false && r.reason === 'too-large' && r.size).toBeGreaterThan(DRAFT_MAX_SIZE)
  })

  it('恰好等于上限 → 允许写入（边界是 > 而非 >=）', async () => {
    const { saveDraft } = useFormStorage()
    // 构造 JSON 后正好 DRAFT_MAX_SIZE 字节
    const filler = 'x'.repeat(DRAFT_MAX_SIZE - Buffer.byteLength('{"blob":""}'))
    const r = await saveDraft('k', { blob: filler })
    expect(r.ok, `size=${r.ok ? r.size : r.size} 恰好等于上限时应允许写入`).toBe(true)
  })

  it('写入抛错 → 回报 ok:false/error（不假装成功）', async () => {
    mockPut.mockRejectedValue(new Error('quota exceeded'))
    const { saveDraft } = useFormStorage()
    await expect(saveDraft('k', { a: 1 })).resolves.toMatchObject({ ok: false, reason: 'error' })
  })

  it('纯化后的数据入库（响应式 Proxy 不能直接进 structuredClone）', async () => {
    const { saveDraft } = useFormStorage()
    const reactive = { nested: { list: [1, 2, 3] } }
    await saveDraft('k', reactive)
    const written = mockPut.mock.calls.at(-1)?.[2]
    expect(written).toEqual({ nested: { list: [1, 2, 3] } })
    expect(written).not.toBe(reactive)
  })
})

describe('useFormStorage · clearDraft', () => {
  it('正常清除', async () => {
    const { clearDraft } = useFormStorage()
    await clearDraft('k')
    expect(mockDelete).toHaveBeenCalledWith('form-drafts', 'k')
  })

  it('删除抛错 → 只 warn，不把异常抛给宿主', async () => {
    mockDelete.mockRejectedValue(new Error('nope'))
    const { clearDraft } = useFormStorage()
    await expect(clearDraft('k')).resolves.toBeUndefined()
  })
})

describe('useFormStorage · estimateStorage', () => {
  it('API 可用 → 返回 usage/quota', async () => {
    stubEstimate(async () => ({ usage: 1024, quota: 4096 }))
    const { estimateStorage } = useFormStorage()
    await expect(estimateStorage()).resolves.toEqual({ usage: 1024, quota: 4096 })
  })

  it('API 缺字段 → 缺失的一方补 0（不返回 undefined）', async () => {
    stubEstimate(async () => ({}))
    const { estimateStorage } = useFormStorage()
    await expect(estimateStorage()).resolves.toEqual({ usage: 0, quota: 0 })
  })

  it('API 抛错 → 返回 null（降级为"未知"）', async () => {
    stubEstimate(async () => {
      throw new Error('not allowed')
    })
    const { estimateStorage } = useFormStorage()
    await expect(estimateStorage()).resolves.toBeNull()
  })
})

describe('useFormStorage · checkStorageStatus 阈值', () => {
  it('无 API → unknown', async () => {
    const { checkStorageStatus } = useFormStorage()
    await expect(checkStorageStatus()).resolves.toBe('unknown')
  })

  it('quota=0 → unknown（不是 ok：除零算不出比例）', async () => {
    stubEstimate(async () => ({ usage: 100, quota: 0 }))
    const { checkStorageStatus } = useFormStorage()
    await expect(checkStorageStatus()).resolves.toBe('unknown')
  })

  it('50% → ok；75% → warning；95% → critical', async () => {
    const { checkStorageStatus } = useFormStorage()
    const cases: [number, string][] = [
      [0.5, 'ok'],
      [0.75, 'warning'],
      [0.95, 'critical'],
    ]
    for (const [ratio, expected] of cases) {
      stubEstimate(async () => ({ usage: ratio * 1000, quota: 1000 }))
      await expect(checkStorageStatus(), `ratio=${ratio}`).resolves.toBe(expected)
    }
  })

  it('阈值边界：恰好 70% → ok，恰好 90% → warning（> 而非 >=）', async () => {
    const { checkStorageStatus } = useFormStorage()
    stubEstimate(async () => ({ usage: 700, quota: 1000 }))
    await expect(checkStorageStatus()).resolves.toBe('ok')
    stubEstimate(async () => ({ usage: 900, quota: 1000 }))
    await expect(checkStorageStatus()).resolves.toBe('warning')
  })

  it('用量超过配额（ratio>1）→ critical', async () => {
    stubEstimate(async () => ({ usage: 2000, quota: 1000 }))
    const { checkStorageStatus } = useFormStorage()
    await expect(checkStorageStatus()).resolves.toBe('critical')
  })

  it('**API 返回非有限值（NaN）→ 必须是 unknown，不能报 ok**', async () => {
    stubEstimate(async () => ({ usage: Number.NaN, quota: Number.NaN }))
    const { checkStorageStatus } = useFormStorage()
    await expect(
      checkStorageStatus(),
      '算不出比例却报 ok —— 与"容量充足"的假绿同类（unknown 才是诚实的回答）',
    ).resolves.toBe('unknown')
  })

  it('quota 为负（垃圾值）→ 也应是 unknown', async () => {
    stubEstimate(async () => ({ usage: 10, quota: -5 }))
    const { checkStorageStatus } = useFormStorage()
    await expect(checkStorageStatus()).resolves.toBe('unknown')
  })
})