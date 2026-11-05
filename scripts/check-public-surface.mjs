// 闸口：跨域引用必须走目标域的入口（TD-57 收口，#438）
//
// ## 背景
//
// `gen:docs` 与 `check:doc-completeness` 的「公开面」口径是**域入口**
// （`src/components/<domain>/index.ts` 与主入口）。只在模块文件里写的 `export`
// 既不进文档、也不被完整性检查盯上 —— 于是"新增公共 API 时忘了从入口导出"
// 这类问题两道闸口都发现不了（TD-57 的挂号原因）。
//
// 更现实的一种变体：**跨域引用直接扎进别的域的内部模块**
// （如 `form-builder` 引 `form/utils/date-utils`、`storage/contract-storage`），
// 这些符号成了"事实上的公共 API"，却不在任何入口上：文档里查不到，
// 消费者只能继续深扎内部路径，而内部模块的重构随时会打断它们。
//
// ## 判据（机械、可复现）
//
// 扫 `src/components/**` 的 `.ts/.vue`：
//   ① 解析每个文件的命名导出（`export {...}` / `export type {...}` / `export { type X }` /
//      声明式 `export function|class|const|...`）；
//   ② 域入口导出集合 = `src/components/<domain>/index.ts` 的导出；
//   ③ 任何**跨域** `import { a, b } from '@/components/<域>/<模块>'`，
//      若 `a`/`b` 不在该域入口导出集合里 → 报「跨域引用未走入口」。
//
// 豁免：`_internal/`（全库共享内部层，按设计不逐域导出）、目标就是域入口本身、
// `import type` 也算（类型同样是公共面）。
//
// ## 为什么这不是"洁癖"
//
// 入口是文档与完整性检查的锚点。绕开入口的共享符号 = 文档查不到 + 检查管不到，
// 而它已经被跨域使用 —— 这是**已发生**的事实公共面，不是假想。
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const COMPONENTS = path.join(ROOT, 'src/components')
const DOMAINS = [
  'basic',
  'data',
  'form',
  'feedback',
  'nav',
  'layout',
  'chart',
  'login',
  'storage',
  'wc',
  'form-builder',
  'amap',
  'route-planner',
]
/** 全库共享内部层：按设计不逐域导出（文档另有 `_internal` 约定） */
const INTERNAL = /(^|\/)_internal\//

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|vue)$/.test(name)) out.push(p.split(path.sep).join('/'))
  }
  return out
}

/** 文件的命名导出集合 */
export function exportsOf(src) {
  const out = new Set()
  for (const m of src.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    // 先剥行注释再切分：注释可能夹在两项之间（`a, // 说明\n b`），
    // 不剥的话整段会被当成"以 // 开头"而被跳过，后面的名字一起丢（曾漏判 reverseGeocode）
    const block = m[1].replace(/^\s*\/\/.*$/gm, '')
    for (const part of block.split(',')) {
      const seg = part.trim().replace(/^type\s+/, '')
      if (!seg) continue
      const as = seg.split(/\s+as\s+/)
      out.add((as[1] ?? as[0]).trim())
    }
  }
  for (const m of src.matchAll(
    /export\s+(?:declare\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z0-9_$]+)/g,
  )) {
    out.add(m[1])
  }
  return out
}

/**
 * 找出「跨域引用未走入口」的符号。
 * @returns {{importer: string, domain: string, module: string, symbol: string}[]}
 */
export function findCrossDomainBypass({ componentsDir = COMPONENTS, domains = DOMAINS } = {}) {
  const files = walk(componentsDir)
  const byFile = new Map()
  for (const f of files) {
    byFile.set(f, exportsOf(fs.readFileSync(f, 'utf8')))
  }
  const entryExports = new Map()
  for (const d of domains) {
    const idx = `${componentsDir.replace(/\\/g, '/')}/${d}/index.ts`
    entryExports.set(d, byFile.get(idx) ?? new Set())
  }

  const findings = []
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8')
    const myDomain = f.match(/\/components\/([^/]+)\//)?.[1]
    for (const m of src.matchAll(
      /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'@\/components\/([^/]+)\/([^']+)'/g,
    )) {
      const targetDomain = m[2]
      if (targetDomain === myDomain) continue
      const targetModule = m[3]
      if (targetModule === 'index' || targetModule.startsWith('index.')) continue
      if (INTERNAL.test('/' + targetModule)) continue
      const names = m[1]
        .split(',')
        .map((s) => s.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim())
        .filter(Boolean)
      const entry = entryExports.get(targetDomain)
      if (!entry) continue
      for (const n of names) {
        if (!entry.has(n)) {
          findings.push({ importer: f, domain: targetDomain, module: targetModule, symbol: n })
        }
      }
    }
  }
  return findings
}

function main() {
  const findings = findCrossDomainBypass()
  if (findings.length === 0) {
    console.log('✅ check:public-surface 通过 — 跨域引用全部走目标域入口（TD-57 口径成立）')
    return
  }
  console.error(`❌ check:public-surface 未通过 —— ${findings.length} 处跨域引用未走入口：`)
  for (const f of findings) {
    console.error(`   - ${f.importer}  ←  ${f.domain}/${f.module} :: ${f.symbol}`)
  }
  console.error('   修法：把该符号加进目标域入口（src/components/<域>/index.ts），或改从入口导入。')
  process.exit(1)
}

import { pathToFileURL } from 'node:url'

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
