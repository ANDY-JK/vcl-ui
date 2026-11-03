/**
 * 表单联动公式求值器 — 受限表达式解析（替代 new Function，杜绝代码注入）
 *
 * 只识别字面量（数字/字符串/布尔/null）与白名单运算符
 * （算术 + - * / %、比较 == != === !== > < >= <=、逻辑 and or && ||、括号、! 取反）。
 * 任何标识符、属性访问、函数调用都会抛错，由调用方降级为纯字符串拼接。
 *
 * 公式语法（见 useFormLinkage）：
 * - `{{fieldName}}` 替换为字段当前值
 * - 算术：`{{price}} * {{quantity}}`
 * - 条件：`{{status}} == 'active'`
 * - 拼接：`{{firstName}}{{lastName}}`
 */

import type { FormData } from './types'

type Tok =
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'bool'; value: boolean }
  | { kind: 'null' }
  | { kind: 'op'; value: string }

/**
 * 分词器能直接当作**数字字面量**读的字符串形态（第 184 轮）。
 *
 * 用它替代 `Number()` 判断"是否数值字符串"——`Number()` 太宽（认 1e5 / 0x1f / Infinity），
 * 宽出来的那些会被原样注入表达式并在分词阶段抛错，公式静默失效。
 *
 * ⚠️ 这里**故意**比 `tokenize` 的数字分支窄（不含指数形态）：
 * 用户输入的 `1e5` 是**文本**，替换成数字字面量会让"原样显示"变成 `100000`；
 * 而机器产出的 `number`（`String(1e-7) === '1e-7'`）必须能进分词器，否则整条公式静默失效（#401）。
 */
const NUMERIC_LITERAL_RE = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/

/** 从公式中提取依赖字段 key：`{{price}} * {{quantity}}` → ['price', 'quantity'] */
export function extractFields(formula: string): string[] {
  const regex = /\{\{(\w+)\}\}/g
  const fields: string[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(formula)) !== null) {
    if (!fields.includes(match[1])) fields.push(match[1])
  }
  return fields
}

/** 词法分析：只产出字面量 token 与运算符 token */
function tokenize(src: string): Tok[] {
  const tokens: Tok[] = []
  let i = 0
  const n = src.length
  while (i < n) {
    const ch = src[i]
    if (/\s/.test(ch)) {
      i++
      continue
    }
    // 数字字面量
    if (/[0-9.]/.test(ch)) {
      let j = i
      while (j < n && /[0-9.]/.test(src[j])) j++
      // 科学计数法（#401）：JS 把 |n| >= 1e21 或 < 1e-6 的 number 转成 '1e-7' / '1e+21' 形态，
      // 而这里原来只吃 [0-9.] —— 于是字段值是 number 时公式撞上标识符 e、抛错、**静默返回空**：
      // 用户看到"公式目标字段变空"，与第 184 轮（数字字符串）同一类症状，只是来源不同。
      // 只在 e/E 后面**确实跟着数字**时才吃（可选正负号）：'1e' 仍按标识符报错，不放宽白名单。
      if (src[j] === 'e' || src[j] === 'E') {
        const k = j + 1
        let m = src[k] === '+' || src[k] === '-' ? k + 1 : k
        let digits = 0
        while (m < n && /[0-9]/.test(src[m])) {
          m++
          digits++
        }
        if (digits > 0) j = m
      }
      const num = Number(src.slice(i, j))
      if (Number.isNaN(num)) throw new Error('invalid number')
      tokens.push({ kind: 'num', value: num })
      i = j
      continue
    }
    // 字符串字面量（单/双引号，支持转义：\" \' \\ \n \t \r）
    if (ch === '"' || ch === "'") {
      const quote = ch
      let j = i + 1
      let val = ''
      while (j < n && src[j] !== quote) {
        if (src[j] === '\\' && j + 1 < n) {
          const next = src[j + 1]
          // 标准转义解释；其余（含 \\）取字面下一字符
          val += next === 'n' ? '\n' : next === 't' ? '\t' : next === 'r' ? '\r' : next
          j += 2
          continue
        }
        val += src[j]
        j++
      }
      if (j >= n) throw new Error('unterminated string')
      tokens.push({ kind: 'str', value: val })
      i = j + 1
      continue
    }
    // 布尔/null/逻辑关键字（and/or）
    if (/[a-zA-Z]/.test(ch)) {
      let j = i
      while (j < n && /[a-zA-Z_]/.test(src[j])) j++
      const word = src.slice(i, j).toLowerCase()
      if (word === 'true') tokens.push({ kind: 'bool', value: true })
      else if (word === 'false') tokens.push({ kind: 'bool', value: false })
      else if (word === 'null') tokens.push({ kind: 'null' })
      else if (word === 'and') tokens.push({ kind: 'op', value: 'and' })
      else if (word === 'or') tokens.push({ kind: 'op', value: 'or' })
      else throw new Error(`unexpected identifier: ${word}`)
      i = j
      continue
    }
    // 多字符运算符优先（先匹配三字符，再二字符）
    const three = src.slice(i, i + 3)
    if (three === '!==' || three === '===') {
      tokens.push({ kind: 'op', value: three })
      i += 3
      continue
    }
    const two = src.slice(i, i + 2)
    if (['==', '!=', '>=', '<=', '&&', '||', '==='].includes(two)) {
      tokens.push({ kind: 'op', value: two })
      i += 2
      continue
    }
    if ('+-*/%()<>!'.includes(ch)) {
      tokens.push({ kind: 'op', value: ch })
      i++
      continue
    }
    throw new Error(`unexpected char: ${ch}`)
  }
  return tokens
}

