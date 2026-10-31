#!/usr/bin/env node
/**
 * 闸口：**模块循环依赖检测**（TD-72 / #279）
 *
 * ## 为什么需要
 *
 * 循环 import 在 ESM 下不会报错，而是让某一侧的绑定在初始化期是 `undefined`，
 * 运行到那行才抛 `x is not a function` —— **tsc 与 eslint 都不报**，只有跑到那行才炸。
 * 本仓真实踩过：把 `toEpochMs` 从 `supabase-transport` 挪给 `s3-transport` 复用，
 * s3 反向 import supabase 形成环，运行时 `toEpochMs is not a function`。
 *
 * TD-72 里已有一次性脚本，但明确写着「未接进常驻闸口」—— 一次性脚本等于没有。
 *
 * ## 判定口径（这里是最容易误报的地方，逐条说明）
 *
 * 建边：
 * - `import ... from 'x'` / `import 'x'`           → 建边（**值导入**，初始化期需要对方）
 * - `export ... from 'x'` / `export * from 'x'`    → 建边（re-export 会触发对方模块求值）
 *
 * 不建边（都会导致误报，必须排除）：
 * - `import type ... from 'x'` / `export type ...` → **编译即擦除**，运行期没有这条边。
 *   本仓 `local-storage.ts` 对 `indexedDB.ts` 的 `import type` 就是这种：图上成环、实际无害。
 * - 动态 `import('x')`                            → **延迟求值**，不参与初始化顺序，不会形成初始化环。
 * - 注释里出现的 import 字面量                     → 必须先剥注释（TD-72 实测踩过这个坑）。
 *
 * 只解析 `.ts` / `.vue`（取 `<script>` 块）里的**静态** import 语句；
 * 路径解析处理相对路径 + `@/` 别名 + 省略扩展名 + 目录 index。
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { dirname, resolve, relative, join, extname } from 'node:path'

const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const EXT = ['.ts', '.vue', '.mts', '.tsx']

/** 剥掉注释（行注释 + 块注释），保留字符串内容与换行数量以维持行号 */
function stripComments(code) {
  let out = ''
  let i = 0
  let quote = null
  while (i < code.length) {
    const ch = code[i]
    const next = code[i + 1]
    if (quote) {
      out += ch
      if (ch === '\\') {
        out += next ?? ''
        i += 2
        continue
      }
      if (ch === quote) quote = null
      i++
      continue
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch
      out += ch
      i++
      continue
    }
    if (ch === '/' && next === '/') {
      while (i < code.length && code[i] !== '\n') i++
      continue
    }
    if (ch === '/' && next === '*') {
      i += 2
      while (i < code.length && !(code[i] === '*' && code[i + 1] === '/')) {
        if (code[i] === '\n') out += '\n'
        i++
      }
      i += 2
      continue
    }
    out += ch
    i++
  }
  return out
}

