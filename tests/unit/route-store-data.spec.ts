// useStoreData 行为锁定：单例 CRUD / localStorage 脏数据清洗 / 城市与坐标来源统计 / 防抖持久化
// 背景：审计发现 route-planner 域覆盖洼地在 composables（11.81%），本文件补三个 composable 中
// 唯一带持久化副作用的这个。模块级单例 + 300ms 防抖写盘 → 用 resetModules 隔离 + 假时钟控写盘时机。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import type { Store } from '@/components/route-planner/types'

// isValidLatLon 来自 amap 域 barrel（重依赖链）；本文件测的是「清洗逻辑」不是坐标校验本身
// （后者在 amap 域有自己的覆盖），用边界一致的真实现签名替身即可。
vi.mock('@/components/amap', () => ({
  isValidLatLon: (lat: number, lon: number) => lat > -90 && lat < 90 && lon > -180 && lon < 180,
}))

const KEY = 'route-planner-stores'

function mkStore(id: string, over: Partial<Store> = {}): Store {
  return {
    id,
    name: `门店${id}`,
    address: '某路1号',
    province: '湖南省',
    city: '长沙市',
    district: '岳麓区',
    town: '',
    contact: '',
    phone: '',
    longitude: 112.9,
    latitude: 28.2,
    coordSource: 'original',
    skipped: false,
    ...over,
  }
}

let useStoreData!: typeof import('@/components/route-planner/composables/useStoreData').useStoreData

beforeEach(async () => {
  vi.useFakeTimers()
  vi.resetModules()
  localStorage.clear()
  const mod = await import('@/components/route-planner/composables/useStoreData')
  useStoreData = mod.useStoreData
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  localStorage.clear()
})

describe('useStoreData · 单例 CRUD', () => {
  it('空存储：allStores/validStores 为空，统计为空', () => {
    const d = useStoreData()
    expect(d.stores.value).toEqual([])
    expect(d.validStores.value).toEqual([])
    expect(d.cityStats.value).toEqual([])
    expect(d.coordStats.value).toEqual({})
  })

  it('add/update/remove/toggleSkip/clearAll 全链', () => {
    const d = useStoreData()
    d.addStore(mkStore('a'))
    d.addStore(mkStore('b', { skipped: false }))
    expect(d.stores.value).toHaveLength(2)

    d.updateStore('a', { name: '改名' })
    expect(d.stores.value[0].name).toBe('改名')
    // 不存在的 id：静默无操作
    d.updateStore('nope', { name: 'x' })
    expect(d.stores.value).toHaveLength(2)

    d.toggleSkip('b')
    expect(d.stores.value[1].skipped).toBe(true)
    d.toggleSkip('b')
    expect(d.stores.value[1].skipped).toBe(false)

    d.removeStore('a')
    expect(d.stores.value.map((s) => s.id)).toEqual(['b'])

    d.importStores([mkStore('c'), mkStore('d')])
    expect(d.stores.value).toHaveLength(3)

    d.clearAll()
    expect(d.stores.value).toEqual([])
  })
})

describe('useStoreData · 统计', () => {
  it('validStores 只含有坐标的门店', () => {
    const d = useStoreData()
    d.addStore(mkStore('a'))
    d.addStore(mkStore('b', { longitude: null, latitude: null, coordSource: 'none' }))
    expect(d.validStores.value.map((s) => s.id)).toEqual(['a'])
  })

  it('cityStats 按城市分组降序；空城市归「未知」', () => {
    const d = useStoreData()
    d.importStores([
      mkStore('a', { city: '长沙市' }),
      mkStore('b', { city: '长沙市' }),
      mkStore('c', { city: '株洲市' }),
      mkStore('d', { city: '' }),
    ])
    const stats = d.cityStats.value
    expect(stats[0]).toEqual(['长沙市', 2])
    expect(stats[1]).toEqual(['株洲市', 1])
    expect(Object.fromEntries(stats)['未知']).toBe(1)
  })

  it('coordStats 按 coordSource 计数（含无坐标门店）', () => {
    const d = useStoreData()
    d.importStores([
      mkStore('a', { coordSource: 'original' }),
      mkStore('b', { coordSource: 'original' }),
      mkStore('c', { coordSource: 'manual' }),
      mkStore('e', { longitude: null, latitude: null, coordSource: 'none' }),
    ])
    expect(d.coordStats.value).toEqual({ original: 2, manual: 1, none: 1 })
  })
})

describe('useStoreData · 持久化', () => {
  it('预置脏数据：加载时坐标越界的门店被清洗为无坐标', async () => {
    const dirty = [mkStore('bad', { longitude: 500, latitude: 200 }), mkStore('ok')]
    localStorage.setItem(KEY, JSON.stringify(dirty))
    // 重新加载模块：单例初始化时读 localStorage 并清洗
    vi.resetModules()
    const mod = await import('@/components/route-planner/composables/useStoreData')
    const d = mod.useStoreData()
    const bad = d.stores.value.find((s) => s.id === 'bad')!
    expect(bad.longitude).toBeNull()
    expect(bad.latitude).toBeNull()
    expect(bad.coordSource).toBe('none')
    expect(d.validStores.value.map((s) => s.id)).toEqual(['ok'])
  })

  it('变更经 300ms 尾部防抖写入 localStorage（隐私模式抛错也不冒泡）', async () => {
    const d = useStoreData()
    d.addStore(mkStore('p1'))
    // 防抖窗口内：还没写
    await nextTick()
    vi.advanceTimersByTime(200)
    expect(localStorage.getItem(KEY)).toBeNull()
    // 越过 300ms 尾部：写入
    vi.advanceTimersByTime(200)
    const saved = JSON.parse(localStorage.getItem(KEY)!) as Store[]
    expect(saved.map((s) => s.id)).toEqual(['p1'])
  })

  it('损坏的 localStorage 数据不炸模块（JSON 解析失败回退空列表）', async () => {
    localStorage.setItem(KEY, '{not-json')
    vi.resetModules()
    const mod = await import('@/components/route-planner/composables/useStoreData')
    const d = mod.useStoreData()
    expect(d.stores.value).toEqual([])
  })
})
