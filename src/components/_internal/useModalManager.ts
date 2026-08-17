// 模块级单例 — 同页面只允许一个弹窗（ModalBox / Drawer），新开即关旧
import { ref, type Ref } from 'vue'

const activeCloseFn: Ref<(() => void) | null> = ref(null)

/**
 * 注册当前弹窗，自动关闭上一个活跃弹窗。
 * 返回注销函数（建议在 watch(visible→false) 和 onUnmounted 中调用）。
 */
export function registerModal(close: () => void): () => void {
  const prev = activeCloseFn.value
  if (prev && prev !== close) {
    // 关闭上一个弹窗（同步触发其 update:visible→false，不会死循环）
    prev()
  }
  activeCloseFn.value = close

  // 返回清理函数
  return () => {
    if (activeCloseFn.value === close) {
      activeCloseFn.value = null
    }
  }
}
