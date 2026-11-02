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
const s = readFileSync(demo, 'utf8')
/**
 * 页面还没有 props 表时：`--create` 会在 `</template>` 前插一张标准表。
 * 有 `Card` 的页面用 Card 包（视觉一致）；没有的用裸 table —— **不替人加 import**，
 * 因为那会改动脚本区，超出"转写文档表"的职责。
 */
let template = s
const forceNewTable = process.argv.includes('--new-table')
if (forceNewTable || !/<th[^>]*>\s*Prop\s*<\/th>/i.test(template)) {
  if (!forceNewTable && !process.argv.includes('--create')) {
    console.error(`${demo} 里找不到 <th>Prop</th> —— 加 --create 可自动插入标准表头`)
    process.exit(1)
  }
  const useCard = /<Card\b/.test(template) && /import Card/.test(template)
  const table = [
    useCard ? '    <Card title="Props" title-as="h2">' : '    <div class="props-demo-wrap">',
    '      <table class="props-table">',
    '        <tbody>',
    '          <tr class="props-header">',
    '            <th>Prop</th>',
    '            <th>类型</th>',
    '            <th>默认</th>',
    '            <th>说明</th>',
    '          </tr>',
    '        </tbody>',
    '      </table>',
    useCard ? '    </Card>' : '    </div>',
    '',
  ].join('\n')
  /**
   * 插入点必须在**根 div 之内**：直接插在 `</template>` 前会落到根元素外面 ——
   * 页面照样能编译（Vue 允许多根），但**闸口的表解析会跳过它**（表数不增加），
   * 于是"写了表却没被算进去"（本轮 ChartDemo 就踩了这个）。
   */
  const tplEnd = template.lastIndexOf('</template>')
  const rootClose = template.lastIndexOf('</div>', tplEnd)
  const insertAt = rootClose > -1 ? rootClose : tplEnd
  if (tplEnd < 0) {
    console.error(`${demo} 里找不到 </template>`)
    process.exit(1)
  }
  template = template.slice(0, insertAt) + table + template.slice(insertAt)
  console.log(`[sync-demo-table] ${demo}：已插入 Props 表骨架${useCard ? '（Card 包裹）' : ''}`)
}
/** `--new-table` 时取最后一张 Prop 表（新插入的那张），否则取第一张 */
const propTh = forceNewTable
  ? template.lastIndexOf('<th', template.search(/<\/table>(?![\s\S]*<\/table>)/))
  : template.search(/<th[^>]*>\s*Prop\s*<\/th>/i)
const propThSafe = propTh > -1 ? propTh : template.search(/<th[^>]*>\s*Prop\s*<\/th>/i)
/**
 * 只处理**包含 `<th>Prop</th> 的那张表**。
 * 一个演示页里可能有多张表（ChartDemo 3 张、MenuDemo 3 张），
 * 早期的全局替换会把别的表也吃掉 —— 结构自检当场拦住（这轮真的拦了 8 个）。
 */
const tableStart = template.lastIndexOf('<table', propThSafe)
const tableEnd = template.indexOf('</table>', propThSafe)
if (tableStart < 0 || tableEnd < 0) {
  console.error(`${demo} 里的 <th>Prop</th> 不在任何 <table> 内`)
  process.exit(1)
}
const table = template.slice(tableStart, tableEnd)

const headerClose = table.indexOf('</tr>', table.indexOf('<th', table.search(/<th[^>]*>\s*Prop\s*<\/th>/i))) + '</tr>'.length
const theadClose = table.indexOf('</thead>', headerClose)
const afterHead = theadClose > -1 && theadClose < table.indexOf('</tbody>', headerClose) ? theadClose + '</thead>'.length : headerClose
/** 起点必须落在 `<tbody>` 之后：从 `</thead>` 之后开始会吃掉 `<tbody>` 开标签 → x-invalid-end-tag */
const tbodyOpen = table.indexOf('<tbody>', afterHead)
const start = tbodyOpen > -1 && tbodyOpen < table.indexOf('</tbody>', afterHead) ? tbodyOpen + '<tbody>'.length : afterHead
const tbodyClose = table.indexOf('</tbody>', start)
if (headerClose <= 0 || tbodyClose < 0) {
  console.error(`${demo}：在 Prop 表里定位表体失败（headerClose=${headerClose}, tbodyClose=${tbodyClose}）`)
  process.exit(1)
}

const newTable = table.slice(0, start) + '\n' + rows.join('\n') + '\n        ' + table.slice(tbodyClose)
// 结构自检（只针对这张表）：tbody 必须恰好一开一收
const opens = (newTable.match(/<tbody>/g) || []).length
const closes = (newTable.match(/<\/tbody>/g) || []).length
if (opens !== 1 || closes !== 1) {
  console.error(`${demo} 结构自检失败：<tbody> ${opens} / </tbody> ${closes}（应为 1/1），未写入`)
  process.exit(1)
}

const out = template.slice(0, tableStart) + newTable + template.slice(tableEnd)
writeFileSync(demo, out, 'utf8')
console.log(`[sync-demo-table] ${demo}：${component} 的 ${rows.length} 行${dry ? '（dry：未落盘）' : '已写入'}`)
