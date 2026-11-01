/**
 * check:no-cycles 闸门的自测（#328）
 *
 * ## 为什么补
 *
 * 这道闸口是 228 行、含"TS 解析 → 建图 → 找环"的复杂脚本，**是目前最复杂的一道**。
 * 它一旦被改坏（解析错了、环检测退化成 DFS 不回溯、`import type` 判定写反），
 * 结果只会是"✅ 通过 —— 无循环依赖"，没有任何人能看出来。
 *
 * 之前唯一能证明它有效的是"曾经修过 #30x 的环" —— 那是历史，不是保证。
 *
 * ## 判据
 *
 * · ok 夹具（单向依赖）必须 exit 0
 * · bad 夹具（x ↔ y 互相 import）必须 exit 1，且**环里的两个文件都要出现**
 * · `import type` 造成的"看似成环"不应计入（编译期擦除）—— 见第三条用例
 */
import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const SCRIPT = resolve('scripts/check-no-cycles.mjs')

function runGate(root: string) {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

describe('check:no-cycles 闸门自测', () => {
  it('**单向依赖必须通过**（闸门不能把正常依赖当环）', () => {
    const { code, out } = runGate('tests/fixtures/no-cycles/ok')
    expect(code, `闸门对正常依赖报了环：\n${out}`).toBe(0)
  })

  it('**互相 import 必须报环，且两个文件都点名**', () => {
    const { code, out } = runGate('tests/fixtures/no-cycles/bad')
    expect(code, '互相 import 没报环 → 这道闸口是摆设').toBe(1)
    expect(out).toContain('x.ts')
    expect(out).toContain('y.ts')
  })

  it('**`import type` 不该被算成环**（编译期擦除，不是运行时依赖）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vcl-cycles-'))
    try {
      writeFileSync(join(dir, 'p.ts'), "import type { Q } from './q'\nexport const p = (q: Q) => q\n")
      writeFileSync(join(dir, 'q.ts'), "import { p } from './p'\nexport type Q = { v: number }\nexport const q = () => p({ v: 1 })\n")
      const { code, out } = runGate(dir)
      expect(code, `import type 被当成运行时依赖了：\n${out}`).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
