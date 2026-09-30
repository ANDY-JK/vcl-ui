// 主题适配护栏：拦截组件样式中的硬编码颜色（必须走 CSS 变量令牌）
//
// 背景（同类缺陷已出现两次）：
//   ① 设计令牌断档 —— var() 引用未声明令牌会静默失效；
//   ② DataTable 表内硬编码 #e8f5e9 / #fff8e1 等**亮色专有色**，暗色主题下变成
//      「浅底 + 浅字」，实测对比度低至 1.07（等同看不见内容）。
//
// 范围（2026-09-17 第二轮扩展）：`src/components/**` 全组件层纳入断言；
// demo 层（src/demos/**）另约 60 处历史硬编码，属独立事项，用 SCAN_ALL=1 盘点。
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = join(import.meta.dirname, '..', '..')
const SRC = join(ROOT, 'src')

/** 受断言约束的范围：全组件层（demos 由 SCAN_ALL 盘点） */
const GUARDED_PREFIXES = ['components/']

/**
 * 允许硬编码的场景（白名单）：这些颜色**不随主题变化**，是刻意固定的。
 * 每条都写明理由；判定范围限定「文件 + 选择器」，避免整文件放行。
 */
const ALLOWED: { file: string; selector: string; reason: string }[] = [
  {
    file: 'data-table-scoped.css',
    selector: 'lightbox',
    reason: '全屏图片灯箱：恒渲染在近黑遮罩之上，控件白色正确且与主题无关',
  },
  {
    file: 'data-table-global.css',
    selector: 'dt-cell-tooltip',
    reason: '.dt-cell-tooltip 底色用 --vcl-color-sidebar，该令牌两套主题下都是深色（#1a1f2e/#0f1115），故白字恒正确',
  },
  {
    file: 'Tree.vue',
    selector: 'tree-check-box',
    reason: '复选框白色勾线画在 --vcl-color-primary 蓝底之上，与主题无关',
  },
  {
    file: 'CameraCapture.vue',
    selector: 'camc-shutter',
    reason: '相机快门白圈：相机界面恒为深色取景底，白色是正确表达',
  },
  {
    file: 'ImagePreview.vue',
    selector: 'lightbox',
    reason: '图片预览光箱：恒在近黑遮罩上，白色控件正确',
  },
  {
    file: 'code-capture.css',
    selector: 'gradient',
    reason: '扫码浮层渐变卡：浮层恒为深色渐变底，其上的白色文字正确',
  },
]

/** 颜色字面量：3/4/6/8 位 hex，或 rgb()/rgba() 带数字 */
const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d/gi
/** 仅在「颜色属性」上判定，避免误伤注释、字体名、选择器里的数字 */
const COLOR_PROP_RE =
  /(background|background-color|color|border(?:-[a-z]+)?-color|outline-color|box-shadow|fill|stroke|text-shadow)\s*:/i

/**
 * 允许「暗色块不覆写」的颜色令牌（每条都写明理由，避免豁免变成垃圾桶）：
 * - 派生型：值本身由其它令牌计算得出，父令牌一换就跟着换，无需重复声明
 * - 固定型：刻意不随主题变化
 */
const DARK_EXEMPT: { name: string; reason: string }[] = [
  { name: '--vcl-color-primary-bg', reason: '派生自 --vcl-color-primary-rgb（rgba(var(...), .08)），父令牌已覆写' },
  { name: '--vcl-color-badge-ring', reason: '派生自 --vcl-color-surface，父令牌已覆写' },
  { name: '--vcl-color-bg-inverse', reason: '刻意固定反色（源码注明「固定反色，不随主题」），用于深底浮层' },
  { name: '--vcl-color-text-inverse', reason: '与 --vcl-color-bg-inverse 配对的固定白字，不随主题' },
]

interface Hit {
  file: string
  line: number
  text: string
  selector: string
  reason: string
}

