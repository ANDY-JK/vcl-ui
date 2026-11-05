/* ═══════════ check:async-assert：断言不许落在 Promise 本体上（TD-88，#440） ═══════════
 *
 * TD-88 记的是"同步变异步"的隐性代价：#253 把 ImagePreview 下载改成异步后，
 * 用例的断言在微任务排空前执行 —— 要么假红，要么**碰巧绿**：
 * `expect(p).toBe(true)` 里 p 是 Promise 对象，恒为真值，断言与行为无关。
 *
 * 本 spec 分两层：
 *   ① 真实树：当前仓库零违规（闸口的实际断言）；
 *   ② 合成夹具：证明判据**真会报**，且不误报正确写法。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { findPromiseAssertions, importedAsyncNames } from '../../scripts/check-async-assert.mjs'

const srcDir = 'src'
const specsDir = 'tests/unit'

describe('check:async-assert · 真实树', () => {
  it('**当前仓库零违规**（没有断言落在 Promise 本体上）', () => {
    const findings = findPromiseAssertions({ specsDir, srcDir })
    expect(findings, `这些断言落在 Promise 本体：${JSON.stringify(findings, null, 2)}`).toEqual([])
  })

  it('**判据非空转**：扫描器确实从源码里推导出异步导出（否则规则等于没在跑）', () => {
    const names = importedAsyncNames('tests/unit/amap-service-network.spec.ts', srcDir)
    expect(names.size, '一个异步名都没解析出来 → 判据是空转').toBeGreaterThan(0)
  })
})

describe('check:async-assert · 合成夹具（判据有效性）', () => {
  let root = ''
  let src = ''
  let specs = ''

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'async-assert-'))
    src = join(root, 'src')
    specs = join(root, 'tests/unit')
    mkdirSync(join(src, 'svc'), { recursive: true })
    mkdirSync(specs, { recursive: true })
    writeFileSync(join(src, 'svc/api.ts'), 'export async function fetchThing(): Promise<string> {\n  return "x"\n}\n')
    writeFileSync(join(src, 'svc/sync.ts'), 'export function notify(): number {\n  return 1\n}\n')
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  function spec(name, body) {
    writeFileSync(join(specs, name), body)
  }

  it('**报**：expect( asyncFn(...) ) 直接断言 Promise 本体（恒真值的假绿）', () => {
    spec(
      'bad-direct.spec.ts',
      "import { expect, it } from 'vitest'\nimport { fetchThing } from '@/svc/api'\nit('x', () => {\n  expect(fetchThing()).toBe(true)\n})\n",
    )
    const findings = findPromiseAssertions({ specsDir: specs, srcDir: src })
    expect(findings).toHaveLength(1)
    expect(findings[0].name).toBe('fetchThing')
  })

  it('**不报**：await expect(...).resolves（正确写法一）', () => {
    spec(
      'ok-resolves.spec.ts',
      "import { expect, it } from 'vitest'\nimport { fetchThing } from '@/svc/api'\nit('x', async () => {\n  await expect(fetchThing()).resolves.toBe('x')\n})\n",
    )
    expect(findPromiseAssertions({ specsDir: specs, srcDir: src })).toEqual([])
  })

  it('**不报**：await expect(...).rejects（正确写法二）', () => {
    spec(
      'ok-rejects.spec.ts',
      "import { expect, it } from 'vitest'\nimport { fetchThing } from '@/svc/api'\nit('x', async () => {\n  await expect(fetchThing()).rejects.toThrow()\n})\n",
    )
    expect(findPromiseAssertions({ specsDir: specs, srcDir: src })).toEqual([])
  })

  it('**报**：const p = asyncFn(...) 后直接 expect(p)（中间无 await / .resolves）', () => {
    spec(
      'bad-var.spec.ts',
      "import { expect, it } from 'vitest'\nimport { fetchThing } from '@/svc/api'\nit('x', () => {\n  const p = fetchThing()\n  expect(p).toBeTruthy()\n})\n",
    )
    const findings = findPromiseAssertions({ specsDir: specs, srcDir: src })
    expect(findings).toHaveLength(1)
    expect(findings[0].shape).toContain('← fetchThing()')
  })

  it('**不报**：const p = asyncFn(...) 之后先 await 再断言（TD-88 的正确修法）', () => {
    spec(
      'ok-await.spec.ts',
      "import { expect, it } from 'vitest'\nimport { fetchThing } from '@/svc/api'\nit('x', async () => {\n  const p = fetchThing()\n  const out = await p\n  expect(out).toBe('x')\n})\n",
    )
    expect(findPromiseAssertions({ specsDir: specs, srcDir: src })).toEqual([])
  })

  it('**不误报**：同名函数在别的模块里是同步的（防"全库同名匹配"式误报）', () => {
    spec(
      'ok-sync-name.spec.ts',
      "import { expect, it } from 'vitest'\nimport { notify } from '@/svc/sync'\nit('x', () => {\n  expect(notify()).toBe(1)\n})\n",
    )
    expect(findPromiseAssertions({ specsDir: specs, srcDir: src })).toEqual([])
  })

  it('**不误报**：字符串字面量里的 expect(...) 不是调用（fixture 文本）', () => {
    spec(
      'ok-string.spec.ts',
      "import { expect, it } from 'vitest'\nimport { fetchThing } from '@/svc/api'\nit('x', async () => {\n  const fixture = \"expect(fetchThing()).toBe(true)\"\n  expect(fixture).toContain('expect')\n  await expect(fetchThing()).resolves.toBe('x')\n})\n",
    )
    expect(findPromiseAssertions({ specsDir: specs, srcDir: src })).toEqual([])
  })
})
