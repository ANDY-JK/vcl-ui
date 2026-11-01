/**
 * check:facts 闸门的自测（#351）
 *
 * ## 它守的是"正文里手写的数字"
 *
 * 这道闸口注释里写得很清楚：**光有生成页没用** —— 生成页没人看，正文天天被看。
 * 实测踩过三次：首页「14 个域」（实际 13）、README「60+ 组件」（实际 65）、
 * 行数止涨线注释 4 处里 3 处不符。
 *
 * ## 两个方向
 *
 * · 硬：精确数字与真源矛盾 → 红（如「15 个域」而真源是 13）
 * · 柔：模糊表述（「60+ 组件」）→ 仅警告（语义没错，只是给人偏小印象）
 *
 * 自测只锁「硬」这一档 —— 柔档按设计不拦提交，不该用它当失败判据。
 *
 * ## 夹具
 *
 * `--facts <file>` 用给定文本当真源（跳过重算与漂移比对），`--root <dir>` 指到夹具目录：
 * · ok：正文「13 个域 / 66 个组件 / 1503 个键 / 43 步」与真源一致 → exit 0
 * · bad：正文「15 个域」→ 必须红，**并点名文件:行号与两个数字**
 */
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const SCRIPT = resolve('scripts/check-facts.mjs')
const FACTS = 'tests/fixtures/facts/facts-mini.md'

function run(root: string) {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', root, '--facts', FACTS], { encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

describe('check:facts 闸门自测', () => {
  it('**正文与真源一致时必须通过**', () => {
    const { code, out } = run('tests/fixtures/facts/ok')
    expect(code, `一致的正文被判失败：\n${out}`).toBe(0)
  })

  it('**正文数字与真源矛盾必须报出来，并给出文件:行号与两个数字**', () => {
    const { code, out } = run('tests/fixtures/facts/bad')
    expect(code, '正文写错数字却没拦住 → 这正是它存在的理由').toBe(1)
    expect(out).toContain('README.md:3')
    expect(out).toContain('15')
    expect(out).toContain('13')
  })
})
