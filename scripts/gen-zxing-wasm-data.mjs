// 生成 src/components/_internal/zxing-wasm-data.ts —— 把扫码解码器的 wasm 二进制随包分发
//
// 为什么要它：zxing-wasm 的默认 `locateFile`（见 node_modules/zxing-wasm/dist/es/share.js 里的 W 常量）
// 把 `zxing_reader.wasm` 映射到 https://fastly.jsdelivr.net/npm/zxing-wasm@<ver>/dist/reader/…，
// 于是**首次扫码必须联网向第三方 CDN 取约 950KB 二进制**。CDN 一抖用户就是「识别中…」长挂
// （2026-09-28 实测：整链尾段 >45s 不返回；见 docs/全量审查报告-2026-09-28.md §9.7）。
// 本脚本把 npm 包里那个 wasm 原样搬进仓，运行时以 `wasmBinary` 直接喂给解码器，扫码零外发。
//
// 用法：
//   node scripts/gen-zxing-wasm-data.mjs           # 生成/覆盖
//   node scripts/gen-zxing-wasm-data.mjs --check    # 只检不改：与 node_modules 里的正源漂移即 exit 1
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WASM_REL = 'node_modules/zxing-wasm/dist/reader/zxing_reader.wasm'
const PKG_REL = 'node_modules/zxing-wasm/package.json'
const OUT_REL = 'src/components/_internal/zxing-wasm-data.ts'

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

function render(src) {
  const header = `// ⚠️ 生成文件·勿手改 —— 正源：${WASM_REL}
// 生成：node scripts/gen-zxing-wasm-data.mjs ／ 只检不改：node scripts/gen-zxing-wasm-data.mjs --check
//
// 用途：把 zxing-wasm 的解码 wasm 二进制随本包分发，使首次扫码不再向 fastly.jsdelivr.net 取件
// （zxing-wasm 默认 locateFile 走那个 CDN，网络一抖就是「识别中…」长挂，根因见
//  docs/全量审查报告-2026-09-28.md §9.7）。消费方见 useBarcodeScanner.ts 的 warmBarcodeDecoder。
//
// 体积：base64 文本 ${(src.base64.length / 1024 / 1024).toFixed(2)}MB（原始 ${src.buf.length.toLocaleString('en-US')} 字节），
// 由 manualChunks 拆成独立懒加载 chunk，只有真的打开扫码界面才会加载。
// 换版：升级 zxing-wasm 后重跑本脚本；sha256 与 zxing-wasm 自己导出的 ZXING_WASM_SHA256 由
// tests/unit/zxing-wasm-data.spec.ts 做同源断言，对不上就是正源被换过（会红，别改断言迁就）。

/** 随包 wasm 来自哪个 zxing-wasm 版本（版本与宿主装的 JS 不一致时，运行时退回默认取件方式） */
export const ZXING_WASM_DATA_VERSION = '${src.version}'

/** 随包 wasm 的 sha256 —— 与 zxing-wasm 包内导出的 ZXING_WASM_SHA256 同值 */
export const ZXING_WASM_DATA_SHA256 = '${src.sha}'

/** 随包 wasm 的原始字节数（base64 解码后必须正好是这个数） */
export const ZXING_WASM_DATA_BYTES = ${src.buf.length}

/** zxing_reader.wasm 的 base64（无 data: 前缀，解码见 useBarcodeScanner.ts） */
export const ZXING_WASM_DATA_BASE64 =
  '${src.base64}'
`
  return header
}

const src = readSource()
const out = render(src)
const outPath = path.join(ROOT, OUT_REL)

if (CHECK) {
  if (!existsSync(outPath)) {
    console.error(`[zxing-wasm-data] ${OUT_REL} 不存在，跑 node scripts/gen-zxing-wasm-data.mjs 生成`)
    process.exit(1)
  }
  const cur = readFileSync(outPath, 'utf8')
  if (cur !== out) {
    const curSha = cur.match(/ZXING_WASM_DATA_SHA256 = '([0-9a-f]+)'/)?.[1] ?? '(读不到)'
    console.error(`[zxing-wasm-data] 与正源漂移：仓内登记 sha256=${curSha.slice(0, 16)}…，正源 sha256=${src.sha.slice(0, 16)}…`)
    console.error(`  修法：node scripts/gen-zxing-wasm-data.mjs 重新生成（正源 ${WASM_REL}，版本 ${src.version}）`)
    process.exit(1)
  }
  console.log(`[zxing-wasm-data] 与正源一致（v${src.version}，${src.buf.length} 字节，sha256 ${src.sha.slice(0, 16)}…）`)
  process.exit(0)
}

writeFileSync(outPath, out, { encoding: 'utf8', newline: 'lf' })
console.log(`[zxing-wasm-data] 已生成 ${OUT_REL}：v${src.version} ${src.buf.length} 字节 → base64 ${src.base64.length} 字符`)
