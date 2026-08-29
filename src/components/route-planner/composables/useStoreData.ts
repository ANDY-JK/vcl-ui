/**
 * 门店数据管理 — CRUD + localStorage 持久化
 */
import { ref, computed, watch } from 'vue'
import { isValidLatLon } from '@/components/amap'
import type { Store } from '@/components/route-planner/types'

const STORAGE_KEY = 'route-planner-stores'

/** 从 localStorage 加载，同时清洗非法坐标 */
function loadFromStorage(): Store[] {
  // SSR/无 localStorage 环境：返回空（模块加载期调用，必须有守卫）
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const stores: Store[] = JSON.parse(raw)
    // 修复已有脏数据：坐标不在中国范围的标记为无坐标
    for (const s of stores) {
      if (s.longitude != null && s.latitude != null && !isValidLatLon(s.latitude, s.longitude)) {
        s.longitude = null
        s.latitude = null
        s.coordSource = 'none'
      }
    }
    return stores
  } catch {
    return []
  }
}

/** 保存到 localStorage（隐私模式/配额满时不让模块级 watch 回调抛未捕获异常） */
function saveToStorage(stores: Store[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stores))
  } catch (e) {
    console.warn('[useStoreData] 门店数据保存失败（隐私模式/配额满）:', e)
  }
}

/** 单例状态 */
const stores = ref<Store[]>(loadFromStorage())

/** 持久化 */
watch(stores, (val) => saveToStorage(val), { deep: true })

export function useStoreData() {
  /** 所有门店 */
  const allStores = computed(() => stores.value)

  /** 有效门店（有坐标） */
  const validStores = computed(() => stores.value.filter((s) => s.longitude != null && s.latitude != null))

  /** 按城市分组统计 */
  const cityStats = computed(() => {
    const map = new Map<string, number>()
    for (const s of validStores.value) {
      const city = s.city || '未知'
      map.set(city, (map.get(city) || 0) + 1)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  })

  /** 坐标来源统计 */
  const coordStats = computed(() => {
    const map: Record<string, number> = {}
    for (const s of stores.value) {
      map[s.coordSource] = (map[s.coordSource] || 0) + 1
    }
    return map
  })

  /** 添加门店 */
  function addStore(store: Store): void {
    stores.value.push(store)
  }

  /** 更新门店 */
  function updateStore(id: string, data: Partial<Store>): void {
    const idx = stores.value.findIndex((s) => s.id === id)
    if (idx !== -1) {
      stores.value[idx] = { ...stores.value[idx], ...data }
    }
  }

  /** 删除门店 */
  function removeStore(id: string): void {
    stores.value = stores.value.filter((s) => s.id !== id)
  }

  /** 批量导入 */
  function importStores(newStores: Store[]): void {
    stores.value.push(...newStores)
  }

  /** 切换跳过状态 */
  function toggleSkip(id: string): void {
    const store = stores.value.find((s) => s.id === id)
    if (store) store.skipped = !store.skipped
  }

  /** 清空 */
  function clearAll(): void {
    stores.value = []
  }

  return {
    stores: allStores,
    validStores,
    cityStats,
    coordStats,
    addStore,
    updateStore,
    removeStore,
    importStores,
    toggleSkip,
    clearAll,
  }
}
