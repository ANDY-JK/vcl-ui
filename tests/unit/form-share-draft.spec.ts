// 发布填写端数据保护 · 行为锁定（真实使用审查第 1 项）
// 背景：FormShareView 此前未接 FormBuilder 草稿能力——填写中途刷新/关闭全部丢失。
// 修复后：传入 storageKey（fd_share_ 前缀）启用防抖落盘 + 恢复 + 提交成功自动清草稿，
//         且有脏数据时 beforeunload 拦截刷新/关闭。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import FormShareView from '@/components/form-builder/FormShareView.vue'
import { createField } from '@/components/form-builder/designer/types'
import type { FormDesign, CollectRecord } from '@/components/form-builder/designer/types'

// 草稿存取桩（FormBuilder 内部 useDesignerDraft… 不对——FormBuilder 走 useFormStorage）
// saveDraft 自第 159 轮起返回 DraftSaveResult，桩须同步（否则接线层读 res.ok 会炸）
const draftStubs = vi.hoisted(() => ({
  load: vi.fn(async () => null),
  save: vi.fn(async () => ({ ok: true, size: 0 })),
  clear: vi.fn(async () => {}),
}))
vi.mock('@/components/form-builder/useFormStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/form-builder/useFormStorage')>()
  return {
    ...actual,
    useFormStorage: () => ({ loadDraft: draftStubs.load, saveDraft: draftStubs.save, clearDraft: draftStubs.clear }),
  }
})

function makeDesign(over: Partial<FormDesign> = {}): FormDesign {
  return {
    schemaVersion: 3,
    meta: { title: '测试表单' },
    nodes: [createField('text', 1)],
    ...over,
  }
}

function memoryStore() {
  return {
    records: [] as CollectRecord[],
    appendRecord: vi.fn(function (this: { records: CollectRecord[] }, _k: string, r: CollectRecord) {
      this.records.unshift(r)
    }),
    loadRecords: vi.fn(() => [] as CollectRecord[]),
  }
}

function mountShare(design = makeDesign(), store?: ReturnType<typeof memoryStore>) {
  return mount(FormShareView, {
    props: { design, ...(store ? { store: store as never } : {}) },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
}

function fireBeforeUnload(): boolean {
  const e = new Event('beforeunload', { cancelable: true }) as Event & { returnValue: unknown }
  window.dispatchEvent(e)
  return e.defaultPrevented
}

beforeEach(() => {
  vi.clearAllMocks()
  draftStubs.load.mockResolvedValue(null)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('FormShareView · 填写草稿', () => {
  it('挂载即以 fd_share_ 前缀 key 恢复草稿（FormBuilder loadDraft 被调）', async () => {
    const w = mountShare()
    await flushPromises()
    expect(draftStubs.load).toHaveBeenCalled()
    const key = draftStubs.load.mock.calls[0]![0] as string
    expect(key.startsWith('fd_share_')).toBe(true)
    w.unmount()
  })

  it('填写数据防抖落盘（saveDraft 收到填写值）', async () => {
    const w = mountShare()
    await flushPromises()
    const input = w.find('input.f-input')
    await input.setValue('正在填的内容')
    await new Promise((r) => setTimeout(r, 1250))
    expect(draftStubs.save).toHaveBeenCalled()
    const [, data] = draftStubs.save.mock.calls.at(-1)!
    expect(data).toMatchObject({ field1: '正在填的内容' })
    w.unmount()
  })

  it('提交成功后清除草稿（clearDraft 被调）+ 显示成功页', async () => {
    const store = memoryStore()
    const w = mountShare(makeDesign(), store)
    await flushPromises()
    await w.find('input.f-input').setValue('答案')
    await w.find('form.fb-form').trigger('submit')
    await flushPromises()
    expect(store.appendRecord).toHaveBeenCalled()
    expect(draftStubs.clear).toHaveBeenCalled()
    expect(w.text()).toContain('提交成功')
    w.unmount()
  })
})

describe('FormShareView · beforeunload 离开拦截', () => {
  it('有脏数据时拦截刷新（defaultPrevented）', async () => {
    const w = mountShare()
    await flushPromises()
    expect(fireBeforeUnload()).toBe(false)
    await w.find('input.f-input').setValue('未提交内容')
    await nextTick()
    expect(fireBeforeUnload()).toBe(true)
    w.unmount()
  })

  it('提交成功后不再拦截', async () => {
    const w = mountShare(makeDesign(), memoryStore())
    await flushPromises()
    await w.find('input.f-input').setValue('答案')
    await w.find('form.fb-form').trigger('submit')
    await flushPromises()
    expect(fireBeforeUnload()).toBe(false)
    w.unmount()
  })
})

describe('FormShareView · 提交防重复（真实使用审查余项 ⑧）', () => {
  it('云端写入缓慢时重复点击不产生第二条提交（越过 3 秒兜底窗口）', async () => {
    let resolveWrite: () => void = () => {}
    const slowStore = memoryStore()
    slowStore.appendRecord = vi.fn(
      () =>
        new Promise<void>((res) => {
          resolveWrite = res
        }),
    ) as never
    const w = mountShare(makeDesign(), slowStore)
    await flushPromises()
    await w.find('input.f-input').setValue('答案')
    await w.find('form.fb-form').trigger('submit')
    await flushPromises()
    expect(slowStore.appendRecord).toHaveBeenCalledTimes(1)
    // 越过 FormBuilder 3 秒兜底复位窗口后再次提交 → 被入口守卫拦截
    await new Promise((r) => setTimeout(r, 3600))
    await w.find('form.fb-form').trigger('submit')
    await flushPromises()
    expect(slowStore.appendRecord).toHaveBeenCalledTimes(1)
    resolveWrite()
    await flushPromises()
    expect(w.text()).toContain('提交成功')
    w.unmount()
  })
})