function truthy(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v)
  if (typeof v === 'string') return v !== ''
  return true
}

function looseEq(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return a === b
  if (typeof a === 'string' || typeof b === 'string') return String(a) === String(b)
  if (typeof a === 'boolean' || typeof b === 'boolean') return truthy(a) === truthy(b)
  return a === b
}

function compareOp(op: string, a: unknown, b: unknown): boolean {
  if (op === '==') return looseEq(a, b)
  if (op === '!=') return !looseEq(a, b)
  if (op === '===') return a === b
  if (op === '!==') return a !== b
  const na = typeof a === 'number' ? a : Number(a)
  const nb = typeof b === 'number' ? b : Number(b)
  if (!Number.isNaN(na) && !Number.isNaN(nb)) {
    if (op === '>') return na > nb
    if (op === '<') return na < nb
    if (op === '>=') return na >= nb
    if (op === '<=') return na <= nb
  }
  const sa = String(a)
  const sb = String(b)
  if (op === '>') return sa > sb
  if (op === '<') return sa < sb
  if (op === '>=') return sa >= sb
  if (op === '<=') return sa <= sb
  throw new Error(`unknown operator: ${op}`)
}

class ExprParser {
  private pos = 0

  constructor(private tokens: Tok[]) {}

  parse(): unknown {
    const v = this.parseOr()
    if (this.pos < this.tokens.length) throw new Error('trailing tokens')
    return v
  }

  private peek(): Tok | undefined {
    return this.tokens[this.pos]
  }

  private isOp(...ops: string[]): boolean {
    const t = this.peek()
    return !!t && t.kind === 'op' && ops.includes(t.value)
  }

  private takeOp(): string {
    const t = this.tokens[this.pos++]
    if (t.kind === 'op') return t.value
    throw new Error('expected operator')
  }

  /**
   * 逻辑或 —— **返回操作数，不是布尔**（2026-11-01 对齐 JS/Excel 语义，TD-69 收口）
   *
   * 旧实现 `left = truthy(left) || truthy(right)` 一律返回 true/false。
   * 对 showHide（只看真值）无影响，但 followValue 会把结果**写进字段值**：
   * 用户写 `{{A}} 或 {{B}}` 想表达"A 为空就取 B"，得到的是 `true`。
   * 现在 `左真 → 返回左；左假 → 返回右`（与 JS `a || b` 一致，也与 Excel 的 IF 短路一致）。
   *
   * ⚠️ 右侧**始终解析**（解析无副作用）：token 必须消费完，否则 `a or b or c` 会漏读。
   */
  private parseOr(): unknown {
    let left = this.parseAnd()
    while (this.isOp('||', 'or')) {
      this.takeOp()
      const right = this.parseAnd()
      left = truthy(left) ? left : right
    }
    return left
  }

