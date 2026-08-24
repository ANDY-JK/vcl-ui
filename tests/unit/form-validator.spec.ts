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
    expect(validators.minSelect(2)(['a'])).toBeTruthy()
    expect(validators.minSelect(2)(['a', 'b'])).toBeUndefined()
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
