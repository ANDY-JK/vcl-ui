// 随包第三方件的正源对账闸口（只检不改，不需要 dist，供整链前段快速失败）
//
// 为什么单独一道：本库把 zxing-wasm 的解码 wasm 内联进产物（见 §9.7 的挂起根因），
// 这类"从安装物里搬一份字节进仓"的做法，最怕的就是搬完之后上游换了件、仓内还在说旧话。
// dist 侧已有 check:licenses 逐条复算，但那要等 build 完；这里在不打包的前提下先把
// 「仓内件 ＝ 安装物正源 ＝ 上游自己声称的期望字节」三条对齐，升级依赖时第一时间红。
//
// 用法：node scripts/check-vendor-data.mjs
import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VENDOR_BINARIES, readVendoredBinaryModule } from './gen-third-party-licenses.mjs'
import { checkVendored } from './vendor-sheetjs.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RED = []

const hash = (buf) => createHash('sha256').update(buf).digest('hex')

for (const spec of VENDOR_BINARIES) {
  const abs = join(ROOT, spec.file)
  const originAbs = join(ROOT, spec.origin)
  if (!existsSync(abs)) {
    RED.push(`${spec.file} 不存在（生成：node scripts/gen-zxing-wasm-data.mjs）`)
    continue
  }
  if (!existsSync(originAbs)) {
    RED.push(`${spec.origin} 不在安装物里——随包件无从对账，先确认 ${spec.pkg} 已安装`)
    continue
  }
  const mod = readVendoredBinaryModule(readFileSync(abs, 'utf8'))
  const originBuf = readFileSync(originAbs)
  const originSha = hash(originBuf)
  if (!mod.base64) {
    RED.push(`${spec.file} 里取不到 ZXING_WASM_DATA_BASE64（字段改名了？同步改 readVendoredBinaryModule）`)
    continue
  }
  const payloadBuf = Buffer.from(mod.base64, 'base64')
  const payloadSha = hash(payloadBuf)
  if (payloadBuf.length !== mod.bytes) RED.push(`${spec.file} 登记字节数 ${mod.bytes} 与实际 ${payloadBuf.length} 不符`)
  if (payloadBuf.length !== originBuf.length)
    RED.push(`${spec.file} 与实际正源字节数不符：仓内 ${payloadBuf.length}／${spec.origin} ${originBuf.length}`)
  if (mod.sha256 !== payloadSha) RED.push(`${spec.file} 登记的 sha256 与自身 base64 重算结果不符（文件被手改过？）`)
  if (payloadSha !== originSha) RED.push(`${spec.file} 的内联字节与安装物正源不同 —— 升级 ${spec.pkg} 后要重跑生成脚本`)

  // 第三条同源：上游 JS 自己声称"我要的 wasm 是哪个 sha256"。对不上＝我们喂的这份它不认。
  // zxing-wasm 的 exports 图未给出 ./reader 的 types 入口，require(esm) 在其构建产物上会报
  // ERR_INVALID_ARG_VALUE，故只走动态 import；失败即判红（不静默放过——这条正是防"上游换件"的）。
  let upstream = null
  try {
    upstream = await import(`${spec.pkg}/reader`)
  } catch (e) {
    RED.push(
      `读不到 ${spec.pkg}/reader 导出的期望字节：${e && e.code ? e.code + ' ' : ''}${e && e.message ? e.message : e}`,
    )
  }
  if (upstream && upstream.ZXING_WASM_SHA256) {
    if (upstream.ZXING_WASM_SHA256 !== originSha)
      RED.push(`${spec.pkg}/reader 导出的 ZXING_WASM_SHA256 与它自己的 wasm 文件不一致（安装物被动过？）`)
    if (upstream.ZXING_WASM_SHA256 !== payloadSha)
      RED.push(
        `${spec.pkg}/reader 期望 sha256 ${String(upstream.ZXING_WASM_SHA256).slice(0, 12)}…，随包件是 ${payloadSha.slice(0, 12)}…，ABI 不配套`,
      )
    if (mod.version && upstream.ZXING_WASM_VERSION && mod.version !== upstream.ZXING_WASM_VERSION)
      RED.push(`随包件登记版本 ${mod.version} 与 ${spec.pkg} 自述 ${upstream.ZXING_WASM_VERSION} 不一致`)
  }
  console.log(
    `[vendor] ${spec.pkg}@${mod.version} ${payloadBuf.length.toLocaleString('en-US')} 字节 sha256=${payloadSha.slice(0, 16)}… 正源=${originSha.slice(0, 16)}… 上游期望=${upstream && upstream.ZXING_WASM_SHA256 ? String(upstream.ZXING_WASM_SHA256).slice(0, 16) : 'n/a'}…`,
  )
}

// 仓内 vendor 的上游代码（SheetJS）：与 VENDOR.json 登记逐字节对账（不读 node_modules）
try {
  const { bad, summary } = checkVendored(ROOT)
  if (bad.length) RED.push(...bad.map((b) => `vendor(xlsx) ${b}`))
  else console.log(`[vendor] ${summary}`)
} catch (e) {
  RED.push(`vendor(xlsx) 校验跑不起来：${e && e.message ? e.message : e}`)
}

if (RED.length) {
  console.error(`\n❌ check:vendor-data 未通过（${RED.length} 项）`)
  for (const r of RED) console.error(`   - ${r}`)
  process.exit(1)
}
console.log(
  `\n✅ check:vendor-data 通过（随包二进制 ${VENDOR_BINARIES.length} 份与正源及上游声明三方一致；仓内 vendor 代码 1 份与 VENDOR.json 逐字节一致）`,
)