  /**
   * 逻辑与 —— **返回操作数，不是布尔**（同 parseOr，TD-69 收口）
   *
   * `a && b`：左假 → 返回左（假值本身，如 0 / '' / null）；左真 → 返回右。
   * 这样 `{{x}} 与 {{y}}` 在 x 为空时给出 ''（而不是 false），followValue 写进字段仍是"空"。
   */
  private parseAnd(): unknown {
    let left = this.parseCompare()
    while (this.isOp('&&', 'and')) {
      this.takeOp()
      const right = this.parseCompare()
      left = truthy(left) ? right : left
    }
    return left
  }

  private parseCompare(): unknown {
    let left = this.parseAdd()
    while (this.isOp('==', '!=', '===', '!==', '>', '<', '>=', '<=')) {
      left = compareOp(this.takeOp(), left, this.parseAdd())
    }
    return left
  }

  private parseAdd(): unknown {
    let left = this.parseMul()
    while (this.isOp('+', '-')) {
      const op = this.takeOp()
      const right = this.parseMul()
      left = op === '+' ? add(left, right) : sub(left, right)
    }
    return left
  }

  private parseMul(): unknown {
    let left = this.parseUnary()
    while (this.isOp('*', '/', '%')) {
      left = mulDiv(this.takeOp(), left, this.parseUnary())
    }
    return left
  }

  private parseUnary(): unknown {
    if (this.isOp('!')) {
      this.takeOp()
      return !truthy(this.parseUnary())
    }
    if (this.isOp('-')) {
      this.takeOp()
      const v = this.parseUnary()
      if (typeof v === 'number') return -v
      throw new Error('negate non-number')
    }
    return this.parsePrimary()
  }

  private parsePrimary(): unknown {
    const t = this.tokens[this.pos++]
    if (!t) throw new Error('unexpected end')
    if (t.kind === 'num' || t.kind === 'str' || t.kind === 'bool') {
      // 相邻字符串字面量拼接：{{a}}{{b}} 替换后产生 "x""y" 形态，拼接为一个字符串
      if (t.kind === 'str') {
        let val = t.value
        while (this.peek()?.kind === 'str') {
          val += (this.peek() as { kind: 'str'; value: string }).value
          this.pos++
        }
        return val
      }
      return t.value
    }
    if (t.kind === 'null') return null
    if (t.kind === 'op' && t.value === '(') {
      const v = this.parseOr()
      const close = this.tokens[this.pos++]
      if (!close || close.kind !== 'op' || close.value !== ')') throw new Error('unbalanced paren')
      return v
    }
    throw new Error('unexpected token')
  }
}

function add(a: unknown, b: unknown): unknown {
  if (typeof a === 'number' && typeof b === 'number') return a + b
  return String(a) + String(b)
}

function sub(a: unknown, b: unknown): number {
  return (typeof a === 'number' ? a : Number(a)) - (typeof b === 'number' ? b : Number(b))
}

function mulDiv(op: string, a: unknown, b: unknown): number {
  const na = typeof a === 'number' ? a : Number(a)
  const nb = typeof b === 'number' ? b : Number(b)
  if (op === '*') return na * nb
  if (op === '/') return na / nb
  return na % nb
}

/** 受限表达式安全求值：只支持字面量与白名单运算符（导出供单元测试） */
export function safeEvaluate(expr: string): unknown {
  return new ExprParser(tokenize(expr)).parse()
}

/**
 * 安全求值公式（无 eval / new Function）
 *
 * 1. 替换所有 `{{fieldName}}` 为字面量（字符串加引号包裹）
 * 2. 用受限求值器计算（算术 / 比较 / 逻辑 / 字符串拼接）
 * 3. 求值失败或结果为非有限值（Infinity/NaN）时返回空串（falsy），不把坏值交给表单
 */
