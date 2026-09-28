// 第三方许可声明清单（含 SBOM 片段）生成 + 合规闸口。
//
// 为什么需要它：本库把 xlsx（Apache-2.0）、vue-i18n/jszip/lodash-es/@vuemap 系（MIT）、
// dijkstrajs（MIT）等第三方代码**打进产物再分发**。Apache-2.0 §4 要求在再分发时保留许可与
// NOTICE；MIT/ISC 要求在副本或实质部分里带版权与许可声明。此前产物里只有我们自己的 MIT
// LICENSE，没有任何第三方声明——这是对外法律姿态的缺口（第四轮审查 F1）。
//
// 两个口径决定，都是"少报才是风险、多报是虚报"的取舍：
// ① 进包判定取 rollup 的 chunk.modules（dist/third-party-modules.json），不取 npm 依赖树。
//    依赖树会把 jszip 的 pako/lie/readable-stream、qrcode 的 yargs/cliui 一并列进来，
//    而实测 jszip 走 dist/jszip.min.js 单文件、qrcode 走 lib/browser.js，那些件一行没进包。
// ② 许可字段与文本一律从 node_modules 里该件自己的发布物读，不手写、不猜；
//    上游 tarball 没附文本的（@vue/devtools-api）如实标注"仅 license 字段"。
//
// 模式：
//   node scripts/gen-third-party-licenses.mjs          # 生成（build 末尾自动跑）
//   node scripts/gen-third-party-licenses.mjs --check   # 闸口：只检不改，四项判定任一不过即非零退出
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ==================== 判据（纯函数，可单测） ====================

/**
 * 允许随包再分发的许可证白名单。
 * 收紧是有意的：copyleft（GPL/LGPL/AGPL/MPL/CC-BY-SA/CPOL…）不进白名单，
 * 命中即红——因为本库无法替消费者履行"衍生作品同样开源"这类义务，
 * 需要人来决定（换件 / 让它走 external / 明确接受义务）。
 * 加条目请在 PR 里写明该许可证对"打包再分发"的实际义务。
 */
export const ALLOWED_SPDX = new Set([
  'MIT',
  'ISC',
  'Apache-2.0',
  'Zlib',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'CC-BY-4.0',
  'BlueOak-1.0.0',
  'Python-2.0',
  'Unlicense',
  'WTFPL',
])

/** OR 双许可的择优顺序：义务最轻者在前 */
export const PREFER_ORDER = ['MIT', 'ISC', 'Apache-2.0', 'BSD-3-Clause', 'BSD-2-Clause', 'Zlib', '0BSD', 'CC-BY-4.0']

/**
 * 解析 SPDX 表达式字段。上游写法有三种：`"MIT"`、`"(MIT OR GPL-3.0-or-later)"`、
 * `"(MIT AND Zlib)"`；另有一类 `"SEE LICENSE IN <file>"`（无法机器判定，视作不可解析）。
 * @param {unknown} raw package.json 的 license 字段（string | {type} | 缺失）
 * @returns {{atoms:string[], op:'single'|'OR'|'AND'|'unknown', raw:string}}
 */
export function parseSpdx(raw) {
  const s = typeof raw === 'string' ? raw.trim() : raw && typeof raw === 'object' ? String(raw.type || '').trim() : ''
  if (!s) return { atoms: [], op: 'unknown', raw: '' }
  const body = s.replace(/^\((.*)\)$/, '$1').trim()
  const orParts = body.split(/\s+OR\s+/i)
  const andParts = body.split(/\s+AND\s+/i)
  const clean = (x) => x.replace(/[()]/g, '').trim()
  if (orParts.length > 1 && andParts.length === 1) return { atoms: orParts.map(clean).filter(Boolean), op: 'OR', raw: s }
  if (andParts.length > 1 && orParts.length === 1) return { atoms: andParts.map(clean).filter(Boolean), op: 'AND', raw: s }
  if (orParts.length > 1 || andParts.length > 1) return { atoms: [body], op: 'unknown', raw: s } // 混用 OR/AND，交人判定
  if (/^SEE LICENSE/i.test(s) || /\s/i.test(body)) return { atoms: [body], op: 'unknown', raw: s }
  return { atoms: [body], op: 'single', raw: s }
}

/**
 * 定出本库实际采用的许可，并标出是否需要在清单里写"择优声明"。
 * @returns {{chosen:string, needsElection:boolean, disallowed:string[]}}
 */
export function electLicense(parsed) {
  const atoms = parsed.atoms
  if (!atoms.length || parsed.op === 'unknown') return { chosen: parsed.raw || 'NOASSERTION', needsElection: false, disallowed: atoms }
  const disallowed = atoms.filter((a) => !ALLOWED_SPDX.has(a))
  if (parsed.op === 'OR') {
    const allowed = atoms.filter((a) => ALLOWED_SPDX.has(a))
    // 没在 PREFER_ORDER 里列出的白名单项排到最后（indexOf=-1 若不拦会抢在 MIT 前面被选中）
    const rank = (a) => {
      const i = PREFER_ORDER.indexOf(a)
      return i < 0 ? PREFER_ORDER.length : i
    }
    const chosen = allowed.slice().sort((a, b) => rank(a) - rank(b))[0] || atoms[0]
    // 双许可里只要有一个白名单项就够本库用；另一个项不在包内，不计违规
    return { chosen, needsElection: atoms.length > 1, disallowed: allowed.length ? [] : disallowed }
  }
  // single / AND：全部成分都必须在白名单内（AND 是两个许可同时适用）
  return { chosen: atoms.join(' AND '), needsElection: false, disallowed }
}

/**
 * 政策判定：哪些件不允许随包分发。
 * @param {{pkg:string, parsed:object, raw:string}[]} entries
 * @returns {string[]} 红项文案（空＝过）
 */
export function policyFindings(entries) {
  const out = []
  for (const e of entries) {
    if (!e.raw) {
      out.push(`${e.pkg}：package.json 无 license 字段（NOASSERTION，不可随包分发）`)
      continue
    }
    if (e.parsed.op === 'unknown') {
      out.push(`${e.pkg}：许可表达式无法机器判定「${e.raw}」，需人工确认再分发义务`)
      continue
    }
    for (const atom of e.parsed.op === 'OR' ? [e.chosen] : e.parsed.atoms) {
      if (!ALLOWED_SPDX.has(atom)) out.push(`${e.pkg}：许可 ${atom} 不在随包分发白名单（copyleft 需人工裁决）`)
    }
  }
  return out
}

