/* ═══════════ #436：blob URL 全库总账（静态对账 + 生命周期） ═══════════
 *
 * 起因：#429 → #430 → #433 → #434 → #435 五轮都在修"blob URL 释放/持久化"的同族问题，
 * 每轮都在一个**新文件**里发现一份新实现。与其等下一次暴露，不如一次性把账对平。
 *
 * 判据取源码，三条规则各有明确的可观测对象：
 *
 *   ① **自造自还**：自己 `createObjectURL` 的文件必须自己 `revokeObjectURL`
 *      （第三方 vendor 如 xlsx.mjs 内部自带配对，例外）；
 *   ② **下载型必须延后撤**：`a.click()` 只是**发起**下载，浏览器读 blob URL 是异步的
 *      （#429/#430）—— click 之后几行内出现 revoke 的，中间必须有 `setTimeout(`；
 *   ③ **留存型必须卸载清**：把 URL 存进 ref/数组的（拍照预览、连拍胶卷），
 *      必须有 `onUnmounted` 清理 —— 切页时最后一张最容易漏。
 *
 * 判据不依赖跑起来的 DOM（demo 的 URL 是 ref，交互打不全），也不依赖覆盖率。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import { describe, it, expect } from 'vitest'

/** 第三方 vendor：内部自带 create/revoke 配对，不参与本库的对账 */
const VENDOR = /[\\/]xlsx\.mjs$/

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|vue)$/.test(name)) out.push(p.split(sep).join('/'))
  }
  return out
}

const files = [...walk('src/components'), ...walk('src/demos')]
const read = (f: string) => readFileSync(f, 'utf8')
const holders = files.filter((f) => !VENDOR.test(f) && read(f).includes('URL.createObjectURL('))

describe('blob URL 全库总账（#436）', () => {
  it('**对账范围非空**（守卫：扫描器没静默失效）', () => {
    expect(holders.length, '应至少覆盖 5 个组件 + 若干 demo').toBeGreaterThanOrEqual(5)
  })

  it('**① 每个创建者都有配对的撤销**（自造自还，不留给宿主）', () => {
    const bad = holders.filter((f) => !read(f).includes('revokeObjectURL('))
    expect(bad, `这些文件创建了 blob URL 却从不撤销：${bad.join(', ')}`).toEqual([])
  })

  it('**② 下载型：click 后的 revoke 必须延后一轮宏任务**（#429/#430 判据）', () => {
    const bad: string[] = []
    for (const f of holders) {
      const lines = read(f).split('\n')
      lines.forEach((line, i) => {
        if (!line.includes('.click()')) return
        const window = lines.slice(i, i + 6).join('\n')
        if (window.includes('URL.revokeObjectURL(') && !window.includes('setTimeout(')) {
          bad.push(`${f}:${i + 1}`)
        }
      })
    }
    expect(bad, `click 后直接 revoke（会抽走 URL，下载静默失败）：${bad.join(', ')}`).toEqual([])
  })

  it('**③ 留存型：URL 存进 ref/数组的必须有 onUnmounted 清理**', () => {
    // 精确区分两种持有方式：
    //   - `const url = URL.createObjectURL(...)` → 局部变量，通常 click 完就撤（走规则②）
    //   - `xxx.value = URL.createObjectURL(...)` / `arr.push(URL.createObjectURL(...))` → 留存的预览句柄
    const retained = holders.filter((f) =>
      /[\w.)\]]\.value\s*=\s*URL\.createObjectURL\(|\.push\(\s*URL\.createObjectURL\(/.test(read(f)),
    )
    expect(retained.length, '应至少覆盖两个相机 demo（否则规则失效）').toBeGreaterThanOrEqual(2)
    const bad = retained.filter((f) => !read(f).includes('onUnmounted'))
    expect(bad, `这些文件留存 blob URL 却没有 onUnmounted 清理：${bad.join(', ')}`).toEqual([])
  })

  it('**反向保护：只撤不建的出口不算违规**（_internal/utils 的 downloadBlob 只撤不建）', () => {
    const revokers = files.filter((f) => !VENDOR.test(f) && read(f).includes('revokeObjectURL('))
    expect(revokers.length).toBeGreaterThan(holders.length)
  })
})
