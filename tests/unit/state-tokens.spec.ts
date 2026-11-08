/**
 * 状态三元组 · `-active`（按下态）契约
 *
 * ## 为什么有这个用例
 *
 * 我们原来只有 `-hover`：`default → hover` 两档。触屏没有 hover，
 * 按下时**没有任何独立反馈**（视觉上跟静止一样），这是 BoardUI 状态三元组要补的第三档。
 *
 * ## 为什么不断言具体色值
 *
 * 值由 `color-mix` 从基色派生（换主题自动跟随），断死 hex 会让换色变成破坏性改动。
 * 这里断言的是**结构契约**：
 *   1. 五个语义色都有 `-active`，且都有 fallback（老浏览器回落 hover）
 *   2. 实心按钮家族有 `-solid-active`
 *   3. 覆盖发生在 `@supports (color: color-mix(...))` 里 —— 而不是无条件用新语法
 *   4. 亮色朝黑、暗色朝白（方向与各自主题的 hover 一致）
 *   5. Button 的主/危险按钮真的引用了 `-solid-active`
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const tokens = readFileSync(resolve('src/components/tokens.css'), 'utf8')
const button = readFileSync(resolve('src/components/basic/button-scoped.css'), 'utf8')

const SEMANTIC = ['primary', 'danger', 'success', 'warning', 'info']

describe('状态三元组 · 令牌结构', () => {
  it.each(SEMANTIC)('%s 有 -active 声明且带 fallback', (c) => {
    const fallback = new RegExp(`--vcl-color-${c}-active:\\s*var\\(--vcl-color-${c}-hover`)
    expect(tokens, `${c} 缺少回落声明`).toMatch(fallback)
  })

  it.each(['primary', 'danger'])('%s 实心家族有 -solid-active', (c) => {
    expect(tokens).toMatch(new RegExp(`--vcl-color-${c}-solid-active:`))
  })

  it('color-mix 覆盖写在 @supports 里（不在老浏览器上直接崩）', () => {
    const idx = tokens.indexOf('@supports (color: color-mix')
    expect(idx, '找不到 @supports (color: color-mix…) 守卫').toBeGreaterThan(-1)
    const after = tokens.slice(idx)
    SEMANTIC.forEach((c) => {
      expect(after).toMatch(new RegExp(`--vcl-color-${c}-active:\\s*color-mix`))
    })
  })

  it('**方向正确**：亮色朝黑压暗、暗色朝白提亮（与各自 hover 方向一致）', () => {
    // 亮色块在 :root，暗色块在 :root[data-theme='dark']
    const light = tokens.indexOf("@supports (color: color-mix")
    const darkScope = tokens.indexOf(':root[data-theme=\'dark\']', light)
    expect(darkScope, '找不到暗色 @supports 作用域').toBeGreaterThan(light)
    const lightPart = tokens.slice(light, darkScope)
    const darkPart = tokens.slice(darkScope)
    expect(lightPart).toMatch(/84%,\s*#000/)
    expect(darkPart).toMatch(/84%,\s*#fff/)
  })
})

describe('状态三元组 · 组件真的用了', () => {
  it('Button 主按钮与危险按钮都有 :active 并使用 -solid-active', () => {
    expect(button).toMatch(/\.btn-primary:active:not\(:disabled\)/)
    expect(button).toMatch(/--vcl-color-primary-solid-active/)
    expect(button).toMatch(/\.btn-danger:active:not\(:disabled\)/)
    expect(button).toMatch(/--vcl-color-danger-solid-active/)
  })

  it('按下态不依附 @media (hover: hover)：触屏也要有反馈', () => {
    // :active 规则必须出现在媒体查询之外 —— 抓「紧邻上一个字符是 }」这种包裹特征做不到，
    // 所以换一种可判定的写法：整段里 `:active` 出现次数 ≥ 2，且它们不在 hover 块内
    const activeRules = button.match(/\.btn-(primary|danger):active:not\(:disabled\)/g) ?? []
    expect(activeRules.length).toBe(2)
    // 粗判：hover 媒体查询的闭合与 :active 之间不应夹着 `@media (hover: hover) {`
    const idx = button.indexOf('.btn-primary:active')
    const lastMedia = button.lastIndexOf('@media (hover: hover)', idx)
    const lastClose = button.lastIndexOf('}', idx)
    expect(lastMedia < lastClose, ':active 被写进了 hover 媒体查询里').toBe(true)
  })
})
