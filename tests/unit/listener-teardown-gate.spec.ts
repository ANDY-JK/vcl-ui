// @vitest-environment node
/**
 * 全局监听器的「卸载兜底」形态闸口（#513）
 *
 * ## 背景
 *
 * `_internal` 的共享 composable 里，凡注册**全局**（window/document）监听的，必须自己
 * 兜底卸载 —— 「调用方必须自己挂生命周期」不再被接受为设计：`useEscClose` 就是这么写
 * docblock 的，结果调用方忘了 `onUnmounted(unmount)` 时监听与 `_stack` entry 永久残留
 * （死 entry 还会占据 `isTopVisible()` 的"栈顶"，把**真弹层**的 Esc 吞掉 —— #512 实测）。
 *
 * ## 判据
 *
 * **A（对称性）**：`_internal` 下每个 .ts，每个被 `addEventListener(` 监听的事件名，
 * 同一文件必须能找到 `removeEventListener(` 摘除（无论挂在什么对象上 ——
 * 容器级监听同样要求成对，`scroll-edge` 就是成对的）。
 *
 * **B（兜底）**：文件里出现 `(window|document)\.addEventListener`（真注册语句形状）
 * 的，同一文件必须含 `onBeforeUnmount|onUnmounted|onScopeDispose` 之一 ——
 * 全局监听的生命周期不许完全推给调用方。
 *
 * ## 自检（§9.90 铁律：判据必须抓得住坏样例）
 *
 * 1. 扫描器必须真的扫到 ≥6 个注册点（防零迭代恒绿）；
 * 2. 三个坏样例（挂了不摘 / 摘了但无兜底 / 完全干净）分别断言判据能红能绿。
 *
 * ## 已知豁免
 *
 * - `ssr-guard.ts`：docblock 的用法示例里写着 `window.addEventListener(...)` 的**字符串**，
 *   不是真注册 —— 判据 B 匹配的是语句形状 `(window|document)\.addEventListener(`，
 *   该文件本来就没有真注册，自然不触发判据 B（判据 A 的计数也把它当成 0）。
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** 收集 _internal 下所有 .ts（含子目录） */
function listInternal(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (p.endsWith('.ts')) out.push(p)
    }
  }
  walk('src/components/_internal')
  return out
}

interface Violation {
  file: string
  rule: 'A-unbalanced' | 'B-no-teardown'
  detail: string
}

/** 判据本体（纯函数，坏样例自检用） */
export function scanListenerTeardown(file: string, src: string): Violation[] {
  const out: Violation[] = []
  // 先剥掉 /** … */ 与 // 注释：docblock 里的**用法示例**（如 ssr-guard 的
  // `window.addEventListener(...)`）不是真注册，计数会把它们当注册点 ——
  // §9.86/§9.90 同一坑的第三次出现（注释里的字样会被机械判据当真）。
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1: string) => p1)

  // 事件名对称性：addEventListener('x', …) vs removeEventListener('x'…
  const added = [...code.matchAll(/\.addEventListener\(\s*['"]([\w-]+)['"]/g)].map((m) => m[1]!)
  const removed = [...code.matchAll(/\.removeEventListener\(\s*['"]([\w-]+)['"]/g)].map((m) => m[1]!)
  for (const ev of added) {
    if (!removed.includes(ev)) {
      out.push({ file, rule: 'A-unbalanced', detail: `addEventListener('${ev}') 没有对应的 removeEventListener('${ev}')` })
    }
  }
  // 兜底：真注册语句形状
  const globalRegistered = /(window|document)\.addEventListener\(/.test(code)
  const hasTeardown = /onBeforeUnmount|onUnmounted|onScopeDispose/.test(code)
  if (globalRegistered && !hasTeardown) {
    out.push({ file, rule: 'B-no-teardown', detail: '注册了 window/document 级监听，但文件内没有卸载钩子' })
  }
  return out
}

describe('全局监听器卸载兜底（#513）', () => {
  it('_internal 全部模块满足两条判据', () => {
    const files = listInternal()
    expect(files.length, '应能扫到 _internal 的模块').toBeGreaterThan(8)
    const violations: Violation[] = []
    for (const f of files) violations.push(...scanListenerTeardown(f, readFileSync(f, 'utf8')))
    const detail = violations.map((v) => `${v.file}  [${v.rule}] ${v.detail}`).join('\n  ')
    expect(violations, `监听器卸载兜底违规：\n  ${detail}`).toEqual([])
  })

  it('判据自检：扫描器必须真的扫到注册点（防零迭代恒绿）', () => {
    let registrationPoints = 0
    for (const f of listInternal()) {
      const src = readFileSync(f, 'utf8')
      const code = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1: string) => p1)
      registrationPoints += [...code.matchAll(/\.addEventListener\(/g)].length
    }
    expect(registrationPoints, `实际注册点 ${registrationPoints}，扫描器若失配则为 0`).toBeGreaterThanOrEqual(6)
  })

  it('判据自检：坏样例必须被两条判据分别抓到', () => {
    // ① 挂了不摘（违反 A）
    const noRemove = `
      window.addEventListener('keydown', h)
      function h() {}
    `
    expect(scanListenerTeardown('bad-a.ts', noRemove)).toEqual([
      expect.objectContaining({ rule: 'A-unbalanced' }),
      expect.objectContaining({ rule: 'B-no-teardown' }),
    ])

    // ② 容器级挂了不摘（同样违反 A；但不是全局，不触发 B）
    const containerNoRemove = `
      el.addEventListener('scroll', h)
      function h() {}
    `
    expect(scanListenerTeardown('bad-c.ts', containerNoRemove)).toEqual([
      expect.objectContaining({ rule: 'A-unbalanced' }),
    ])

    // ③ 完全干净：全局挂/摘 + 有卸载钩子
    const clean = `
      onUnmounted(() => {
        window.addEventListener('resize', h)
      })
      window.addEventListener('resize', h)
      window.removeEventListener('resize', h)
    `
    expect(scanListenerTeardown('ok.ts', clean)).toEqual([])

    // ④ docblock 示例不算注册（ssr-guard 的形状）—— 注释剥离后 code 里只剩真语句
    const docblockOnly = `
      /**
       *   if (isBrowser) { window.addEventListener(...) }
       */
      export const isBrowser = true
    `
    expect(scanListenerTeardown('ssr-guard-like.ts', docblockOnly)).toEqual([])

    // ⑤ docblock 里的**事件名**也不参与对称性计数
    const docblockEventName = `
      /**
       * 用法：el.addEventListener('resize', h)
       */
      export const x = 1
    `
    expect(scanListenerTeardown('doc-only.ts', docblockEventName)).toEqual([])
  })
})
