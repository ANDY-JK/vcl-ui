// 闸口：docs-site/components/ 必须与源码重新生成的结果逐字节一致（Q9-半）
//
// 为什么需要它：组件 API 文档是生成的，改了源码不重新生成 = 文档静默漂移
// （demo 表有 check:demo-props 守谎报，库自己的参考文档此前是零）。本闸口把
// 「重新生成无 diff」变成机械断言，改 props 忘跑 gen:docs 直接红。
//
// 判定两档：
//   1) 漂移：重新生成到临时目录，与 docs-site/components 逐文件比对
//   2) 解析缺口：manifest.unparsed 非空（组件 props 解析不了，宁缺毋假）
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { generate } from './gen-docs.mjs'
import { renderGovernanceIndex } from './gen-governance-index.mjs'

const ROOT = process.cwd()
/**
 * 已提交文档目录：默认 docs-site/components；
 * 自测时用 `--committed <dir>` 指到夹具（生成侧仍读真实 src，所以夹具只需要放"错误版本"）。
 */
const committedIdx = process.argv.indexOf('--committed')
const fixtureMode = committedIdx > -1
const COMMITTED = fixtureMode ? process.argv[committedIdx + 1] : path.join(ROOT, 'docs-site/components')
/**
 * 治理索引的仓库根（TD-103，#388）：默认 cwd；`--root <dir>` 只影响治理索引这一半
 * （API 文档那半永远读真实 src），供自测把它指到夹具目录。
 */
const rootIdx = process.argv.indexOf('--root')
const GOV_ROOT = rootIdx > -1 ? path.resolve(process.argv[rootIdx + 1]) : ROOT
const fail = []

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vcl-docs-'))
try {
  const manifest = generate(tmp)

  if (manifest.unparsed.length) {
    fail.push(`组件 API 解析失败 ${manifest.unparsed.length} 个：${manifest.unparsed.join(', ')}`)
  }

  // 逐文件比对（含 manifest.json）
  const list = (d) =>
    fs
      .readdirSync(d, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? list(path.join(d, e.name)) : [path.join(d, e.name)]))
  const rel = (p) => path.relative(tmp, p).replaceAll('\\', '/')
  const fresh = new Map(list(tmp).map((f) => [rel(f), fs.readFileSync(f, 'utf8')]))
  const current = new Map(
    fs.existsSync(COMMITTED)
      ? list(COMMITTED).map((f) => [path.relative(COMMITTED, f).replaceAll('\\', '/'), fs.readFileSync(f, 'utf8')])
      : [],
  )

  for (const [name, content] of fresh) {
    if (!current.has(name)) fail.push(`缺少生成文件 ${name}（跑 npm run gen:docs）`)
    else if (current.get(name) !== content) fail.push(`文档漂移 ${name}（源码改过？跑 npm run gen:docs 重新生成）`)
  }
  for (const name of current.keys()) {
    if (!fresh.has(name)) fail.push(`多余文件 ${name}（barrel 删了导出？跑 npm run gen:docs 清理）`)
  }

  console.log(
    `[check:docs] ${fresh.size} 个生成文件，漂移 ${fail.filter((f) => f.startsWith('文档漂移')).length}，` +
      `解析失败 ${manifest.unparsed.length}`,
  )
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}

// ==================== 治理索引也要比对（TD-103，#388） ====================
//
// `gen:governance-index` 产出的 `docs/protected-files.md`
// 此前**只有写、没有校验**：本闸口只扫 docs-site/components，于是索引能静默漂移 ——
// #387 重跑时才发现 `Toast.vue` 头部带 `⛔ 保护` 却不在索引里（82 → 83）。
//
// 修法：把生成器抽成 `renderGovernanceIndex()`（纯函数，只算不写），这里重新算一遍
// 与已提交文件逐字节比对。**不新增质量链步骤** —— 它和 API 文档是同一类产物
// （"生成的文档不许漂移"），挂在同一个闸口里比再立一道更贴近它守的东西。
//
// 夹具模式（--committed）下跳过：该参数只用于"喂一份过期的 API 文档"，
// 夹具目录里本来就没有这份治理索引文件。
let govDrift = 0
if (!fixtureMode) {
  const { files: govFiles, stats: govStats } = renderGovernanceIndex(GOV_ROOT)
  for (const [relPath, content] of Object.entries(govFiles)) {
    const p = path.join(GOV_ROOT, relPath)
    if (!fs.existsSync(p)) {
      fail.push(`缺少生成文件 ${relPath}（跑 npm run gen:governance-index）`)
      govDrift++
    } else if (fs.readFileSync(p, 'utf8') !== content) {
      fail.push(`文档漂移 ${relPath}（跑 npm run gen:governance-index 重新生成）`)
      govDrift++
    }
  }
  console.log(
    `[check:docs] 治理索引 ${Object.keys(govFiles).length} 份（受保护文件 ${govStats.protectedCount} 个），漂移 ${govDrift}`,
  )
}

if (fail.length) {
  console.error('\n❌ check:docs 未通过')
  fail.forEach((f) => console.error('   - ' + f))
  process.exit(1)
}
console.log('\n✅ check:docs 通过')
