/**
 * useTableWindowScroll — 给虚拟窗口找到"真正的滚动源"，喂 scrollTop / containerHeight
 *
 * 背景（实测）：isVirtual 过去只看 maxHeight 这个**字符串 prop**，于是两种其实可滚的场景
 * 被误判成不可虚拟化，1 万行就实打实渲染 1 万个 <tr>（默认写法 1000 行 = 1000 tr / 10113 节点）：
 *   A. autoHeight 挂载时把外层锁成固定高（DataTable 的 _lockedMaxH）→ .table-scroll 自己是
 *      滚动容器，@scroll 一直在触发，只是 isVirtual 把它挡住了；
 *   B. 表格真的随页面/祖先容器滚动（外层无高度约束）→ 滚动事件根本不经过 .table-scroll。
 *
 * 做法：挂载后测一次"谁在滚"，之后按该滚动源更新窗口。
 *   A 类直接读 container.scrollTop/clientHeight；
 *   B 类不累加 scrollY，而是每帧读两个 rect 反推等效量：
 *       scrollTop ≡ 可视起点(滚动容器顶 + sticky 表头高) − tbody 顶边
 * 两种都写回同一对 ref，故 virtualStartIndex / virtualEndIndex / virtualVisibleData /
 * 上下占位行全部复用 useTableCore 里的既有实现。
 *
 * ready 为假表示"找不到任何可滚的源"（表格确实随内容无限增长）→ 调用方据此退回全量渲染，
 * 绝不能只渲染十行又没人能滚到剩下的行。
 */
import { getCurrentInstance, onMounted, onUnmounted, watch, type Ref } from 'vue'

export interface WindowScrollOptions {
  /** 本模式是否应该接管（调用方综合 virtualScroll / maxHeight / 分页 / 行数阈值判定） */
  active: () => boolean
  /** 表格滚动层 .table-scroll（内含 sticky thead 与 tbody） */
  container: () => HTMLElement | null
  /** 行数变化时重新测量（筛选/翻页/排序会移动位置，而此时不一定有 scroll 事件） */
  sourceLength: () => number
  scrollTop: Ref<number>
  containerHeight: Ref<number>
  /** 输出：是否找到了可滚源。为假时调用方必须退回全量渲染（否则剩下的行没人能滚到）。
   *  由调用方持有 ref，是为了让 isVirtual 能在本 composable 实例化之前就引用它。 */
  ready: Ref<boolean>
}

/** 找最近的可纵向滚动祖先；找不到就是视口（返回 null） */
function scrollRootOf(el: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el ? el.parentElement : null
  while (node && node !== document.body) {
    const ov = window.getComputedStyle(node).overflowY
    if ((ov === 'auto' || ov === 'scroll' || ov === 'overlay') && node.scrollHeight > node.clientHeight) return node
    node = node.parentElement
  }
  return null
}

