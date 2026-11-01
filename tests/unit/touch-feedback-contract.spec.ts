/**
 * 触屏按下反馈（#311）
 *
 * ## 背景
 *
 * #310 把全库 `:hover` 包进了 `@media (hover: hover)` —— 触屏上不再有 hover 反馈。
 * 这本身是对的（粘滞高亮更像 bug），但少了 hover 之后，触屏用户点按钮
 * **完全没有任何视觉响应**：手指按下去界面一动不动，用户不确定"到底点到没有"。
 *
 * ## 为什么是静态契约而不是渲染断言
 *
 * happy-dom 不应用媒体查询（`:active` + `@media (hover: none)` 在测试环境里永远不命中），
 * 所以在测试里"点一下看透明度"是做不到的 —— 那样写出来的断言是**假绿**（#299 的教训）。
 * 这里改为对 `tokens.css` 的**契约断言**：兜底块必须在、必须只作用于触屏、
 * 必须用 `:where()`（不抢组件自己的 `:active`）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const TOKENS = readFileSync('src/components/tokens.css', 'utf8')

/** 取出 `@media (hover: none) { ... }` 的块体 */
function touchBlock(): string | null {
  const idx = TOKENS.indexOf('@media (hover: none)')
  if (idx < 0) return null
  const open = TOKENS.indexOf('{', idx)
  let depth = 0
  for (let i = open; i < TOKENS.length; i++) {
    if (TOKENS[i] === '{') depth++
    else if (TOKENS[i] === '}') {
      depth--
      if (depth === 0) return TOKENS.slice(open + 1, i)
    }
  }
  return null
}

describe('触屏按下反馈（tokens.css 兜底）', () => {
  /** 去掉所有空白后的块体：prettier 会折行选择器，逐字匹配会被打散 */
  const compact = (body: string) => body.replace(/\s+/g, '')

  it('**存在 @media (hover: none) 的 :active 兜底块**', () => {
    const body = touchBlock()
    expect(body, '没有兜底块：触屏点按钮会毫无视觉反馈').toBeTruthy()
    expect(compact(body!)).toContain(':active')
  })

  it('**用 :where() 包选择器**（特异性 0，不抢组件自己的 :active）', () => {
    const body = touchBlock()!
    expect(compact(body), '不用 :where() 会覆盖掉库里 19 处自定义 :active').toContain(':where(')
  })

  it('**覆盖主要可点角色**（button / role=button / tab / option）', () => {
    const body = touchBlock()!
    for (const sel of ['button', "[role='button']", "[role='tab']", "[role='option']"]) {
      expect(compact(body), `兜底应包含 ${sel}`).toContain(compact(sel))
    }
  })

  it('**精确选择器结构**（含 :not(:disabled)，且不允许被追加旁路选择器）', () => {
    // 只验"包含 :not(:disabled)"不够：在末尾追加 `, :disabled:active` 这种写法
    // 仍然包含该子串，却把禁用态也纳入了按下反馈（负向对照实测会变绿）。
    // 所以这里钉**整段选择器**（去空白后逐字比对）。
    const EXPECTED =
      ":where(button,a[href],[role='button'],[role='tab'],[role='option'],[role='menuitem'],[role='switch']):not(:disabled):active{"
    expect(compact(touchBlock()!)).toContain(EXPECTED)
  })

  it('**用 opacity 而不是 filter**（filter 会创建层叠上下文且参与颜色计算）', () => {
    const body = touchBlock()!
    expect(body).toMatch(/opacity:\s*0?\.\d+/)
    expect(body, 'filter 会给子元素创建新的 containing block').not.toContain('filter:')
  })

  it('**不加 transition**（按下反馈要即时）', () => {
    expect(touchBlock()!).not.toContain('transition')
  })

  it('只在触屏媒体查询里（桌面观感零变化）', () => {
    // 兜底块外层必须是 (hover: none)
    const idx = TOKENS.indexOf('@media (hover: none)')
    expect(idx).toBeGreaterThan(-1)
    const before = TOKENS.slice(0, idx)
    const lastMedia = before.lastIndexOf('@media')
    // 该块不能被别的 media 包住（即它是出现顺序里最后的那个 media 开头）
    expect(TOKENS.slice(lastMedia, idx).includes('(hover: none)') || lastMedia < 0 || before.lastIndexOf('@media (hover: hover)') < lastMedia).toBe(true)
  })
})
