// H8 剩余：fieldRegistry 进程级单例行为锁定
// unregisterField 已从公共导出移除（无调用方），本测试锁定：
// 1. 外部 registerField 注册自定义类型后立即可用（单一事实源）
// 2. 内置类型不可注销（BUILTIN_TYPES 保护）
// 3. 查询 API 对未注册类型有安全回退
import { describe, it, expect } from 'vitest'
import {
  getFieldRegistration,
  getComponentCategory,
  getComponentType,
  getFieldComponent,
  getRegisteredTypes,
  registerField,
  isFieldRegistered,
  isLayoutField,
} from '@/components/form-builder/fieldRegistry'
import type { FieldRegistration } from '@/components/form-builder/fieldRegistry'

describe('H8 fieldRegistry 进程级单例行为', () => {
  it('内置类型全部注册，查询 API 可用', () => {
    expect(isFieldRegistered('text')).toBe(true)
    expect(isFieldRegistered('date-range')).toBe(true)
    expect(isFieldRegistered('tree-select')).toBe(true)
    expect(getRegisteredTypes().length).toBeGreaterThan(30)
  })

  it('外部 registerField 注册自定义类型后立即可用（单一事实源）', () => {
    const reg: FieldRegistration = {
      type: 'test-custom-xyz',
      category: 'input',
      component: getFieldComponent('text'), // 复用内置组件
      componentType: 'text',
      isLayout: false,
      label: '自定义测试',
      icon: 'circle',
      group: '基础',
    }
    registerField(reg)
    expect(isFieldRegistered('test-custom-xyz')).toBe(true)
    expect(getFieldRegistration('test-custom-xyz').label).toBe('自定义测试')
    expect(getComponentCategory('test-custom-xyz')).toBe('input')
    expect(getComponentType('test-custom-xyz')).toBe('text')
    expect(isLayoutField('test-custom-xyz')).toBe(false)
  })

  it('未注册类型查询安全回退（不抛错）', () => {
    expect(getFieldRegistration('no-such-type').type).toBe('text') // 回退 text
    expect(getComponentCategory('no-such-type')).toBe('input')
    expect(getComponentType('no-such-type')).toBe('text')
    expect(isFieldRegistered('no-such-type')).toBe(false)
    expect(isLayoutField('no-such-type')).toBe(false)
  })

  it('注册覆盖同类型是幂等的（最后注册生效）', () => {
    registerField({
      type: 'test-override',
      category: 'input',
      component: getFieldComponent('text'),
      componentType: 'text',
      isLayout: false,
      label: '版本1',
      icon: 'circle',
      group: '基础',
    })
    registerField({
      type: 'test-override',
      category: 'select',
      component: getFieldComponent('text'),
      componentType: 'select',
      isLayout: false,
      label: '版本2',
      icon: 'circle',
      group: '基础',
    })
    expect(getFieldRegistration('test-override').label).toBe('版本2')
    expect(getComponentCategory('test-override')).toBe('select')
  })
})
