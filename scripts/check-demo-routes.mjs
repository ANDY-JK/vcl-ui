// 闸口：demo 路由对账（TD-22 收口，#451）
//
// ## 背景
//
// `docs-site/guide/facts.md` 的「演示页 46」是手工核算口径（50 个 Demo.vue 减去
// ComponentDemo 外壳与 3 个被 CaptureDemo 静态引入的分段）。但**没有任何机械判据**守住
// "每个 Demo.vue 要么被路由到（demoMap / router 静态段），要么被另一个路由页静态引入，
// 要么文件根本不该存在"。上次 #436 就是靠 grep 才发现 3 个旧 demo 已并页 —— 靠人记，下次还会漏。
//
// 本闸口把它钉成两条机械判据：
//   · 孤立页：`src/demos/**/*Demo.vue` 没被任何 demo 侧文件 import → 红
//   · 幽灵路由：demo 侧 import 指向不存在的文件 → 红
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = process.cwd()

/** 递归收集 src/demos 下的 Demo.vue（返回 src/demos/… 相对路径，字典序） */
export function collectDemoFiles(dir = path.join(ROOT, 'src/demos'), base = ROOT) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...collectDemoFiles(p, base))
    else if (/Demo\.vue$/.test(e.name)) out.push(path.relative(base, p).split(path.sep).join('/'))
  }
  return out.sort()
}

/**
 * 把一个 import 说明符解析成 `src/…` 仓库相对路径。
 * 只认 demo 侧两种写法：`@/demos/…` 与 `./…` / `../…`（相对当前文件）。
 */
export function resolveSpec(spec, fromFile) {
  let abs = null
  if (spec.startsWith('@/')) abs = path.join(ROOT, 'src', spec.slice(2))
  else if (spec.startsWith('./') || spec.startsWith('../')) abs = path.resolve(ROOT, path.dirname(fromFile), spec)
  if (!abs) return null
  const rel = path.relative(ROOT, abs).split(path.sep).join('/')
  if (!rel.startsWith('src/')) return null
  return rel
}

/**
 * 收集 demo 层（demo 文件 + router.ts）所有 import / import() 目标。
 * readFile 注入使纯函数可单测。
 */
export function collectReferences({ demoFiles, readFile }) {
  const refs = new Set()
  const sources = [...demoFiles, 'src/demos/router.ts']
  for (const f of sources) {
    let text
    try {
      text = readFile(f)
    } catch {
      continue
    }
    // 静态 import（含多行）：`import X from 'spec'` / `import { a, b } from 'spec'`
    for (const m of text.matchAll(/import\s+[^'"()]*?from\s+['"]([^'"]+)['"]/g)) refs.add(resolveSpec(m[1], f))
    // 动态 import：`import('spec')` —— demoMap 的 loader / router 的 component 都是这种
    for (const m of text.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) refs.add(resolveSpec(m[1], f))
  }
  refs.delete(null)
  return refs
}

/**
 * 对账（纯函数）：孤立页 = demo 文件不被任何 demo 侧文件引用；
 * 幽灵 = 引用指向的 src/demos 文件不存在。
 */
export function reconcileDemoRoutes({ demoFiles, references }) {
  const files = new Set(demoFiles)
  const orphans = [...files].filter((f) => !references.has(f)).sort()
  // 幽灵只看 .vue 目标：无扩展名的 import（`./demo-images`、`./lowcode/useBackendConnection`）
  // 由打包器解析到 .ts / index，不在本闸口的"demo 页"口径内
  const ghosts = [...references].filter((r) => r.startsWith('src/demos/') && r.endsWith('.vue') && !files.has(r)).sort()
  return { orphans, ghosts }
}

function main() {
  const demoFiles = collectDemoFiles()
  const references = collectReferences({
    demoFiles,
    readFile: (p) => fs.readFileSync(path.join(ROOT, p), 'utf8'),
  })
  const { orphans, ghosts } = reconcileDemoRoutes({ demoFiles, references })

  const problems = []
  if (ghosts.length) problems.push(`import 指向不存在的 demo 文件：${ghosts.join(', ')}`)
  if (orphans.length) problems.push(`这些 demo 文件不在任何路由可达面：${orphans.join(', ')}`)
  if (demoFiles.length < 10) problems.push(`demo 文件只有 ${demoFiles.length} 个 —— 判据疑似空转`)

  if (problems.length) {
    console.error(`❌ check:demo-routes 未通过 —— ${problems.length} 类问题：`)
    for (const p of problems) console.error(`   - ${p}`)
    console.error('   修法：并页的旧 demo 从文件系统删除；新 demo 必须先进 ComponentDemo 的 demoMap。')
    process.exit(1)
  }
  console.log(`✅ check:demo-routes 通过 — ${demoFiles.length} 个 Demo.vue 全部路由可达，无幽灵路由`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
