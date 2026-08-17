// ⛔ 保护 — 点击外部检测，禁止：事件监听/清理逻辑删除
//    需我确认：targetRefs 多元素支持、exclude 参数
import { onMounted, onUnmounted, type Ref } from 'vue'

export function useClickOutside(
  targetRefs: Ref<HTMLElement | null>[],
  callback: () => void,
) {
  function onClick(e: MouseEvent) {
    const target = e.target as Node | null
    if (!target) return
    if (targetRefs.length === 0) return
    const inside = targetRefs.some(ref => {
      const el = ref.value
      return el && el.contains(target)
    })
    if (!inside) callback()
  }

  onMounted(() => {
    document.addEventListener('click', onClick, { passive: true })
  })

  onUnmounted(() => {
    document.removeEventListener('click', onClick)
  })
}