/** 解析 #hex / rgb() / rgba() → {r,g,b,a} */
function parseColor(v: string): { r: number; g: number; b: number; a: number } | null {
  let m = v.match(/^#([0-9a-fA-F]{6})\b/)
  if (m) {
    const n = parseInt(m[1], 16)
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
  }
  m = v.match(/^#([0-9a-fA-F]{3})\b/)
  if (m) {
    const [r, g, b] = m[1].split('')
    return { r: parseInt(r + r, 16), g: parseInt(g + g, 16), b: parseInt(b + b, 16), a: 1 }
  }
  m = v.match(/^rgba?\(([^)]+)\)/)
  if (m) {
    const p = m[1].split(',').map((x) => parseFloat(x.trim()))
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
  }
  return null
}

/** 相对亮度 0-1（WCAG 公式） */
function luminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const f = (v: number) => {
    v /= 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/**
 * 判定规则 —— 只拦**真正会「看不见」**的两类（本护栏的实测依据）：
 *   A. 不透明浅色**背景**（L > 0.6）→ 暗色主题下浅底 + 浅字
 *   B. 不透明深色**文字**（L < 0.25）→ 暗色主题下深字 + 深底
 *
 * 刻意**不拦**（否则会淹没真问题、无法通过 CI）：
 *   · 半透明色（a < 0.9）：遮罩 / hover 叠加 / 阴影等，叠加后与主题相容
 *     （如 rgba(0,0,0,.45) 遮罩、rgba(255,255,255,.15) 悬浮层）
 *   · 深色底 / 浅色字（L 反向）—— 暗色主题下同样成立
 *   · var(--token, #fallback) 的兜底值
 *   · 深色场景选择器（光箱 / 取景器 / 渐变浮层）内的任意色
 */
const DARK_CONTEXT_RE =
  /lightbox|preview-mask|preview-|camc-|codecap-|gradient|overlay|backdrop|scrim|offline|toast|viewer|carousel|mask|shutter|frozen-badge|thumb-?bar|zoombar|anno-|toolbar-dark/i

function scan(files: string[]): Hit[] {
  const hits: Hit[] = []
  for (const rel of files) {
    const file = join(SRC, rel)
    let text: string
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    let selector = ''
    text.split('\n').forEach((line, i) => {
      if (/^\s*(\/\/|\/\*|\*)/.test(line)) return
      if (/\{\s*$/.test(line) && !COLOR_PROP_RE.test(line)) selector = line.trim()
      if (!COLOR_PROP_RE.test(line)) return
      if (!COLOR_RE.test(line)) return
      COLOR_RE.lastIndex = 0
      // JS/TS 里的颜色字面量（值带引号，如 color: '#3b82f6'）不是 CSS 声明 —— 常为图表系列色、
      // 统计卡配色等**数据**，由使用方有意指定，不随主题；跳过
      if (/\bcolor\s*:\s*['"]/.test(line)) return
      // 兜底值放行
      if (/var\(\s*--[^)]*,\s*#[0-9a-fA-F]{3,8}\s*\)/i.test(line)) return
      // 深色场景（光箱/取景器/渐变浮层）内不判
      const hay = `${rel} ${selector}`
      if (DARK_CONTEXT_RE.test(hay)) return
      if (
        ALLOWED.some(
          (a) =>
            hay.toLowerCase().includes(a.file.toLowerCase()) && hay.toLowerCase().includes(a.selector.toLowerCase()),
        )
      )
        return

      const prop = (line.match(COLOR_PROP_RE) || [''])[0].replace(':', '').trim().toLowerCase()
      const isBg = /^background/.test(prop)
      const isFg = /^color$/.test(prop)
      if (!isBg && !isFg) return // border / box-shadow / fill 等不判

      for (const raw of line.match(COLOR_RE) || []) {
        const c = parseColor(raw)
        if (!c || c.a < 0.9) continue // 半透明：叠加后相容，不判
        const L = luminance(c)
        if (isBg && L > 0.6) {
          hits.push({
            file: rel,
            line: i + 1,
            text: line.trim(),
            selector,
            reason: `不透明浅底(${raw}, 亮度${L.toFixed(2)}) 在暗色主题下会变成白底`,
          })
        } else if (isFg && L < 0.25) {
          hits.push({
            file: rel,
            line: i + 1,
            text: line.trim(),
            selector,
            reason: `不透明深字(${raw}, 亮度${L.toFixed(2)}) 在暗色主题下会看不见`,
          })
        }
      }
    })
  }
  return hits
}

describe('主题适配护栏 · 组件样式禁止硬编码颜色', () => {
  it('组件层样式不出现硬编码色值（令牌兜底值与白名单除外）', () => {
    // 收集组件层文件
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === 'dist') continue
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(css|vue)$/.test(name)) {
          const rel = relative(SRC, p).replace(/\\/g, '/')
          if (GUARDED_PREFIXES.some((pre) => rel.startsWith(pre))) files.push(rel)
        }
      }
    }
    walk(SRC)

    const hits = scan(files)
    if (hits.length) {
      throw new Error(
        `发现 ${hits.length} 处硬编码颜色 —— 应改用 CSS 变量令牌（如 var(--vcl-color-success-bg)），` +
          `否则暗色主题下可能出现「浅底 + 浅字」不可见。` +
          `确属刻意固定（如深色遮罩上的白字）请登记到 ALLOWED 并写明理由：\n` +
          hits.map((h) => `  · ${h.file}:${h.line}  ${h.text.slice(0, 88)}`).join('\n'),
      )
    }
    expect(hits).toEqual([])
  })

  it('需要时可用 SCAN_ALL=1 做全库盘点（不参与默认断言）', () => {
    if (!process.env.SCAN_ALL) return // 默认跳过：全库盘点按需运行
    const all: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === 'dist') continue
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(css|vue)$/.test(name)) all.push(relative(SRC, p).replace(/\\/g, '/'))
      }
    }
    walk(SRC)
    const hits = scan(all)
    const byFile = new Map<string, number>()
    for (const h of hits) byFile.set(h.file, (byFile.get(h.file) ?? 0) + 1)
    const top = [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
    // 全库盘点只报告，不做断言（历史债不阻塞 CI）
    console.log(`[全库硬编码色值盘点] 共 ${hits.length} 处，涉及 ${byFile.size} 个文件。Top:`)
    for (const [f, n] of top) console.log(`  ${n.toString().padStart(4)}  ${f}`)
    expect(hits.length).toBeGreaterThan(0)
  })

  it('亮色与暗色的颜色令牌集合必须一致（两套暗色块也要一致）', () => {
    const tokens = readFileSync(join(SRC, 'components', 'tokens.css'), 'utf8')
    const namesIn = (block: string) => {
      const set = new Set<string>()
      for (const m of block.matchAll(/(--[a-z0-9-]+)\s*:/gi)) set.add(m[1])
      return set
    }
    // :root 亮色块 = 文件开头到第一个 `\n}`；两套暗色块按各自选择器定位
    const light = tokens.match(/:root\s*\{([\s\S]*?)\n\}/)
    const darkAttr = tokens.match(/:root\[data-theme=['"]dark['"]\]\s*\{([\s\S]*?)\n\}/)
    expect(light, '未找到 :root 亮色令牌块').toBeTruthy()
    expect(darkAttr, "未找到 :root[data-theme='dark'] 暗色块").toBeTruthy()

    const lightSet = namesIn(light![1])
    const darkSet = namesIn(darkAttr![1])

    // 暗色块必须覆盖亮色声明的**所有颜色令牌**，否则暗色下会残留亮色值
    const exemptNames = new Set(DARK_EXEMPT.map((e) => e.name))
    const missing = [...lightSet].filter((n) => /^--color-/.test(n) && !darkSet.has(n) && !exemptNames.has(n))
    expect(
      missing,
      `暗色块未覆写这些颜色令牌，暗色下会残留亮色值` +
        `（确认确为遗漏后补进暗色块；若属派生/固定值，请登记到 DARK_EXEMPT 并写明理由）：\n  ${missing.join('\n  ')}`,
    ).toEqual([])

    // 豁免清单不得含「暗色块其实已覆写」或「已不存在」的令牌，避免豁免腐化成垃圾桶
    const stale = DARK_EXEMPT.filter((e) => darkSet.has(e.name) || !lightSet.has(e.name)).map((e) => e.name)
    expect(stale, `DARK_EXEMPT 中这些令牌已无需豁免（暗色已覆写或令牌已不存在），请移除：${stale.join(', ')}`).toEqual(
      [],
    )
  })
})

// ==================== 实心语义色 × 白字对比度 ====================
// 背景：暗色主题会把 --color-{primary,success,warning,danger} 提亮（供深底上当文字/图标用），
// 拿它们做**实心底再压白色文字**就不可读 —— 实测暗色下白字对比度
// primary 3.17 / danger 2.77 / success 1.92 / warning 1.67，全部低于 4.5。
// 故实心底必须走 --color-*-solid 专用令牌。本用例守住这条约束。
describe('主题适配护栏 · 实心语义底色与白字对比度', () => {
  const SOLID_PAIRS: { name: string; solid: string }[] = [
    { name: 'danger', solid: '--vcl-color-danger-solid' },
    { name: 'warning', solid: '--vcl-color-warning-solid' },
    { name: 'success', solid: '--vcl-color-success-solid' },
  ]

  /** 从 tokens.css 的一个块里取某个自定义属性的值。
   *  ⚠️ 不用 new RegExp 拼接（属性名含 `-` 与转义易错）：改为逐行扫描。 */
  function readToken(block: string, name: string): string | null {
    for (const line of block.split(String.fromCharCode(10))) {
      const trimmed = line.trim()
      if (!trimmed.startsWith(`${name}:`)) continue
      const m = trimmed.match(/#[0-9a-fA-F]{3,8}/)
      if (m) return m[0]
    }
    return null
  }

  function contrastWithWhite(hex: string): number {
    const n = parseInt(hex.slice(1), 16)
    const rgb = { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
    const f = (v: number) => {
      v /= 255
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    }
    const l = 0.2126 * f(rgb.r) + 0.7152 * f(rgb.g) + 0.0722 * f(rgb.b)
    return (1.0 + 0.05) / (l + 0.05)
  }

  it('两套主题下 solid 令牌与白字的对比度均达标（≥4.5）', () => {
    const tokens = readFileSync(join(SRC, 'components', 'tokens.css'), 'utf8')
    /** 按锚点取一个 CSS 块的内容（取到「行首仅空格 + }」为止，不依赖精确缩进） */
    const blockFrom = (anchorRe: RegExp): string => {
      const m = tokens.match(anchorRe)
      if (!m || m.index === undefined) return ''
      const rest = tokens.slice(m.index + m[0].length)
      const end = rest.search(/\n\s*\}/)
      return end >= 0 ? rest.slice(0, end) : rest
    }
    const light = blockFrom(/:root\s*\{/)
    const darkAttr = blockFrom(/:root\[data-theme=['"]dark['"]\]\s*\{/)
    const darkMedia = blockFrom(/:root:not\(\[data-theme\]\)\s*\{/)
    expect(light.length, '未取到 :root 亮色块').toBeGreaterThan(0)
    expect(darkAttr.length, "未取到 :root[data-theme='dark'] 块").toBeGreaterThan(0)
    expect(darkMedia.length, '未取到 @media 暗色块').toBeGreaterThan(0)

    const problems: string[] = []
    for (const [themeName, block] of [
      ['light', light],
      ['dark([data-theme])', darkAttr],
      ['dark(@media)', darkMedia],
    ] as const) {
      for (const p of SOLID_PAIRS) {
        const hex = readToken(block, p.solid)
        if (!hex) {
          problems.push(`${themeName} 缺少 ${p.solid} 声明（实心底压白字必须有专用值）`)
          continue
        }
        const c = contrastWithWhite(hex)
        if (c < 4.5) problems.push(`${themeName} ${p.solid}=${hex} 与白字对比度仅 ${c.toFixed(2)}（需 ≥4.5）`)
      }
    }
    expect(problems, problems.join('\n')).toEqual([])
  })
})

// ==================== 表格「可编辑/只读」分色规则 ====================
// 规则（用户明确要求）：颜色表达「这个格能不能改」——
//   蓝 = 只读/行选择等纯选中语义；紫 = 可编辑（含编辑中、填充、可下拉）。
// 曾把**所有**选中统一改成紫色 → 失去区分能力，被用户判为「搞错了」。
// 本用例锁住分色方向，防止回退成「一律同色」。
describe('主题适配护栏 · 表格选中按可编辑性分色', () => {
  const scoped = readFileSync(join(SRC, 'components', 'data', 'composables', 'data-table-scoped.css'), 'utf8')

  /** 取某选择器规则块的声明文本。
   *  ⚠️ 不能只用 indexOf(selector)：`td.cell-selected {` 与 `td.cell-selected:not(...)` 会互相干扰，
   *  故用带边界的选择器正则定位。 */
  function ruleBody(selector: string): string | null {
    const re = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{')
    const m = re.exec(scoped)
    if (!m) return null
    const start = m.index + m[0].length
    const end = scoped.indexOf('}', start)
    return end < 0 ? null : scoped.slice(start, end)
  }

  /** 取规则体里某个属性的值（用于精确断言，避免被同块内其它属性里的同名字符串蒙混） */
  function propValue(body: string, prop: string): string | null {
    const m = body.match(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;]+);`))
    return m ? m[1].trim() : null
  }

  it('只读单元格选中用品牌蓝，可编辑单元格选中用 --vcl-dt-select', () => {
    const base = ruleBody('td.cell-selected')
    expect(base, '未找到 td.cell-selected 规则').toBeTruthy()
    // 基础规则（即只读场景）的描边必须是品牌蓝 —— 精确到 outline 属性，
    // 否则同块 background 里的 --vcl-color-primary-rgb 会掩盖「outline 被改成紫色」的回退
    const outline = propValue(base!, 'outline') ?? ''
    expect(outline, 'td.cell-selected 的 outline 应为品牌蓝（只读场景），不应改成紫色').toContain(
      'var(--vcl-color-primary)',
    )
    expect(outline, 'td.cell-selected 的 outline 不应使用 --vcl-dt-select').not.toContain('--vcl-dt-select')

    const editable = ruleBody('td.cell-selected:not(.cell-readonly)')
    expect(editable, '缺少可编辑单元格选中规则（应通过 :not(.cell-readonly) 覆盖为紫色）').toBeTruthy()
    const edOutline = propValue(editable!, 'outline-color') ?? ''
    expect(edOutline, '可编辑单元格选中应使用 --vcl-dt-select').toContain('--vcl-dt-select')
  })

  it('行级选中（勾选/标记）用品牌蓝，不与可编辑态混色', () => {
    for (const sel of ['tr.row-selected td', 'tr.row-clicked td']) {
      const body = ruleBody(sel)
      expect(body, `未找到 ${sel}`).toBeTruthy()
      const bg = propValue(body!, 'background') ?? ''
      expect(bg, `${sel} 属行选择语义，应为品牌蓝而非 --vcl-dt-select`).toContain('--vcl-color-primary')
      expect(bg, `${sel} 不应使用 --vcl-dt-select`).not.toContain('--vcl-dt-select')
    }
  })

  it('可编辑语义（编辑中/填充/手柄）一律用 --vcl-dt-select', () => {
    const editableSelectors = ['td.cell-editing', 'td.cell-fill-preview', '.cell-fill-handle']
    for (const sel of editableSelectors) {
      const body = ruleBody(sel)
      expect(body, `未找到 ${sel} 规则`).toBeTruthy()
      expect(body, `${sel} 属可编辑语义，应使用 --vcl-dt-select`).toContain('--vcl-dt-select')
    }
  })

  it('下拉面板保持品牌蓝，不参与「可编辑=紫」分色', () => {
    // 用户明确要求「下拉不要改颜色」：下拉是统一的交互组件，配色不随单元格状态变化
    for (const sel of ['.opt-drop-item.active', '.opt-drop-item:hover', '.opt-drop-check']) {
      const body = ruleBody(sel)
      expect(body, `未找到 ${sel} 规则`).toBeTruthy()
      expect(body, `${sel} 应使用品牌蓝`).toContain('--vcl-color-primary')
      expect(body, `${sel} 不应使用 --vcl-dt-select（下拉不改色）`).not.toContain('--vcl-dt-select')
    }
  })

  it('不可编辑的 options 列不渲染任何「可下拉」暗示', () => {
    // 规则：箭头指示器与 cell-has-options（cursor:pointer）都由 isOptionDroppable(col) 决定，
    // 即「能点」与「看起来能点」必须一致。
    const dt = readFileSync(join(SRC, 'components', 'data', 'DataTable.vue'), 'utf8')

    // ① 判定函数存在且语义正确（整表 editable + 列未禁用）
    //  ⚠️ 签名可能跨行（含类型谓词），故用宽松定位 + 取到函数体再断言
    //  （M3 第十刀后 isOptionDroppable 下沉至 useTableCellMenus.ts，模板消费仍在 DataTable.vue）
    const menusSrc = readFileSync(join(SRC, 'components', 'data', 'composables', 'useTableCellMenus.ts'), 'utf8')
    const fnIdx = menusSrc.indexOf('function isOptionDroppable')
    expect(fnIdx, '缺少 isOptionDroppable 判定函数').toBeGreaterThan(-1)
    const fnEnd = menusSrc.indexOf('\n}', fnIdx)
    const fnBlock = menusSrc.slice(fnIdx, fnEnd > fnIdx ? fnEnd : undefined)
    expect(fnBlock, 'isOptionDroppable 应要求 col.options').toContain('col.options')
    expect(fnBlock, 'isOptionDroppable 应要求整表 editable').toContain('props.editable')
    expect(fnBlock, 'isOptionDroppable 应排除列级 editable:false').toContain('col.editable !== false')

    // ② 箭头指示器由该判定渲染（不是裸 col.options）
    expect(dt, '下拉箭头应改为由 isOptionDroppable 决定，否则不可编辑列仍显示箭头').toMatch(
      /v-if="isOptionDroppable\(col\)"[\s\S]{0,80}cell-options-arrow/,
    )
    expect(dt, '下拉箭头不应再由裸 col.options 渲染').not.toMatch(/v-if="col\.options"[\s\S]{0,60}cell-options-arrow/)

    // ③ cell-has-options（cursor:pointer）同理
    expect(dt, 'cell-has-options 应绑定 isOptionDroppable(col)').toContain("'cell-has-options': isOptionDroppable(col)")
    expect(dt, 'cell-has-options 不应再由裸 col.options 绑定').not.toContain("'cell-has-options': col.options")
  })
})
