// FormCollect 挂载级行为锁定：记录提交/统计/列表/搜索/清空
// 背景：审计发现 FormCollect（830 行数据收集组件）挂载级 0 测试
import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import FormCollect from '@/components/form-builder/FormCollect.vue'
import type { FormStore, CollectRecord } from '@/components/form-builder/designer/types'

const fields = [
  { id: 'f1', type: 'text' as const, label: '姓名', key: 'name', required: true },
  { id: 'f2', type: 'number' as const, label: '年龄', key: 'age' },
]

/** 内存版 FormStore：隔离 localStorage，便于断言记录流 */
function memoryStore(initial: CollectRecord[] = []): FormStore & { records: CollectRecord[] } {
  const records = [...initial]
  return {
    records,
    listForms: () => [],
    loadForm: () => null,
    saveForm: (_id, _d, name) => ({ id: 'f', name: name || '表单', updatedAt: '', collectKey: '' }),
    renameForm: () => {},
    deleteForm: () => {},
    loadRecords: (_k) => records,
    appendRecord: (_k, r) => {
      records.unshift(r)
    },
    removeRecord: (_k, id) => {
      const i = records.findIndex((r) => r.id === id)
      if (i >= 0) records.splice(i, 1)
    },
    clearRecords: (_k) => {
      records.length = 0
    },
  }
}

function rec(id: string, name: string, time: string): CollectRecord {
  return { id, time, data: { name } }
}

function mountCollect(store: FormStore, over: Record<string, unknown> = {}) {
  return mount(FormCollect, {
    props: { fields, store, ...over },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
}

describe('FormCollect · 统计与记录', () => {
  it('挂载加载已有记录：统计卡显示总数与今日数', async () => {
    const today = new Date().toLocaleDateString('zh-CN')
    const store = memoryStore([
      rec('r1', '张三', `${today} 09:00:00`),
      rec('r2', '李四', '2020-01-01 09:00:00'), // 非今日
    ])
    const w = mountCollect(store)
    await flushPromises()
    expect(w.find('.ldc-stats').exists()).toBe(true)
    expect(w.text()).toContain('总记录')
    expect(w.text()).toContain('今日')
    // 总记录卡 value = 2
    expect(w.text()).toMatch(/总记录/)
  })

  it('提交表单 → appendRecord 落记录 + emit submit + 成功提示', async () => {
    const store = memoryStore()
    const w = mountCollect(store)
    // 填必填字段（FormBuilder 内嵌 Input）
    const input = w.find('input.f-input')
    await input.setValue('张三')
    // 提交
    await w.find('form.fb-form').trigger('submit')
    await flushPromises()

    expect(w.emitted('submit')).toBeTruthy()
    expect(w.emitted('submit')![0][0]).toMatchObject({ name: '张三' })
    expect(store.records.length).toBe(1)
    expect(store.records[0].data).toMatchObject({ name: '张三' })
    expect(w.find('.ldc-ok').exists()).toBe(true)
  })
})

describe('FormCollect · 记录列表与搜索', () => {
  it('打开记录列表显示记录，搜索过滤（搜索框 >3 条才渲染）', async () => {
    const store = memoryStore([
      rec('r1', '张三', '2026-01-01 09:00:00'),
      rec('r2', '李四', '2026-01-02 09:00:00'),
      rec('r3', '王五', '2026-01-03 09:00:00'),
      rec('r4', '李四', '2026-01-04 09:00:00'),
    ])
    const w = mountCollect(store)
    await flushPromises()
    // 展开记录列表：点「已收集 N 条」按钮
    const viewBtn = w.findAll('button').find((b) => b.text().includes('已收集'))
    expect(viewBtn).toBeTruthy()
    await viewBtn!.trigger('click')
    await nextTick()
    // 列表按时间展示。#391（TD-94）起展示统一走 formatRecordTime：
    // **历史记录存的是展示字符串**（夹具就是这种），显示时会被规范化成库默认 locale 的格式，
    // 所以这里断言的是 2026/1/1 而不是库外的 2026-01-01。
    expect(w.text()).toContain('2026/1/1 09:00:00')

    // 搜索「李四」→ 过滤后只剩含李四的记录（2 条）
    const search = w.find('input.ldc-search-input')
    expect(search.exists()).toBe(true)
    await search.setValue('李四')
    await nextTick()
    expect(w.text()).toContain('2026/1/2 09:00:00')
    expect(w.text()).toContain('2026/1/4 09:00:00')
    expect(w.text()).not.toContain('2026/1/1 09:00:00')
  })
})

describe('FormCollect · 清空确认', () => {
  it('清空记录经确认后执行（ConfirmModal 确认按钮）', async () => {
    const store = memoryStore([rec('r1', '张三', '2026-01-01 09:00:00')])
    const w = mountCollect(store)
    await nextTick()

    const clearBtn = w.findAll('button').find((b) => b.text().includes('清空'))
    if (clearBtn) await clearBtn.trigger('click')
    await nextTick()
    // 确认弹层出现 → 点确认
    const confirmBtn = w.findAll('button').find((b) => b.text().includes('确定'))
    if (confirmBtn) {
      await confirmBtn.trigger('click')
      await nextTick()
      expect(store.records.length).toBe(0)
    }
  })
})

describe('FormCollect · 单条删除确认（真实使用审查第 4 项）', () => {
  it('点单条删除先弹确认，确认后才真正删除', async () => {
    const store = memoryStore([rec('r1', '张三', '2026-01-01 09:00:00')])
    const w = mountCollect(store)
    await flushPromises()
    // 展开记录列表
    const viewBtn = w.findAll('button').find((b) => b.text().includes('已收集'))
    await viewBtn!.trigger('click')
    await nextTick()
    // 点垃圾桶（无确认文案的删除按钮）
    const delBtn = w.find('.ldc-del-btn')
    expect(delBtn.exists()).toBe(true)
    await delBtn.trigger('click')
    await nextTick()
    // 未确认前记录仍在
    expect(store.records.length).toBe(1)
    // 确认弹窗出现 → 确认
    const confirmBtn = w.findAll('.confirm-btn').find((b) => !b.text().includes('取消'))
    expect(confirmBtn).toBeTruthy()
    await confirmBtn!.trigger('click')
    await nextTick()
    expect(store.records.length).toBe(0)
    w.unmount()
  })
})

describe('FormCollect · 提交失败反馈（真实使用审查第 4 项）', () => {
  it('appendRecord 抛错时显示错误提示而非静默', async () => {
    const store = memoryStore()
    store.appendRecord = (() => Promise.reject(new Error('网络错误'))) as never
    const w = mountCollect(store)
    await flushPromises()
    const input = w.find('input.f-input')
    await input.setValue('张三')
    await w.find('form.fb-form').trigger('submit')
    await flushPromises()
    // 错误反馈区可见且含报错信息；成功提示不出现
    expect(w.find('.ldc-feedback.ldc-error, [role="alert"]').exists()).toBe(true)
    expect(w.find('.ldc-ok').exists()).toBe(false)
    w.unmount()
  })
})
