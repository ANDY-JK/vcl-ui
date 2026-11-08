// 发包前自检（七件事，任一不过即非零退出）
// 1) 每个 .vue 源文件都要有对应 .d.ts —— 抓到过 IconPicker 静默缺失
// 2) package.json exports 声明的每个目标文件必须真实存在
// 3) .env.local 里的真值不得出现在可执行产物（跳过源码里本来就有的值，避免假阳性）
// 4) 声明必须对最低承诺版本（peer: vue ^3.4.0）有效 —— 3.5 生成的 DefineComponent 多 7 个参数，
//    3.4 消费者开 skipLibCheck:false 会报 73 条 TS2707（已发生）
// 5) 产物里不得有不可达 chunk —— 本机删不掉旧 dist，旧版本代码会跟着发布（见 [5] 注释）
// 6) 体积预算 —— 大块产物设绝对上限防「慢慢变胖没人看」（基线 2026-09-20，含 15~30% 余量）
// 7) 产物陈旧度 —— dist 必须比 src 新，否则上面 6 项验的都是上一次构建的快照
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { gzipSync } from 'node:zlib'

const fail = []
// 目录排除**按 basename 判**，不按完整路径判。
//
// 为什么：原实现是 `/node_modules|dist|\.git|reports|test-results|tests|docs/.test(p)` 匹配整个路径，
// 于是 `walk('dist')` 里每个子目录（`dist\amap`、`dist\css`…）都命中 "dist" → **整棵子树被跳过**。
// 实测：`walk('dist')` 只返回 **36 / 420** 个文件 —— 体积预算因此一直在检查顶层那 36 个，
// `form-builder\index.js`(660KB)、`dist\css\*` 这些真正会变胖的东西从未被看过（预算规则白写了）。
// 按 basename 判后，根目录 `dist` 不会被自己排除，排除意图（跳过这些**子**目录）保持不变。
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'reports', 'test-results', 'tests', 'docs'])
const walk = (d, out = []) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(p, out)
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
console.log(
  `[1] 声明完整性 vue=${srcVue.length - missing.length}/${srcVue.length}  ts=${srcTs.length - missingTs.length}/${srcTs.length}`,
)

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
  // [2026-11-08] 700 → 710：新增滚动边缘软化接入（designer/OutlineTree 用 useScrollEdge），
  // 实测 form-builder/index.js 701KB 顶破了原来的 700KB。这是**新功能带来的真实增长**
  // （构建已剥离注释，不是文档变长）。留 1.3% 余量：再涨到 710 说明又加了一整套能力，
  // 那时应该拆分而不是继续抬。抬预算必须在这里留痕，不许静默改数。
  [/^form-builder\/index\.js$/, 710], // 原 form-builder-chunk 预算随代码内联迁到 entry
  [/^morphicons-icons-data-.*\.js$/, 700],
  [/^solar-icons-data-.*\.js$/, 280],
  // 随包分发的扫码解码 wasm（base64 文本）：2026-09-28 实测 1271.53KB，+15% 余量。
  // 它只会随 zxing-wasm 版本重生成而变（正源 node scripts/gen-zxing-wasm-data.mjs），
  // 拆成独立懒加载 chunk，只有打开扫码界面才下载——不要合并进 form-chunk（预算 180KB）。
  [/^zxing-wasm-data-.*\.js$/, 1460],
  // 分片形态（#417）：base64 被切成多片，每片单独成 chunk（`zxing-wasm-data.part-N-HASH.js`）。
  // 注意 `data` 后面是**点**不是横线，上面那条正则匹配不到，会落到 150KB 兜底 ——
  // 本轮实测就以 781KB/460KB 误报过一次，所以单独给一条预算。
  [/^zxing-wasm-data\.part-\d+-.*\.js$/, 900],
  [/^data-chunk-.*\.js$/, 320],
  [/^form-chunk-.*\.js$/, 180],
  [/^route-planner\/index\.js$/, 100],
  [/^chart\/index\.js$/, 60],
  [/^login\/index\.js$/, 40],
  [/^nav\/index\.js$/, 25],
  [/^vcl-ui\.js$/, 15], // 主入口已是 re-export 薄壳（9KB），壳膨胀即说明隔离被破坏
]
const FALLBACK_BUDGET_KB = 150
const oversize = []
/** 主 CSS 的双口径体积（供汇总行打印） */
let cssStats = null
for (const f of esmChunks) {
  const name = relName(f)
  const kb = (readFileSync(f).length / 1024) | 0
  const hit = BUDGET_KB.find(([re]) => re.test(name))
  const budget = hit ? hit[1] : FALLBACK_BUDGET_KB
  if (kb > budget) oversize.push(`${name}=${kb}KB/预算${budget}KB`)
}
// ── 6a) 主 CSS 预算：**双口径**（未压缩 + gzip），两个都守 —— 2026-10-21 修正 ──
//
// ## 为什么必须改口径（本轮实测得出）
//
// 原预算只有 `CSS_BUDGET_KB = 350`（未压缩字节），实测 345.6 KB → 余量 **1.3%**，
// 技术债台账 TD-01 据此记了「体积闸口接近失效」。
//
// 但实测发现这个焦虑建立在**错误口径**上：
//   · 主 CSS 里注释 **0 KB**、多余空白 **1.2 KB**（构建产物早已压缩过）
//   · gzip 后仅 **43.2 KB**（压缩率 88%）—— 这才是宿主实际下载的量
//   · 13 个域 CSS gzip 合计 143.7 KB（宿主只引自己用的那几个）
//
// 也就是说：未压缩 345 KB 看着吓人，真实传输 43 KB。**继续按未压缩字节定预算，
// 会逼着人为了 5 KB 去删有用的样式，而用户根本感觉不到。**
//
// 正确做法是**两个口径都守**：
//   · gzip 预算（主约束）：反映用户真实体验，超了说明真胖了
//   · 未压缩预算（宽松上限）：防"gzip 好看但原文爆炸"（如大量重复的短规则，
//     gzip 能压得很好，但解析开销与调试体积是真的）
const CSS_GZIP_BUDGET_KB = 60 // 实测 43.2 KB，+39% 余量
const CSS_RAW_BUDGET_KB = 420 // 实测 345.6 KB，+22% 余量（比原来的 350 宽松，因为 gzip 才是主约束）
// ⚠️ 用 `^dist/` 不是 `/dist/`：walk('dist') 返回的是**相对路径**（`dist/vcl-ui.css`），
// 没有前导斜杠。写 `/dist/vcl-ui.css$` 会**永远匹配不到** —— 主 CSS 预算就此静默失效。
// （本轮实测发现：上一轮修 domainCss 时踩的是同一个坑，这里漏改了一处。）
const cssFile = walk('dist')
  .map((f) => f.replaceAll('\\', '/'))
  .find((f) => /^dist\/vcl-ui\.css$/.test(f))
