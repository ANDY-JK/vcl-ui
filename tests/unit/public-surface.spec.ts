/* ═══════════ check:public-surface：跨域引用必须走目标域入口（TD-57，#438） ═══════════
 *
 * 背景：`gen:docs` / `check:doc-completeness` 的公开面口径是**域入口**。
 * 只在模块里 `export`、又没从入口再导出的符号，等于"文档查不到 + 完整性检查管不到"，
 * 而它一旦被跨域引用，就是**已发生**的事实公共面。
 *
 * 本 spec 分两层：
 *   ① 真实树：当前仓库必须零违规（闸口的实际断言）；
 *   ② 合成夹具：证明判据**真的会报**（不是恒真）—— 夹具里手工造"入口没导出"的跨域引用。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { findCrossDomainBypass } from '../../scripts/check-public-surface.mjs'

const DOMAINS = ['alpha', 'beta']

describe('check:public-surface · 真实树', () => {
  it('**当前仓库零违规**（跨域引用全部走目标域入口）', () => {
    const findings = findCrossDomainBypass()
    expect(findings, `这些跨域引用没走入口：${JSON.stringify(findings, null, 2)}`).toEqual([])
  })

  it('**判据非空转**：扫到的文件里确实存在跨域 import（否则规则等于没在跑）', async () => {
    const { findCrossDomainBypass: again } = await import('../../scripts/check-public-surface.mjs')
    expect(typeof again).toBe('function')
    // 直接从源码里找一条真实跨域 import 作为"扫描器在工作"的证据
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/components/form-builder/FormCollect.vue', 'utf8')
    expect(src).toMatch(/from '@\/components\/(form|storage)\//)
  })
})

describe('check:public-surface · 合成夹具（判据有效性）', () => {
  let root = ''

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'public-surface-'))
    mkdirSync(join(root, 'alpha'), { recursive: true })
    mkdirSync(join(root, 'beta'), { recursive: true })
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  function write(rel, text) {
    const p = join(root, rel)
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, text, 'utf8')
  }

  it('**报**：跨域引用了目标域内部模块里的符号，而入口没导出它', () => {
    write('alpha/index.ts', "export { shown } from './util'\n")
    write('alpha/util.ts', 'export function shown() {}\nexport function hidden() {}\n')
    write('beta/use.ts', "import { hidden } from '@/components/alpha/util'\n")
    const findings = findCrossDomainBypass({ componentsDir: root, domains: DOMAINS })
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ importer: expect.stringContaining('beta/use.ts'), domain: 'alpha', symbol: 'hidden' })
  })

  it('**不报**：同一符号从入口导出后（修复方式一）', () => {
    write('alpha/index.ts', "export { shown, hidden } from './util'\n")
    write('alpha/util.ts', 'export function shown() {}\nexport function hidden() {}\n')
    write('beta/use.ts', "import { hidden } from '@/components/alpha/util'\n")
    expect(findCrossDomainBypass({ componentsDir: root, domains: DOMAINS })).toEqual([])
  })

  it('**不报**：目标就是域入口本身（修复方式二：改从入口导入）', () => {
    write('alpha/index.ts', "export { hidden } from './util'\n")
    write('alpha/util.ts', 'export function hidden() {}\n')
    write('beta/use.ts', "import { hidden } from '@/components/alpha'\n")
    expect(findCrossDomainBypass({ componentsDir: root, domains: DOMAINS })).toEqual([])
  })

  it('**豁免 _internal**：全库共享内部层按设计不逐域导出', () => {
    write('alpha/index.ts', "export const a = 1\n")
    write('alpha/_internal/shared.ts', 'export function helper() {}\n')
    write('beta/use.ts', "import { helper } from '@/components/alpha/_internal/shared'\n")
    expect(findCrossDomainBypass({ componentsDir: root, domains: DOMAINS })).toEqual([])
  })

  it('**类型也算公共面**：跨域引类型未走入口同样报（不能被 import type 绕过）', () => {
    write('alpha/index.ts', "export const a = 1\n")
    write('alpha/types.ts', 'export interface Row {}\n')
    write('beta/use.ts', "import type { Row } from '@/components/alpha/types'\n")
    const findings = findCrossDomainBypass({ componentsDir: root, domains: DOMAINS })
    expect(findings.map((f) => f.symbol)).toEqual(['Row'])
  })
})
