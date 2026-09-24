#!/usr/bin/env node
/**
 * CSS 设计令牌断档闸口 — 拦「var() 引用了全库未声明的令牌且无 fallback」的静默失效。
 *
 * 背景（暗色陷阱同源）：var() 引用未声明令牌时浏览器静默求值为继承/初始值，
 * 亮色下常因继承背景碰巧看着正常、切暗色才暴露（曾出过「提亮语义色压白字不可读」）。
 * 有 fallback 的 var(--x, 默认) 是显式降级，合法不拦；无 fallback 又无处声明 = 必拦。
 *
 * 判定口径（零误报设计）：
 *   声明集 = 全仓 .css/.vue/.ts 中出现的 `--name:` 声明
 *     （含 tokens.css 全局令牌、组件局部 :style 内联声明、style 块局部变量——
 *      任一文件声明过即视为有主）
 *   引用集 = 同范围 `var(--name` 引用
 *   红 = 引用无 fallback 且声明集查无此名
 *
 * 注释里的示例 var(--xxx) 会先剥注释再扫；JS 动态生成的样式串（如 html2canvas
 * onclone 复制计算值）不含静态 var() 引用，天然不在引用集内。
 *
 * 用法：node scripts/check-css-tokens.mjs（接进 quality-check 之前先用 npm run check:css-tokens 观察）
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'
import process from 'process'

const ROOT = resolve(process.cwd())

const files = []
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue
    const p = join(dir, name)
    const s = statSync(p)
    if (s.isDirectory()) walk(p)
    else if (/\.(css|vue|ts)$/.test(name)) files.push(p)
  }
}
walk(join(ROOT, 'src'))

// 剥注释：块注释 → 行注释（非字符串内的 //；URL 里的 // 出现在 http://，前面是 :，正则排除）
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1')
}

const declared = new Set()
const references = new Map() // --name → [{ file, hasFallback }]
for (const f of files) {
  const raw = readFileSync(f, 'utf8')
  const src = stripComments(raw)
  const rel = f.replace(/\\/g, '/').replace(ROOT + '/', '')
  // 声明：① CSS/内联对象的 `--name:`  ② JS 字符串字面量（:style 对象键 / setProperty 首参）
  for (const m of src.matchAll(/--([a-zA-Z][a-zA-Z0-9-]*)\s*:/g)) declared.add('--' + m[1])
  for (const m of src.matchAll(/['"`](--[a-zA-Z][a-zA-Z0-9-]*)['"`]/g)) declared.add(m[1])
  // 引用（var(--name[, fallback]）
  for (const m of src.matchAll(/var\(\s*(--[a-zA-Z][a-zA-Z0-9-]*)\s*(,[^)]*)?\)/g)) {
    const name = m[1]
    const hasFallback = Boolean(m[2])
    if (!references.has(name)) references.set(name, [])
    references.get(name).push({ file: rel, hasFallback })
  }
}

const missing = []
for (const [name, uses] of references) {
  // 只要有一处引用带了 fallback 就算「有降级通道」？不——按引用逐处判：
  // 无 fallback 且全库无声明的引用才是断档（同文件内局部声明已并入 declared，自动豁免）
  const hard = uses.filter(u => !u.hasFallback && !declared.has(name))
  if (hard.length) missing.push({ name, hard })
}

if (missing.length === 0) {
  console.log('✅ check:css-tokens 通过 — ' + references.size + ' 种 var() 引用均有声明或 fallback')
  process.exit(0)
}
console.error('❌ CSS 令牌断档（无声明且无 fallback，暗色/降级场景必失效）：')
for (const { name, hard } of missing) {
  console.error('  ' + name)
  for (const u of hard) console.error('    ← ' + u.file)
}
process.exit(1)
