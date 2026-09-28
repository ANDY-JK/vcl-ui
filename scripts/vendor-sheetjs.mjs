// 把 SheetJS `xlsx` 的上游发布物搬进仓库（vendor），消除装机期对 cdn.sheetjs.com 的依赖
//
// 为什么要搬：本库依赖 `xlsx@0.20.3`，而 SheetJS 自 2023 起不再向 npm registry 发布
// （registry 停在 0.18.5），package.json 里那条是 `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`。
// 后果是**每次 `npm install` 都要能访问那个域**，而且 tarball 绕过 registry 审计
// （`npm audit` 扫不到它，第四轮审查 F2 记过）。2026-09-28 用户改判：把正源搬进仓，
// 装机器离线可装，代价是仓库多 1.0MB 上游代码（Apache-2.0，许可全文随仓走）。
//
// 用法：
//   node scripts/vendor-sheetjs.mjs              # 从 node_modules/xlsx 搬进仓（首次/换版）
//   node scripts/vendor-sheetjs.mjs --check      # 只检不改：仓内件与 VENDOR.json 登记的字节不符即 exit 1
//
// `--check` 不读 node_modules：搬进来之后仓内就是正源，装机器没有 xlsx 包也要能自证。
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FROM = 'node_modules/xlsx'
const TO = 'src/components/_internal/xlsx'
const CHECK = process.argv.includes('--check')

/** 仓内落点名 → 上游发布物里的路径 */
const FILES = {
  'xlsx.mjs': 'xlsx.mjs',
  'types.d.ts': 'types/index.d.ts',
  LICENSE: 'LICENSE',
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex')

function manifestPath() {
  return join(ROOT, TO, 'VENDOR.json')
}

function buildManifest() {
  const pkg = JSON.parse(readFileSync(join(ROOT, FROM, 'package.json'), 'utf8'))
  const files = Object.entries(FILES).map(([to, from]) => {
    const buf = readFileSync(join(ROOT, FROM, from))
    return { path: to, source: `${from}`, bytes: buf.length, sha256: sha(buf) }
  })
  const code = readFileSync(join(ROOT, FROM, FILES['xlsx.mjs']))
  const verInCode = /XLSX\.version = '([^']+)'/.exec(code.toString('utf8'))?.[1] ?? null
  return {
    package: pkg.name,
    version: pkg.version,
    license: pkg.license,
    // 上游发布物声明的许可表达式（SheetJS 的 package.json 写的是 Apache-2.0）
    upstreamSource: pkg.repository?.url || pkg.homepage || 'https://git.sheetjs.com/sheetjs/sheetjs',
    vendoredFrom: FROM,
    versionMarkerInCode: verInCode,
    files,
  }
}

function renderDts(m) {
  return `// SheetJS ${m.version} 的类型入口（本文件手写，types.d.ts 是上游逐字拷贝）
// 上游 xlsx.mjs 另有 default 导出，本库只用命名空间成员（utils/read/write/writeFile），故不声明 default。
export * from './types'
`
}

function renderReadme(m) {
  return `# 仓内 vendor：SheetJS \`xlsx@${m.version}\`

- **正源**：\`${m.vendoredFrom}\`（安装自 \`${m.upstreamSource}\` 的 npm 发布物；SheetJS 不发 registry，
  0.20.3 那条依赖原本写成 \`https://cdn.sheetjs.com/xlsx-${m.version}/xlsx-${m.version}.tgz\`）
- **许可**：${m.license}（全文见同目录 \`LICENSE\`，随本库分发时按 Apache-2.0 §4 保留）
- **为什么在仓里**：装机器不再需要访问 \`cdn.sheetjs.com\`，且不再绕过 registry 审计留下盲区
- **别手改**：\`xlsx.mjs\` / \`types.d.ts\` / \`LICENSE\` 与 \`VENDOR.json\` 登记的字节必须逐字一致，
  校验＝\`node scripts/vendor-sheetjs.mjs --check\`（整链里的 \`check:vendor-data\` 会跑）
- **换版**：升级后重跑 \`node scripts/vendor-sheetjs.mjs\`（要能访问上游 tarball 装一次），
  再跑整链——许可清单 \`dist/THIRD-PARTY-LICENSES.md\` 里的版本与 sha 会跟着变

| 仓内文件 | 上游路径 | 字节 | sha256 |
| --- | --- | --- | --- |
${m.files.map((f) => `| \`${f.path}\` | \`${f.source}\` | ${f.bytes.toLocaleString('en-US')} | \`${f.sha256.slice(0, 16)}…\` |`).join('\n')}

