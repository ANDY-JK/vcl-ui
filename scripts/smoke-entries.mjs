// 多入口运行时冒烟（Q3 配套闸口）——verify:pkg 只做静态检查（文件存在、可达、体积），
// 域 entry 的「双格式真能加载 + 导出面与 barrel 一致」此前零机械保障：
// chunk 环、CJS interop、导出漏名都只在消费者侧才炸。本脚本在 build 之后跑：
//   ① 每个域 entry 的 ESM import 与 CJS require 都成功，导出非空；
//   ② barrel 里声明的每个导出名在两种格式的运行时都存在（对照源码，不手抄清单）；
//   ③ 主入口冒烟（导出数、关键组件在位）。
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const require_ = createRequire(path.join(ROOT, 'noop.cjs'))
const fail = []

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))

/** barrel 的导出名清单（与 gen-docs 同口径：export { a as B } from './x'） */
function barrelNames(domain) {
  const file = path.join(ROOT, 'src/components', domain, 'index.ts')
  const src = fs.readFileSync(file, 'utf8')
  const names = []
  const re = /export\s*\{([^}]*)\}\s*from\s*'\.\/([^']+)'/g
  let m
  while ((m = re.exec(src))) {
    const body = m[1].replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const part of body.split(',')) {
      const t = part.trim()
      if (!t) continue
      const as = /^(\w+)\s+as\s+(\w+)$/.exec(t)
      names.push(as ? as[2] : t)
    }
  }
  return names
}

/** 取一个模块命名空间的「值导出」名（排除类型-only 在运行时不存在，按 typeof 过滤） */
function valueExports(mod) {
  return Object.keys(mod).filter((k) => k !== 'default' && mod[k] !== undefined)
}

async function smokeEntry(label, jsFile, cjsFile, expected) {
  // ESM
  try {
    const esm = await import(pathToFileURL(path.join(ROOT, jsFile)).href)
    const got = valueExports(esm)
    if (got.length === 0) fail.push(`${label} ESM 导出为空`)
    const missing = expected.filter((n) => !(n in esm))
    if (missing.length) fail.push(`${label} ESM 缺导出: ${missing.join(', ')}`)
  } catch (e) {
    fail.push(`${label} ESM 加载失败: ${(e && e.message ? String(e.message) : String(e)).slice(0, 160)}`)
  }
  // CJS
  try {
    const cjs = require_(path.join(ROOT, cjsFile))
    const got = valueExports(cjs)
    if (got.length === 0) fail.push(`${label} CJS 导出为空`)
    const missing = expected.filter((n) => !(n in cjs))
    if (missing.length) fail.push(`${label} CJS 缺导出: ${missing.join(', ')}`)
  } catch (e) {
    fail.push(`${label} CJS 加载失败: ${(e && e.message ? String(e.message) : String(e)).slice(0, 160)}`)
  }
}

// ── 主入口 ──
await smokeEntry('main', 'dist/vcl-ui.js', 'dist/vcl-ui.cjs', [
  'Button',
  'DataTable',
  'Select',
  'FormBuilder',
  'Chart',
  'AmapWidget',
  'Toast',
  'i18n',
  'useT',
])

// ── 13 个域 entry（期望面 = barrel 源码导出名） ──
let entryCount = 0
for (const [sub, target] of Object.entries(pkg.exports)) {
  if (sub === '.' || sub === './css' || sub === './i18n' || sub === './dist/*' || sub === './package.json') continue
  const domain = sub.slice(2)
  const js = target.import
  const cjs = target.require
  if (!js || !cjs) {
    fail.push(`${sub} 缺 import/require 目标`)
    continue
  }
  await smokeEntry(domain, js, cjs, barrelNames(domain))
  entryCount++
}

if (fail.length) {
  console.error('\n❌ 多入口运行时冒烟未通过')
  fail.forEach((f) => console.error('   - ' + f))
  process.exit(1)
}
console.log(`✅ 多入口运行时冒烟通过（main + ${entryCount} 域 entry，ESM/CJS 双格式，导出面与 barrel 一致）`)
