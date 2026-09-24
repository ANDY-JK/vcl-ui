// 发包前自检（六件事，任一不过即非零退出）
// 1) 每个 .vue 源文件都要有对应 .d.ts —— 抓到过 IconPicker 静默缺失
// 2) package.json exports 声明的每个目标文件必须真实存在
// 3) .env.local 里的真值不得出现在可执行产物（跳过源码里本来就有的值，避免假阳性）
// 4) 声明必须对最低承诺版本（peer: vue ^3.4.0）有效 —— 3.5 生成的 DefineComponent 多 7 个参数，
//    3.4 消费者开 skipLibCheck:false 会报 73 条 TS2707（已发生）
// 5) 产物里不得有不可达 chunk —— 本机删不掉旧 dist，旧版本代码会跟着发布（见 [5] 注释）
// 6) 体积预算 —— 大块产物设绝对上限防「慢慢变胖没人看」（基线 2026-09-20，含 15~30% 余量）
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'

const fail = []
const walk = (d, out = []) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) {
      if (!/node_modules|dist|\.git|reports|test-results|tests|docs/.test(p)) walk(p, out)
    } else out.push(p)
  }
  return out
}
const srcVue = walk(join('src', 'components'))
  .filter((f) => f.endsWith('.vue'))
  .map((f) => relative('src/components', f).replaceAll('\\', '/'))
const missing = srcVue.filter((r) => !existsSync(join('dist', r) + '.d.ts'))
if (missing.length) fail.push(`缺声明文件 ${missing.length}/${srcVue.length}: ${missing.join(', ')}`)
// .ts 模块同样逐个点名：只查 .vue 会漏掉"单个 .ts 因 TS4060 不生成声明"这类缺口
// （cell-clipboard.ts 返回类型引用了函数内声明的 PasteTarget → tsc 拒绝写声明 →
//   只有引用它的 .d.ts 在消费者侧报 TS2307，而旧 dist 里恰好有历史版本把它盖住了）
const srcTs = walk(join('src', 'components'))
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
  .map((f) => relative('src/components', f).replaceAll('\\', '/'))
// .vue → Foo.vue.d.ts；.ts → Foo.d.ts（去扩展名，不是叠加）
const missingTs = srcTs.filter((r) => !existsSync(join('dist', r.replace(/\.ts$/, '')) + '.d.ts'))
if (missingTs.length) fail.push(`.ts 缺声明文件 ${missingTs.length}/${srcTs.length}: ${missingTs.join(', ')}`)
console.log(`[1] 声明完整性 vue=${srcVue.length - missing.length}/${srcVue.length}  ts=${srcTs.length - missingTs.length}/${srcTs.length}`)

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const targets = []
const collect = (v) => {
  if (typeof v === 'string') {
    if (v.startsWith('./dist/') && !v.includes('*')) targets.push(v.slice(2))
  } else for (const x of Object.values(v)) collect(x)
}
collect(pkg.exports)
const absent = [...new Set(targets)].filter((t) => !existsSync(t))
if (absent.length) fail.push(`exports 指向不存在的文件: ${absent.join(', ')}`)
console.log(`[2] exports 目标存在性 ${new Set(targets).size - new Set(absent).size}/${new Set(targets).size}`)

if (existsSync('.env.local')) {
  const srcAll = walk('src').reduce((s, f) => s + readFileSync(f, 'utf8'), '')
  const distFiles = walk('dist').filter((f) => /\.(js|cjs|mjs)$/.test(f))
  const distAll = distFiles.map((f) => readFileSync(f, 'utf8')).join('')
  const leaked = []
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = /^VITE_[A-Z_0-9]+=(.+)$/.exec(line.trim())
    if (!m) continue
    const v = m[1].replace(/^"|"$/g, '').trim()
    if (v.length < 6) continue
    if (srcAll.includes(v)) continue // 源码本来就有的字面量，不算内联泄露
    if (distAll.includes(v)) leaked.push(line.split('=')[0])
  }
  if (leaked.length) fail.push(`产物含构建期密钥: ${leaked.join(', ')}`)
  console.log(`[3] 产物密钥扫描 泄露=${leaked.length}`)
} else console.log('[3] 无 .env.local（CI 环境），跳过密钥扫描')

// 4) 用 vue34 别名把整棵声明重新类型检查一遍，等价于「3.4 消费者 + skipLibCheck:false」
const dtsAll = (function collect(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) collect(p, out)
    else if (p.endsWith('.d.ts')) out.push(p)
  }
  return out
})('dist')
const aliasLeft = dtsAll.filter((f) => readFileSync(f, 'utf8').includes('vue34'))
if (aliasLeft.length) fail.push(`声明残留构建别名 vue34: ${aliasLeft.length} 个文件`)
if (!existsSync(join('node_modules', 'vue34'))) {
  fail.push('缺少 devDependency vue34 —— 声明兼容性检查无法进行')
} else {
  const program = ts.createProgram({
    rootNames: dtsAll,
    options: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      skipLibCheck: false,
      noEmit: true,
      types: [],
      baseUrl: process.cwd(),
      paths: { vue: ['./node_modules/vue34'] },
    },
  })
  const errors = ts.getPreEmitDiagnostics(program).filter((d) => d.category === ts.DiagnosticCategory.Error)
  if (errors.length) {
    const first = ts.flattenDiagnosticMessageText(errors[0].messageText, ' ')
    fail.push(`声明对 vue 3.4 有 ${errors.length} 条类型错误（首条：${first}）`)
  }
  console.log(`[4] 声明对最低承诺版本 vue 3.4 类型检查 错误=${errors.length}`)
}

