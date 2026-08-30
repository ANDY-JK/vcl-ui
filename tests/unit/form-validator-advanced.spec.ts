// P1-7 高级字段专项校验行为锁定测试
// 覆盖：richtext 最小字数 / matrix 必填行数 / signature 必签 / serial 只读不校验
import { describe, it, expect } from 'vitest'
import { validateField } from '@/components/form-builder/useFormValidator'
import type { FormField } from '@/components/form-builder/types'

function field(type: string, key: string, extra: Record<string, unknown> = {}): FormField {
  return { type, key, label: key, props: {}, ...extra } as FormField
}

describe('高级字段专项校验', () => {
  it('richtext required 空 HTML 报错（HTML 标签不计入字符）', () => {
    const f = field('richtext', 'rt', { required: true, label: '备注' })
    expect(validateField(f, '', {})).toBeTruthy()
    // 只有 <p><br></p> 等空结构 → 无文本内容 → 视为空
    expect(validateField(f, '<p><br></p>', {})).toBeTruthy()
    expect(validateField(f, '<p>有内容</p>', {})).toBe('')
  })

  it('richtext 最小字数（richtextMinChars）：去标签后字符数不足报错', () => {
    const f = field('richtext', 'rt', { props: { richtextMinChars: 5 } })
    expect(validateField(f, '<p>abc</p>', {})).toBeTruthy()
    expect(validateField(f, '<p>abcde</p>', {})).toBe('')
    expect(validateField(f, '<p><b>abcdef</b></p>', {})).toBe('')
    // 未配置最小字数 → 不校验
    expect(validateField(field('richtext', 'rt2'), '<p>a</p>', {})).toBe('')
  })

  it('matrix 必填行数（matrixMinRows）：已评分行数不足报错', () => {
    const f = field('matrix', 'm', { props: { matrixMinRows: 2 } })
    // 空值（未评分）→ 报错
    expect(validateField(f, {}, {})).toBeTruthy()
    expect(validateField(f, null, {})).toBeTruthy()
    // 只评了 1 行 → 报错
    expect(validateField(f, { 服务态度: '满意' }, {})).toBeTruthy()
    // 评满 2 行 → 通过
    expect(validateField(f, { 服务态度: '满意', 专业能力: '一般' }, {})).toBe('')
    // 未配置必填行数 → 不校验
    expect(validateField(field('matrix', 'm2'), {}, {})).toBe('')
  })

  it('signature 必签（signatureRequired）：未签名（空字符串）报错', () => {
    const f = field('signature', 'sig', { props: { signatureRequired: true } })
    expect(validateField(f, '', {})).toBeTruthy()
    expect(validateField(f, null, {})).toBeTruthy()
    // 已签名（dataURL）→ 通过
    expect(validateField(f, 'data:image/png;base64,xxx', {})).toBe('')
    // 未配置 signatureRequired → 不校验
    expect(validateField(field('signature', 'sig2'), '', {})).toBe('')
  })

  it('serial 只读流水号：required 不强制（挂载时自动生成，不拦截提交）', () => {
    // serial 字段不参与必填校验（值为空但提交前自动生成）
    expect(validateField(field('serial', 'sn', { required: true }), null, {})).toBe('')
  })
})
