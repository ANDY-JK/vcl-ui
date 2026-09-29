// 第三方许可清单生成/闸口的判据锁定（F1 修复的回归防线）
//
// 分工：产物实况的双向对账、政策白名单命中由 `npm run check:licenses` 在 build 之后跑
// （它读的是真 dist，测试跑在 build 之前，这里不拿"文件在不在"做假绿）。
// 本文件只锁**纯判据**：SPDX 解析、双许可择优、政策判定、裸说明符识别、
// 依赖闭包可达性、许可文件名挑选、rollup 模块 id 归属判定。
import { describe, it, expect } from 'vitest'
import {
  parseSpdx,
  electLicense,
  policyFindings,
  packageRootOf,
  externalRootsInCode,
  undeclaredExternals,
  undeclaredBundled,
  pickLicenseFile,
  ALLOWED_SPDX,
  vendorSourceEntries,
  VENDOR_SOURCES,
  readVendoredBinaryModule,
} from '../../scripts/gen-third-party-licenses.mjs'
import { classifyModuleId } from '../../scripts/third-party-evidence.mjs'

describe('parseSpdx：上游 license 字段的三种形态', () => {
  it('单许可 → single', () => {
    expect(parseSpdx('MIT')).toEqual({ atoms: ['MIT'], op: 'single', raw: 'MIT' })
  })

  it('object 形态 {type} 也能读（老包写法）', () => {
    expect(parseSpdx({ type: 'MIT' }).atoms).toEqual(['MIT'])
  })

  it('OR 双许可 → 两个原子，括号被剥掉', () => {
    const p = parseSpdx('(MIT OR GPL-3.0-or-later)')
    expect(p.op).toBe('OR')
    expect(p.atoms).toEqual(['MIT', 'GPL-3.0-or-later'])
  })

  it('AND 组合 → 两个许可同时适用', () => {
    const p = parseSpdx('(MIT AND Zlib)')
    expect(p.op).toBe('AND')
    expect(p.atoms).toEqual(['MIT', 'Zlib'])
  })

  it('"SEE LICENSE IN xxx" 无法机器判定 → unknown', () => {
    expect(parseSpdx('SEE LICENSE IN LICENSE.txt').op).toBe('unknown')
  })

  it('OR/AND 混用 → unknown（交人判定，不自动放行）', () => {
    expect(parseSpdx('(MIT OR ISC) AND Zlib').op).toBe('unknown')
  })

  it('字段缺失 → atoms 空 + unknown', () => {
    expect(parseSpdx(undefined)).toEqual({ atoms: [], op: 'unknown', raw: '' })
  })
})

describe('electLicense：本库实际采用的许可', () => {
  it('MIT OR GPL-3.0-or-later → 取 MIT，并标记需要择优声明', () => {
    expect(electLicense(parseSpdx('(MIT OR GPL-3.0-or-later)'))).toEqual({
      chosen: 'MIT',
      needsElection: true,
      disallowed: [],
    })
  })

  it('双许可两个都不在白名单 → 不放行', () => {
    const r = electLicense(parseSpdx('(GPL-2.0-only OR AGPL-3.0-only)'))
    expect(r.disallowed.length).toBeGreaterThan(0)
  })

  it('AND 组合里混一个 copyleft → 该 copyleft 记违规（两个许可同时适用，躲不掉）', () => {
    expect(electLicense(parseSpdx('(MIT AND GPL-3.0-only)')).disallowed).toEqual(['GPL-3.0-only'])
  })

  it('单许可不产生择优声明（别在清单里写"择优"这种废话）', () => {
    expect(electLicense(parseSpdx('Apache-2.0')).needsElection).toBe(false)
  })

  it('unknown 表达式原样回显，供人工核对', () => {
    expect(electLicense(parseSpdx('SEE LICENSE IN x.txt')).chosen).toBe('SEE LICENSE IN x.txt')
  })

  it('OR 的两个白名单项之间，按择优顺序取（顺序表没列的项不许抢在 MIT 前）', () => {
    // Unlicense 在白名单里但不在 PREFER_ORDER 里：indexOf 返回 -1，
    // 不拦的话它会排在所有具名项之前被选中（排序反了就是静默错选）
    expect(electLicense(parseSpdx('(Unlicense OR MIT)')).chosen).toBe('MIT')
    expect(electLicense(parseSpdx('(ISC OR MIT)')).chosen).toBe('MIT')
    expect(electLicense(parseSpdx('(Apache-2.0 OR MIT)')).chosen).toBe('MIT')
  })

  it('GPL 在前的双许可也必须取到 MIT（择优不看出现顺序）', () => {
    expect(electLicense(parseSpdx('(GPL-3.0-only OR MIT)')).chosen).toBe('MIT')
  })
})

