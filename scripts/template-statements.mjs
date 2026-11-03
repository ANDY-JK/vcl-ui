/**
 * 质量链闸口：模板表达式可编译性检查（#384 建，**#385 判据第四版：交给编译器**）
 *
 * ## 背景（#383）
 *
 * `@click="a = ''; b = ''"` 这种**多语句连写**在 Vue 模板表达式里是非法 JS，
 * Vite 在 dev server 按需编译到该页时才报 Internal server error ——
 * `vue-tsc` 不查、快链无 e2e，三道防线全漏，16 例 e2e 红。
 * eslint-plugin-vue v10 **没有** `no-multiple-template-statements` 规则（官方未收录），
 * 所以这里自建静态检查兜住。
 *
 * ## 判据四版演进（每一版都是被实测打出来的，别回到前一版）
 *
 * | 版 | 做法 | 被什么打回 |
 * | --- | --- | --- |
 * | 1 | 只查 `;` | 漏掉 #383 的真实形态（**换行分隔、无分号**），单测当场抓到 |
 * | 2 | 加「≥2 条赋值行」 | 误报 DataTableDemo 两例**合法箭头函数体**（`(v) => { a = 1; b = 2 }` 是单表达式） |
 * | 3 | 先判函数字面量、是则放行 | 实仓 163 个 `.vue` 全绿，但**只认赋值形态**：`@click="close()\nreset()"`（两条调用语句）、
 * `{{ a = 1; b = 2 }}`（插值里）都静默漏检（#385 实测） |
 * | 4 | **让 Vue 自己的编译器判**（`vue/compiler-sfc` 的 `compileTemplate` 错误） | —— |
 *
 * ## 为什么第四版要交给编译器
 *
 * 前三版都在**枚举"非法的形态"**，而合法与非法形态的边界由 Vue 编译器定义 ——
 * 自己枚举必然漏（#384 已经为「形态全集」付过一次代价）。改成问编译器：
 *
 * - **非法形态全集由编译器保证**，不再需要我们逐个补线索；
 * - 前一版的启发式**保留为快速定位**：它能给出 attr 名与原文（`@click="…"`），
 *   编译器只能给行列号与报错文案；两者按行去重，同一处只报一次；
 * - 顺带覆盖了另一个同类盲区：**`{{ }}` 插值**（此前只扫指令属性，插值整片没扫）。
 *
 * 依赖说明：`vue/compiler-sfc` 是 `vue` 自己的子路径导出（`vue` 已是 devDependency），
 * 不引入新依赖；只读源码、不执行、不建缓存。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { compileTemplate, parse } from 'vue/compiler-sfc'

/** 取错误文案首行（编译器的多行栈对闸口输出没意义） */
function errorMessage(err) {
  const raw = typeof err === 'string' ? err : String(err?.message ?? err)
  return raw.split('\n')[0].trim()
}

/** 取错误在**编译输入内**的起始位置（不同错误类型给 `loc` / `loc.start.{line,offset}`） */
function errorLoc(err) {
  const loc = typeof err === 'object' && err ? err?.loc?.start : undefined
  return { line: loc?.line, offset: loc?.offset }
}

/** 文件内绝对行号：按偏移数换行，比"模板相对行 + 起始行"更不容易算错（`<template>` 与内容不同行时尤其） */
function lineAt(source, offset) {
  return source.slice(0, offset).split('\n').length
}

/** `descriptor.template.loc.start.offset` 在不同版本上可能指标签起点或内容起点，这里做一次校验再定位 */
function templateContentOffset(source, template) {
  const base = template.loc.start.offset
  if (source.slice(base, base + template.content.length) === template.content) return base
  const idx = source.indexOf(template.content, base)
  return idx >= 0 ? idx : base
}

