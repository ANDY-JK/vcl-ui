/**
 * useDesignerPanels — 设计器三面板宽度 / 显隐管理（拆分自 FormDesigner.vue，超 800 行整改）
 *
 * 职责：面板拖拽调宽 + localStorage 持久化。
 * 窄屏自动收起大纲列已由 CSS @container 替代（designer-layout.css），不再需要 JS 检测。
 * FormDesigner 只保留调用与模板绑定，宽度语义与持久化细节收口在此。
 */
import { ref, computed } from 'vue'

/** 宽度与显隐的持久化 key（同一浏览器记住用户调过的布局） */
const PANEL_STORE_KEY = 'vcl-designer-panels'
/** 面板宽度下限/上限：再窄放不下内容，再宽会把画布挤没 */
const PANEL_MIN_W = 150
const PANEL_MAX_W = 420

/**
 * 首开默认宽随视口收放：小屏少占面板、画布优先。
 * 尺子＝tokens.css --vcl-scale 的 JS 镜像（1024px 视口 → 0.88，1920px → 1），
 * 与全站同一条曲线——面板若走自己的曲线，缩到一半时与面板内的字号/控件脱节。
 * 用户拖过/存过布局则由 restorePanels 覆盖，永不强行改。
 * 注：拖动下限 PANEL_MIN_W 是可用性地板，不随缩放走（再窄放不下内容）。
 */
const SCALE_MIN = 0.88
const SCALE_MAX = 1
const SCALE_SPAN_VW = 896

/**
 * 真实渲染值探针：借一个隐藏元素把 --vcl-scale 落进布局的结果量出来
 * （自动含 --vcl-zoom 用户旋钮与宿主覆写）。自定义属性的计算值是未化简的
 * 记号流，getComputedStyle 读不出数字；只有落到布局里才能拿到真值——
 * 这是与 CSS 唯一不会失步的镜子，曲线/旋钮怎么改它都自动跟。
 * 探针不可用（SSR / 测试环境不解析 CSS 变量布局，量到 0）时回落
 * JS 曲线镜像（同一条 0.88→1 / 896px 曲线），与 CSS 保持同一口径。
 */
function renderedScale(): number {
  if (typeof document !== 'undefined' && typeof document.body !== 'undefined') {
    const probe = document.createElement('div')
    probe.style.cssText =
      'position:absolute;visibility:hidden;pointer-events:none;width:calc(100px * var(--vcl-scale));'
    document.body.appendChild(probe)
    const w = probe.getBoundingClientRect().width
    probe.remove()
    const scale = w / 100
    if (w > 0 && Number.isFinite(scale) && scale >= 0.3 && scale <= 3) return scale
  }
  if (typeof window === 'undefined') return SCALE_MIN
  const fit = Math.min(1, Math.max(0, (window.innerWidth - 1024) / SCALE_SPAN_VW))
  return SCALE_MIN + (SCALE_MAX - SCALE_MIN) * fit
}

function fittedDefault(base: number, min: number): number {
  return Math.max(min, Math.round(base * renderedScale()))
}

export function useDesignerPanels() {
  const paletteW = ref(fittedDefault(220, PANEL_MIN_W))
  const outlineW = ref(fittedDefault(190, PANEL_MIN_W))
  const propsW = ref(fittedDefault(290, PANEL_MIN_W))
  const showPalette = ref(true)
  const showOutline = ref(true)
  const showProps = ref(true)
  const resizing = ref<'palette' | 'outline' | 'props' | null>(null)
  /** 大纲列实际可见性 = 用户开关（窄屏自动收起由 CSS @container 控制） */
  const outlineVisible = computed(() => showOutline.value)

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

  return {
    paletteW,
    outlineW,
    propsW,
    showPalette,
    showOutline,
    showProps,
    resizing,
    outlineVisible,
    startResize,
    togglePanel,
  }
}
