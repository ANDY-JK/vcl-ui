/**
 * check:i18n 闸门的自测（#327）
 *
 * ## 为什么补
 *
 * 这道闸口只做"键集对账" —— 键对上了就通过。但**键对账通过 ≠ 文案写好了**：
 * · 值写成 `''` / 全空格 → 用户切到那门语言看到**空白**
 * · en-US 的值整条是中文（复制粘贴没翻译）→ 等于没翻译
 * 这两类都不会被键集比较发现，单测也测不到（只在切换语言时才暴露）。
 *
 * 本轮补上值检查，并用夹具把两面钉住：
 * · ok 里有**合法引用中文列名**的英文句子（`headers must be "经度"/"纬度"`）——
 *   闸门不能把它当"没翻译"（误报会让闸门被关掉）
 * · bad 里放空值 + 整条中文 + 单边键，三类都要报出来
 */
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const SCRIPT = resolve('scripts/check-i18n.mjs')

function runGate(root: string) {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

describe('check:i18n 闸门自测', () => {
  it('**合规夹具必须通过**（含"英文句子里合法引用中文列名"）', () => {
    const { code, out } = runGate('tests/fixtures/i18n/ok')
    expect(code, `闸门对合规语言包报了错（可能是 CJK 误报）：\n${out}`).toBe(0)
  })

  it('**空值必须报出来**（键对上了但用户看到空白）', () => {
    const { code, out } = runGate('tests/fixtures/i18n/bad')
    expect(code).toBe(1)
    expect(out, '空值没报 → 用户会看到空白却无人知晓').toContain('的值是空的')
  })

  it('**整条没翻译与单边键也必须报**', () => {
    const { out } = runGate('tests/fixtures/i18n/bad')
    expect(out).toContain('疑似整条没翻译')
    expect(out).toContain('缺 en-US 键')
  })
})
