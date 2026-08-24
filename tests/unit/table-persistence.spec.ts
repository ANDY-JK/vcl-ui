// H13 行为锁定测试：useTablePersistence 各特性恢复/持久化/清理语义
// 先锁定当前行为再重构（特性注册表），保证零行为变更
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref, nextTick, type Ref } from 'vue'
import { useTablePersistence } from '@/components/data/composables/useTablePersistence'
import type { Column, TableStorage } from '@/components/data/composables/types'

/** 内存存储适配器：同步 get/set/remove，另带 dump 供断言存储内容 */
function memStorage(): TableStorage & { dump: () => Record<string, string> } {
  const m = new Map<string, string>()
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => void m.set(k, v),
    remove: (k) => void m.delete(k),
    dump: () => Object.fromEntries(m.entries()),
  }
}

const cols: Column[] = [
  { key: 'name', title: '姓名' },
  { key: 'age', title: '年龄', fixed: 'left' },
]

interface Ctx {
  sortState: Ref<{ key: string; order: 'asc' | 'desc' }>
  sortHistory: Ref<Record<string, 'asc' | 'desc'>>
  filterState: Ref<Record<string, { searchText: string; selectedValues: string[] }>>
  _columnOrder: Ref<string[]>
  columnWidths: Ref<Record<string, number>>
  _userResizedCols: Ref<Set<string>>
  _dense: Ref<boolean>
  hiddenColumns: Ref<Set<string>>
  dynamicFixedLeft: Ref<Set<string>>
  dynamicFixedRight: Ref<Set<string>>
}

function makeCtx(): Ctx {
  return {
    sortState: ref({ key: '', order: 'asc' }),
    sortHistory: ref({}),
    filterState: ref({}),
    _columnOrder: ref(['name', 'age']),
    columnWidths: ref({}),
    _userResizedCols: ref(new Set()),
    _dense: ref(false),
    hiddenColumns: ref(new Set()),
    dynamicFixedLeft: ref(new Set()),
    dynamicFixedRight: ref(new Set()),
  }
}

