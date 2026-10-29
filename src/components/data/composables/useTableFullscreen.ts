/**
 * useTableFullscreen — DataTable 全屏机械层（自主文件下沉，M3 持续拆分）
 *
 * 只下沉「与业务弹窗状态无关」的三块自包含机械逻辑：
 *   1. 节点搬迁/归还：全屏期间把 .table-wrap 挂到 body（脱离弹窗/父容器的 overflow 限制），
 *      退出/卸载时放回原位（快照失效回退 append）。
 *   2. 边界监听：全屏框对齐 .content-body（无外壳时按视口），RO + window resize 合帧。
 *   3. 侧栏收起等待：能问到 CSS 动画就等动画，问不到退回「宽度连续两帧不变」实测。
 *      （第 168 轮补：实测兜底也必须有时限——宽度持续变化时它原本会永久轮询。）
 *
 * Escape 优先级链与 body-click 的弹窗守卫（筛选/详情/截图/右键/批量/笔记）依赖宿主
 * 六个子弹窗状态，留在 DataTable 的处理器里（那些是业务编排，不是机械逻辑）。
 */
import { ref, type Ref } from 'vue'

// ══════════ 1. 节点搬迁/归还 ══════════

export function useFullscreenNodeRelocation(wrapRef: Ref<HTMLElement | null>) {
  /** 搬迁前的原父容器与原位置快照 */
  const _parent = ref<HTMLElement | null>(null)
  const _next = ref<ChildNode | null>(null)
  /** 搬到 body 的那个节点本身：卸载时模板 ref 已被 Vue 置空（setRef 早于 onUnmounted），
   *  必须另存一份裸引用，否则归还路径拿不到节点。 */
  let _el: HTMLElement | null = null

  /** 把 .table-wrap 搬到 body 下，脱离弹窗/父容器的 overflow/display 限制 */
  function moveToBody(): void {
    if (wrapRef.value && wrapRef.value.parentElement) {
      _el = wrapRef.value
      _parent.value = wrapRef.value.parentElement
      _next.value = wrapRef.value.nextSibling
      document.body.appendChild(wrapRef.value)
    }
  }

  /**
   * 把全屏期间挂到 body 下的节点放回原父容器（退出全屏 / 组件卸载共用）。
   * 卸载路径必须走这里：.table-wrap 是根节点的**子**节点，被搬到 body 后 Vue 摘根节点摘不到它，
   * 不放回去就整张表游离在 body 上，组件实例已销毁、再无人持有引用。
   * 此时原父容器已随根节点脱离文档 → "放回去"等于把它请出 body。
   */
  function returnToOrigin(): void {
    const wrap = _el
    const parent = _parent.value
    const next = _next.value
    if (wrap && parent) {
      // 全屏期间父容器 DOM 可能变动（路由切换/虚拟列表重排）导致快照失效：
      // 快照节点已不在原父容器内时回退为 append（仍是原父容器内，位置次要于不丢节点）
      if (next && next.parentNode === parent) parent.insertBefore(wrap, next)
      else parent.appendChild(wrap)
    } else if (wrap?.parentNode === document.body) {
      wrap.remove() // 原父容器快照也没了：至少别把全屏框留在页面上
    }
    if (wrap) {
      wrap.style.top = ''
      wrap.style.left = ''
      wrap.style.width = ''
      wrap.style.height = ''
    }
    _el = null
    _parent.value = null
    _next.value = null
  }

  return { moveToBody, returnToOrigin }
}

// ══════════ 2. 全屏框边界（对齐内容区 + RO/resize 合帧） ══════════

export function useFullscreenBounds(wrapRef: Ref<HTMLElement | null>, isActive: () => boolean) {
  let _raf = 0
  let _ro: ResizeObserver | null = null

  /** 把全屏框对齐到内容区边界；不在应用外壳里（无 .content-body）时按视口铺满 */
  function apply(): void {
    const wrap = wrapRef.value
    if (!wrap || !isActive()) return
    const cb = document.querySelector('.content-body')
    if (cb) {
      const r = cb.getBoundingClientRect()
      wrap.style.top = r.top + 'px'
      wrap.style.left = r.left + 'px'
      wrap.style.width = r.width + 'px'
      wrap.style.height = r.height + 'px'
    } else {
      wrap.style.top = '0'
      wrap.style.left = '0'
      wrap.style.width = '100vw'
      wrap.style.height = '100vh'
    }
  }

  /** 合并同一帧内的多次触发（窗口 resize 与内容区 RO 在动画期间会连发） */
  function schedule(): void {
    if (_raf) return
    _raf = requestAnimationFrame(() => {
      _raf = 0
      apply()
    })
  }

  function onWindowResize(): void {
    schedule()
  }

  /** 盯内容区尺寸：侧栏收起/展开、父容器布局变化都不会触发 window resize，
   *  过去只监听 resize 等于"量错一次就一直错到下次刷新窗口" */
  function start(): void {
    stop()
    const cb = document.querySelector('.content-body')
    if (!cb || typeof ResizeObserver === 'undefined') return
    _ro = new ResizeObserver(schedule)
    _ro.observe(cb)
  }

  function stop(): void {
    _ro?.disconnect()
    _ro = null
  }

  function cancelRaf(): void {
    if (_raf) {
      cancelAnimationFrame(_raf)
      _raf = 0
    }
  }

  return { apply, schedule, onWindowResize, start, stop, cancelRaf }
}

