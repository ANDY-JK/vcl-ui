/**
 * scale-rules —— 全站等比缩放的共享规则（迁移器与闸口共用同一套判定）
 *
 * 缩放体系：tokens.css 的 `--vcl-scale` 单一曲线
 *   1024px 视口 = 0.88 → 1920px 视口 = 1 → ≥1920 恒定（越界由 clamp 收口）。
 *   任何设计尺寸写成 `calc(Npx * var(--vcl-scale))`，任意两个尺寸的比值在所有视口恒定，
 *   即「成比例」——盒子、字号、间距、圆角、图标同一条曲线，不会出现头大身子小。
 *
 * 为什么 length/length 除法可行：`(100vw - 1024px) / 896px` 在 CSS Values 4 里
 * 产生无单位 number，可与 0.88 相加。该能力 Chrome 111+ / Safari 15.4+ / Firefox 118+，
 * 低于本库既有的容器查询（Chrome 105+）与 field-sizing 基线，无兼容性回退。
 */

/** 缩放因子引用串（迁移产物的统一形态） */
export const SCALE_REF = 'var(--vcl-scale)'

/** 参与等比缩放的属性白名单（尺寸/间距/圆角/字号类；边框、阴影、描边刻意不在内） */
export const SCALABLE_PROPS = new Set([
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'inline-size',
  'block-size',
  'min-inline-size',
  'min-block-size',
  'max-inline-size',
  'max-block-size',
  'gap',
  'row-gap',
  'column-gap',
  'column-width',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'padding-inline',
  'padding-inline-start',
  'padding-inline-end',
  'padding-block',
  'padding-block-start',
  'padding-block-end',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'margin-inline',
  'margin-inline-start',
  'margin-inline-end',
  'margin-block',
  'inset',
  'inset-inline',
  'inset-block',
  'top',
  'right',
  'bottom',
  'left',
  'border-radius',
  'border-start-start-radius',
  'border-start-end-radius',
  'border-end-start-radius',
  'border-end-end-radius',
  'font-size',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'text-indent',
  'text-underline-offset',
  'flex-basis',
  'translate',
  'background-size',
  'background-position',
  'outline-offset',
  'scroll-margin',
  'scroll-margin-top',
  'scroll-margin-bottom',
  'scroll-margin-left',
  'scroll-margin-right',
  'scroll-padding',
  'scroll-padding-top',
  'grid-auto-rows',
  'grid-auto-columns',
  'grid-template-columns',
  'grid-template-rows',
  'border-spacing',
])

/** 在 calc/min/max/clamp 表达式上下文里，乘因子可直接内嵌，无需再包一层 calc */
const EXPR_FNS = new Set(['calc', 'min', 'max', 'clamp'])

/** |值| ≤ 2px 视为渲染细节（1px 边框线、2px 指示条、焦点环），不参与缩放——缩放只会带来亚像素模糊 */
export const MIN_SCALABLE_PX = 2
/** 药丸圆角（≥999px）表达「尽可能圆」，与尺寸无关，不参与缩放 */
export const MAX_SCALABLE_PX = 999

/**
 * a11y 触控热区豁免标记：声明的前置注释含 `a11y-target` 时该声明不参与缩放。
 * 依据 WCAG 2.5.8：触控目标 ≥24 CSS px 是**实际渲染值**——热区若走 `calc(Npx * var(--vcl-scale))`，
 * 窄屏地板 0.75 时只剩 18px，可达性失效；故热区尺寸必须是固定 24px。
 * 写法（标记注释须与声明同块且紧邻其前，「标记注释」按普通块注释正常闭合）：
 *   /* a11y-target：热区固定 24px，此注释右端正常闭合
 *   width: 24px;
 * 闸口与迁移器同源跳过（迁移幂等：--write 不会改写热区声明）。
 */
export const A11Y_TARGET_MARK = 'a11y-target'

/** 判断声明位置之前、同一规则块内的注释是否带 a11y-target 标记 */
function hasA11yTargetMark(text, declIndex) {
  const start = Math.max(0, declIndex - 240)
  const back = text.slice(start, declIndex)
  const blockStart = Math.max(back.lastIndexOf('}'), 0)
  return back.slice(blockStart).includes(A11Y_TARGET_MARK)
}

