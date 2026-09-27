// 常量与写死值自检（七项判定，任一不过即非零退出）
// 规矩本体写在 README「开发规范」一节，这里只负责把它变成机器能拦的那部分：
// [1] 断点令牌单源一致 —— _internal/breakpoints.ts 的 BP_* 必须与 tokens.css 的 --bp-* 逐个同值，
//     否则「改了令牌、JS 判定没跟着改」会静默分叉（侧栏收起和表格卡片视图就是两个判定）
// [2] JS/TS 里不得出现视口断点字面量 —— 视口宽度比较、matchMedia 宽度查询、*reakpoint 默认值，
//     一律引 breakpoints.ts 的常量
// [3] CSS @media 的宽度值必须落在已登记集合内 —— CSS 侧 var() 进不了 @media，只能写数字，
//     所以改成「登记制」：新增一个没登记过的断点就红，避免断点数量无意识膨胀
// [4] setTimeout/setInterval 的延时位不得写字面量毫秒数 —— 要成本文件内有用途说明的 *_MS 常量
// [5] 会截断文本的类必须登记判定 —— 新增一个 ellipsis 类不判"用户看得见完整值吗"就红
// [6] 原生 <input type="color"> 的值必须经 toNativeColorValue 归一 —— 绕层 computed 的要登记判定
// [7] form-builder 域源文件 ≤800 行 —— 该域交互密、曾靠人工把 979/881 行两文件拆回纪律内；
//     无机械闸口必然回潮（09-04 收官过 ≤800，09-20 复查已漂移）。超限=该抽 composable/子组件了
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const fail = []

const walk = (d, out = []) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) {
      if (!/node_modules|dist|\.git|reports|test-results/.test(p)) walk(p, out)
    } else out.push(p)
  }
  return out
}

const files = walk('src')
const isSource = (f) => /\.(ts|vue)$/.test(f) && !f.endsWith('.d.ts')
const isStyle = (f) => /\.(css|scss)$/.test(f)
const relOf = (x) => relative('.', x).replaceAll('\\', '/')

/** 把 .vue 切成 script / template / style 三类块（每块前面补等量空行，保证行号对得上原文件） */
function splitBlocks(file, text) {
  if (!file.endsWith('.vue')) return [{ kind: 'script', lines: text.split('\n') }]
  const out = []
  const re = /<(script|template|style)\b[^>]*>([\s\S]*?)<\/\1>/g
  let m
  while ((m = re.exec(text))) {
    const before = text.slice(0, m.index)
    // 保留原始行号：把前置内容换成等量空行，报错位置才对得上文件
    const offset = '\n'.repeat((before.match(/\n/g) || []).length)
    out.push({ kind: m[1], lines: (offset + m[2]).split('\n') })
  }
  return out
}

