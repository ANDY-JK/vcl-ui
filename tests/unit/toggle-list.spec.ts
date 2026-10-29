/**
 * ToggleList · 开关回写 / 按钮变体 / 键盘可达（第 166 轮）
 *
 * 覆盖率实测该文件**分支仅 40.4%**（全库倒数第 4），`onToggle`（开关切换回写）、
 * button 变体、空态/加载态文案**全都未被执行过**。它是公开组件（data 域导出）。
 *
 * 本轮重点验证一处疑似缺陷：整行绑了 `@keydown.space.prevent`，若焦点在内层
 * `<input type="checkbox">` 上，按键冒泡到行 → `.prevent` 把默认行为（切换复选框）吃掉，
 * 而 `onItemClick` 又因 `target !== currentTarget` 提前 return —— **键盘用户无法用空格切开关**。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ToggleList from '@/components/data/ToggleList.vue'

const items = () => [
  { id: 1, display_name: '甲', description: '描述甲', icon: 'star', is_enabled: true },
  { id: 2, display_name: '乙', description: '描述乙', icon: 'heart', is_enabled: false },
]

const mountList = (props: Record<string, unknown> = {}) =>
  mount(ToggleList, { props: { items: items(), ...props } })

const rows = (w: ReturnType<typeof mountList>) => w.findAll('.list-item')

describe('ToggleList · 开关切换回写（onToggle）', () => {
  it('勾选开关：emit toggle(行, 新值) 且**行数据被同步回写**', async () => {
    const data = items()
    const w = mount(ToggleList, { props: { items: data } })
    const box = w.findAll('.toggle-input')[1] // 乙 当前 false
    ;(box.element as HTMLInputElement).checked = true
    await box.trigger('change')

    const ev = w.emitted('toggle')?.at(-1) as [Record<string, unknown>, boolean]
    expect(ev[1], '新值应为 true').toBe(true)
    expect((ev[0] as { id: number }).id, '第一个参数应是该行对象').toBe(2)
    expect(data[1].is_enabled, '行数据必须被同步回写，否则 extraColumns 状态标签不更新').toBe(true)
    w.unmount()
  })

  it('取消勾选同样回写 false', async () => {
    const data = items()
    const w = mount(ToggleList, { props: { items: data } })
    const box = w.findAll('.toggle-input')[0] // 甲 当前 true
    ;(box.element as HTMLInputElement).checked = false
    await box.trigger('change')
    expect(data[0].is_enabled).toBe(false)
    w.unmount()
  })

  it('自定义 toggleField 生效（读写的都是该字段）', async () => {
    const data = [{ id: 1, display_name: '甲', flag: false }]
    const w = mount(ToggleList, { props: { items: data, toggleField: 'flag' } })
    const box = w.find('.toggle-input')
    ;(box.element as HTMLInputElement).checked = true
    await box.trigger('change')
    expect((data[0] as Record<string, unknown>).flag).toBe(true)
    w.unmount()
  })

  it('行缺少该开关字段时不渲染开关（不误显示为 off）', () => {
    const data = [{ id: 1, display_name: '甲' }] // 无 is_enabled
    const w = mount(ToggleList, { props: { items: data } })
    expect(w.find('.toggle-input').exists()).toBe(false)
    w.unmount()
  })

  it('disabled 时开关被禁用', () => {
    const w = mountList({ disabled: true })
    w.findAll('.toggle-input').forEach((b) => expect((b.element as HTMLInputElement).disabled).toBe(true))
    w.unmount()
  })
})

describe('ToggleList · 行点击 vs 内层控件（不得互相抢事件）', () => {
  it('点行 → emit item-click', async () => {
    const w = mountList()
    await rows(w)[0].trigger('click')
    expect(w.emitted('item-click')?.length).toBe(1)
    w.unmount()
  })

  it('**点开关不应同时触发 item-click**（label 上 @click.stop）', async () => {
    const w = mountList()
    await w.find('.item-toggle').trigger('click')
    await nextTick()
    expect(w.emitted('item-click'), '点开关却把整行点击也发出去了').toBeUndefined()
    w.unmount()
  })

  it('行内按 Enter → emit item-click（公开契约）', async () => {
    const w = mountList()
    await rows(w)[0].trigger('keydown.enter')
    expect(w.emitted('item-click')?.length).toBe(1)
    w.unmount()
  })

  it('行本身按空格 → emit item-click 且 preventDefault（否则页面跟着滚动）', async () => {
    const w = mountList()
    const row = rows(w)[0]
    const ev = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    ;(row.element as HTMLElement).dispatchEvent(ev)
    await nextTick()
    expect(w.emitted('item-click')?.length, '行本身空格要发整行点击').toBe(1)
    expect(ev.defaultPrevented, '行本身空格未 preventDefault → 会连带滚动页面').toBe(true)
    w.unmount()
  })

  it('行内按空格 → emit item-click', async () => {
    const w = mountList()
    await rows(w)[0].trigger('keydown.space')
    expect(w.emitted('item-click')?.length).toBe(1)
    w.unmount()
  })

  it('**焦点在复选框上按空格：必须切换开关，且不得触发 item-click**', async () => {
    const data = items()
    const w = mount(ToggleList, { props: { items: data } })
    const box = w.findAll('.toggle-input')[1]

    // 真实浏览器里：焦点在 checkbox 上按空格 → keydown 冒泡到行（行上有 .prevent）
    // → 默认行为被取消 → 复选框不切换。这里用一个可取消的 keydown 复现该链路。
    const ev = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    ;(box.element as HTMLElement).dispatchEvent(ev)
    await nextTick()

    expect(ev.defaultPrevented, '空格在复选框上被 preventDefault → 键盘用户无法切换开关').toBe(false)
    expect(w.emitted('item-click'), '内层控件的按键不该被当成整行点击').toBeUndefined()
    w.unmount()
  })
})

describe('ToggleList · 空格键语义（浏览器默认行为层）', () => {
  it('焦点在开关上按空格 → 复选框状态翻转（模拟浏览器默认动作）', async () => {
    const data = items()
    const w = mount(ToggleList, { props: { items: data } })
    const box = w.findAll('.toggle-input')[1] // 乙：当前 false
    const el = box.element as HTMLInputElement
    expect(el.checked).toBe(false)

    const ev = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    el.dispatchEvent(ev)
    await nextTick()

    // 浏览器在 keydown 未被取消时才执行"切换 checkbox"这一默认动作
    if (!ev.defaultPrevented) {
      el.checked = !el.checked
      await box.trigger('change')
    }

    expect(el.checked, '空格没生效 → 键盘用户切不动开关').toBe(true)
    expect(data[1].is_enabled, '切换后必须回写行数据').toBe(true)
    w.unmount()
  })

  it('焦点在 button 变体的按钮上按空格 → 不触发 item-click（归按钮自己）', async () => {
    const w = mount(ToggleList, {
      props: { items: [{ id: 1, display_name: '张三', description: '北京' }], variant: 'button' },
    })
    const btn = w.find('.item-action-btn')
    const ev = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
    ;(btn.element as HTMLElement).dispatchEvent(ev)
    await nextTick()
    expect(ev.defaultPrevented, '按钮上的空格被行拦掉 → 无法用键盘触发').toBe(false)
    expect(w.emitted('item-click'), '按钮上的空格不该冒成整行点击').toBeUndefined()
    w.unmount()
  })
})

describe('ToggleList · button 变体', () => {
  // 注意：button 变体的 address 取自 descriptionField（默认 'description'），不是 address 字段
  const btnItems = () => [{ id: 1, display_name: '张三', phone: '13800138000', description: '北京' }]

  it('渲染按钮并 emit button-click（含 name/phone/address/item）', async () => {
    const data = btnItems()
    const w = mount(ToggleList, { props: { items: data, variant: 'button', buttonLabel: '寄件' } })
    const btn = w.find('.item-action-btn')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toBe('寄件')
    await btn.trigger('click')

    const payload = w.emitted('button-click')?.at(-1)?.[0] as Record<string, unknown>
    expect(payload.name).toBe('张三')
    expect(payload.phone, 'phone 取自 phoneField').toBe(data[0].phone)
    expect(payload.address, 'address 取自 descriptionField').toBe(data[0].description)
    expect((payload.item as { id: number }).id, 'item 应携带该行').toBe(data[0].id)
    w.unmount()
  })

  it('未传 buttonLabel → 用内置文案（不为空）', () => {
    const w = mount(ToggleList, { props: { items: btnItems(), variant: 'button' } })
    expect(w.find('.item-action-btn').text().trim().length).toBeGreaterThan(0)
    w.unmount()
  })

  it('缺 phone/address 字段时降级为空串（不渲染 undefined）', async () => {
    const w = mount(ToggleList, { props: { items: [{ id: 9, display_name: '李四' }], variant: 'button' } })
    await w.find('.item-action-btn').trigger('click')
    const p = w.emitted('button-click')?.at(-1)?.[0] as Record<string, unknown>
    expect(p.phone).toBe('')
    expect(p.address).toBe('')
    w.unmount()
  })

  it('**正常状态点按钮不得冒成整行点击**（按钮上必须有 @click.stop）', async () => {
    const w = mount(ToggleList, { props: { items: btnItems(), variant: 'button' } })
    await w.find('.item-action-btn').trigger('click')
    await nextTick()
    expect(w.emitted('button-click')?.length, '前置：按钮点击本身要发出').toBe(1)
    expect(w.emitted('item-click'), '点按钮却把整行点击也发出去了（缺 @click.stop）').toBeUndefined()
    w.unmount()
  })

  it('点按钮不触发 item-click；disabled 时按钮禁用', async () => {
    const w = mount(ToggleList, { props: { items: btnItems(), variant: 'button', disabled: true } })
    await w.find('.item-action-btn').trigger('click')
    expect(w.emitted('item-click')).toBeUndefined()
    expect((w.find('.item-action-btn').element as HTMLButtonElement).disabled).toBe(true)
    w.unmount()
  })

  it('button 变体不渲染开关（两种变体互斥）', () => {
    const w = mount(ToggleList, { props: { items: btnItems(), variant: 'button' } })
    expect(w.find('.toggle-input').exists()).toBe(false)
    w.unmount()
  })
})

describe('ToggleList · 空态 / 加载态 / 追加列', () => {
  it('加载态显示 Loading，不显示行', () => {
    const w = mount(ToggleList, { props: { items: [], isLoading: true } })
    expect(w.find('.list-items').exists()).toBe(false)
    expect(w.text().length).toBeGreaterThan(0)
    w.unmount()
  })

  it('空数据 → 显示内置空文案', () => {
    const w = mount(ToggleList, { props: { items: [] } })
    expect(w.find('.list-items').exists()).toBe(false)
    expect(w.text().trim().length).toBeGreaterThan(0)
    w.unmount()
  })

  it('自定义 emptyText 优先于内置文案', () => {
    const w = mount(ToggleList, { props: { items: [], emptyText: '暂无设备' } })
    expect(w.text()).toContain('暂无设备')
    w.unmount()
  })

  it('extraColumns：逐列渲染取值', () => {
    const w = mountList({ extraColumns: [{ key: 'status', label: '状态' }] })
    expect(w.find('.item-extras').exists()).toBe(true)
    w.unmount()
  })

  it('行缺图标/描述时对应块不渲染（不留空占位）', () => {
    const w = mount(ToggleList, { props: { items: [{ id: 1, display_name: '仅标题' }] } })
    expect(w.find('.item-icon').exists()).toBe(false)
    expect(w.find('.item-desc').exists()).toBe(false)
    w.unmount()
  })
})