代码内的版本标记 \`XLSX.version\` ＝ \`${m.versionMarkerInCode}\`（与 package.json 的 ${m.version} 同值才算搬对）。
`
}

/**
 * 校验仓内 vendor 件与 `VENDOR.json` 登记逐字节一致。
 * 不读 node_modules：搬进来之后仓内就是正源，装机器没有 xlsx 包也要能自证。
 * @returns {{bad: string[], summary: string}}
 */
export function checkVendored(root = ROOT) {
  const man = JSON.parse(readFileSync(join(root, TO, 'VENDOR.json'), 'utf8'))
  const bad = []
  for (const f of man.files) {
    const abs = join(root, TO, f.path)
    if (!existsSync(abs)) {
      bad.push(`${f.path} 缺失`)
      continue
    }
    const buf = readFileSync(abs)
    if (buf.length !== f.bytes) bad.push(`${f.path} 字节数 ${buf.length} ≠ 登记 ${f.bytes}`)
    else if (sha(buf) !== f.sha256) bad.push(`${f.path} sha256 与登记不符（被手改过？）`)
  }
  const code = readFileSync(join(root, TO, 'xlsx.mjs'), 'utf8')
  const marker = /XLSX\.version = '([^']+)'/.exec(code)?.[1] ?? null
  if (marker !== man.version) bad.push(`代码内版本标记 ${marker} 与登记的 ${man.version} 不一致`)
  return {
    bad,
    summary: `xlsx@${man.version}（${man.license}）仓内 ${man.files.length} 份文件逐字节一致：${man.files
      .map((f) => `${f.path} ${f.bytes.toLocaleString('en-US')}`)
      .join('，')}`,
  }
}

const isMain =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').replace(/^.*[/\\]scripts[/\\]/, 'scripts/'))

if (!isMain) {
  // 被 import（check:vendor-data 复用 checkVendored）时不执行任何动作
} else if (CHECK) {
  const { bad, summary } = checkVendored()
  if (bad.length) {
    console.error(`❌ vendor(xlsx) 与 VENDOR.json 登记不符（${bad.length} 项）`)
    for (const b of bad) console.error(`   - ${b}`)
    process.exit(1)
  }
  console.log(`[vendor] ${summary}`)
} else {
  main()
}

function main() {
  if (!existsSync(join(ROOT, FROM, 'package.json'))) {
    console.error(`[vendor-sheetjs] 找不到 ${FROM} —— 本脚本只在装过 xlsx 的机器上换版用；日常校验请跑 --check`)
    process.exit(1)
  }
  const m = buildManifest()
  if (m.versionMarkerInCode !== m.version) {
    console.error(
      `[vendor-sheetjs] 上游 package.json 版本 ${m.version} 与代码内标记 ${m.versionMarkerInCode} 不一致，拒绝落仓`,
    )
    process.exit(1)
  }
  mkdirSync(join(ROOT, TO), { recursive: true })
  for (const [to, from] of Object.entries(FILES)) {
    writeFileSync(join(ROOT, TO, to), readFileSync(join(ROOT, FROM, from)))
  }
  writeFileSync(manifestPath(), JSON.stringify(m, null, 2) + '\n', { encoding: 'utf8', newline: 'lf' })
  writeFileSync(join(ROOT, TO, 'xlsx.d.mts'), renderDts(m), { encoding: 'utf8', newline: 'lf' })
  writeFileSync(join(ROOT, TO, 'VENDOR-NOTES.md'), renderReadme(m), { encoding: 'utf8', newline: 'lf' })
  console.log(`[vendor-sheetjs] 已搬入 ${TO}：xlsx@${m.version}，${m.files.map((f) => `${f.path}(${f.bytes})`).join(' ')}`)
}