export const PX_RE = /^-?\d+(?:\.\d+)?px/

/** 紧随 px 之后的缩放乘法：用于识别已迁移 token，保证迁移器二次运行幂等 */
const SCALE_MUL_RE = /^\s*\*\s*var\(--vcl-scale\)/

/** 判断一个属性名是否参与缩放（含自定义属性 --x，由调用方决定是否启用） */
export function isScalableProp(prop, { allowCustomProps = false } = {}) {
  if (allowCustomProps && prop.startsWith('--')) return true
  return SCALABLE_PROPS.has(prop)
}

/** 旧插值形态：`clamp(Apx, calc(Apx + var(--vcl-fit) * Δ), Bpx)` → `calc(Bpx * var(--vcl-scale))`（Δ 可省略） */
const FIT_CLAMP_RE =
  /clamp\(\s*(-?[\d.]+)px\s*,\s*calc\(\s*(-?[\d.]+)px\s*\+\s*var\(--vcl-fit\)\s*(?:\*\s*(-?[\d.]+))?\s*\)\s*,\s*(-?[\d.]+)px\s*\)/g

/** vw 旧曲线：`clamp(Apx, Bvw, Cpx)`（三段纯 px/vw）→ `calc(Cpx * var(--vcl-scale))` */
const VW_CLAMP_RE = /clamp\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)vw\s*,\s*(-?[\d.]+)px\s*\)/g

/** vw 旧曲线（末段是令牌）：`clamp(Apx, Bvw, var(--space-N))` → `var(--space-N)`；
    令牌自身已带缩放，再包一层会双重缩放 */
const VW_CLAMP_TOKEN_RE = /clamp\(\s*-?[\d.]+px\s*,\s*-?[\d.]+vw\s*,\s*(var\(--(?:space|fs|radius)-[\w-]+\))\s*\)/g

/** vw 旧曲线（首段是令牌）：`clamp(var(--space-N), Bvw, Cpx)` → `calc(Cpx * var(--vcl-scale))` */
const VW_CLAMP_TOKEN_MIN_RE = /clamp\(\s*var\(--(?:space|fs|radius)-[\w-]+\)\s*,\s*-?[\d.]+vw\s*,\s*(-?[\d.]+)px\s*\)/g

/** 内联旧除式：`clamp(Apx, calc(Apx + (100vw - 1024px) / 896 * Δ), Bpx)` → `calc(Bpx * var(--vcl-scale))` */
const INLINE_DIV_CLAMP_RE =
  /clamp\(\s*(-?[\d.]+)px\s*,\s*calc\(\s*-?[\d.]+px\s*\+\s*\(100vw\s*-\s*1024px\)\s*\/\s*896\s*(?:\*\s*[\d.]+)?\s*\)\s*,\s*(-?[\d.]+)px\s*\)/g

/** 收敛两条 vw/inline 旧曲线，返回替换后的值 */
function collapseLegacyCurves(value) {
  return value
    .replace(INLINE_DIV_CLAMP_RE, (_m, _lo, hi) => `calc(${hi}px * ${SCALE_REF})`)
    .replace(VW_CLAMP_TOKEN_RE, (_m, token) => token)
    .replace(VW_CLAMP_TOKEN_MIN_RE, (_m, hi) => `calc(${hi}px * ${SCALE_REF})`)
    .replace(VW_CLAMP_RE, (_m, _lo, _vw, hi) => `calc(${hi}px * ${SCALE_REF})`)
}

/**
 * 逐 px 令牌替换：|v| > 2 且 < 999 的 px → `vpx * var(--vcl-scale)`。
 * 在 calc/min/max/clamp 内直接内嵌；在 var()/env() 内或裸位置包一层 calc——
 * var 的 fallback 不经 calc 求值，只有包上才在替换后仍是合法长度。
 */
