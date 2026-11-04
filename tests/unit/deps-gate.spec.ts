/**
 * check:deps 闸门的自测（#347）
 *
 * ## 它守的是什么
 *
 * 依赖树上的 **invalid 边**（某个包要求的版本没被满足）。它只做一件事：
 * **把已知噪音显式登记，让任何新增的 invalid 立刻变红** —— 所以它有且只有两个坏方向：
 * · 噪音登记失效 → 那条已知的 optional peer 噪音变成常态红（闸门被无视）
 * · 未登记检测失效 → 真的依赖断裂放行（等到运行期才炸）
 *
 * ## 为什么用 --input 而不是真跑 npm ls
 *
 * 跑一次 `npm ls --all` 要几秒且受缓存/网络影响；夹具直接喂**预存的输出文本**，
 * 既快又能精确构造"只差一行"的对照。
 */
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const SCRIPT = resolve('scripts/check-deps.mjs')

function run(input: string) {
  const r = spawnSync(process.execPath, [SCRIPT, '--input', input], { encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

describe('check:deps 闸门自测', () => {
  it('**只有已登记噪音时必须通过**（不能把 optional peer 噪音当缺陷）', () => {
    const { code, out } = run('tests/fixtures/deps/ok.txt')
    expect(code, `已知噪音被判失败 → 闸门会常态红然后被无视：\n${out}`).toBe(0)
  })

  it('**新增未登记的 invalid 边必须报出来，并点名是哪个包**', () => {
    const { code, out } = run('tests/fixtures/deps/bad.txt')
    expect(code, '未登记的依赖断裂没报 → 等到运行期才炸').toBe(1)
    expect(out).toContain('lodash@4.17.20')
  })

  it('**已登记的那条不能顺带被报**（否则一条噪音掩盖新问题）', () => {
    const { out } = run('tests/fixtures/deps/bad.txt')
    const flagged = out.split('\n').filter((l) => l.trim().startsWith('- ') && l.includes('invalid:'))
    expect(flagged.length, `应只报 1 条未登记项，实际：\n${flagged.join('\n')}`).toBe(1)
  })

  /* ── 测量面：锁模式 vs 树模式（#414）────────────────────────────────────
   * 树模式（`npm ls --all`）会因 `node_modules` 里多出一个未登记目录
   * （vue-tsc 每次 typecheck 写的 `.vue-global-types`）从不报错变成 8 条**假阳性**
   * （`3.5.44` 满足 `3.x` 却被标 invalid），且删掉目录也不恢复。
   * 质量链的顺序是 typecheck（第 1 步）→ check:deps（第 27 步），于是这道闸口必然红。
   * 这里行为式钉住"用的是锁模式"：跑一次脚本读它自报的命令，而不是 grep 源码字符串。 */
  it('**必须用锁模式取依赖树**（树模式会因无关目录给出 8 条假阳性）', () => {
    const r = spawnSync(process.execPath, [SCRIPT, '--print-cmd'], { encoding: 'utf8' })
    expect(r.status).toBe(0)
    expect(r.stdout.trim()).toBe('npm ls --all --package-lock-only')
  })
})
