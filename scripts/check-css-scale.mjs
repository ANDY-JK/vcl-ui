/**
 * check-css-scale —— 全站等比缩放防回退闸口
 *
 * 规则：src/components 与 src/demos 内，白名单尺寸属性（宽高/内外距/圆角/字号/层级偏移等）
 * 一律不得直写裸 px——设计尺寸必须写成 `calc(Npx * var(--vcl-scale))`，
 * 否则该属性在全视口恒定，与周边等比元素脱节（「组件缩、外壳不缩」的头大身子小）。
 *
 * 豁免（刻意不参与缩放，写了不报）：
 *   - 0px / 1px / 2px：边框线、焦点环、指示条，缩放只会带来亚像素模糊
 *   - ≥999px：药丸圆角表达「尽可能圆」，与尺寸无关
 *   - tokens.css：令牌定义本身（由 --vcl-scale 显式驱动的正源）
 *   - `--bp-*` 断点令牌与 @media/@container 查询参数：查询条件不属尺寸
 *   - JS/TS 段（.vue 的 <script>）：运行时测量坐标（getBoundingClientRect 等）不属缩放范畴
 *   - 前置注释带 `a11y-target` 标记的声明：WCAG 2.5.8 触控热区须固定 ≥24px 实际值，
 *     不得随 --vcl-scale 缩水（详见 scale-rules.mjs 的 A11Y_TARGET_MARK）
 *
 * 用法：node scripts/check-css-scale.mjs [--list]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { scanDeclarations } from './scale-rules.mjs'

const ROOT_DIRS = ['src/components', 'src/demos']
const EXEMPT_FILES = new Set(['src/components/tokens.css'])
const LIST = process.argv.includes('--list')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      walk(p, out)
      continue
    }
    if (/\.(vue|css)$/.test(name)) out.push(p.replaceAll('\\', '/'))
  }
  return out
}

/** .vue 只检查 <style> 块与模板内 style 属性：<script> 是运行时逻辑，不属本闸口 */
function scannableSegments(text, isVue) {
  if (!isVue) return [text]
  const segs = []
  for (const m of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) segs.push(m[1])
  for (const m of text.matchAll(/(?<![:-])style="([^"]*)"/g)) segs.push(m[1])
  return segs
}

const violations = []

/**
 * 注释提前闭合检查：注释正文里若出现星号紧跟斜杠，注释本体提前结束，
 * 后续说明文字变成非法 CSS，紧随其后的声明被解析器连同一起丢弃——
 * 症状极隐蔽：令牌声明语法上「在文件里」，浏览器读值却是空，全站静默回退。
 * 判定：按浏览器语义剥掉注释与字符串后，正常 CSS 里不该再出现中文（中文只可能来自说明文字）。
 */
function checkCommentClosure(text) {
  let code = ''
  let i = 0
  while (i < text.length) {
    const open = text.indexOf('/*', i)
    if (open === -1) {
      code += text.slice(i)
      break
    }
    code += text.slice(i, open)
    const close = text.indexOf('*/', open + 2)
    if (close === -1) break // 未闭合的尾注释：浏览器同样丢弃到文件尾，交由其它检查
    i = close + 2
  }
  // 字符串里的中文合法（content: '确定'），先掩掉引号内容再判
  const masked = code.replace(/"[^"\n]*"|'[^'\n]*'/g, (s) => s[0] + 'x'.repeat(Math.max(0, s.length - 2)) + s[0])
  const hit = /[\u4e00-\u9fff]/.exec(masked)
  if (!hit) return null
  const line = masked.slice(0, hit.index).split('\n').length
  const snippet = masked.split('\n')[line - 1].trim().slice(0, 90)
  return `第 ${line} 行注释疑似提前闭合，残留散文进入代码：${snippet}`
}

let scanned = 0

for (const file of ROOT_DIRS.flatMap((d) => walk(d))) {
  if (EXEMPT_FILES.has(file)) continue
  scanned++
  const text = readFileSync(file, 'utf8')
  for (const seg of scannableSegments(text, file.endsWith('.vue'))) {
    // 只有含注释的段才谈得上提前闭合；内联 style 属性没有注释概念
    if (seg.includes('/*')) {
      const closure = checkCommentClosure(seg)
      if (closure) violations.push(`${file}：${closure}`)
    }
    for (const hit of scanDeclarations(seg, { allowCustomProps: true })) {
      violations.push(`${file}：${hit.prop}: ${hit.raw}`)
    }
  }
}

// tokens.css 是令牌正源，尺寸豁免但注释闭合同样要查（本轮真实缺陷就在此处）
for (const file of EXEMPT_FILES) {
  const closure = checkCommentClosure(readFileSync(file, 'utf8'))
  if (closure) violations.push(`${file}：${closure}`)
}

if (violations.length > 0) {
  console.error(`❌ check:css-scale 失败 — ${violations.length} 处问题：`)
  for (const v of violations.slice(0, LIST ? violations.length : 40)) console.error('  ' + v)
  if (!LIST && violations.length > 40) console.error(`  …还有 ${violations.length - 40} 处（--list 看全量）`)
  console.error('尺寸一律写 calc(Npx * var(--vcl-scale))；白名单属性与豁免见 scripts/scale-rules.mjs。')
  process.exit(1)
}
console.log(`✅ check:css-scale 通过 — ${scanned} 个文件尺寸全部走等比缩放体系，注释闭合正常`)
