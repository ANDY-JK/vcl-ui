/**
 * ssr-guard · 浏览器侧的契约（#488）
 *
 * 与 `ssr-guard-node.spec.ts` 成对：那份用 node 环境（文件头 docblock 指定）验"没有浏览器"，
 * 这份用默认 happy-dom 验"有浏览器"。两侧合起来才是 `ssr-guard` 的完整承诺 ——
 * 尤其是 `safeLocalStorage` 里那个 **隐私模式** 的 try/catch：Safari 无痕/禁用站点数据时
 * `window.localStorage` 的**取值本身**就抛 SecurityError，不包 try 的话库直接崩在模块求值期。
 * 这条路径以前没有任何用例走过。
 *
 * ⚠ 别在**本文件的注释里**原样写出 vitest 的环境指令（`@` + `vitest-environment` + 环境名）：
 *    vitest 会扫描文件首个注释块，读到就当成本文件的环境设置 —— 本轮实测踩过，
 *    浏览器侧用例因此被跑在 node 环境里，报 `ReferenceError: window is not defined`。
 */
import { describe, it, expect, afterEach } from 'vitest'
import {
  isBrowser,
  safeDocument,
  safeLocalStorage,
  safeNavigator,
  safeRun,
  safeWindow,
} from '@/components/_internal/ssr-guard'

const realLocalStorage = window.localStorage

afterEach(() => {
  Object.defineProperty(window, 'localStorage', { value: realLocalStorage, configurable: true, writable: true })
})

describe('ssr-guard · 浏览器侧（happy-dom）', () => {
  it('isBrowser 为 true，三个 safe* 返回真实对象', () => {
    expect(isBrowser).toBe(true)
    expect(safeWindow()).toBe(window)
    expect(safeDocument()).toBe(document)
    expect(safeNavigator()).toBe(navigator)
  })

  it('safeLocalStorage 返回 window.localStorage', () => {
    expect(safeLocalStorage()).toBe(window.localStorage)
  })

  it('**隐私模式：取 localStorage 本身抛 SecurityError → 返回 undefined 而不是崩**', () => {
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new Error('SecurityError: localStorage is not available')
      },
      configurable: true,
    })
    // 不能抛：库在 setup/模块期调用它，抛出去等于整页崩在 Safari 无痕模式
    expect(() => safeLocalStorage()).not.toThrow()
    expect(safeLocalStorage()).toBeUndefined()
  })

  it('safeRun 在浏览器下执行回调并返回结果', () => {
    let ran = false
    expect(
      safeRun(() => {
        ran = true
        return 'ok'
      }),
    ).toBe('ok')
    expect(ran).toBe(true)
  })

  it('safeRun 回调抛异常 → 返回 fallback（浏览器 API 失败不该带崩调用方）', () => {
    expect(
      safeRun(() => {
        throw new Error('boom')
      }, 'fallback'),
    ).toBe('fallback')
  })

  it('safeRun 回调抛异常且没给 fallback → undefined', () => {
    expect(
      safeRun(() => {
        throw new Error('boom')
      }),
    ).toBeUndefined()
  })
})