// 减弱动效（F7）回归锁——锁 tokens.css 的 reduced 块结构不回退：
// 显式 reduced 属性、系统偏好 media、full 逃生口三件套缺一即红。
// 纯文件内容断言（CSS 行为在浏览器，静态锁防的是「顺手删块」）。
//
// 2026-10-31（R5-A6）：锁的范围从「点名 Loading/Skeleton 两文件」扩到「全组件层递归扫描」——
// 审计发现 card-scoped.css 还有一处本地 reduced 块，且选择器写成 .grid-corner--dot::after
// （动画实际在 .grid-corner-mark::after 上）→ 永不匹配的死规则。点名式回归锁抓不到这类
// 「新增/漏改的第三个文件」，递归扫描才能保证「单一真源」名副其实。
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const SRC = resolve(import.meta.dirname, '../../src')
const css = readFileSync(join(SRC, 'components', 'tokens.css'), 'utf8')

describe('tokens.css 减弱动效块（F7）', () => {
  it('显式开关：data-vcl-motion="reduced" 重定义过渡令牌并压停关键帧', () => {
    expect(css).toContain(":root[data-vcl-motion='reduced']")
    const reduced = css.slice(css.indexOf(":root[data-vcl-motion='reduced']"))
    expect(reduced).toContain('--vcl-transition-fast: 0.01ms')
    expect(reduced).toContain('animation-iteration-count: 1 !important')
  })

  it('系统偏好：prefers-reduced-motion 生效且不碰布局终态', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).not.toMatch(/reduced[\s\S]{0,400}(display|position)\s*:/)
  })

  it('逃生口：full 声明把宿主从系统偏好里豁免出来', () => {
    expect(css).toContain(":root:not([data-vcl-motion='full'])")
  })

  it('单一真源：除 tokens.css 外，全组件层不得出现本地 reduced @media 块（递归扫描）', () => {
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === 'node_modules' || name === 'dist') continue
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(css|vue)$/.test(name)) {
          const rel = relative(SRC, p).replace(/\\/g, '/')
          if (rel === 'components/tokens.css') continue
          if (readFileSync(p, 'utf8').includes('@media (prefers-reduced-motion')) offenders.push(rel)
        }
      }
    }
    walk(join(SRC, 'components'))
    expect(
      offenders,
      `这些文件各自留了 reduced @media 块（应删掉，统一由 tokens.css 的 *::after 全局块压停）：\n  ${offenders.join('\n  ')}`,
    ).toEqual([])
  })

  it('card-scoped.css 不再出现选择器写错的 reduced 死规则（.grid-corner--dot::after）', () => {
    // 历史缺陷：pulse 动画挂在 .grid-corner--dot .grid-corner-mark::after 上，
    // 本地 reduced 块却写 .grid-corner--dot::after —— 选择器永不匹配，等于没停。
    // 现由 tokens.css 的 *::after 全局块统一压停，本地块已删；此断言防它被"补回来"。
    const cardScoped = readFileSync(join(SRC, 'components', 'data', 'card-scoped.css'), 'utf8')
    expect(cardScoped, 'card-scoped.css 不应再有本地 reduced @media 块').not.toContain(
      '@media (prefers-reduced-motion',
    )
    expect(cardScoped, '不应再出现选择器写错的 .grid-corner--dot::after').not.toContain('.grid-corner--dot::after')
  })
})
