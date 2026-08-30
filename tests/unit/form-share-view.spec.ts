// FormShareView 发布填写端 — 挂载级行为锁定
// 背景：P0-① 表单发布闭环新增（分享码 → 发布链接 → 填写 → 提交入库）
import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import FormShareView from '@/components/form-builder/FormShareView.vue'
import { createLocalFormStore, setActiveFormStore } from '@/components/form-builder/designer/store'
import { encodeShareCode } from '@/components/form-builder/designer/share'
import { collectStorageKey, type FormDesign } from '@/components/form-builder/designer/types'

const design: FormDesign = {
  schemaVersion: 3,
  meta: { title: '发布测试表单', description: '通过分享码发布', submitMode: 'multiple' },
  nodes: [
    { id: 'n1', type: 'text', label: '姓名', key: 'name', required: true },
    { id: 'n2', type: 'number', label: '年龄', key: 'age' },
  ],
}
const code = encodeShareCode(design)

function mountView(props: Record<string, unknown> = {}) {
  return mount(FormShareView, {
    props: { code, ...props },
    global: {
      stubs: { teleport: true },
      // FormShareView 内嵌 FormBuilder 真实渲染
    },
    attachTo: document.body,
  })
}

describe('FormShareView · 解析与渲染', () => {
  beforeEach(() => {
    localStorage.clear()
    setActiveFormStore(createLocalFormStore())
  })

  it('有效分享码渲染可填写表单（标题/描述/字段）', async () => {
    const w = mountView()
    await nextTick()
    await flushPromises()
    expect(w.find('.fsv-form').exists()).toBe(true)
    expect(w.find('.fsv-title').text()).toContain('发布测试表单')
    expect(w.find('.fsv-desc').text()).toContain('通过分享码发布')
    // FormBuilder 渲染出输入框
    expect(w.find('.fb-form').exists()).toBe(true)
    w.unmount()
  })

  it('无效分享码显示错误态（不渲染表单）', async () => {
    const w = mount(FormShareView, {
      props: { code: 'FD1.invalid!!' },
      global: { stubs: { teleport: true } },
      attachTo: document.body,
    })
    await nextTick()
    expect(w.find('.fsv-state').exists()).toBe(true)
    expect(w.find('.fb-form').exists()).toBe(false)
    w.unmount()
  })

  it('直接传 design 对象优先于 code', async () => {
    const w = mount(FormShareView, {
      props: { code: 'FD1.invalid!!', design },
      global: { stubs: { teleport: true } },
      attachTo: document.body,
    })
    await nextTick()
    expect(w.find('.fsv-form').exists()).toBe(true)
    w.unmount()
  })
})

describe('FormShareView · 提交入库', () => {
  beforeEach(() => {
    localStorage.clear()
    setActiveFormStore(createLocalFormStore())
  })

  it('提交成功：记录写入活动 store 且 emit submitted', async () => {
    const w = mountView()
    await nextTick()
    await flushPromises()
    // 直接触发 FormBuilder 的 submit（填一个必填字段）
    const input = w.find('.fb-form input')
    await input.setValue('张三')
    // 触发提交
    const fb = w.findComponent({ name: 'FormBuilder' })
    ;(fb.vm as unknown as { handleSubmit: () => void }).handleSubmit?.()
    await flushPromises()

    expect(w.emitted('submitted')).toBeTruthy()
    const record = w.emitted('submitted')![0][0] as { data: Record<string, unknown> }
    expect(record.data.name).toBe('张三')
    // 记录已写入活动 store（与 FormCollect 同 key 算法可读回）
    const store = createLocalFormStore()
    const records = await store.loadRecords(collectStorageKey(design.nodes!))
    expect(records.some((r) => r.data.name === '张三')).toBe(true)
    w.unmount()
  })
})