/**
 * 进包件的使用附注。只写**有出处**的事实：
 * 高德那条取自 node_modules/@vuemap/amap-jsapi-loader/dist/index.mjs 里的
 * `https://webapi.amap.com/maps?...` 运行时 <script> 注入；xlsx 那条取自仓内 vendor 目录与 VENDOR.json。
 */
const PKG_NOTES = {
  'xlsx':
    '版本 0.20.3 的发布物**已搬进本仓**（`src/components/_internal/xlsx/`，逐字节登记在 `VENDOR.json`，' +
    '校验＝`node scripts/vendor-sheetjs.mjs --check`）。SheetJS 自 2023 年起不再向 npm registry 发布' +
    '（registry 停在 0.18.5），此前依赖写成 `cdn.sheetjs.com` 的 tarball，装机要联网且绕过 registry 审计；' +
    '2026-09-28 起改为仓内 vendor，许可仍为 Apache-2.0，全文随仓走（第 6 节）。',
  '@vuemap/vue-amap':
    '高德 JS API 本体**不在本包里**——由浏览器运行时向 `webapi.amap.com` 注入 `<script>` 加载。随包的只是 Vue 侧封装与加载器；使用需自备高德 key 并遵守高德开放平台服务条款。',
  'jszip': '进包的是其 `dist/jszip.min.js` 单文件，因此依赖树里的 pako/lie/readable-stream/setimmediate 并未进入产物（不列入本清单，列入即虚报）。',
}

/** 合法 npm 包名形态的裸说明符（滤掉产物字符串里的噪声，如 require("util") 之类 Node 内建） */
export const NODE_BUILTINS = new Set([
  'assert', 'buffer', 'child_process', 'constants', 'crypto', 'dns', 'domain', 'events', 'fs', 'http', 'http2',
  'https', 'module', 'net', 'os', 'path', 'process', 'punycode', 'querystring', 'readline', 'stream', 'string_decoder',
  'sys', 'timers', 'tty', 'url', 'util', 'vm', 'zlib',
])

/** '@scope/name/sub' → '@scope/name'；'name/sub' → 'name' */
export function packageRootOf(spec) {
  if (typeof spec !== 'string' || spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('\0')) return null
  if (spec.startsWith('@/')) return null // 本库 tsconfig 路径别名，不是第三方
  const parts = spec.split('/')
  if (spec.startsWith('@')) return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null
  return parts[0] || null
}

/**
 * 从产物文本里取仍为裸说明符的引用（＝真外部件，由宿主安装）
 * @param {string} code
 * @returns {string[]} 包名级说明符
 */
