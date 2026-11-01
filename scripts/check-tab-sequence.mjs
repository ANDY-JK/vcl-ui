/**
 * check-tab-sequence.mjs — 交互容器里的 Tab 序列契约（TD-97 / #318 #322 #323）
 *
 * 背景：连续三轮发现"可聚焦元素随数据增长"（日历 42 格、菜单每项、下拉选项每项）。
 * 每次都靠人眼发现，说明缺一条**机械规矩**。
 *
 * 规矩（只查**能一眼判定**的两条，宁可漏不可噪）：
 *   1. 带 `role="option|treeitem|tab|menuitem|gridcell"` 的元素，**必须显式写 tabindex**
 *      —— 不论用 roving（:tabindex 绑定）还是 activedescendant（-1），都得有；
 *      什么都不写 = 浏览器默认 0 = 该角色整体进入 Tab 序列。
 *   2. 这些角色上写死 `tabindex="0"` 一律算错：要么 -1，要么交给绑定动态决定。
 *
 * 为什么不做"扫容器里所有 button"：误报率高（容器里常有搜索框、确认按钮**本来就该**可 Tab）。
 * 误报会让闸门被关掉 —— 闸门的硬功夫是"不报假警"。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/** 扫描根：默认库源码；自测时用 --root 指到夹具目录，验证闸门**真会红** */
const rootArgIdx = process.argv.indexOf('--root')
const ROOT = rootArgIdx > -1 ? process.argv[rootArgIdx + 1] : 'src/components'
const ROLE_RE = /role="(option|treeitem|tab|menuitem|gridcell)"/
const NATIVELY_FOCUSABLE = new Set(['button', 'input', 'select', 'textarea', 'summary'])

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (name.endsWith('.vue')) out.push(p)
  }
  return out
}

const problems = []
let scanned = 0
for (const file of walk(ROOT)) {
  const raw = readFileSync(file, 'utf8')
  const tplStart = raw.indexOf('<template>')
  if (tplStart < 0) continue
  const tplEnd = raw.lastIndexOf('</template>')
  if (tplEnd < tplStart) continue
  const before = raw.slice(0, tplStart).split(/\r?\n/).length - 1
  // 只保留模板区域，行号用 before 偏移回原文件
  const templateText = raw.slice(tplStart, tplEnd)
  const lines = templateText.split(/\r?\n/)
  scanned++
  for (let i = 0; i < lines.length; i++) {
    // 只看模板行：脚本注释里出现的 role 字样不算（用行首是否含 "//" 粗筛）
    if (/^\s*(\/\/|\*|<!--)/.test(lines[i])) continue
    // 起始标签可能跨多行 —— 往后拼到闭合 '>'
    let tag = lines[i]
    let j = i
    while (!tag.includes('>') && j + 1 < lines.length) {
      j++
      tag += '\n' + lines[j]
    }
    if (!ROLE_RE.test(tag)) continue
    // tag 行首有缩进，必须先把 '<' 找出来再取标签名（否则 tagName 会是空串）
    const tagName = (/<([a-zA-Z][\w-]*)/.exec(tag)?.[1] ?? '').toLowerCase()
    const nativelyFocusable = NATIVELY_FOCUSABLE.has(tagName) || /^a\b/.test(tagName) && /\bhref=/.test(tag)
    const hasTabindex = /\btabindex=/.test(tag) || /:tabindex=/.test(tag)
    const staticZero = /(?<!:)\btabindex="0"/.test(tag)
    if (!hasTabindex && nativelyFocusable) {
      problems.push({ file, line: i + before + 1, why: '没有写 tabindex：' + tagName + ' 默认 0 → 这个角色整体进了 Tab 序列' })
    } else if (staticZero) {
      problems.push({ file, line: i + before + 1, why: '写死 tabindex="0"：应为 -1 或由 :tabindex 动态决定' })
    }
    i = j
  }
}

if (problems.length) {
  console.error(`\n✖ tab 序列契约未通过（扫 ${scanned} 个 .vue，${problems.length} 处）：\n`)
  for (const p of problems) console.error(`  ${relative('.', p.file).replace(/\\/g, '/')}:${p.line} — ${p.why}`)
  console.error('\n修法：roving tabindex（整容器留 1 个 0，其余 -1，方向键移动）或')
  console.error('      aria-activedescendant（焦点留在输入框，子项一律 -1）。')
  console.error('      参考 nav/menu-keyboard.ts、form/date-panel/DatePanel.vue、form/Select.vue\n')
  process.exit(1)
}
console.log(`✅ check:tab-sequence 通过 — 扫 ${scanned} 个 .vue，交互角色都有显式 tabindex`)
