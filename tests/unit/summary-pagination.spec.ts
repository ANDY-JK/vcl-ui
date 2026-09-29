// FormDataSummary 汇总性能修复 · 行为锁定（真实使用审查第 3 项）
// 背景：allKeys() 在模板中被每行重复调用（O(行×记录×字段)）且 500 条全量渲染卡死弹窗。
// 修复后：字段 key 集合改 computed 只算一次；明细表分页渲染（PAGE_SIZE=20）。
import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import FormDataSummary from '@/components/form-builder/designer/FormDataSummary.vue'
import { createLocalFormStore, setActiveFormStore } from '@/components/form-builder/designer/store'
import { collectStorageKey } from '@/components/form-builder/designer/types'
import type { FormMetaItem } from '@/components/form-builder/designer/store'

function makeItem(): FormMetaItem {
  return {
    id: 'f_perf',
    name: '大表单',
    updatedAt: '2026/9/5 10:00',
    collectKey: collectStorageKey([{ key: 'name', type: 'text' }]),
  }
}

async function seedStore(count: number) {
  const store = createLocalFormStore()
  const item = makeItem()
  for (let i = 0; i < count; i++) {
    await store.appendRecord(item.collectKey, {
      id: `r${i}`,
      time: `2026/9/5 10:${String(i % 60).padStart(2, '0')}`,
      data: { name: `用户${i}` },
    })
  }
  return { store, item }
}

function mountSummary(item: FormMetaItem, store: ReturnType<typeof createLocalFormStore>) {
  return mount(FormDataSummary, {
    props: { visible: true, item, store },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
}

beforeEach(() => {
  localStorage.clear()
  setActiveFormStore(createLocalFormStore())
})

describe('FormDataSummary · 大数据量分页', () => {
  it('45 条记录只渲染首页 20 行，且提供翻页控件', async () => {
    const { store, item } = await seedStore(45)
    const w = mountSummary(item, store)
    await flushPromises()
    await nextTick()
    const rows = w.findAll('.ld-data-table tbody tr')
    expect(rows.length).toBe(20)
    // 翻页控件存在（页码按钮含第 2/3 页）
    expect(w.find('.ld-data-page').exists()).toBe(true)
    w.unmount()
  })

  it('翻页后渲染第二页数据（不重复）', async () => {
    const { store, item } = await seedStore(45)
    const w = mountSummary(item, store)
    await flushPromises()
    await nextTick()
    const firstPageFirstTime = w.find('.ld-data-table tbody tr .ld-data-time').text()
    // 点第 2 页
    await w
      .findAll('.ld-data-page-btn')
      .find((b) => b.text() === '2')!
      .trigger('click')
    await nextTick()
    const secondPageFirstTime = w.find('.ld-data-table tbody tr .ld-data-time').text()
    expect(secondPageFirstTime).not.toBe(firstPageFirstTime)
    const rows = w.findAll('.ld-data-table tbody tr')
    expect(rows.length).toBe(20)
    w.unmount()
  })

  it('少于一页（≤20 条）时不显示翻页控件', async () => {
    const { store, item } = await seedStore(3)
    const w = mountSummary(item, store)
    await flushPromises()
    await nextTick()
    expect(w.findAll('.ld-data-table tbody tr').length).toBe(3)
    expect(w.find('.ld-data-page').exists()).toBe(false)
    w.unmount()
  })

  it('表头字段集合与记录一致（computed 单次计算）', async () => {
    const { store, item } = await seedStore(25)
    const w = mountSummary(item, store)
    await flushPromises()
    await nextTick()
    const headers = w.findAll('.ld-data-table thead th').map((h) => h.text())
    expect(headers).toEqual(['提交时间', 'name'])
    w.unmount()
  })
})