// 5) 产物可达性 —— dist 里每个 js/cjs 都必须被入口或动态 import 图覆盖
//    本机 I: 盘上 fs.rmSync 静默失效、vite emptyOutDir 形同虚设，历史 chunk 会跨次构建堆积，
//    而 package.json 的 files:["dist"] 会把它们整批发给消费者（实测 690 文件/62MB，入口只用 11 个）。
//    多入口（Q3）后入口集 = exports 声明的全部 dist js/cjs 目标：主 bundle + 13 个域 entry。
//    不能只拿主 bundle 做种子——代码内联进 entry 的域（form-builder/chart/login/nav/…）
//    主入口直连，代码留共享 chunk 的域（basic/data/form/…）其 entry 是薄壳、不被主入口引用，
//    只种子主 bundle 会把这些薄壳误判成孤儿。
const chunkFiles = walk('dist')
  .filter((f) => /\.(js|cjs)$/.test(f))
  .map((f) => f.replaceAll('\\', '/'))
const entryTargets = new Set()
const collectEntries = (v) => {
  if (typeof v === 'string') {
    if (/^\.\/dist\/.+\.(js|cjs)$/.test(v) && !v.includes('*')) entryTargets.add(v.slice(2))
  } else for (const x of Object.values(v)) collectEntries(x)
}
collectEntries(pkg.exports)
const entryFiles = chunkFiles.filter((f) => entryTargets.has(f))
if (entryFiles.length === 0) fail.push('exports 未声明任何 dist js/cjs 入口——检查包名与 exports 结构')
const reached = new Set()
const queue = [...entryFiles]
const specRe = /(?:from\s+|import\s*\(\s*|import\s+|require\s*\(\s*)['"](\.\/[^'"]+)['"]/g
while (queue.length) {
  const cur = queue.pop()
  if (reached.has(cur)) continue
  reached.add(cur)
  let src
  try {
    src = readFileSync(cur, 'utf8')
  } catch {
    continue
  }
  for (const m of src.matchAll(specRe)) {
    const next = (cur.slice(0, cur.lastIndexOf('/')) + '/' + m[1].slice(2)).replace('/./', '/')
    if (chunkFiles.includes(next) && !reached.has(next)) queue.push(next)
  }
}
const orphans = chunkFiles.filter((f) => !reached.has(f))
if (orphans.length) {
  fail.push(
    `产物含 ${orphans.length} 个不可达 chunk（未被入口或动态 import 引用，随 npm publish 一起发出）：` +
      `${orphans.slice(0, 8).join(', ')}${orphans.length > 8 ? ' …' : ''}；` +
      `先跑 npm run clean 再 build`,
  )
}
console.log(`[5] 产物可达性 可达=${reached.size} 孤儿=${orphans.length}`)

// 6) 体积预算 —— 防止「慢慢变胖没人看」。只看 ESM（.js，.cjs 同内容不重复断言）。
//    基线 2026-09-20 多入口改造后实测 + 15~30% 余量。抬高预算的提交须注明原因与新基线。
//    多入口（Q3）后形态：单入口使用的域代码被 rollup 内联进该域 entry（form-builder-chunk 等
//    共享 chunk 消失），故大文件预算按「dist 相对路径」判，不再只看根级 basename——
//    否则 14 个 index.js 同名无法区分，form-builder（599KB）会落进 150KB 兜底误判。
const relName = (f) => f.replaceAll('\\', '/').replace(/^dist\//, '')
const esmChunks = walk('dist')
  .map((f) => f.replaceAll('\\', '/'))
  .filter((f) => /\.js$/.test(f) && f.startsWith('dist/'))
// 大块单独设预算（KB），其余 chunk 用统一兜底上限
const BUDGET_KB = [
  [/^core-chunk-.*\.js$/, 1000],
  [/^vendor-heavy-.*\.js$/, 900],
  [/^form-builder\/index\.js$/, 700], // 原 form-builder-chunk 预算随代码内联迁到 entry
  [/^morphicons-icons-data-.*\.js$/, 700],
  [/^solar-icons-data-.*\.js$/, 280],
  [/^data-chunk-.*\.js$/, 320],
  [/^form-chunk-.*\.js$/, 180],
  [/^route-planner\/index\.js$/, 100],
  [/^chart\/index\.js$/, 60],
  [/^login\/index\.js$/, 40],
  [/^nav\/index\.js$/, 25],
  [/^vcl-ui\.js$/, 15], // 主入口已是 re-export 薄壳（9KB），壳膨胀即说明隔离被破坏
]
const FALLBACK_BUDGET_KB = 150
const CSS_BUDGET_KB = 350
const oversize = []
for (const f of esmChunks) {
  const name = relName(f)
  const kb = (readFileSync(f).length / 1024) | 0
  const hit = BUDGET_KB.find(([re]) => re.test(name))
  const budget = hit ? hit[1] : FALLBACK_BUDGET_KB
  if (kb > budget) oversize.push(`${name}=${kb}KB/预算${budget}KB`)
}
const cssFile = walk('dist').find((f) => f.endsWith('.css') && /\/dist\/vcl-ui\.css$/.test(f.replaceAll('\\', '/')))
if (cssFile) {
  const kb = (readFileSync(cssFile).length / 1024) | 0
  if (kb > CSS_BUDGET_KB) oversize.push(`vcl-ui.css=${kb}KB/预算${CSS_BUDGET_KB}KB`)
}
if (oversize.length) fail.push(`产物超体积预算: ${oversize.join(', ')}`)
console.log(`[6] 体积预算 超限=${oversize.length}`)

if (fail.length) {
  console.error('\n❌ verify:pkg 未通过')
  fail.forEach((f) => console.error('   - ' + f))
  process.exit(1)
}
console.log('\n✅ verify:pkg 通过')
