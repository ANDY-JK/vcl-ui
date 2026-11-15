// @vitest-environment node
/**
 * ssr-guard · 「没有浏览器」那一侧的契约（#488）
 *
 * 为什么用 node 环境而不是 `vi.stubGlobal`：`isBrowser` 是 **import 期求值的模块常量**，
 * `vi.stubGlobal` 改不了它（这个测法在 `storage-persist-ssr.spec.ts` 里已记过）。
 * 行内 `@vitest-environment node` 让 vitest 按文件决定环境，模块链从加载起就见不到 window ——
 * 这才是真正的 SSR 形态（服务端根本没有 window 这个全局）。
 *
 * 本文件补的是 ssr-guard **自身**的 SSR 分支：此前只有 `safeRun` 两条浏览器路径被验
 * （`utils.spec.ts`），SSR 侧的 `safeWindow` / `safeDocument` / `safeLocalStorage` /
 * `safeNavigator` / `safeRun(fallback)` 一个都没跑过 —— 而这些正是"库在服务端 import
 * 不崩"这条承诺的落脚点。
 */
import { describe, it, expect } from 'vitest'
import {
  isBrowser,
  safeDocument,
  safeLocalStorage,
  safeNavigator,
  safeRun,
  safeWindow,
} from '@/components/_internal/ssr-guard'

describe('ssr-guard · SSR 侧（node 环境：没有 window/document）', () => {
  it('isBrowser 为 false（模块常量，import 期就定了）', () => {
    expect(isBrowser).toBe(false)
    expect(typeof window).toBe('undefined')
    expect(typeof document).toBe('undefined')
  })

  it('safeWindow / safeDocument / safeNavigator 都返回 undefined（不抛）', () => {
    expect(safeWindow()).toBeUndefined()
    expect(safeDocument()).toBeUndefined()
    expect(safeNavigator()).toBeUndefined()
  })

  it('safeLocalStorage 返回 undefined（不是 ReferenceError）', () => {
    expect(safeLocalStorage()).toBeUndefined()
  })

  it('safeRun 在 SSR 下返回 fallback、且**不执行** fn（副作用不该在服务端跑）', () => {
    let ran = false
    const out = safeRun(() => {
      ran = true
      return 1
    }, 'fallback')
    expect(out).toBe('fallback')
    expect(ran, 'SSR 下不该执行回调').toBe(false)
  })

  it('safeRun 不给 fallback 时返回 undefined', () => {
    expect(safeRun(() => 1)).toBeUndefined()
  })
})
