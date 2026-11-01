/**
 * 移动端安全区契约（#309）
 *
 * ## 缺陷
 *
 * iPhone 的刘海与 Home 指示条会盖住**贴边固定**的内容：
 *   · 底部抽屉的按钮正好压在 Home 指示条上（点不到/看不清）
 *   · 顶部抽屉、离线横幅、顶部提示被刘海/状态栏遮住
 *
 * ## 判据为什么是"契约清单"而不是扫 CSS
 *
 * 理论上可以扫所有 `position: fixed` 规则判断有没有 `env(safe-area-inset-*)`，
 * 但大量 fixed 元素（浮层、遮罩、下拉）**本来就不需要**安全区，误报会立刻把闸门
 * 变成噪声（#279 的教训）。所以这里只钉**贴边固定且承载内容**的那几个容器 ——
 * 它们少一个安全区，真机上就真的点不到。
 *
 * 新增此类容器时把它加进 `MUST_HANDLE`，闸门自然覆盖到。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const DRAWER = 'src/components/feedback/drawer-scoped.css'
const TOAST = 'src/components/feedback/toast.css'
const OFFLINE = 'src/components/feedback/OfflineIndicator.vue'

/** 必须处理安全区的容器：选择器 → 该方向上应有的 env() */
const MUST_HANDLE: { file: string; selector: string; inset: 'top' | 'bottom' }[] = [
  { file: DRAWER, selector: '.drawer-top', inset: 'top' },
  { file: DRAWER, selector: '.drawer-bottom', inset: 'bottom' },
  { file: TOAST, selector: '.toast-container', inset: 'top' },
  { file: TOAST, selector: '.toast-bottom-right', inset: 'bottom' },
  { file: TOAST, selector: '.toast-bottom-left', inset: 'bottom' },
  { file: OFFLINE, selector: '.offline-bar', inset: 'top' },
]

/** 取出某个选择器的规则体（简单按 `{`…`}` 切，够用且不依赖完整 CSS 解析） */
function ruleBody(css: string, selector: string): string | null {
  const idx = css.indexOf(selector + ' {')
  if (idx < 0) return null
  const open = css.indexOf('{', idx)
  const close = css.indexOf('}', open)
  if (open < 0 || close < 0) return null
  return css.slice(open + 1, close)
}

describe('移动端安全区 · 契约', () => {
  it.each(MUST_HANDLE)('**$selector 必须处理 safe-area-inset-$inset**', ({ file, selector, inset }) => {
    const css = readFileSync(file, 'utf8')
    const body = ruleBody(css, selector)
    expect(body, `${file} 里应有 ${selector} 规则`).toBeTruthy()
    expect(
      body!,
      `${selector} 少了 env(safe-area-inset-${inset})：真机上会被刘海/Home 指示条盖住`,
    ).toContain(`env(safe-area-inset-${inset})`)
  })

  it('安全区写法集中在 feedback 目录（不改数据域布局）', () => {
    // 防止有人把 env() 加进表格/表单的普通容器里污染桌面观感
    const dataCss = readFileSync('src/components/data/composables/data-table-scoped.css', 'utf8')
    expect(dataCss, '表格不该出现 safe-area（桌面端为主，加了会压缩内容区）').not.toContain('safe-area-inset')
  })
})
