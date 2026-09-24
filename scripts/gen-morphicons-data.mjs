// 生成 morphicons 形变图标几何数据（从 @lucide/vue 的 __iconNode 具名导出抽取）
// 用法：
//   node scripts/gen-morphicons-data.mjs            # 全量 + 别名（默认，供选择器提供整库）
//   node scripts/gen-morphicons-data.mjs --subset   # 仅库内实际用到的图标（37KB，极省）
//
// 背景：morphicons 只接受「图标数据」（IconNode / path d），不接受组件包。
//      @lucide/vue 的每个图标文件除默认组件外还具名导出 __iconNode，
//      正是它需要的格式 —— 因此无需新增 lucide 数据包依赖，几何也不会与静态图标错版本。
//
// 别名编码：lucide 有大量同义名（alert-circle 与 circle-alert 指同一图标，约占名字总数 59%）。
//      直接为每个别名复制一份几何会让体积翻倍，故用「字符串引用」：
//        { "circle-alert": [["path",{...}]],   ← 规范名，存几何
//          "alert-circle": "circle-alert" }    ← 别名，存指向规范名的字符串
//      一个文件、一次惰性加载即可覆盖全部名字，别名在 gzip 后可忽略不计。
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'

const ARGS = process.argv.slice(2)
const SUBSET = ARGS.includes('--subset')
const outIdx = ARGS.indexOf('--out')
const OUT_FILE =
  outIdx >= 0 && ARGS[outIdx + 1] ? ARGS[outIdx + 1] : 'src/components/_internal/morphicons-icons-data.json'

const LUCIDE_ROOT = 'node_modules/@lucide/vue/dist/esm'
const ICON_DIR = path.join(LUCIDE_ROOT, 'icons')
const SUBSET_FILE = 'src/components/_internal/lucide-subset.ts'
const PANEL_FILE = 'src/components/_internal/lucide-icons.json'

/** 解析 lucide 主入口，得到 Pascal 导出名 → 图标文件（规范 kebab 名）的映射 */
function buildPascalToFile() {
  const entry = fs.readFileSync(path.join(LUCIDE_ROOT, 'lucide-vue.mjs'), 'utf8')
  const map = new Map()
  for (const m of entry.matchAll(/export \{([^}]*)\} from '\.\/icons\/([^']+)\.mjs'/g)) {
    for (const part of m[1].split(',')) {
      const mm = part.match(/default as (\w+)/)
      if (mm) map.set(mm[1], m[2])
    }
  }
  return map
}

const toPascal = (kebab) =>
  kebab
    .split('-')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join('')

/** 动态 import 单个图标文件，读具名导出 __iconNode（比正则解析 JS 字面量更稳） */
async function readIconNode(file) {
  const p = path.join(ICON_DIR, file + '.mjs')
  if (!fs.existsSync(p)) return null
  const mod = await import(pathToFileURL(path.resolve(p)).href)
  return mod.__iconNode || null
}

const pascalToFile = buildPascalToFile()
const data = {}
const missing = []

if (SUBSET) {
  // 精简模式：只收库内实际引用的图标名（键保留源码里写的那个名字，别名也直接存几何）
  const subsetSrc = fs.readFileSync(SUBSET_FILE, 'utf8')
  const names = [...subsetSrc.matchAll(/^ {2}'([a-z0-9-]+)':/gm)].map((m) => m[1])
  for (const name of names) {
    const file = pascalToFile.get(toPascal(name))
    const node = file ? await readIconNode(file) : null
    if (node) data[name] = node
    else missing.push(name)
  }
} else {
  // 全量模式：所有图标文件（规范名 → 几何）
  const files = fs
    .readdirSync(ICON_DIR)
    .filter((f) => f.endsWith('.mjs') && f !== 'index.mjs')
    .map((f) => f.replace(/\.mjs$/, ''))
  for (const name of files) {
    const node = await readIconNode(name)
    if (node) data[name] = node
    else missing.push(name)
  }

  // 别名 → 规范名（字符串引用）。来源取面板名单 ∪ 源码子集，覆盖用户可能传入的两种名字
  const subsetSrc = fs.readFileSync(SUBSET_FILE, 'utf8')
  const subsetNames = [...subsetSrc.matchAll(/^ {2}'([a-z0-9-]+)':/gm)].map((m) => m[1])
  const panelNames = JSON.parse(fs.readFileSync(PANEL_FILE, 'utf8'))
  let aliasCount = 0
  for (const name of new Set([...panelNames, ...subsetNames])) {
    if (typeof name !== 'string' || !name) continue
    const file = pascalToFile.get(toPascal(name))
    if (!file) {
      missing.push(name)
      continue
    }
    if (file === name) continue // 已是规范名，几何已存在
    if (!data[file]) continue // 规范几何缺失（不应发生），跳过
    data[name] = file
    aliasCount++
  }
  console.log('alias refs:', aliasCount)
}

// 稳定输出：键排序，避免 diff 噪声
const sorted = {}
for (const k of Object.keys(data).sort()) sorted[k] = data[k]

fs.writeFileSync(OUT_FILE, JSON.stringify(sorted))
const bytes = Buffer.byteLength(JSON.stringify(sorted))
const geometry = Object.values(sorted).filter((v) => typeof v !== 'string').length
console.log(`scope: ${SUBSET ? 'SUBSET (库内实际用到)' : 'FULL (整库 + 别名引用)'}`)
console.log('geometry icons:', geometry, '| total keys:', Object.keys(sorted).length)
console.log('no data:', missing.length ? missing.slice(0, 10).join(', ') + (missing.length > 10 ? ' …' : '') : '(none)')
console.log(`written ${OUT_FILE} — ${Math.round(bytes / 1024)}KB`)
