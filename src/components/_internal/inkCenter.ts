/**
 * applyInkCentering — 动态光学居中（替代写死的 translateY 补偿）
 *
 * 背景：flex `align-items:center` 居中的是「em 盒」，而字体真实墨迹（ink）范围通常
 * 小于 1em（CJK 字形略矮、拉丁降部又让墨迹偏上/偏下），墨迹中心与 em 中心存在一个
 * 与「具体字体」绑定的差值。写死的 em 偏移（如 -0.12em）换个字体/字号就失配——
 * 而且 09-30 实测该常数在标准字体上过量了 3 倍（把 0.5px 的残差推成 1.56px 的可见偏位）。
 *
 * 做法（动态、非常数）：运行期用离屏 canvas 量当前文档字体下「代表样本」的墨迹上/下沿，
 * 得墨迹范围 inkExtent；与 em（=字号）比，按 `((inkExtent − em) / 2em)` 把墨迹中心
 * 平移到 em 中心，写进 `--vcl-ink-dy`（em 单位，随字号/缩放自动等比）。组件端只需
 * `transform: translateY(var(--vcl-ink-dy, 0))`——值由「实际加载的字体墨迹」算出，
 * 标准字体≈0（基本不动）、异常字体才自适应补偿。webfont 晚加载会改墨迹，
 * 故在 document.fonts.ready 后重跑一次。
 *
 * 为什么不用 CSS `text-box: trim`：它才是「布局级」正解，但当前 Chromium(≤151)
 * 虽通过 @supports 却未真正参与布局（实测 no-op），故以本模块兜住「现在就能用」，
 * text-box 规则保留作未来渐进增强。
 *
 * 量不到（SSR / 无 canvas / 无 body / 样本无墨迹）时返回 0 且不写字面——组件端
 * `var(--vcl-ink-dy, 0)` 回落到 0 = 纯 flex 居中的基线状态，优雅降级。
 */
const INK_DY_VAR = '--vcl-ink-dy'
/** 代表样本：CJK + 拉丁 + 数字 + 全角括号，贴近后台 UI 的真实文案形态 */
const SAMPLE = '角色（描述，禁自建）A1'
/** 位移安全边界（em）：超出多半是字体/测量异常，夹回避免把文本甩出控件 */
const MIN_EM = -0.25
const MAX_EM = 0.25

/**
 * 量出并写入 `--vcl-ink-dy`。返回写入的 em 值（0 = 未生效/基线）。
 * 幂等：可重复调用，每次按当前文档字体重算（字体变了值跟着变，这就是「动态」）。
 *
 * ⚠️ **本函数承诺「永不抛异常」**（#403）：它是纯装饰性的度量，且在 `src/main.ts`
 * 的启动路径上被调用 —— 一旦抛出去，`main.ts` 后面的挂载语句不再执行，用户看到白屏。
 * 两条原来会抛的路径已堵上：
 *   1. `fontSizePx` 为 0/负数/NaN → `canvas.height = 0` → `getImageData` 抛 IndexSizeError；
 *   2. `getImageData` 本身可能抛（画布被限制的宿主环境 / SecurityError）。
 * 两者都退回基线（返回 0、不写样式），与文档里"量不到时优雅降级"的承诺一致。
 */
export function applyInkCentering(fontSizePx = 13): number {
  if (typeof document === 'undefined' || !document.body || typeof document.createElement !== 'function') return 0
  // 入参防御（#403）：0/负数/NaN 会让画布高度为 0，取像素时直接抛 IndexSizeError
  if (!Number.isFinite(fontSizePx) || fontSizePx <= 0) return 0
  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return 0
    const family = getComputedStyle(document.body).fontFamily || 'sans-serif'

    // 离屏量「样本墨迹上/下沿」（相对基线）：alphabetic 基线画在画布垂直中，读 alpha 通道
    canvas.width = 200
    canvas.height = 4 * fontSizePx
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.font = `${fontSizePx}px ${family}`
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = '#000'
    const baselineY = canvas.height / 2
    ctx.fillText(SAMPLE, 5, baselineY)
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let top = canvas.height
    let bot = -1
    for (let y = 0; y < canvas.height; y++) {
      if (rowHasInk(data, y, canvas.width)) {
        if (y < top) top = y
        if (y > bot) bot = y
      }
    }
    if (top > bot) return 0 // 样本没画出可见墨迹（异常字体），退回基线

    const inkExtent = bot - top // 墨迹范围（px）
    const em = fontSizePx // em = 字号
    // 墨迹比 em 窄 → 向上收（负）；比 em 宽 → 向下放（正）。半差即居中所需位移。
    let e = (inkExtent - em) / (2 * em)
    if (!Number.isFinite(e)) return 0
    e = Math.min(MAX_EM, Math.max(MIN_EM, e))
    if (Math.abs(e) < 0.004) e = 0 // 亚像素噪声，不值得写

    document.documentElement.style.setProperty(INK_DY_VAR, e ? `${e.toFixed(3)}em` : '0')
    return e
  } catch {
    // 画布/取像素被宿主限制（SecurityError 等）、或样式写入失败：退回基线，绝不中断宿主启动
    return 0
  }
}

/** 该 y 行是否有可见墨迹（alpha>16） */
function rowHasInk(data: Uint8ClampedArray, row: number, w: number): boolean {
  for (let x = 0; x < w; x++) {
    if (data[(row * w + x) * 4 + 3] > 16) return true
  }
  return false
}

/** 挂 `document.fonts.ready`（webfont 晚加载会改墨迹），返回取消函数。SSR 下 no-op。 */
export function autoApplyInkCentering(fontSizePx = 13): () => void {
  applyInkCentering(fontSizePx)
  if (typeof document === 'undefined' || !('fonts' in document)) return () => undefined
  let cancelled = false
  const ready = () => {
    if (!cancelled) applyInkCentering(fontSizePx)
  }
  document.fonts.ready.then(ready).catch(() => undefined)
  return () => {
    cancelled = true
  }
}