function scalePxTokens(value) {
  let out = ''
  const stack = []
  let i = 0
  let changed = false
  while (i < value.length) {
    const rest = value.slice(i)
    const px = PX_RE.exec(rest)
    if (px) {
      const raw = px[0]
      const abs = Math.abs(parseFloat(raw))
      // 已是缩放形态（clamp 重写产物或二次跑）：`Npx * var(--vcl-scale)` 原样保留，保证幂等
      const scaledAlready = SCALE_MUL_RE.test(rest.slice(raw.length))
      if (scaledAlready || abs <= MIN_SCALABLE_PX || abs >= MAX_SCALABLE_PX) {
        out += raw
      } else if (stack.includes('expr')) {
        out += `${raw} * ${SCALE_REF}`
        changed = true
      } else {
        out += `calc(${raw} * ${SCALE_REF})`
        changed = true
      }
      i += raw.length
      continue
    }
    const ident = /^[a-zA-Z-][a-zA-Z0-9-]*/.exec(rest)
    if (ident) {
      const name = ident[0]
      out += name
      let j = i + name.length
      if (value[j] === '(') {
        stack.push(EXPR_FNS.has(name.toLowerCase()) ? 'expr' : 'other')
        out += '('
        j++
      }
      i = j
      continue
    }
    if (value[i] === ')') stack.pop()
    out += value[i]
    i++
  }
  return { value: out, changed }
}

/**
 * 把一个 CSS 值换算成缩放引用。返回 { value, changed, fitLeftover }：
 * fitLeftover 表示仍有 --vcl-fit 引用未被收敛（非标准形态，需人工处理）。
 */
export function transformValue(input) {
  let value = input
  value = value.replace(FIT_CLAMP_RE, (_m, _lo, _base, _delta, hi) => `calc(${hi}px * ${SCALE_REF})`)
  value = collapseLegacyCurves(value)
  const final = /\dpx/.test(value) ? scalePxTokens(value).value : value
  return { value: final, changed: final !== input, fitLeftover: final.includes('var(--vcl-fit)') }
}

/** 声明扫描：`属性名: 值`；`@media (max-width: 767px)` 这类查询参数前缀不是 `{;`/行首，天然被排除 */
const DECL_RE = /(^|[;{}]\s*|[\r\n]\s*)(-{0,2}[a-zA-Z][-a-zA-Z0-9]*)\s*:\s*([^;{}\r\n]+)/g

/**
 * 把一段声明文本（CSS 全文或 inline style 串）整体迁移到缩放体系。
 * 返回 { text, count }：count 为改动的声明数；已是缩放形态的声明跳过（幂等）。
 */
export function applyToText(text, { allowCustomProps = false } = {}) {
  let count = 0
  const out = text.replace(DECL_RE, (m, pre, prop, raw) => {
    if (!isScalableProp(prop.toLowerCase(), { allowCustomProps })) return m
    if (!/\dpx/.test(raw)) return m
    if (raw.includes(SCALE_REF) && !raw.includes('var(--vcl-fit)')) return m
    const { value, changed } = transformValue(raw)
    if (!changed) return m
    count++
    return `${pre}${prop}: ${value.trim()}`
  })
  return { text: out, count }
}

/**
 * 扫描一段声明文本，返回需要迁移/违规的声明（只读，供闸口与报告使用）。
 */
export function scanDeclarations(text, { allowCustomProps = false } = {}) {
  const hits = []
  DECL_RE.lastIndex = 0 // 模块级正则复用：exec 循环前必须复位，否则接着上次游标扫
  let m
  while ((m = DECL_RE.exec(text)) !== null) {
    const prop = m[2].toLowerCase()
    if (!isScalableProp(prop, { allowCustomProps })) continue
    if (hasA11yTargetMark(text, m.index)) continue // a11y 热区固定 24px，闸口与迁移器同源跳过
    const raw = m[3]
    if (!/\dpx/.test(raw)) continue
    if (raw.includes(SCALE_REF) && !raw.includes('var(--vcl-fit)')) continue
    const { value, changed, fitLeftover } = transformValue(raw)
    if (!changed && !fitLeftover) continue
    hits.push({ prop, raw: raw.trim(), next: value.trim(), fitLeftover })
  }
  return hits
}
