/**
 * 坐标解析编排 — 响应式包装三级坐标解析
 */
import { ref } from 'vue'
import { batchResolveCoordinates } from '@/components/route-planner/utils'
import type { Store } from '@/components/route-planner/types'

export function useCoordinateResolver() {
  const processing = ref(false)
  const progress = ref({ current: 0, total: 0, success: 0, fail: 0 })
  const error = ref<string | null>(null)

  /**
   * 批量解析坐标
   * @param stores 待解析门店（无坐标的）
   * @returns 解析完成的门店
   */
  async function resolveBatch(stores: Partial<Store>[]): Promise<Store[]> {
    if (stores.length === 0) return []

    processing.value = true
    error.value = null
    progress.value = { current: 0, total: stores.length, success: 0, fail: 0 }

    try {
      const results = await batchResolveCoordinates(stores, (cur, total) => {
        progress.value.current = cur
        progress.value.total = total
      })

      // 最终统计
      progress.value.success = results.filter(s => s.coordSource !== 'none').length
      progress.value.fail = results.filter(s => s.coordSource === 'none').length

      return results
    } catch (e) {
      error.value = e instanceof Error ? e.message : '坐标解析失败'
      return []
    } finally {
      processing.value = false
    }
  }

  /**
   * 解析单个门店
   */
  async function resolveOne(store: Partial<Store>): Promise<Store | null> {
    try {
      const results = await resolveBatch([store])
      return results[0] || null
    } catch {
      return null
    }
  }

  function reset(): void {
    processing.value = false
    progress.value = { current: 0, total: 0, success: 0, fail: 0 }
    error.value = null
  }

  return {
    processing,
    progress,
    error,
    resolveBatch,
    resolveOne,
    reset,
  }
}

