// vitest 配置守卫（#409）
//
// 为什么需要这个文件：配置本身没有测试，就会在"为了跑快一点"的调参里悄悄退化，
// 而退化后果是**假红/假绿**——闸口不再可信。这里把三条与可靠性直接相关的值钉住，
// 并说明它们各自挡的是什么（每条都能用变异证伪：改回去 → 本文件必红）。
import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import os from 'node:os'
import config from '../../vitest.config'

const test = (config as { test?: Record<string, unknown> }).test ?? {}

describe('vitest 配置守卫 · 并发与超时（#409）', () => {
  it('**并发上限必须显式收窄**：默认按核数开 fork，争用会让重用例假红', () => {
    expect(test.maxWorkers, '未设置 maxWorkers → 退回按核数开 fork，重伞用例会假红').toBe(4)
    expect(test.minWorkers).toBe(1)
  })

  it('**单条用例上限 ≥ 60s**：重用例在 4 fork 下也能到 20~40s', () => {
    expect(test.testTimeout as number, '20s 会稳定误伤 ZIP/千行表格/子进程闸门自测').toBeGreaterThanOrEqual(60_000)
  })

  it('**hook 上限也必须放开**：testTimeout 管不到 beforeEach/beforeAll（默认 10s）', () => {
    expect(test.hookTimeout as number, 'hook 默认 10s → 「空存储」这类用例会撞 10021ms 假红').toBeGreaterThanOrEqual(60_000)
  })

  it('**worker 拆除宽限 ≥ 30s**：默认 10s 在满载时会把收尾算成未完成', () => {
    expect(test.teardownTimeout as number).toBeGreaterThanOrEqual(30_000)
  })

  it('反回归：仍然用 forks 池（vmThreads 的假红见配置注释）', () => {
    expect(test.pool).toBe('forks')
    expect(test.include).toEqual(['tests/unit/**/*.spec.ts'])
  })
})

/* ── 临时目录改道（#415）────────────────────────────────────────────────
 * 起因：`test:unit` 里两条转换巨量字面量的 spec（zxing-wasm-data /
 * barcode-decoder-warm-guard）双双报
 *   `Error: remove C:/Users/USER Access is denied.`  ← vite:esbuild
 * 同一棵树、未改产品代码；把 TEMP/TMP 指向仓库内目录后同样的两条 **14 例全过**。
 * 这条守卫必须在 **worker 进程里**取值：配置改的是 `process.env`，只有它真的被
 * fork worker（以及它再 spawn 的 esbuild 子进程）继承，改道才算生效。 */
describe('vitest 配置守卫 · 临时目录改道（#415）', () => {
  it('**worker 看到的临时目录必须在仓库内**（%TEMP% 下 esbuild 清理会被拒绝）', () => {
    const tmp = os.tmpdir()
    const root = process.cwd()
    expect(
      resolve(tmp).startsWith(root),
      `临时目录 ${tmp} 不在仓库 ${root} 内 → esbuild 会因 %TEMP% 策略在清理阶段报 Access is denied`,
    ).toBe(true)
  })
})