/**
 * 编译期判据（**权威**）：把 `<template>` 交给 Vue 编译器，收集它拒绝的表达式。
 *
 * 两个容易踩的点：
 *
 * 1. **必须真的收集 `errors`**：模板解析阶段就会逐个解析指令与插值里的表达式
 *    （实测与 `prefixIdentifiers` 无关，开不开都会报），所以默认选项够用；
 *    危险的是把收集结果丢掉 —— 负向对照 `template-stmt-drop-compile-errors` 锁的就是这一点。
 * 2. **只用 `compileTemplate`，不用 `parse()` 的 errors**：实测 compiler-sfc 会把同一个表达式错误
 *    同时塞进 SFC parse errors（两处报同一件事），而 parse errors 的行号口径是"模板相对"还是
 *    "文件相对"随错误类型而变 —— 两套口径混用必然算错行号。结构类错误（标签不配对）本来就由
 *    `vue-tsc` 拦，不属于本闸口的契约。
 *
 * @returns {Array<{line: number, message: string, kind: 'compile'}>}
 *          `line` 是**该 `.vue` 文件内的绝对行号**。
 */
export function findCompileErrors(source, filename = 'template.vue') {
  let template
  try {
    template = parse(source, { filename }).descriptor?.template
  } catch (e) {
    // SFC 本身解析不了（标签不配对等）：Vite 同样会炸，直接报在第 1 行
    return [{ line: 1, message: `SFC 解析失败：${errorMessage(e)}`, kind: 'compile' }]
  }
  if (!template) return []

  const startLine = template.loc.start.line
  let result
  try {
    result = compileTemplate({ source: template.content, filename, id: 'template-check' })
  } catch (e) {
    return [{ line: startLine, message: `模板编译失败：${errorMessage(e)}`, kind: 'compile' }]
  }

  const base = templateContentOffset(source, template)
  return (result.errors ?? []).map((e) => {
    const loc = errorLoc(e)
    // 首选按偏移换算（精确）；编译器不给 offset 时退回"起始行 + 模板相对行"
    const line =
      typeof loc.offset === 'number'
        ? lineAt(source, base + loc.offset)
        : startLine + (typeof loc.line === 'number' ? loc.line - 1 : 0)
    return { line, message: errorMessage(e), kind: 'compile' }
  })
}

/**
 * 指令属性（`@x` / `v-x`）的值里出现多语句的痕迹 —— **快速定位用，不是权威判据**。
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
 *
 * 已知盲区（第四版由编译器兜住，这里保留是为了"报得具体"）：
 * 两条调用语句、`x++` / `y += 1` 这类非 `=` 赋值、以及 `{{ }}` 插值里的多语句。
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

/**
 * 扫一个目录：启发式（定位具体）+ 编译器（权威）合并，**同一行只报一次**。
 *
 * 合并规则：同一行既有启发式又有编译错误时，保留启发式那条 —— 它带 attr 与原文，
 * 比"报错文案 + 行列号"更利于定位；编译器只在启发式没点到的行上补位。
 */
export function check(rootDir, exempt = {}) {
  const files = scanVueFiles(rootDir)
  const hits = []
  const usedExempt = new Set()
  for (const f of files) {
    const rel = f.path.slice(rootDir.length + 1)
    const perLine = new Map()
    for (const h of findMultiStatementAttrs(f.source)) perLine.set(h.line, { ...h, kind: 'heuristic' })
    for (const c of findCompileErrors(f.source, rel)) {
      if (perLine.has(c.line)) continue
      perLine.set(c.line, { line: c.line, attr: '(模板表达式)', value: c.message, kind: c.kind })
    }
    for (const h of [...perLine.values()].sort((a, b) => a.line - b.line)) {
      const key = `${rel}:${h.line}`
      if (exempt[key]) {
        usedExempt.add(key)
        continue
      }
      hits.push({ file: rel, line: h.line, attr: h.attr, value: h.value, kind: h.kind })
    }
  }
  const staleExempt = Object.keys(exempt).filter((k) => !usedExempt.has(k))
  return { hits, staleExempt, scanned: files.length }
}
