/**
 * check:test-skips 闸门的自测（#329）
 *
 * ## 为什么补
 *
 * 这道闸口的判据是"**白名单比对**"：跳过点必须在 ALLOWLIST 里登记理由，反之登记了却
 * 不存在也算错（陈旧登记）。两个方向都可能被改坏，而**改坏后的表现都是"✅ 通过"**：
 * · 未登记检测失效 → 悄悄多出来的 `.skip` 一路绿灯（"跳过"被当成"通过"）
 * · 陈旧检测失效 → 白名单越积越脏，登记彻底失去意义
 *
 * ## 夹具设计
 *
 * · ok：一处 `it.skip` 且在白名单里 → 必须 exit 0
 * · bad：一处未登记 `it.skip` + 一条指向 `describe.skip` 的陈旧登记 → 必须两类都报
 *
 * ⚠️ 夹具故意放在 tests/fixtures/ 下且**内含未登记跳过**，所以闸门的默认扫描必须排除
 * fixtures 目录；而 `--root` 显式指向夹具时**不能**排除（否则白名单全被判陈旧）。
 * 这条边界本身也由下面的用例守住（"真实扫描不受夹具影响"）。
 */
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const SCRIPT = resolve('scripts/check-test-skips.mjs')
const OK_ROOT = 'tests/fixtures/test-skips/ok'
const BAD_ROOT = 'tests/fixtures/test-skips/bad'

function runGate(root?: string, allowlist?: string) {
  const args = [SCRIPT]
  if (root) args.push('--root', root, '--allowlist', allowlist!)
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

describe('check:test-skips 闸门自测', () => {
  it('**已登记的跳过必须通过**', () => {
    const { code, out } = runGate(OK_ROOT, `${OK_ROOT}/allowlist.json`)
    expect(code, `闸门对已登记跳过报了错：\n${out}`).toBe(0)
  })

  it('**未登记跳过与陈旧登记都必须报出来**', () => {
    const { code, out } = runGate(BAD_ROOT, `${BAD_ROOT}/allowlist.json`)
    expect(code, '两类问题都没拦住 → 这道闸口是摆设').toBe(1)
    expect(out, '未登记跳过没报 → "跳过"被当成"通过"').toContain('未登记的跳过')
    expect(out, '陈旧登记没报 → 白名单会越积越脏').toContain('陈旧登记')
  })

  it('**真实扫描不受夹具影响**（fixtures 里故意放着未登记跳过）', () => {
    const { code, out } = runGate()
    expect(code, `默认扫描把夹具里的跳过也算进来了：\n${out}`).toBe(0)
  })
})