describe('policyFindings：随包分发的政策闸口', () => {
  const e = (pkg, raw) => {
    const parsed = parseSpdx(raw)
    return { pkg, raw, parsed, chosen: electLicense(parsed).chosen }
  }

  it('白名单内的件 → 零红项', () => {
    expect(policyFindings([e('vue-i18n', 'MIT'), e('xlsx', 'Apache-2.0'), e('lodash-es', 'MIT')])).toEqual([])
  })

  it('无 license 字段 → 点名 NOASSERTION', () => {
    expect(policyFindings([e('mystery', undefined)])[0]).toMatch(/mystery.*无 license 字段/)
  })

  it('copyleft 单许可 → 红', () => {
    expect(policyFindings([e('gplpkg', 'GPL-3.0-only')])[0]).toMatch(/gplpkg.*不在随包分发白名单/)
  })

  it('双许可只要有一个白名单项 → 放行（本库按该项分发）', () => {
    expect(policyFindings([e('jszip', '(MIT OR GPL-3.0-or-later)')])).toEqual([])
  })

  it('无法解析的表达式 → 要求人工确认，而不是默认放过', () => {
    expect(policyFindings([e('weird', 'SEE LICENSE IN x')])[0]).toMatch(/weird.*需人工确认/)
  })

  it('白名单里没有 copyleft 项（收紧是设计，不是漏配）', () => {
    for (const bad of ['GPL-3.0-only', 'AGPL-3.0-only', 'LGPL-2.1-only', 'CC-BY-SA-4.0', 'CPAL-1.0', 'MPL-2.0']) {
      expect(ALLOWED_SPDX.has(bad)).toBe(false)
    }
  })
})

describe('packageRootOf / externalRootsInCode：谁在包外', () => {
  it('子路径与 scoped 都归到包名级', () => {
    expect(packageRootOf('echarts/charts')).toBe('echarts')
    expect(packageRootOf('@vue/devtools-api/lib/x')).toBe('@vue/devtools-api')
    expect(packageRootOf('vue')).toBe('vue')
  })

  it('相对路径、本库别名 @/、虚拟模块都不是第三方', () => {
    expect(packageRootOf('./Button.vue')).toBeNull()
    expect(packageRootOf('@/components/basic')).toBeNull()
    expect(packageRootOf('\0vite/module-preview')).toBeNull()
  })

  it('产物里的裸说明符被识别，Node 内建与噪声字符串被滤掉', () => {
    const code = [
      `import { ref } from 'vue'`,
      `const m = await import('xlsx')`,
      `import 'vue-router'`,
      `require('util').types`,
      `from './core-chunk-abc.js'`,
      `import { x } from '@/components/basic'`,
      `throw new Error("from ', l, ' is not a module")`,
    ].join('\n')
    expect(externalRootsInCode(code)).toEqual(['vue', 'vue-router', 'xlsx'])
  })

  it('scoped 子路径说明符也收（@iconify/vue、morphicons/vue）', () => {
    const code = `from '@iconify/vue'` + '\n' + `from 'morphicons/vue'`
    expect(externalRootsInCode(code)).toEqual(['@iconify/vue', 'morphicons'])
  })
})

