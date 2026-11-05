/* ═══════════ #433：blob URL 释放要"共用一个出口"且"撤不掉不崩" ═══════════
 *
 * 源码原先 6 处手写 revoke，只有 2 处带 startsWith('blob:') 判定、0 处挡异常。
 * 两个真实风险都在这：
 *
 * ① 对非 blob URL 调 revokeObjectURL —— 部分内核抛 TypeError。一旦抛，
 *    `shots.forEach` 那种清理循环会被打断在所有剩余元素上：后面每一张的
 *    URL 都泄漏（内存里一直挂着整个图片 Blob）。
 * ② revoke 在极老 WebView 上缺失/不可用 → 抛错同样打断清理，甚至让
 *    onUnmounted 抛错，影响宿主卸载。
 *
 * 修法是加 revokeShotUrl()：只撤 blob:、撤不掉也不抛；6 处统一走它。
 * 这里直接以源码为判据 —— 这些函数没导出，靠 DOM 交互打不出"队列里混入
 * 宿主 http URL"这种边界，静态检查才是能真正锁住它的断言。
 *
 * ⚠️ 本组用例的反向保护是「非 blob URL 不撤销」与「撤销抛错不冒泡」两条：
 * 它们证明 revokeShotUrl 不是"一律撤销"的无脑包装，也不是"吞掉一切"的空壳。
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect, vi } from 'vitest'

const SRC = readFileSync('src/components/form/CameraCapture.vue', 'utf8')

/** 从源码抽出 helper 的 body，在沙箱里重放（不依赖组件实例） */
function helperBody(): string {
  const m = SRC.match(/function revokeShotUrl\(url: string \| undefined\): void \{([\s\S]*?)\n\}/)
  expect(m, '源码里应有 revokeShotUrl 定义').toBeTruthy()
  return m![1]!
}

function run(url: string | undefined, fakeURL: { revokeObjectURL: (u: string) => void }): void {
  const sandbox = new Function('URL', 'url', helperBody())
  sandbox(fakeURL, url)
}

describe('CameraCapture · blob URL 释放单出口（#433）', () => {
  it('**只有 helper 里直接调 URL.revokeObjectURL**（其余全是转调）', () => {
    const raw = SRC.split('URL.revokeObjectURL(').length - 1
    expect(raw, '手写 revoke 调用应只剩 helper 内 1 处').toBe(1)
  })

  it('**helper 先判 blob: 再撤销**（对 http/data URL 调 revoke 会抛 TypeError）', () => {
    expect(SRC).toMatch(/function revokeShotUrl\(url: string \| undefined\): void \{/)
    expect(SRC).toMatch(/if \(!url \|\| !url\.startsWith\('blob:'\)\) return/)
  })

  it('**helper 用 try/catch 吞掉撤销异常**（撤不掉只影响回收时机，不该打断清理循环）', () => {
    expect(SRC, 'revokeObjectURL 必须被 try 包住').toMatch(/try \{\s*URL\.revokeObjectURL\(url\)\s*\} catch \{/)
  })

  it('**反向保护：blob URL 撤销、宿主 http URL 不撤销、空值不撤销**', () => {
    const spy = vi.fn()
    const fakeURL = { revokeObjectURL: spy }

    run('blob:https://x/abc', fakeURL)
    expect(spy, 'blob URL 应被撤销').toHaveBeenCalledTimes(1)

    run('https://cdn.example.com/a.jpg', fakeURL)
    expect(spy, '宿主 http URL 不该撤销（撤了会打断循环 → 后续全泄漏）').toHaveBeenCalledTimes(1)

    run('', fakeURL)
    run(undefined, fakeURL)
    expect(spy, '空值/undefined 不该撤销').toHaveBeenCalledTimes(1)
  })

  it('**反向保护：revokeObjectURL 抛错时不冒泡**（老 WebView / 非 blob 内核）', () => {
    const throwing = {
      revokeObjectURL: () => {
        throw new TypeError('revokeObjectURL is not a function')
      },
    }
    expect(() => run('blob:x', throwing), '撤不掉不该让调用方崩').not.toThrow()
  })
})
