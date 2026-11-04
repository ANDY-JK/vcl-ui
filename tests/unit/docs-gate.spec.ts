/**
 * check:docs 闸门的自测（#352）
 *
 * ## 它守的是什么
 *
 * 组件 API 文档是**生成的**：改了 `defineProps` 不跑 `gen:docs`，文档就静默漂移。
 * 第 #349 轮就是活例子 —— 连续六批加 prop、单测全绿，直到整链第 36 步才被它抓到。
 *
 * ## 为什么只锁"漂移"这一条
 *
 * 它的三条判据（缺少生成文件 / 文档漂移 / 多余文件）在夹具里都命中"缺少"，
 * 但**真正会被人违反的是"漂移"**（改了源码忘了重生成）；"缺少/多余"是 barrel 变动的连带结果。
 * 所以断言锁 `文档漂移` 这条消息，而不是任何一条 `缺少生成文件`。
 *
 * ## 夹具
 *
 * 生成侧仍读**真实 src**（不 mock 生成器），夹具只放"错误版本的已提交文档"：
 * · ok：不传 `--committed`（= 真实 docs-site/components）→ 必须 exit 0
 * · bad：`tests/fixtures/docs/stale/form.md`（内容明显是旧的）→ 必须报 `文档漂移 form.md`
 */
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve, join } from 'node:path'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'

const SCRIPT = resolve('scripts/check-docs.mjs')

/**
 * 本文件的用例都要 spawnSync 跑一次「生成器 + 闸口」子进程（扫描 83 个受保护文件 / 15 份台账）。
 * 单独跑 2s 左右，但整套用例并行（vitest pool: forks）满载时会到 20s+，
 * 撞上全局 `testTimeout: 20_000` 就变成**假失败**（#407 实测撞过一次）。
 * 这类"闸门自测"必须稳定，否则红/绿都不再可信 —— 单独给它 60s。
 */
const SUBPROC_TIMEOUT = 60_000

function run(committed?: string) {
  const args = [SCRIPT]
  if (committed) args.push('--committed', committed)
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

describe('check:docs 闸门自测', () => {
  it('**真实文档必须与生成结果一致**（不一致说明忘了跑 gen:docs）', () => {
    const { code, out } = run()
    expect(code, `真实文档已漂移：\n${out}`).toBe(0)
  })

  it('**已提交文档过期时必须报「文档漂移」，并点名文件**', () => {
    const { code, out } = run('tests/fixtures/docs/stale')
    expect(code, '过期文档没被拦住 → 用户会照着旧 API 写代码').toBe(1)
    expect(out, '没报"文档漂移"（可能只报了缺少文件）').toContain('文档漂移 form.md')
  })
}, SUBPROC_TIMEOUT)

/**
 * 治理索引那一半（TD-103，#388）
 *
 * ## 它守的是什么
 *
 * `gen:governance-index` 产出的 `docs/protected-files.md` / `workspace/README.md`
 * 此前**只有写、没有校验** —— 索引可以静默漂移。#387 重跑时才发现 `Toast.vue`
 * 头部带 `⛔ 保护` 却不在索引里（82 → 83），等于"变更评审会照着漏了它的索引做"。
 *
 * ## 为什么用夹具目录而不是改真实文件
 *
 * 判据是"生成器算出来的内容 与 已提交文件逐字节一致"。直接改真实索引会让单测
 * 有副作用（跑挂了就把仓库改坏），所以 `--root` 把治理索引那一半指到临时目录：
 * 夹具里放一个受保护文件，让**真生成器**写出索引，再让**真闸口**去比对。
 */
describe('check:docs · 治理索引新鲜度', () => {
  const GEN = resolve('scripts/gen-governance-index.mjs')
  const ROOT = process.cwd()

  /** 造一个最小仓库：一个受保护组件 + 一份台账 */
  function makeFixture(): string {
    const dir = mkdtempSync(join(tmpdir(), 'vcl-gov-'))
    mkdirSync(join(dir, 'src', 'components', 'feedback'), { recursive: true })
    writeFileSync(
      join(dir, 'src', 'components', 'feedback', 'Toast.vue'),
      '<script setup lang="ts">\n// ⛔ 保护 — 提示消息，禁止：clamp() → px，动画时序\n</script>\n',
      'utf8',
    )
    mkdirSync(join(dir, 'workspace'), { recursive: true })
    writeFileSync(join(dir, 'workspace', '需求-2026-01-01.md'), '# 台账\n', 'utf8')
    // 生成器直接 writeFileSync 到 docs/ 与 workspace/，目录缺一不可
    mkdirSync(join(dir, 'docs'), { recursive: true })
    return dir
  }

  const gen = (root: string) => spawnSync(process.execPath, [GEN], { cwd: root, encoding: 'utf8' })
  const check = (root: string) =>
    spawnSync(process.execPath, [SCRIPT, '--root', root], { cwd: ROOT, encoding: 'utf8' })

  it('**索引与生成结果一致 → 绿**', () => {
    const dir = makeFixture()
    try {
      expect(gen(dir).status, '生成器在夹具目录里执行失败').toBe(0)
      const r = check(dir)
      const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
      expect(r.status, `刚生成的索引就被判漂移：\n${out}`).toBe(0)
      expect(out, '没打印治理索引的统计行').toContain('治理索引 2 份')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('**索引缺了一行（受保护文件漏登记）→ 必须红，并点名文件与修法**', () => {
    const dir = makeFixture()
    try {
      expect(gen(dir).status).toBe(0)
      const p = join(dir, 'docs', 'protected-files.md')
      const original = readFileSync(p, 'utf8')
      // 精确删掉 Toast 那一行：模拟"改了源码的 ⛔ 保护 注释却忘了重跑生成器"
      const removed = original.replace(/^\| `src\/components\/feedback\/Toast\.vue`.*\n/m, '')
      expect(removed, '夹具里没找到 Toast 行，删行变异没生效').not.toBe(original)
      writeFileSync(p, removed, 'utf8')

      const r = check(dir)
      const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
      expect(r.status, '索引漏登记却没人拦 → 变更评审会照着漏了它的索引做').toBe(1)
      expect(out, '没点名是哪个文件漂移').toContain('文档漂移 docs/protected-files.md')
      expect(out, '没给出修法（重跑生成器）').toContain('gen:governance-index')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
}, SUBPROC_TIMEOUT)
