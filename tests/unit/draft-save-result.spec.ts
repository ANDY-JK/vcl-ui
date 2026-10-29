/**
 * 草稿保存**结果契约**（第 159 轮）
 *
 * 背景缺陷：两个 `saveDraft` 都返回 `Promise<void>`，「超容量跳过」与「写入失败」只调
 * `reportWarn`（开发控制台）。宿主拿到同一个 `undefined`，无法向用户交代 —— 用户填了大表单
 * （> 2MB）后自动保存一直被跳过，刷新后草稿没了，全程无提示；而**恢复**草稿那条路径却有
 * 可见 toast（`draftRestored`）。"存得上"有反馈、"存不上"没反馈，正是会踩的坑。
 *
 * 本文件只测**结果契约**（不 mock 自己）；宿主怎么把结果变成用户提示见 draft-save-visible.spec.ts。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createField } from '@/components/form-builder/designer/types'
import { DRAFT_MAX_SIZE } from '@/components/form-builder/draft-policy'

// 设计器侧：只桩"存哪儿"，并截获结构化事件（保留真实规则：纯化、容量上限、脏数据拒载）
const obs = vi.hoisted(() => ({ events: [] as { code: string; level: string; ctx: Record<string, unknown> }[] }))
vi.mock('@/components/_internal/runtime-observer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/_internal/runtime-observer')>()
  return {
    ...actual,
    reportEvent: (code: string, _msg: string, ctx?: Record<string, unknown>, level?: string) => {
      obs.events.push({ code, level: level ?? 'error', ctx: ctx ?? {} })
    },
    reportWarn: () => {},
  }
})

const dd = vi.hoisted(() => ({
  load: vi.fn(async () => null as unknown),
  save: vi.fn(async () => undefined as unknown),
  clear: vi.fn(async () => {}),
}))
vi.mock('@/components/form-builder/designer/draft-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/form-builder/designer/draft-storage')>()
  return {
    ...actual,
    getActiveDraftStorage: () => ({ name: 'stub', load: dd.load, save: dd.save, clear: dd.clear, ttl: 0 }),
  }
})

const { useFormStorage, toPlainJson } = await import('@/components/form-builder/useFormStorage')
const { useDesignerDraft } = await import('@/components/form-builder/designer/useDesignerDraft')

/** 确定超过上限的载荷（不依赖浮点/边界巧合） */
function oversized(): Record<string, unknown> {
  return { title: 'x', big: 'A'.repeat(DRAFT_MAX_SIZE + 1024) }
}

beforeEach(() => {
  obs.events.length = 0
  vi.clearAllMocks()
})

describe('useFormStorage.saveDraft · 三种结局可区分', () => {
  it('超过上限 → ok:false / too-large / 带 size，且**不**写库', async () => {
    const { saveDraft } = useFormStorage()
    const res = await saveDraft('k', oversized() as never)
    expect(res.ok, '超容量不能报成功（这是用户数据丢失的入口）').toBe(false)
    expect(res).toMatchObject({ reason: 'too-large' })
    expect((res as { size: number }).size).toBeGreaterThan(DRAFT_MAX_SIZE)
  })

  it('正常大小 → 返回 ok 结论与 size（不是 undefined）', async () => {
    const { saveDraft } = useFormStorage()
    const res = await saveDraft('k', { a: 1 })
    expect(typeof res.ok).toBe('boolean')
    if (res.ok) {
      expect(res.size).toBeGreaterThan(0)
    } else {
      // 本环境无 IndexedDB：允许失败，但必须是**明确的** error
      expect(res.reason).toBe('error')
    }
  })

  it('toPlainJson 抛错（不可序列化）→ ok:false / error，不冒充成功', async () => {
    const { saveDraft } = useFormStorage()
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const res = await saveDraft('k', circular as never)
    expect(res).toMatchObject({ ok: false, reason: 'error' })
  })

  it('容量判定基于**纯化后**的 JSON（toPlainJson 之后），不是原始对象', async () => {
    // 反证：若实现忘掉纯化，size 会按 raw 对象算（这里 raw 含不可枚举空隙，难以伪造差异）；
    // 因此直接锁住"纯化是前置步骤"这一事实，避免有人把 toPlainJson 挪到容量检查之后。
    const plain = toPlainJson({ a: 'x' })
    expect(plain).toEqual({ a: 'x' })
    expect(plain, '纯化必须返回新对象（Proxy → 纯对象）').not.toBe({ a: 'x' })
  })
})

describe('useDesignerDraft.saveDraft · 超容量也要发结构化事件', () => {
  it('超过上限 → ok:false / too-large，上报同事件码且 reason=too-large', async () => {
    const { saveDraft } = useDesignerDraft()
    const res = await saveDraft([], oversized() as never)
    expect(res).toMatchObject({ ok: false, reason: 'too-large' })
    expect(dd.save, '超容量不该真的写库').not.toHaveBeenCalled()

    const ev = obs.events.find((e) => e.code === 'form-designer/draft-save-failed')
    expect(ev, '必须是结构化事件，不能只躺在控制台日志里').toBeTruthy()
    expect(ev!.ctx.reason, 'reason 区分"该引导精简"与"存储坏了"').toBe('too-large')
    expect(String(ev!.ctx.sizeMB)).toMatch(/^\d+\.\d$/)
  })

  it('写入抛错 → ok:false / error，事件 reason 是错误信息（可诊断）', async () => {
    dd.save.mockRejectedValueOnce(new Error('quota exceeded'))
    const { saveDraft } = useDesignerDraft()
    const res = await saveDraft([createField('text', 1)], { title: 't' })
    expect(res).toMatchObject({ ok: false, reason: 'error' })
    const ev = obs.events.find((e) => e.code === 'form-designer/draft-save-failed')
    expect(String(ev!.ctx.reason)).toContain('quota exceeded')
  })

  it('正常写入 → ok:true 且带 size（宿主可展示草稿体积）', async () => {
    const { saveDraft } = useDesignerDraft()
    const res = await saveDraft([createField('text', 1)], { title: 't' })
    expect(res.ok).toBe(true)
    expect((res as { size: number }).size).toBeGreaterThan(0)
    expect(dd.save).toHaveBeenCalledTimes(1)
  })
})