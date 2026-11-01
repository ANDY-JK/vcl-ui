/**
 * check:css-tokens 闸门的自测（#330）
 *
 * ## 为什么补
 *
 * 判据里有两条容易写坏的**豁免规则**，而它们正是这道闸门"不误报"的全部原因：
 * ① 引用**带 fallback**（`var(--x, #ccc)`）→ 不算断档（暗色下仍有降级值）
 * ② 全库任意处**声明**过（CSS 的 `--x:` 或 JS 字符串字面量 `'--x'`）→ 不算断档
 *
 * 这两条一旦被改坏，表现都是"✅ 通过" —— 断档的令牌会一直留到暗色皮肤上线。
 * 反过来，若豁免写宽（把"有 fallback"当成全局豁免），又会漏掉真正的断档。
 *
 * ## 夹具
 *
 * · ok：一个文件声明 `--vcl-primary`，引用它（无 fallback）+ 一个未知令牌（有 fallback）
 *   → 必须 exit 0（两条豁免各覆盖一次）
 * · bad：引用 `--vcl-primary`（本目录无声明）与一个不存在的令牌，均无 fallback
 *   → 必须 exit 1，且两个令牌都点名
 */
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const SCRIPT = resolve('scripts/check-css-tokens.mjs')

function runGate(root: string) {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

describe('check:css-tokens 闸门自测', () => {
  it('**有声明 / 有 fallback 都必须放过**（否则闸门会误报满天）', () => {
    const { code, out } = runGate('tests/fixtures/css-tokens/ok')
    expect(code, `闸门把有声明或有 fallback 的引用判成断档了：\n${out}`).toBe(0)
  })

  it('**无声明且无 fallback 必须报出来**（暗色/降级场景会失效）', () => {
    const { code, out } = runGate('tests/fixtures/css-tokens/bad')
    expect(code, '真断档没报 → 这道闸口是摆设').toBe(1)
    expect(out).toContain('--vcl-primary')
    expect(out).toContain('--vcl-nonexistent-token')
  })

  it('**报错带文件位置**（几百个 CSS 里要能定位）', () => {
    const { out } = runGate('tests/fixtures/css-tokens/bad')
    expect(out).toMatch(/bad\.css/)
  })
})
