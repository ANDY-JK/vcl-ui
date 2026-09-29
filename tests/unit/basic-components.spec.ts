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

  // 模板里写 avatar="48" 传进来的是字符串，原样落到内联 width 会得到非法 CSS → 头像块塌成 0×0。
  // 具名档位（sm/md/lg）是组件自己的设计尺寸，走 --vcl-scale 等比缩放（CSS 类承载）；
  // 宿主显式给的长度（数字串 / 任意 CSS 长度）是宿主自己的尺寸，原样内联透传不代缩放。
  it('avatar 无单位数字串归一为 px，具名挡位走等比缩放，宿主显式值原样透传', () => {
    const inlineCases: [string | number, string][] = [
      ['48', '48px'],
      [64, '64px'],
      ['2.5rem', '2.5rem'],
    ]
    for (const [avatar, expected] of inlineCases) {
      const w = mount(Skeleton, { props: { loading: true, avatar } })
      expect(w.find('.skel-avatar').attributes('style'), `avatar=${String(avatar)}`).toContain(`width: ${expected}`)
    }

    const namedCases: [string | boolean, string][] = [
      ['sm', 'skel-avatar-sm'],
      [true, 'skel-avatar-md'],
      ['lg', 'skel-avatar-lg'],
    ]
    for (const [avatar, cls] of namedCases) {
      const w = mount(Skeleton, { props: { loading: true, avatar } })
      const el = w.find('.skel-avatar')
      expect(el.classes(), `avatar=${String(avatar)}`).toContain(cls)
      // 具名档位的尺寸由 CSS 类给出，内联不再重复写死 px（否则 CSS 缩放被内联覆盖）
      expect(el.attributes('style') ?? '').not.toContain('px')
    }
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

  // 护栏：收起面板不得参与 Tab 序（曾用 v-show 立即 display:none 导致收起动画丢失，
  // 改为 visibility 延迟隐藏后必须保证键盘不可达）
  it('收起状态面板 aria-hidden 且不在 tab 序', async () => {
    const w = mount(Collapse, { props: { title: 'x', open: true } })
    const panel = w.find('.collapse-content')
    expect(panel.attributes('aria-hidden')).toBe('false')
    await w.setProps({ open: false })
    expect(panel.attributes('aria-hidden')).toBe('true')
    expect(panel.classes()).not.toContain('expanded')
  })
})
