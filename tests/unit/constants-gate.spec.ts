/**
 * check:constants 闸门的自测（#354）—— 只锁「行数止涨线」这一条判据
 *
 * ## 为什么只锁这一条
 *
 * 闸口有 8 组判据（常量去重、tokens 单一真源、断点、按钮 type、行数止涨线…）。
 * 造一个"全部判据都通过"的假仓要摆平 8 组输入 —— 夹具会变成第二个闸口。
 * 而**唯一随日常开发不断被触碰的是「行数止涨线」**：它逼着大文件在触线前拆开。
 *
 * ## 断言为什么不断言退出码
 *
 * 假仓只满足行数判据的输入，其余判据（常量重复/tokens 结构等）在假仓里必然报警，
 * 退出码因此恒为 1 —— **拿退出码当判据等于在测别的东西**。
 * 所以这里只断言"超线信息是否出现"，这正是该判据的唯一产物。
 *
 * ## 夹具由用例现造
 *
 * 要读 `tokens.css` / `breakpoints.ts`（另两组判据的输入）+ 13+ 个域目录，
 * 在临时目录里现造、跑完即删，比往仓库塞十几个夹具文件干净。
 */
import { describe, it, expect, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, copyFileSync, rmSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const SCRIPT = resolve('scripts/check-constants.mjs')
const TMP = resolve('tests/.tmp/constants-gate')

/**
 * 域名单**从闸口源码里读**，而不是在测试里抄一遍 ——
 * 抄的那份必然过期（本次就从抄的清单里漏掉了 `wc` → 闸口 scandir 直接 ENOENT）。
 */
const DOMAINS = (() => {
  const src = readFileSync('scripts/check-constants.mjs', 'utf8')
  const block = /const LINE_LIMITS = \{([\s\S]*?)\n\}/.exec(src)?.[1] ?? ''
  return [...block.matchAll(/^\s{2}'?([a-z-]+)'?:/gm)].map((m) => m[1])
})()

function buildFixture(overrides: Record<string, number> = {}) {
  rmSync(TMP, { recursive: true, force: true })
  mkdirSync(join(TMP, 'src/components/_internal'), { recursive: true })
  copyFileSync('src/components/tokens.css', join(TMP, 'src/components/tokens.css'))
  copyFileSync('src/components/_internal/breakpoints.ts', join(TMP, 'src/components/_internal/breakpoints.ts'))
  for (const d of DOMAINS) {
    if (d === '_internal') continue
    mkdirSync(join(TMP, 'src/components', d), { recursive: true })
    const lines = overrides[d] ?? 3
    writeFileSync(
      join(TMP, 'src/components', d, 'X.vue'),
      `<template><div /></template>\n${'// filler\n'.repeat(Math.max(0, lines - 1))}`,
    )
  }
  return TMP
}

function run(root: string) {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

afterAll(() => rmSync(TMP, { recursive: true, force: true }))

describe('check:constants 闸门自测 · 行数止涨线', () => {
  it('**前置：域名单从闸口源码读到，且覆盖 13+ 个域**', () => {
    expect(DOMAINS.length, `从闸口源码只读到 ${DOMAINS.length} 个域：${DOMAINS.join(',')}`).toBeGreaterThan(12)
  })

  it('**未超线时不该出现超线条目**', () => {
    const { out } = run(buildFixture())
    expect(out, '未超线却报出超线').not.toMatch(/超线=[1-9]/)
  })

  it('**某域文件超线必须报出来，并点名文件与行数**', () => {
    const { out } = run(buildFixture({ form: 1200 })) // form 域止涨线 1140
    expect(out, '超线没拦住 → 大文件会继续长，拆分时机被错过').toMatch(/超线=[1-9]/)
    expect(out).toContain('X.vue')
    expect(out).toMatch(/1200/)
  })
})