describe('undeclaredExternals / undeclaredBundled：声明与可达性', () => {
  const pkg = { dependencies: { xlsx: '1', '@lucide/vue': '1' }, peerDependencies: { vue: '^3.4.0' } }

  it('外部件都已在 peer/deps 声明 → 零红', () => {
    expect(undeclaredExternals(['vue', 'xlsx', '@lucide/vue'], pkg)).toEqual([])
  })

  it('产物引用了未声明的外部件 → 点名（消费方装完直接解析失败）', () => {
    expect(undeclaredExternals(['vue', 'dayjs'], pkg)).toEqual(['dayjs'])
  })

  it('进包件走运行期依赖闭包可达 → 零红', () => {
    const deps = { 'vue-i18n': { '@intlify/core-base': '9' }, '@intlify/core-base': {} }
    expect(undeclaredBundled(['@intlify/core-base'], (n) => deps[n] || {}, ['vue-i18n'])).toEqual([])
  })

  it('进包件不在闭包内 → 点名（本地靠提升侥幸解析，消费方装不到）', () => {
    expect(undeclaredBundled(['sneaky-pkg'], () => ({}), ['vue-i18n'])).toEqual(['sneaky-pkg'])
  })
})

describe('pickLicenseFile：许可文本文件挑选', () => {
  it('精确 license 优先于 LICENSE.markdown 之类带后缀的', () => {
    expect(pickLicenseFile(['package.json', 'LICENSE.markdown', 'LICENSE']).license).toBe('LICENSE')
  })

  it('只有带后缀的也认（jszip 的 LICENSE.markdown）', () => {
    expect(pickLicenseFile(['package.json', 'LICENSE.markdown', 'graph.svg']).license).toBe('LICENSE.markdown')
  })

  it('小写 license 也认（qrcode 的发布物）', () => {
    expect(pickLicenseFile(['package.json', 'license', 'README.md']).license).toBe('license')
  })

  it('NOTICE 单独返回，供 Apache-2.0 §4(d) 判定', () => {
    expect(pickLicenseFile(['LICENSE', 'NOTICE'])).toEqual({ license: 'LICENSE', notice: 'NOTICE' })
  })

  it('什么都没附 → 两个 null（清单如实标注"仅 license 字段"）', () => {
    expect(pickLicenseFile(['package.json', 'README.md', 'lib'])).toEqual({ license: null, notice: null })
  })
})

describe('classifyModuleId：rollup 模块 id → 包归属', () => {
  const ROOT = '[LOCAL_PATH]'

  it('node_modules 里的普通件给出包名与包内相对路径（正斜杠，跨机一致）', () => {
    expect(classifyModuleId(`${ROOT}/node_modules/jszip/dist/jszip.min.js`, ROOT)).toEqual({
      pkg: 'jszip',
      alias: null,
      path: 'node_modules/jszip/dist/jszip.min.js',
    })
  })

  it('scoped 包名含两段', () => {
    expect(classifyModuleId(`${ROOT}/node_modules/@vue/devtools-api/lib/esm/api.js`, ROOT)).toMatchObject({
      pkg: '@vue/devtools-api',
      path: 'node_modules/@vue/devtools-api/lib/esm/api.js',
    })
  })

  it('Windows 反斜杠路径归一为正斜杠', () => {
    expect(classifyModuleId(`${ROOT}\\node_modules\\qrcode\\lib\\browser.js`, ROOT)).toMatchObject({
      pkg: 'qrcode',
      path: 'node_modules/qrcode/lib/browser.js',
    })
  })

  it('rollup 的 \\0 虚拟前缀与 ?query 都剥掉', () => {
    const id = String.fromCharCode(0) + `${ROOT}/node_modules/qrcode/lib/browser.js?v=1`
    expect(classifyModuleId(id, ROOT)).toMatchObject({ pkg: 'qrcode', path: 'node_modules/qrcode/lib/browser.js' })
  })

  it('本库自有源码与 rollup 生成件都不是第三方', () => {
    expect(classifyModuleId(`${ROOT}/src/components/basic/Button.vue`, ROOT)).toBeNull()
    expect(classifyModuleId('\0(commonjsHelpers)', ROOT)).toBeNull()
    expect(classifyModuleId(`${ROOT}/node_modules/jszip`, ROOT)).toBeNull() // 只到包目录，不是模块
  })

  it('构建根之外的 node_modules（全局安装/上层目录）也能归属到包名', () => {
    expect(classifyModuleId(`C:/elsewhere/node_modules/other/x.js`, ROOT)).toMatchObject({ pkg: 'other' })
  })
})

