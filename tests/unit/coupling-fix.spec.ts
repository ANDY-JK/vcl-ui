import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createLocalFormStore } from '@/components/form-builder/designer/store'
import { collectStorageKey } from '@/components/form-builder/designer/types'
import type { FormDesign, DesignerNode } from '@/components/form-builder/designer/types'
import Toast from '@/components/feedback/Toast.vue'

function makeNode(type: string, key?: string): DesignerNode {
  return { id: `n_${Math.random().toString(36).slice(2)}`, type: type as DesignerNode['type'], label: type, key }
}

describe('H9: 收集记录存储 key 唯一化', () => {
  beforeEach(() => localStorage.clear())

  const design: FormDesign = {
    meta: { title: '测试表单' },
    nodes: [makeNode('text', 'name'), makeNode('number', 'age')],
  }

  it('saveForm 生成的 collectKey 与 collectStorageKey 一致（单一算法）', () => {
    const store = createLocalFormStore()
    const item = store.saveForm(null, design)
    expect(item.collectKey).toBe(collectStorageKey(design.nodes!))
    // 带 fd_collect_ 前缀，与 FormCollect 传入 store 的 storageKey 同语义
    expect(item.collectKey).toMatch(/^fd_collect_/)
  })

  it('appendRecord 写入空间与 collectStorageKey 一致（无双重前缀）', () => {
    const store = createLocalFormStore()
    const item = store.saveForm(null, design)
    const key = collectStorageKey(design.nodes!)
    store.appendRecord(key, { id: 'r1', time: '2026-08-24 10:00', data: { name: '张三' } } as never)

    const saved = store.loadRecords(key)
    expect(saved).toHaveLength(1)
    // 同 key 读回，证明写读同一空间
    expect(store.loadRecords(item.collectKey)).toHaveLength(1)
    // 双重前缀空间应为空（旧 bug 会写到 fd_collect_fd_collect_xxx）
    expect(store.loadRecords(`fd_collect_${key}`)).toHaveLength(0)
  })

  it('缺 key 的字段仍能读回（f.key ?? "" 统一处理）', () => {
    const design2: FormDesign = {
      meta: { title: '测试' },
      nodes: [makeNode('text'), makeNode('title')],
    }
    const store = createLocalFormStore()
    const item = store.saveForm(null, design2)
    expect(item.collectKey).toBe(collectStorageKey(design2.nodes!))
    store.appendRecord(item.collectKey, { id: 'r1', time: 't', data: {} } as never)
    expect(store.loadRecords(item.collectKey)).toHaveLength(1)
  })

  it('删除表单连带删除收集记录', () => {
    const store = createLocalFormStore()
    const item = store.saveForm(null, design)
    store.appendRecord(item.collectKey, { id: 'r1', time: 't', data: {} } as never)
    store.deleteForm(item.id)
    expect(store.loadRecords(item.collectKey)).toHaveLength(0)
  })
})

describe('H2: Toast id 全局唯一（多实例不冲突）', () => {
  it('两个 Toast 实例的 show() id 不重复', () => {
    const a = mount(Toast)
    const b = mount(Toast)
    const idA = (a.vm as unknown as { show: (m: string) => number }).show('a')
    const idB = (b.vm as unknown as { show: (m: string) => number }).show('b')
    expect(idA).not.toBe(idB)
    a.unmount()
    b.unmount()
  })

  it('remove(id) 只移除对应实例的 toast', async () => {
    const a = mount(Toast)
    const b = mount(Toast)
    const vm = a.vm as unknown as { show: (m: string) => number; remove: (id: number) => void }
    const id = vm.show('x')
    vm.remove(id)
    expect(a.vm).toBeDefined()
    a.unmount()
    b.unmount()
  })
})
