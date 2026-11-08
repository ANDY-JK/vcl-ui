#!/usr/bin/env node
/**
 * check-type-tokens —— 复合字体标尺的「止涨线」闸口
 *
 * ## 为什么需要
 *
 * `tokens.css` 里那套 `--vcl-text-*`（caption/label/body/control/heading）与
 * `type-scale.css` 的 `.vcl-t-*` 工具类，作用是让「字号 + 行高 + 字距 + 字重」一次给齐。
 * 但**令牌存在不等于被用**：只要还能随手写 `font-size: var(--vcl-fs-12)` 而不写行高，
 * 旧的散写习惯就会一直长回来，最后又回到「同一个字号十几种行高」。
 *
 * 本闸口不要求一次迁完，只做一件事：**把「裸字号规则」的条数锁死，只许降不许涨**。
 * 这与 `check:constants` 的行数止涨线是同一套棘轮思路。
 *
 * ## 判据（一条，肉眼可判）
 *
 * 一个 CSS 声明块里出现 `font-size:` 却**没有** `line-height:` → 记 1 条「裸字号规则」。
 *
 * 为什么只判这一条：有字号没行高，行高就落回浏览器默认（约 1.2 × 字号），
 * 与相邻元素的间距必然对不齐 —— 这正是「同级文字看着不同级」的物理来源。
 * 字重/字距不改也不会破版，所以不纳入判据，避免闸口变成噪音源。
 *
 * ## 豁免
 *
 * - `tokens.css` / `type-scale.css`：令牌与工具类定义处，行高在别处成组声明
 * - 声明块内出现 `line-height` 即视为已配对（不管值是什么）
 * - `<style>` 之外的 `<script>` 字符串：不扫（不是静态样式）
 *
 * ## 用法
 *
 *   node scripts/check-type-tokens.mjs            # 对比基线，涨了就红
 *   node scripts/check-type-tokens.mjs --list     # 列出全部裸字号规则（含文件:行）
 *   node scripts/check-type-tokens.mjs --update   # 迁移后把基线降下来（只许降）
 *   node scripts/check-type-tokens.mjs --root 夹具目录   # 自测/负向对照用
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import process from 'node:process'

const ROOT = resolve(process.cwd())
const rootIdx = process.argv.indexOf('--root')
const SCAN = rootIdx > -1 ? resolve(process.argv[rootIdx + 1]) : join(ROOT, 'src', 'components')
/**
 * 基线跟着扫描根走：`--root` 指到夹具时，基线也读夹具里的那份。
 * 否则夹具跑 `--update` 会**改写真仓基线** —— 闸口的自测反过来污染被保护的数据，
 * 这是本轮实测踩到的（把真基线从 421 覆盖成了 1）。
 */
const BASELINE_FILE =
  rootIdx > -1 ? join(resolve(process.argv[rootIdx + 1]), 'type-token-baseline.json') : join(ROOT, 'type-token-baseline.json')
const LIST = process.argv.includes('--list')
const UPDATE = process.argv.includes('--update')

/** 令牌与工具类的定义处：行高在成组声明里，不存在「裸字号」问题 */
const EXEMPT = new Set(['tokens.css', 'type-scale.css'])

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      walk(p, out)
      continue
    }
    if (/\.(css|vue)$/.test(name)) out.push(p)
  }
  return out
}

/**
 * 取出可扫描的样式片段。
 * .vue 只看 `<style>` 块 —— `<script>` 里的字符串不是静态样式，扫了只会误报。
 */
function styleSegments(text, isVue) {
  if (!isVue) return [{ text, offset: 0 }]
  const segs = []
  for (const m of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    segs.push({ text: m[1], offset: m.index + m[0].indexOf(m[1]) })
  }
  return segs
}

/** 剥注释：注释里出现的 font-size 字样不算声明 */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
}

/**
 * 逐块扫描：用「最内层花括号」切块。
 * 只取最内层，避免把 `@media { .a { } .b { } }` 整体当成一块 —— 那样任何一条写了行高
 * 就会把整段的其他裸字号一起赦免，闸口直接空转。
 */
function scanBlocks(css) {
  const blocks = []
  const stack = []
  for (let i = 0; i < css.length; i++) {
    const ch = css[i]
    if (ch === '{') {
      stack.push(i)
    } else if (ch === '}') {
      const start = stack.pop()
      if (start == null) continue
      // 最内层 = 出栈时栈已空（不再有外层块），或后面紧跟下一个规则
      const body = css.slice(start + 1, i)
      if (!body.includes('{')) blocks.push({ start: start + 1, body })
    }
  }
  return blocks
}

