/**
 * check:tab-sequence 闸门的自测（#325）
 *
 * ## 为什么闸门也要有用例
 *
 * 质量链的规矩是「每道闸口都要有负向对照证明它真会红」。但 `check:tab-sequence`
 * 目前是**靠"它扫出 8 处真问题"证明的** —— 那只能证明"当时会红"，
 * 不能证明"以后仍然会红"（有人把判据写松、或者匹配逻辑被改坏，都不会有人发现）。
 *
 * 这里用固定夹具把两面都钉住：
 *   · ok 夹具 → 必须 exit 0（**不报假警**）
 *   · bad 夹具 → 必须 exit 1 且报出两处（**真会红**）
 *
 * 两个夹具刻意各写两条"正确写法"（`-1` 与 `:tabindex` 绑定）与两条"错误写法"
 * （不写 / 写死 0），覆盖判据的两条分支。
 */
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const SCRIPT = resolve('scripts/check-tab-sequence.mjs')

function runGate(root: string) {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

describe('check:tab-sequence 闸门自测', () => {
  it('**合规夹具必须通过**（闸门不能报假警）', () => {
    const { code, out } = runGate('tests/fixtures/tab-sequence/ok')
    expect(code, `闸门对合规文件报了错：\n${out}`).toBe(0)
  })

  it('**违规夹具必须失败，且两处都报出来**（闸门真会红）', () => {
    const { code, out } = runGate('tests/fixtures/tab-sequence/bad')
    expect(code, '闸门对违规文件没报错 → 这道闸口是摆设').toBe(1)
    expect(out, '应报出"没写 tabindex"').toContain('没有写 tabindex')
    expect(out, '应报出"写死 tabindex=0"').toContain('写死 tabindex="0"')
  })

  it('**报错里给出行号**（否则几千行模板里找不到）', () => {
    const { out } = runGate('tests/fixtures/tab-sequence/bad')
    expect(out).toMatch(/BadTabs\.vue:\d+/)
  })
})
