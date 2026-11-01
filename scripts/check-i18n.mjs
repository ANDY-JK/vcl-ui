// 语言包对账（一件事，不过即非零退出）
// zh-CN 与 en-US 的分块文件与键集必须一一对应。
// 背景：加 key 时只补一边，运行时会回退成显示 key 本身（如 "fbTarget.fieldsMore"），
// 单测与类型检查都发现不了 —— 只有切到那门语言的用户看得到。
import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** 扫描根：默认库语言包；自测时 --root 指到夹具目录，验证闸门真会红 */
const rootIdx = process.argv.indexOf('--root')
const ROOT = rootIdx > -1 ? process.argv[rootIdx + 1] : join('src', 'components', '_internal', 'locales', 'chunks')
const LOCALES = ['zh-CN', 'en-US']

const flatKeys = (obj, prefix = '', out = []) => {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flatKeys(v, path, out)
    else out.push(path)
  }
  return out
}

/** 键值对（键对账只管"有没有"，值还要看"写没写、写没写错语言"） */
const flatPairs = (obj, prefix = '', out = []) => {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flatPairs(v, path, out)
    else out.push([path, v])
  }
  return out
}

/** 中日韩字符：出现在 en-US 里说明是复制粘贴没翻译（#327） */
/** 中日韩字符 */
const CJK_RE = /[\u3040-\u30ff\u4e00-\u9fa5\uac00-\ud7af]/
/**
 * 判定"几乎没翻译"：含中日韩文字，且**没有 3 个以上连续拉丁字母**。
 *
 * 为什么不直接用"含中文"：en-US 里合法地会引用中文列名/示例（"经度"/"纬度"），
 * 那种句子英文很多。用这条判据，实测库内 0 误报；而"整条复制过来没翻"的值
 * （如 `保存失败`）没有任何拉丁字母，一定命中。
 */
const looksUntranslated = (v) => CJK_RE.test(v) && !/[A-Za-z]{3}/.test(v)

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
  // 值检查（#327）：键对账通过 ≠ 文案写好了 —— 空值用户看到空白，
  // en-US 里混中文则等于没翻译。这两类都只在"切到那门语言"时才暴露。
  for (const [loc, mod] of Object.entries(mods)) {
    for (const [key, value] of flatPairs(mod.default ?? {})) {
      if (typeof value !== 'string') continue
      if (!value.trim()) fail.push(`${file} [${loc}] ${key} 的值是空的 —— 用户会看到空白`)
      else if (loc === 'en-US' && looksUntranslated(value)) fail.push(`${file} [en-US] ${key} 疑似整条没翻译：「${value}」`)
    }
  }
  const onlyZh = [...a].filter((k) => !b.has(k))
  const onlyEn = [...b].filter((k) => !a.has(k))
  total += a.size
  if (onlyZh.length)
    fail.push(
      `${file} 缺 en-US 键 ${onlyZh.length} 个: ${onlyZh.slice(0, 8).join(', ')}${onlyZh.length > 8 ? ' …' : ''}`,
    )
  if (onlyEn.length)
    fail.push(
      `${file} 缺 zh-CN 键 ${onlyEn.length} 个: ${onlyEn.slice(0, 8).join(', ')}${onlyEn.length > 8 ? ' …' : ''}`,
    )
}
console.log(
  `[i18n] 分块 ${chunks['zh-CN'].length}/${LOCALES.length === 2 ? chunks['zh-CN'].length : '?'} 同集，zh-CN 键 ${total} 个，与 en-US 逐块比对`,
)

if (fail.length) {
  console.error('\n❌ check:i18n 未通过 —— 语言包两侧不对等')
  fail.forEach((f) => console.error('   - ' + f))
  console.error('\n   规矩：新增文案键必须同时写进 zh-CN 与 en-US 对应分块（README「国际化」）。')
  process.exit(1)
}
console.log('\n✅ check:i18n 通过')
