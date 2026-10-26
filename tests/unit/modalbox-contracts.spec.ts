/**
 * ModalBox · 五个模式的事件契约与委托（第 137 轮）。此前分支覆盖 43.5%，
 * 且既有用例只覆盖了外壳（滚动锁 / ESC 栈 / 焦点 / detail 的 key），
 * **事件契约本身没有一条用例**。
 *
 * 本轮修的缺陷：form / select 模式的内置「取消」按钮只走 `close()`
 * （emit `update:visible` + `close`），**从不 emit `cancel`**；而 confirm 模式（委托
 * ConfirmModal）会 emit `cancel`，类型注释也写着 `cancel: 点击取消 / 关闭`。
 * 于是宿主写 `@cancel="丢弃草稿"` 时只有 confirm 弹窗生效、表单弹窗静默不生效。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ModalBox from '@/components/layout/ModalBox.vue'
import ConfirmModal from '@/components/feedback/ConfirmModal.vue'
import ModalShell from '@/components/_internal/ModalShell.vue'
import Button from '@/components/basic/Button.vue'

const mountBox = (props: Record<string, unknown> = {}, slots: Record<string, unknown> = {}) =>
  mount(ModalBox, {
    props: { visible: true, ...props },
    slots,
    global: { stubs: { teleport: true } },
  })

/** 按按钮文案找 Button 组件（内置按钮的文案来自 i18n） */
const btnByText = (w: ReturnType<typeof mountBox>, fragment: string) =>
  w.findAllComponents(Button).find((b) => String(b.props('text') ?? '').includes(fragment))

const emitted = (w: ReturnType<typeof mountBox>) => w.emitted()