/** 去掉注释，避免注释里提到的数字被当成违规；行注释只在引号左侧没有字符串时剥离 */
function stripComments(lines) {
  const noBlock = lines.join('\n').replace(/\/\*[\s\S]*?\*\//g, (s) => s.replace(/[^\n]/g, ' '))
  return noBlock.split('\n').map((l) => {
    const i = l.indexOf('//')
    if (i < 0) return l
    if (/[:'"`)]\s*\/\//.test(l.slice(0, i + 2))) return l // 协议头 / 字符串里的 //，不剥
    return l.slice(0, i)
  })
}

// ---------- [1] 令牌与 JS 常量同值 ----------
const tokensCss = readFileSync(join('src', 'components', 'tokens.css'), 'utf8')
const cssBp = new Map()
for (const m of tokensCss.matchAll(/--bp-([a-z]+)\s*:\s*(\d+)px/g)) cssBp.set(m[1].toUpperCase(), Number(m[2]))
const bpFile = readFileSync(join('src', 'components', '_internal', 'breakpoints.ts'), 'utf8')
const jsBp = new Map()
for (const m of bpFile.matchAll(/export const BP_([A-Z]+)\s*=\s*(\d+)/g)) jsBp.set(m[1], Number(m[2]))

if (jsBp.size === 0) fail.push('breakpoints.ts 里没有 BP_* 常量，[2] 的约束将无源可依')
for (const [k, v] of cssBp) {
  if (!jsBp.has(k)) fail.push(`tokens.css 有 --bp-${k.toLowerCase()}=${v}px，breakpoints.ts 缺 BP_${k}`)
  else if (jsBp.get(k) !== v) fail.push(`BP_${k}=${jsBp.get(k)} 与 --bp-${k.toLowerCase()}:${v}px 不一致`)
}
for (const [k, v] of jsBp) if (!cssBp.has(k)) fail.push(`breakpoints.ts 有 BP_${k}=${v}，tokens.css 无 --bp-${k.toLowerCase()} 令牌`)
console.log(`[1] 断点令牌一致 css=${cssBp.size} ts=${jsBp.size}`)

// ---------- [2] JS/TS 不得写视口断点字面量 ----------
// 只看「视口」语义：元素自身尺寸（clientWidth/offsetWidth）不在本条范围。
// 关键是别名追踪 —— 实际代码几乎都是 `const w = window.innerWidth` 再 `w < 768`，
// 只匹配 innerWidth 紧邻数字的写法会整类漏掉（AppLayout 改动前就是这种）。
const ALIAS_DECL =
  /(?:const|let|var)\s+(\w+)\s*=\s*(?:window\.)?innerWidth\b|(?<!\.)\b(\w+)\s*=\s*(?:window\.)?innerWidth\b/g
const JS_PATTERNS = [
  { re: /\b(?:window\.)?innerWidth\s*(?:<=|>=|<|>|===|!==)\s*(\d+)\b/g, why: '与视口宽度比较' },
  { re: /\b(\d+)\s*(?:<=|>=|<|>)\s*(?:window\.)?innerWidth\b/g, why: '与视口宽度比较' },
  { re: /matchMedia\(\s*['"`][^'"`]*?(?:max-width|min-width|width)\s*:\s*(\d+)px/g, why: 'matchMedia 宽度查询' },
  {
    re: /\b\w*[Bb]reakpoint\w*\s*:(?!=)\s*(\d+)\b|\b\w*[Bb]reakpoint\w*\s*=(?!=)\s*(\d+)\b/g,
    why: '断点默认值',
  },
]
const jsHits = []
for (const f of files.filter(isSource)) {
  const text = readFileSync(f, 'utf8')
  const rel = relative('.', f).replaceAll('\\', '/')
  if (rel.endsWith('_internal/breakpoints.ts')) continue // 常量本体就在这儿
  for (const b of splitBlocks(f, text, [true, true, false])) {
    if (b.kind !== 'script') continue
    const lines = stripComments(b.lines)
    const aliases = new Set()
    for (const l of lines) for (const m of l.matchAll(ALIAS_DECL)) aliases.add(m[1] || m[2])
    for (const { re, why } of JS_PATTERNS) {
      lines.forEach((l, i) => {
        for (const m of l.matchAll(re)) {
          const num = m.slice(1).find((x) => x !== undefined)
          jsHits.push(`${rel}:${i + 1} ${why}写了字面量 ${num}（改引 BP_SM/BP_MD/BP_LG）`)
        }
      })
    }
    for (const a of aliases) {
      const cmp = new RegExp(`\\b${a}\\s*(?:<=|>=|<|>|===|!==)\\s*(\\d+)\\b|\\b(\\d+)\\s*(?:<=|>=|<|>)\\s*${a}\\b`, 'g')
      lines.forEach((l, i) => {
        for (const m of l.matchAll(cmp)) {
          const num = m[1] ?? m[2]
          jsHits.push(`${rel}:${i + 1} 视口宽度（${a}）比较写了字面量 ${num}（改引 BP_SM/BP_MD/BP_LG）`)
        }
      })
    }
  }
}
if (jsHits.length) fail.push(...jsHits)
console.log(`[2] JS/TS 视口断点字面量 ${jsHits.length}`)

// ---------- [3] CSS @media 宽度值登记制 ----------
// 已登记值 = --bp-* 三个 + 下面这些有明确用途的。新增断点先想清楚能不能复用既有的。
const CSS_EXTRA_BP = new Map([
  [767, 'bp-md 的「小于 768」等价写法：@media 里不能用 var()，只能写 768-1'],
  [480, '登录三页的超窄档（单列输入），刻意早于 --bp-sm'],
  [600, 'demos 表格演示区的内部分区，非库产物样式'],
  [900, 'demos 图表演示区的内部分区，非库产物样式'],
  [1100, 'demos 图表+表格并排区在笔记本屏收成一列，非库产物样式'],
])
const allowed = new Map([...[...cssBp.values()].map((v) => [v, 'tokens.css --bp-*']), ...CSS_EXTRA_BP])
const cssHits = []
const styleTexts = []
for (const f of files) {
  if (!isStyle(f) && !f.endsWith('.vue')) continue
  styleTexts.push([relative('.', f).replaceAll('\\', '/'), readFileSync(f, 'utf8')])
}
for (const [rel, text] of styleTexts) {
  const blocks = splitBlocks(rel, text).filter((b) => b.kind === 'style')
  const scan = blocks.length ? blocks.map((b) => b.lines) : [text.split('\n')]
  for (const lines of scan) {
    lines.forEach((l, i) => {
      for (const m of l.matchAll(/\((?:max|min)-width:\s*(\d+(?:\.\d+)?)px\s*\)/g)) {
        const v = Number(m[1])
        if (!allowed.has(v))
          cssHits.push(`${rel}:${i + 1} @media 宽度 ${v}px 未登记（已登记：${[...allowed.keys()].sort((a, b) => a - b).join('/')}）`)
      }
    })
  }
}
if (cssHits.length) fail.push(...cssHits)
console.log(`[3] CSS 未登记断点 ${cssHits.length}（已登记 ${[...allowed.keys()].sort((a, b) => a - b).join('/')}）`)

// ---------- [5] 会截断文本的类必须登记判定（README 规范第 6 条） ----------
// 凡带 text-overflow: ellipsis 的类，都要在这里给一个判定：
//   title        —— 渲染用户数据，承载它的元素必须绑 :title / title（缺了就红）
//   covered      —— 已有别的完整值通道（表格单元格的 hover 气泡 + 超长展开图标；筛选项的"溢出才挂 title"）
//   not-user-data —— 静态文案 / 数字 / 非文本，本来就没什么可发现的（写清是什么）
// 新增一个截断类而没登记判定 → 红，逼着当场判一次"用户看得见完整值吗"。
// 只管 src/components（库代码）：demo 页的截断样式是页面自己的展示文案，判定由写 demo 的人当场负责。
// covered 三项的完整值通道：.cell-text/.cell-text-inner/.truncated 是 hover 气泡 + 超长换展开图标；
// .dt-filter-option-text 是"溢出才挂 title"的 hover 机制；.dt-col-quick-actions button 两个按钮本就带 :title；
// .combobox-tag / .tree-node-item 是容器，截断发生在其内部已登记的 .tag-text / .item-label 上。
const ELLIPSIS_VERDICTS = new Map([
  ['cl-text', 'title'],
  ['ip-thumb-label', 'title'],
  ['ip-title', 'title'],
  ['tree-node-label', 'title'],
  ['ftc-td-val', 'title'],
  ['ldc-step-btn-label', 'title'],
  ['ldo-tree-label', 'title'],
  ['camc-shot-name', 'title'],
  ['camc-slot-chip', 'title'],
  ['codecap-title', 'title'],
  ['codecap-box-label', 'title'],
  ['codecap-frozen-chip', 'title'],
  ['fl-label', 'title'],
  ['preview-name', 'title'],
  ['tag-text', 'title'],
  ['item-label', 'title'],
  ['upload-file-name', 'title'],
  ['nav-leaf-label', 'title'],
  ['vcl-toolbar-label', 'title'],
  ['vcl-user-name', 'title'],
  ['nav-level-text', 'title'],
  ['menu-item-label', 'title'],
  ['day-cities', 'title'],
  ['store-name', 'title'],
  ['contact', 'title'],
  ['dt-col-title', 'title'],
  ['cell-text', 'covered'],
  ['cell-text-inner', 'covered'],
  ['truncated', 'covered'],
  ['dt-filter-option-text', 'covered'],
  ['dt-col-quick-actions', 'covered'],
  ['combobox-tag', 'covered'],
  ['tree-node-item', 'covered'],
  ['ld-data-table', 'covered'],
  ['ld-data-stat-num', 'not-user-data'],
  ['ldp-field-label', 'not-user-data'],
  ['expand-placeholder', 'not-user-data'],
])
const ellipsisClasses = new Set()
for (const f of files.filter((x) => relOf(x).startsWith('src/components/'))) {
  if (!/\.(css|vue)$/.test(f) || f.endsWith('.d.ts')) continue
  const text = readFileSync(f, 'utf8')
  for (const m of text.matchAll(/([^{}]+)\{[^{}]*text-overflow:\s*ellipsis[^{}]*\}/g)) {
    const selector = m[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim()
    for (const c of selector.matchAll(/\.([A-Za-z][\w-]*)/g)) ellipsisClasses.add(c[1])
  }
}
const unregistered = [...ellipsisClasses].filter((c) => !ELLIPSIS_VERDICTS.has(c)).sort()
if (unregistered.length)
  fail.push(`出现未登记的截断类（先判"用户能不能看到完整值"，再进 ELLIPSIS_VERDICTS）: ${unregistered.join(', ')}`)

// 判定为 title 的类：用到它的那个元素必须带 title 绑定。
// 标签体要按"引号内不算结束"逐字扫描 —— 属性值里合法地出现 > 与 &&（如 v-show="a && b > c"），
// 而正则 [^>]* 会在那里截断；反过来要求 `>` 前有空白又会让普通 class="x"> 完全匹配不上（曾经就是空转）。
function scanTags(text) {
  const tags = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '<' || !/[a-zA-Z]/.test(text[i + 1] || '')) continue
    let j = i + 1
    while (j < text.length && /[\w:.-]/.test(text[j])) j++
    const name = text.slice(i + 1, j)
    let quote = null
    let k = j
    for (; k < text.length; k++) {
      const c = text[k]
      if (quote) {
        if (c === quote) quote = null
        continue
      }
      if (c === '"' || c === "'") quote = c
      else if (c === '>') break
      else if (c === '<') break // 标签没闭合就遇到下一个标签：放弃这个起点
    }
    if (text[k] !== '>') continue
    tags.push({ name, attrs: text.slice(j, k), index: i })
    i = k
  }
  return tags
}

const missingTitle = []
for (const f of files.filter((x) => x.endsWith('.vue'))) {
  const rel = relOf(f)
  if (!rel.startsWith('src/components/')) continue
  const text = readFileSync(f, 'utf8')
  for (const t of scanTags(text)) {
    const cls = /(?:^|\s):?class=["']([^"']*)["']/.exec(t.attrs)
    if (!cls) continue
    const uses = cls[1].split(/\s+/).filter((c) => ELLIPSIS_VERDICTS.get(c) === 'title')
    if (!uses.length) continue
    if (/(?:^|\s):?title=/.test(t.attrs)) continue
    const line = text.slice(0, t.index).split('\n').length
    missingTitle.push(`${rel}:${line} <${t.name}> 用了截断类 .${uses.join('/.')} 却没绑 title`)
  }
}
if (missingTitle.length) fail.push(...missingTitle)
console.log(`[5] 截断类判定 出现=${ellipsisClasses.size} 缺 title=${missingTitle.length}`)

// ---------- [4] 延时位不得写字面量毫秒数 ----------
/**
 * 取 setTimeout/setInterval 的「延时位」实参（第二个位置参数），按括号配对扫描。
 * 不用正则尾匹配 —— 那样 `setTimeout(() => a.foo(1, 2), X)` 会把嵌套调用的 2 误判成延时；
 * 也不取"最后一个实参" —— 那样 `setTimeout(fn, 300, 'x')`（带附加参数）会跳过真正的延时。
 */
function delayArgOf(text, openIdx) {
  let i = openIdx
  let depth = 1
  let inStr = null
  const args = []
  let argStart = i
  for (; i < text.length; i++) {
    const c = text[i]
    if (inStr) {
      if (c === '\\') i++
      else if (c === inStr) inStr = null
      continue
    }
    if (c === '"' || c === "'" || c === '`') inStr = c
    else if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') {
      depth--
      if (depth === 0) break
    } else if (c === ',' && depth === 1) {
      args.push(text.slice(argStart, i))
      argStart = i + 1
    }
  }
  args.push(text.slice(argStart, i))
  return args.length >= 2 ? args[1].trim() : null
}

/**
 * 延时位是否含数字字面量：把标识符（含成员访问/调用）与字符串剔掉，剩下还有数字就算写死。
 * 覆盖 `1e3`、`2_000`、`5 * 600`、`12 * 100` 这类"看着不是纯数字其实写死"的写法。
 */
function hasNumericLiteral(expr) {
  const stripped = expr.replace(/[$A-Z_a-z][\w$]*(?:\s*\.\s*[$A-Z_a-z][\w$]*)*/g, '').replace(/['"`][^'"`]*['"`]/g, '')
  return /\d/.test(stripped)
}

const delayHits = []
// 只管 src/components（对外发布的库代码）：demos 里的延时是给读者看的示例值（"模拟 1.5s 网络"），
// 换成常量反而让示例更难读。
// 已知边界：只管调用里的延时位。三元/默认参数里的时长（如 Toast 的 duration 默认值）不在此条范围，
// 但同样受 README 规范第 7 条约束 —— 见到就该命名，别因为它不红就当它合规。
for (const f of files.filter(isSource).filter((x) => relOf(x).startsWith('src/components/'))) {
  const text = readFileSync(f, 'utf8')
  const rel = relOf(f)
  for (const b of splitBlocks(f, text)) {
    if (b.kind === 'style') continue // script 与 template 都算代码块
    const lines = stripComments(b.lines)
    const joined = lines.join('\n')
    const re = /\b(?:window\.)?(?:setTimeout|setInterval)\s*\(/g
    let m
    while ((m = re.exec(joined))) {
      const arg = delayArgOf(joined, re.lastIndex)
      if (arg === null || !hasNumericLiteral(arg)) continue
      if (/^0$/.test(arg)) continue // 0 = 让出一个任务，不是时长
      const lineNo = joined.slice(0, m.index).split('\n').length
      delayHits.push(`${rel}:${lineNo} 延时写了字面量（${arg.trim()}）—— 改成本文件里有用途说明的 *_MS 常量`)
      re.lastIndex = m.index + 1
    }
  }
}
if (delayHits.length) fail.push(...delayHits)
console.log(`[4] 字面量延时 ${delayHits.length}`)

// ---------- [6] 原生 color 输入的值必须先归一（README 规范第 8 条） ----------
// <input type="color"> 只认 #rrggbb 一种写法：绑 var(--color-primary)、red、#abc、transparent
// 会被浏览器静默拒收 —— 刷 "does not conform to the required format" 警告，取色块退成默认黑
// （IconPicker 的默认色当年就是这个样子，demo 站 icon 页实测 18 条警告）。
// 判定分两档：值绑定里当场写着 toNativeColorValue( 的算自证合规，不登记；
// 绕一层 computed 的要在下面登记「这个类的值是从哪儿归一的」，新增绑定点不登记就红。
// 只管 src/components 的静态模板（与第 [4][5] 条同口径）：
//   —— demos 不引 _internal（全库 0 处），示例页的取色器由写 demo 的人负责，跑挂了由 site-audit 在浏览器里抓；
//   —— h() 渲染函数或 :type 动态绑成 color 的写法本条扫不到，新增取色器请照现有 5 处的静态写法。
// n = 该键下应有的取色器个数，双向对账：多出来（第三条同名 input 绑了裸值）与少了（改名/挪文件）都红，
// 免得登记变成一张没人核对的死表。
const COLOR_VALUE_VERDICTS = new Map([
  [
    'src/components/form/IconPicker.vue :: native-picker',
    {
      n: 2,
      why: 'fgPickerValue / bgPickerValue 走 toNativeColorValue；令牌值按 colorProbeTick 在面板打开时重算',
    },
  ],
  [
    'src/components/form/Input.vue :: f-color',
    { n: 1, why: 'nativeColorValue 走 toNativeColorValue；modelValue 由调用方给，什么 CSS 写法都可能' },
  ],
])
/** 去掉模板注释，避免 <!-- <input type="color"> --> 这种示例片段被算成命中（按行等量留白，行号才对得上） */
function stripHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, (s) => s.replace(/[^\n]/g, ' '))
}
const colorHits = []
const colorSeen = new Map()
let colorSites = 0
for (const f of files.filter((x) => x.endsWith('.vue') && relOf(x).startsWith('src/components/'))) {
  const text = stripHtmlComments(readFileSync(f, 'utf8'))
  const rel = relOf(f)
  for (const t of scanTags(text)) {
    // type 允许等号两侧留空格；值绑定要带修饰符（v-model.number）与 v-bind:value 两种写法，
    // 否则最常见的「换个写法绑值」正好从判定底下溜过去（那是假绿，不是没命中）
    if (t.name !== 'input' || !/\stype\s*=\s*["']color["']/.test(t.attrs)) continue
    colorSites++
    // 没绑值的取色器喂不出非法值；绑了的看绑定表达式本体，别把后面属性里的函数名算成命中
    const vb =
      /\s(?::value|v-bind:value|v-model(?:\.\w+)*|value)\s*=\s*"([^"]*)"|\s(?::value|v-bind:value|v-model(?:\.\w+)*|value)\s*=\s*'([^']*)'/.exec(
        t.attrs,
      )
    if (!vb) continue
    const expr = vb[1] ?? vb[2] ?? ''
    if (/toNativeColorValue\s*\(/.test(expr)) continue
    const cls = /(?:^|\s):?class=["']([^"'\s]*)/.exec(t.attrs)
    const key = `${rel} :: ${cls ? cls[1] : '（该 input 没有 class，登记时先补一个）'}`
    colorSeen.set(key, (colorSeen.get(key) ?? 0) + 1)
    if (!COLOR_VALUE_VERDICTS.has(key)) {
      const line = text.slice(0, t.index).split('\n').length
      colorHits.push(`${rel}:${line} <input type="color"> 的值没走 toNativeColorValue —— 就地归一，或绕层 computed 时登记判定（键：${key}）`)
    }
  }
}
for (const [key, { n }] of COLOR_VALUE_VERDICTS) {
  const got = colorSeen.get(key) ?? 0
  if (got !== n) colorHits.push(`登记与实际对不上：${key} 登记 ${n} 处、实际 ${got} 处（改了 class/挪了文件就要同步这张表）`)
}
// 扫不到任何取色器说明这条整块空转（正则失效 / 写法变了），不能当成通过
if (!colorSites) fail.push('一条 <input type="color"> 都没扫到 —— [6] 的匹配失效了，先修判定再看绿')
else if (colorHits.length) fail.push(...colorHits)
console.log(`[6] 原生 color 输入值归一 出现=${colorSites} 未登记=${colorHits.length}`)

// ---------- [7] 单文件行数纪律：按域止涨线（M3 扩面） ----------
// form-builder 是 09-04 收官纪律（≤800）；其余域为「现状止涨线」＝当前最大文件 + 一点余量，
// 只拦增长不追溯存量，止涨后再随重构逐步回收。抬线必须带新实测值；超线提交＝拆分信号。
const LINE_LIMITS = {
  'form-builder': 800, // 09-04 收官纪律
  data: 2950, // DataTable.vue 2858（灯箱/选项面板/单元格右键菜单/键盘导航下沉 useTableCellMenus 后）止涨，余量 92
  form: 1500, // Select.vue 1399（过滤/虚拟化下沉 useSelectFiltering 后）止涨，余量 101
  layout: 950, // AppLayout.vue 896 现状止涨
  'route-planner': 850, // utils/route-planning.ts 811 现状止涨
}
const domainCounts = {}
const domainOversized = {}
const collectLines = (domain, d) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) collectLines(domain, p)
    else if (/\.(ts|vue)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) {
      domainCounts[domain] = (domainCounts[domain] || 0) + 1
      const n = readFileSync(p, 'utf8').split('\n').length - 1
      if (n > LINE_LIMITS[domain]) {
        ;(domainOversized[domain] ||= []).push(`${relative('.', p).replaceAll('\\', '/')}=${n} 行`)
      }
    }
  }
}
for (const domain of Object.keys(LINE_LIMITS)) collectLines(domain, join('src/components', domain))
for (const [domain, limit] of Object.entries(LINE_LIMITS)) {
  const count = domainCounts[domain] || 0
  const oversized = domainOversized[domain] || []
  if (count === 0) fail.push(`[7] ${domain} 域一个源文件都没扫到 —— 匹配失效了，先修判定再看绿`)
  else if (oversized.length) {
    fail.push(
      `[7] ${domain} 域 ${oversized.length} 个文件超止涨线 ${limit} 行（靠人工守会回潮）：` +
        `${oversized.join(', ')}。抽 composable / 子组件收口，别再长`,
    )
  }
  console.log(`[7] ${domain} 域行数 文件=${count} 止涨线=${limit} 超线=${oversized.length}`)
}


if (fail.length) {
  console.error('\n❌ check:constants 未通过 —— 尺寸/断点常量必须有来源')
  fail.forEach((f) => console.error('   - ' + f))
  console.error('\n   规矩见 README「开发规范 · 常量与断点」：常量只能来自实测度量或令牌，默认自适应并留覆写口。')
  process.exit(1)
}
console.log('\n✅ check:constants 通过')
