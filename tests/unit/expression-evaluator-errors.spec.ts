/**
 * `expression-evaluator` · 错误路径与"非有限结果"（第 170 轮）
 *
 * 现状：语句 86% / 分支 77.1%，未覆盖的全是**错误分支与降级路径**——
 * 这类分支恰恰决定"公式写错时表单拿到什么值"。
 *
 * 重点：`evaluateFormula` 的结果会被 `useFormSchema`（初始值）与 `useFormLinkage`
 * 的 `followValue` **直接写进 formData**，最终随表单提交落库。因此非有限值
 * （`1/0` → Infinity、`0/0` → NaN）一旦流出，就会变成表单数据的一部分：
 *   · UI 上显示为 "Infinity" / "NaN"；
 *   · JSON.stringify 序列化后变成 **null**（静默丢值，后端无从分辨"空"与"算坏了"）。
 */
import { describe, it, expect } from 'vitest'
import { safeEvaluate, evaluateFormula, extractFields } from '@/components/form-builder/expression-evaluator'

describe('受限求值器 · 词法与语法错误必须抛出（不能静默返回怪值）', () => {
  it('非法数字字面量（单独的点、多点）→ 抛 invalid number', () => {
    expect(() => safeEvaluate('.')).toThrow(/invalid number/)
    expect(() => safeEvaluate('1.2.3')).toThrow(/invalid number/)
  })

  it('未闭合字符串 → 抛 unterminated string', () => {
    expect(() => safeEvaluate('"abc')).toThrow(/unterminated string/)
  })

  it('非法字符 → 抛 unexpected char', () => {
    expect(() => safeEvaluate('1 @ 2')).toThrow(/unexpected char/)
  })

  it('多余 token（缺运算符）→ 抛 trailing tokens', () => {
    expect(() => safeEvaluate('1 2')).toThrow(/trailing tokens/)
  })

  it('括号不配对 → 抛 unbalanced paren', () => {
    expect(() => safeEvaluate('(1 + 2')).toThrow(/unbalanced paren|unexpected end/)
  })

  it('表达式不完整（以运算符结尾）→ 抛 unexpected end', () => {
    expect(() => safeEvaluate('1 +')).toThrow(/unexpected end/)
  })

  it('对非数字取负 → 抛 negate non-number', () => {
    expect(() => safeEvaluate('-"abc"')).toThrow(/negate non-number/)
  })

  it('裸标识符（未知词）→ 抛错，不会被当成变量求值', () => {
    expect(() => safeEvaluate('foo + 1')).toThrow()
  })
})

describe('受限求值器 · null 字面量与真值判定', () => {
  it('null 字面量求值为 null', () => {
    expect(safeEvaluate('null')).toBeNull()
    expect(safeEvaluate('null == null')).toBe(true)
  })

  it('真值判定：null/undefined 为假，0 与 NaN 为假，空串为假，其余为真', () => {
    // 注意（第 170 轮实测）：本求值器的 && / || **返回布尔**，不是 JS 的"返回操作数"。
    // 这对 showHide（只看真值）没问题；但对 followValue（把结果写进字段值）来说，
    // 想表达"a 为空就取 b"的 {{a}} || {{b}} 会得到 true 而不是 b。
    // 这是既有语义选择，改动会影响已发布模板，已登记待确认（见审查报告 #225），此处锁现状。
    expect(safeEvaluate('null || 1')).toBe(true)
    expect(safeEvaluate('0 || 2')).toBe(true)
    expect(safeEvaluate('"" || 3')).toBe(true)
    expect(safeEvaluate('"x" && 1')).toBe(true)
    expect(safeEvaluate('0 && 1')).toBe(false)
  })

  it('布尔与字符串宽松相等：先走 String() 比较（"true" === "1" 为假）', () => {
    // looseEq 的分支顺序：字符串分支在布尔分支之前，所以布尔与字符串比较时
    // 用的是 String(a) === String(b)，而不是"两边取真值"。锁现状。
    expect(safeEvaluate('true == "1"')).toBe(false)
    expect(safeEvaluate('true == "true"')).toBe(true)
    expect(safeEvaluate('false == ""')).toBe(false)
  })
})