// ════════════════════════════════════════════════════════════════════
describe('confirm 模式：委托 ConfirmModal + 变体映射', () => {
  it('渲染 ConfirmModal 而不是 ModalShell，并把基础属性传下去', () => {
    const w = mountBox({
      modalType: 'confirm',
      title: '确认删除',
      confirmMessage: '删了就没了',
      confirmLoading: true,
      closable: false,
    })
    expect(w.findComponent(ConfirmModal).exists()).toBe(true)
    // 注意：ConfirmModal 内部也用 ModalShell（依赖单向 ConfirmModal → ModalShell），
    // 所以不能断言"没有 ModalShell"；断言"只有一层外壳"才能证明是委托而不是自己又套一层。
    expect(w.findAllComponents(ModalShell).length, 'confirm 模式应只有 1 层外壳（委托给 ConfirmModal）').toBe(1)
    const cm = w.findComponent(ConfirmModal)
    expect(cm.props('title')).toBe('确认删除')
    expect(cm.props('message')).toBe('删了就没了')
    expect(cm.props('loading')).toBe(true)
    expect(cm.props('closable')).toBe(false)
    w.unmount()
  })

  it('confirmMessage 缺省时传空串（不是 undefined）', () => {
    const w = mountBox({ modalType: 'confirm' })
    expect(w.findComponent(ConfirmModal).props('message')).toBe('')
    w.unmount()
  })

  it.each([
    ['warning', false, 'warning'],
    ['danger', false, 'danger'],
    ['info', false, 'primary'],
    ['success', false, 'primary'],
  ] as const)('confirmVariant=%s + danger=%s → ConfirmModal variant=%s', (variant, danger, want) => {
    const w = mountBox({ modalType: 'confirm', confirmVariant: variant, confirmDanger: danger })
    expect(w.findComponent(ConfirmModal).props('variant')).toBe(want)
    w.unmount()
  })

  it.each(['warning', 'danger', 'info', 'success'] as const)('confirmDanger=true 时无论 %s 都用 danger', (variant) => {
    const w = mountBox({ modalType: 'confirm', confirmVariant: variant, confirmDanger: true })
    expect(w.findComponent(ConfirmModal).props('variant'), '危险开关优先级最高').toBe('danger')
    w.unmount()
  })

  it('ConfirmModal 的四个事件都往上转发', async () => {
    const w = mountBox({ modalType: 'confirm' })
    const cm = w.findComponent(ConfirmModal)
    cm.vm.$emit('update:visible', false)
    cm.vm.$emit('confirm')
    cm.vm.$emit('cancel')
    await nextTick()
    const e = emitted(w)
    expect(e['update:visible']).toEqual([[false]])
    expect(e.confirm).toEqual([[]])
    expect(e.cancel).toEqual([[]])
    w.unmount()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('default 模式：透传给 ModalShell', () => {
  it('把 title/size/closable/maskClosable/zIndex/internal/mutexScope 全传下去', () => {
    const w = mountBox({
      title: '标题',
      modalType: 'default',
      size: 'xl',
      closable: false,
      maskClosable: false,
      zIndex: 3000,
      internal: true,
      mutexScope: 'drawer',
    })
    const shell = w.findComponent(ModalShell)
    expect(shell.exists()).toBe(true)
    expect(shell.props('title')).toBe('标题')
    expect(shell.props('size')).toBe('xl')
    expect(shell.props('closable')).toBe(false)
    expect(shell.props('maskClosable'), 'false 必须传下去，不能被默认值覆盖').toBe(false)
    expect(shell.props('zIndex')).toBe(3000)
    expect(shell.props('internal')).toBe(true)
    expect(shell.props('mutexScope')).toBe('drawer')
    w.unmount()
  })

  it('zIndex 支持字符串（CSS 变量之类）', () => {
    const w = mountBox({ modalType: 'default', zIndex: 'var(--z-modal)' })
    expect(w.findComponent(ModalShell).props('zIndex')).toBe('var(--z-modal)')
    w.unmount()
  })

  it('ModalShell 的 update:visible / close 往上转发', async () => {
    const w = mountBox()
    const shell = w.findComponent(ModalShell)
    shell.vm.$emit('update:visible', false)
    shell.vm.$emit('close')
    await nextTick()
    expect(emitted(w)['update:visible']).toEqual([[false]])
    expect(emitted(w).close).toEqual([[]])
    w.unmount()
  })

  it('默认插槽内容渲染在弹窗里', () => {
    const w = mountBox({ modalType: 'default' }, { default: '<p class="custom-body">自定义内容</p>' })
    expect(w.find('.custom-body').text()).toBe('自定义内容')
    w.unmount()
  })

  it('default 模式不传 footer 插槽时没有底部按钮（不该凭空长按钮）', () => {
    const w = mountBox({ modalType: 'default' })
    expect(w.findAllComponents(Button).length).toBe(0)
    w.unmount()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('detail 模式', () => {
  const items = [
    { label: '单号', value: 'A-001' },
    { label: '金额', value: '¥100', mono: true },
  ]

  it('逐行渲染 label / value，mono 加等宽类', () => {
    const w = mountBox({ modalType: 'detail', detailItems: items })
    const rows = w.findAll('.detail-row')
    expect(rows.length).toBe(2)
    expect(rows[0].find('.detail-label').text()).toBe('单号')
    expect(rows[0].find('.detail-value').text()).toBe('A-001')
    expect(rows[0].find('.detail-value').classes(), '普通值不加 mono').not.toContain('mono')
    expect(rows[1].find('.detail-value').classes()).toContain('mono')
    w.unmount()
  })

  it('空列表不崩、不渲染任何行', () => {
    const w = mountBox({ modalType: 'detail', detailItems: [] })
    expect(w.find('.detail-wrap').exists()).toBe(true)
    expect(w.findAll('.detail-row').length).toBe(0)
    w.unmount()
  })

  it('**同名 label 的行不合并/不冲突**（key 带索引）', () => {
    const w = mountBox({
      modalType: 'detail',
      detailItems: [
        { label: '备注', value: '第一行' },
        { label: '备注', value: '第二行' },
      ],
    })
    const rows = w.findAll('.detail-row')
    expect(rows.length).toBe(2)
    expect(rows.map((r) => r.find('.detail-value').text())).toEqual(['第一行', '第二行'])
    w.unmount()
  })

  it('detail 模式同时保留默认插槽内容（可以自己加说明）', () => {
    const w = mountBox({ modalType: 'detail', detailItems: items }, { default: '<div class="extra">补充</div>' })
    expect(w.find('.extra').exists()).toBe(true)
    expect(w.findAll('.detail-row').length).toBe(2)
    w.unmount()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('select 模式：单选 / 多选 / 确认', () => {
  const items = [
    { value: 'a', label: '选项 A' },
    { value: 'b', label: '选项 B', desc: '带说明' },
  ]

  it('按 selectValue 标出选中项（aria-pressed 与 active 类）', () => {
    const w = mountBox({ modalType: 'select', selectItems: items, selectValue: ['a'] })
    const els = w.findAll('.select-item')
    expect(els.length).toBe(2)
    expect(els[0].attributes('aria-pressed')).toBe('true')
    expect(els[0].classes()).toContain('active')
    expect(els[1].attributes('aria-pressed')).toBe('false')
    w.unmount()
  })

  it('desc 有则渲染、无则不渲染', () => {
    const w = mountBox({ modalType: 'select', selectItems: items, selectValue: [] })
    const els = w.findAll('.select-item')
    expect(els[0].find('.select-item-desc').exists()).toBe(false)
    expect(els[1].find('.select-item-desc').text()).toBe('带说明')
    w.unmount()
  })

  it('单选：点另一个 → 变成它（不是累加）', async () => {
    const w = mountBox({ modalType: 'select', selectItems: items, selectValue: ['a'] })
    await w.findAll('.select-item')[1].trigger('click')
    expect(w.findAll('.select-item')[1].classes()).toContain('active')
    expect(w.findAll('.select-item')[0].classes(), '单选不能同时选中两个').not.toContain('active')
    btnByText(w, '确认')?.vm.$emit('click')
    await nextTick()
    expect(emitted(w)['select-confirm']).toEqual([[['b']]])
    w.unmount()
  })

  it('多选：点选累加，再点取消该项', async () => {
    const w = mountBox({ modalType: 'select', selectMultiple: true, selectItems: items, selectValue: ['a'] })
    await w.findAll('.select-item')[1].trigger('click')
    btnByText(w, '确认')?.vm.$emit('click')
    await nextTick()
    expect(emitted(w)['select-confirm'], '应累加为 a+b').toEqual([[['a', 'b']]])

    await w.findAll('.select-item')[0].trigger('click')
    btnByText(w, '确认')?.vm.$emit('click')
    await nextTick()
    const all = emitted(w)['select-confirm'] as Array<[[string | number][]]>
    expect(all[1][0], '再点一次要取消该项').toEqual(['b'])
    w.unmount()
  })

  it('selectItems 为空时点确认 emit 空数组（不崩）', async () => {
    const w = mountBox({ modalType: 'select', selectItems: [], selectValue: [] })
    btnByText(w, '确认')?.vm.$emit('click')
    await nextTick()
    expect(emitted(w)['select-confirm']).toEqual([[[]]])
    w.unmount()
  })

  it('**父组件更新 selectValue 会同步进来**', async () => {
    const w = mountBox({ modalType: 'select', selectItems: items, selectValue: [] })
    expect(w.findAll('.select-item')[0].classes()).not.toContain('active')
    await w.setProps({ selectValue: ['a'] })
    await nextTick()
    expect(w.findAll('.select-item')[0].classes()).toContain('active')
    w.unmount()
  })

  it('**重新打开会丢弃上次未确认的勾选**（回到 prop 的值）', async () => {
    const w = mountBox({ modalType: 'select', selectItems: items, selectValue: ['a'] })
    await w.findAll('.select-item')[1].trigger('click')
    expect(w.findAll('.select-item')[1].classes()).toContain('active')

    await w.setProps({ visible: false })
    await w.setProps({ visible: true })
    await nextTick()
    expect(w.findAll('.select-item')[1].classes(), '未确认的勾选不该留下').not.toContain('active')
    expect(w.findAll('.select-item')[0].classes()).toContain('active')
    w.unmount()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('**内置「取消」必须 emit cancel**（本轮修）', () => {
  it('form 模式：取消 → cancel + close + update:visible=false', async () => {
    const w = mountBox({ modalType: 'form', title: '表单' })
    btnByText(w, '取消')?.vm.$emit('click')
    await nextTick()
    const e = emitted(w)
    expect(e.cancel, 'cancel 不能缺 —— 宿主靠它丢弃草稿').toEqual([[]])
    expect(e.close).toEqual([[]])
    expect(e['update:visible']).toEqual([[false]])
    w.unmount()
  })

  it('select 模式：取消 → cancel + close', async () => {
    const w = mountBox({ modalType: 'select', selectItems: [], selectValue: [] })
    btnByText(w, '取消')?.vm.$emit('click')
    await nextTick()
    const e = emitted(w)
    expect(e.cancel).toEqual([[]])
    expect(e.close).toEqual([[]])
    w.unmount()
  })

  it('**cancel 先于 close**（宿主在 cancel 里读状态时，弹窗还开着）', async () => {
    const order: string[] = []
    const w = mount(ModalBox, {
      props: { visible: true, modalType: 'form' },
      global: { stubs: { teleport: true } },
      attrs: {
        onCancel: () => order.push('cancel'),
        onClose: () => order.push('close'),
      },
    })
    btnByText(w, '取消')?.vm.$emit('click')
    await nextTick()
    expect(order, '顺序必须是 cancel → close').toEqual(['cancel', 'close'])
    w.unmount()
  })

  it('form 模式：提交只 emit form-submit，不该关闭弹窗', async () => {
    const w = mountBox({ modalType: 'form' })
    btnByText(w, '提交')?.vm.$emit('click')
    await nextTick()
    const e = emitted(w)
    expect(e['form-submit']).toEqual([[]])
    expect(e['update:visible'], '提交后是否关闭由宿主决定').toBeUndefined()
    expect(e.close).toBeUndefined()
    w.unmount()
  })

  it('select 模式确认后也不自动关闭（由宿主收）', async () => {
    const w = mountBox({ modalType: 'select', selectItems: [{ value: 'a', label: 'A' }], selectValue: [] })
    btnByText(w, '确认')?.vm.$emit('click')
    await nextTick()
    expect(emitted(w)['update:visible']).toBeUndefined()
    w.unmount()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('footer 区域的出现条件', () => {
  it('form / select 模式即使不传 footer 插槽也要有底部（内置按钮在）', () => {
    for (const modalType of ['form', 'select']) {
      const w = mountBox({ modalType })
      expect(w.findAllComponents(Button).length, `${modalType} 应有内置按钮`).toBe(2)
      w.unmount()
    }
  })

  it('detail / default 模式不传 footer 就没有底部', () => {
    for (const modalType of ['detail', 'default']) {
      const w = mountBox({ modalType })
      expect(w.findAllComponents(Button).length, `${modalType} 不该凭空长按钮`).toBe(0)
      w.unmount()
    }
  })

  it('**自定义 footer 插槽优先**：覆盖内置按钮而不是并存', async () => {
    const w = mountBox({ modalType: 'form' }, { footer: '<span class="my-footer">自定义底部</span>' })
    expect(w.find('.my-footer').exists()).toBe(true)
    expect(w.findAllComponents(Button).length, '内置按钮应被插槽覆盖').toBe(0)
    w.unmount()
  })

  it('default 模式传了 footer 插槽就有底部', () => {
    const w = mountBox({ modalType: 'default' }, { footer: '<span class="f">底</span>' })
    expect(w.find('.f').exists()).toBe(true)
    w.unmount()
  })
})
