/**
 * Popover 自定义触发器的展开状态（#321）
 *
 * ## 缺陷
 *
 * 内置触发器的 button 上绑了 `:aria-expanded` / `:aria-haspopup`，
 * 但用 `<template #trigger>` 换成自己的按钮后**这些属性一个都没有** ——
 * 读屏完全不知道"这是可展开的、现在展开没"。
 *
 * ## 判据
 *
 * 自定义插槽触发器在打开后应有 aria-expanded="true" + aria-controls 指向浮层，
 * 关闭后 aria-expanded="false" 且不保留 aria-controls（避免指向不存在的元素）。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import Popover from '@/components/feedback/Popover.vue'

function mountWithCustomTrigger() {
  return mount(Popover, {
    props: { content: '浮层内容', trigger: 'click' } as never,
    slots: {
      trigger: '<button class="my-trigger" type="button">自定义触发</button>',
      default: '<div class="my-panel">内容</div>',
    },
    attachTo: document.body,
  })
}

describe('Popover · 自定义触发器的展开状态', () => {
  it('**打开后 aria-expanded=true，aria-controls 指向浮层**', async () => {
    const w = mountWithCustomTrigger()
    await nextTick()
    const btn = w.find('.my-trigger')
    await btn.trigger('click')
    await nextTick()
    await nextTick()
    expect(btn.attributes('aria-expanded'), '自定义触发器也要有展开态').toBe('true')
    expect(btn.attributes('aria-haspopup')).toBe('dialog')
    const controls = btn.attributes('aria-controls')
    expect(controls, '展开时应指向浮层').toBeTruthy()
    expect(document.getElementById(controls!), 'aria-controls 指向的元素必须存在').toBeTruthy()
    w.unmount()
  })

  it('**关闭后 aria-expanded=false 且不保留 aria-controls**', async () => {
    const w = mountWithCustomTrigger()
    await nextTick()
    const btn = w.find('.my-trigger')
    await btn.trigger('click')
    await nextTick()
    await btn.trigger('click')
    await nextTick()
    await nextTick()
    expect(btn.attributes('aria-expanded')).toBe('false')
    expect(btn.attributes('aria-controls'), '关闭后不该指向已移除的浮层').toBeUndefined()
    w.unmount()
  })
})
