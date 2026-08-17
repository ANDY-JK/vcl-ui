/**
 * 路线规划编排 — 响应式包装路线规划算法
 * 支持：生成规划、获取驾车数据、重新规划
 */
import { ref } from 'vue'
import {
  planRoute, enrichWithDrivingRoutes,
  buildAllNavLinks, replanFrom,
} from '@/components/route-planner/utils'
import type { RoutePlan, RouteOptions, Store } from '@/components/route-planner/types'

export function useRoutePlanner() {
  const plan = ref<RoutePlan | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const enriching = ref(false)

  /**
   * 生成路线规划
   */
  async function generate(options: RouteOptions): Promise<RoutePlan | null> {
    loading.value = true
    error.value = null

    try {
      // 基础规划（闭环回路）
      const result = planRoute(options)
      plan.value = result

      // 生成导航链接
      buildAllNavLinks(result.days, result.startPoint)

      return result
    } catch (e) {
      error.value = e instanceof Error ? e.message : '路线规划失败'
      return null
    } finally {
      loading.value = false
    }
  }

  /**
   * 用实际驾车数据丰富路线
   * 替换估算距离/时间为真实驾车数据
   * 同时生成高德导航链接
   */
  async function enrichDriving(onProgress?: (cur: number, total: number) => void): Promise<void> {
    if (!plan.value) return

    enriching.value = true
    try {
      await enrichWithDrivingRoutes(plan.value, onProgress)
      // 驾车数据获取完成后，生成导航链接
      buildAllNavLinks(plan.value.days, plan.value.startPoint)
    } catch {
      // 驾车数据获取失败保留估算值，仍然尝试生成导航链接
      buildAllNavLinks(plan.value.days, plan.value.startPoint)
    } finally {
      enriching.value = false
    }
  }

  /**
   * 从当前位置重新规划剩余路线
   * @param currentLocation 当前位置（lat/lon）
   * @param remainingStores 剩余未访问门店
   */
  async function replan(
    currentLocation: { lat: number; lon: number },
    remainingStores: Store[],
  ): Promise<RoutePlan | null> {
    if (!plan.value) return null

    loading.value = true
    error.value = null

    try {
      // 从当前位置重新规划
      const newPlan = replanFrom(currentLocation, remainingStores, plan.value)
      plan.value = newPlan

      // 生成导航链接
      buildAllNavLinks(newPlan.days, newPlan.startPoint)

      return newPlan
    } catch (e) {
      error.value = e instanceof Error ? e.message : '重新规划失败'
      return null
    } finally {
      loading.value = false
    }
  }

  function reset(): void {
    plan.value = null
    loading.value = false
    error.value = null
    enriching.value = false
  }

  return {
    plan,
    loading,
    enriching,
    error,
    generate,
    enrichDriving,
    replan,
    reset,
  }
}