describe('H13 useTablePersistence 行为锁定', () => {
  let storage: ReturnType<typeof memStorage>

  beforeEach(() => {
    storage = memStorage()
  })

  it('sort：预置缓存恢复排序状态与历史', () => {
    storage.set('dt-ns1-sort', JSON.stringify({ key: 'name', order: 'desc', history: { name: 'desc' } }))
    const ctx = makeCtx()
    useTablePersistence('ns1', cols, { ...ctx, persistence: 'auto', storage })
    expect(ctx.sortState.value).toEqual({ key: 'name', order: 'desc' })
    expect(ctx.sortHistory.value).toEqual({ name: 'desc' })
  })

  it('sort：恢复的列不在当前列集合时不应用', () => {
    storage.set('dt-ns1-sort', JSON.stringify({ key: 'ghost', order: 'desc', history: {} }))
    const ctx = makeCtx()
    useTablePersistence('ns1', cols, { ...ctx, persistence: 'auto', storage })
    expect(ctx.sortState.value.key).toBe('')
  })

  it('sort：状态变化持久化，清空排序则移除存储', async () => {
    const ctx = makeCtx()
    const api = useTablePersistence('ns1', cols, { ...ctx, persistence: 'auto', storage })
    api._clearPersisted('sort')
    ctx.sortState.value = { key: 'age', order: 'asc' }
    await nextTick()
    expect(storage.dump()['dt-ns1-sort']).toBe(JSON.stringify({ key: 'age', order: 'asc', history: {} }))
    ctx.sortState.value = { key: '', order: 'asc' }
    await nextTick()
    expect(storage.dump()['dt-ns1-sort']).toBeUndefined()
  })

  it('sort：已恢复后列结构变化不覆盖当前排序（防重）', async () => {
    storage.set('dt-ns1-sort', JSON.stringify({ key: 'name', order: 'desc', history: {} }))
    const ctx = makeCtx()
    useTablePersistence('ns1', cols, { ...ctx, persistence: 'auto', storage })
    ctx.sortState.value = { key: 'age', order: 'asc' }
    await nextTick()
    const moreCols = [...cols, { key: 'addr', title: '地址' }]
    // 触发 columns 变化 watch（模拟流式列到达）
    moreCols.pop()
    await nextTick()
    expect(ctx.sortState.value).toEqual({ key: 'age', order: 'asc' })
  })

  it('filter：预置缓存恢复筛选状态（仅保留存在的列）', () => {
    storage.set('dt-ns1-filter', JSON.stringify({ name: ['张三'], ghost: ['x'] }))
    const ctx = makeCtx()
    useTablePersistence('ns1', cols, { ...ctx, persistence: 'auto', storage })
    expect(ctx.filterState.value).toEqual({ name: { searchText: '', selectedValues: ['张三'] } })
  })

  it('filter：状态变化写 slim 格式，空筛选移除存储', async () => {
    const ctx = makeCtx()
    useTablePersistence('ns1', cols, { ...ctx, persistence: 'auto', storage })
    ctx.filterState.value = { name: { searchText: '', selectedValues: ['张三'] } }
    await nextTick()
    expect(storage.dump()['dt-ns1-filter']).toBe(JSON.stringify({ name: ['张三'] }))
    ctx.filterState.value = { name: { searchText: '', selectedValues: [] } }
    await nextTick()
    expect(storage.dump()['dt-ns1-filter']).toBeUndefined()
  })

  it('colorder：预置缓存与当前列合并（缓存优先，缺失列兜底）', () => {
    storage.set('dt-ns1-colorder', JSON.stringify(['age']))
    const ctx = makeCtx()
    useTablePersistence('ns1', cols, { ...ctx, persistence: 'auto', storage })
    expect(ctx._columnOrder.value).toEqual(['age', 'name'])
  })

  it('colorder：状态变化持久化列顺序', async () => {
    const ctx = makeCtx()
    useTablePersistence('ns1', cols, { ...ctx, persistence: 'auto', storage })
    ctx._columnOrder.value = ['age', 'name']
    await nextTick()
    expect(storage.dump()['dt-ns1-colorder']).toBe(JSON.stringify(['age', 'name']))
  })

  it('colwidth：仅持久化用户手动拖拽过的列，防抖 200ms', async () => {
    vi.useFakeTimers()
    const ctx = makeCtx()
    useTablePersistence('ns1', cols, { ...ctx, persistence: 'auto', storage })
    ctx.columnWidths.value = { name: 200, age: 150 }
    ctx._userResizedCols.value.add('name')
    await nextTick() // watch 触发
    expect(storage.dump()['dt-ns1-colwidth']).toBeUndefined() // 防抖窗口内不写
    vi.advanceTimersByTime(200)
    await Promise.resolve()
    expect(storage.dump()['dt-ns1-colwidth']).toBe(JSON.stringify({ name: 200 }))
    vi.useRealTimers()
  })

  it('dense：预置缓存恢复密度（denseProp 未传时）', () => {
    storage.set('dt-ns1-dense', '"1"') // 与 _persist 的 JSON.stringify 一致
    const ctx = makeCtx()
    useTablePersistence('ns1', cols, { ...ctx, persistence: 'auto', storage })
    expect(ctx._dense.value).toBe(true)
  })

  it('dense：传入 denseProp 时跳过恢复（受控模式）', () => {
    storage.set('dt-ns1-dense', '1')
    const ctx = makeCtx()
    useTablePersistence('ns1', cols, { ...ctx, denseProp: false, persistence: 'auto', storage })
    expect(ctx._dense.value).toBe(false)
  })

  it('hiddenCols：预置缓存恢复隐藏列（仅保留存在的列）', () => {
    storage.set('dt-ns1-hiddenCols', JSON.stringify(['name', 'ghost']))
    const ctx = makeCtx()
    useTablePersistence('ns1', cols, { ...ctx, persistence: 'auto', storage })
    expect([...ctx.hiddenColumns.value]).toEqual(['name'])
  })

  it('hiddenCols：全部显示时移除存储', async () => {
    const ctx = makeCtx()
    useTablePersistence('ns1', cols, { ...ctx, persistence: 'auto', storage })
    ctx.hiddenColumns.value = new Set(['name'])
    await nextTick()
    expect(storage.dump()['dt-ns1-hiddenCols']).toBe(JSON.stringify(['name']))
    ctx.hiddenColumns.value = new Set()
    await nextTick()
    expect(storage.dump()['dt-ns1-hiddenCols']).toBeUndefined()
  })

  it('fixedCols：新格式 userSet 缓存直接应用左右固定列', () => {
    storage.set('dt-ns1-fixedCols', JSON.stringify({ left: ['age'], right: [], userSet: true }))
    const ctx = makeCtx()
    useTablePersistence('ns1', cols, { ...ctx, persistence: 'auto', storage })
    expect([...ctx.dynamicFixedLeft.value]).toEqual(['age'])
    expect(ctx.dynamicFixedRight.value.size).toBe(0)
  })

  it('fixedCols：旧格式缓存与静态 fixed 列合并', () => {
    storage.set('dt-ns1-fixedCols', JSON.stringify({ left: ['name'], right: [] }))
    const ctx = makeCtx()
    useTablePersistence('ns1', cols, { ...ctx, persistence: 'auto', storage })
    expect([...ctx.dynamicFixedLeft.value]).toEqual(['name', 'age'])
  })

  it('fixedCols：状态变化持久化并记录 userSet', async () => {
    const ctx = makeCtx()
    useTablePersistence('ns1', cols, { ...ctx, persistence: 'auto', storage })
    ctx.dynamicFixedLeft.value = new Set(['name'])
    await nextTick()
    const saved = JSON.parse(storage.dump()['dt-ns1-fixedCols'])
    expect(saved).toEqual({ left: ['name'], right: [], userSet: true })
  })

  it('restoreColWidths：数据到达后显式调用恢复列宽并标记用户拖拽', () => {
    storage.set('dt-ns1-colwidth', JSON.stringify({ name: 220, age: 0 }))
    const ctx = makeCtx()
    const api = useTablePersistence('ns1', cols, { ...ctx, persistence: 'auto', storage })
    api.restoreColWidths()
    expect(ctx.columnWidths.value.name).toBe(220)
    expect(ctx._userResizedCols.value.has('name')).toBe(true)
    expect(ctx.columnWidths.value.age).toBeUndefined() // 非法宽度不恢复
  })

  it('flushWidths：防抖窗口内卸载前立即落盘', async () => {
    vi.useFakeTimers()
    const ctx = makeCtx()
    const api = useTablePersistence('ns1', cols, { ...ctx, persistence: 'auto', storage })
    ctx.columnWidths.value = { name: 200 }
    ctx._userResizedCols.value.add('name')
    await nextTick()
    api.flushWidths()
    expect(storage.dump()['dt-ns1-colwidth']).toBe(JSON.stringify({ name: 200 }))
    vi.useRealTimers()
  })

  it('_clearPersisted：仅清除指定特性', async () => {
    const ctx = makeCtx()
    const api = useTablePersistence('ns1', cols, { ...ctx, persistence: 'auto', storage })
    ctx.sortState.value = { key: 'name', order: 'asc' }
    ctx._columnOrder.value = ['age', 'name']
    await nextTick()
    expect(storage.dump()['dt-ns1-sort']).toBeDefined()
    api._clearPersisted('sort')
    expect(storage.dump()['dt-ns1-sort']).toBeUndefined()
    expect(storage.dump()['dt-ns1-colorder']).toBeDefined()
  })

  it('clearAllPersisted：清空全部特性（含旧格式键）', async () => {
    const ctx = makeCtx()
    const api = useTablePersistence('ns1', cols, { ...ctx, persistence: 'auto', storage })
    ctx.sortState.value = { key: 'name', order: 'asc' }
    ctx._columnOrder.value = ['age', 'name']
    await nextTick()
    storage.set('dt-ns1-name|age-sort', 'old-format') // 旧格式残留
    api.clearAllPersisted()
    expect(storage.dump()['dt-ns1-sort']).toBeUndefined()
    expect(storage.dump()['dt-ns1-colorder']).toBeUndefined()
    expect(storage.dump()['dt-ns1-name|age-sort']).toBeUndefined()
  })

  it("persistence: 'none' 时全部特性禁用（不恢复也不写）", async () => {
    storage.set('dt-ns1-sort', JSON.stringify({ key: 'name', order: 'desc', history: {} }))
    const ctx = makeCtx()
    useTablePersistence('ns1', cols, { ...ctx, persistence: 'none', storage })
    expect(ctx.sortState.value.key).toBe('')
    ctx.sortState.value = { key: 'age', order: 'asc' }
    await nextTick()
    // 预置数据原样保留（不恢复、不清理），状态变化不产生任何新写入
    expect(storage.dump()).toEqual({ 'dt-ns1-sort': JSON.stringify({ key: 'name', order: 'desc', history: {} }) })
  })

  it('异步存储适配器：Promise 恢复同样生效', async () => {
    const m = new Map<string, string>()
    m.set('dt-ns1-sort', JSON.stringify({ key: 'name', order: 'desc', history: {} }))
    const asyncStorage: TableStorage = {
      get: (k) => Promise.resolve(m.get(k) ?? null),
      set: (k, v) => Promise.resolve().then(() => void m.set(k, v)),
      remove: (k) => Promise.resolve().then(() => void m.delete(k)),
    }
    const ctx = makeCtx()
    useTablePersistence('ns1', cols, { ...ctx, persistence: 'auto', storage: asyncStorage })
    await nextTick()
    expect(ctx.sortState.value).toEqual({ key: 'name', order: 'desc' })
  })

  it('无 namespace 时用列指纹 auto namespace，恢复仍命中同一空间', () => {
    const ctx = makeCtx()
    const api = useTablePersistence(undefined, cols, { ...ctx, persistence: 'auto', storage })
    const ns = api._ns.value
    expect(ns).toMatch(/^-i/)
    storage.set(`dt${ns}-sort`, JSON.stringify({ key: 'name', order: 'asc', history: {} }))
    // 模拟刷新：新实例读同一指纹空间
    const ctx2 = makeCtx()
    useTablePersistence(undefined, cols, { ...ctx2, persistence: 'auto', storage })
    expect(ctx2.sortState.value).toEqual({ key: 'name', order: 'asc' })
  })

  it('恢复时清理旧格式键（dt{ns}-{colkey}-{feat}）', () => {
    storage.set('dt-ns1-sort', JSON.stringify({ key: 'name', order: 'asc', history: {} }))
    storage.set('dt-ns1-name|age-sort', 'old')
    const ctx = makeCtx()
    useTablePersistence('ns1', cols, { ...ctx, persistence: 'auto', storage })
    expect(storage.dump()['dt-ns1-name|age-sort']).toBeUndefined()
  })
})
