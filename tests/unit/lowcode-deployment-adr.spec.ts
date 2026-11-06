// ADR-006 / TD-24 部署形态契约（#471）
//
// 决策：库只出「REST 契约 + 参考实现」（形态 A），随包附 BFF（形态 B）由 ADR-005 D2 明确不做。
// 本 spec 把这条**定位决策**变成机械判据，防止它像 TD-24 那样停在"未定"：
//
//   ① ADR-006 成文并登记进索引，且把 A/B/C 三种形态写清；
//   ② `src/` 不得引入任何服务端运行时（一旦引入，说明 BFF 正被偷偷打进库）；
//   ③ `createRestFormStore` 仍从公共面导出（A 形态的契约入口不能丢）；
//   ④ 扫描器本身有合成夹具负向对照（防止"扫不到 = 没引入"的空转）。
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRestFormStore } from '@/components/form-builder/designer/rest-form-store'

const ROOT = process.cwd()
const ADR = join(ROOT, 'docs', 'adr', '006-lowcode-deployment-shape.md')
const ADR_INDEX = join(ROOT, 'docs', 'adr', 'README.md')
const SRC = join(ROOT, 'src')

/** 服务端运行时：出现任一个就说明库开始自带 BFF / 数据库驱动 */
const SERVER_RUNTIME = [
  'node:http',
  'node:https',
  'node:net',
  'node:sqlite',
  'node:cluster',
  'express',
  'fastify',
  'koa',
  'better-sqlite3',
  'sqlite3',
  'pg',
  'mysql2',
]

/** 扫 src 下所有 ts/vue（含子目录），返回 `{ file, module }[]` */
export function findServerRuntimeImports(root: string) {
  const found: { file: string; module: string }[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) {
        walk(p)
      } else if (/\.(ts|vue|mjs|js)$/.test(name)) {
        const text = readFileSync(p, 'utf8')
        for (const mod of SERVER_RUNTIME) {
          const re = new RegExp(
            `(?:from\\s*|import\\s*\\(|require\\s*\\(\\s*)['"]${mod.replace(/[/:]/g, '\\$&')}['"]`,
          )
          if (re.test(text)) found.push({ file: p, module: mod })
        }
      }
    }
  }
  if (existsSync(root)) walk(root)
  return found
}

describe('ADR-006 部署形态决策（TD-24 消解）', () => {
  it('ADR 文件存在且登记进索引', () => {
    expect(existsSync(ADR)).toBe(true)
    expect(readFileSync(ADR_INDEX, 'utf8')).toContain('006-lowcode-deployment-shape.md')
  })

  it('ADR 把 A / B / C 三态写死：A 已交付、B 明确不做、C 已消解', () => {
    const t = readFileSync(ADR, 'utf8')
    expect(t).toContain('默认形态 = A')
    expect(t).toContain('明确不做')
    expect(t).toContain('已消解')
    expect(t).toContain('ADR-005')
  })

  it('B 的净增量逐条列出（进程/令牌、CORS 限流审计、账号体系、并发协调、版本灰度）', () => {
    const t = readFileSync(ADR, 'utf8')
    for (const word of ['令牌', 'CORS', '限流', '审计', '账号体系', '连接池', '灰度']) {
      expect(t, `ADR 缺少 B 增量条目：${word}`).toContain(word)
    }
  })
})

describe('形态 A 的能力边界（机械判据）', () => {
  it('真实树：src/ 不含任何服务端运行时 import', () => {
    const found = findServerRuntimeImports(SRC)
    expect(found, `src/ 里出现了服务端运行时：${JSON.stringify(found)}`).toEqual([])
  })

  it('参考实现在 examples/ 而不是 src/（服务端代码不进库）', () => {
    expect(existsSync(join(ROOT, 'examples', 'lowcode-backend', 'server.mjs'))).toBe(true)
    expect(existsSync(join(SRC, 'components', 'form-builder', 'server.mjs'))).toBe(false)
  })

  it('createRestFormStore 仍是函数（A 形态的契约入口没丢）', () => {
    expect(typeof createRestFormStore).toBe('function')
  })

  it('合成夹具负向对照：src 下塞一个 node:http import → 扫描器必须报出来', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'deploy-shape-'))
    try {
      mkdirSync(join(tmp, 'src', 'components'), { recursive: true })
      writeFileSync(join(tmp, 'src', 'components', 'bff.ts'), "import { createServer } from 'node:http'\n")
      const found = findServerRuntimeImports(join(tmp, 'src'))
      expect(found.map((f) => f.module)).toContain('node:http')
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('反向保护：扫描器确实遍历了文件（不是空转）', () => {
    // SRC 下至少有 100 个 ts/vue 文件，扫描器若直接返回 [] 就说明遍历坏了
    let count = 0
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.(ts|vue)$/.test(name)) count++
      }
    }
    walk(SRC)
    expect(count).toBeGreaterThan(100)
  })
})