export function useTableWindowScroll(o: WindowScrollOptions): { refresh: () => void } {
  /** 'self' = .table-scroll 自身在滚（走 @scroll）；'outer' = 祖先或视口在滚（走 rect 反推）；
   *  null = 尚未测过。初值必须是 null：若直接写 'outer'，本来就属于 outer 的表格
   *  在首次测量时会被"模式没变"挡掉，永远挂不上 scroll 监听，窗口纹丝不动。 */
  let mode: 'self' | 'outer' | null = null
  let root: HTMLElement | null = null
  let raf = 0
  let ro: ResizeObserver | null = null
  let bound: HTMLElement | Window | null = null
  let stop: (() => void)[] | null = null

  function measure() {
    raf = 0
    const el = o.container()
    if (!el || !o.active()) return

    // 每帧重判一次自身是否可滚：autoHeight 的锁高、列宽拖拽、筛选面板展开都会改变这一点
    const selfScrollable = el.scrollHeight > el.clientHeight + 1
    const nextMode: 'self' | 'outer' = selfScrollable ? 'self' : 'outer'
    if (nextMode !== mode) {
      mode = nextMode
      bindScrollTarget(el)
    }

    if (mode === 'self') {
      if (el.scrollTop !== o.scrollTop.value) o.scrollTop.value = el.scrollTop
      if (el.clientHeight !== o.containerHeight.value) o.containerHeight.value = el.clientHeight
      if (!o.ready.value) o.ready.value = true
      return
    }

    const tbody = el.querySelector('tbody') as HTMLElement | null
    if (!tbody) return
    const thead = el.querySelector('thead') as HTMLElement | null
    const headerH = thead ? thead.getBoundingClientRect().height : 0
    if (!root || !document.contains(root)) root = scrollRootOf(el)
    if (!root && window.innerHeight <= 0) {
      // 既没有可滚祖先也没有视口高度 —— 无可滚源，退回全量渲染
      o.ready.value = false
      return
    }
    const rootRectTop = root ? root.getBoundingClientRect().top : 0
    const rootH = root ? root.clientHeight : window.innerHeight
    const visibleTop = rootRectTop + headerH
    const offset = visibleTop - tbody.getBoundingClientRect().top
    const next = offset > 0 ? offset : 0
    if (next !== o.scrollTop.value) o.scrollTop.value = next
    const h = rootH - headerH
    if (h !== o.containerHeight.value) o.containerHeight.value = h
    // 内容比可视区高才有意义；否则说明表格本来就全露着，不需要窗口
    const needWindow = el.scrollHeight > h + 1
    if (o.ready.value !== needWindow) o.ready.value = needWindow
  }

  /** rAF 合帧：一帧内多次事件只测一次 */
  function schedule() {
    if (raf || !o.active()) return
    raf = requestAnimationFrame(measure)
  }

  function unbindScroll() {
    if (!bound) return
    bound.removeEventListener('scroll', schedule)
    if (bound === window) window.removeEventListener('resize', schedule)
    bound = null
  }

  /** 按当前 mode 换绑滚动监听 */
  function bindScrollTarget(el: HTMLElement) {
    const target: HTMLElement | Window = mode === 'self' ? el : (root ?? window)
    if (bound === target) return
    unbindScroll()
    bound = target
    target.addEventListener('scroll', schedule, { passive: true })
    if (target === window) window.addEventListener('resize', schedule, { passive: true })
  }

  function bind() {
    const el = o.container()
    if (!el) return
    root = scrollRootOf(el)
    if (!ro && typeof ResizeObserver !== 'undefined') {
      // 表格自身/祖先尺寸变化（列宽拖拽、上方折叠面板展开、窗口缩放）都要重测
      ro = new ResizeObserver(schedule)
      ro.observe(el)
    }
    measure()
  }

  function teardown() {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    unbindScroll()
    ro?.disconnect()
    ro = null
    mode = null
    o.ready.value = false
  }

  /**
   * watch 必须延后到挂载后登记：watch 注册时会先跑一次 getter 取初值，
   * 而 sourceLength/active 会顺着 virtualTotal → virtualSourceData → fullscreen()
   * 读到调用方 setup 内**后声明**的 ref（DataTable 的 _isFullscreen）→ TDZ 崩溃。
   * 测量本身也只能等 DOM 就位，挂载前 container() 还是 null。
   */
  function startWatching() {
    if (stop) return
    stop = [
      watch(
        () => o.active(),
        (on) => {
          if (on) bind()
          else teardown()
        },
        { flush: 'post' },
      ),
      watch(() => o.sourceLength(), schedule, { flush: 'post' }),
    ]
  }

  if (getCurrentInstance()) {
    onMounted(() => {
      startWatching()
      if (o.active()) bind()
    })
    onUnmounted(() => {
      stop?.forEach((s) => s())
      stop = null
      teardown()
    })
  } else {
    // 非组件场景（测试/工具）没有生命周期可等，直接登记
    startWatching()
  }

  return { refresh: schedule }
}