if (cssFile) {
  const buf = readFileSync(cssFile)
  const rawKb = (buf.length / 1024) | 0
  const gzipKb = (gzipSync(buf, { level: 9 }).length / 1024) | 0
  if (gzipKb > CSS_GZIP_BUDGET_KB) {
    oversize.push(`vcl-ui.css(gzip)=${gzipKb}KB/预算${CSS_GZIP_BUDGET_KB}KB`)
  }
  if (rawKb > CSS_RAW_BUDGET_KB) {
    oversize.push(`vcl-ui.css(raw)=${rawKb}KB/预算${CSS_RAW_BUDGET_KB}KB`)
  }
  cssStats = { rawKb, gzipKb }
}

// 6b) 每域 CSS 预算 —— 域级 CSS 是本库卖点（宿主只引自己用的域），但没人看就会慢涨。
//     同样双口径：gzip 是主约束（实测最大 form-builder 19.9 KB），未压缩是宽松上限。
//     2026-10-21 实测（gzip）：form-builder 19.9 / data 18.3 / form 15.6 / route-planner 10.8，
//     其余 ≤10 KB。域 gzip 上限 30 KB（+50% 余量）。
const CSS_DOMAIN_GZIP_BUDGET_KB = 30
const CSS_DOMAIN_RAW_BUDGET_KB = 220
const domainCss = walk('dist')
  .map((f) => f.replaceAll('\\', '/'))
  // ⚠️ 用 `^dist/` 不是 `/dist/`：路径来自 walk('dist') 是相对路径，没有前导斜杠
  .filter((f) => /^dist\/css\/[a-z-]+\.css$/.test(f))
for (const f of domainCss) {
  const name = relName(f)
  const buf = readFileSync(f)
  const rawKb = (buf.length / 1024) | 0
  const gzipKb = (gzipSync(buf, { level: 9 }).length / 1024) | 0
  if (gzipKb > CSS_DOMAIN_GZIP_BUDGET_KB) {
    oversize.push(`${name}(gzip)=${gzipKb}KB/域预算${CSS_DOMAIN_GZIP_BUDGET_KB}KB`)
  }
  if (rawKb > CSS_DOMAIN_RAW_BUDGET_KB) {
    oversize.push(`${name}(raw)=${rawKb}KB/域预算${CSS_DOMAIN_RAW_BUDGET_KB}KB`)
  }
}