describe('受限求值器 · 比较的字符串回退', () => {
  it('两边都无法转数字时按字符串比较', () => {
    expect(safeEvaluate('"b" > "a"')).toBe(true)
    expect(safeEvaluate('"a" < "b"')).toBe(true)
    expect(safeEvaluate('"b" >= "b"')).toBe(true)
    expect(safeEvaluate('"a" <= "a"')).toBe(true)
  })

  it('一边是数字一边是非数字字符串 → 走字符串比较（语义陷阱，锁住现状）', () => {
    // Number('abc') 为 NaN → 落到 String 比较：'5' vs 'abc'
    expect(safeEvaluate('"abc" > 5')).toBe(true)
  })
})

describe('evaluateFormula · 占位符替换分支', () => {
  it('null/undefined 字段替换为空串字面量：乘法按 0，但加法走字符串拼接', () => {
    // '*' 会 Number('') = 0；'+' 走 add()：任一边非 number 就 String 拼接 → '' + 1 = '1'
    expect(evaluateFormula('{{a}} * 2', { a: null })).toBe(0)
    expect(evaluateFormula('{{a}} + 1', { a: null })).toBe('1')
    expect(evaluateFormula('{{a}} + 1', {})).toBe('1')
  })

  it('纯数字字符串按数字参与算术（"5" 不参与拼接）', () => {
    expect(evaluateFormula('{{a}} + 1', { a: '5' })).toBe(6)
  })

  it('布尔字段替换为 true/false 字面量', () => {
    expect(evaluateFormula('{{a}} == true', { a: true })).toBe(true)
  })

  it('对象值退化为其字符串形态（不抛错）', () => {
    // 对象走 JSON.stringify(String(val)) → '"[object Object]"'，与 "" 比较为 false
    expect(() => evaluateFormula('{{a}} == ""', { a: { x: 1 } as unknown as string })).not.toThrow()
    expect(evaluateFormula('{{a}} == ""', { a: { x: 1 } as unknown as string })).toBe(false)
  })

  it('extractFields 提取全部占位符且去重', () => {
    expect(extractFields('{{a}} + {{b}} * {{a}}')).toEqual(['a', 'b'])
  })

  it('公式语法错误 → 降级返回空串（falsy），绝不抛给调用方', () => {
    expect(evaluateFormula('{{a}} +', { a: 1 })).toBe('')
    expect(evaluateFormula('@ @', {})).toBe('')
  })
})

describe('evaluateFormula · **非有限结果不得流进表单数据**', () => {
  it('除零（1/0 → Infinity）不得作为字段值流出', () => {
    const v = evaluateFormula('{{price}} / {{qty}}', { price: 100, qty: 0 })
    expect(
      v,
      'Infinity 会写进 formData：UI 显示 "Infinity"，JSON.stringify 后变成 null（静默丢值）',
    ).not.toBe(Number.POSITIVE_INFINITY)
    expect(typeof v === 'number' ? Number.isFinite(v) : true, '任何数字结果都必须是有限值').toBe(true)
    expect(v, '应当退化为空串——返回 0 会假装"结果是零"，是另一种看着正常的假值').toBe('')
  })

  it('0/0（NaN）同样不得流出', () => {
    const v = evaluateFormula('{{a}} / {{b}}', { a: 0, b: 0 })
    expect(Number.isNaN(v as number), 'NaN 会写进 formData 并被序列化成 null').toBe(false)
    expect(v).toBe('')
  })

  it('非数字参与乘除（"abc" * 2 → NaN）不得流出', () => {
    const v = evaluateFormula('{{a}} * 2', { a: 'abc' })
    expect(Number.isNaN(v as number)).toBe(false)
  })

  it('取模 5 % 0（NaN）不得流出', () => {
    const v = evaluateFormula('{{a}} % {{b}}', { a: 5, b: 0 })
    expect(Number.isNaN(v as number)).toBe(false)
  })
})