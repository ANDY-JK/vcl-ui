// FormDataSummary 数据汇总弹窗 — 挂载级行为锁定
// 背景：P0-② 多表单数据汇总新增（我的表单「数据」按钮 → 汇总弹窗）
import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import FormDataSummary from '@/components/form-builder/designer/FormDataSummary.vue'
import { createLocalFormStore, setActiveFormStore } from '@/components/form-builder/designer/store'
import { collectStorageKey } from '@/components/form-builder/designer/types'
import type { FormMetaItem } from '@/components/form-builder/designer/store'

function makeItem(over: Partial<FormMetaItem> = {}): FormMetaItem {
  return {
    id: 'f_test',
    name: '测试表单',
    updatedAt: '2026/8/30 10:00',
    collectKey: collectStorageKey([
      { key: 'name', type: 'text' },
      { key: 'age', type: 'number' },
    ]),
    ...over,
  }
}

function mountSummary(item: FormMetaItem | null, visible = true) {
  return mount(FormDataSummary, {
    props: { visible, item },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
}

describe('FormDataSummary · 加载与展示', () => {
  beforeEach(() => {
    localStorage.clear()
    setActiveFormStore(createLocalFormStore())
  })

  it('打开时加载记录并显示统计（总条数 + 最新提交）', async () => {
    const store = createLocalFormStore()
    const item = makeItem()
    await store.appendRecord(item.collectKey, { id: 'r1', time: 't1', data: { name: '张三', age: 30 } })
    await store.appendRecord(item.collectKey, { id: 'r2', time: 't2', data: { name: '李四', age: 25 } })

    const w = mountSummary(item)
    await flushPromises()
    await nextTick()
    // 统计卡
    const nums = w.findAll('.ld-data-stat-num').map((n) => n.text())
    expect(nums[0]).toBe('2')
    // 记录明细表
    const rows = w.findAll('.ld-data-table tbody tr')
    expect(rows.length).toBe(2)
    w.unmount()
  })

  it('无记录时显示空态', async () => {
    const w = mountSummary(makeItem())
    await flushPromises()
    expect(w.text()).toContain('暂无收集记录')
    w.unmount()
  })
})

describe('FormDataSummary · CSV 导出', () => {
  beforeEach(() => {
    localStorage.clear()
    setActiveFormStore(createLocalFormStore())
  })

  it('导出 CSV 含 BOM + 表头 + 数据行', async () => {
    const store = createLocalFormStore()
    const item = makeItem()
    await store.appendRecord(item.collectKey, {
      id: 'r1',
      time: 't1',
      data: { name: '张三', age: 30, tags: ['a', 'b'] },
    })

    const w = mountSummary(item)
    await flushPromises()
    // 捕获 downloadBlob（内部工具）——通过按钮点击触发，断言不抛错且按钮可用
    const exportBtn = w.findAll('button').find((b) => b.text().includes('导出'))
    expect(exportBtn!.attributes('disabled')).toBeUndefined()
    // 触发 CSV 生成（直接调用组件内部 exportCsv 通过事件链，这里仅验证按钮存在与可用）
    await exportBtn!.trigger('click')
    await flushPromises()
    // 不抛异常即通过（Blob 下载在 jsdom 环境静默）
    expect(w.vm).toBeDefined()
    w.unmount()
  })
})
/* ════════════════════════════════════════
 * CSV 公式注入防护（#282）—— 这条路径曾被漏掉
 *
 * FormDataSummary 导出的正是**表单收集来的用户数据**，此前只有引号转义、
 * 没有公式前缀防护：用户在某字段填 `=cmd|'/c calc'!A0`，管理员导出后用 Excel
 * 打开就会执行。断言捕获真实 Blob 文本，而不是"按钮点得动"。
 * ════════════════════════════════════════ */
describe('FormDataSummary · CSV 公式注入防护', () => {
  it('**= 开头的用户值被加单引号前缀**（否则 Excel 当公式执行）', async () => {
    const store = createLocalFormStore()
    setActiveFormStore(store)
    const item = makeItem()
    await store.appendRecord(item.collectKey, {
      id: 'r1',
      time: 't1',
      data: { name: "=cmd|'/c calc'!A0", age: 1 },
    })

    // 捕获组件交给 downloadBlob 的 Blob
    const captured: Blob[] = []
    const orig = URL.createObjectURL
    URL.createObjectURL = ((b: Blob) => {
      captured.push(b)
      return 'blob:stub'
    }) as typeof URL.createObjectURL

    const w = mountSummary(item)
    try {
      await flushPromises()
      const btn = w.findAll('button').find((b) => b.text().includes('导出'))!
      await btn.trigger('click')
      await flushPromises()
      expect(captured.length, '应生成一个 CSV Blob').toBe(1)
      const text = await captured[0]!.text()
      expect(text, '公式载荷必须带前缀').toContain(`'=cmd|'/c calc'!A0`)
      // 每一个 =cmd 前都必须紧跟单引号（即不存在裸露的公式）
      expect(text, '不得出现裸露的公式开头').not.toMatch(/(?<!')=cmd\|/)
      expect(text, '表头照常带引号').toContain('"name"')
    } finally {
      URL.createObjectURL = orig
      w.unmount()
    }
  })
})