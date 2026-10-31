import { describe, it, expect } from 'vitest'
import { safeEvaluate, evaluateFormula, extractFields, checkFormulaSyntax } from '@/components/form-builder/expression-evaluator'

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

  it('**"Number 认、分词器不认"的数值字符串不得被静默丢空**（第 184 轮）', () => {
    // 判"是否数值字符串"用的是 Number(val)，而分词器只接受 [0-9.] 字面量。
    // 于是 1e5 / 0x1f / Infinity / 1E+06 这些 Number() 认得的写法被**原样注入**表达式，
    // 分词时撞上标识符（e5 / x1f / infinity）→ 抛错 → evaluateFormula 兜底返回 ''。
    // 真实场景：从 Excel 复制科学计数法（1E+06）粘进字段，联动公式失效、目标字段变空。
    const cases: Array<[string, string, unknown]> = [
      // [输入, 纯占位符期望, 参与 *2 的期望]
      ['1e5', '1e5', 200000],
      ['1E+06', '1E+06', 2000000],
      ['0x1f', '0x1f', 62],
      // Infinity 参与算术的结果是非有限值，按第 170 轮契约必须被拦成空串（不得流出）
      ['Infinity', 'Infinity', ''],
    ]
    for (const [input, shown, arith] of cases) {
      expect(evaluateFormula('{{x}}', { x: input }), `纯占位符：${input}`).toBe(shown)
      // 参与算术时仍应算得出数（分词器认不出就当字符串，由 mulDiv 的 Number() 强转）
      expect(evaluateFormula('{{x}} * 2', { x: input }), `参与算术：${input}`).toBe(arith)
    }
    // 普通数值字符串仍是数字（不走字符串路径，避免改变既有类型语义）
    expect(evaluateFormula('{{x}}', { x: '42' })).toBe(42)
    expect(evaluateFormula('{{x}}', { x: '-5' })).toBe(-5)
  })

  it('值含反斜杠（含以 \\ 结尾）不破坏求值——条件比较原样参与', () => {
    // 旧实现手拼转义：值 "a\" 产生 "a"" → tokenize 抛错走兜底 → truthy 字符串 showHide 恒真
    // 匹配含反斜杠的值：公式字面量用双引号 + \\ 转义（JSON.stringify 替换值同形态）
    expect(evaluateFormula('{{x}} == "a\\\\"', { x: 'a\\' })).toBe(true)
    expect(evaluateFormula('{{x}} == "a\\\\"', { x: 'b\\' })).toBe(false)
    expect(evaluateFormula('{{x}}', { x: 'a\\' })).toBe('a\\')
  })

  it('值含引号/换行时条件比较不受影响', () => {
    expect(evaluateFormula('{{x}} == \'say "hi"\'', { x: 'say "hi"' })).toBe(true)
    // 公式字面量内的 \n 转义序列与 JSON.stringify 产出的形态一致
    expect(evaluateFormula('{{x}} == "a\\nb"', { x: 'a\nb' })).toBe(true)
    expect(evaluateFormula('{{x}}', { x: 'a\nb' })).toBe('a\nb')
  })

  it('相邻字符串拼接由解析器原生支持（不依赖兜底）', () => {
    expect(evaluateFormula('{{first}}{{last}}', { first: '张', last: '三' })).toBe('张三')
    // 含转义字符的值拼接同样原样保留
    expect(evaluateFormula('{{a}}{{b}}', { a: 'x\\', b: 'y"' })).toBe('x\\y"')
  })
})

// ════════════════════════════════════════
// TD-82：公式语法体检（设计器 dry-run，运行时静默兜底的补偿）
// ════════════════════════════════════════
describe('checkFormulaSyntax · 只判语法可解析，不求值', () => {
  it('合法公式 → ok（含占位符、运算符、括号、字符串）', () => {
    for (const f of [
      '{{a}} + {{b}}',
      '{{a}} * 2',
      '{{a}} || {{b}}',
      '{{a}} == "yes"',
      '({{a}} + 1) * 2',
      '{{a}} > 10 && {{b}} < 5',
      '"前缀" + {{a}}',
      '1 < 2 and 2 < 3',
    ]) {
      expect(checkFormulaSyntax(f), `${f} 应判可解析`).toEqual({ ok: true })
    }
  })

  it('写错的公式 → ok:false 并带原因（此前运行时只会静默返回空串）', () => {
    // 这些形态实测在运行时都返回 ''（followValue 表现为"目标字段永远空"）
    for (const f of ['{{a}} @ 2', '{{a}} * ', '{{a}} +', '({{a}}', '{{a}} )', '{{a}} == ']) {
      const v = checkFormulaSyntax(f)
      expect(v.ok, `${f} 应判语法错误`).toBe(false)
      expect((v as { reason: string }).reason.length, '应带可读原因').toBeGreaterThan(0)
    }
  })

  it('空/纯空白公式 → ok:false reason=empty（设计器侧另行判断是否展示）', () => {
    expect(checkFormulaSyntax('')).toEqual({ ok: false, reason: 'empty' })
    expect(checkFormulaSyntax('   ')).toEqual({ ok: false, reason: 'empty' })
  })

  it('语法合法但数据相关的结果（如 0/0）不判错 —— 那是运行时的事', () => {
    // 关键区分：语法可解析 ≠ 求值结果有限。用户填了非零数据就正常，不该在设计器报红。
    expect(checkFormulaSyntax('0 / 0'), '0/0 语法没问题').toEqual({ ok: true })
    expect(checkFormulaSyntax('{{a}} / {{b}}'), '除法语法没问题').toEqual({ ok: true })
  })

  it('占位符换成 0 而不是空串（空串会让 `{{a}} + {{b}}` 变成 `+` 假错）', () => {
    expect(checkFormulaSyntax('{{a}} + {{b}}'), '加号两侧有操作数').toEqual({ ok: true })
  })
})