// 新字段的**形态**校验（2026-10-19）
//
// 立此存照的问题：`isEmptyValue` 只回答"空不空"，不回答"对不对"。
//   · map-picker 收到 `{ foo: 1 }` 是非空对象 → 会被当成"已选点"放行，
//     提交后就得到一条**没有坐标**的记录；
//   · toggle-list 收到 `"a,b"` 是非空字符串 → 会被当成"选了东西"放行，
//     而消费侧拿到的不是 id 数组。
//
// 设计口径：只拦"填错了"，不拦"没填"（没填由 required 决定）。
// 这样非必填字段留空仍然能提交，而填了错形态才报错。
import { describe, it, expect } from 'vitest'
import { validateField } from '@/components/form-builder/useFormValidator'
import type { FormField } from '@/components/form-builder/types'

const mapPicker = (over: Partial<FormField> = {}): FormField =>
  ({ key: 'pos', label: '取货位置', type: 'map-picker', ...over }) as FormField
const toggleList = (over: Partial<FormField> = {}): FormField =>
  ({ key: 'enabled', label: '启用门店', type: 'toggle-list', ...over }) as FormField

describe('map-picker 形态校验', () => {
  it('合法坐标通过', () => {
    expect(validateField(mapPicker(), { lng: 116.4, lat: 39.9 }, {})).toBe('')
    expect(validateField(mapPicker({ required: true }), { lng: 0, lat: 0 }, {})).toBe('')
  })

  it('**非空但形态不对** → 报错（这正是 isEmptyValue 放行的那类值）', () => {
    for (const bad of [{ foo: 1 }, { lng: 116 }, { lat: 39 }, { lng: '116', lat: '39' }, [116, 39], '116,39']) {
      expect(validateField(mapPicker(), bad, {}), `${JSON.stringify(bad)} 应被拦`).toBeTruthy()
    }
  })

  it('没填（undefined/null/空对象）不因形态报错——由 required 决定', () => {
    expect(validateField(mapPicker(), undefined, {})).toBe('')
    expect(validateField(mapPicker(), null, {})).toBe('')
    // 空对象走的也是 required 那条路（isEmptyValue 判空）
    expect(validateField(mapPicker({ required: true }), {}, {})).toBeTruthy() // 必填为空
    expect(validateField(mapPicker(), {}, {})).toBe('') // 非必填为空 → 放行
  })
})

describe('toggle-list 形态校验', () => {
  it('id 数组通过（含空数组）', () => {
    expect(validateField(toggleList(), ['a', 'c'], {})).toBe('')
    expect(validateField(toggleList({ required: true }), ['a'], {})).toBe('')
    expect(validateField(toggleList(), [], {})).toBe('')
  })

  it('非数组 → 报错（"a,b" 这类字符串曾被当成"选了东西"放行）', () => {
    for (const bad of ['a,b', 1, { a: 1 }, { 0: 'a' }]) {
      expect(validateField(toggleList(), bad, {}), `${JSON.stringify(bad)} 应被拦`).toBeTruthy()
    }
  })

  it('必填 + 空数组 → 报必填错（不是形态错）', () => {
    const msg = validateField(toggleList({ required: true }), [], {})
    expect(msg).toBeTruthy()
  })
})

describe('不影响其它字段', () => {
  it('普通文本字段仍按原语义（空串=空，有值=通过）', () => {
    const f = { key: 'n', label: '姓名', type: 'text', required: true } as FormField
    expect(validateField(f, '', {})).toBeTruthy()
    expect(validateField(f, '张三', {})).toBe('')
  })
})
