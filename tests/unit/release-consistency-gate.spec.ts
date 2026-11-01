/**
 * check:release-consistency 闸门的自测（#353）
 *
 * ## 它守的是什么
 *
 * 「版本三件套对齐」：`package.json` / git tag / `CHANGELOG.md` 三处必须一致，
 * 外加一条 #R5-D19 的规矩 —— **CHANGELOG 里有 BREAKING CHANGES 段时，文档站必须有迁移页**
 * （否则包里唯一的破坏性说明是不可执行的）。
 *
 * ## 为什么必须自测
 *
 * 它只在"发版"时才有意义，平时一直绿 —— **这种闸口最容易在重构里被改坏而无人察觉**，
 * 等到真正发版那天才发现"版本号对不上"。
 *
 * ## 夹具（`--root` 指目录、`--no-git` 跳过 tag 相关判据）
 *
 * · ok：package.json 2.0.0 + CHANGELOG 有 `## [2.0.0]` + 迁移页存在 → exit 0
 * · bad：package.json 2.0.1 但 CHANGELOG 只有 2.0.0 → 必须红并点名「CHANGELOG 缺少版本段「## [2.0.1]」」
 *
 * tag 判据（①②④）要读 git 历史，夹具没有真实 tag —— 用 `--no-git` 显式跳过，
 * 这不算放水：**CHANGELOG 与 package.json 的对齐才是日常最容易坏的一条**。
 */
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const SCRIPT = resolve('scripts/check-release-consistency.mjs')

function run(root: string) {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', root, '--no-git'], { encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

describe('check:release-consistency 闸门自测', () => {
  it('**三件套对齐时必须通过**', () => {
    const { code, out } = run('tests/fixtures/release/ok')
    expect(code, `对齐的夹具被判失败：\n${out}`).toBe(0)
  })

  it('**CHANGELOG 缺当前版本段必须报出来**', () => {
    const { code, out } = run('tests/fixtures/release/bad')
    expect(code, '版本号与 CHANGELOG 脱节却没拦住 → 发版当天才发现').toBe(1)
    expect(out).toContain('## [2.0.1]')
  })
})
