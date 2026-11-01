#!/usr/bin/env node
/**
 * 把裸 `:hover` 规则包进 `@media (hover: hover)`（#310）
 *
 * ## 为什么要做
 *
 * 触屏上 `:hover` 是**粘滞**的：点一下按钮/卡片，高亮会一直留到点别处 ——
 * 用户看到的是「点了之后一直亮着，像坏了一样」。标准做法是把 hover 样式
 * 限定在**真有指针设备**的环境：`@media (hover: hover)`。
 *
 * ## 怎么保证不乱改
 *
 * - 只处理**选择器里含 `:hover` 的规则块**，逐块包，不改选择器、不改属性、不重排顺序
 * - 已经在 `@media (hover: hover)` 里的跳过（幂等：跑两遍结果一样）
 * - `@keyframes` 内部跳过（那里不会有 :hover）
 * - 用**花括号配平**定位规则边界，注释与字符串里的花括号先遮掉
 * - 处理完自检：`{` 数量 +新增数 应等于 `}` 数量，`:hover` 数量不变
 *
 * 用法：
 *   node scripts/wrap-hover-media.mjs            # 只报告（dry run）
 *   node scripts/wrap-hover-media.mjs --write    # 真正写盘
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const WRITE = process.argv.includes('--write')
const CHECK = process.argv.includes('--check')
const ROOTS = ['src/components']

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(css|vue)$/.test(name)) out.push(p)
  }
  return out
}

/** 把注释与字符串内容替换成空格（保留长度），方便按括号定位 */
function blankOut(src) {
  const chars = src.split('')
  let i = 0
  while (i < chars.length) {
    if (chars[i] === '/' && chars[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end < 0 ? src.length : end + 2
      for (let j = i; j < stop; j++) if (chars[j] !== '\n') chars[j] = ' '
      i = stop
    } else if (chars[i] === '"' || chars[i] === "'") {
      const quote = chars[i]
      let j = i + 1
      while (j < chars.length && chars[j] !== quote) {
        if (chars[j] === '\\') j++
        if (chars[j] !== '\n') chars[j] = ' '
        j++
      }
      i = j + 1
    } else i++
  }
  return chars.join('')
}

/** 找到 [from, ...) 里第一个 `{` 的匹配 `}` 下标 */
function matchBrace(masked, from) {
  const open = masked.indexOf('{', from)
  if (open < 0) return -1
  let depth = 0
  for (let i = open; i < masked.length; i++) {
    if (masked[i] === '{') depth++
    else if (masked[i] === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * 处理一段 CSS 文本：返回 { css, wrapped }
 * 递归进入 @media 等容器块（容器内部同样可能有裸 hover 规则）。
 */
function processBlock(css, masked, from, to, insideHoverMedia) {
  let out = ''
  let i = from
  let wrapped = 0

  while (i < to) {
    // 找下一个规则开头：跳过空白
    const nextBrace = masked.indexOf('{', i)
    if (nextBrace < 0 || nextBrace >= to) {
      out += css.slice(i, to)
      break
    }
    const closeBrace = matchBrace(masked, nextBrace)
    if (closeBrace < 0 || closeBrace > to) {
      out += css.slice(i, to)
      break
    }
    const prelude = css.slice(i, nextBrace)
    // 判类型/判 :hover 必须用**遮掉注释与字符串后**的文本：注释里写「全库 :hover 包进了 @media (hover: hover)」会被误判成一条 hover 规则（#311 现场抓到）
    const preludeTrim = masked.slice(i, nextBrace).trim()

    if (preludeTrim.startsWith('@media') || preludeTrim.startsWith('@supports') || preludeTrim.startsWith('@layer')) {
      // 容器块：递归处理内部（保留前导文本与块本身结构）
      const innerStart = nextBrace + 1
      const innerEnd = closeBrace
      const innerHover = insideHoverMedia || /\(\s*hover\s*:\s*hover\s*\)/.test(preludeTrim)
      const inner = processBlock(css, masked, innerStart, innerEnd, innerHover)
      out += prelude + '{' + inner.css + '}'
      wrapped += inner.wrapped
      i = closeBrace + 1
      continue
    }

    if (preludeTrim.startsWith('@keyframes') || preludeTrim.startsWith('@-webkit-keyframes')) {
      out += css.slice(i, closeBrace + 1)
      i = closeBrace + 1
      continue
    }

    const isHover = /:hover\b/.test(preludeTrim)
    const body = css.slice(innerStartOf(nextBrace), closeBrace)
    void body
    if (isHover && !insideHoverMedia) {
      // 只包**规则本身**；输出带缩进的可读格式，而不是 }@media{...}} 那种一行流
      const rule = css.slice(i, closeBrace + 1)
      if (out !== '' && !out.endsWith('\n')) out += '\n'
      out += wrapReadable(rule)
      wrapped++
    } else {
      out += css.slice(i, closeBrace + 1)
    }
    i = closeBrace + 1
  }
  return { css: out, wrapped }
}

/**
 * 把一段规则放进 @media (hover: hover) 里，输出**可读**格式：
 *
 *   @media (hover: hover) {
 *     .btn:hover {
 *       color: red;
 *     }
 *   }
 *
 * 规则体里若还有嵌套块（`&` / 子选择器），退化为"整体右移 2 格"，不重排语义。
 */
function wrapReadable(rule) {
  const text = rule.replace(/\r\n/g, '\n').replace(/\s+$/, '')
  const open = text.indexOf('{')
  const close = text.lastIndexOf('}')
  if (open < 0 || close < 0) return '@media (hover: hover) {\n  ' + text.trim() + '\n}'

  const selector = text
    .slice(0, open)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ')
  const body = text.slice(open + 1, close)

  // 嵌套块：整体右移 2 格
  if (body.includes('{')) {
    const shifted = body
      .split('\n')
      .map((l) => (l.trim() === '' ? '' : '  ' + l.replace(/\s+$/, '')))
      .join('\n')
    return '@media (hover: hover) {\n  ' + selector + ' {' + shifted + '\n  }\n}'
  }

  const props = body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
  const inner = props.length ? '\n' + props.map((l) => '    ' + l).join('\n') + '\n  ' : ''
  return '@media (hover: hover) {\n  ' + selector + ' {' + inner + '}\n}'
}

function innerStartOf(braceIdx) {
  return braceIdx + 1
}

let totalWrapped = 0
let changedFiles = 0
for (const file of ROOTS.flatMap((r) => walk(r))) {
  const src = readFileSync(file, 'utf8')
  if (!/:hover\b/.test(src)) continue
  const masked = blankOut(src)
  // <style> 之外的模板/脚本原样保留：只处理 style 块
  const styleRe = /<style[^>]*>([\s\S]*?)<\/style>/g
  let result = ''
  let last = 0
  let fileWrapped = 0
  let m
  const isVue = file.endsWith('.vue')
  if (isVue) {
    while ((m = styleRe.exec(src))) {
      result += src.slice(last, m.index)
      const innerStart = m.index + m[0].indexOf('>') + 1
      const innerCss = m[1]
      const innerMasked = blankOut(innerCss)
      const out = processBlock(innerCss, innerMasked, 0, innerCss.length, false)
      result += src.slice(m.index, innerStart) + out.css + src.slice(innerStart + innerCss.length, m.index + m[0].length)
      fileWrapped += out.wrapped
      last = m.index + m[0].length
    }
    result += src.slice(last)
  } else {
    const out = processBlock(src, masked, 0, src.length, false)
    result = out.css
    fileWrapped = out.wrapped
  }

  if (fileWrapped === 0) continue
  const bracesBefore = (src.match(/{/g) || []).length
  const bracesAfter = (result.match(/{/g) || []).length
  const hoverBefore = (src.match(/:hover\b/g) || []).length
  const hoverAfter = (result.match(/:hover\b/g) || []).length
  if (bracesAfter !== bracesBefore + fileWrapped || hoverAfter !== hoverBefore) {
    console.error(`✖ 自检失败，跳过：${file}（花括号 ${bracesBefore}→${bracesAfter}，:hover ${hoverBefore}→${hoverAfter}）`)
    continue
  }
  totalWrapped += fileWrapped
  changedFiles++
  console.log(`${WRITE ? '改写' : '将改'} ${file}  (+${fileWrapped} 段)`)
  if (WRITE) writeFileSync(file, result)
}

if (CHECK) {
  if (totalWrapped > 0) {
    console.error(`✖ 有 ${totalWrapped} 段裸 :hover（${changedFiles} 个文件）未包进 @media (hover: hover)`)
    console.error('  触屏上 :hover 会粘滞：点一下按钮/卡片会一直保持高亮。')
    console.error('  修法：node scripts/wrap-hover-media.mjs --write')
    process.exit(1)
  }
  console.log(`✅ check:hover-guard 通过 — 全库 :hover 均在 @media (hover: hover) 内`)
  process.exit(0)
}

console.log(`\n${WRITE ? '已改写' : '待改写'} ${changedFiles} 个文件，共 ${totalWrapped} 段 :hover`)
if (!WRITE) console.log('（dry run —— 加 --write 才真正写盘）')