// 常量来源自检（三件事，任一不过即非零退出）
// 规矩本体写在 README「开发规范」一节，这里只负责把它变成机器能拦的那部分：
// [1] 断点令牌单源一致 —— _internal/breakpoints.ts 的 BP_* 必须与 tokens.css 的 --bp-* 逐个同值，
//     否则「改了令牌、JS 判定没跟着改」会静默分叉（侧栏收起和表格卡片视图就是两个判定）
// [2] JS/TS 里不得出现视口断点字面量 —— 视口宽度比较、matchMedia 宽度查询、*reakpoint 默认值，
//     一律引 breakpoints.ts 的常量
// [3] CSS @media 的宽度值必须落在已登记集合内 —— CSS 侧 var() 进不了 @media，只能写数字，
//     所以改成「登记制」：新增一个没登记过的断点就红，避免断点数量无意识膨胀
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

/** 从 .vue 里按标签切出 script / style 两段，返回 [{lang, lines}]；非 .vue 的 .ts 整份算 script */
function splitBlocks(file, text) {
  if (!file.endsWith('.vue')) return [{ kind: 'script', lines: text.split('\n') }]
  const out = []
  const re = /<(script|style)\b[^>]*>([\s\S]*?)<\/\1>/g
  let m
  while ((m = re.exec(text))) {
    const before = text.slice(0, m.index)
    // 保留原始行号：把前置内容换成等量空行，报错位置才对得上文件
    const offset = '\n'.repeat((before.match(/\n/g) || []).length)
    out.push({ kind: m[1] === 'script' ? 'script' : 'style', lines: (offset + m[2]).split('\n') })
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
  for (const b of splitBlocks(f, text)) {
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

// ---------- [4] 延时位不得写字面量毫秒数 ----------
/**
 * 取 setTimeout/setInterval 调用的最后一个实参（按括号配对扫描，
 * 不用正则尾匹配 —— 否则 `setTimeout(() => a.foo(1, 2), X)` 会把嵌套调用的 2 误判成延时）。
 */
function delayArgOf(text, openIdx) {
  let i = openIdx
  let depth = 1
  let inStr = null
  let lastComma = -1
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
    } else if (c === ',' && depth === 1) lastComma = i
  }
  if (lastComma < 0) return null // 只有一个参数（无延时）
  return text.slice(lastComma + 1, i).trim()
}

const delayHits = []
const relOf = (x) => relative('.', x).replaceAll('\\', '/')
// 只管 src/components（对外发布的库代码）：demos 里的延时是给读者看的示例值（"模拟 1.5s 网络"），
// 换成常量反而让示例更难读。
for (const f of files.filter(isSource).filter((x) => relOf(x).startsWith('src/components/'))) {
  const text = readFileSync(f, 'utf8')
  const rel = relOf(f)
  for (const b of splitBlocks(f, text)) {
    if (b.kind !== 'script') continue
    const lines = stripComments(b.lines)
    const joined = lines.join('\n')
    const re = /\b(?:window\.)?(?:setTimeout|setInterval)\s*\(/g
    let m
    while ((m = re.exec(joined))) {
      const arg = delayArgOf(joined, re.lastIndex)
      if (arg === null || !/^\d+(\.\d+)?$/.test(arg)) continue
      if (arg === '0') continue // 0 = 让出一个任务，不是时长
      const lineNo = joined.slice(0, m.index).split('\n').length
      delayHits.push(`${rel}:${lineNo} 延时写了字面量 ${arg}ms（改成本文件里有用途说明的 *_MS 常量）`)
    }
  }
}
if (delayHits.length) fail.push(...delayHits)
console.log(`[4] 字面量延时 ${delayHits.length}`)


if (fail.length) {
  console.error('\n❌ check:constants 未通过 —— 尺寸/断点常量必须有来源')
  fail.forEach((f) => console.error('   - ' + f))
  console.error('\n   规矩见 README「开发规范 · 常量与断点」：常量只能来自实测度量或令牌，默认自适应并留覆写口。')
  process.exit(1)
}
console.log('\n✅ check:constants 通过')
