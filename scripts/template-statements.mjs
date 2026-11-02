/**
 * 质量链闸口：模板表达式多语句检查（#384）
 *
 * ## 背景（#383）
 *
 * `@click="a = ''; b = ''"` 这种**多语句连写**在 Vue 模板表达式里是非法 JS，
 * Vite 在 dev server 按需编译到该页时才报 Internal server error ——
 * `vue-tsc` 不查、快链无 e2e，三道防线全漏，16 例 e2e 红。
 * eslint-plugin-vue v10 **没有** `no-multiple-template-statements` 规则（官方未收录），
 * 所以这里用 20 行静态检查兜住。
 *
 * ## 判据（刻意保守，宁漏勿误报）
 *
 * 只查**指令属性值内出现语句终结符 `;`** 的形态：`@click="a = ''; b = ''"`。
 * `;` 在模板属性值里合法的场合极少（字符串字面量里带分号的，如 `@click="go(';')"`
 * 会被误报 —— 该形态走 EXEMPT 登记）。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** 指令属性（@x / v-x）的值里出现 `;` = 多语句或字符串分号，都值得人工看一眼 */
/**
 * 指令属性（@x / v-x）的值里出现多语句的痕迹。
 *
 * ⚠️ #383 的原始 bug **没有分号**，是换行分隔的两条赋值：
 *   @click="
 *     serverError = ''
 *     serverErrorVal = ''
 *   "
 * 所以只查 `;` 会漏掉它（第一版就漏了，单测当场抓到）。真正的判据是
 * 「**值里有 ≥2 条赋值语句**」，用两条线索：
 *   · 出现 `;`（显式语句终结符）
 *   · 出现 ≥2 行以「标识符 / 属性链 + `=`（且非 `==` `===` `=>`）」开头的赋值
 * 合法的跨行**单个表达式**（如 `:field="{ type: 'x', ... }"` 多行对象字面量）用的是 `:`，
 * 不会被误报 —— 这就是为什么按"赋值行数"判而不是按"有没有换行"判。
 */
export function findMultiStatementAttrs(source) {
  const out = []
  // ⚠️ 正则必须在**函数内**创建：`/g` 的 lastIndex 会跨调用残留，第二个文件会从上一次
  // 结束位置开始扫，**静默漏报**（自测当场抓到）。
  const attrRe = /(@[\w.]+|v-[\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g
  let m
  while ((m = attrRe.exec(source))) {
    const value = m[3] ?? m[4] ?? ''
    if (!isMultiStatement(value)) continue
    const line = source.slice(0, m.index).split('\n').length
    out.push({ line, attr: m[1], value: value.slice(0, 60) })
  }
  return out
}

/** 赋值语句行：`x = …` / `a.b = …` / `obj['k'] = …`（排除 == === => += 等比较/箭头） */
const ASSIGN_LINE = /^\s*[\w$]+(?:[\w$.[\]()'"]*)\s*=(?![=>])/

/**
 * 判断属性值是否含**裸的多条语句**。
 *
 * 关键区分（判据第一版把二者混为一谈，误报了两例合法的箭头函数）：
 *   · `a = '' \n b = ''`            → **非法**（裸语句序列，Vite 编译期炸）
 *   · `(v) => { a = 1; b = 2 }`      → **合法**（单个函数字面量表达式，语句在函数体内）
 * 所以先看形态：值是不是一个函数字面量，是 → 单表达式，直接放行。
 */
export function isMultiStatement(value) {
  const v = value.trim()
  // 函数字面量（箭头 / function）整段是一个表达式，体内的分号与换行都合法
  if (/^(async\s+)?(\([^)]*\)|[\w$]+)\s*=>/.test(v)) return false
  if (/^(async\s+)?function\b/.test(v)) return false
  if (v.includes(';')) return true
  const assignLines = value.split('\n').filter((l) => ASSIGN_LINE.test(l))
  return assignLines.length >= 2
}

export function scanVueFiles(dir) {
  const out = []
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name)
      if (e.isDirectory()) walk(full)
      else if (e.name.endsWith('.vue')) out.push({ path: full, source: readFileSync(full, 'utf8') })
    }
  }
  walk(dir)
  return out
}

export function check(rootDir, exempt = {}) {
  const files = scanVueFiles(rootDir)
  const hits = []
  const usedExempt = new Set()
  for (const f of files) {
    for (const h of findMultiStatementAttrs(f.source)) {
      const rel = f.path.slice(rootDir.length + 1)
      const key = `${rel}:${h.line}`
      if (exempt[key]) {
        usedExempt.add(key)
        continue
      }
      hits.push({ file: rel, line: h.line, attr: h.attr, value: h.value })
    }
  }
  const staleExempt = Object.keys(exempt).filter((k) => !usedExempt.has(k))
  return { hits, staleExempt, scanned: files.length }
}
