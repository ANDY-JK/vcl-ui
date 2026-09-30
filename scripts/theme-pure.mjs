/**
 * 主题定制纯函数（浏览器安全，无 node 依赖）——CLI（gen-theme.mjs）与 demo 可视化配置层
 * （src/demos/theme/ThemeEditorDemo.vue）共用一份逻辑，避免双拷贝漂移。
 * 类型声明见同目录 theme-pure.d.mts。
 */

/** 从 tokens.css 文本提取声明集：任意位置的 `--name:` 声明（:root/暗色/media 各块均带缩进，
 *  不能按行首匹配；取并集即合法令牌全集） */
export function parseTokenNames(cssText) {
  const names = new Set()
  for (const m of cssText.matchAll(/--([a-z][a-z0-9-]*)\s*:/g)) names.add('--' + m[1])
  return names
}

/** 近似候选（编辑距离 ≤2 的令牌名，防打错拼写） */
export function suggestTokens(name, tokenNames, limit = 5) {
  const target = name.toLowerCase()
  const out = []
  for (const t of tokenNames) {
    if (!t.startsWith('--')) continue
    const d = editDistance(target, t)
    if (d <= 2) out.push([d, t])
  }
  out.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]))
  return out.slice(0, limit).map(([_d, t]) => t)
}

function editDistance(a, b) {
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  // dp[i][j] = 前 i 个字符与前 j 个字符的距离；基线 dp[i][0]=i、dp[0][j]=j
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    new Array(n + 1).fill(0).map((_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
  }
  return dp[m][n]
}

/** 校验配置：返回 { errors, normalized }。errors 非空即非法。
 *  规则：① 结构必须是 { light?, dark? } 且各为 对象；② 键必须是 --name 形式；
 *  ③ 令牌名 ∈ 声明集（给近似候选）；④ 值：非空字符串、无 `;{}"` 注入字符。 */
export function validateThemeConfig(config, tokenNames) {
  const errors = []
  const normalized = { light: {}, dark: {} }
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    errors.push('配置根必须是对象 { "light": {...}, "dark": {...} }')
    return { errors, normalized }
  }
  for (const block of ['light', 'dark']) {
    if (config[block] === undefined) continue
    if (typeof config[block] !== 'object' || config[block] === null || Array.isArray(config[block])) {
      errors.push(`${block} 块必须是「令牌名 → 值」对象，实际是 ${typeof config[block]}`)
      continue
    }
    for (const [name, value] of Object.entries(config[block])) {
      if (!/^--[a-z][a-z0-9-]*$/.test(name)) {
        errors.push(`「${name}」不是合法令牌名（须 --kebab-case 小写）`)
        continue
      }
      if (!tokenNames.has(name)) {
        const near = suggestTokens(name, tokenNames)
        errors.push(
          `「${name}」未在 tokens.css 声明${near.length ? `（相近：${near.join('、')}）` : ''}——打错的令牌 var() 会静默失效`,
        )
        continue
      }
      if (typeof value !== 'string' || !value.trim()) {
        errors.push(`「${name}」的值必须是非空字符串`)
        continue
      }
      if (/[;{}"]/u.test(value)) {
        errors.push(`「${name}」的值含 ;{}" 注入字符，拒绝生成`)
        continue
      }
      normalized[block][name] = value.trim()
    }
  }
  return { errors, normalized }
}

/** 渲染主题 CSS：light → :root；dark → :root[data-theme='dark']（暗色块与库的暗色块同特异性靠后覆盖）。
 *  header 默认通用（纯函数不写死调用方路径；CLI/编辑器各自按需传入） */
export function renderThemeCss(
  normalized,
  header = '/* vcl-ui theme override — 由主题工具生成，勿手改（改配置重新生成） */',
) {
  const lines = [header]
  const seg = (sel, vars) => {
    if (!Object.keys(vars).length) return []
    return [`${sel} {`, ...Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`), '}']
  }
  lines.push(...seg(':root', normalized.light))
  lines.push(...seg(":root[data-theme='dark']", normalized.dark))
  if (lines.length === 1) lines.push('/* 空主题：light/dark 均未配置 */')
  return lines.join('\n') + '\n'
}

// ---------- 可视化配置层（demo 编辑器）用：分组 / 当前值 / 颜色判定 ----------

/** 编辑分组（只读组：断点/z-index 改了对组件行为有连锁反应，展示但禁用） */
export const THEME_GROUPS = [
  { key: 'primary', label: '主色', match: /^--vcl-color-primary/ },
  { key: 'status', label: '状态色', match: /^--vcl-color-(success|warning|danger|info)/ },
  { key: 'neutral', label: '中性 · 文字 · 边框', match: /^--vcl-color-(surface|bg|text|border|badge)/ },
  { key: 'sidebar', label: '侧边栏', match: /^--(vcl-color-sidebar|vcl-sidebar-width)/ },
  { key: 'table', label: '表格选中', match: /^--vcl-dt-select/ },
  { key: 'space', label: '间距（流体）', match: /^--vcl-space-/ },
  { key: 'radius', label: '圆角', match: /^--vcl-radius-/ },
  { key: 'shadow', label: '阴影', match: /^--vcl-shadow-/ },
  { key: 'ctrl', label: '控件度量', match: /^--(vcl-ctrl-|vcl-focus-)/ },
  { key: 'motion', label: '动效', match: /^--vcl-transition-/ },
  { key: 'layout', label: '布局度量', match: /^--(vcl-content-max-width|vcl-bg-secondary)/ },
  { key: 'readonly', label: '只读（断点 / z-index）', match: /^--(vcl-bp-|vcl-z-)/, readOnly: true },
]

/** 令牌按编辑分组归位；未命中任何组的进 other（防未来新增令牌在编辑器里失踪） */
export function groupTokens(tokenNames) {
  const groups = []
  for (const g of THEME_GROUPS) groups.push({ ...g, tokens: [] })
  const other = { key: 'other', label: '其它', match: null, tokens: [] }
  for (const t of [...tokenNames].sort()) {
    const hit = groups.find((g) => g.match && g.match.test(t))
    ;(hit ? hit : other).tokens.push(t)
  }
  return [...groups.filter((g) => g.tokens.length), other.tokens.length ? other : null].filter(Boolean)
}

/** 当前主题判定：html[data-theme='dark'] = 暗色；无属性/light = 亮色（与 tokens.css 的切换契约一致） */
export function currentTheme(doc = typeof document !== 'undefined' ? document : null) {
  if (!doc) return 'light'
  return doc.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

/** 令牌当前解析值（亮/暗各取一次需切 data-theme；此处只读当前态，作输入框初始展示值） */
export function resolvedTokenValues(tokenNames) {
  if (typeof window === 'undefined') return {}
  const cs = window.getComputedStyle(document.documentElement)
  const out = {}
  for (const t of tokenNames) out[t] = (cs.getPropertyValue(t) || '').trim()
  return out
}

/** 值是否可喂原生 <input type=color>（原生取色器只认 #rrggbb/#rrggb；其余记法走文本框——库内铁律同口径） */
export function isNativeColorValue(v) {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test((v || '').trim())
}
