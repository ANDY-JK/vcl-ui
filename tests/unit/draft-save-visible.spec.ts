/**
 * 草稿"没存下来"必须让**用户**看见（第 159 轮，接线层）
 *
 * 结果契约见 draft-save-result.spec.ts；这里只测两个宿主怎么把结果变成可见提示：
 *   - `FormBuilder` → Toast（`formBuilder.draftTooLarge` / `draftSaveFailed`）
 *   - 设计器 `useDesignerAutosave` → `showTip`（`fbd.draftTooLarge` / `draftSaveFailed`）
 *
 * 两条硬要求：
 *   ① 失败必须说清**为什么**（超容量要说体积）与**该怎么办**（"不影响提交/继续编辑"）；
 *   ② 防抖周期内反复失败**只提示一次**（成功后再复位）——否则改一个字弹一条，等于没有提示。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, ref } from 'vue'

// 本文件会故意触发"草稿过大 / 保存失败"路径：这些告警是**用例制造的**，不该进噪音棘轮基线
// （棘轮只该记产品产生的告警）。模块级屏蔽比 spy console.warn 更精确，也不会漏 console.error。
vi.mock('@/components/_internal/runtime-observer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/_internal/runtime-observer')>()
  return { ...actual, reportWarn: () => {}, reportError: () => {}, reportEvent: () => {} }
})

// FormBuilder 侧：桩掉存取，专注"结果 → 提示"
const fs = vi.hoisted(() => ({
  load: vi.fn(async () => null),
  save: vi.fn(async () => ({ ok: true, size: 0 }) as { ok: boolean; size: number; reason?: string }),
  clear: vi.fn(async () => {}),
}))
vi.mock('@/components/form-builder/useFormStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/form-builder/useFormStorage')>()
  return {
    ...actual,
    useFormStorage: () => ({ loadDraft: fs.load, saveDraft: fs.save, clearDraft: fs.clear }),
  }
})

// 设计器侧：真实 useDesignerDraft + 真实 useDesignerAutosave，只桩"存哪儿"
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

const { default: FormBuilder } = await import('@/components/form-builder/FormBuilder.vue')
const { useDesignerAutosave } = await import('@/components/form-builder/designer/useDesignerAutosave')
const { createField } = await import('@/components/form-builder/designer/types')
const { DRAFT_MAX_SIZE } = await import('@/components/form-builder/draft-policy')

/** 最小 schema：一个文本字段（照 form-builder.spec.ts 的用法） */
function simpleSchema() {
  return { fields: [{ key: 'name', type: 'text' as const, label: '姓名' }] }
}

