// vitest 配置守卫（#409）
//
// 为什么需要这个文件：配置本身没有测试，就会在"为了跑快一点"的调参里悄悄退化，
// 而退化后果是**假红/假绿**——闸口不再可信。这里把三条与可靠性直接相关的值钉住，
// 并说明它们各自挡的是什么（每条都能用变异证伪：改回去 → 本文件必红）。
import { describe, it, expect } from 'vitest'
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

  it('**worker 拆除宽限 ≥ 30s**：默认 10s 在满载时会把收尾算成未完成', () => {
    expect(test.teardownTimeout as number).toBeGreaterThanOrEqual(30_000)
  })

  it('反回归：仍然用 forks 池（vmThreads 的假红见配置注释）', () => {
    expect(test.pool).toBe('forks')
    expect(test.include).toEqual(['tests/unit/**/*.spec.ts'])
  })
})