/* ═══════════ e2e 时序纪律：媒体切换/异步回填后必须轮询等落定（TD-32，#442） ═══════════
 *
 * TD-32 挂号的两条 flaky：
 *  - `print-media`：`emulateMedia({ media: 'print' })` 只切换介质开关，样式重算落定在之后的帧。
 *    旧版切完立刻 `getComputedStyle`，偶发读到上一帧的屏幕值（--vcl-scale 曾读到 -1）。
 *  - `icon-color-picker`：`toHaveCount(6)` 只证明取色器挂载，不证明主题色已异步回填到 value。
 *    旧版紧接着读值，恰好卡在回填前会拿到 #000000。
 * 两者都是"偶发红、重试即过"—— 重试掩盖了根因。
 *
 * 本 spec 是**静态反向保护**：检查取值动作被 `expect.poll(...)` 包住。
 * 下次有人把轮询改回即时读取，单测当场红，不用等整链偶发一次。
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

/** 「切换 print 后，第一个取值动作不是 expect.poll」的行号列表（空 = 全合规） */
export function findImmediateMediaReads(text) {
  const lines = text.split('\n')
  const bad = []
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes("emulateMedia({ media: 'print' })")) continue
    for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
      const line = lines[j]
      // 下一段开始（新用例 / 切回 screen）→ 本段没有取值，不算违规
      if (/^\s*test\(/.test(line) || line.includes("emulateMedia({ media: 'screen' })")) break
      // 轮询块开始（`.poll(` 可能单独成行，前面是 `await expect`）
      if (line.includes('.poll(')) break
      // 直接取值：读计算样式 / 读可见性 / 断言一个即时值
      if (/await css\(/.test(line) || /isVisible\(\)/.test(line) || /expect\(await /.test(line)) {
        bad.push(j + 1)
        break
      }
    }
  }
  return bad
}

/** 「marker 断言之前是否存在 poll」——用于取色器回填 */
export function pollBefore(text, marker) {
  const poll = text.indexOf('.poll(')
  const assertion = text.indexOf(marker)
  return poll >= 0 && assertion >= 0 && poll < assertion
}

describe('print-media.spec.ts · 介质切换取值纪律', () => {
  const text = readFileSync('tests/e2e/print-media.spec.ts', 'utf8')

  it('**每一处 print 切换后的第一个取值都被 expect.poll 包住**', () => {
    expect(findImmediateMediaReads(text), '出现切完 print 就即时读样式的写法（TD-32 会复活）').toEqual([])
  })

  it('**判据非空转**：文件里确实有多处 print 切换与多处 poll', () => {
    const switches = (text.match(/emulateMedia\(\{ media: 'print' \}\)/g) ?? []).length
    const polls = (text.match(/\.poll\(/g) ?? []).length
    expect(switches, '一个 print 切换都没有 → 判据空转').toBeGreaterThanOrEqual(4)
    expect(polls, '一次轮询都没有 → 修法没落地').toBeGreaterThanOrEqual(4)
  })

  it('**负向对照（合成夹具）**：把一处 poll 改回即时读取 → 判据必须报', () => {
    // 逐行删掉第一个 `.poll(` 所在的三行块（await expect / .poll( / .toBe(）
    const lines = text.split('\n')
    const k = lines.findIndex((l) => l.includes('.poll('))
    expect(k, '锚点失效').toBeGreaterThan(0)
    lines[k] = "    const printScale = await css(page, ':root', '--vcl-scale')"
    lines.splice(k + 1, 1) // 删掉 .toBe('1')
    const mutant = lines.join('\n')
    expect(mutant).not.toBe(text)
    expect(findImmediateMediaReads(mutant).length, '即时读取应被判据抓到').toBeGreaterThan(0)
  })
})

describe('icon-color-picker.spec.ts · 异步回填取值纪律', () => {
  const text = readFileSync('tests/e2e/icon-color-picker.spec.ts', 'utf8')

  it('**主题色断言前先轮询等回填**（不是 toHaveCount 后立即读值）', () => {
    expect(pollBefore(text, 'toContain(themeHex)'), '轮询必须出现在主题色断言之前').toBe(true)
  })

  it('**负向对照（合成夹具）**：去掉轮询后判据必须报', () => {
    const lines = text.split('\n')
    const k = lines.findIndex((l) => l.includes('.poll('))
    expect(k).toBeGreaterThan(0)
    const mutant = lines
      .filter((_, idx) => idx !== k && idx !== k - 1 && idx !== k + 1)
      .join('\n')
    expect(mutant).not.toContain('.poll(')
    expect(pollBefore(mutant, 'toContain(themeHex)'), '没有轮询时判据应为假').toBe(false)
  })
})
