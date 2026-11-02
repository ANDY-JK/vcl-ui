/**
 * check:vendor-data 闸门的自测（#367）
 *
 * ## 它守的是什么
 *
 * 「随包第三方件的正源对账」：本库把 zxing-wasm 的 wasm 字节内联进产物，
 * 这类"从安装物搬一份字节进仓"最怕**上游换了件、仓内还在说旧话**。
 * 它验三条链：① 仓内件登记（bytes/sha256）与自身 base64 自洽；
 * ② 仓内 payload 与安装物正源逐字节一致；③ 上游 JS 自己声称的 sha256 与两者都一致。
 *
 * ## 夹具（`--root` + `--spec`）
 *
 * ①③ 依赖真实 node_modules 与上游动态 import，夹具里没有 —— 用 `--spec` 只喂
 * "仓内件 ↔ 正源"这一段（②与①），并在闸口里显式跳过上游段（写明理由）。
 *
 * · ok：仓内模块（base64+登记）与正源字节一致 → exit 0
 * · bad：正源换成不同字节（模拟"上游升级后没重跑生成脚本"）→ 必须报
 *   「与实际正源字节数不符」和「内联字节与安装物正源不同」
 */
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const SCRIPT = resolve('scripts/check-vendor-data.mjs')

function run(root: string) {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', root, '--spec', 'tests/fixtures/vendor/spec.json'], {
    encoding: 'utf8',
  })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

describe('check:vendor-data 闸门自测 · 随包件 ↔ 正源', () => {
  it('**字节一致时必须通过**', () => {
    const { code, out } = run('tests/fixtures/vendor/ok')
    expect(code, `一致的夹具被判失败：\n${out}`).toBe(0)
  })

  it('**正源字节变化必须报出来（升级依赖忘重跑生成脚本的场景）**', () => {
    const { code, out } = run('tests/fixtures/vendor/bad')
    expect(code, '正源换了件却没拦住 → 仓内还在说旧话').toBe(1)
    expect(out).toContain('与实际正源字节数不符')
    expect(out).toContain('内联字节与安装物正源不同')
  })
})