describe('vendorSourceEntries：仓内 vendor 的上游代码（构建证据看不见的那一路）', () => {
  const MAN = {
    package: 'xlsx',
    version: '0.20.3',
    license: 'Apache-2.0',
    vendoredFrom: 'node_modules/xlsx',
    upstreamSource: 'https://git.sheetjs.com/sheetjs/sheetjs',
    files: [
      { path: 'xlsx.mjs', sha256: 'aaa', bytes: 1008308 },
      { path: 'LICENSE', sha256: 'bbb', bytes: 11355 },
    ],
  }
  const SPEC = {
    pkg: 'xlsx',
    dir: 'src/components/_internal/xlsx',
    manifest: 'm.json',
    codeFile: 'xlsx.mjs',
    probes: (v) => ['NEEDLE-A', `"${v}"`],
  }

  const io = (over = {}) => ({
    root: '/repo',
    readJson: () => MAN,
    read: () => 'MIT-TEXT',
    names: () => ['LICENSE', 'xlsx.mjs', 'VENDOR.json'],
    distHasAll: () => true,
    ...over,
  })

  it('登记文件读不到时只报缺登记，不拿假数据拼一行声明', () => {
    const [row] = vendorSourceEntries([SPEC], io({ readJson: () => null }))
    expect(row).toEqual({ pkg: 'xlsx', missing: 'm.json 读不到' })
  })

  it('许可文本从仓内目录挑，版本与 sha 取自登记（不读 node_modules）', () => {
    const [row] = vendorSourceEntries([SPEC], io())
    expect(row).toMatchObject({
      pkg: 'xlsx',
      version: '0.20.3',
      chosen: 'Apache-2.0',
      textFile: 'LICENSE',
      vendored: true,
      sha256: 'aaa',
      modules: 1,
    })
  })

  it('判定键少命中一枚就算没进包（防止"命中一半"被读成随包分发）', () => {
    const seen: string[][] = []
    const [row] = vendorSourceEntries([SPEC], io({ distHasAll: (arr) => (seen.push(arr), false) }))
    expect(row.inBundle).toBe(false)
    expect(seen[0]).toEqual(['NEEDLE-A', '"0.20.3"'])
  })

  it('真实登记表：每份 vendor 件都要有可证伪的判定键，且版本无关的那枚是字面常量', () => {
    expect(VENDOR_SOURCES.length).toBeGreaterThan(0)
    for (const s of VENDOR_SOURCES) {
      const keys = s.probes('9.9.9')
      expect(keys.length).toBeGreaterThan(1)
      expect(new Set(keys).size).toBe(keys.length)
      expect(keys[0]).not.toContain('9.9.9')
    }
  })
})

describe('readVendoredBinaryModule：从生成文件里取随包二进制的登记字段', () => {
  const TEXT = `export const ZXING_WASM_DATA_VERSION = '3.1.4'
export const ZXING_WASM_DATA_SHA256 = '${'a'.repeat(64)}'
export const ZXING_WASM_DATA_BYTES = 953527
export const ZXING_WASM_DATA_BASE64 =
  'AAECAwQ='
`
  it('四个字段都按名取，不靠行号', () => {
    expect(readVendoredBinaryModule(TEXT)).toEqual({
      version: '3.1.4',
      sha256: 'a'.repeat(64),
      bytes: 953527,
      base64: 'AAECAwQ=',
    })
  })

  it('字段缺失时返回 null/NaN 而不是猜一个', () => {
    const got = readVendoredBinaryModule('export const 什么都没有 = 1')
    expect(got).toEqual({ version: null, sha256: null, bytes: NaN, base64: null })
  })

  it('sha256 必须是 64 位十六进制，被截断的登记值不认', () => {
    const got = readVendoredBinaryModule(TEXT.replace('a'.repeat(64), 'a'.repeat(20)))
    expect(got.sha256).toBeNull()
  })
})
