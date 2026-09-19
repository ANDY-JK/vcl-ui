// P1-5 行为锁定：可点击 div 键盘可达（role=button + tabindex + Enter/Space）
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Card from '@/components/data/Card.vue'
import ToggleList from '@/components/data/ToggleList.vue'
import TimeColumns from '@/components/form/date-panel/TimeColumns.vue'

describe('P1-5 可点击元素键盘可达', () => {
  it('Card stat-card：role=button + tabindex + Enter 触发 click', async () => {
    const wrapper = mount(Card, {
      props: { type: 'stat', value: '99', label: '门店数', trend: 12 },
      attrs: {},
    })
    const card = wrapper.find('.stat-card')
    expect(card.attributes('role')).toBe('button')
    expect(card.attributes('tabindex')).toBe('0')
    // Enter 触发 click
    await card.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('click')).toHaveLength(1)
    // Space 触发 click
    await card.trigger('keydown', { key: ' ' })
    expect(wrapper.emitted('click')).toHaveLength(2)
  })

  it('ToggleList list-item：role=button + Enter 触发 itemClick', async () => {
    const wrapper = mount(ToggleList, {
      props: {
        items: [{ id: 1, name: 'A' }],
        idKey: 'id',
        titleField: 'name',
      },
    })
    const item = wrapper.find('.list-item')
    expect(item.attributes('role')).toBe('button')
    expect(item.attributes('tabindex')).toBe('0')
    await item.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('itemClick')).toHaveLength(1)
    expect(wrapper.emitted('itemClick')![0][0]).toEqual({ id: 1, name: 'A' })
  })

  it('TimeColumns tp-cell：role=button + Enter 触发选中', async () => {
    const wrapper = mount(TimeColumns, {
      props: { value: '10:30', format: 'HH:mm', step: 1 },
    })
    const cell = wrapper.findAll('.tp-cell')[0]
    expect(cell.attributes('role')).toBe('button')
    expect(cell.attributes('tabindex')).toBe('0')
    await cell.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('select')).toBeTruthy()
  })
})
