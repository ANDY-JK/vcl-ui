/**
 * check:icon-names 闸门的自测（#331）
 *
 * ## 为什么补
 *
 * `IconSvg` 遇到不认识的图标名**不报错，只渲染一个兜底方块** —— 也就是说写错图标名
 * 在运行时、单测、类型检查里**全都发现不了**，只有用户看到"这里是个方块"。
 * 这道闸门是唯一的拦截点，但它在 `tests/` 里零引用。
 *
 * ## 判据与风险
 *
 * 它把 `<IconSvg type="x">` 和包装组件的 `icon="x"` / `icon: 'x'` 解析出来，
 * 再按 provider 查真实图标集（lucide / solar 名录 / morphicons）。
 * 改坏的方向有两个：
 * · 解析失效（正则写坏）→ **一个都不检查**，静默通过
 * · 判定写反（存在当成不存在）→ 全库误报
 *
 * 用例两面都锁：ok（两个真实 lucide 名）必须过，bad（不存在的名字）必须报且点出名字。
 */
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const SCRIPT = resolve('scripts/check-icon-names.mjs')

function runGate(root: string) {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

describe('check:icon-names 闸门自测', () => {
  it('**真实图标名必须通过**（闸门不能把正常图标判成不存在）', () => {
    const { code, out } = runGate('tests/fixtures/icon-names/ok')
    expect(code, `闸门对真实图标名报了错：\n${out}`).toBe(0)
  })

  it('**不存在的图标名必须报出来，并点名是哪个**', () => {
    const { code, out } = runGate('tests/fixtures/icon-names/bad')
    expect(code, '写错的图标名没报 → 用户只会看到一个兜底方块').toBe(1)
    expect(out).toContain('definitely-not-an-icon')
  })

  it('**报错带文件位置**（否则几百个组件里找不到）', () => {
    const { out } = runGate('tests/fixtures/icon-names/bad')
    expect(out).toMatch(/Bad\.vue/)
  })
})
