/**
 * check:gate-wiring 的自测（#335）
 *
 * ## 它守的是什么
 *
 * #334 的教训：闸口脚本存在、能手动跑，却**不在质量链里**，等于没有。
 * 这道闸口把"必须接入链"变成机械约束 —— 所以它自己也必须接进链（本轮已接）。
 *
 * ## 三个判据各有一条夹具对应
 *
 * | 判据 | 失效后果 | bad 夹具里的表现 |
 * |---|---|---|
 * | 脚本必须在 STEPS 里 | 闸口永远不跑 | `check-b.mjs` 存在但不在链里 |
 * | 必须有 package.json 脚本 | 链里无法按名调用 | `check-b` 缺 npm 脚本 |
 * | 链里的 check:* 必须有脚本 | 删脚本留下死链 | 链引用 `check:c`，但没有 `check-c.mjs` |
 *
 * ok 夹具是最小可用形态：一个脚本 + 一条 STEPS + 一个 npm 脚本。
 */
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const SCRIPT = resolve('scripts/check-gate-wiring.mjs')

function run(root: string) {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

describe('check:gate-wiring 闸门自测', () => {
  it('**最小可用形态必须通过**（一个脚本、一条 STEPS、一个 npm 脚本）', () => {
    const { code, out } = run('tests/fixtures/gate-wiring/ok')
    expect(code, `合规接线被判失败：\n${out}`).toBe(0)
  })

  it('**脚本没进链 / 缺 npm 脚本 / 链里死链 三个方向都要报**', () => {
    const { code, out } = run('tests/fixtures/gate-wiring/bad')
    expect(code, '漏接的闸口没报 → 等于这道闸口没写').toBe(1)
    expect(out, '没进 STEPS 没报').toContain('不在')
    expect(out, '缺 npm 脚本没报').toContain('缺少 package.json 脚本')
    expect(out, '死链没报').toContain('但 package.json 里没有这个脚本')
  })
})