function mountBuilder() {
  return mount(FormBuilder, {
    props: { schema: simpleSchema(), modelValue: {}, storageKey: 'draft-key-159' },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
}

/**
 * 等过一个防抖窗口。
 *
 * 这里是**故意的定时等待**，不是"等 N 拍碰运气"：被测对象就是「1s/800ms 防抖」这个时间行为，
 * 没有更早的可观察信号（落盘发生在防抖到期那一刻）。
 * 试过 `vi.waitFor` 轮询条件：每次轮询都会重渲染 FormBuilder（schema 解析 + 全字段渲染），
 * 实测总耗时从 14s 涨到 32s —— 轮询比等待本身更贵，所以用固定等待。
 */
async function waitDebounce(ms = 1150) {
  await new Promise((r) => setTimeout(r, ms))
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  fs.save.mockResolvedValue({ ok: true, size: 0 })
  dd.save.mockResolvedValue(undefined)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('FormBuilder · 草稿保存失败的用户提示', () => {
  it('超容量 → toast 说明"已暂停保存"并给出体积；再改一次不重复弹', async () => {
    fs.save.mockResolvedValue({ ok: false, reason: 'too-large', size: 3 * 1024 * 1024 })
    const w = mountBuilder()
    await flushPromises()

    await w.find('input.f-input').setValue('第一次')
    await waitDebounce()

    expect(fs.save, '前置：自动保存确实被调用').toHaveBeenCalled()
    expect(w.text(), '必须告诉用户自动草稿没在存').toContain('自动草稿已暂停保存')
    expect(w.text(), '要说出体积，用户才知道是内容太大').toContain('3.0MB')

    const count = () => (w.text().match(/自动草稿已暂停保存/g) ?? []).length
    const before = count()
    await w.find('input.f-input').setValue('第二次')
    await waitDebounce()
    expect(count(), '连续失败只提示一次，否则等于没提示').toBe(before)
    w.unmount()
  })

  it('写入失败 → 提示"草稿自动保存失败"，并点明不影响提交', async () => {
    fs.save.mockResolvedValue({ ok: false, reason: 'error' })
    const w = mountBuilder()
    await flushPromises()
    await w.find('input.f-input').setValue('x')
    await waitDebounce()

    expect(w.text()).toContain('草稿自动保存失败')
    expect(w.text(), '不能让用户以为整页坏了').toContain('不影响提交')
    w.unmount()
  })

  it('保存成功 → 不出现任何失败提示（不能假报警）', async () => {
    const w = mountBuilder()
    await flushPromises()
    await w.find('input.f-input').setValue('ok')
    await waitDebounce()

    expect(fs.save).toHaveBeenCalled()
    expect(w.text()).not.toContain('自动草稿已暂停保存')
    expect(w.text()).not.toContain('草稿自动保存失败')
    w.unmount()
  })

  it('先失败后成功 → 复位；之后再次失败仍会重新提示（不是一次性的哑巴）', async () => {
    fs.save.mockResolvedValueOnce({ ok: false, reason: 'too-large', size: 3 * 1024 * 1024 })
    const w = mountBuilder()
    await flushPromises()

    await w.find('input.f-input').setValue('a')
    await waitDebounce()
    expect((w.text().match(/自动草稿已暂停保存/g) ?? []).length).toBe(1)

    // 成功一次 → 复位
    fs.save.mockResolvedValue({ ok: true, size: 10 })
    await w.find('input.f-input').setValue('b')
    await waitDebounce()

    // 再失败 → 必须重新提示
    // ⚠️ 先等上一条提示自己消失（#314 之后相同文案会去重合并）：否则"重新提示"会
    //    并进仍在屏上的那条，DOM 里只有一个节点，断言看不出复位是否生效。
    await new Promise((r) => setTimeout(r, 3200))
    await flushPromises()
    fs.save.mockResolvedValue({ ok: false, reason: 'too-large', size: 3 * 1024 * 1024 })
    await w.find('input.f-input').setValue('c')
    await waitDebounce()
    expect(
      (w.text().match(/自动草稿已暂停保存/g) ?? []).length,
      '成功后必须复位：否则用户第二次遇到同样问题就再也收不到提示',
    ).toBe(1)
    w.unmount()
  })
})

describe('useDesignerAutosave · 设计器侧同款交代', () => {
  function mountAutosave(opts: { nodes: () => unknown[]; meta: () => unknown; tips: string[] }) {
    return mount(
      {
        template: '<div />',
        setup() {
          useDesignerAutosave({
            getNodes: () => opts.nodes() as never,
            getMeta: () => opts.meta() as never,
            hasInitialNodes: () => true,
            applyDraft: () => {},
            showTip: (m: string) => opts.tips.push(m),
          })
          return {}
        },
      },
      { attachTo: document.body },
    )
  }

  /** 节点的持有者必须是**响应式**的（生产里是 props/ref）——普通 let 变量 watcher 不会触发 */
  function nodeHolder(initial: unknown[]) {
    const nodes = ref<unknown[]>(initial)
    const meta = ref<Record<string, unknown>>({ title: 't' })
    return { nodes, meta }
  }

  it('超容量 → showTip 带体积且只提示一次', async () => {
    const tips: string[] = []
    const { nodes, meta } = nodeHolder([createField('text', 1)])
    meta.value = { title: 'x', big: 'A'.repeat(DRAFT_MAX_SIZE + 1024) }
    const w = mountAutosave({ nodes: () => nodes.value, meta: () => meta.value, tips })

    nodes.value = [createField('text', 2)]
    await nextTick()
    // 超容量分支**不会**调用 storage.save（跳过落盘），所以等的是提示本身
    await waitDebounce(900)

    expect(tips.some((t) => t.includes('自动草稿已暂停保存')), '设计器也要给可见提示').toBe(true)
    expect(tips.some((t) => t.includes('MB')), '带上体积').toBe(true)

    // 否定断言要给它时间窗：再变一次，等过一个防抖周期后仍只有一条
    const before = tips.length
    nodes.value = [createField('text', 3)]
    await nextTick()
    await new Promise((r) => setTimeout(r, 1000))
    await flushPromises()
    expect(dd.save, '超容量始终不落盘').not.toHaveBeenCalled()
    expect(tips.length, '失败提示只给一次').toBe(before)
    w.unmount()
  })

  it('写入失败 → showTip 说明不影响继续编辑', async () => {
    dd.save.mockRejectedValue(new Error('boom'))
    const tips: string[] = []
    const { nodes, meta } = nodeHolder([createField('text', 1)])
    const w = mountAutosave({ nodes: () => nodes.value, meta: () => meta.value, tips })

    nodes.value = [createField('text', 2)]
    await nextTick()
    await waitDebounce(900)
    await vi.waitFor(() => expect(tips.length).toBeGreaterThan(0), { timeout: 4000 })

    expect(tips.some((t) => t.includes('设计草稿自动保存失败'))).toBe(true)
    expect(tips.some((t) => t.includes('继续编辑'))).toBe(true)
    w.unmount()
  })

  it('正常保存 → 不提示（不能假报警）', async () => {
    const tips: string[] = []
    const { nodes, meta } = nodeHolder([createField('text', 1)])
    const w = mountAutosave({ nodes: () => nodes.value, meta: () => meta.value, tips })

    nodes.value = [createField('text', 2)]
    await nextTick()
    await waitDebounce(900)

    expect(dd.save, '前置：确实尝试落盘').toHaveBeenCalled()
    expect(tips.filter((t) => /自动保存失败|已暂停保存/.test(t)), '成功时不该有失败提示').toEqual([])
    w.unmount()
  })
})