/**
 * useDataTableScroll —— DataTable 的「卡片渐进加载 + 滚动进度条」（#469 从 DataTable.vue 拆出）
 *
 * 两块互相独立但都属滚动体验，且都要读同一批宿主状态（是否卡片视图 / 表格容器 / 缩放），
 * 所以合成一个 composable：
 *
 *  1. **卡片渐进加载**：每批补到「还能再滚 `_CARD_SCREENS` 屏才需要等」，批大小由卡片实测
 *     间距换算 —— 固定 50 张在矮卡片上一次补七八屏（白渲染 DOM），在高卡片上不到一屏。
 *  2. **滚动进度条**：可点击跳转 + 可拖拽，替代隐藏的纵向滚动条；溢出检测驱动显隐。
 *
 * 宿主只需传入五个只读来源，拿回状态与三个事件处理器（`onCardScroll` / `onScrollProgress` /
 * `onProgressMouseDown`）以及 `checkScrollable()`。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

export function useDataTableScroll<T extends Record<string, unknown>>(opts: {
  /** 'auto' | 'list' | 'card' 三者合成的有效视图 */
  isCardViewEffective: { value: boolean }
  /** 表格外层容器（进度条向上找 .table-wrap 用） */
  tableWrapRef: { value: HTMLElement | null }
  /** 表格滚动容器（列表模式） */
  scrollContainerRef: { value: HTMLElement | null }
  /** 过滤后全量数据（检测溢出与数据变化时用） */
  displayData: { value: T[] }
  zoomX: { value: number }
  zoomY: { value: number }
  /** 分页后的数据（卡片裁剪的输入之一） */
  pagedData: { value: T[] }
  /** 是否全屏（全屏 + 分页模式下忽略分页限制） */
  isFullscreen: { value: boolean }
  /** 每页条数（0/undefined = 不分页） */
  pageSize: { value: number | undefined }
}) {
  const { isCardViewEffective, tableWrapRef, scrollContainerRef, displayData, zoomX, zoomY } = opts

  /** 当前应渲染的分页/全量数据：全屏 + 分页模式忽略分页限制，展示全部过滤后数据 */
  const effectivePagedData = computed<T[]>(() => {
    if (opts.isFullscreen.value && opts.pageSize.value && opts.pageSize.value > 0) return displayData.value
    return opts.pagedData.value
  })

  // ── 卡片渐进加载 ─────────────────────────────────────────────────────────
  const _CARD_SCREENS = 2
  /** 卡片很高时「两屏」换算出来可能只有一两张，兜底批保证每次至少推进这么多，避免反复滚反复补 */
  const _CARD_BATCH_FLOOR = 10
  let _cardBatchSize = 50
  const cardRenderLimit = ref(_cardBatchSize)

  /** 相邻两张卡片的 offsetTop 差 = 卡片高度 + 间距；只有一张时退到自身高度。
   *  返回 0 表示量不出来（容器隐藏 / 无布局），此时调用方保留上一次的批大小 ——
   *  把 0 当 1 用会让批算成「整表一次渲染」，正好触发这段渐进加载要防的卡顿。
   *  只取前两张（卡片是容器的直接子元素），滚动事件里不能整棵子树 querySelectorAll。 */
  function _cardPitch(el: HTMLElement): number {
    const first = el.firstElementChild as HTMLElement | null
    const second = first?.nextElementSibling as HTMLElement | null
    if (first && second) {
      const pitch = second.offsetTop - first.offsetTop
      return pitch > 0 ? pitch : 0
    }
    return first ? Math.max(0, first.offsetHeight) : 0
  }

  function _remeasureCardBatch(el: HTMLElement) {
    const pitch = _cardPitch(el)
    if (pitch > 0) _cardBatchSize = Math.max(_CARD_BATCH_FLOOR, Math.ceil((el.clientHeight * _CARD_SCREENS) / pitch))
  }

  watch(isCardViewEffective, (v) => {
    if (v) cardRenderLimit.value = _cardBatchSize
  })
  const cardVisibleData = computed(() => effectivePagedData.value.slice(0, cardRenderLimit.value))
  function onCardScroll(e: Event) {
    const el = e.target as HTMLElement
    _remeasureCardBatch(el)
    // 预取提前量按容器实测高度取「还剩一屏」：写死像素在矮容器里太早补、在高屏容器里太晚补
    if (el.scrollHeight - el.scrollTop - el.clientHeight < el.clientHeight) {
      cardRenderLimit.value = Math.min(effectivePagedData.value.length, cardRenderLimit.value + _cardBatchSize)
    }
  }

  // ── 滚动进度条（可点击跳转 + 可拖拽滚动，替代隐藏的纵向滚动条） ─────────────
  const scrollProgress = ref(0)
  const scrollable = ref(false)
  let progressRafId = 0
  function onScrollProgress(e: Event) {
    if (progressRafId) return
    progressRafId = requestAnimationFrame(() => {
      progressRafId = 0
      const el = e.target as HTMLElement
      const max = el.scrollHeight - el.clientHeight
      scrollable.value = max > 0
      // 百分比必须钳在 [0,100]：macOS 橡皮筋回弹会把 scrollTop 推成负值或超过 max，
      // 而进度条是 `width: X%` —— `-10%` 是无效声明（整条被浏览器丢掉、进度条消失），
      // `138%` 则溢出轨道。两种情况都只是一次滚动事件，钳一下就不会露出坏值。
      scrollProgress.value = max > 0 ? Math.min(100, Math.max(0, Math.round((el.scrollTop / max) * 100))) : 0
    })
  }

  /** 从进度条向上找到 .table-wrap，再向下找当前活跃的滚动容器 */
  function findScrollEl(barEl: HTMLElement): HTMLElement | null {
    const wrap = barEl.closest('.table-wrap')
    if (!wrap) return null
    // 卡片模式用卡片滚动容器，表格模式用表格滚动容器
    return wrap.querySelector('.card-view-scroll') ?? wrap.querySelector('.table-scroll')
  }
  function seekScroll(clientX: number, barEl: HTMLElement) {
    const el = findScrollEl(barEl)
    if (!el) return
    const rect = barEl.getBoundingClientRect()
    // 进度条没有可量宽度时**没有"点在哪"可言**：容器隐藏、flex 塌陷、首帧未布局都会这样。
    // 此时 `(clientX - left) / width` 要么 0/0 = NaN（scrollTo 空操作 + `width:'NaN%'` 整条失效），
    // 要么除零得 Infinity 被下面钳成 1（把表格直接甩到最底部）。两种都该忽略这次点击。
    if (!(rect.width > 0)) return
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const target = Math.round(pct * (el.scrollHeight - el.clientHeight))
    el.scrollTo({ top: target, behavior: 'instant' as ScrollBehavior })
    // 拖拽时直接更新 DOM，跳过 Vue 响应式延迟
    const progress = barEl.querySelector('.table-progress') as HTMLElement
    if (progress) progress.style.width = Math.round(pct * 100) + '%'
  }

  let dragBar: HTMLElement | null = null
  function onProgressDragMove(e: MouseEvent) {
    if (dragBar) seekScroll(e.clientX, dragBar)
  }
  function onProgressDragEnd() {
    dragBar = null
    document.removeEventListener('mousemove', onProgressDragMove)
    document.removeEventListener('mouseup', onProgressDragEnd)
  }
  function onProgressMouseDown(e: MouseEvent) {
    dragBar = e.currentTarget as HTMLElement
    seekScroll(e.clientX, dragBar)
    document.addEventListener('mousemove', onProgressDragMove)
    document.addEventListener('mouseup', onProgressDragEnd)
  }
  /** 主动检测当前活跃滚动容器是否有纵向溢出，驱动进度条显隐 */
  function checkScrollable() {
    nextTick(() => {
      const el = isCardViewEffective.value
        ? (tableWrapRef.value?.querySelector('.card-view-scroll') as HTMLElement | null)
        : scrollContainerRef.value
      if (el) {
        scrollable.value = el.scrollHeight > el.clientHeight
      }
    })
  }
  // 挂载 + 数据变更后重新检测
  watch([displayData, isCardViewEffective], () => checkScrollable())
  // 缩放后重新检测，滚动条消失即停止缩小
  watch([zoomX, zoomY], () => {
    nextTick(() => checkScrollable())
  })
  onMounted(() => checkScrollable())
  onUnmounted(() => {
    if (progressRafId) cancelAnimationFrame(progressRafId)
  })

  return {
    effectivePagedData,
    cardRenderLimit,
    cardVisibleData,
    onCardScroll,
    scrollProgress,
    scrollable,
    onScrollProgress,
    onProgressMouseDown,
    checkScrollable,
  }
}
