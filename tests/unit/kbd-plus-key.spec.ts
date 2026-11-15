/**
 * Kbd · 「加号键」这一族输入（#483）
 *
 * 症状：`keys: 'Ctrl++'`（放大/缩小快捷键，极其常见）走 `String.split('+')` 会得到
 * `['Ctrl', '', '']`，空段被 `.filter(Boolean)` 吃掉 —— 渲染出来只有一个 `Ctrl`，
 * **加号键静默消失**。`keys: '+'` 更是整串变空，组件渲染成一个空 `<span>`。
 * 这类错误不会报错、不会红，只是显示了错的快捷键 —— 用户照着按发现没反应。
 *
 * 同时把两件事一并钉住：
 *   · `' Ctrl +  + K '` 中间那个只有空白的段是**噪声**（既有契约，不能因为修 + 号键就改掉）；
 *   · 真正相邻的两个 `+` 才表示"加号键本身"。
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import Kbd from '@/components/basic/Kbd.vue'

const keys = (w: ReturnType<typeof mount>) => Array.from(w.element.querySelectorAll('.kbd-key')).map((k) => k.textContent)

describe('Kbd · 加号键（#483）', () => {
  it('keys="+" → 一个「+」键帽（旧实现渲染空 span）', () => {
    const w = mount(Kbd, { props: { keys: '+' } })
    expect(keys(w)).toEqual(['+'])
    w.unmount()
  })

  it('keys="Ctrl++" → Ctrl 与 + 两枚键帽，加号键不能消失', () => {
    const w = mount(Kbd, { props: { keys: 'Ctrl++' } })
    expect(keys(w)).toEqual(['Ctrl', '+'])
    w.unmount()
  })

  it('keys="Mod++" → 修饰键按平台展开后仍带加号键', () => {
    const w = mount(Kbd, { props: { keys: 'Mod++' } })
    expect(keys(w).slice(1)).toEqual(['+'])
    expect(keys(w)).toHaveLength(2)
    w.unmount()
  })

  it('keys="Ctrl+Shift++" → 三个键，最后一个仍是不加字形的「+」', () => {
    const w = mount(Kbd, { props: { keys: 'Ctrl+Shift++' } })
    expect(keys(w).slice(1)).toEqual(['Shift', '+'])
    w.unmount()
  })

  it('数组里直接给 "+" 也成立', () => {
    const w = mount(Kbd, { props: { keys: ['Ctrl', '+'] } })
    expect(keys(w)).toEqual(['Ctrl', '+'])
    w.unmount()
  })

  it('只有空白/空串 → 不产空键帽', () => {
    expect(keys(mount(Kbd, { props: { keys: '   ' } }))).toEqual([])
    expect(keys(mount(Kbd, { props: { keys: '' } }))).toEqual([])
  })

  it('分隔符数量随键数走（加号键也算一键）', () => {
    const w = mount(Kbd, { props: { keys: 'Ctrl++' } })
    expect(w.element.querySelectorAll('.kbd-sep').length).toBe(1)
    w.unmount()
  })
})