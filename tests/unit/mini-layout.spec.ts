// 修复锁定：MiniLayout 扫码 sheet 弹层焦点陷阱 + Esc 关闭
// 背景：审计发现该 sheet（Teleport 底部弹层）无焦点管理（仅 @click.self 关遮罩）
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import MiniLayout from '@/components/layout/MiniLayout.vue'

function mountMini() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/mini/home', component: {} },
      { path: '/mini/scan/:type', component: {} },
    ],
  })
  const w = mount(MiniLayout, {
    global: { plugins: [router], stubs: { teleport: true, RouterView: true } },
    attachTo: document.body,
  })
  return { w, router }
}

describe('MiniLayout · 扫码 sheet 焦点管理', () => {
  it('点击扫码按钮打开 sheet：容器可聚焦（tabindex + role=dialog + aria-modal）', async () => {
    const { w } = mountMini()
    await w.find('.scan-btn').trigger('click')
    await nextTick()
    const sheet = w.find('.scan-sheet')
    expect(sheet.exists()).toBe(true)
    expect(sheet.attributes('role')).toBe('dialog')
    expect(sheet.attributes('aria-modal')).toBe('true')
    expect(sheet.attributes('tabindex')).toBe('-1')
  })

  it('Esc 关闭 sheet', async () => {
    const { w } = mountMini()
    await w.find('.scan-btn').trigger('click')
    await nextTick()
    expect(w.find('.scan-sheet').exists()).toBe(true)
    // Esc 键触发（useEscClose 监听 window keydown）
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(w.find('.scan-sheet').exists()).toBe(false)
  })

  it('选中扫码类型关闭并跳转', async () => {
    const { w, router } = mountMini()
    await w.find('.scan-btn').trigger('click')
    await nextTick()
    const firstType = w.findAll('.scan-type-btn')[0]
    await firstType.trigger('click')
    await nextTick()
    expect(w.find('.scan-sheet').exists()).toBe(false)
    // push 是异步导航，等待完成
    await router.isReady()
    expect(router.currentRoute.value.path).toBe('/mini/scan/inbound')
  })
})