/** 取 .vue 的 <script> 块内容（多个 script 块拼接；无 script 返回空串） */
function scriptOf(path, raw) {
  if (extname(path) !== '.vue') return raw
  const blocks = [...raw.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
  return blocks.map((m) => m[1]).join('\n')
}

const RE_EXPORT_TYPE = /^\s*export\s+type\s/
const RE_IMPORT_TYPE = /^\s*import\s+type\s/
const RE_FROM = /\bfrom\s*['"]([^'"]+)['"]/
const RE_BARE = /^\s*import\s+['"]([^'"]+)['"]/

/** 抽取一条语句里所有可解析的模块来源；不含则返回空数组 */
function targetsOf(statement) {
  // 动态 import 不参与初始化顺序 → 排除
  if (/\bimport\s*\(/.test(statement)) return []
  const m = RE_FROM.exec(statement)
  if (m) return [m[1]]
  const b = RE_BARE.exec(statement)
  if (b) return [b[1]]
  return []
}

/** 把源码里的 import/export-from 语句切成独立片段（支持跨多行的花括号导入） */
function statements(code) {
  const out = []
  const lines = code.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!/^\s*(import|export)\b/.test(line)) continue
    // 跨行：一直吃到出现 from '...' 或以分号/空行结束
    let stmt = line
    let j = i
    while (!/\bfrom\s*['"]/.test(stmt) && !/^\s*import\s*['"]/.test(stmt) && j - i < 40) {
      j++
      if (j >= lines.length) break
      stmt += '\n' + lines[j]
      if (/^\s*\}\s*from\s*['"]/.test(lines[j])) break
    }
    out.push({ text: stmt, line: i + 1 })
    i = j
  }
  return out
}

/** 解析 import 说明符为绝对文件路径；解析不到返回 null（外部包 / 别名以外） */
function resolveSpecifier(spec, fromFile) {
  let base
  if (spec.startsWith('.')) {
    base = resolve(dirname(fromFile), spec)
  } else if (spec.startsWith('@/')) {
    base = join(SRC, spec.slice(2))
  } else {
    return null // 第三方包
  }
  if (existsSync(base) && statSync(base).isFile()) return base
  for (const e of EXT) {
    if (existsSync(base + e)) return base + e
  }
  for (const e of EXT) {
    const idx = join(base, 'index' + e)
    if (existsSync(idx)) return idx
  }
  // 显式带 .js 的 TS 源（ESM 风格），尝试换扩展名
  if (/\.jsx?$/.test(base)) {
    const stem = base.replace(/\.jsx?$/, '')
    for (const e of EXT) if (existsSync(stem + e)) return stem + e
  }
  return null
}

/** 递归收集 src 下的 .ts/.vue（跳过生成物与 vendor） */
function collect(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue
      collect(p, acc)
    } else if (EXT.includes(extname(name))) {
      acc.push(p)
    }
  }
  return acc
}

const files = collect(SRC)
const graph = new Map()

for (const file of files) {
  const raw = readFileSync(file, 'utf8')
  const code = stripComments(scriptOf(file, raw))
  const edges = new Set()
  for (const { text } of statements(code)) {
    // 类型导入/re-export 编译即擦除 → 不建边
    if (RE_IMPORT_TYPE.test(text) || RE_EXPORT_TYPE.test(text)) continue
    for (const spec of targetsOf(text)) {
      const target = resolveSpecifier(spec, file)
      if (target) edges.add(target)
    }
  }
  graph.set(file, edges)
}

/** Tarjan 强连通分量：>1 个节点的分量即为环（自环单独判） */
function findCycles(graph) {
  let index = 0
  const idx = new Map()
  const low = new Map()
  const onStack = new Set()
  const stack = []
  const sccs = []

  function strongconnect(v) {
    idx.set(v, index)
    low.set(v, index)
    index++
    stack.push(v)
    onStack.add(v)
    for (const w of graph.get(v) ?? []) {
      if (!graph.has(w)) continue
      if (!idx.has(w)) {
        strongconnect(w)
        low.set(v, Math.min(low.get(v), low.get(w)))
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), idx.get(w)))
      }
    }
    if (low.get(v) === idx.get(v)) {
      const comp = []
      let w
      do {
        w = stack.pop()
        onStack.delete(w)
        comp.push(w)
      } while (w !== v)
      sccs.push(comp)
    }
  }

  for (const v of graph.keys()) if (!idx.has(v)) strongconnect(v)
  return sccs.filter((c) => c.length > 1)
}

const cycles = findCycles(graph)

if (cycles.length) {
  console.error(`\n✖ check:no-cycles 发现 ${cycles.length} 处循环依赖：\n`)
  for (const comp of cycles) {
    console.error('  环：')
    for (const f of comp) console.error(`    ${relative(ROOT, f)}`)
    // 列出分量内部的具体边，便于定位
    for (const f of comp) {
      for (const t of graph.get(f) ?? []) {
        if (comp.includes(t)) console.error(`      ${relative(ROOT, f)} → ${relative(ROOT, t)}`)
      }
    }
    console.error('')
  }
  console.error('修法：把共享部分抽成叶子模块（不 import 任何同域模块），两条路径都指向它。')
  console.error('注意 `import type` 与动态 import() 不计入环（编译擦除 / 延迟求值）。')
  process.exit(1)
}

console.log(`✅ check:no-cycles 通过 — ${files.length} 个模块、${[...graph.values()].reduce((a, s) => a + s.size, 0)} 条静态 import 边，无循环依赖`)
