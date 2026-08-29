/**
 * 语言包分块拆分脚本（一次性工具）
 * 把 zh-CN.ts / en-US.ts 的顶层域按映射拆到 chunks/*.ts，并生成聚合器
 * 用法：node scripts/split-locales.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const locDir = resolve(root, 'src/components/_internal/locales')

// 顶层域 → 分块文件
const MAP = {
  common: 'common',
  toast: 'feedback',
  errorBoundary: 'feedback',
  readonly: 'feedback',
  offline: 'feedback',
  imagePreview: 'data',
  table: 'data',
  miniLayout: 'layout',
  pagination: 'nav',
  form: 'form',
  login: 'login',
  chart: 'chart',
  routePlanner: 'routePlanner',
  formBuilder: 'formBuilder',
}

/** 按花括号深度扫描，提取顶层域块（含域名前的注释行） */
function extractDomains(src) {
  const domains = []
  let i = 0
  // 跳过文件头注释，找到 export default {
  const startMarker = 'export default {'
  const startIdx = src.indexOf(startMarker)
  if (startIdx < 0) throw new Error('未找到 export default {')
  // 收集 export default { 之前的头注释
  const header = src.slice(0, startIdx)
  i = startIdx + startMarker.length
  while (i < src.length) {
    // 跳过空白与逗号
    while (i < src.length && /[\s,]/.test(src[i])) i++
    if (src[i] === '}') break
    // 读取域名（可能带引号）
    let name = ''
    if (src[i] === "'" || src[i] === '"' || src[i] === '`') {
      const q = src[i]
      i++
      while (i < src.length && src[i] !== q) name += src[i++]
      i++ // 跳过收尾引号
    } else {
      while (i < src.length && /[\w$]/.test(src[i])) name += src[i++]
    }
    // 跳到冒号后的 {
    while (i < src.length && src[i] !== '{') i++
    // 向前回溯收集紧邻的注释行（连续以 // 或 * 开头的行 + 空行）
    let bodyStart = i
    let look = bodyStart - 1
    let pendingComments = ''
    while (look >= 0) {
      // 回退到行首
      const lineStart = src.lastIndexOf('\n', look)
      const line = src.slice(lineStart + 1, look + 1)
      const trimmed = line.trim()
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed === '') {
        pendingComments = line + '\n' + pendingComments
        look = lineStart - 1
        if (trimmed === '') break // 空行只收一个，避免把域头注释吞过界
      } else break
    }
    // 花括号配对提取块体
    let depth = 0
    let j = i
    for (; j < src.length; j++) {
      const ch = src[j]
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) break
      } else if (ch === "'" || ch === '"') {
        // 跳过字符串内的花括号
        const q = ch
        j++
        while (j < src.length && src[j] !== q) {
          if (src[j] === '\\') j++
          j++
        }
      }
    }
    const body = src.slice(i, j + 1)
    // 域名前如果有收集到注释，去掉域内第一行前的重复（注释属于域头）
    domains.push({ name, header: pendingComments.trimEnd(), body })
    i = j + 1
  }
  return { header, domains, tail: src.slice(i) }
}

function splitFile(file, isZh) {
  const src = readFileSync(resolve(locDir, file), 'utf8')
  const { header, domains, tail } = extractDomains(src)
  const chunks = {}
  for (const d of domains) {
    const chunk = MAP[d.name]
    if (!chunk) throw new Error(`域 ${d.name} 未映射，请补 MAP`)
    ;(chunks[chunk] ||= []).push(d)
  }
  const langDir = isZh ? 'chunks/zh-CN' : 'chunks/en-US'
  mkdirSync(resolve(locDir, langDir), { recursive: true })
  for (const [chunkName, list] of Object.entries(chunks)) {
    const lang = isZh ? 'zh-CN' : 'en-US'
    const body = list
      .map((d) => (d.header ? d.header + '\n' : '') + d.name + ': ' + d.body)
      .join(',\n\n')
    const fileHeader = `/**\n * ${lang} locale 分块 — ${chunkName} 域\n * 语言包已按模块分块维护；新增 key 请同时更新 zh-CN 与 en-US 对应分块。\n */\nexport default {\n${body},\n}\n`
    writeFileSync(resolve(locDir, langDir, `${chunkName}.ts`), fileHeader)
  }
  return domains.map((d) => d.name)
}

const zhDomains = splitFile('zh-CN.ts', true)
const enDomains = splitFile('en-US.ts', false)

// 聚合器（保持既有 key 路径完全不变）
const CHUNK_FILES = [
  'common', 'feedback', 'data', 'layout', 'nav', 'form',
  'login', 'chart', 'amap', 'routePlanner', 'formBuilder', 'basic', 'wc', 'storage', 'internal',
]
function aggregator(file, isZh) {
  const lang = isZh ? 'zh-CN' : 'en-US'
  const imports = CHUNK_FILES.map(
    (c) => `import ${c} from './chunks/${lang}/${c}'`
  ).join('\n')
  const spread = CHUNK_FILES.map((c) => `  ...${c},`).join('\n')
  const extra = isZh
    ? ''
    : '\n// satisfies 强约束：en 键集必须与 zh 完全一致（缺键在 typecheck 报错）'
  const content = `/**
 * ${lang} locale 聚合器 — 由 chunks/${lang}/ 下各分块组合而成
 * 维护规则：新增/修改 key 在对应分块文件操作；zh 与 en 键集必须保持一致。
 */
${imports}

export default {
${spread}
}${extra ? '' : ''}
`
  writeFileSync(resolve(locDir, file), content)
}
aggregator('zh-CN.ts', true)
aggregator('en-US.ts', false)

console.log('zh 域:', zhDomains.join(', '))
console.log('en 域:', enDomains.join(', '))
console.log('缺失对照（zh 有 en 无）:', zhDomains.filter((d) => !enDomains.includes(d)).join(', ') || '无')
console.log('缺失对照（en 有 zh 无）:', enDomains.filter((d) => !zhDomains.includes(d)).join(', ') || '无')
