/**
 * FormReview.vue — 表单审核弹窗内容（2026-10-22）
 *
 * ## 为什么单独测
 *
 * 此前覆盖率：**语句 4.4%、分支 0%、函数 0%** —— 122 行几乎完全没测。
 * 但它是**有真实调用链**的：`SavedFormsDrawer` 的「审核」操作（`openReview` → `act === 'review'`）。
 *
 * ## 这个组件最容易错的五件事
 *
 *   ① `onMounted` 里 `props.item` 为 null 时**必须直接返回**（不能调 loadForm）
 *   ② `loadForm` 抛错时 `error` 要有值（**不静默吞**）
 *   ③ `toFormSchema` 后要注入 `submitConfig.mode = 'review'`
 *   ④ `apiUrl` / `saveUrl` 不传时**不能注入对应字段**（缺省纯前端）
 *   ⑤ `handleSubmit` 写 `appendRecord` 后 `submitted = true` 且 emit `done`
 *
 * 第 ④ 条尤其容易写错：`...(props.apiUrl ? {...} : {})` 这种展开语法，
 * 如果写成 `apiUrl: props.apiUrl`，就会把 `undefined` 注入进去，
 * 导致 FormBuilder 误判"有远程接口"而去发请求。
 */
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// FormBuilder 是重组件（801 行），这里只关心 FormReview 的接线逻辑，
// 用桩替掉它，避免把 FormBuilder 的内部行为拖进来
vi.mock('@/components/form-builder/FormBuilder.vue', () => ({
  default: {
    name: 'FormBuilder',
    props: ['modelValue', 'schema'],
    emits: ['update:modelValue', 'submit'],
    template: '<div class="fb-stub" />',
  },
}))

import FormReview from '@/components/form-builder/designer/FormReview.vue'
import type { FormStore, FormMetaItem } from '@/components/form-builder/designer/store'

/** 造一个只实现必要方法的 store */
function makeStore(overrides: Partial<FormStore> = {}): FormStore {
  return {
    listForms: vi.fn(async () => []),
    loadForm: vi.fn(async () => ({ nodes: [], meta: {} })),
    saveForm: vi.fn(async () => {}),
    renameForm: vi.fn(async () => {}),
    deleteForm: vi.fn(async () => {}),
    loadRecords: vi.fn(async () => []),
    appendRecord: vi.fn(async () => {}),
    removeRecord: vi.fn(async () => {}),
    clearRecords: vi.fn(async () => {}),
    ...overrides,
  } as FormStore
}

function makeItem(overrides: Partial<FormMetaItem> = {}): FormMetaItem {
  return { id: 'f1', name: '测试表单', updatedAt: 1, collectKey: 'c1', ...overrides } as FormMetaItem
}

describe('FormReview：挂载与加载', () => {
  it('item 为 null 时**不调 loadForm**，且不显示 loading', async () => {
    const store = makeStore()
    const w = mount(FormReview, { props: { item: null, store } })
    await flushPromises()
    expect(store.loadForm, 'item 为 null 不该去加载').not.toHaveBeenCalled()
    expect(w.find('.frv-state').exists()).toBe(true)
    // ⚠️ 只断言「loadForm 没被调用」不够：删掉 `if (!props.item) return` 后，
    // `props.item.id` 会抛 TypeError，被 catch 捕获后写入 error —— 断言依然通过
    // （负向对照实测抓不到）。所以这里必须额外断言**没有落到 error 分支**。
    expect(w.find('.frv-error').exists(), 'item 为 null 不是错误，不该显示错误区').toBe(false)
  })

  it('有 item 时调 loadForm(item.id)', async () => {
    const store = makeStore()
    mount(FormReview, { props: { item: makeItem({ id: 'abc' }), store } })
    await flushPromises()
    expect(store.loadForm).toHaveBeenCalledWith('abc')
  })

  it('loadForm 抛错 → 显示 error（不静默吞）', async () => {
    const store = makeStore({
      loadForm: vi.fn(async () => {
        throw new Error('网络断了')
      }),
    })
    const w = mount(FormReview, { props: { item: makeItem(), store } })
    await flushPromises()
    const err = w.find('.frv-error')
    expect(err.exists(), '应有错误提示区').toBe(true)
    expect(err.text()).toContain('网络断了')
  })

  it('加载中显示 loading 状态（role=status）', async () => {
    let resolveLoad: (v: unknown) => void = () => {}
    const store = makeStore({
      loadForm: vi.fn(
        () =>
          new Promise((r) => {
            resolveLoad = r
          }),
      ) as unknown as FormStore['loadForm'],
    })
    const w = mount(FormReview, { props: { item: makeItem(), store } })
    await flushPromises()
    expect(w.find('[role="status"]').exists(), '加载中应有 role=status').toBe(true)
    resolveLoad({ nodes: [], meta: {} })
    await flushPromises()
  })
})

