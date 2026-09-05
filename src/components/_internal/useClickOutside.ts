// ⛔ 保护 — 点击外部检测，禁止：事件监听/清理逻辑删除
//    需我确认：targetRefs 多元素支持、exclude 参数
import { onMounted, onUnmounted, type Ref } from 'vue'

export function useClickOutside(targetRefs: Ref<HTMLElement | null>[], callback: () => void) {
  function onClick(e: MouseEvent) {
    const target = e.target as Node | null
    if (!target) return
    if (targetRefs.length === 0) return
    const inside = targetRefs.some((ref) => {
      const el = ref.value
      return el && el.contains(target)
    })
    if (!inside) callback()
  }

  onMounted(() => {
    // 必须用捕获阶段：组件触发器普遍带 @click.stop，冒泡阶段的 document 监听
    // 会被拦截（点击另一个下拉时其 input 已 stopPropagation），导致已打开的
    // 面板收不起来（多选面板常开时必现）。document 捕获最先触发，无法被拦截。
    document.addEventListener('click', onClick, { capture: true, passive: true })
  })

  onUnmounted(() => {
    document.removeEventListener('click', onClick, { capture: true })
  })
}
