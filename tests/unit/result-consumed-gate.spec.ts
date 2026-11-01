/**
 * check:result-consumed 闸门的自测（#326）
 *
 * ## 为什么要补
 *
 * 这道闸口当初是为了机械化 #267/#269 那条纪律（返回 boolean 的动作函数，调用点必须看结果）。
 * 但它的判据里有一条 `/\bawait\s+/` —— **行里出现 await 就算消费**。
 * 于是最常见的写错法 `await downloadBlob(x)`（await 了、但没人看结果）**一路绿灯**。
 * 实测：夹具里写三条违规，旧判据只报出 1 条（唯一没加 await 的那条）。
 *
 * 修好后判据只剩一条：**这次调用是不是裸语句**。
 * 夹具两面都锁：ok 覆盖 4 种合法写法，bad 覆盖 3 种丢弃写法。
 */
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const SCRIPT = resolve('scripts/check-result-consumed.mjs')

function runGate(root: string) {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

describe('check:result-consumed 闸门自测', () => {
  it('**四种合法写法都必须通过**（赋值 / if 条件 / .then 链 / return）', () => {
    const { code, out } = runGate('tests/fixtures/result-consumed/ok')
    expect(code, `闸门对合法写法报了错：\n${out}`).toBe(0)
  })

  it('**三种丢弃写法都必须报出来**（含 `await f()` —— 旧判据的漏网之鱼）', () => {
    const { code, out } = runGate('tests/fixtures/result-consumed/bad')
    expect(code, '闸门对丢弃写法没报错 → 这道闸口是摆设').toBe(1)
    expect(out, '`await f()` 也要算丢弃').toContain("await downloadBlob('a')")
    expect(out, '裸语句 f() 要报').toContain("copyText('b')")
    expect(out, '`void f()` 没有 then/catch 也要报').toContain("void downloadScreenshot('c')")
  })

  it('**报错带 file:line**（几千行里要能定位）', () => {
    const { out } = runGate('tests/fixtures/result-consumed/bad')
    expect(out).toMatch(/Dropped\.vue\.ts:\d+/)
  })
})
