// 语言包对账（一件事，不过即非零退出）
// zh-CN 与 en-US 的分块文件与键集必须一一对应。
// 背景：加 key 时只补一边，运行时会回退成显示 key 本身（如 "fbTarget.fieldsMore"），
// 单测与类型检查都发现不了 —— 只有切到那门语言的用户看得到。
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = join('src', 'components', '_internal', 'locales', 'chunks')
const LOCALES = ['zh-CN', 'en-US']

const flatKeys = (obj, prefix = '', out = []) => {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flatKeys(v, path, out)
    else out.push(path)
  }
  return out
}

const fail = []
const chunks = {}
for (const loc of LOCALES) {
  chunks[loc] = readdirSync(join(ROOT, loc))
    .filter((f) => f.endsWith('.ts'))
    .sort()
}
const missing = chunks['zh-CN'].filter((f) => !chunks['en-US'].includes(f))
const extra = chunks['en-US'].filter((f) => !chunks['zh-CN'].includes(f))
if (missing.length) fail.push(`en-US 缺少分块文件: ${missing.join(', ')}`)
if (extra.length) fail.push(`zh-CN 缺少分块文件: ${extra.join(', ')}`)

let total = 0
for (const file of chunks['zh-CN']) {
  if (!chunks['en-US'].includes(file)) continue
  const mods = {}
  for (const loc of LOCALES) {
    mods[loc] = await import(pathToFileURL(resolve(ROOT, loc, file)).href)
  }
  const a = new Set(flatKeys(mods['zh-CN'].default ?? {}))
  const b = new Set(flatKeys(mods['en-US'].default ?? {}))
  const onlyZh = [...a].filter((k) => !b.has(k))
  const onlyEn = [...b].filter((k) => !a.has(k))
  total += a.size
  if (onlyZh.length) fail.push(`${file} 缺 en-US 键 ${onlyZh.length} 个: ${onlyZh.slice(0, 8).join(', ')}${onlyZh.length > 8 ? ' …' : ''}`)
  if (onlyEn.length) fail.push(`${file} 缺 zh-CN 键 ${onlyEn.length} 个: ${onlyEn.slice(0, 8).join(', ')}${onlyEn.length > 8 ? ' …' : ''}`)
}
console.log(`[i18n] 分块 ${chunks['zh-CN'].length}/${LOCALES.length === 2 ? chunks['zh-CN'].length : '?'} 同集，zh-CN 键 ${total} 个，与 en-US 逐块比对`)

if (fail.length) {
  console.error('\n❌ check:i18n 未通过 —— 语言包两侧不对等')
  fail.forEach((f) => console.error('   - ' + f))
  console.error('\n   规矩：新增文案键必须同时写进 zh-CN 与 en-US 对应分块（README「国际化」）。')
  process.exit(1)
}
console.log('\n✅ check:i18n 通过')
