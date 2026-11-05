/* ═══════════ 代码用到的 i18n key 必须在语言包里（#449） ═══════════
 *
 * `check:i18n` 只对账 zh-CN 与 en-US 的键集，**看不到代码实际用了哪些 key**。
 * key 被删/改名后两侧仍然一一对应，只有运行时回退成显示 key 本身 —— 单测、类型、对账全不报。
 * 这是 TD-79 的同构：契约有两条到达路径，只对账其中一条。
 *
 * 本 spec：真实树无缺失 + 判据非空转 + 合成夹具（缺 key 报 / 注释里的 key 不报 / 动态 key 不报）。
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { flattenKeys, collectUsedKeys, loadZhKeys } from '../../scripts/check-i18n-usage.mjs'

let root = ''
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'i18n-usage-'))
  mkdirSync(join(root, 'form'), { recursive: true })
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

const write = (name, text) => writeFileSync(join(root, name), text)

describe('collectUsedKeys · 纯函数', () => {
  it('**报**：用到的 key 不在给定键集里', () => {
    write('form/A.vue', "const t = (k) => k\nconst a = t('form.missing')\n")
    const { missing } = collectUsedKeys({ componentsDir: root, keys: new Set(['form.other']) })
    expect(missing.map((m) => m.key)).toEqual(['form.missing'])
    expect(missing[0].file).toContain('form/A.vue')
  })

  it('**不报**：注释里出现的 key 不算使用（注释不是代码）', () => {
    write('form/B.vue', "// 请用 t('form.onlyInComment') 的地方都改掉\nconst x = 1\n")
    expect(collectUsedKeys({ componentsDir: root, keys: new Set() }).missing).toEqual([])
  })

  it('**不报**：动态 key（变量 / 模板串）不在判据范围内', () => {
    write('form/C.vue', "const k = 'form.' + n\nconst a = t(k)\nconst b = t(`form.${n}`)\n")
    expect(collectUsedKeys({ componentsDir: root, keys: new Set() }).missing).toEqual([])
  })

  it('**不报**：已有 key（含参数调用）', () => {
    write('form/D.vue', "const a = t('form.ok', { n: 1 })\n")
    expect(collectUsedKeys({ componentsDir: root, keys: new Set(['form.ok']) }).missing).toEqual([])
  })

  it('**不报**：含花括号/空格的不是合法 key（占位/句子）', () => {
    write('form/E.vue', "const a = t('form.{x}')\nconst b = t('form.has space')\n")
    expect(collectUsedKeys({ componentsDir: root, keys: new Set() }).missing).toEqual([])
  })
})

describe('check:i18n-usage · 真实树', () => {
  it('**当前零缺失**（代码用到的字面量 key 全在 zh-CN 语言包里）', () => {
    const keys = loadZhKeys()
    const { used, missing } = collectUsedKeys({ keys })
    expect(keys.size, '语言包键过少 → 判据空转').toBeGreaterThan(1000)
    expect(used, '解析出的 key 过少 → 判据空转').toBeGreaterThan(500)
    expect(missing, `缺失 key：${JSON.stringify(missing, null, 2)}`).toEqual([])
  })

  it('**flattenKeys 递归展开**（语言包是多层嵌套）', () => {
    expect(flattenKeys({ a: { b: { c: 'x' }, d: 'y' } })).toEqual(['a.b.c', 'a.d'])
    expect(flattenKeys({})).toEqual([])
  })
})
