/**
 * Select menu 模式（2026-10-23）
 *
 * ## 为什么补
 *
 * 已有 5 个 spec（41 例）全测 select/combobox 模式；menu 模式的
 * openMenu（exposed）/ onMenuClick / 键盘导航（L633-651）零覆盖。
 *
 * ## 最该锁住的契约
 *
 *   ① **openMenu 是右键菜单入口**：定位到指针坐标（clientX/Y 与裸 {x,y} 都支持）；
 *      **disabled 或非 menu 模式时是 no-op**
 *   ② **onMenuClick 三步**：关面板 → emit visible-change(false) → 执行 item.action
 *   ③ **danger / divided / icon 渲染**（菜单视觉语义）
 *   ④ **键盘可达**（L633-651 注释明说"此前直接 return，下拉对键盘完全不可达"）：
 *      ArrowDown 开面板 → 在项间移动高亮（clamp 到两端）→ Enter 执行 action
 *   ⑤ **Escape / Tab 关面板**（只读型面板没有 blur 收起，显式关）
 *   ⑥ highlightIdx 初始 -1 时 Enter 不炸（无选中项直接 no-op）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import Select from '@/components/form/Select.vue'

const items = [
  { label: '编辑', value: 'edit', icon: 'pencil', action: vi.fn() },
  { label: '删除', value: 'del', danger: true, action: vi.fn() },
  { label: '分享', value: 'share', divided: true, action: vi.fn() },
]

beforeEach(() => {
  // ⚠️ items 是模块级数组，action mock 计数跨用例累积 —— 每例前清零
  items.forEach((i) => i.action.mockClear())
})

function mountMenu(props: Record<string, unknown> = {}) {
  return mount(Select, {
    props: { modelValue: '', type: 'menu', items, ...props },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('openMenu（exposed 右键入口）', () => {
  it('**裸坐标 {x,y} → 打开面板并定位**', async () => {
    const w = mountMenu()
    ;(w.vm as unknown as { openMenu: (e: { x: number; y: number }) => void }).openMenu({ x: 120, y: 80 })
    await w.vm.$nextTick()
    expect(w.find('.dropdown-panel').exists(), '面板应打开').toBe(true)
    const style = w.find('.dropdown-panel').attributes('style') || ''
    expect(style).toContain('top: 80px')
    expect(style).toContain('left: 120px')
  })

  it('**MouseEvent 形态（clientX/Y）→ 同样定位**', async () => {
    const w = mountMenu()
    const fake = { clientX: 55, clientY: 66 } as MouseEvent
    ;(w.vm as unknown as { openMenu: (e: MouseEvent) => void }).openMenu(fake)
    await w.vm.$nextTick()
    const style = w.find('.dropdown-panel').attributes('style') || ''
    expect(style).toContain('top: 66px')
    expect(style).toContain('left: 55px')
  })

  it('**disabled → no-op**（面板不开）', async () => {
    const w = mountMenu({ disabled: true })
    ;(w.vm as unknown as { openMenu: (e: { x: number; y: number }) => void }).openMenu({ x: 1, y: 1 })
    await w.vm.$nextTick()
    expect(w.find('.dropdown-panel').exists()).toBe(false)
  })

  it('**非 menu 模式 → no-op**（openMenu 只对 menu 生效）', async () => {
    const w = mount(Select, {
      props: { modelValue: '', type: 'select', options: [{ label: 'A', value: 'a' }] },
      global: { stubs: { teleport: true } },
      attachTo: document.body,
    })
    ;(w.vm as unknown as { openMenu: (e: { x: number; y: number }) => void }).openMenu({ x: 1, y: 1 })
    await w.vm.$nextTick()
    expect(w.find('.dropdown-panel').exists(), 'select 模式不该响应 openMenu').toBe(false)
  })

  it('打开时 emit visible-change(true)', async () => {
    const w = mountMenu()
    ;(w.vm as unknown as { openMenu: (e: { x: number; y: number }) => void }).openMenu({ x: 0, y: 0 })
    await w.vm.$nextTick()
    expect(w.emitted('visible-change')?.at(-1)?.[0]).toBe(true)
  })
})

describe('菜单渲染', () => {
  it('面板内渲染全部菜单项', async () => {
    const w = mountMenu()
    ;(w.vm as unknown as { openMenu: (e: { x: number; y: number }) => void }).openMenu({ x: 0, y: 0 })
    await w.vm.$nextTick()
    const texts = w.findAll('.panel-item').map((i) => i.text())
    expect(texts, '3 个菜单项').toEqual(['编辑', '删除', '分享'])
  })

  it('**danger 项带 danger 类**', async () => {
    const w = mountMenu()
    ;(w.vm as unknown as { openMenu: (e: { x: number; y: number }) => void }).openMenu({ x: 0, y: 0 })
    await w.vm.$nextTick()
    const del = w.findAll('.panel-item')[1]
    expect(del.classes(), '删除应标红').toContain('danger')
  })

  it('**divided 项前有分隔线**（首项不加分隔）', async () => {
    const w = mountMenu()
    ;(w.vm as unknown as { openMenu: (e: { x: number; y: number }) => void }).openMenu({ x: 0, y: 0 })
    await w.vm.$nextTick()
    const dividers = w.findAll('.menu-divider')
    expect(dividers.length, '只有第 3 项（idx>0 且 divided）前有分隔线').toBe(1)
  })

  it('**panel role 是 menu**（a11y 语义）', async () => {
    const w = mountMenu()
    ;(w.vm as unknown as { openMenu: (e: { x: number; y: number }) => void }).openMenu({ x: 0, y: 0 })
    await w.vm.$nextTick()
    expect(w.find('.dropdown-panel').attributes('role')).toBe('menu')
  })
})

describe('onMenuClick 三步', () => {
  it('**点击 → 关面板 + visible-change(false) + 执行 action**', async () => {
    const w = mountMenu()
    ;(w.vm as unknown as { openMenu: (e: { x: number; y: number }) => void }).openMenu({ x: 0, y: 0 })
    await w.vm.$nextTick()

    await w.findAll('.panel-item')[0].trigger('click')
    expect(w.find('.dropdown-panel').exists(), '点击后面板应关').toBe(false)
    expect(w.emitted('visible-change')?.at(-1)?.[0]).toBe(false)
    expect(items[0].action, '编辑的 action 应被执行').toHaveBeenCalledTimes(1)
  })

  it('每项的 action 独立执行', async () => {
    const w = mountMenu()
    ;(w.vm as unknown as { openMenu: (e: { x: number; y: number }) => void }).openMenu({ x: 0, y: 0 })
    await w.vm.$nextTick()
    await w.findAll('.panel-item')[1].trigger('click')
    expect(items[1].action).toHaveBeenCalledTimes(1)
    // mockClear 后每例从 0 计数：点删除不该连带执行编辑/分享
    expect(items[0].action, '其它项不该执行').not.toHaveBeenCalled()
    expect(items[2].action, '其它项不该执行').not.toHaveBeenCalled()
  })
})

describe('键盘导航（L633-651，注释：此前直接 return 不可达）', () => {
  it('**ArrowDown 打开面板**（未开时第一次按是开）', async () => {
    const w = mountMenu()
    await w.find('input.trigger-input').trigger('keydown', { key: 'ArrowDown' })
    expect(w.find('.dropdown-panel').exists(), 'ArrowDown 应开面板').toBe(true)
  })

  it('**ArrowDown 移动高亮，clamp 到末尾**', async () => {
    const w = mountMenu()
    const input = w.find('input.trigger-input')
    await input.trigger('keydown', { key: 'ArrowDown' }) // 开面板
    await input.trigger('keydown', { key: 'ArrowDown' }) // 高亮 0
    await input.trigger('keydown', { key: 'ArrowDown' }) // 高亮 1
    await input.trigger('keydown', { key: 'ArrowDown' }) // 高亮 2
    await input.trigger('keydown', { key: 'ArrowDown' }) // clamp 在 2
    const highlighted = w.findAll('.panel-item').filter((i) => i.classes().includes('highlighted'))
    expect(highlighted.length, '应有且仅一个高亮').toBe(1)
    expect(highlighted[0].text(), 'clamp 在最后一项').toBe('分享')
  })

  it('**ArrowUp 回移，clamp 到 0**', async () => {
    const w = mountMenu()
    const input = w.find('input.trigger-input')
    await input.trigger('keydown', { key: 'ArrowDown' })
    await input.trigger('keydown', { key: 'ArrowDown' }) // 0
    await input.trigger('keydown', { key: 'ArrowUp' }) // clamp 到 0
    const highlighted = w.findAll('.panel-item').filter((i) => i.classes().includes('highlighted'))
    expect(highlighted[0].text()).toBe('编辑')
  })

  it('**Enter 执行高亮项的 action 并关面板**', async () => {
    const w = mountMenu()
    const input = w.find('input.trigger-input')
    await input.trigger('keydown', { key: 'ArrowDown' }) // 开
    await input.trigger('keydown', { key: 'ArrowDown' }) // 高亮 0
    await input.trigger('keydown', { key: 'Enter' })
    expect(items[0].action).toHaveBeenCalledTimes(1)
    expect(w.find('.dropdown-panel').exists(), '执行后应关面板').toBe(false)
  })

  it('**未开时 Enter/Space 打开面板**', async () => {
    const w = mountMenu()
    await w.find('input.trigger-input').trigger('keydown', { key: 'Enter' })
    expect(w.find('.dropdown-panel').exists(), 'Enter 应开面板').toBe(true)

    const w2 = mountMenu()
    await w2.find('input.trigger-input').trigger('keydown', { key: ' ' })
    expect(w2.find('.dropdown-panel').exists(), 'Space 应开面板').toBe(true)
  })

  it('**highlightIdx=-1 时 Enter 不炸不执行**（无高亮项）', async () => {
    const w = mountMenu()
    const input = w.find('input.trigger-input')
    await input.trigger('keydown', { key: 'ArrowDown' }) // 开面板（高亮仍 -1）
    await input.trigger('keydown', { key: 'Enter' })
    expect(items[0].action, '无高亮不该执行').not.toHaveBeenCalled()
    expect(w.find('.dropdown-panel').exists(), '面板保持开着').toBe(true)
  })

  it('**Escape / Tab 关面板**（只读型没有 blur 收起，显式关）', async () => {
    const w = mountMenu()
    const input = w.find('input.trigger-input')
    await input.trigger('keydown', { key: 'ArrowDown' })
    expect(w.find('.dropdown-panel').exists()).toBe(true)
    await input.trigger('keydown', { key: 'Escape' })
    expect(w.find('.dropdown-panel').exists(), 'Escape 应关').toBe(false)

    const w2 = mountMenu()
    const input2 = w2.find('input.trigger-input')
    await input2.trigger('keydown', { key: 'ArrowDown' })
    await input2.trigger('keydown', { key: 'Tab' })
    expect(w2.find('.dropdown-panel').exists(), 'Tab 应关').toBe(false)
  })
})
