/**
 * 两道 CSS 闸门的自测（#333）
 *
 * 这两道闸口守的是**同一件事的两半**：断点必须用设计体系里的档位、字号必须走缩放体系。
 * 它们都是"扫正则 → 报违规"，改坏了表现都是「✅ 通过」：
 * · `check:css-breakpoints` 正则或白名单写松 → 随手写的 999px 断点混进代码
 * · `check:css-fonts` 匹配写坏 → 直写 px 的字号重新出现，字体缩放体系被绕开
 *
 * 夹具两面都锁：ok（合法档位 / 走 var 与 calc）、bad（999px 断点 / 13px 字号）。
 */
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

function run(script: string, root: string) {
  const r = spawnSync(process.execPath, [resolve('scripts', script), '--root', root], { encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

describe('check:css-breakpoints 闸门自测', () => {
  it('**设计体系里的断点必须通过**', () => {
    const { code, out } = run('check-css-breakpoints.mjs', 'tests/fixtures/css-breakpoints/ok')
    expect(code, `合法断点被判违规：\n${out}`).toBe(0)
  })

  it('**体系外的断点必须报出来**', () => {
    const { code, out } = run('check-css-breakpoints.mjs', 'tests/fixtures/css-breakpoints/bad')
    expect(code, '随手写的 999px 断点没报 → 断点体系形同虚设').toBe(1)
    expect(out).toContain('999')
  })
})

describe('check:css-fonts 闸门自测', () => {
  it('**走 var / calc 的字号必须通过**', () => {
    const { code, out } = run('check-css-fonts.mjs', 'tests/fixtures/css-fonts/ok')
    expect(code, `合法字号写法被判违规：\n${out}`).toBe(0)
  })

  it('**直写 px 的字号必须报出来**', () => {
    const { code, out } = run('check-css-fonts.mjs', 'tests/fixtures/css-fonts/bad')
    expect(code, '直写 13px 没报 → 字体缩放体系被绕开').toBe(1)
    expect(out).toContain('13px')
  })
})
