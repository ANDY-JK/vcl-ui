/**
 * check:css-scale 闸门的自测（#336）
 *
 * ## 两个判据，各有隐蔽之处
 *
 * 1. **尺寸必须走等比缩放**：`width: 16px` 这种直写值在缩放体系里会"掉队"，
 *    但它语法完全合法、看起来也没问题。判据还带两条**豁免**（白名单属性、a11y 热区 24px）——
 *    豁免写宽了漏报，写窄了误报。
 * 2. **注释提前闭合**：注释正文里出现 `*` 紧跟 `/` 会让注释提前结束，后面说明文字变成非法
 *    CSS，浏览器把紧随其后的声明一起丢掉 —— **令牌语法上在文件里，读值却是空，全站静默回退**。
 *    这条判据靠"剥掉注释与字符串后不该再有中文"来判定，逻辑相当绕。
 *
 * 两道都验：ok（calc 写法 + 合法中文注释）必须过；bad（直写 px + 提前闭合注释）必须都报。
 */
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const SCRIPT = resolve('scripts/check-css-scale.mjs')

function run(root: string) {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

describe('check:css-scale 闸门自测', () => {
  it('**calc 写法与合法中文注释必须通过**（闸门不能误报）', () => {
    const { code, out } = run('tests/fixtures/css-scale/ok')
    expect(code, `合法样式被判失败：\n${out}`).toBe(0)
  })

  it('**直写 px 的尺寸必须报出来**（缩放体系会掉队）', () => {
    const { code, out } = run('tests/fixtures/css-scale/bad')
    expect(code, '直写 px 没报 → 缩放体系被绕开').toBe(1)
    // 断言"带文件名的尺寸违规"，而不是裸的 `width: 16px`：
    // 注释提前闭合的提示里也会出现这段代码片段，裸串会被它蒙混过关。
    expect(out).toContain('bad.css：width: 16px')
  })

  it('**注释提前闭合必须报出来**（这条最隐蔽：令牌在文件里但读值是空）', () => {
    const { out } = run('tests/fixtures/css-scale/bad')
    expect(out, '注释提前闭合没报 → 全站会静默回退').toContain('注释疑似提前闭合')
  })
})
