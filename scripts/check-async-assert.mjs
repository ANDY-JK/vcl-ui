// 闸口：断言不许落在 Promise 本体上（TD-88 收口，#440）
//
// ## 背景
//
// TD-88 记的是"同步变异步"：#253 把 ImagePreview 的下载从同步 toDataURL 改成
// toPngBlob + objectURL（多一跳 Promise）后，用例的断言在微任务排空前执行 —— 要么假红，
// 要么（更危险）**碰巧绿**：`expect(p).toBe(true)` 里 p 是 Promise 对象，恒为真值，
// 断言与业务行为无关，行为差异就这么静默漏过。
//
// 第 193 轮为定位它插了 4 段桩。收口方式不是"再插一次桩"，而是把这条判据机械化：
// **异步函数的结果必须经 `.resolves` / `.rejects`（或先 await）再断言。**
//
// ## 判据（机械、可复现）
//
// ① 从源码推导"返回 Promise 的导出名"：
//    `export async function f` / `export function f(...): Promise<` /
//    `export const f = (...): Promise<` / `export const f = async (`
// ② 解析每个 spec 的 import（`@/` 别名与相对路径都解），只保留**确实从异步模块导入**的名字
//    —— 不做全库同名匹配（`notify` 在别的模块里可能同步，曾造成误报）。
// ③ 命中形状：
//    · `expect( asyncFn(...) )`      —— 断言对象就是 Promise
//    · `const p = asyncFn(...)` 之后的 `expect( p )`
//    且该断言语句（到下一个 expect/it 为止）里没有 `.resolves` / `.rejects`。
//
// ## 精度边界（写清楚，避免假绿式自信）
//
// 只覆盖"断言 Promise 本体"这一种形状。`const p = f()` 之后**根本没断言**、
// 或断言在别处用 `await p`，都不在本判据范围内 —— 那是另一类风险（TD-88 的第一半），
// 需要类型信息才能判，本闸口不假装能判。
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()
const SRC = path.join(ROOT, 'src')
const SPECS = path.join(ROOT, 'tests/unit')

/** 某源文件里"返回 Promise 的导出名" */
export function asyncExportsOf(file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return new Set()
  const src = fs.readFileSync(file, 'utf8')
  const out = new Set()
  for (const m of src.matchAll(/export\s+async\s+function\s+([A-Za-z0-9_$]+)/g)) out.add(m[1])
  for (const m of src.matchAll(/export\s+function\s+([A-Za-z0-9_$]+)\s*\([^)]*\)\s*:\s*Promise</g)) out.add(m[1])
  for (const m of src.matchAll(/export\s+const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*:\s*Promise</g)) out.add(m[1])
  for (const m of src.matchAll(/export\s+const\s+([A-Za-z0-9_$]+)\s*=\s*async\s*\(/g)) out.add(m[1])
  return out
}

/** 把 import 说明符解析到实际文件（`@/` → src/；含 .ts/.vue/index.ts 补全） */
export function resolveModule(fromFile, spec, srcDir = SRC) {
  const base0 = spec.startsWith('@/') ? path.join(srcDir, spec.slice(2)) : path.join(path.dirname(fromFile), spec)
  const base = base0.split(path.sep).join('/')
  for (const cand of [base, base + '.ts', base + '.vue', base + '/index.ts']) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return cand
  }
  return null
}

/** 该 spec 从异步模块导入的名字集合 */
export function importedAsyncNames(specFile, srcDir = SRC) {
  const raw = fs.readFileSync(specFile, 'utf8')
  const imported = new Set()
  for (const m of raw.matchAll(/import\s+(?:type\s+)?(?:\{([^}]*)\}|(\w+))\s+from\s+'([^']+)'/g)) {
    const names = m[1]
      ? m[1].split(',').map((s) => s.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim()).filter(Boolean)
      : [m[2]]
    const file = resolveModule(specFile, m[3], srcDir)
    if (!file) continue
    const asyncs = asyncExportsOf(file)
    for (const n of names) if (asyncs.has(n)) imported.add(n)
  }
  return imported
}

/**
 * 找出"断言落在 Promise 本体"的用例。
 * @returns {{spec: string, line: number, name: string, shape: string}[]}
 */
export function findPromiseAssertions({ specsDir = SPECS, srcDir = SRC } = {}) {
  const specs = []
  ;(function walk(d) {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n)
      if (fs.statSync(p).isDirectory()) walk(p)
      else if (n.endsWith('.spec.ts')) specs.push(p.split(path.sep).join('/'))
    }
  })(specsDir)

  const findings = []
  for (const f of specs) {
    const raw = stripNoise(fs.readFileSync(f, 'utf8'))
    const imported = importedAsyncNames(f, srcDir)
    if (imported.size === 0) continue

    // ① expect( asyncFn(...) ) —— 断言对象就是 Promise
    for (const m of raw.matchAll(/expect\(\s*([a-zA-Z_$][\w$]*)\s*\(/g)) {
      if (!imported.has(m[1])) continue
      const stmt = assertionStatement(raw, m.index)
      if (/\.(resolves|rejects)\b/.test(stmt)) continue
      findings.push({ spec: f, line: raw.slice(0, m.index).split('\n').length, name: m[1], shape: 'expect(asyncFn(...))' })
    }

    // ② const p = asyncFn(...) 之后的 expect( p )
    for (const m of raw.matchAll(/const\s+([a-zA-Z_$][\w$]*)\s*=\s*([a-zA-Z_$][\w$]*)\s*\(/g)) {
      const varName = m[1]
      const fn = m[2]
      if (!imported.has(fn)) continue
      const tail = raw.slice(m.index, m.index + 2000)
      const em = tail.search(new RegExp('expect\\(\\s*' + varName + '\\b'))
      if (em < 0) continue
      const stmt = assertionStatement(tail, em)
      if (/\.(resolves|rejects)\b/.test(stmt)) continue
      findings.push({ spec: f, line: raw.slice(0, m.index).split('\n').length, name: varName, shape: `expect(${varName}) ← ${fn}()` })
    }
  }
  return findings
}

/**
 * 剥掉字符串/模板/注释，避免把 fixture 文本或注释里的 `expect(x())` 当成调用。
 * 替换时保留换行（用等长占位），保证行号不变。
 */
function stripNoise(src) {
  return src
    .replace(/`(?:[^`\\]|\\.)*`/g, (m) => '``' + '\n'.repeat((m.match(/\n/g) || []).length))
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, (m) => '\n'.repeat((m.match(/\n/g) || []).length))
}

/** 从 expect( 处起，截到本断言语句结束（下一个 expect/it 出现处） */
function assertionStatement(raw, index) {
  const rest = raw.slice(index, index + 2000)
  const stop = rest.search(/\n\s*(?:expect|it|describe)\s*\(/)
  return stop > 0 ? rest.slice(0, stop) : rest
}

function main() {
  const findings = findPromiseAssertions()
  if (findings.length === 0) {
    console.log('✅ check:async-assert 通过 — 没有断言落在 Promise 本体上（TD-88 口径）')
    return
  }
  console.error(`❌ check:async-assert 未通过 —— ${findings.length} 处断言落在 Promise 本体：`)
  for (const f of findings) {
    console.error(`   - ${f.spec}:${f.line}  ${f.shape}（异步名 ${f.name}）`)
  }
  console.error('   修法：改成 await expect(p).resolves / .rejects，或先 const out = await f() 再断言。')
  process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