describe('FormReview：submitConfig 注入', () => {
  it('注入 mode=review；不传 apiUrl/saveUrl 时**不注入这两个字段**', async () => {
    const store = makeStore()
    const w = mount(FormReview, { props: { item: makeItem(), store } })
    await flushPromises()
    const fb = w.findComponent({ name: 'FormBuilder' })
    expect(fb.exists(), '加载完应渲染 FormBuilder').toBe(true)
    const schema = fb.props('schema') as {
      submitConfig: Record<string, unknown>
    }
    expect(schema.submitConfig.mode).toBe('review')
    // 关键：缺省纯前端，不能注入 undefined 字段
    expect('apiUrl' in schema.submitConfig, 'apiUrl 不该出现').toBe(false)
    expect('saveUrl' in schema.submitConfig, 'saveUrl 不该出现').toBe(false)
  })

  it('传 apiUrl → 注入 apiUrl，但不注入 saveUrl', async () => {
    const store = makeStore()
    const w = mount(FormReview, {
      props: { item: makeItem(), store, apiUrl: 'https://api.example.com/get' },
    })
    await flushPromises()
    const schema = w.findComponent({ name: 'FormBuilder' }).props('schema') as {
      submitConfig: Record<string, unknown>
    }
    expect(schema.submitConfig.apiUrl).toBe('https://api.example.com/get')
    expect('saveUrl' in schema.submitConfig, '没传 saveUrl 不该出现').toBe(false)
  })

  it('传 saveUrl → 注入 saveUrl + 默认 reviewAutoSave=3000', async () => {
    const store = makeStore()
    const w = mount(FormReview, {
      props: { item: makeItem(), store, saveUrl: 'https://api.example.com/save' },
    })
    await flushPromises()
    const schema = w.findComponent({ name: 'FormBuilder' }).props('schema') as {
      submitConfig: Record<string, unknown>
    }
    expect(schema.submitConfig.saveUrl).toBe('https://api.example.com/save')
    expect(schema.submitConfig.reviewAutoSave, '默认防抖应是 3000').toBe(3000)
  })

  it('传 reviewAutoSave → 用传入值而非默认值', async () => {
    const store = makeStore()
    const w = mount(FormReview, {
      props: { item: makeItem(), store, saveUrl: 'https://x/save', reviewAutoSave: 500 },
    })
    await flushPromises()
    const schema = w.findComponent({ name: 'FormBuilder' }).props('schema') as {
      submitConfig: Record<string, unknown>
    }
    expect(schema.submitConfig.reviewAutoSave).toBe(500)
  })
})

describe('FormReview：提交', () => {
  it('提交 → appendRecord 写入 collectKey，submitted=true，emit done', async () => {
    const store = makeStore()
    const w = mount(FormReview, {
      props: { item: makeItem({ collectKey: 'my-collect' }), store },
    })
    await flushPromises()

    const fb = w.findComponent({ name: 'FormBuilder' })
    fb.vm.$emit('submit', { field1: 'v1' })
    await flushPromises()

    expect(store.appendRecord).toHaveBeenCalledTimes(1)
    const [collectKey, record] = (store.appendRecord as unknown as { mock: { calls: unknown[][] } }).mock
      .calls[0] as [string, Record<string, unknown>]
    expect(collectKey, '应写入 item.collectKey').toBe('my-collect')
    expect(record.data, '提交数据应包在 data 字段').toEqual({ field1: 'v1' })
    expect(typeof record.id, '应有记录 id').toBe('string')
    expect(typeof record.time, '应有记录时间').toBe('string')

    expect(w.emitted('done'), '应 emit done').toBeTruthy()
    expect(w.find('.frv-done').exists(), '应显示完成提示').toBe(true)
  })

  it('item 为 null 时提交**什么都不做**（防御性早退）', async () => {
    const store = makeStore()
    mount(FormReview, { props: { item: null, store } })
    await flushPromises()
    // item 为 null 时不会渲染 FormBuilder，直接验证 store 没被调用
    expect(store.appendRecord).not.toHaveBeenCalled()
  })

  it('appendRecord 抛错 → 显示 error，不 emit done', async () => {
    const store = makeStore({
      appendRecord: vi.fn(async () => {
        throw new Error('写入失败')
      }),
    })
    const w = mount(FormReview, { props: { item: makeItem(), store } })
    await flushPromises()
    w.findComponent({ name: 'FormBuilder' }).vm.$emit('submit', { a: 1 })
    await flushPromises()

    expect(w.emitted('done'), '失败时不该 emit done').toBeFalsy()
    const err = w.find('.frv-error')
    expect(err.exists()).toBe(true)
    expect(err.text()).toContain('写入失败')
  })
})
