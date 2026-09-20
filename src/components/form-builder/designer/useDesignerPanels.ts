/**
 * useDesignerPanels — 设计器三面板宽度 / 显隐管理（拆分自 FormDesigner.vue，超 800 行整改）
 *
 * 职责：面板拖拽调宽 + localStorage 持久化 + 主体窄屏自动收起大纲列。
 * FormDesigner 只保留调用与模板绑定，宽度语义与持久化细节收口在此。
 */
import { ref, computed, watch, onUnmounted, type Ref } from 'vue'

/** 宽度与显隐的持久化 key（同一浏览器记住用户调过的布局） */
const PANEL_STORE_KEY = 'vcl-designer-panels'
/** 面板宽度下限/上限：再窄放不下内容，再宽会把画布挤没 */
const PANEL_MIN_W = 150
const PANEL_MAX_W = 420
/** 主体宽度小于此值时自动收起大纲列，优先保证画布可用 */
const NARROW_W = 1080

export function useDesignerPanels(bodyRef: Ref<HTMLElement | null>) {
  const paletteW = ref(220)
  const outlineW = ref(190)
  const propsW = ref(290)
  const showPalette = ref(true)
  const showOutline = ref(true)
  const showProps = ref(true)
  /** 主体实测宽度（0 = 尚未测量） */
  const bodyW = ref(0)
  const resizing = ref<'palette' | 'outline' | 'props' | null>(null)
  const narrow = computed(() => bodyW.value > 0 && bodyW.value < NARROW_W)
  /** 大纲列实际可见性 = 用户开关 && 非窄屏 */
  const outlineVisible = computed(() => showOutline.value && !narrow.value)

  function clampPanelW(w: number): number {
    return Math.min(PANEL_MAX_W, Math.max(PANEL_MIN_W, Math.round(w)))
  }

  function persistPanels(): void {
    try {
      localStorage.setItem(
        PANEL_STORE_KEY,
        JSON.stringify({
          paletteW: paletteW.value,
          outlineW: outlineW.value,
          propsW: propsW.value,
          showPalette: showPalette.value,
          showOutline: showOutline.value,
          showProps: showProps.value,
        }),
      )
    } catch {
      // 隐私模式 / 配额满：记不住不影响使用
    }
  }

  function restorePanels(): void {
    // SSR 安全：localStorage 在无 window 环境是未定义标识符，先于 try 拦截
    if (typeof localStorage === 'undefined') return
    try {
      const raw = localStorage.getItem(PANEL_STORE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as Partial<{
        paletteW: number
        outlineW: number
        propsW: number
        showPalette: boolean
        showOutline: boolean
        showProps: boolean
      }>
      if (typeof saved.paletteW === 'number') paletteW.value = clampPanelW(saved.paletteW)
      if (typeof saved.outlineW === 'number') outlineW.value = clampPanelW(saved.outlineW)
      if (typeof saved.propsW === 'number') propsW.value = clampPanelW(saved.propsW)
      if (typeof saved.showPalette === 'boolean') showPalette.value = saved.showPalette
      if (typeof saved.showOutline === 'boolean') showOutline.value = saved.showOutline
      if (typeof saved.showProps === 'boolean') showProps.value = saved.showProps
    } catch {
      // 缓存损坏：回落默认宽度
    }
  }

  restorePanels()

  /** 拖分隔条调宽（属性面板在右侧，向左拖才变宽） */
  function startResize(key: 'palette' | 'outline' | 'props', e: MouseEvent): void {
    e.preventDefault()
    const startX = e.clientX
    const dir = key === 'props' ? -1 : 1
    const startW = key === 'palette' ? paletteW.value : key === 'outline' ? outlineW.value : propsW.value
    resizing.value = key
    const onMove = (ev: MouseEvent): void => {
      const next = clampPanelW(startW + (ev.clientX - startX) * dir)
      if (key === 'palette') paletteW.value = next
      else if (key === 'outline') outlineW.value = next
      else propsW.value = next
    }
    const onUp = (): void => {
      resizing.value = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      persistPanels()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function togglePanel(key: 'palette' | 'outline' | 'props'): void {
    if (key === 'palette') showPalette.value = !showPalette.value
    else if (key === 'outline') showOutline.value = !showOutline.value
    else showProps.value = !showProps.value
    persistPanels()
  }

  /** 主体宽度实测：窄屏自动收起大纲列 */
  let bodyObserver: ResizeObserver | null = null
  watch(
    bodyRef,
    (el) => {
      bodyObserver?.disconnect()
      bodyObserver = null
      if (!el) return
      bodyObserver = new ResizeObserver(() => {
        bodyW.value = el.clientWidth
      })
      bodyObserver.observe(el)
      bodyW.value = el.clientWidth
    },
    { flush: 'post' },
  )
  onUnmounted(() => {
    bodyObserver?.disconnect()
    bodyObserver = null
  })

  return {
    paletteW,
    outlineW,
    propsW,
    showPalette,
    showOutline,
    showProps,
    bodyW,
    resizing,
    narrow,
    outlineVisible,
    startResize,
    togglePanel,
  }
}
