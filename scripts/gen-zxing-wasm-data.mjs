// 生成 src/components/_internal/zxing-wasm-data.ts(+ 分片) —— 把扫码解码器的 wasm 二进制随包分发
//
// 为什么要它：zxing-wasm 的默认 `locateFile`（见 node_modules/zxing-wasm/dist/es/share.js 里的 W 常量）
// 把 `zxing_reader.wasm` 映射到 https://fastly.jsdelivr.net/npm/zxing-wasm@<ver>/dist/reader/…，
// 于是**首次扫码必须联网向第三方 CDN 取约 950KB 二进制**。CDN 一抖用户就是「识别中…」长挂
// （2026-09-28 实测：整链尾段 >45s 不返回；见 docs/全量审查报告-2026-09-28.md §9.7）。
// 本脚本把 npm 包里那个 wasm 原样搬进仓，运行时以 `wasmBinary` 直接喂给解码器，扫码零外发。
//
// ## 为什么 base64 要分片（#416）
//
// 全部 base64 有 1.27MB。esbuild 在**单次输入 > 1MiB** 时会把它落成
// `%TEMP%\esbuild-<hash>` 临时文件再交给子进程；而 Windows 上这个临时文件经常**删不掉**
// （`Error: remove …: Access is denied.`），于是 transform 直接失败 —— 实测表现是
// `zxing-wasm-data.spec.ts` 与 `barcode-decoder-warm-guard.spec.ts` 双双红、整链第 28 步断。
// 阈值实测：900KB 正常、1.1MB 必失败。所以把 base64 切成每片 ≤ 800KB 的多个模块，
// 由 barrel 拼接导出；任何一片都在阈值内，transform 不再落临时文件。
//
// 用法：
//   node scripts/gen-zxing-wasm-data.mjs           # 生成/覆盖
//   node scripts/gen-zxing-wasm-data.mjs --check    # 只检不改：与 node_modules 里的正源漂移即 exit 1
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WASM_REL = 'node_modules/zxing-wasm/dist/reader/zxing_reader.wasm'
const PKG_REL = 'node_modules/zxing-wasm/package.json'
const OUT_REL = 'src/components/_internal/zxing-wasm-data.ts'
const META_REL = 'src/components/_internal/zxing-wasm-data-meta.ts'
const PART_DIR_REL = 'src/components/_internal'
const PART_PREFIX = 'zxing-wasm-data.part-'
/**
 * 单片 base64 的字符上限。取 800_000：远低于 esbuild 的 1MiB 落盘阈值（实测 900KB 仍安全、
 * 1.1MB 必失败），留出 20% 余量让"以后 wasm 变大"不会立刻又踩线。
 */
const PART_CHARS = 800_000

const CHECK = process.argv.includes('--check')

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

/** 读正源 wasm；返回 { bytes, base64, sha, version } */
function readSource() {
  const wasmPath = path.join(ROOT, WASM_REL)
  if (!existsSync(wasmPath)) {
    console.error(`[zxing-wasm-data] 找不到正源：${WASM_REL}（先 npm install，zxing-wasm 是 dependency）`)
    process.exit(1)
  }
  const buf = readFileSync(wasmPath)
  // wasm 魔数 \0asm —— 取错文件（比如误读 JS）时先在这里拦住，别让坏数据进产物
  if (!(buf[0] === 0x00 && buf[1] === 0x61 && buf[2] === 0x73 && buf[3] === 0x6d)) {
    console.error(`[zxing-wasm-data] ${WASM_REL} 不是 wasm 二进制（魔数不是 \\0asm），拒绝生成`)
    process.exit(1)
  }
  const pkg = JSON.parse(readFileSync(path.join(ROOT, PKG_REL), 'utf8'))
  return { buf, base64: buf.toString('base64'), sha: sha256(buf), version: pkg.version }
}

/** 把 base64 切成若干片（顺序即拼接顺序） */
function splitParts(base64) {
  const chunks = []
  for (let i = 0; i < base64.length; i += PART_CHARS) chunks.push(base64.slice(i, i + PART_CHARS))
  return chunks
}

function partName(idx) {
  return `${PART_PREFIX}${idx}.ts`
}

function renderPart(idx, chunk, total) {
  return `// ⚠️ 生成文件·勿手改 —— 见 scripts/gen-zxing-wasm-data.mjs（第 ${idx}/${total} 片）
//
// 为什么要分片（#416）：esbuild 在单次输入 > 1MiB 时会落 %TEMP% 临时文件，而 Windows 上
// 那个临时文件常删不掉（Access is denied）→ transform 直接失败、整链第 28 步断。
// 每片都控制在 ${PART_CHARS} 字符（base64 全量 ${total} 片），任何一片都不触发落盘。
export const PART_${idx}: string =
  '${chunk}'
`
}

/** 元数据单独成文件（#417）：运行期先取 sha256 做 ABI 校验，再按需取分片 —— 两者不该绑在一起 */
function renderMeta(src) {
  return `// ⚠️ 生成文件·勿手改 —— 正源：${WASM_REL}
// 生成：node scripts/gen-zxing-wasm-data.mjs ／ 只检不改：node scripts/gen-zxing-wasm-data.mjs --check
//
// 为什么单独成文件（#417）：运行期要先拿 sha256 判断"随包 wasm 与宿主装的 zxing JS 是否配套"，
// 若这一步就得把 1.27MB base64 拉进来，就没法既早校验又晚取字节。元数据只有几百字节，
// 分片（${PART_PREFIX}N.ts）仍然只在真要用解码器时才下载。
/** 随包 wasm 来自哪个 zxing-wasm 版本（版本与宿主装的 JS 不一致时，运行时退回默认取件方式） */
export const ZXING_WASM_DATA_VERSION: string = '${src.version}'

/** 随包 wasm 的 sha256 —— 与 zxing-wasm 包内导出的 ZXING_WASM_SHA256 同值 */
export const ZXING_WASM_DATA_SHA256: string = '${src.sha}'

/** 随包 wasm 的原始字节数（base64 解码后必须正好是这个数） */
export const ZXING_WASM_DATA_BYTES: number = ${src.buf.length}
`
}

