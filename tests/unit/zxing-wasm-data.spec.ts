// 随包扫码 wasm 的来源对账（scripts/gen-zxing-wasm-data.mjs 生成物的守卫）
//
// 为什么要有这条：本包把 zxing-wasm 的解码二进制内联进产物（消除首解对第三方 CDN 的依赖），
// 一旦这份内联字节与宿主装的 zxing JS 期望的字节不一致，喂进去就是错 ABI —— 症状是
// 「解码器起来了但解不出码」，比联网慢更难查。所以这里逐条重算，而不是信生成脚本自己说的话。
//
// 判据两个独立来源：① 仓内 base64 现场解码再哈希；② zxing-wasm 包内导出的 ZXING_WASM_SHA256／
// ZXING_WASM_VERSION（上游对它发布物的声明）。两边对不上＝正源被换过或版本漂了。
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { ZXING_WASM_SHA256, ZXING_WASM_VERSION } from 'zxing-wasm/reader'
import {
  ZXING_WASM_DATA_BASE64,
  ZXING_WASM_DATA_BYTES,
  ZXING_WASM_DATA_SHA256,
  ZXING_WASM_DATA_VERSION,
} from '@/components/_internal/zxing-wasm-data'

const repoRoot = process.cwd()
const decoded = Uint8Array.from(atob(ZXING_WASM_DATA_BASE64), (c) => c.charCodeAt(0))

describe('随包 zxing wasm 二进制', () => {
  it('base64 解码后的字节数与登记的原始大小一致', () => {
    expect(decoded.length).toBe(ZXING_WASM_DATA_BYTES)
  })

  it('解码后是合法 wasm（魔数 \\0asm + 版本 1）', () => {
    expect([...decoded.slice(0, 8)]).toEqual([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00])
  })

  it('base64 文本是纯 base64（无 data: 前缀、无换行）', () => {
    expect(ZXING_WASM_DATA_BASE64).toMatch(/^[A-Za-z0-9+/]+=*$/)
  })

  it('仓内件现场重算的 sha256 ＝ 文件头登记的 sha256', () => {
    const recalc = createHash('sha256').update(Buffer.from(ZXING_WASM_DATA_BASE64, 'base64')).digest('hex')
    expect(recalc).toBe(ZXING_WASM_DATA_SHA256)
  })

  it('随包件与 zxing-wasm 上游声明的期望字节完全一致（ABI 同源）', () => {
    expect(ZXING_WASM_DATA_SHA256).toBe(ZXING_WASM_SHA256)
    expect(ZXING_WASM_DATA_VERSION).toBe(ZXING_WASM_VERSION)
  })

  it('与 node_modules 里的正源逐字节相同（生成脚本没漏字段、也没被手工改过）', () => {
    const src = readFileSync(path.join(repoRoot, 'node_modules/zxing-wasm/dist/reader/zxing_reader.wasm'))
    expect(Buffer.from(ZXING_WASM_DATA_BASE64, 'base64').equals(src)).toBe(true)
  })

  /* ── 分片不变量（#416）──────────────────────────────────────────────
   * esbuild 在单次输入 > 1MiB 时会把内容落成 %TEMP%\esbuild-<hash> 临时文件，
   * 而 Windows 上这个临时文件常删不掉（`Error: remove …: Access is denied.`）→ transform 直接失败。
   * 实测阈值在 900KB~1.1MB 之间。所以「分片」不是风格问题：它是让 transform 不落盘的前提，
   * 一旦有人把分片合并回单文件，整链第 28 步会以「两条毫不相干的 spec 红了」的形式断掉。 */
  const internalDir = path.join(repoRoot, 'src/components/_internal')

  it('**分片必须存在且各自小于 1MiB**（超阈值 → esbuild 落临时文件 → Windows 上删不掉 → transform 失败）', () => {
    const parts = readdirSync(internalDir).filter((f) => /^zxing-wasm-data\.part-\d+\.ts$/.test(f))
    expect(parts.length, '分片没了 —— base64 又被合并回单文件了？').toBeGreaterThan(1)
    for (const f of parts) {
      const size = statSync(path.join(internalDir, f)).size
      expect(size, `${f} 有 ${size} 字节，超过 esbuild 的 1MiB 落盘阈值`).toBeLessThan(1024 * 1024)
    }
  })

  it('**barrel 不许把 base64 内联回去**（体积失控就是分片被合并了）', () => {
    const barrel = statSync(path.join(internalDir, 'zxing-wasm-data.ts')).size
    expect(barrel, `barrel 有 ${barrel} 字节 —— 只剩元数据与拼接语句时才该是几 KB`).toBeLessThan(64 * 1024)
  })

  /* ── 运行期取件口（#417）────────────────────────────────────────────
   * 为什么运行期不走 barrel：barrel 静态 import 了全部分片 → Rollup 会把 1.27MB 合成**一个**
   * chunk，而 esbuild 对 >1MiB 的单次输入会落临时文件、随后删除被拒 → 构建必失败（TD-129）。
   * 所以运行期改成「meta（几百字节）+ 两个分片各自动态 import」。 */
  it('运行期取件口与 barrel 拼出同一份 base64（顺序错/漏片都会红）', async () => {
    const { loadWasmBase64 } = await import('@/components/_internal/zxing-wasm-data-load')
    await expect(loadWasmBase64()).resolves.toBe(ZXING_WASM_DATA_BASE64)
  })

  it('**运行期不许直接 import barrel**（那会把分片重新合成 1.27MB 单 chunk → 构建在 Windows 上必失败）', () => {
    const src = readFileSync(path.join(repoRoot, 'src/components/form/utils/useBarcodeScanner.ts'), 'utf8')
    expect(src, '别再 import barrel：改走 zxing-wasm-data-meta + zxing-wasm-data-load').not.toMatch(
      /_internal\/zxing-wasm-data['"]/,
    )
    expect(src).toMatch(/zxing-wasm-data-load/)
    expect(src).toMatch(/zxing-wasm-data-meta/)
  })
})
