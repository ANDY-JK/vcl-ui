/**
 * RTL 闸口判据的自测（#368）
 *
 * ## 为什么拆成纯函数再测
 *
 * `check-rtl.mjs` 顶层会起 dev server + 启浏览器（为取证），任何 import 它的人都会
 * 连带把 Playwright 拉起来 —— 判据无法单独自测。所以把三道判定拆到 `rtl-judge.mjs`：
 * 纯函数、零副作用，用例直接喂 rows。
 *
 * ## 三道判据里 ① 是"防假绿"那道
 *
 * 方向没切过去时，②③ 量的其实是 LTR —— **全绿毫无意义**。
 * 所以本用例对 ① 的断言最严：只要 `direction !== dir` 必须报，哪怕溢出与越界都为 0。
 */
import { describe, it, expect } from 'vitest'
import { judgeRows } from '../../scripts/rtl-judge.mjs'

const ok = (over = {}) => ({
  route: 'select',
  dir: 'rtl',
  direction: 'rtl',
  overflowX: 0,
  offenders: [],
  ...over,
})

describe('RTL 判据（rtl-judge）', () => {
  it('**全绿输入必须返回空**（不能把正常页判坏）', () => {
    expect(judgeRows([ok(), ok({ dir: 'ltr', direction: 'ltr' })])).toEqual([])
  })

  it('**方向没切过去必须报 —— 否则后面两条断言测的其实是 LTR（假绿）**', () => {
    const f = judgeRows([ok({ direction: 'ltr' })])
    expect(f).toHaveLength(1)
    expect(f[0]).toContain('方向未生效')
    expect(f[0]).toContain('假绿')
  })

  it('**横向溢出必须报，并带出像素数**', () => {
    const f = judgeRows([ok({ overflowX: 32 })])
    expect(f).toHaveLength(1)
    expect(f[0]).toContain('横向溢出 32px')
  })

  it('**元素越界必须报，样例最多 3 个**', () => {
    const offenders = [
      { tag: 'div', cls: 'a', left: -10, right: 5 },
      { tag: 'span', cls: '', left: 0, right: 1400 },
      { tag: 'p', cls: 'c', left: -3, right: 2 },
      { tag: 'b', cls: 'd', left: -1, right: 1 },
    ]
    const f = judgeRows([ok({ offenders })])
    expect(f).toHaveLength(1)
    expect(f[0]).toContain('4 个元素越界')
    expect(f[0]).toContain('<div.a>')
    expect(f[0]).not.toContain('<b.d>') // 第 4 个不进样例
  })

  it('**单条 error 记录跳过（页面没打开时不该重复报三条）**', () => {
    expect(judgeRows([{ route: 'select', dir: 'rtl', error: 'Timeout' }])).toEqual([])
  })
})
