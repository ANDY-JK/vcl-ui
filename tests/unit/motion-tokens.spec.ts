// 减弱动效（F7）回归锁——锁 tokens.css 的 reduced 块结构不回退：
// 显式 reduced 属性、系统偏好 media、full 逃生口三件套缺一即红。
// 纯文件内容断言（CSS 行为在浏览器，静态锁防的是「顺手删块」）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(import.meta.dirname, '../../src/components/tokens.css'), 'utf8')

describe('tokens.css 减弱动效块（F7）', () => {
  it('显式开关：data-vcl-motion="reduced" 重定义过渡令牌并压停关键帧', () => {
    expect(css).toContain(":root[data-vcl-motion='reduced']")
    const reduced = css.slice(css.indexOf(":root[data-vcl-motion='reduced']"))
    expect(reduced).toContain('--transition-fast: 0.01ms')
    expect(reduced).toContain('animation-iteration-count: 1 !important')
  })

  it('系统偏好：prefers-reduced-motion 生效且不碰布局终态', () => {
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).not.toMatch(/reduced[\s\S]{0,400}(display|position)\s*:/)
  })

  it('逃生口：full 声明把宿主从系统偏好里豁免出来', () => {
    expect(css).toContain(":root:not([data-vcl-motion='full'])")
  })

  it('单一真源：Loading/Skeleton 不再各留本地 reduced @media 块', () => {
    const loading = readFileSync(resolve(import.meta.dirname, '../../src/components/feedback/Loading.vue'), 'utf8')
    const skeleton = readFileSync(resolve(import.meta.dirname, '../../src/components/data/Skeleton.vue'), 'utf8')
    expect(loading).not.toContain('@media (prefers-reduced-motion')
    expect(skeleton).not.toContain('@media (prefers-reduced-motion')
  })
})
