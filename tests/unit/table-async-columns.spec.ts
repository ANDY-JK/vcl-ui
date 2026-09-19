// B12 复现：异步列场景下无 namespace 的 DataTable 持久化空间恒为 dt-i0，跨表串数据
// 期望：列到达后 auto namespace 按真实列指纹重算，不同列的表格各写各的键，遗留的 dt-i0-* 被清理
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import DataTable from '@/components/data/DataTable.vue'
import type { Column, TableStorage } from '@/components/data/composables/types'

/** 内存存储适配器：同步 get/set/remove，dump 供断言 */
function memStorage(): TableStorage & { dump: () => Record<string, string> } {
  const m = new Map<string, string>()
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => void m.set(k, v),
    remove: (k) => void m.delete(k),
    dump: () => Object.fromEntries(m.entries()),
  }
}

function mountAsync(storage: TableStorage, data: Record<string, unknown>[]) {
  return mount(DataTable, {
    props: {
      columns: [] as Column[],
      data,
      rowKey: 'id',
      virtualScroll: false,
      autoFit: false,
      persistence: 'auto' as const,
      storage,
    },
  })
}

describe('DataTable 异步列 · 持久化空间', () => {
  it('无 namespace：不同列的表格各写各的键，不共用 dt-i0', async () => {
    const storage = memStorage()
    const a = mountAsync(storage, [{ id: 1, a: 'x' }])
    const b = mountAsync(storage, [{ id: 1, b: 'y' }])
    await a.setProps({ columns: [{ key: 'a', title: 'A' }] })
    await b.setProps({ columns: [{ key: 'b', title: 'B' }] })
    await nextTick()

    await a.find('th').trigger('click')
    await b.find('th').trigger('click')
    await nextTick()

    const sortKeys = Object.keys(storage.dump()).filter((k) => k.endsWith('-sort'))
    expect(sortKeys).toHaveLength(2)
    expect(sortKeys.some((k) => k.startsWith('dt-i0-'))).toBe(false)
  })

  it('无 namespace：列到达后 auto namespace 按真实列指纹重算', async () => {
    const storage = memStorage()
    const w = mountAsync(storage, [{ id: 1, a: 'x' }])
    await w.setProps({ columns: [{ key: 'a', title: 'A' }] })
    await nextTick()
    await w.find('th').trigger('click')
    await nextTick()

    const sortKey = Object.keys(storage.dump()).find((k) => k.endsWith('-sort'))
    expect(sortKey).toBeDefined()
    expect(sortKey).not.toBe('dt-i0-sort')
  })

  it('异步列到达后清理遗留的共享 dt-i0-* 键', async () => {
    const storage = memStorage()
    storage.set('dt-i0-sort', JSON.stringify({ key: 'a', order: 'desc', history: {} }))
    const w = mountAsync(storage, [{ id: 1, a: 'x' }])
    await w.setProps({ columns: [{ key: 'a', title: 'A' }] })
    await nextTick()
    await w.find('th').trigger('click')
    await nextTick()

    expect(storage.dump()['dt-i0-sort']).toBeUndefined()
  })
})
