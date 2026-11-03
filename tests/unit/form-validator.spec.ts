// useFormValidator 行为锁定测试（form-builder 校验引擎）
import { describe, it, expect } from 'vitest'
import { ref } from 'vue'
import { validateField, validateAll, validators, useFormValidator } from '@/components/form-builder/useFormValidator'
import type { FormField, FormSchema, FormData } from '@/components/form-builder/types'

function field(type: string, key: string, extra: Record<string, unknown> = {}): FormField {
  return { type, key, label: key, props: {}, ...extra } as FormField
}

describe('validateField', () => {
  it('required 空值报错（label 带入提示）', () => {
    const f = field('text', 'name', { required: true, label: '姓名' })
    expect(validateField(f, '', {})).toBeTruthy() // 非空错误信息
    expect(validateField(f, '张三', {})).toBe('')
  })

  it('required 数组空值（checkbox 未选）报错', () => {
    const f = field('checkbox', 'tags', { required: true })
    expect(validateField(f, [], {})).toBeTruthy()
    expect(validateField(f, ['a'], {})).toBe('')
  })

  it('required 时 0 / false 是合法值（不误报）', () => {
    expect(validateField(field('number', 'n', { required: true }), 0, {})).toBe('')
    expect(validateField(field('switch', 's', { required: true }), false, {})).toBe('')
  })

  it('rules 简单签名：(v: string) => string | undefined', () => {
    const f = field('text', 'phone', { rules: [validators.phone()] })
    expect(validateField(f, '123', {})).toBeTruthy() // 无效手机号
    expect(validateField(f, '13800138000', {})).toBe('')
  })

  it('rules 上下文签名：(v, data) => string | undefined（函数 length>=2）', () => {
    const f = field('text', 'confirm', {
      rules: [(v: unknown, data: FormData) => (v !== data.password ? '两次密码不一致' : undefined)],
    })
    expect(validateField(f, '123', { password: '456' })).toBe('两次密码不一致')
    expect(validateField(f, '456', { password: '456' })).toBe('')
  })

  it('rules 对象声明：needsRaw=true 时 fn 收到原始值（数组不再被转成字符串）', () => {
    const f = field('checkbox', 'tags', {
      rules: [{ needsRaw: true, fn: (v: unknown) => (Array.isArray(v) && v.length >= 2 ? undefined : '至少两项') }],
    })
    expect(validateField(f, ['a'], {})).toBe('至少两项')
    expect(validateField(f, ['a', 'b'], {})).toBe('')
  })

  it('rules 对象声明：needsRaw 缺省时 fn 收到字符串值', () => {
    const f = field('text', 'name', {
      rules: [{ fn: (v: unknown) => (typeof v === 'string' && v === 'abc' ? undefined : '必须是 abc') }],
    })
    expect(validateField(f, 'abc', {})).toBe('')
    expect(validateField(f, 'ab', {})).toBe('必须是 abc')
  })

  it('minSelect 经校验引擎生效（旧实现收到字符串，恒失败）', () => {
    const f = field('checkbox', 'tags', { rules: [validators.minSelect(2, '标签')] })
    expect(validateField(f, ['a'], {})).toBeTruthy()
    expect(validateField(f, ['a', 'b'], {})).toBe('')
  })

  it('纯布局字段（divider）跳过校验', () => {
    expect(validateField(field('divider', 'd', { required: true }), null, {})).toBe('')
  })

  it('不可见字段（visibleWhen 不满足）跳过校验', () => {
    const f = field('text', 'x', { required: true, visibleWhen: { field: 'type', equals: 'a' } })
    expect(validateField(f, '', { type: 'b' })).toBe('') // 不可见 → 通过
    expect(validateField(f, '', { type: 'a' })).toBeTruthy() // 可见 → 必填报错
  })

  it('requiredOnly 模式跳过 rules', () => {
    const f = field('text', 'phone', { required: true, rules: [validators.phone()] })
    expect(validateField(f, '123', {}, true)).toBe('') // 非空即过，不查格式
  })
})