export function evaluateFormula(formula: string, data: FormData): unknown {
  let expr = formula

  // 替换 {{fieldName}} 为实际值
  const fields = extractFields(formula)
  for (const f of fields) {
    const val = data[f]
    let replacement: string
    if (val === null || val === undefined) {
      replacement = '""'
    } else if (typeof val === 'string') {
      // 如果是纯数字字符串，直接替换为数字（用于算术）
      // 否则用 JSON.stringify 包裹——任意值（含反斜杠/引号/换行）都成为合法字符串字面量，
      // tokenize 不会因转义失衡抛错（旧实现手拼转义，值以 \ 结尾时求值失败走兜底）
      //
      // ⚠️ 第 184 轮：「是不是数字」必须用**分词器认得的字面量语法**判定，不能用 Number()。
      // Number() 认得 '1e5' / '0x1f' / 'Infinity' / '1E+06'，而 tokenize 只吃 [0-9.] 序列，
      // 原样注入会撞上标识符（e5 / x1f / infinity）→ 抛错 → 兜底返回 ''，
      // 表现为"公式静默失效、目标字段变空"（从 Excel 复制科学计数法数字是最常见触发路径）。
      // 这类值改走字符串字面量：显示原样保留，参与算术时由 mulDiv 的 Number() 强转。
      if (NUMERIC_LITERAL_RE.test(val)) {
        replacement = val
      } else {
        replacement = JSON.stringify(val)
      }
    } else if (typeof val === 'boolean') {
      replacement = String(val)
    } else if (typeof val === 'number') {
      replacement = String(val)
    } else {
      replacement = JSON.stringify(String(val))
    }
    // 替换所有 {{fieldName}} 出现（key 是 \w+，无需转义正则）
    expr = expr.replace(new RegExp(`\\{\\{${f}\\}\\}`, 'g'), replacement)
  }

  try {
    const result = safeEvaluate(expr)
    // 非有限结果不得流出（第 170 轮）。
    //
    // 为什么必须在这里挡：本函数的返回值会被 useFormSchema（formula 初始值）与
    // useFormLinkage 的 followValue **直接写进 formData**，随后随表单提交落库。
    // 而算术天然会产生非有限值——`{{price}} / {{qty}}` 在 qty=0 时是 Infinity，
    // `0/0` 与 `'abc' * 2` 是 NaN，`5 % 0` 也是 NaN。
    // 一旦流出：
    //   · 界面上显示 "Infinity" / "NaN"（用户看不懂，也改不掉）；
    //   · JSON.stringify(Infinity) === 'null'、JSON.stringify(NaN) === 'null'
    //     → 提交后后端只看到 null，「算坏了」与「没填」再也无法区分（静默丢值）。
    // 处理方式与语法错误同档：返回空串（falsy）。不返回 0——那会假装"结果是零"，
    // 是另一种看着正常的假值。
    if (typeof result === 'number' && !Number.isFinite(result)) return ''
    return result
  } catch {
    // 求值失败：降级为不可见条件不成立——返回空字符串（falsy），
    // 避免兜底产出 truthy 值使 showHide 恒真；纯拼接公式已由 parsePrimary
    // 的相邻字符串合并原生支持，正常不会走到这里
    return ''
  }
}

/**
 * 公式**语法体检**（TD-82 收口，2026-11-01）：只判"能不能解析"，不求值、不碰数据。
 *
 * ## 为什么需要
 *
 * `evaluateFormula` 对语法错误/非法字符/非有限结果一律兜底返回 `''`（这是正确的运行时
 * 选择：不能把坏值写进字段）。但**运行时静默**意味着用户配错公式后毫无反馈 ——
 * followValue 表现为"目标字段永远空"、showHide 表现为"字段永远隐藏"，两者都像"功能没生效"，
 * 用户会反复改别的配置，永远找不到根因。
 *
 * 设计器里已经有公式输入框（`PropsEventPage` 的 linkageFormula），所以这里提供一次
 * **dry-run**：把 `{{field}}` 换成合法字面量 `0` 跑一遍解析器，只判语法是否可解析。
 * 用 `0` 而不是空串：空串会让 `{{a}} + {{b}}` 变成 `+`（另一个语法错误），
 * 数字 `0` 对所有运算符位置都合法，能把"公式结构本身对不对"单独暴露出来。
 *
 * @returns null 表示语法可解析；否则返回可读的失败原因（给设计器提示用）
 */
export function checkFormulaSyntax(formula: string): { ok: true } | { ok: false; reason: string } {
  const trimmed = formula.trim()
  if (!trimmed) return { ok: false, reason: 'empty' }
  // 占位符换成 0：`{{a}}` 本身不是合法字面量（tokenize 只吃数字/字符串/布尔/null）
  const probe = trimmed.replace(/\{\{(\w+)\}\}/g, '0')
  try {
    const result = safeEvaluate(probe)
    // 语法可解析，但结果非有限（如 `0 / 0`）：这不是语法错误，是**数据相关**的运行时结果，
    // 不该在设计器里报红（用户填了非零数据就正常了）。
    void result
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, reason: msg }
  }
}
