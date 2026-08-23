import { describe, it, expect } from 'vitest'
import { safeEvaluate, evaluateFormula, extractFields } from '@/components/form-builder/expression-evaluator'

describe('expression-evaluator · 受限表达式求值器', () => {
  describe('算术运算', () => {
    it('加减乘除', () => {
      expect(safeEvaluate('10 + 5 * 2')).toBe(20)
      expect(safeEvaluate('(1 + 2) * 3')).toBe(9)
      expect(safeEvaluate('10 - 3')).toBe(7)
      expect(safeEvaluate('10 / 4')).toBe(2.5)
      expect(safeEvaluate('10 % 3')).toBe(1)
    })

    it('负数与取反', () => {
      expect(safeEvaluate('-5 + 10')).toBe(5)
      expect(safeEvaluate('-(2 + 3)')).toBe(-5)
    })

    it('运算符优先级', () => {
      expect(safeEvaluate('2 + 3 * 4')).toBe(14)
      expect(safeEvaluate('(2 + 3) * 4')).toBe(20)
    })
  })

  describe('比较运算', () => {
    it('数值比较', () => {
      expect(safeEvaluate('5 > 3')).toBe(true)
      expect(safeEvaluate('5 < 3')).toBe(false)
      expect(safeEvaluate('5 >= 5')).toBe(true)
      expect(safeEvaluate('5 <= 4')).toBe(false)
    })

    it('字符串比较（宽松相等）', () => {
      expect(safeEvaluate('"a" == "a"')).toBe(true)
      expect(safeEvaluate('"a" != "b"')).toBe(true)
      expect(safeEvaluate('"10" == 10')).toBe(true)
    })

    it('严格相等', () => {
      expect(safeEvaluate('10 === 10')).toBe(true)
      expect(safeEvaluate('"10" === 10')).toBe(false)
      expect(safeEvaluate('1 !== 2')).toBe(true)
    })
  })

  describe('逻辑运算', () => {
    it('and / or 关键字', () => {
      expect(safeEvaluate('1 < 2 and 2 < 3')).toBe(true)
      expect(safeEvaluate('1 > 2 or 2 < 3')).toBe(true)
    })

    it('&& / || 符号', () => {
      expect(safeEvaluate('true && false')).toBe(false)
      expect(safeEvaluate('true || false')).toBe(true)
    })

    it('! 取反', () => {
      expect(safeEvaluate('!false')).toBe(true)
      expect(safeEvaluate('!0')).toBe(true)
    })
  })

  describe('字符串拼接', () => {
    it('字符串相加', () => {
      expect(safeEvaluate('"张" + "三"')).toBe('张三')
    })

    it('数字与字符串相加退化为拼接', () => {
      expect(safeEvaluate('"id" + 1')).toBe('id1')
    })
  })

  describe('注入防护（安全核心）', () => {
    it.each([
      '{{x}}; process.exit(1)',
      '{{x}}); alert(1)',
      '{{x}} && globalThis.location',
      'constructor.constructor("return 1")()',
      'window["alert"](1)',
      '{{x}} || (function(){return 1})()',
      'import("fs")',
      'this.constructor',
      'a.b',
      'obj.method()',
    ])('阻止注入：%s', (payload) => {
      // safeEvaluate 应抛错（非法标识符/字符），绝不执行任意代码
      expect(() => safeEvaluate(payload)).toThrow()
    })
  })
})

describe('evaluateFormula · 字段占位符替换', () => {
  it('提取依赖字段', () => {
    expect(extractFields('{{price}} * {{quantity}}')).toEqual(['price', 'quantity'])
    expect(extractFields('{{a}} + {{a}}')).toEqual(['a'])
    expect(extractFields('无占位符')).toEqual([])
  })

  it('算术：price * quantity', () => {
    expect(evaluateFormula('{{price}} * {{quantity}}', { price: 10, quantity: 5 })).toBe(50)
  })

  it('条件：status == active', () => {
    expect(evaluateFormula("{{status}} == 'active'", { status: 'active' })).toBe(true)
    expect(evaluateFormula("{{status}} == 'active'", { status: 'inactive' })).toBe(false)
  })

  it('字符串拼接：姓名', () => {
    expect(evaluateFormula('{{first}}{{last}}', { first: '张', last: '三' })).toBe('张三')
  })

  it('空值参与算术退化为 0（与原 new Function 语义一致）', () => {
    // {{x}} 未定义 → 替换为 "" → "" * 2 === 0
    expect(evaluateFormula('{{x}} * 2', {})).toBe(0)
  })

  it('注入的字段值不会被当作代码执行', () => {
    const result = evaluateFormula('{{x}}', { x: 'process.exit(1)' })
    expect(result).not.toBeUndefined()
    expect(typeof result).toBe('string')
  })
})
