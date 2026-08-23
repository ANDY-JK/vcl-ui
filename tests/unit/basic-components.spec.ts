import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Button from '@/components/basic/Button.vue'
import Tag from '@/components/basic/Tag.vue'
import Divider from '@/components/data/Divider.vue'
import Empty from '@/components/data/Empty.vue'
import Skeleton from '@/components/data/Skeleton.vue'
import Card from '@/components/data/Card.vue'
import Collapse from '@/components/data/Collapse.vue'

describe('Button', () => {
  it('渲染文本按钮', () => {
    const w = mount(Button, { props: { text: '确定' } })
    expect(w.find('button').exists()).toBe(true)
    expect(w.find('.btn-text').text()).toBe('确定')
  })

  it('variant/size 类名', () => {
    const w = mount(Button, { props: { text: 'x', variant: 'danger', size: 'lg' } })
    expect(w.find('button').classes()).toContain('btn-danger')
    expect(w.find('button').classes()).toContain('btn-lg')
  })

  it('disabled 禁用点击', async () => {
    const w = mount(Button, { props: { text: 'x', disabled: true } })
    await w.find('button').trigger('click')
    expect(w.emitted('click')).toBeUndefined()
  })

  it('loading 显示 spinner + aria-busy', () => {
    const w = mount(Button, { props: { text: 'x', loading: true } })
    expect(w.find('button').attributes('disabled')).toBeDefined()
    expect(w.find('button').attributes('aria-busy')).toBe('true')
    expect(w.find('.btn-spinner').exists()).toBe(true)
  })

  it('纯图标按钮 aria-label 取图标名', () => {
    const w = mount(Button, { props: { icon: 'search' } })
    expect(w.find('button').attributes('aria-label')).toBe('search')
  })

  it('点击触发 click 事件', async () => {
    const w = mount(Button, { props: { text: 'x' } })
    await w.find('button').trigger('click')
    expect(w.emitted('click')).toHaveLength(1)
  })
})

describe('Tag', () => {
  it('渲染文本标签', () => {
    const w = mount(Tag, { props: { text: '标签' } })
    expect(w.text()).toContain('标签')
  })

  it('variant 类名', () => {
    const w = mount(Tag, { props: { text: 'x', variant: 'success' } })
    expect(w.find('.tag').classes()).toContain('tag-success')
  })

  it('count 溢出 max 显示 99+', () => {
    const w = mount(Tag, { props: { count: 120, max: 99 } })
    expect(w.find('.tag').text()).toContain('99+')
  })

  it('count=0 内联模式直接显示 0', () => {
    const w = mount(Tag, { props: { count: 0 } })
    expect(w.find('.tag').text()).toBe('0')
  })

  it('角标模式 count=0 且 showZero 时显示', () => {
    const w = mount(Tag, {
      props: { count: 0, showZero: true, sup: true },
      slots: { default: '内容' },
    })
    expect(w.find('.tag-sup').exists()).toBe(true)
    expect(w.find('.tag-sup').text()).toBe('0')
  })

  it('closable 触发 close', async () => {
    const w = mount(Tag, { props: { text: 'x', closable: true } })
    await w.find('.tag-close').trigger('click')
    expect(w.emitted('close')).toHaveLength(1)
  })
})

describe('Divider', () => {
  it('horizontal 默认', () => {
    const w = mount(Divider)
    expect(w.find('.divider-h').exists()).toBe(true)
  })

  it('带文字', () => {
    const w = mount(Divider, { props: { text: '或' } })
    expect(w.find('.divider-text').text()).toBe('或')
  })

  it('vertical 方向', () => {
    const w = mount(Divider, { props: { direction: 'vertical' } })
    expect(w.find('.divider-v').exists()).toBe(true)
  })
})

describe('Empty', () => {
  it('role=status + 标题描述', () => {
    const w = mount(Empty, { props: { title: '无数据', description: '暂无内容' } })
    expect(w.find('[role="status"]').exists()).toBe(true)
    expect(w.find('.empty-title').text()).toBe('无数据')
    expect(w.find('.empty-description').text()).toBe('暂无内容')
  })

  it('默认插槽渲染', () => {
    const w = mount(Empty, { slots: { default: '<button>重试</button>' } })
    expect(w.find('.empty-action').text()).toBe('重试')
  })
})

describe('Skeleton', () => {
  it('loading 显示骨架块', () => {
    const w = mount(Skeleton, { props: { loading: true, rows: 3 } })
    expect(w.find('.skel').exists()).toBe(true)
  })

  it('loading=false 渲染真实内容', () => {
    const w = mount(Skeleton, {
      props: { loading: false },
      slots: { default: '<p>真实内容</p>' },
    })
    expect(w.text()).toContain('真实内容')
    expect(w.find('.skel').exists()).toBe(false)
  })

  it('avatar=true 显示头像块', () => {
    const w = mount(Skeleton, { props: { loading: true, avatar: true } })
    expect(w.find('.skel-avatar').exists()).toBe(true)
  })
})

describe('Card', () => {
  it('grid 模式渲染标题', () => {
    const w = mount(Card, { props: { title: '卡片标题' } })
    expect(w.text()).toContain('卡片标题')
  })

  it('stat 模式渲染 value/label', () => {
    const w = mount(Card, { props: { type: 'stat', value: 123, label: '总数' } })
    expect(w.find('.stat-card').exists()).toBe(true)
    expect(w.text()).toContain('123')
    expect(w.text()).toContain('总数')
  })

  it('stat 点击触发 click', async () => {
    const w = mount(Card, { props: { type: 'stat', value: 1, label: 'x' } })
    await w.find('.stat-card').trigger('click')
    expect(w.emitted('click')).toHaveLength(1)
  })
})

describe('Collapse', () => {
  it('渲染标题 + aria 关联', () => {
    const w = mount(Collapse, { props: { title: '面板标题' } })
    expect(w.text()).toContain('面板标题')
    const trigger = w.find('[aria-expanded]')
    expect(trigger.exists()).toBe(true)
    expect(trigger.attributes('aria-expanded')).toBe('false')
  })

  it('open=true 时 aria-expanded=true', () => {
    const w = mount(Collapse, { props: { title: 'x', open: true } })
    expect(w.find('[aria-expanded]').attributes('aria-expanded')).toBe('true')
  })

  it('点击触发 update:open', async () => {
    const w = mount(Collapse, { props: { title: 'x' } })
    await w.find('[aria-expanded]').trigger('click')
    const emitted = w.emitted('update:open')
    expect(emitted).toBeTruthy()
    expect(emitted![emitted!.length - 1]).toEqual([true])
  })
})
