// 随包扫码 wasm 的来源对账（scripts/gen-zxing-wasm-data.mjs 生成物的守卫）
//
// 为什么要有这条：本包把 zxing-wasm 的解码二进制内联进产物（消除首解对第三方 CDN 的依赖），
// 一旦这份内联字节与宿主装的 zxing JS 期望的字节不一致，喂进去就是错 ABI —— 症状是
// 「解码器起来了但解不出码」，比联网慢更难查。所以这里逐条重算，而不是信生成脚本自己说的话。
//
// 判据两个独立来源：① 仓内 base64 现场解码再哈希；② zxing-wasm 包内导出的 ZXING_WASM_SHA256／
// ZXING_WASM_VERSION（上游对它发布物的声明）。两边对不上＝正源被换过或版本漂了。
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
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
})
