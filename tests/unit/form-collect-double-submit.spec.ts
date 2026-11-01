/**
 * 防重复提交（#312）
 *
 * ## 缺陷
 *
 * FormBuilder 的 `submitting` 守卫靠**3 秒后自动复位**（`_SUBMIT_STUCK_RESET_MS`）——
 * 那是"父组件没处理时别永远 loading"的兜底，**不等于提交真的结束**。
 * 云端存储慢一点（>3s）时，用户在 spinner 复位后再点一次就**写进两条记录**。
 *
 * ## 判据
 *
 * 用"可控的慢 store"：`appendRecord` 返回一个手动控制的 Promise。
 * 第一次提交挂起期间再点一次 → `appendRecord` 仍只被调用 **1 次**；
 * resolve 之后锁必须释放（否则用户改完也提交不了）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { flushPromises } from '@vue/test-utils'
import { ref, nextTick } from 'vue'

vi.mock('qrcode/lib/browser.js', () => ({
  default: { toDataURL: vi.fn(async () => 'data:image/png;base64,FAKEQR') },
}))

import FormCollect from '@/components/form-builder/FormCollect.vue'

const fields = [
  { id: 'n1', key: 'name', type: 'text', label: '姓名' },
] as never[]

/** FormStore 的公共部分（表单 CRUD 对本用例无意义，给空实现） */
function baseStore(records: { id: string; time: string; data: Record<string, unknown> }[]) {
  return {
    listForms: () => [],
    loadForm: () => null,
    saveForm: () => ({ id: 'f', name: '表单', updatedAt: '', collectKey: '' }),
    renameForm: () => {},
    deleteForm: () => {},
    loadRecords: async () => records,
    updateRecord: async () => {},
    deleteRecord: async () => {},
    clearRecords: async () => {},
  }
}

/** 可控 store：appendRecord 挂起，直到测试手动 resolve */
function makeSlowStore() {
  const pending: (() => void)[] = []
  const records = ref<{ id: string; time: string; data: Record<string, unknown> }[]>([])
  const store = {
    ...baseStore(records.value),
    records,
    appendRecord: vi.fn(
      (_key: string, rec: { id: string; time: string; data: Record<string, unknown> }) =>
        new Promise<void>((resolve) => {
          pending.push(() => {
            records.value = [...records.value, rec]
            resolve()
          })
        }),
    ),
  }
  return { store, pending }
}

function mountCollect(store: unknown) {
  return mount(FormCollect, {
    props: { fields, store, meta: { title: '测试表单' } } as never,
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('FormCollect · 防重复提交', () => {
  it('**提交挂起期间再点一次 → 只写一条**', async () => {
    const { store, pending } = makeSlowStore()
    const w = mountCollect(store)
    await flushPromises()
    const vm = w.vm as unknown as { handleSubmit: (d: Record<string, unknown>) => Promise<void> }

    // 第一次提交：挂起
    void vm.handleSubmit({ name: '张三' })
    await nextTick()
    expect(store.appendRecord, '第一次应已调用').toHaveBeenCalledTimes(1)
    expect(pending.length, '应有 1 个挂起的写入').toBe(1)

    // 挂起期间再点两次
    void vm.handleSubmit({ name: '张三' })
    void vm.handleSubmit({ name: '张三' })
    await nextTick()
    expect(store.appendRecord, '锁没生效就会写 2~3 条').toHaveBeenCalledTimes(1)

    // 放开写入
    pending.shift()!()
    await flushPromises()
    expect(store.records.value.length, '最终只应有一条记录').toBe(1)
    w.unmount()
  })

  it('**写入完成后锁释放**（用户改完要能再提交）', async () => {
    const { store, pending } = makeSlowStore()
    const w = mountCollect(store)
    await flushPromises()
    const vm = w.vm as unknown as { handleSubmit: (d: Record<string, unknown>) => Promise<void> }

    void vm.handleSubmit({ name: '第一次' })
    await nextTick()
    pending.shift()!()
    await flushPromises()

    void vm.handleSubmit({ name: '第二次' })
    await nextTick()
    expect(store.appendRecord, '锁未释放则第二次点不动').toHaveBeenCalledTimes(2)
    w.unmount()
  })

  it('**写入失败后锁也释放**（失败后要能改了再提交）', async () => {
    const records = ref([])
    const store = {
      ...baseStore([]),
      records,
      appendRecord: vi.fn(async () => {
        throw new Error('后端 500')
      }),
    }
    const w = mountCollect(store)
    await flushPromises()
    const vm = w.vm as unknown as { handleSubmit: (d: Record<string, unknown>) => Promise<void> }

    await vm.handleSubmit({ name: '失败一次' })
    await nextTick()
    await vm.handleSubmit({ name: '再试一次' })
    await nextTick()
    expect(store.appendRecord, '失败后应允许重试').toHaveBeenCalledTimes(2)
    w.unmount()
  })
})
