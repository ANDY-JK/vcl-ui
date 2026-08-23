import { describe, it, expect, afterEach } from 'vitest'
import { setLocale } from '@/components/_internal/i18n'
import { validators } from '@/components/form-builder/useFormValidator'

describe('useFormValidator 国际化', () => {
  afterEach(() => setLocale('zh-CN'))

  it('中文默认校验错误', () => {
    setLocale('zh-CN')
    expect(validators.phone()('abc')).toBe('请输入正确的手机号')
    expect(validators.email()('abc')).toBe('请输入正确的邮箱地址')
    expect(validators.minLen(3, '姓名')('ab')).toBe('姓名至少 3 个字符')
  })

  it('英文校验错误', () => {
    setLocale('en-US')
    expect(validators.phone()('abc')).toBe('Please enter a valid phone number')
    expect(validators.email()('abc')).toBe('Please enter a valid email address')
    expect(validators.minLen(3, 'Name')('ab')).toBe('Name must be at least 3 characters')
  })
})