describe('validateAll', () => {
  it('返回 errors / isValid / firstErrorKey', () => {
    const fields = [
      field('text', 'a', { required: true }),
      field('text', 'b', { required: true }),
      field('divider', 'd'),
    ]
    const result = validateAll(fields, { a: 'ok', b: '' })
    expect(result.isValid).toBe(false)
    expect(result.errors.b).toBeTruthy()
    expect(result.errors.a).toBeUndefined()
    expect(result.firstErrorKey).toBe('b')
  })

  it('全部通过时 isValid = true', () => {
    const fields = [field('text', 'a', { required: true })]
    expect(validateAll(fields, { a: 'x' }).isValid).toBe(true)
  })
})

describe('validators 工厂', () => {
  it('minLen / maxLen', () => {
    expect(validators.minLen(3)('ab')).toBeTruthy()
    expect(validators.minLen(3)('abc')).toBeUndefined()
    expect(validators.maxLen(2)('abc')).toBeTruthy()
    expect(validators.maxLen(2)('ab')).toBeUndefined()
  })

  it('phone / email / idCard / url 格式校验', () => {
    expect(validators.phone()('13800138000')).toBeUndefined()
    expect(validators.phone()('123')).toBeTruthy()
    expect(validators.email()('a@b.com')).toBeUndefined()
    expect(validators.email()('not-an-email')).toBeTruthy()
    expect(validators.url()('https://example.com')).toBeUndefined()
    expect(validators.url()('not-a-url')).toBeTruthy()
  })

  it('minVal / maxVal / range 数值校验', () => {
    expect(validators.minVal(10)('5')).toBeTruthy()
    expect(validators.minVal(10)('15')).toBeUndefined()
    expect(validators.maxVal(100)('200')).toBeTruthy()
    expect(validators.range(1, 10)('20')).toBeTruthy()
    expect(validators.range(1, 10)('5')).toBeUndefined()
  })

  it('minSelect：多选至少选 N 项', () => {
    const rule = validators.minSelect(2)
    expect(typeof rule).toBe('object')
    expect(rule.fn(['a'], {})).toBeTruthy()
    expect(rule.fn(['a', 'b'], {})).toBeUndefined()
  })
})

describe('useFormValidator composable', () => {
  it('validate / validateOne / clearErrors / clearError', () => {
    const schema = ref<FormSchema>({ fields: [field('text', 'name', { required: true })] })
    const data = ref<FormData>({ name: '' })
    const v = useFormValidator(schema, data)

    // 全量校验失败
    expect(v.validate()).toBe(false)
    expect(v.errors.value.name).toBeTruthy()

    // 修复后 validateOne 通过并清除错误
    data.value = { name: '张三' }
    expect(v.validateOne('name')).toBe(true)
    expect(v.errors.value.name).toBeUndefined()

    // clearError
    v.validate()
    v.clearError('name')
    expect(v.errors.value.name).toBeUndefined()

    // clearErrors
    v.validate()
    v.clearErrors()
    expect(v.errors.value).toEqual({})
  })
})
/* ════════════════════════════════════════
 * 字数校验按「用户感知字符」（#278）
 *
 * 旧实现用 `v.length`（UTF-16 码元）：`'😀'.length === 2`。两个方向都错：
 *   ① minLen 被绕过 —— 3 个 emoji 的 .length 是 6，能通过「至少 5 个字」；
 *   ② maxLen 过早拦住 —— 限 10 个字，输到第 6 个 emoji 就报"超过 10 个字符"。
 * ════════════════════════════════════════ */
