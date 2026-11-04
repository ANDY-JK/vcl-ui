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

function buildFixture(overrides: Record<string, number> = {}, base: string = TMP) {
  rmSync(base, { recursive: true, force: true })
  mkdirSync(join(base, 'src/components/_internal'), { recursive: true })
  copyFileSync('src/components/tokens.css', join(base, 'src/components/tokens.css'))
  copyFileSync('src/components/_internal/breakpoints.ts', join(base, 'src/components/_internal/breakpoints.ts'))
  for (const d of DOMAINS) {
    if (d === '_internal') continue
    mkdirSync(join(base, 'src/components', d), { recursive: true })
    const lines = overrides[d] ?? 3
    writeFileSync(
      join(base, 'src/components', d, 'X.vue'),
      `<template><div /></template>\n${'// filler\n'.repeat(Math.max(0, lines - 1))}`,
    )
  }
  return base
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

/**
 * [9] 生成物单文件 ≤ 900KB（#418）
 *
 * 这条判据不是为了"好看"：esbuild 对**单次 >1MiB 的输入**会落一个临时文件再交给子进程，
 * 随后删除该文件；这台 Windows 上删除必被拒 → transform 失败，症状是"两条毫不相干的 spec 红"
 * 或"build 在第 32 步断"。上一轮为定位它连跑了四次整链（TD-129 / #416 / #417）。
 * 所以这里同时钉住三头：**超线必须红**、**边界内不许误报**、**第三方 vendored 件不被牵连**。
 */
describe('check:constants 闸门自测 · 生成物体积上限', () => {
  const LIMIT = 900 * 1024
  /** 每条用例一个独立夹具根：本机 I: 盘的删除是"延迟生效"的，同目录复用会让上一条的大文件串到下一条 */
  const caseRoot = (name: string) => join(TMP, `size-${name}`)

  /** 造一个**正好 bytes 字节**的文件（marked=true 时首行带「生成文件」标记，闸口靠它认生成物） */
  const writeArtifact = (root: string, name: string, bytes: number, marked = true) => {
    const head = marked ? '// ⚠️ 生成文件·勿手改\n' : '// 手写文件\n'
    mkdirSync(join(root, 'src/components/_internal'), { recursive: true })
    writeFileSync(
      join(root, 'src/components/_internal', name),
      head + 'x'.repeat(Math.max(0, bytes - Buffer.byteLength(head))),
    )
  }

  it('**标记生成物超 900KB → 红，并点名文件与体积**', () => {
    const root = buildFixture({}, caseRoot('over'))
    writeArtifact(root, 'big-data.ts', 950 * 1024)
    const { out } = run(root)
    expect(out, '生成物胖到超过 esbuild 的 1MiB 落盘阈值时，构建会以完全无关的报错失败').toContain('big-data.ts')
    expect(out).toMatch(/\[9\]/)
  })

  it('**恰好 900KB 不报**（判据是 >，不是 ≥ —— 别把上限当成目标）', () => {
    const root = buildFixture({}, caseRoot('exact'))
    writeArtifact(root, 'exact-data.ts', LIMIT)
    const { out } = run(root)
    expect(out).not.toMatch(/\[9\]/)
  })

  it('**没有标记的手写大文件不归这条管**（第三方 vendored 件必须与上游逐字节一致，一个字都不能改）', () => {
    const root = buildFixture({}, caseRoot('vendored'))
    writeArtifact(root, 'vendored-big.mjs', 2 * 1024 * 1024, false)
    const { out } = run(root)
    expect(out).not.toMatch(/\[9\]/)
  })

  it('**分片命名即使没标记也算生成物**（生成器换写法时判据不能跟着漏）', () => {
    const root = buildFixture({}, caseRoot('part'))
    writeArtifact(root, 'thing.part-1.ts', 950 * 1024, false)
    const { out } = run(root)
    expect(out).toMatch(/\[9\]/)
    expect(out).toContain('thing.part-1.ts')
  })
})
