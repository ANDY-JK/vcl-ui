/* ═══════════ #434：预览 blob URL 的释放单出口 ═══════════
 *
 * useUploadQueue 原先 6 处手写 revoke，其中 4 处带 blob 前缀判定、2 处裸调，
 * **0 处**挡异常。真实风险：宿主回填的条目可能带自己的 URL（http / data / 相对路径），
 * revoke 在部分内核抛 TypeError；`files.value.forEach` 里的清理循环一旦抛，
 * 会就地打断在所有剩余元素上 —— 后面每个预览 Blob 都泄漏（几十张连拍就是几十 MB），
 * watch 回调里抛错还会冒到 Vue 调度器。
 *
 * 修法是 revokePreviewUrl()：只撤 blob 前缀、撤不掉也不抛；6 处统一走它。
 *
 * 判据直接取源码 —— 这些函数没导出，DOM 交互打不出"宿主 URL 混在队列里"这种边界。
 * 反向保护两条：非 blob 的 URL 不撤销（证明不是无脑包装）、撤销抛错不冒泡。
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect, vi } from 'vitest'

const SRC = readFileSync('src/components/form/utils/useUploadQueue.ts', 'utf8')
/** 去掉行注释再计数 —— 注释里会引用旧写法（`URL.revokeObjectURL(...)`），
 * 那是"说明历史"的文字，不是调用点。 */
const CODE = SRC.split('\n')
  .filter((l) => !l.trimStart().startsWith('*') && !l.trimStart().startsWith('//'))
  .join('\n')

/** 从源码抽出 helper 的 body，在沙箱里重放（不依赖组件实例） */
function helperBody(): string {
  const m = SRC.match(/function revokePreviewUrl\(url\?: string\): void \{([\s\S]*?)\n  \}/)
  expect(m, '源码里应有 revokePreviewUrl 定义').toBeTruthy()
  return m![1]!
}

function run(url: string | undefined, fakeURL: { revokeObjectURL: (u: string) => void }): void {
  const sandbox = new Function('URL', 'url', helperBody())
  sandbox(fakeURL, url)
}

describe('useUploadQueue · 预览 blob URL 释放单出口（#434）', () => {
  it('**只有 helper 里直接调 URL.revokeObjectURL**（其余全是转调）', () => {
    const raw = CODE.split('URL.revokeObjectURL(').length - 1
    expect(raw, '手写 revoke 调用应只剩 helper 内 1 处').toBe(1)
  })

  it('**helper 先判 blob 前缀再撤销**（宿主 http/data URL 不能撤）', () => {
    expect(SRC).toMatch(/function revokePreviewUrl\(url\?: string\): void \{/)
    expect(SRC).toMatch(/if \(!url\?\.startsWith\('blob:'\)\) return/)
  })

  it('**helper 用 try/catch 吞掉撤销异常**（撤不掉只影响回收时机）', () => {
    expect(SRC, 'revokeObjectURL 必须被 try 包住').toMatch(/try \{\s*URL\.revokeObjectURL\(url\)\s*\} catch \{/)
  })

  it('**反向保护：blob URL 撤销、宿主 URL 与空值不撤销**', () => {
    const spy = vi.fn()
    const fakeURL = { revokeObjectURL: spy }

    run('blob:https://x/abc', fakeURL)
    expect(spy, 'blob URL 应被撤销').toHaveBeenCalledTimes(1)

    run('https://cdn.example.com/a.jpg', fakeURL)
    run('data:image/png;base64,AAA', fakeURL)
    run(undefined, fakeURL)
    expect(spy, '宿主 URL / data URL / 空值都不该撤销').toHaveBeenCalledTimes(1)
  })

  it('**反向保护：revokeObjectURL 抛错时不冒泡**（清理循环不被打断）', () => {
    const throwing = {
      revokeObjectURL: () => {
        throw new TypeError('revokeObjectURL is not a function')
      },
    }
    expect(() => run('blob:x', throwing), '撤不掉不该让调用方崩').not.toThrow()
  })

  it('**所有释放点都转调 helper**（没有残留的手写判定）', () => {
    // 除 helper 内那一次，代码里不该再出现 blob 前缀判定
    const leftovers = CODE.split("startsWith('blob:')").length - 1
    expect(leftovers, 'blob 前缀判定应只出现在 helper 内').toBe(1)
  })
})
