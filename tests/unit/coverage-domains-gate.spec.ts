/**
 * check:coverage-domains 闸门的自测（#348）
 *
 * ## 它守的是什么
 *
 * 「按域覆盖地板」—— 13 个域各有语句/分支/函数三条地板线，**任一条掉下去就红**。
 * 另有两条防裸奔判据：① 地板域在覆盖数据里不存在（barrel 被删/改名）→ 红；
 * ② 覆盖数据里出现**未登记的新域** → 红（防止新域没有地板）。
 *
 * ## 为什么必须自测
 *
 * 这道闸口的判据全是"比较百分比"，改坏了表现是「✅ 按域覆盖地板通过」——
 * 而它守的正是"测试别悄悄变少"。它自己悄悄失效，等于整个覆盖纪律失效。
 *
 * ## 夹具
 *
 * · ok：13 个地板域全部 100% → 必须 exit 0
 * · bad：`login` 三项全 0（低于地板）+ 一个**未登记的新域** `newdomain` → 两类都要报
 */
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const SCRIPT = resolve('scripts/check-coverage-domains.mjs')

function run(input: string) {
  const r = spawnSync(process.execPath, [SCRIPT, '--input', input], { encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

describe('check:coverage-domains 闸门自测', () => {
  it('**全部达标时必须通过**', () => {
    const { code, out } = run('tests/fixtures/coverage-domains/ok.json')
    expect(code, `达标数据被判失败：\n${out}`).toBe(0)
  })

  it('**某域低于地板必须报出来，并点名是哪条线**', () => {
    const { code, out } = run('tests/fixtures/coverage-domains/bad.json')
    expect(code, '低于地板没拦住 → 覆盖纪律形同虚设').toBe(1)
    expect(out).toContain('login 语句')
  })

  it('**未登记的新域必须报出来**（防止新域裸奔）', () => {
    const { out } = run('tests/fixtures/coverage-domains/bad.json')
    expect(out, '新域没登记地板却没报').toContain('newdomain')
  })
})