describe('字数校验按 grapheme 计数', () => {
  it('**minLen 不能被 emoji 绕过**：3 个 emoji（.length=6）不该通过「至少 5 个字」', () => {
    const rule = validators.minLen(5)
    expect(rule('😀😀😀'), '旧实现长度为 6 会误判通过').toBeTruthy()
    expect(rule('张三丰'), '3 个中文字同样不通过').toBeTruthy()
    expect(rule('张三丰是道'), '5 个中文字通过').toBeUndefined()
    expect(rule('😀😀😀😀😀'), '5 个 emoji 通过').toBeUndefined()
  })

  it('**maxLen 不因 emoji 提前拦截**：限 5 个字，5 个 emoji 应通过', () => {
    const rule = validators.maxLen(5)
    expect(rule('😀😀😀😀😀'), '旧实现长度 10 会误报超限').toBeUndefined()
    expect(rule('😀😀😀😀😀😀'), '6 个才该报').toBeTruthy()
    expect(rule('张三丰是道'), '5 个中文字通过').toBeUndefined()
  })

  it('组合 emoji（ZWJ）算 1 个字', () => {
    const family = '👨‍👩‍👧‍👦'
    expect(validators.maxLen(2)(family + family), '2 个组合 emoji 不算超限').toBeUndefined()
    expect(validators.minLen(2)(family + family), '2 个组合 emoji 够数').toBeUndefined()
  })

  it('空值/脏值不抛错（校验器不因入参形态崩）', () => {
    expect(validators.minLen(1)(undefined as never)).toBeTruthy()
    expect(validators.maxLen(5)(undefined as never)).toBeUndefined()
    expect(validators.minLen(1)(''), '空串不足 1 字').toBeTruthy()
  })
})
/* ════════════════════════════════════════
 * firstErrorKey：校验器算出来的"首个错误字段"必须暴露给宿主（#291）
 *
 * `validateAll()` 一直返回 firstErrorKey，但 `validate()` 把它丢了，
 * 宿主只好自己再扫一遍 errors 找第一个 —— 同一语义两处实现。
 * ════════════════════════════════════════ */
describe('useFormValidator · firstErrorKey', () => {
  const fields = [
    { key: 'a', type: 'text', label: 'A', required: true },
    { key: 'b', type: 'text', label: 'B', required: true },
    { key: 'c', type: 'text', label: 'C' },
  ] as never

  it('**validate() 后暴露首个错误字段**（按字段顺序，不是对象键顺序）', () => {
    const data = ref<Record<string, unknown>>({ a: '', b: '', c: '' })
    const v = useFormValidator(ref({ fields }) as never, data as never, {})
    expect(v.firstErrorKey.value).toBe(null)
    expect(v.validate()).toBe(false)
    expect(v.firstErrorKey.value).toBe('a')
  })

  it('只有后面的字段错时，指向那一个', () => {
    const data = ref<Record<string, unknown>>({ a: 'ok', b: '', c: '' })
    const v = useFormValidator(ref({ fields }) as never, data as never, {})
    v.validate()
    expect(v.firstErrorKey.value).toBe('b')
  })

  it('全部通过时为 null，且 clearErrors 会重置', () => {
    const data = ref<Record<string, unknown>>({ a: 'ok', b: 'ok', c: '' })
    const v = useFormValidator(ref({ fields }) as never, data as never, {})
    expect(v.validate()).toBe(true)
    expect(v.firstErrorKey.value).toBe(null)

    const bad = ref<Record<string, unknown>>({ a: '', b: '', c: '' })
    const v2 = useFormValidator(ref({ fields }) as never, bad as never, {})
    v2.validate()
    expect(v2.firstErrorKey.value).toBe('a')
    v2.clearErrors()
    expect(v2.firstErrorKey.value).toBe(null)
  })
})
describe('validators.pattern · 有状态正则（#397）', () => {
  it('**带 g 标志的正则重复校验同一合法值，结果必须一致**', () => {
    const rule = validators.pattern(/^\d+$/g, '只能数字')
    // test() 会推进 lastIndex：不复位时第二次校验会失败，用户看到「合法输入被判非法」
    expect(rule('123'), '第 1 次').toBeUndefined()
    expect(rule('123'), '第 2 次（修复前这里会返回错误）').toBeUndefined()
    expect(rule('123'), '第 3 次').toBeUndefined()
  })

  it('带 y（sticky）标志同样不受 lastIndex 影响', () => {
    const rule = validators.pattern(/^abc/y, 'sticky')
    expect(rule('abc')).toBeUndefined()
    expect(rule('abc')).toBeUndefined()
  })

  it('非法值仍然被拦（修复不能把判据一起放过）', () => {
    const rule = validators.pattern(/^\d+$/g, '只能数字')
    expect(rule('abc')).toBe('只能数字')
    expect(rule('abc')).toBe('只能数字')
    expect(rule('123')).toBeUndefined()
    expect(rule('abc')).toBe('只能数字')
  })

  it('空值不报错（交给 required 处理）', () => {
    const rule = validators.pattern(/^\d+$/g, '只能数字')
    expect(rule('')).toBeUndefined()
  })
})