function renderBarrel(src, total) {
  const imports = Array.from(
    { length: total },
    (_, i) => `import { PART_${i + 1} } from './${PART_PREFIX}${i + 1}'`,
  ).join('\n')
  const sum = Array.from({ length: total }, (_, i) => `PART_${i + 1}`).join(' + ')
  return `// ⚠️ 生成文件·勿手改 —— 正源：${WASM_REL}
// 生成：node scripts/gen-zxing-wasm-data.mjs ／ 只检不改：node scripts/gen-zxing-wasm-data.mjs --check
//
// 用途：把 zxing-wasm 的解码 wasm 二进制随本包分发，使首次扫码不再向 fastly.jsdelivr.net 取件
// （zxing-wasm 默认 locateFile 走那个 CDN，网络一抖就是「识别中…」长挂，根因见
//  docs/全量审查报告-2026-09-28.md §9.7）。消费方见 useBarcodeScanner.ts 的 warmBarcodeDecoder。
//
// 体积：base64 文本 ${(src.base64.length / 1024 / 1024).toFixed(2)}MB（原始 ${src.buf.length.toLocaleString('en-US')} 字节），
// 由 manualChunks 拆成独立懒加载 chunk，只有真的打开扫码界面才会加载。
// 分片：base64 被切成 ${total} 片（${PART_PREFIX}1..${total}）；元数据在 zxing-wasm-data-meta.ts（#417）。
// **本文件只给测试与对账闸门用**：运行期走 zxing-wasm-data-load.ts（先取 meta 校 ABI，再按需取分片）。
// 换版：升级 zxing-wasm 后重跑本脚本；sha256 与 zxing-wasm 自己导出的 ZXING_WASM_SHA256 由
// tests/unit/zxing-wasm-data.spec.ts 做同源断言，对不上就是正源被换过（会红，别改断言迁就）。
${imports}
export {
  ZXING_WASM_DATA_VERSION,
  ZXING_WASM_DATA_SHA256,
  ZXING_WASM_DATA_BYTES,
} from './zxing-wasm-data-meta'

/**
 * zxing_reader.wasm 的 base64（无 data: 前缀，解码见 useBarcodeScanner.ts），由各分片按序拼接。
 * 常量显式标了类型：不标的话 vite-plugin-dts 会把这个字面量类型抄进
 * \`dist/_internal/zxing-wasm-data.d.ts\`，同一份 base64 在发布包里白带两遍。
 */
export const ZXING_WASM_DATA_BASE64: string = ${sum}
`
}

const src = readSource()
const chunks = splitParts(src.base64)
const expected = new Map([
  [META_REL, renderMeta(src)],
  [OUT_REL, renderBarrel(src, chunks.length)],
  ...chunks.map((c, i) => [`${PART_DIR_REL}/${partName(i + 1)}`, renderPart(i + 1, c, chunks.length)]),
])

/** 目录里现存的旧分片（比如片段数变少时要删掉多余的） */
function stalePartFiles() {
  const dir = path.join(ROOT, PART_DIR_REL)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.startsWith(PART_PREFIX) && f.endsWith('.ts') && !expected.has(`${PART_DIR_REL}/${f}`))
    .map((f) => `${PART_DIR_REL}/${f}`)
}

if (CHECK) {
  const drifts = []
  for (const [rel, want] of expected) {
    const abs = path.join(ROOT, rel)
    if (!existsSync(abs)) {
      drifts.push(`${rel} 不存在`)
      continue
    }
    if (readFileSync(abs, 'utf8') !== want) drifts.push(`${rel} 内容漂移`)
  }
  for (const rel of stalePartFiles()) drifts.push(`${rel} 是多余分片（分片数已变）`)
  if (drifts.length) {
    const curSha =
      (existsSync(path.join(ROOT, OUT_REL)) &&
        readFileSync(path.join(ROOT, OUT_REL), 'utf8').match(/ZXING_WASM_DATA_SHA256 = '([0-9a-f]+)'/)?.[1]) ||
      '(读不到)'
    console.error(`[zxing-wasm-data] 与正源不一致：仓内登记 sha256=${curSha.slice(0, 16)}…，正源 sha256=${src.sha.slice(0, 16)}…`)
    for (const d of drifts) console.error(`  · ${d}`)
    console.error(`  修法：node scripts/gen-zxing-wasm-data.mjs 重新生成（正源 ${WASM_REL}，版本 ${src.version}）`)
    process.exit(1)
  }
  console.log(
    `[zxing-wasm-data] 与正源一致（v${src.version}，${src.buf.length} 字节，${chunks.length} 片，sha256 ${src.sha.slice(0, 16)}…）`,
  )
  process.exit(0)
}

for (const [rel, text] of expected) {
  writeFileSync(path.join(ROOT, rel), text, { encoding: 'utf8', newline: 'lf' })
}
const removed = stalePartFiles()
for (const rel of removed) rmSync(path.join(ROOT, rel))
console.log(
  `[zxing-wasm-data] 已生成 ${OUT_REL}（+ ${chunks.length} 片）：v${src.version} ${src.buf.length} 字节 → base64 ${src.base64.length} 字符` +
    (removed.length ? `，清理多余分片 ${removed.length} 个` : ''),
)
