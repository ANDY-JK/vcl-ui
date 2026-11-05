// 闸口：代码里用到的 i18n key 必须在语言包里有（TD-22 之外的第三条：缺 key 的第三条路径）
//
// ## 背景
//
// `check:i18n` 管**两侧对账**（zh-CN 与 en-US 键集一致），但它看不到**代码实际用了哪些 key**。
// 于是一个 key 被删/改名之后，语言包两侧仍然"一一对应"，只有运行时才回退成显示 key 本身
// （如界面上直接出现 `fbp.subformColumns`）—— 单测、类型检查、对账闸口全都不报。
// 这是 TD-79 的同构问题：**契约（key）有两条到达路径（语言包 / 调用点），只对账其中一条**。
//
// ## 判据（机械、可复现）
//
// · 扫 `src/components/**` 里**字面量**调用 `t('a.b')` / `t("a.b")` / `t('a.b', {...})`；
// · 键集来自语言包本体（import zh-CN chunk 后递归展开，与 check:i18n 同口径）；
// · 用到但语言包里没有的 key 即红。
//
// ## 精度边界（写清楚，避免假绿式自信）
//
// · 只看字面量调用：`t(variable)` / `` t(`a.${b}`) `` 不在范围内（动态 key 无法静态判）；
// · 只看 `t(` 这一种写法：别的注入名（如 `i18n.global.t`）不在范围内；
// · 语言包是**消费方可覆盖**的（`registerMessages`），所以"库外补充的 key"不在此判 ——
//   但库内调用点用到的 key 必须库内自带，这是本闸口的全部主张。
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)

const ROOT = process.cwd()
const COMPONENTS = path.join(ROOT, 'src/components')
const LOCALE_ENTRY = path.join(ROOT, 'src/components/_internal/locales/zh-CN.ts')

/** 递归展开语言包键集 */
export function flattenKeys(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const p = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flattenKeys(v, p, out)
    else out.push(p)
  }
  return out
}

/**
 * 收集代码里字面量用到的 key，并与给定键集比对（纯函数，可单测）。
 *
 * @param {{componentsDir?: string, keys?: Set<string>}} opts
 * @returns {{used: number, keys: number, missing: {key:string,file:string}[]}}
 */
export function collectUsedKeys({ componentsDir = COMPONENTS, keys } = {}) {
  const files = []
  ;(function walk(d) {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n)
      if (fs.statSync(p).isDirectory()) walk(p)
      else if (/\.(vue|ts)$/.test(n)) files.push(p.split(path.sep).join('/'))
    }
  })(componentsDir)

  const used = new Map() // key -> 首个引用文件
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8')
    // 去注释，避免注释里讨论 key 造成假阳性（行注释 + 块注释）
    const stripped = text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    for (const re of [/\bt\(\s*'([^']+)'/g, /\bt\(\s*"([^"]+)"/g]) {
      for (const m of stripped.matchAll(re)) {
        const k = m[1]
        if (k.includes('{') || k.includes('$') || k.includes(' ')) continue
        if (!used.has(k)) used.set(k, f)
      }
    }
  }

  const keySet = keys ?? new Set()
  const missing = [...used.entries()].filter(([k]) => !keySet.has(k)).map(([key, file]) => ({ key, file }))
  return { used: used.size, keys: keySet.size, missing }
}

/** 读语言包：jiti 处理 TS + 无扩展名 import（与 bench.mjs 同款） */
export function loadLocaleMessages(entry = LOCALE_ENTRY) {
  const { createJiti } = require('jiti')
  const jiti = createJiti(import.meta.url)
  const mod = jiti(entry)
  return mod.default ?? mod.zhCN ?? mod
}

/** zh-CN 语言包键集（闸口与单测共用同一口径） */
export function loadZhKeys() {
  return new Set(flattenKeys(loadLocaleMessages()))
}

function main() {
  const keys = loadZhKeys()
  const { used, missing } = collectUsedKeys({ keys })
  if (used < 100) {
    console.error(`❌ check:i18n-usage 未通过 —— 判据空转（只解析出 ${used} 个字面量 key）`)
    process.exit(1)
  }
  if (missing.length) {
    console.error(`❌ check:i18n-usage 未通过 —— ${missing.length} 个用到的 key 在 zh-CN 语言包里不存在：`)
    for (const m of missing) console.error(`   - ${m.key}  @ ${m.file}`)
    console.error('   后果：运行时会直接显示 key 本身（如界面出现 fb.xxx）。修法：补进语言包（两侧都要）。')
    process.exit(1)
  }
  console.log(`✅ check:i18n-usage 通过 — 代码用到 ${used} 个字面量 key，语言包 ${keys.size} 个键，无缺失`)
}



if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
