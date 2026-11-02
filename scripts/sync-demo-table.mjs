/**
 * sync-demo-table —— 把生成式 API 文档里的 props 表**转写**进演示页（#359）
 *
 * ## 为什么需要它
 *
 * 演示页的 props 表是手写的，生成式文档（`docs-site/components/*.md`）是自动的、准确的。
 * 两者长期脱节：`check:demo-props` 反向对账实测**曾有 158 个 prop 从未出现在演示页表里**。
 * 手工补了 Input / Select 之后剩下的存量还有 144 个 —— **手抄一遍必然再漂移**，
 * 所以做成脚本：以生成式文档为唯一真源，转写成演示页的 HTML 表格行。
 *
 * ## 用法
 *
 *   node scripts/sync-demo-table.mjs --component Upload --domain form --demo src/demos/form/UploadDemo.vue
 *   node scripts/sync-demo-table.mjs ... --dry   # 只打印将要写入的行数，不落盘
 *
 * ## 只做一件事
 *
 * 替换表体（表头 `</tr>` 到 `</tbody>` 之间的行）。表头、Card 外壳、样式一律不动 ——
 * 演示页的样式各页不同（有的用 class、有的用 inline style），脚本不替人做视觉决策。
 */
import { readFileSync, writeFileSync } from 'node:fs'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : fallback
}
const component = arg('component')
const domain = arg('domain')
const demo = arg('demo')
const dry = process.argv.includes('--dry')
if (!component || !domain || !demo) {
  console.error('用法：--component <Name> --domain <domain> --demo <path> [--dry]')
  process.exit(1)
}

// ① 从生成式文档抽该组件的 props 表（Markdown）
const md = readFileSync(`docs-site/components/${domain}.md`, 'utf8')
const sec = new RegExp(`## \`${component}\`[\\s\\S]*?### Props\\n\\n\\|[\\s\\S]*?\\n\\n`).exec(md)
if (!sec) {
  console.error(`在 docs-site/components/${domain}.md 里找不到 \`${component}\` 的 Props 表`)
  process.exit(1)
}
const mdRows = sec[0].split('\n').filter((l) => l.startsWith('| `'))
if (!mdRows.length) {
  console.error(`\`${component}\` 的 Props 表解析出 0 行`)
  process.exit(1)
}

// Markdown 单元格里可能有转义竖线（`string \| number`）：先保护，再切列
const SENT = '\u0000'
const cellsOf = (line) =>
  line.replace(/\\\|/g, SENT).split('|').slice(1, -1).map((c) => c.split(SENT).join('|').trim())

/**
 * 单元格转义：
 * · `|`  → `\|`（Markdown 表格里的竖线要转义）
 * · `<` → `&lt;`（**Vue 模板解析器会把 `<{` 当成标签开头** ——
 *   `(file: File) => Promise<{ url: string }>` 这种类型直接写进 <td> 会让整页编译失败，
 *   报的还是毫不相关的 `invalid-first-character-of-tag-name`）
 */
const esc = (x) => x.replace(/\|/g, '\\|').replace(/</g, '&lt;')
const rows = mdRows.map((line) => {
  const parts = cellsOf(line)
  const name = parts[0].replace(/`/g, '')
  const type = parts[1].replace(/`/g, '')
  const def = parts[2] === '' ? '—' : parts[2].replace(/`/g, '')
  const desc = parts[4].replace(/`/g, '')
  return `          <tr>\n            <td><code>${name}</code></td>\n            <td>${esc(type)}</td>\n            <td>${esc(def)}</td>\n            <td>${esc(desc)}</td>\n          </tr>`
})

// ② 替换演示页里的表体
let s = readFileSync(demo, 'utf8')
const propTh = s.search(/<th[^>]*>\s*Prop\s*<\/th>/i)
if (propTh < 0) {
  console.error(`${demo} 里找不到 <th>Prop</th> —— 该页还没有 props 表，需要人工加表头`)
  process.exit(1)
}
const headerClose = s.indexOf('</tr>', propTh) + '</tr>'.length
const tbodyClose = s.indexOf('</tbody>', headerClose)
if (tbodyClose < 0) {
  console.error(`${demo} 里找不到 </tbody>`)
  process.exit(1)
}
const before = s.slice(0, headerClose)
const after = s.slice(tbodyClose)
const out = before + '\n' + rows.join('\n') + '\n        ' + after
writeFileSync(demo, out, 'utf8')
console.log(`[sync-demo-table] ${demo}：${component} 的 ${rows.length} 行${dry ? '（dry：未落盘）' : '已写入'}`)
