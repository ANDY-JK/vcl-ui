// 设计器可达性补全 · 行为锁定（真实使用审查余项 ⑦）
// - 画布根级字段卡片可键盘聚焦（tabindex=0）+ Enter/Space 选中（支持 Ctrl 多选）
// - 大纲树容器 role="tree" + 方向键在节点间移动焦点
// - 字段错误提示 role="alert"（读屏可播报）
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import DesignerCanvas from '@/components/form-builder/designer/DesignerCanvas.vue'
import OutlineTree from '@/components/form-builder/designer/OutlineTree.vue'
import FieldError from '@/components/form-builder/FieldError.vue'
import { createField } from '@/components/form-builder/designer/types'
import type { DesignerNode } from '@/components/form-builder/designer/types'

function canvasWith(nodes: DesignerNode[]) {
  return mount(DesignerCanvas, {
    props: { nodes, selectedId: null },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
}

describe('画布节点键盘可达', () => {
  it('根级字段卡片可聚焦（tabindex=0）', () => {
    const w = canvasWith([createField('text', 1)])
    const card = w.find('.ldc-card')
    expect(card.attributes('tabindex')).toBe('0')
    w.unmount()
  })

  it('Enter 选中节点（派发 select），Ctrl+Enter 为多选 additive', async () => {
    const node = createField('text', 1)
    const w = canvasWith([node])
    const card = w.find('.ldc-card')
    await card.trigger('keydown', { key: 'Enter' })
    await nextTick()
    const evt = w.emitted('select')!.at(-1)!
    expect(evt[0]).toBe(node.id)
    // Ctrl+Enter：additive=true（多选语义）
    await card.trigger('keydown', { key: 'Enter', ctrlKey: true })
    await nextTick()
    expect(w.emitted('select')!.at(-1)![1]).toBe(true)
    w.unmount()
  })
})

describe('大纲树可达', () => {
  it('树容器带 role="tree"，节点 role="treeitem" 且可聚焦', () => {
    const w = mount(OutlineTree, {
      props: { nodes: [createField('text', 1)], selectedId: null },
      global: { stubs: { teleport: true } },
      attachTo: document.body,
    })
    expect(w.find('.ldo-tree').attributes('role')).toBe('tree')
    expect(w.find('[role="treeitem"]').attributes('tabindex')).toBe('0')
    w.unmount()
  })

  it('ArrowDown/ArrowUp 在节点间移动焦点', async () => {
    const w = mount(OutlineTree, {
      props: { nodes: [createField('text', 1), createField('number', 2)], selectedId: null },
      global: { stubs: { teleport: true } },
      attachTo: document.body,
    })
    await nextTick()
    const items = w.findAll('[role="treeitem"]')
    // 聚焦首项后按 ↓/↑ 移动焦点
    ;(items[0]!.element as HTMLElement).focus()
    await items[0]!.trigger('keydown', { key: 'ArrowDown' })
    expect(document.activeElement).toBe(items[1]!.element)
    await items[1]!.trigger('keydown', { key: 'ArrowUp' })
    expect(document.activeElement).toBe(items[0]!.element)
    w.unmount()
  })
})

describe('字段错误提示播报', () => {
  it('错误文本容器带 role="alert"', () => {
    const w = mount(FieldError, { props: { message: '姓名不能为空' } })
    expect(w.find('.fb-field-error').attributes('role')).toBe('alert')
    w.unmount()
  })
})
