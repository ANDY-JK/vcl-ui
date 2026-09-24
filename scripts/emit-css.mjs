// 域级 CSS 组装（M7）——vite lib 模式下 cssCodeSplit 按 CHUNK 出 CSS（不按入口聚合）：
//   - tokens.css 等根级共享样式被 manualChunks 归入 core-chunk.css（唯一带 :root 声明的文件）
//   - 各域样式散落在自己的 chunk CSS（data-chunk.css / chart.css …，命名随 chunk）
// 直接交付会破坏两个契约：'vcl-ui/css'（全量单文件）消失；域 CSS 不自包含（缺 tokens 声明，
// var() 全部悬空）。本脚本在 build 后组装出两种产物：
//   dist/vcl-ui.css          全量 = core + 全部域（按 DOMAINS 顺序稳定拼接），恢复 'vcl-ui/css' 契约
//   dist/css/<domain>.css    域自包含 = core + 该域，经既有 exports "./dist/*" 通配按需引用
// 域 → chunk CSS 的命名随 manualChunks / Vite 版本可能变化：找不到映射直接红，不静默跳过。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'dist'
const CORE = join(DIST, 'core-chunk.css')
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

/** 域的 chunk CSS：优先入口同名 <domain>.css，其次 manualChunks 命名的 <domain>-chunk.css；
 *  basic/feedback/layout/wc 的样式全部在 core-chunk 里，返回 null 属正常。 */
function domainCssPath(domain) {
  for (const name of [`${domain}.css`, `${domain}-chunk.css`]) {
    const p = join(DIST, name)
    if (existsSync(p)) return p
  }
  return null
}

const fail = []
if (!existsSync(CORE)) fail.push(`缺 ${CORE} —— manualChunks 的根级 CSS 归类被改了，先修归类再组装`)
const coreCss = existsSync(CORE) ? readFileSync(CORE, 'utf8') : ''

const domainParts = []
for (const d of DOMAINS) {
  const p = domainCssPath(d)
  domainParts.push({ domain: d, css: p ? readFileSync(p, 'utf8') : '' })
}
// 有独立 chunk CSS 的域数应符合预期：太少说明 Vite 产物形态变了（映射失效）
const withCss = domainParts.filter((p) => p.css)
if (withCss.length < 8) fail.push(`仅 ${withCss.length} 个域找到独立 CSS（预期 ≥8）——Vite 产物命名变了，核对 domainCssPath 映射`)

if (fail.length) {
  console.error('\n❌ emit-css 未通过：')
  fail.forEach((f) => console.error('   - ' + f))
  process.exit(1)
}

// 全量：core（含 tokens 声明）→ 各域，按 DOMAINS 顺序
writeFileSync(join(DIST, 'vcl-ui.css'), [coreCss, ...domainParts.map((p) => p.css)].filter(Boolean).join('\n'))

// 域自包含：core + 该域（13 域统一产出，无独立样式的域=core 副本，消费口径一致）
mkdirSync(join(DIST, 'css'), { recursive: true })
for (const { domain, css } of domainParts) {
  writeFileSync(join(DIST, 'css', `${domain}.css`), css ? `${coreCss}\n${css}` : coreCss)
}

console.log(`[emit-css] vcl-ui.css + dist/css/ 下 ${domainParts.length} 个域自包含 CSS（core ${Math.round(coreCss.length / 1024)}KB）`)