/**
 * 「盒子高度已有契约」的块不算裸字号。
 *
 * 为什么：判据的本意是拦「文字行距靠浏览器默认值，导致同级文字不同级」。
 * 但这类块的高度由别的东西决定，补 line-height 既不改观感、还会把密排撑高：
 *   - 显式 `height / min-height / max-height`：高度已经定死，行高只影响垂直居中
 *   - `display: flex|grid` + `align-items: center`：文字由盒模型居中，行高不参与行距
 * 密排库的主力控件（按钮/胶囊/行）全属这两类 —— 不豁免的话，闸口会逼着大家去撑高行，
 * 与「一屏放最多内容」直接冲突。
 */
function hasBoxHeightContract(body) {
  if (/(^|[;{\s])(height|min-height|max-height)\s*:/.test(body)) return true
  const isFlexOrGrid = /(^|[;{\s])display\s*:\s*(flex|inline-flex|grid|inline-grid)\b/.test(body)
  const isCentered = /(^|[;{\s])align-items\s*:\s*center/.test(body)
  return isFlexOrGrid && isCentered
}

const files = walk(SCAN)
const violations = []

for (const file of files) {
  if (EXEMPT.has(file.split(/[\\/]/).pop() ?? '')) continue
  const raw = readFileSync(file, 'utf8')
  const isVue = file.endsWith('.vue')
  for (const seg of styleSegments(raw, isVue)) {
    const css = stripComments(seg.text)
    for (const blk of scanBlocks(css)) {
      if (!/(^|[;{\s])font-size\s*:/.test(blk.body)) continue
      if (/(^|[;{\s])line-height\s*:/.test(blk.body)) continue
      if (hasBoxHeightContract(blk.body)) continue
      const abs = seg.offset + blk.start
      const line = raw.slice(0, abs).split('\n').length
      violations.push({ file: relative(ROOT, file).replaceAll('\\', '/'), line })
    }
  }
}

const count = violations.length

if (LIST) {
  console.log(`裸字号规则 ${count} 条（font-size 有、line-height 无）：`)
  for (const v of violations) console.log(`  ${v.file}:${v.line}`)
}

if (UPDATE) {
  const prev = existsSync(BASELINE_FILE) ? JSON.parse(readFileSync(BASELINE_FILE, 'utf8')) : null
  const prevCount = typeof prev?.count === 'number' ? prev.count : Infinity
  // 棘轮只许降：迁完之后基线必须比原来小，否则「更新基线」就成了绕过闸口的后门
  if (count > prevCount) {
    console.error(`✖ 基线只许降不许涨：当前 ${count} > 基线 ${prevCount}`)
    process.exit(1)
  }
  writeFileSync(BASELINE_FILE, `${JSON.stringify({ count }, null, 2)}\n`)
  console.log(`✅ 基线已更新：${prevCount === Infinity ? '（无）' : prevCount} → ${count}`)
  process.exit(0)
}

if (!existsSync(BASELINE_FILE)) {
  console.error(`✖ 缺少基线文件 ${relative(ROOT, BASELINE_FILE)}；首次建立请跑 --update`)
  process.exit(1)
}

const baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'))
const allowed = typeof baseline.count === 'number' ? baseline.count : -1
if (allowed < 0) {
  console.error('✖ 基线文件缺少 count 字段')
  process.exit(1)
}

// 非空转自检：扫描面为空说明路径写错或全被豁免，此时「通过」毫无意义
if (files.length === 0) {
  console.error(`✖ 扫描面为空（${relative(ROOT, SCAN)}）—— 闸口未真正生效`)
  process.exit(1)
}

if (count > allowed) {
  const added = violations.slice(0, 10)
  console.error(
    `✖ check:type-tokens 未通过 —— 裸字号规则 ${count} 条，超过止涨线 ${allowed} 条（+${count - allowed}）。\n` +
      `  修法：给这些规则补 line-height，或改用 .vcl-t-* 工具类 / --vcl-text-* 令牌。\n` +
      added.map((v) => `    ${v.file}:${v.line}`).join('\n') +
      (count > added.length ? `\n    …另 ${count - added.length} 条（--list 看全量）` : ''),
  )
  process.exit(1)
}

console.log(
  `✅ check:type-tokens 通过 — 裸字号规则 ${count} 条（止涨线 ${allowed}，余量 ${allowed - count}）`,
)