// 6c) 总包体积 + ESM/CJS 双格式重复 —— 审查 6.3 第 2 项「分发体积治理」。
//
// 为什么必须单独设总预算：上面按 chunk 设的预算**看不见「两份一样大的东西」**。
// 实测镜鉴：zxing wasm base64 在 ESM 与 CJS 各一份 = 2.43 MB；图标数据双份 = 1.17 MB。
// 单看任何一个文件都没超预算，但它们让「装进来的包」膨胀了一倍。
//
// 口径：按**解包字节**（不是 gzip、不是 npm tarball），因为打包器最终读的是解包产物。
// 基线 2026-10-21：11.74 MB（含刚去掉的 806KB JSON .d.ts）。上限 13.0 MB。
const TOTAL_DIST_BUDGET_MB = 13.0
const allFiles = walk('dist').map((f) => f.replaceAll('\\', '/'))
let distBytes = 0
const byExt = new Map()
const esmByStem = new Map()
const cjsByStem = new Map()
for (const f of allFiles) {
  let size
  try {
    size = readFileSync(f).length
  } catch {
    continue
  }
  distBytes += size
  const ext = f.slice(f.lastIndexOf('.'))
  byExt.set(ext, (byExt.get(ext) ?? 0) + size)
  // 同名不同格式：`xxx-HASH.js` 与 `xxx-HASH.cjs`
  // ⚠️ 必须**先去掉 hash** 再配对：ESM 与 CJS 是两次构建，hash 不同
  // （如 `zxing-wasm-data-D7EA5GM7.js` vs `zxing-wasm-data-BZmlrd34.cjs`）。
  // 第一版没去 hash，配对数为 0，把 2.43MB 的真实重复报成 0.60MB。
  const stem = f.replace(/\.(js|cjs)$/, '').replace(/-[A-Za-z0-9_-]{8}$/, '')
  if (/\.js$/.test(f)) esmByStem.set(stem, size)
  else if (/\.cjs$/.test(f)) cjsByStem.set(stem, size)
}
const distMB = distBytes / 1024 / 1024
if (distMB > TOTAL_DIST_BUDGET_MB) {
  fail.push(`dist 总体积 ${distMB.toFixed(2)}MB 超预算 ${TOTAL_DIST_BUDGET_MB}MB`)
}
// 双格式重复量（仅报告，不判失败：双格式是既定产物形态，宿主只用其中一份）
let dualBytes = 0
for (const [stem, esm] of esmByStem) {
  const cjs = cjsByStem.get(stem)
  if (cjs) dualBytes += Math.min(esm, cjs)
}
const fmt = (b) => `${(b / 1024 / 1024).toFixed(2)}MB`
console.log(
  `[6] 体积预算 超限=${oversize.length} · dist 总计 ${fmt(distBytes)}/${TOTAL_DIST_BUDGET_MB}MB` +
    ` · 域 CSS ${domainCss.length} 个 · 双格式重复 ${fmt(dualBytes)}（${((dualBytes / distBytes) * 100).toFixed(0)}%，仅报告）`,
)
// 主 CSS 双口径必须打印出来：只报未压缩值会让人误以为"快撑爆了"（实测 raw 345KB / gzip 43KB）
if (cssStats) {
  console.log(
    `    主 CSS: raw ${cssStats.rawKb}KB/${CSS_RAW_BUDGET_KB}KB · ` +
      `**gzip ${cssStats.gzipKb}KB/${CSS_GZIP_BUDGET_KB}KB**（gzip 才是宿主实际下载量）`,
  )
}
if (oversize.length) fail.push(`产物超体积预算: ${oversize.join(', ')}`)

/**
 * [7] **产物陈旧度**：dist 必须比 src 新。
 *
 * 为什么需要这一节：上面 6 项全部读 `dist/`，而 dist 是上一次构建的快照。
 * 于是"新增了一个 .ts 但没构建"会表现为 `[1] .ts 缺声明文件` —— **看起来像配置错**，
 * 实际只是没 build（本轮就撞了一次：抽出 `_internal/icon-variants.ts` 后先看到"缺声明"，
 * 重跑 `npm run build` 后自动通过）。
 *
 * 更危险的是反向：源码删了什么/改小了，dist 还是旧的 → **各项全绿，但验的是旧产物**。
 * 这里把"陈旧"显式判红，让红的原因指向真正的原因。
 *
 * 判据：src/ 下最新 mtime > dist/ 下最新 mtime → 陈旧（构建产物总是晚于输入，正常情况下必然更晚）。
 */
const newestMtime = (dir) => {
  let newest = 0
  const visit = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) visit(p)
      } else {
        const t = statSync(p).mtimeMs
        if (t > newest) newest = t
      }
    }
  }
  visit(dir)
  return newest
}
const srcNewest = newestMtime('src')
const distNewest = newestMtime('dist')
const staleMs = srcNewest - distNewest
if (staleMs > 1000) {
  fail.push(
    `dist 比 src 旧 ${(staleMs / 1000).toFixed(0)}s —— 上面 6 项验的是旧产物。先 npm run build 再跑本脚本`,
  )
}
console.log(`[7] 产物陈旧度 src 最新 - dist 最新 = ${(staleMs / 1000).toFixed(0)}s（>1s 即判红）`)


if (fail.length) {
  console.error('\n❌ verify:pkg 未通过')
  fail.forEach((f) => console.error('   - ' + f))
  process.exit(1)
}
console.log('\n✅ verify:pkg 通过')