// ══════════ 3. 侧栏收起等待（动画优先，宽度实测兜底） ══════════

/** 宽度实测的轮询节拍：50ms 采样一次，连续两帧同值即认为过渡跑完 */
const _WIDTH_SETTLE_POLL_MS = 50
/** 兜底上限：后台标签页不跑 rAF、动画事件也不派发，超过这个时长就认为已稳定，不能让流程挂死 */
const _SETTLE_TIMEOUT_MS = 2000

/**
 * 等某容器的宽度停止变化（连续两帧同值即认为过渡跑完）。
 * 用于替代按固定毫秒等待：侧栏动画长短随主题、容器宽度、动效降级设置而变，
 * 写死的数要么白等要么在动画跑完前就把节点搬走（表现为跳一下）。
 * 它只能当兜底：过渡起步前宽度本来就恒定，帧一稀就会误判成"已稳定"，
 * 能问到动画的情况一律先走 waitForCssAnimations。
 */
function waitForWidthSettle(el: HTMLElement | null): Promise<void> {
  if (!el || typeof requestAnimationFrame !== 'function') return Promise.resolve()
  return new Promise((resolve) => {
    let last = -1
    let stable = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    // 硬上限（第 168 轮）：常量注释一直写着"超过这个时长就认为已稳定，不能让流程挂死"，
    // 但这个函数的轮询链**从来没有上限** —— 宽度若一直变（祖先有循环动画、内容抖动、
    // 子像素宽度在动画中小幅摆动），promise 永不 resolve：
    //   · 调用方 await 卡住 → **点"全屏"毫无反应**（既不进全屏也不报错）；
    //   · 这条 50ms 定时器链会一直跑到标签页关闭，后台常驻唤醒。
    const deadline = Date.now() + _SETTLE_TIMEOUT_MS
    const done = () => {
      clearTimeout(timer)
      resolve()
    }
    const step = () => {
      const w = el.getBoundingClientRect().width
      if (w === last) {
        stable++
        if (stable >= 2) return done()
      } else {
        stable = 0
        last = w
      }
      if (Date.now() >= deadline) return done()
      timer = setTimeout(step, _WIDTH_SETTLE_POLL_MS)
    }
    step()
  })
}

/** 问浏览器要该元素的 CSS 动画清单（动效降级/不支持的浏览器没有 getAnimations） */
async function waitForCssAnimations(el: HTMLElement | null): Promise<boolean> {
  // null 守卫（第 168 轮）：同文件的 waitForWidthSettle 早就接了 null，这里没接 ——
  // 谁按"兄弟函数的容错口径"传 null 过来就直接 TypeError，而它发生在 async 函数里，
  // 表现为 waitForSidebarCollapse **reject**，调用方的 await 当场中断。
  if (!el || typeof el.getAnimations !== 'function') return false
  // KeyframeEffect 守卫（第 168 轮）：部分嵌入式 WebView / 测试环境暴露了 getAnimations
  // 却没有 KeyframeEffect 全局构造器，下面一句 instanceof 会抛 ReferenceError；
  // 同样会把这个 async 函数变成 rejection。问不出结论就按"没有可等的动画"处理。
  if (typeof KeyframeEffect === 'undefined') return false
  const own = (el.getAnimations() as Animation[]).filter(
    (a) =>
      a.effect instanceof KeyframeEffect &&
      a.effect.target === el &&
      !a.effect.pseudoElement &&
      a.finished instanceof Promise,
  )
  if (!own.length) return false // 动效降级时确实没有过渡：不白等，交给实测
  let timer: ReturnType<typeof setTimeout> | undefined
  let timedOut = false
  try {
    await Promise.race([
      Promise.all(own.map((a) => a.finished.catch(() => {}))), // 中途被 cancel 也算收尾
      new Promise<void>((r) => {
        timer = setTimeout(() => {
          timedOut = true
          r()
        }, _SETTLE_TIMEOUT_MS)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
  return !timedOut // 撞上限正是"问不出结论"，退回宽度实测，别把刚修掉的伪稳定放回来
}

/** 进全屏前等侧栏收起：能问到动画就等动画跑完，问不到才退回"宽度连续两帧不变" */
export function waitForSidebarCollapse(el: HTMLElement | null): Promise<void> {
  return waitForCssAnimations(el).then((ok) => (ok ? Promise.resolve() : waitForWidthSettle(el)))
}
