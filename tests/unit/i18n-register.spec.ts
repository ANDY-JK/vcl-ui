import { describe, it, expect, afterEach } from 'vitest'
import { setLocale, registerMessages, useT, getLocale } from '@/components/_internal/i18n'

const t = useT()

describe('registerMessages 外部项目补充文案', () => {
  afterEach(() => setLocale('zh-CN'))

  it('覆盖内置同 key 文案（项目优先）', () => {
    registerMessages({
      'zh-CN': { common: { confirm: '项目自定义确认' } },
    })
    expect(t('common.confirm')).toBe('项目自定义确认')
  })

  it('深合并：未覆盖的内置 key 不受影响', () => {
    registerMessages({
      'zh-CN': { common: { confirm: '项目自定义确认' } },
    })
    // 内置 common.cancel 仍是原值
    expect(t('common.cancel')).toBeTruthy()
    expect(t('common.confirm')).toBe('项目自定义确认')
  })

  it('注册全新语言并切换（组件库缺文案回退 fallbackLocale=zh-CN）', () => {
    registerMessages({
      'fr-FR': { common: { confirm: 'Confirmer' } },
    })
    setLocale('fr-FR')
    expect(getLocale()).toBe('fr-FR')
    // 项目注册的 fr 文案生效
    expect(t('common.confirm')).toBe('Confirmer')
    // 组件库未提供 fr 的 key → 回退 zh-CN
    expect(t('common.cancel')).toBe('取消')
  })

  it('重复注册同语言：后注册的覆盖前注册的同 key', () => {
    registerMessages({ 'zh-CN': { common: { confirm: '第一次' } } })
    registerMessages({ 'zh-CN': { common: { confirm: '第二次' } } })
    expect(t('common.confirm')).toBe('第二次')
  })
})
