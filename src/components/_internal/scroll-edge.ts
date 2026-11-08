/**
 * 滚动边缘软化 —— 内部工具（业界的 scroll-edge fade recipe，密排适配版）
 *
 * 解决的问题：密排面板高度是**紧的** —— 内容一旦超出就得滚动，但用户看不出「下面还有」，
 * 因为滚动条在细滚动条主题下几乎不可见。硬切的内容边缘让人以为列表到此为止。
 *
 * 做法：把「还有内容」这件事交给两条 24px 的渐变遮罩（配轻模糊）去暗示，
 * **不占任何布局空间** —— 这与「一屏放最多内容」的立库原则一致：不加高度、不加留白，
 * 只让溢出可被看见。遮罩在顶/底时自动隐去（`atTop` / `atBottom`），首屏不虚化。
 *
 * 约定（使用方必须照做，否则 blur 会失效或吃掉交互）：
 *   1. 遮罩是**独立兄弟节点**，不能塞进滚动容器内部（内部节点会跟着内容滚走）。
 *   2. 遮罩必须 `pointer-events: none` + `aria-hidden="true"`。
 *   3. 逐层设透明度，**绝不设父级 opacity**（父级半透明会建 backdrop root，正常缩放下 blur 失效）。
 *   4. 表头留在滚动容器**外面**（滚动时表头不该跟着走）。
 *
 * 用法：
 *   const { atTop, atBottom } = useScrollEdge(treeScrollEl)
 *   <div class="vcl-scroll-edge">
 *     <div ref="treeScrollEl" class="vcl-scroll-edge__viewport">…</div>
 *     <div class="vcl-scroll-edge__veil vcl-scroll-edge__veil--top" :style="{ opacity: atTop ? 0 : 1 }" aria-hidden="true" />
 *     <div class="vcl-scroll-edge__veil vcl-scroll-edge__veil--bottom" :style="{ opacity: atBottom ? 0 : 1 }" aria-hidden="true" />
 *   </div>
 */
import { onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'

export interface ScrollEdgeOptions {
  /**
   * 距底部多少像素内算「已经到底」。默认 1 —— 子像素缩放下 `scrollTop + clientHeight`
   * 常比 `scrollHeight` 差不到 1px，取 0 会让底部遮罩在真到底时仍然挂着。
   */
  bottomThreshold?: number
}

export interface ScrollEdgeState {
  /** 是否在顶部（顶部遮罩此时应隐藏） */
  atTop: Ref<boolean>
  /** 是否在底部（底部遮罩此时应隐藏） */
  atBottom: Ref<boolean>
  /** 手动重新测量一次（内容变化后容器不会自动发 scroll 事件时用） */
  sync: () => void
}

/**
 * 跟踪一个滚动容器的顶/底到达状态。
 *
 * 三路信号，缺一路就会出现「状态滞留」：
 *   1. `scroll`（passive）—— 用户在滚。
 *   2. `ResizeObserver` —— 容器**自身**被拖宽/被布局重排。
 *   3. `MutationObserver`（childList）—— 容器**内容**增删（筛选后列表变短、加载更多）。
 *      这一路最容易漏：内容变化既不触发 scroll，也不改变容器盒子尺寸，
 *      于是遮罩会停在上一态（列表已到底却还挂着底部渐隐）。
 *
 * 三路都只做「排一次 rAF」，一帧最多算一次。
 */
export function useScrollEdge(
  scrollEl: Ref<HTMLElement | null | undefined>,
  options: ScrollEdgeOptions = {},
): ScrollEdgeState {
  const atTop = ref(true)
  const atBottom = ref(true)
  const threshold = options.bottomThreshold ?? 1

  let raf = 0
  let ro: ResizeObserver | null = null
  let mo: MutationObserver | null = null
  /** 当前真正挂过监听的元素：ref 换人（弹层 v-if 重开）时必须先摘旧再挂新 */
  let bound: HTMLElement | null = null

  function sync(): void {
    const el = scrollEl.value
    if (!el) return
    atTop.value = el.scrollTop <= 0
    atBottom.value = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold
  }

  function schedule(): void {
    if (raf) return
    raf = requestAnimationFrame(() => {
      raf = 0
      sync()
    })
  }

  function detach(): void {
    bound?.removeEventListener('scroll', schedule)
    ro?.disconnect()
    ro = null
    mo?.disconnect()
    mo = null
    bound = null
  }

  function attach(el: HTMLElement | null | undefined): void {
    if (!el || el === bound) return
    detach()
    bound = el
    el.addEventListener('scroll', schedule, { passive: true })
    // ResizeObserver 缺失（老 Safari / 测试环境桩）时退化为「只在 scroll 时算」，
    // 不抛错、不影响可用性 —— 只是少了「尺寸变了自动重算」这一路。
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(schedule)
      ro.observe(el)
    }
    // 只看直接子节点的增删：subtree/attributes 会把每次内容重渲染都叫醒，没必要。
    if (typeof MutationObserver !== 'undefined') {
      mo = new MutationObserver(schedule)
      mo.observe(el, { childList: true })
    }
    sync()
  }

  onMounted(() => attach(scrollEl.value))

  /**
   * ref 指向的元素**晚于挂载**才出现的情况必须覆盖：
   * 抽屉/弹层里的滚动体常是 `v-if="visible"` 渲染的 —— 组件挂载时 ref 还是 null，
   * 只靠 onMounted 绑一次，弹层打开后监听根本没挂，遮罩永远停在「无溢出」初始态。
   * （与 TD-79 同源：同一契约的第二条到达路径没有接上。）
   * `flush: 'post'` 保证元素已进 DOM、尺寸可量。
   */
  watch(
    scrollEl,
    (el) => {
      if (el) attach(el)
      else detach()
    },
    { flush: 'post' },
  )

  onBeforeUnmount(() => {
    detach()
    if (raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
  })

  return { atTop, atBottom, sync }
}
