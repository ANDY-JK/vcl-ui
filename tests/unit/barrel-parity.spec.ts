/**
 * barrel 对账 —— 组件必须同时出现在「主入口」与「域级入口」里
 *
 * ## 为什么需要
 *
 * 仓库有**两个**公开入口：
 *   - `src/components/index.ts`        主入口（全量引入 `vcl-ui`）
 *   - `src/components/<域>/index.ts`   域入口（按需引入 `vcl-ui/form`）
 *
 * 新增组件时只写一个是很容易发生的：第十六轮就漏了三个
 * （`SegmentedControl` / `NotificationCenter` / `Kbd` 只在主入口），后果有两条：
 *   1. 按需引入的宿主拿不到；
 *   2. `gen:docs` 读的是域入口，**文档页里根本不出现**。
 *
 * 而 `check:docs` 只校验「生成物与源码一致」—— 源码里没这条导出，生成物也不会报错，闸口静默放过。
 * 这条漏点当时只能靠人发现，所以固化成用例。
 *
 * ## 判据
 *
 * 1. 主入口导出的每个 `.vue`，其所属域的 barrel 必须也有同名导出（**这轮踩的坑**）
 * 2. 域 barrel 导出的每个 `.vue`，主入口必须也有同名导出，**除 allowlist**
 *    （`LowCodeNav` 是刻意的：文档让宿主从 `vcl-ui/form-builder` 子路径引入，不进主包）
 *
 * 豁免项本身也要钉住：allowlist 里的名字若哪天从域 barrel 消失，用例必须红，
 * 否则豁免会变成「没人再记得为什么」的死条目。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const ROOT_DIR = resolve('src/components')
const MAIN_BARREL = join(ROOT_DIR, 'index.ts')

/**
 * 刻意不进主入口的组件。
 * 每条都要写清理由 —— 没有理由的豁免等于把闸口关掉。
 */
const MAIN_BARREL_EXEMPT = new Map<string, string>([
  [
    'LowCodeNav',
    '低代码导航外壳：文档明确让宿主从 `vcl-ui/form-builder` 子路径引入，不进主包（主包体积预算见 verify:pkg）',
  ],
])

interface ExportEntry {
  name: string
  spec: string
}

/** 解析 `export { A, B as C } from './x'` 形态（与本仓两个 barrel 的写法一致） */
function parseExports(src: string): ExportEntry[] {
  const out: ExportEntry[] = []
  for (const m of src.matchAll(/export\s*\{([^}]*)\}\s*from\s*'([^']+)'/g)) {
    const spec = m[2] ?? ''
    const body = (m[1] ?? '').replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    for (const part of body.split(',')) {
      const t = part.trim()
      if (!t) continue
      const as = /^(\w+)\s+as\s+(\w+)$/.exec(t)
      out.push({ name: as ? (as[2] ?? t) : t, spec })
    }
  }
  return out
}

const readBarrel = (p: string): ExportEntry[] => parseExports(readFileSync(p, 'utf8'))

const mainExports = readBarrel(MAIN_BARREL)
const domains = readdirSync(ROOT_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(ROOT_DIR, d.name, 'index.ts')))
  .map((d) => d.name)

/** 主入口的 `.vue` 导出 → 期望它出现在哪个域的 barrel */
function domainOf(entry: ExportEntry): string | null {
  const m = /^\.\/([^/]+)\/.*\.vue$/.exec(entry.spec)
  return m ? (m[1] ?? null) : null
}

describe('barrel 对账 · 主入口 → 域入口', () => {
  it('扫描面非空（路径写错时用例必须红，而不是静默通过）', () => {
    const componentExports = mainExports.filter((e) => e.spec.endsWith('.vue') && domainOf(e))
    expect(componentExports.length, '主入口一个组件都没解析到 → 解析口径或路径失效').toBeGreaterThan(30)
    expect(domains.length, '一个域 barrel 都没找到').toBeGreaterThan(8)
  })

  it('**主入口导出的每个组件，所属域 barrel 也有同名导出**（第十六轮漏点的固化）', () => {
    const missing: string[] = []
    for (const e of mainExports) {
      if (!e.spec.endsWith('.vue')) continue
      const domain = domainOf(e)
      if (!domain) continue
      const barrel = join(ROOT_DIR, domain, 'index.ts')
      if (!existsSync(barrel)) continue
      const names = new Set(readBarrel(barrel).map((x) => x.name))
      if (!names.has(e.name)) missing.push(`${e.name}（${domain}/index.ts 缺）`)
    }
    expect(missing, `这些组件只在主入口、域入口缺失 → 按需引入拿不到且文档页不出现`).toEqual([])
  })
})

describe('barrel 对账 · 域入口 → 主入口', () => {
  it('域 barrel 的每个组件都在主入口里（allowlist 除外）', () => {
    const missing: string[] = []
    for (const d of domains) {
      for (const e of readBarrel(join(ROOT_DIR, d, 'index.ts'))) {
        if (!e.spec.endsWith('.vue')) continue
        if (MAIN_BARREL_EXEMPT.has(e.name)) continue
        if (!mainExports.some((x) => x.name === e.name)) missing.push(`${e.name}（${d} → 主入口缺）`)
      }
    }
    expect(missing, '域入口有、主入口没有 → 全量引入的宿主拿不到').toEqual([])
  })

  it('**豁免项不许腐烂**：allowlist 里的组件仍必须存在于各自域 barrel', () => {
    const all = new Set<string>()
    for (const d of domains) {
      for (const e of readBarrel(join(ROOT_DIR, d, 'index.ts'))) all.add(e.name)
    }
    const rotted = [...MAIN_BARREL_EXEMPT.keys()].filter((n) => !all.has(n))
    expect(rotted, '豁免名单里的组件已不存在 → 请删掉对应豁免，别让它变成没人记得的死条目').toEqual([])
  })
})

describe('barrel 对账 · 判据在真量（负向对照）', () => {
  /** 用同一套 parseExports 喂合成输入，证明「漏一个」真的会被判红 */
  function diff(mainSrc: string, domainSrc: string): string[] {
    const main = new Set(parseExports(mainSrc).map((e) => e.name))
    return parseExports(domainSrc)
      .filter((e) => e.spec.endsWith('.vue') && !main.has(e.name))
      .map((e) => e.name)
  }

  it('域有、主入口没有 → 点得出名字', () => {
    expect(diff(`export { A } from './d/A.vue'`, `export { A } from './A.vue'\nexport { B } from './B.vue'`)).toEqual(['B'])
  })

  it('两边都有 → 不误报', () => {
    expect(diff(`export { A, B } from './d/A.vue'`, `export { A } from './A.vue'\nexport { B } from './B.vue'`)).toEqual([])
  })

  it('`as` 重命名按**导出名**比对（不是本地名）', () => {
    expect(diff(`export { default as A } from './d/A.vue'`, `export { A as A2 } from './A.vue'`)).toEqual(['A2'])
  })
})
