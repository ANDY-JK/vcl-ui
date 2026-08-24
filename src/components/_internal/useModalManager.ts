// 弹窗互斥管理 — 同 scope 内只允许一个弹窗（ModalBox / Drawer），新开即关旧
//
// scope 隔离：不同 scope 的弹窗互不影响（可共存/层叠）。
// 默认 scope 'global' 保持历史行为（所有弹窗全局互斥）；
// 需要隔离的场景（如 Drawer 内打开确认 ModalBox）传不同 scope 即可独立互斥。
import { ref, type Ref } from 'vue'

/** 默认互斥域：未指定 scope 的弹窗都注册在此，保持"全页面互斥"的既有行为 */
export const DEFAULT_MUTEX_SCOPE = 'global'

const scopes = new Map<string, Ref<(() => void) | null>>()

function scopeRef(scope: string): Ref<(() => void) | null> {
  let r = scopes.get(scope)
  if (!r) {
    r = ref<(() => void) | null>(null)
    scopes.set(scope, r)
  }
  return r
}

/**
 * 注册当前弹窗到指定互斥域，自动关闭同域上一个活跃弹窗。
 * @param close 关闭当前弹窗的回调
 * @param scope 互斥域标识（默认 'global'）。不同 scope 的弹窗互不干扰
 * @returns 注销函数（建议在 watch(visible→false) 和 onUnmounted 中调用）
 */
export function registerModal(close: () => void, scope: string = DEFAULT_MUTEX_SCOPE): () => void {
  const active = scopeRef(scope)
  const prev = active.value
  if (prev && prev !== close) {
    // 关闭同域上一个弹窗（同步触发其 update:visible→false，不会死循环）
    prev()
  }
  active.value = close

  // 返回清理函数
  return () => {
    if (active.value === close) {
      active.value = null
    }
  }
}

/** 当前是否有活跃弹窗（测试/调试用） */
export function hasActiveModal(scope: string = DEFAULT_MUTEX_SCOPE): boolean {
  return scopes.get(scope)?.value != null
}
