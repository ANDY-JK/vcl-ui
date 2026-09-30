import { reportWarn } from '@/components/_internal/runtime-observer'
/**
 * 门店数据管理 — CRUD + localStorage 持久化
 */
import { ref, computed, watch } from 'vue'
import { useT } from '@/components/_internal/i18n'
import { useDebounceFn } from '@/components/_internal/useDebounce'

/** 模块级 t：错误消息与点位名按当前语言 */
const t = useT()
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
    reportWarn('[useStoreData] 门店数据保存失败（隐私模式/配额满）:', e)
  }
}

/** 单例状态 */
const stores = ref<Store[]>(loadFromStorage())

/** 持久化 —— deep watch 会在逐字段编辑时每次都触发，而 saveToStorage 是全量
 *  JSON.stringify + 同步 setItem（实测 5000 门店：序列化 3.9ms、单键 851KB）。
 *  300ms 尾部防抖与同库 callApi / DataTable 列宽持久化同口径；代价是最后一次编辑
 *  有 300ms 落盘窗口，与表格列宽持久化的既有取舍一致。 */
const { run: scheduleSave } = useDebounceFn(saveToStorage, 300)
watch(stores, (val) => scheduleSave(val), { deep: true })

export function useStoreData() {
  /** 所有门店 */
  const allStores = computed(() => stores.value)

  /** 有效门店（有坐标） */
  const validStores = computed(() => stores.value.filter((s) => s.longitude != null && s.latitude != null))

  /** 按城市分组统计 */
  const cityStats = computed(() => {
    const map = new Map<string, number>()
    for (const s of validStores.value) {
      const city = s.city || t('routePlanner.unknown')
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