export function externalRootsInCode(code) {
  const RE = /(?:\bfrom\s*|(?<![\w.])import\s+|(?<![\w.$])import\s*\(\s*|\brequire\s*\(\s*)['"]([A-Za-z@][A-Za-z0-9@._\-/]{0,80})['"]/g
  const out = new Set()
  for (const m of code.matchAll(RE)) {
    const root = packageRootOf(m[1])
    if (!root || NODE_BUILTINS.has(root) || !/^(@[^/]+\/)?[a-zA-Z0-9._-]+$/.test(root)) continue
    out.add(root)
  }
  return [...out].sort()
}

/**
 * 「宿主安装的外部件必须已在 package.json 里声明」——否则消费方装完本包直接解析失败。
 * @param {string[]} externalRoots
 * @param {{dependencies?:object, peerDependencies?:object, devDependencies?:object}} pkg
 * @returns {string[]}
 */
export function undeclaredExternals(externalRoots, pkg) {
  const known = new Set([...Object.keys(pkg.peerDependencies || {}), ...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})])
  return externalRoots.filter((r) => !known.has(r))
}

/**
 * 进包件必须是 package.json 运行期依赖的闭包成员——防止"本地靠提升侥幸能解析、
 * 消费方装不到"的件悄悄进了产物。
 * @param {string[]} bundledRoots 进包件名
 * @param {Record<string,object>} readDeps 包名 → 其 dependencies 的映射（由调用方提供，便于单测注入假件）
 * @param {string[]} declaredDeps 直接 dependencies 的键
 * @returns {string[]} 追不到的件
 */
export function undeclaredBundled(bundledRoots, readDeps, declaredDeps) {
  const reach = new Set(declaredDeps)
  const queue = [...declaredDeps]
  while (queue.length) {
    const cur = queue.pop()
    const deps = Object.keys(readDeps(cur) || {})
    for (const d of deps) if (!reach.has(d)) { reach.add(d); queue.push(d) }
  }
  return bundledRoots.filter((r) => !reach.has(r))
}

/**
 * 组装清单正文。ctx 里所有数据都来自产物与上游发布物，本函数只负责排版。
 */
export function renderMarkdown(ctx) {
  const L = []
  L.push('# 第三方许可与随包分发清单（Third-Party Licenses / SBOM）')
  L.push('')
  L.push(
    `> 本文件由 \`npm run build\`（\`scripts/gen-third-party-licenses.mjs\`）**自动生成，请勿手改**；` +
      `核对入口 \`npm run check:licenses\`（只检不改）。`,
  )
  L.push('')
  L.push(`- 本库：\`${ctx.selfName}\` ${ctx.selfVersion}，本体以 **${ctx.selfLicense}** 发布（见包内 \`LICENSE\`）`)
  L.push(`- 证据来源：rollup 构建期记录的产物模块归属（\`dist/third-party-modules.json\`），共 ${ctx.bundled.length} 个第三方包 / ${ctx.totalModules} 个模块文件`)
  L.push('- 口径：**只列代码或数据真进了产物的第三方件**。npm 依赖树里但被 tree-shaking 掉的件不列（列了是虚报）；')
  L.push('  以裸说明符形式留给宿主安装的件见第 3 节，本库不分发其代码。')
  L.push('')
  L.push(`## 1. 随包分发的第三方代码（${ctx.bundled.length} 个包）`)
  L.push('')
  L.push('| 包 | 版本 | 许可（SPDX） | 许可文本来源 | 进包模块 | 上游 |')
  L.push('| --- | --- | --- | --- | --- | --- |')
  for (const e of ctx.bundled) {
    const text = e.textFile ? `\`${e.textFile}\`` : '上游发布物未附文本，仅 `package.json` 的 `license` 字段'
    L.push(`| \`${e.pkg}\` | ${e.version} | ${e.chosen}${e.needsElection ? '（择优，见 §5）' : ''} | ${text} | ${e.modules} | ${e.repo || '—'} |`)
  }
  const notes = ctx.bundled.filter((e) => PKG_NOTES[e.pkg])
  if (notes.length) {
    L.push('')
    L.push('附注：')
    L.push('')
    for (const e of notes) L.push(`- **${e.pkg}**：${PKG_NOTES[e.pkg]}`)
  }
  L.push('')
  L.push(`## 2. 随包分发的第三方数据（图标几何 ${ctx.derived.length} 份 + 二进制 ${ctx.vendors.length} 份）`)
  L.push('')
  L.push('这些是本仓生成的数据文件，但内容取自第三方，其许可在**由本库打包分发**时归本库承担。')
  L.push('')
  L.push('### 2.1 图标几何数据')
  L.push('')
  L.push('| 数据文件 | 取自集合 | 作者 | 许可 | 进包 | 收录规模（判定键） |')
  L.push('| --- | --- | --- | --- | --- | --- |')
  for (const d of ctx.derived) {
    L.push(
      `| \`${d.file.split('/').pop()}\` | ${d.set} | ${d.author} | ${d.spdx} | ${d.inBundle ? '是' : '否'} | ${d.note}；${d.stat}（键 \`${d.marker || '—'}\`） |`,
    )
  }
  L.push('')
  L.push('> CC-BY-4.0 要求署名并许可指向：Solar 图标集合由 **480 Design** 创作，许可页 <https://creativecommons.org/licenses/by/4.0/>；')
  L.push('> 本库只取其 `linear` 变体子集（未改几何），按集合数据接口 `https://api.iconify.design/collections?prefix=solar` 核对过作者与许可字段。')
  L.push('>')
  L.push(
    '> 同一上游许可还覆盖库内由导出名生成的**名录模块**（`_internal/lucide-subset.ts`、`_internal/solar-icons.ts`）：' +
      '它们只含图标名标识符，不含几何，许可归属与上表一致。',
  )
  L.push('')
  if (ctx.vendors.length) {
    L.push('### 2.2 第三方二进制')
    L.push('')
    L.push('rollup 的模块证据只记 JS，这类件按**内容**复算：登记的 sha256 ＝ base64 解码再哈希 ＝ 安装物里正源那份字节，三条全等才算数（判定用 base64 中段 64 字符在产物里检索）。')
    L.push('')
    L.push('| 数据文件 | 内容来源 | 许可 | 进包 | 字节（登记／正源） | sha256 对账 |')
    L.push('| --- | --- | --- | --- | --- | --- |')
    for (const v of ctx.vendors) {
      const ok = v.declaredSha && v.declaredSha === v.recalcSha && v.recalcSha === v.originSha
      L.push(
        `| \`${v.file.split('/').pop()}\` | \`${v.origin}\`（${v.pkg}@${v.ver ?? '—'}，${v.use}） | ${v.spdx} | ${v.inBundle ? '是' : '否'} | ${v.bytes.toLocaleString('en-US')}／${v.originBytes ? v.originBytes.toLocaleString('en-US') : '正源缺失'} | ${ok ? `一致 ${String(v.declaredSha).slice(0, 16)}…` : `不一致：登记 ${String(v.declaredSha).slice(0, 12)}…／解码 ${String(v.recalcSha).slice(0, 12)}…／正源 ${String(v.originSha).slice(0, 12)}…`} |`,
      )
    }
    L.push('')
    for (const v of ctx.vendors) L.push(`- **${v.pkg}**（${v.use}）：${v.why}。上游 JS 本体仍是第 3 节的外部件，由宿主安装；本库只分发上面这份二进制。`)
    L.push('')
  }
  L.push(`## 3. 由宿主安装的外部件（${ctx.externals.length} 个，本库不再分发）`)
  L.push('')
  L.push('产物对这些件保持裸 `import`/`require`，代码不进本包，许可义务归宿主自己的安装。')
  L.push('')
  L.push('| 包 | 声明位置 | 许可 | 本库开发期版本 |')
  L.push('| --- | --- | --- | --- |')
  for (const x of ctx.externals) L.push(`| \`${x.root}\` | ${x.declaredIn} | ${x.license || '—'} | ${x.version || '—'} |`)
  L.push('')
  if (ctx.referencedNotBundled.length) {
    L.push(`## 4. 源码引用但未进包（${ctx.referencedNotBundled.length} 个，不随包分发）`)
    L.push('')
    L.push('| 包 | 声明位置 | 为何未进包 |')
    L.push('| --- | --- | --- |')
    for (const r of ctx.referencedNotBundled) L.push(`| \`${r.root}\` | ${r.declaredIn} | ${r.why} |`)
    L.push('')
  }
  L.push('## 5. 双许可择优与 Apache-2.0 附注')
  L.push('')
  for (const e of ctx.bundled.filter((x) => x.needsElection)) {
    L.push(
      `- **${e.pkg}**：上游许可表达式为 \`${e.raw}\`（双许可）。**本库明确按 ${e.chosen} 条款**分发其代码，` +
        `不使用其中另一条款；第 6 节逐字保留上游的许可文件全文（两种条款都在里面），以免截段丢信息。`,
    )
  }
  const apache = ctx.bundled.filter((x) => x.chosen === 'Apache-2.0')
  for (const e of apache) {
    L.push(
      `- **${e.pkg}**（Apache-2.0）：按 §4(a) 随本清单保留其许可全文（第 6 节），按 §4(b) 上表标明其代码已进入产物文件；` +
        `§4(d) 的 NOTICE 义务以**上游发布物是否附 NOTICE 文件**为准——实测该发布物只附 \`${e.textFile || 'LICENSE'}\`、无 NOTICE 文件，故无额外 NOTICE 内容需随附。`,
    )
  }
  L.push('')
  L.push('## 6. 许可全文')
  L.push('')
  L.push('以下文本逐字取自各件发布物内的许可文件（缺失者见上表标注），保留原始版权声明。')
  L.push('')
  for (const e of ctx.bundled) {
    L.push(`### ${e.pkg}@${e.version} — ${e.chosen}`)
    L.push('')
    if (!e.textBody) {
      L.push('（上游发布物未附许可文本文件；许可依据为其 `package.json` 的 `license` 字段：`' + e.raw + '`）')
      L.push('')
      continue
    }
    L.push(`来源：\`${e.textFile}\``)
    L.push('')
    L.push('```text')
    L.push(e.textBody.replace(/\s+$/, ''))
    L.push('```')
    L.push('')
  }
  L.push(`---`)
  L.push('')
  L.push(`生成：\`scripts/gen-third-party-licenses.mjs\` · 基线：\`dist/third-party-modules.json\`（本库构建产物）`)
  L.push('')
  return L.join('\n')
}

// ==================== 取数（IO） ====================

// 单测在 happy-dom 环境里 import 本文件时，import.meta.url 是 /@fs/ 形式的 http URL，
// fileURLToPath 会直接抛——取不到就退回 cwd（vitest 的 root 即本仓根），纯函数不碰这些路径。
function repoRoot() {
  try {
    return join(fileURLToPath(new URL('.', import.meta.url)), '..')
  } catch {
    return process.cwd()
  }
}

const ROOT = repoRoot()
const DIST = join(ROOT, 'dist')
const SRC = join(ROOT, 'src', 'components')
const NM = join(ROOT, 'node_modules')
const DOC_MD = join(DIST, 'THIRD-PARTY-LICENSES.md')
const DOC_JSON = join(DIST, 'third-party-licenses.json')
const EVIDENCE = join(DIST, 'third-party-modules.json')

function readJson(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

/** markdown 记号在机器可读产物里是噪声 */
function plain(s) {
  return String(s == null ? '' : s).replace(/`/g, '')
}

/** 该件在磁盘上的目录（别名安装时用别名目录） */
function pkgDir(entryName, alias) {
  return join(NM, alias || entryName)
}

/** 在发布物目录里找许可文本文件名（大小写不敏感，LICENSE.* 优先，NOTICE 单独返回） */
export function pickLicenseFile(names) {
  const isLic = (n) => /^(license|licence|copying|copyright)/i.test(n) && !/^package\.json$/i.test(n)
  const lics = names.filter(isLic).sort((a, b) => (a.length === b.length ? a.localeCompare(b) : a.length - b.length))
  return {
    license: lics.find((n) => /^license$/i.test(n)) || lics[0] || null,
    notice: names.find((n) => /^notice(\.|$)/i.test(n)) || null,
  }
}

/** 递归列文件：跳过 node_modules/.git，深度上限防意外钻穿 */
function walkFiles(dir, exts = /\.(ts|vue|js|mjs|cjs)$/, out = [], depth = 0) {
  if (depth > 6) return out
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue
      walkFiles(join(dir, e.name), exts, out, depth + 1)
    } else if (exts.test(e.name)) out.push(join(dir, e.name))
  }
  return out
}

/** 源码里引用的第三方包名（含动态 import），只看库范围 src/components */
function referencedRootsFromSrc(selfName) {
  const out = new Set()
  // 仓内 vendor 的上游代码不参与"源码引用"判定：它自己就是被引进来的第三方件，
  // 且其发布物里满是**注释掉**的 import（SheetJS 的 types.d.ts 就写着 // import * as CFB from "cfb"），
  // 拿它去判"本库引用了 cfb/ssf 却没进包"是假话。它自己的许可走 §1 的 vendor 行。
  const skip = VENDOR_SOURCES.map((s) => s.dir)
  for (const f of walkFiles(SRC)) {
    const rel = f.replaceAll('\\', '/')
    if (skip.some((d) => rel.includes(d))) continue
    for (const r of externalRootsInCode(readFileSync(f, 'utf8'))) out.add(r)
  }
  out.delete(selfName) // 域 barrel 之间用包名互引（vcl-ui/xxx），不是第三方
  return [...out].sort()
}

/** 产物里仍存在的裸说明符 = 真外部件 */
function externalRootsFromDist() {
  const out = new Set()
  for (const f of walkFiles(DIST, /\.(js|cjs)$/)) {
    for (const r of externalRootsInCode(readFileSync(f, 'utf8'))) out.add(r)
  }
  return [...out].sort()
}

/**
 * 进包的图标几何数据：本仓生成的数据文件，其内容取自第三方集合。
 * 「进包与否」用该文件自己的一个键去产物里找，不靠猜。
 */
const DERIVED_SPECS = [
  {
    file: 'src/components/_internal/solar-icons-data.json',
    keysAt: 'icons',
    set: 'Solar（Iconify 集合 `prefix=solar`，8280 图标）',
    author: '480 Design',
    spdx: 'CC-BY-4.0',
    note: '本库取 `linear` 变体子集',
  },
  {
    file: 'src/components/_internal/morphicons-icons-data.json',
    keysAt: null,
    set: 'Lucide 图标几何（经 `@lucide/vue` 的 `__iconNode` 导出抽取，见 `scripts/gen-morphicons-data.mjs`）',
    author: 'Lucide Contributors',
    spdx: 'ISC',
    note: '供 morphicons 形变动画用',
  },
  {
    file: 'src/components/_internal/lucide-icons.json',
    keysAt: null,
    set: 'Lucide 图标名录（名字清单）',
    author: 'Lucide Contributors',
    spdx: 'ISC',
    note: 'IconPicker 的 lucide 面板名录',
  },
]

/**
 * 随包分发的**第三方二进制**（base64 形态）。
 * rollup 的 `chunk.modules` 只记 JS 模块，看不见这类件——它们进没进包、字节对不对，必须单独判。
 * 本库有它是因为 zxing-wasm 的解码 wasm 默认由浏览器向 fastly.jsdelivr.net 取件（CDN 一抖就是
 * 「识别中…」长挂，见 docs/全量审查报告-2026-09-28.md §9.7），2026-09-28 起改为随包分发。
 */
export const VENDOR_BINARIES = [
  {
    file: 'src/components/_internal/zxing-wasm-data.ts',
    pkg: 'zxing-wasm',
    origin: 'node_modules/zxing-wasm/dist/reader/zxing_reader.wasm',
    spdx: 'MIT',
    use: '扫码解码内核（reader wasm）',
    why: '随包后扫码零外发；不随包则首解必须访问 fastly.jsdelivr.net，内网/离线宿主解不出码',
  },
]

/**
 * 从生成文件文本里取随包二进制的登记字段（不 import 生成物：本脚本要在 node 侧独立复算）。
 * @returns {{version: string|null, sha256: string|null, bytes: number, base64: string|null}}
 */
export function readVendoredBinaryModule(text) {
  const pick = (re) => (text.match(re) || [])[1] ?? null
  const base64 = pick(/ZXING_WASM_DATA_BASE64 =\s*\n?\s*'([A-Za-z0-9+/=]+)'/)
  return {
    version: pick(/ZXING_WASM_DATA_VERSION = '([^']+)'/),
    sha256: pick(/ZXING_WASM_DATA_SHA256 = '([0-9a-f]{64})'/),
    bytes: Number(pick(/ZXING_WASM_DATA_BYTES = (\d+)/) ?? 'NaN'),
    base64,
  }
}

/**
 * 逐件复算随包二进制：① 文件在不在；② 登记的 sha256 是否等于 base64 现场解码再哈希的值；
 * ③ 是否等于安装物里正源那份字节（等于＝我们带的就是上游那个文件，不是改写过的）；
 * ④ 是否真在产物里（拿 base64 的一段**内容**去 dist 里搜，不靠文件名）。
 * 任何一环不成立都由 check() 判红——这节声明一旦说谎，比不写更糟。
 */
export function vendorBinaryProbe(specs, { root, distDir, exists = existsSync, read = (p) => readFileSync(p, 'utf8'), readBuf = (p) => readFileSync(p), hash = (b) => createHash('sha256').update(b).digest('hex'), distFiles = () => walkFiles(distDir, /\.js$/) }) {
  return specs.map((spec) => {
    const abs = join(root, spec.file)
    const originAbs = join(root, spec.origin)
    const out = { ...spec, exists: exists(abs), inBundle: false, marker: null, declaredSha: null, recalcSha: null, originSha: null, bytes: 0, originBytes: 0, ver: null }
    if (!out.exists) return out
    const mod = readVendoredBinaryModule(read(abs))
    out.declaredSha = mod.sha256
    out.bytes = Number.isFinite(mod.bytes) ? mod.bytes : 0
    out.ver = mod.version
    if (mod.base64) {
      // 判定键取 base64 中间一段：头尾都可能在压缩/拼接时被改写，中段最能证明"这份字节整份在产物里"
      out.marker = mod.base64.slice(20_000, 20_064)
      out.recalcSha = hash(Buffer.from(mod.base64, 'base64'))
      for (const f of distFiles()) {
        try {
          if (read(f).includes(out.marker)) {
            out.inBundle = true
            break
          }
        } catch {
          /* 读不到即不算进包 */
        }
      }
    }
    if (exists(originAbs)) {
      const buf = readBuf(originAbs)
      out.originSha = hash(buf)
      out.originBytes = buf.length
    }
    return out
  })
}

/**
 * **仓内 vendor 的上游代码**：不在 node_modules 里（构建证据看不见），但确实打进产物。
 * 2026-09-28 起 SheetJS 走这条路（装机不再依赖 `cdn.sheetjs.com`，见 scripts/vendor-sheetjs.mjs）。
 * rollup 的 `chunk.modules` 只记 node_modules 下的模块，所以这类件必须单独登记并逐字复核——
 * 漏登记就是"随包分发 Apache-2.0 代码却不声明"，正是 F1 要防的那件事。
 */
export const VENDOR_SOURCES = [
  {
    pkg: 'xlsx',
    dir: 'src/components/_internal/xlsx',
    manifest: 'src/components/_internal/xlsx/VENDOR.json',
    codeFile: 'xlsx.mjs',
    // 进包判定键：产物被压缩后标识符会改名（`XLSX.version` → `i0.version`），所以取**字符串字面量**——
    // 前者是 SheetJS 代码里的固定路径串（本仓自己的源码零出现），后者带版本，两枚都在才算进包。
    probes: (version) => ['file:///C:/SheetJS/', `"${version}"`],
  },
]

/**
 * 读仓内 vendor 件，产出与 §1 表同形的条目（许可文本从**仓内那份**读，不再依赖安装物）。
 * @param {{root: string, readJson: Function, read: Function, names: Function, distHasAll: (arr:string[])=>boolean}} io
 */
export function vendorSourceEntries(spec, io) {
  return spec.map((s) => {
    const man = io.readJson(join(io.root, s.manifest))
    if (!man) return { pkg: s.pkg, missing: `${s.manifest} 读不到` }
    const names = io.names(s.dir)
    const { license: textFile } = pickLicenseFile(names)
    const parsed = parseSpdx(man.license)
    const { chosen, needsElection } = electLicense(parsed)
    const probes = s.probes(man.version)
    return {
      pkg: s.pkg,
      version: man.version,
      raw: man.license,
      parsed,
      chosen,
      needsElection,
      textFile: textFile || null,
      textBody: textFile ? io.read(join(s.dir, textFile)) : null,
      hasNotice: false,
      repo: `仓内 vendor（正源 ${man.vendoredFrom}，${man.upstreamSource}）`,
      modules: 1,
      vendored: true,
      vendorDir: s.dir,
      sha256: (man.files || []).find((f) => f.path === s.codeFile)?.sha256 || null,
      probeKey: probes.join(' + '),
      inBundle: io.distHasAll(probes),
    }
  })
}

/** 取数据文件里的键名清单（图标名），供挑唯一判定键 */
function keysOfData(abs, keysAt) {
  const data = readJson(abs)
  if (data == null) return []
  if (Array.isArray(data)) return data.filter((x) => typeof x === 'string')
  const src = keysAt && data[keysAt] && typeof data[keysAt] === 'object' ? data[keysAt] : data
  return Object.keys(src)
}

/** 收录规模实时算，不写死——写死的份数会随图标集增删变成假话 */
function statOfData(abs, keysAt) {
  const data = readJson(abs)
  if (data == null) return '读不到文件'
  if (Array.isArray(data)) return `${data.length} 个名字，无几何`
  if (keysAt && data[keysAt] && typeof data[keysAt] === 'object') {
    const main = Object.keys(data[keysAt]).length
    const alias = data.aliases && typeof data.aliases === 'object' ? Object.keys(data.aliases).length : 0
    return `取其中 ${main} 个图标几何${alias ? ` + ${alias} 个别名引用` : ''}，未修改图形`
  }
  const vals = Object.values(data)
  const geo = vals.filter((v) => typeof v !== 'string').length
  return `收录 ${geo} 份几何 + ${vals.length - geo} 个指向规范名的别名引用`
}

/**
 * 「进包与否」用**该文件独有的图标名**去产物里找，不靠猜也不靠文件名：
 * 三份数据的词汇高度重叠（morphicons 几何与 lucide 名录同源 Lucide），
 * 取任一公共名字都会把"另一份文件已不在产物里"这种情形读成绿的。
 */
function derivedProbe(specs) {
  const lists = specs.map((s) => {
    const abs = join(ROOT, s.file)
    return { spec: s, exists: existsSync(abs), keys: existsSync(abs) ? keysOfData(abs, s.keysAt) : [] }
  })
  const others = (i) => new Set(lists.filter((_, j) => j !== i).flatMap((l) => l.keys))
  return lists.map((l, i) => {
    const foreign = others(i)
    const marker = l.keys.find((k) => !foreign.has(k)) || null
    let inBundle = false
    if (marker) {
      for (const f of walkFiles(DIST, /\.js$/)) {
        try {
          if (readFileSync(f, 'utf8').includes(`"${marker}"`)) {
            inBundle = true
            break
          }
        } catch {
          /* 读不到即不算进包 */
        }
      }
    }
    return { ...l.spec, exists: l.exists, inBundle, marker, ambiguous: !marker, stat: l.exists ? statOfData(join(ROOT, l.spec.file), l.spec.keysAt) : '文件缺失' }
  })
}

function buildContext() {
  const pkg = readJson(join(ROOT, 'package.json')) || {}
  const evidence = readJson(EVIDENCE)
  const bundled = Object.entries(evidence || {})
    .map(([name, info]) => {
      const dir = pkgDir(name, info.alias)
      const meta = readJson(join(dir, 'package.json')) || {}
      const parsed = parseSpdx(meta.license)
      const { chosen, needsElection } = electLicense(parsed)
      const names = existsSync(dir) ? readdirSync(dir) : []
      const { license: textFile, notice } = pickLicenseFile(names)
      let textBody = null
      if (textFile) {
        try {
          textBody = readFileSync(join(dir, textFile), 'utf8')
        } catch {
          textBody = null
        }
      }
      // 双许可择优时，上游文本文件里两种条款都在；本库只用 MIT，
      // 但逐字截取条款片段比"整份贴进来"更准确地表达采用的许可——文本仍整体保留，
      // 因为 MIT 条款本身要求带全文，截段反而丢信息。
      const repo = typeof meta.repository === 'string' ? meta.repository : meta.repository && meta.repository.url
      return {
        pkg: name,
        alias: info.alias || null,
        version: meta.version || '未知',
        raw: parsed.raw,
        parsed,
        chosen,
        needsElection,
        textFile,
        textBody,
        hasNotice: !!notice,
        repo: repo || null,
        modules: (info.files || []).length,
        files: info.files || [],
      }
    })
    .sort((a, b) => a.pkg.localeCompare(b.pkg))

  // 仓内 vendor 的上游代码：构建证据里没有它们（不在 node_modules），但确实打进产物，
  // 所以按内容判定键去产物里搜，搜到才算进包，然后与 rollup 那批并成同一张 §1 表。
  let distBlobCache = null
  const distText = () => {
    if (distBlobCache === null) {
      distBlobCache = walkFiles(DIST, /\.js$/)
        .map((f) => {
          try {
            return readFileSync(f, 'utf8')
          } catch {
            return ''
          }
        })
        .join('\n')
    }
    return distBlobCache
  }
  const distHasAll = (needles) => needles.every((n) => distText().includes(n))
  bundled.push(
    ...vendorSourceEntries(VENDOR_SOURCES, {
      root: ROOT,
      readJson,
      read: (rel) => {
        try {
          return readFileSync(join(ROOT, rel), 'utf8')
        } catch {
          return null
        }
      },
      names: (rel) => (existsSync(join(ROOT, rel)) ? readdirSync(join(ROOT, rel)) : []),
      distHasAll,
    }),
  )

  const externalRoots = externalRootsFromDist()
  const externals = externalRoots.map((root) => {
    const meta = readJson(join(NM, root, 'package.json')) || {}
    const parsed = parseSpdx(meta.license)
    return {
      root,
      license: parsed.raw ? electLicense(parsed).chosen : null,
      version: meta.version || null,
      declaredIn:
        pkg.peerDependencies && pkg.peerDependencies[root]
          ? 'peerDependencies'
          : pkg.dependencies && pkg.dependencies[root]
            ? 'dependencies'
            : '未声明',
    }
  })
  const evRoots = bundled.map((b) => b.pkg)
  const refRoots = referencedRootsFromSrc(pkg.name)
  const referencedNotBundled = refRoots
    .filter((r) => !evRoots.includes(r) && !externalRoots.includes(r))
    .map((r) => ({
      root: r,
      declaredIn: pkg.dependencies && pkg.dependencies[r] ? 'dependencies' : pkg.peerDependencies && pkg.peerDependencies[r] ? 'peerDependencies' : '未声明',
      why: '引用它的导出链没有被任何入口触达，构建期按 `sideEffects`（仅 CSS 有副作用）摇掉了，代码不在产物里',
    }))
  const derived = derivedProbe(DERIVED_SPECS)
  const vendors = vendorBinaryProbe(VENDOR_BINARIES, { root: ROOT, distDir: DIST })
  return {
    selfName: pkg.name,
    selfVersion: pkg.version,
    selfLicense: pkg.license,
    selfPkgJson: pkg,
    bundled,
    totalModules: bundled.reduce((s, b) => s + b.modules, 0),
    derived,
    vendors,
    externals,
    externalRoots,
    referencedNotBundled,
    evidenceMissing: !evidence,
  }
}

// ==================== 主流程 ====================

function generate() {
  const ctx = buildContext()
  if (ctx.evidenceMissing) {
    console.error('❌ 缺 dist/third-party-modules.json —— 先跑 npm run build（证据由 vite 构建期写入）')
    process.exit(1)
  }
  const md = renderMarkdown(ctx)
  writeFileSync(DOC_MD, md, 'utf8')
  const sbom = {
    generator: 'scripts/gen-third-party-licenses.mjs',
    component: { name: ctx.selfName, version: ctx.selfVersion, license: ctx.selfLicense },
    bundled: ctx.bundled.map((b) => ({
      name: b.pkg,
      version: b.version,
      license: b.chosen,
      licenseExprRaw: b.raw,
      elected: b.needsElection,
      licenseFile: b.textFile,
      noticeFile: b.hasNotice,
      modules: b.modules,
      ...(b.vendored
        ? { vendored: true, vendoredPath: b.vendorDir, sha256: b.sha256, probeKey: b.probeKey, inBundle: b.inBundle }
        : {}),
      files: b.files,
    })),
    derivedData: ctx.derived.map((d) => ({
      file: d.file,
      set: plain(d.set),
      author: d.author,
      license: d.spdx,
      inBundle: d.inBundle,
      probeKey: d.marker,
      stat: plain(d.stat),
    })),
    vendorBinaries: ctx.vendors.map((v) => ({
      file: v.file,
      from: v.origin,
      originPackage: v.pkg,
      originVersion: v.ver,
      license: v.spdx,
      inBundle: v.inBundle,
      bytes: v.bytes,
      originBytes: v.originBytes,
      sha256: v.declaredSha,
      sha256OfPayload: v.recalcSha,
      sha256OfOrigin: v.originSha,
      probeKey: v.marker,
      reason: v.why,
    })),
    externals: ctx.externals,
    referencedNotBundled: ctx.referencedNotBundled.map((r) => r.root),
  }
  writeFileSync(DOC_JSON, JSON.stringify(sbom, null, 2), 'utf8')
  console.log(
    `[gen:licenses] 进包第三方包=${ctx.bundled.length}（模块 ${ctx.totalModules} 个） 图标数据=${ctx.derived.filter((d) => d.inBundle).length} 随包二进制=${ctx.vendors.filter((v) => v.inBundle).length} 外部件=${ctx.externals.length} 引用未进包=${ctx.referencedNotBundled.length}`,
  )
  console.log(`[gen:licenses] 写出 dist/THIRD-PARTY-LICENSES.md（${Math.round(readFileSync(DOC_MD).length / 1024)}KB）+ dist/third-party-licenses.json`)
}

const L_RED = []

function check() {
  const ctx = buildContext()
  if (ctx.evidenceMissing) L_RED.push('缺 dist/third-party-modules.json —— 证据插件没跑（vite.config 的 thirdPartyEvidencePlugin 被摘了？），先 npm run build')
  if (!existsSync(EVIDENCE)) {
    report('check:licenses')
    return
  }
  // [1] 清单在位且随包发布
  const pkg = ctx.selfPkgJson
  const mdExists = existsSync(DOC_MD)
  const jsonExists = existsSync(DOC_JSON)
  if (!mdExists) L_RED.push('缺 dist/THIRD-PARTY-LICENSES.md（跑 npm run build 生成）')
  if (!jsonExists) L_RED.push('缺 dist/third-party-licenses.json')
  const files = pkg.files || []
  const covered = files.some((f) => f === 'dist' || f === 'dist/' || f === './dist')
  if (!covered) L_RED.push(`package.json 的 files=${JSON.stringify(files)} 不含 dist —— 许可清单不会被 npm publish 带上`)
  if (!existsSync(join(ROOT, 'LICENSE'))) L_RED.push('包根缺 LICENSE 文件 —— 本库自身的 MIT 声明无处可查')
  if (!pkg.license) L_RED.push('package.json 缺 license 字段')
  console.log(`[1] 清单在位与随包发布 md=${mdExists} sbom=${jsonExists} files覆盖dist=${covered} 自身LICENSE=${existsSync(join(ROOT, 'LICENSE'))}`)

  // [2] 双向对账：已声明集 == 产物证据集（多一个少一个都红），且 .md 与 .json 说的是同一批
  const declaredSbom = jsonExists ? (readJson(DOC_JSON)?.bundled || []).map((b) => b.name).sort() : []
  // 证据集＝rollup 记到的（node_modules 里的）；仓内 vendor 件走内容判定键，另算一路
  const evidencePkgs = ctx.bundled.filter((b) => !b.vendored).map((b) => b.pkg)
  const vendoredPkgs = ctx.bundled.filter((b) => b.vendored).map((b) => b.pkg)
  const declaredAll = [...evidencePkgs, ...vendoredPkgs].sort()
  const missing = declaredAll.filter((p) => !declaredSbom.includes(p))
  const extra = declaredSbom.filter((p) => !declaredAll.includes(p))
  // 只看 §1 的表体（整篇匹配会被 §3 外部件的同名行糊弄过去）
  const mdText = mdExists ? readFileSync(DOC_MD, 'utf8') : ''
  const sec1 = mdText.slice(mdText.indexOf('## 1.'), mdText.indexOf('## 2.'))
  const mdNames = [...sec1.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1])
  const mdSet = new Set(mdNames)
  const mdMissing = declaredAll.filter((p) => !mdSet.has(p))
  if (missing.length) L_RED.push(`证据里有 ${missing.length} 个包没进清单：${missing.join(', ')}`)
  if (extra.length) L_RED.push(`清单里声明了 ${extra.length} 个产物里没有的包（虚报）：${extra.join(', ')}`)
  if (mdMissing.length) L_RED.push(`md 正文缺表行：${mdMissing.join(', ')}`)
  console.log(
    `[2] 双向对账 证据=${evidencePkgs.length} 仓内vendor=${vendoredPkgs.length}(${vendoredPkgs.join(',') || '—'}) 声明=${declaredSbom.length} 漏=${missing.length} 多=${extra.length} md缺行=${mdMissing.length}`,
  )

  // [3] 许可政策：白名单 + 可解析 + 有依据
  const policy = policyFindings(ctx.bundled.map((b) => ({ ...b })))
  const noBasis = ctx.bundled.filter((b) => !b.textFile && !b.raw).map((b) => b.pkg)
  if (noBasis.length) L_RED.push(`既无许可文本也无 license 字段：${noBasis.join(', ')}`)
  if (policy.length) L_RED.push(...policy)
  const onlyField = ctx.bundled.filter((b) => !b.textFile).map((b) => b.pkg)
  console.log(`[3] 许可政策 红项=${policy.length} 无文本仅字段=${onlyField.length}${onlyField.length ? '（' + onlyField.join(', ') + '）' : ''}`)

  // [4] 独立复核：外部件必须已声明；进包件必须在运行期依赖闭包内；图标数据进包状态与产物一致
  const undeclExt = undeclaredExternals(ctx.externalRoots, pkg)
  if (undeclExt.length) L_RED.push(`产物里以裸说明符引用的件未在任何依赖段声明：${undeclExt.join(', ')}`)
  const readDeps = (name) => {
    const m = readJson(join(NM, name, 'package.json'))
    return (m && m.dependencies) || {}
  }
  const undeclBundled = undeclaredBundled(
    ctx.bundled.filter((b) => !b.vendored).map((b) => b.pkg),
    readDeps,
    Object.keys(pkg.dependencies || {}),
  )
  if (undeclBundled.length) {
    L_RED.push(
      `进包件不在本库运行期依赖闭包内（消费方 npm install 装不到，本地只是靠提升侥幸解析）：${undeclBundled.join(', ')}`,
    )
  }
  const derivedIn = ctx.derived.filter((d) => d.inBundle)
  const derivedGone = ctx.derived.filter((d) => !d.exists || !d.inBundle)
  // 仓内 vendor 的上游代码：登记、许可文本、"确实打进产物"三条缺一不可
  const srcRows = ctx.bundled.filter((b) => b.vendored)
  const srcNoManifest = srcRows.filter((v) => v.missing).map((v) => `${v.pkg}：${v.missing}`)
  const srcNoLicense = srcRows.filter((v) => !v.missing && !v.textFile).map((v) => `${v.pkg}：仓内目录里没有许可文件`)
  const srcNotBundle = srcRows.filter((v) => !v.missing && !v.inBundle).map((v) => `${v.pkg}（判定键 ${v.probeKey}）`)
  if (srcNoManifest.length) L_RED.push(`仓内 vendor 件缺登记文件，版本与字节无从对账：${srcNoManifest.join(', ')}`)
  if (srcNoLicense.length) L_RED.push(`仓内 vendor 件缺许可全文（Apache-2.0 §4(a) 要求随附）：${srcNoLicense.join(', ')}`)
  if (srcNotBundle.length) L_RED.push(`清单说仓内 vendor 件随包分发、产物里却搜不到它的代码：${srcNotBundle.join(', ')}`)
  // 随包第三方二进制：三条 sha 全等（登记＝base64 现场重算＝安装物正源）且确实出现在产物里
  const vMissingFile = ctx.vendors.filter((v) => !v.exists).map((v) => v.file)
  const vNotBundle = ctx.vendors.filter((v) => v.exists && !v.inBundle).map((v) => v.file)
  const vNoOrigin = ctx.vendors.filter((v) => v.exists && !v.originSha).map((v) => `${v.file}（正源 ${v.origin} 不在安装物里）`)
  const vBadSha = ctx.vendors
    .filter((v) => v.exists && v.originSha && !(v.declaredSha && v.declaredSha === v.recalcSha && v.recalcSha === v.originSha))
    .map((v) => `${v.file}：登记 ${String(v.declaredSha).slice(0, 12)}…／解码重算 ${String(v.recalcSha).slice(0, 12)}…／正源 ${String(v.originSha).slice(0, 12)}…`)
  const vBadBytes = ctx.vendors.filter((v) => v.exists && v.originBytes && v.bytes !== v.originBytes).map((v) => `${v.file}：登记 ${v.bytes} 字节／正源 ${v.originBytes} 字节`)
  if (vMissingFile.length) L_RED.push(`清单声明的随包二进制文件不存在：${vMissingFile.join(', ')}（生成：node scripts/gen-zxing-wasm-data.mjs）`)
  if (vNoOrigin.length) L_RED.push(`随包二进制找不到正源，无法证明它没被改过：${vNoOrigin.join(', ')}`)
  if (vBadSha.length) L_RED.push(`随包二进制与正源字节不一致（声明在说谎或正源漂了），重跑生成脚本：${vBadSha.join('; ')}`)
  if (vBadBytes.length) L_RED.push(`随包二进制登记的字节数与正源不符：${vBadBytes.join('; ')}`)
  if (vNotBundle.length) L_RED.push(`清单说随包分发、产物里却搜不到这份二进制（打包边界变了，离线声明不成立）：${vNotBundle.join(', ')}`)
  const missingFile = ctx.derived.filter((d) => !d.exists).map((d) => d.file)
  const ambiguous = ctx.derived.filter((d) => d.ambiguous).map((d) => d.file)
  if (missingFile.length) L_RED.push(`清单声明的图标数据文件已不存在：${missingFile.join(', ')}`)
  if (ambiguous.length) L_RED.push(`图标数据找不到"只有它才有"的图标名当判定键，进包结论无法证伪：${ambiguous.join(', ')}`)
  if (!derivedIn.length) L_RED.push('三份图标几何数据一个都没在产物里找到 —— 判定键或打包边界变了，先修判定')
  console.log(
    `[4] 独立复核 外部件=${ctx.externalRoots.length}(未声明 ${undeclExt.length}) 进包=${evidencePkgs.length}(闭包外 ${undeclBundled.length}) 仓内vendor=${srcRows.length}(缺登记 ${srcNoManifest.length}·缺许可 ${srcNoLicense.length}·不在产物 ${srcNotBundle.length}) 图标数据进包=${derivedIn.length}/3${derivedGone.length ? '（不在包：' + derivedGone.map((d) => d.file.split('/').pop()).join(', ') + '）' : ''} 随包二进制=${ctx.vendors.length}(进包 ${ctx.vendors.filter((v) => v.inBundle).length}·字节对账不过 ${vBadSha.length + vBadBytes.length})`,
  )
  const vPolicy = ctx.vendors.filter((v) => !ALLOWED_SPDX.has(v.spdx)).map((v) => `${v.file} 声明的 ${v.spdx} 不在允许随包分发的白名单内`)
  if (vPolicy.length) L_RED.push(...vPolicy)

  report('check:licenses', ctx)
}

function report(label, ctx) {
  if (L_RED.length) {
    console.error(`\n❌ ${label} 未通过`)
    L_RED.forEach((f) => console.error('   - ' + f))
    process.exit(1)
  }
  if (ctx) {
    const copyleft = ctx.bundled.filter((b) => b.parsed.op === 'OR' && b.parsed.atoms.length > 1)
    if (copyleft.length) console.log(`[5] 双许可择优声明 ${copyleft.map((c) => c.pkg + '→' + c.chosen).join(', ')}`)
  }
  console.log(`\n✅ ${label} 通过`)
}

// 只在作为脚本直接执行时跑主流程（单测 import 本文件取纯函数）
const isMain =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').replace(/^.*[/\\]scripts[/\\]/, 'scripts/'))
if (isMain) {
  if (process.argv.includes('--check')) check()
  else generate()
}
