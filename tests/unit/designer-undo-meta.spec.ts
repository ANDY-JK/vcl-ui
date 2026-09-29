// 设计器撤销补全 · 行为锁定（真实使用审查第 2 项）
// 背景：patchMeta（表单设置）此前不进撤销栈 → 改标题/布局后 Ctrl+Z 无法恢复；
//       且画布未选中节点时 Ctrl+Z 快捷键失效。本 spec 锁定修复后的语义：
//       快照升级为 {nodes, meta} 二元组；meta 连续编辑按键名合并；undo/redo 双向恢复。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import FormDesigner from '@/components/form-builder/FormDesigner.vue'
import { createField } from '@/components/form-builder/designer/types'
import type { DesignerNode, FormMeta } from '@/components/form-builder/designer/types'

function mountControlled(nodes: DesignerNode[], meta: FormMeta = {}) {
  return mount(
    {
      components: { FormDesigner },
      data: () => ({ nodes, meta }),
      template: `<FormDesigner v-model:nodes="nodes" v-model:meta="meta" />`,
    },
    { global: { stubs: { teleport: true } }, attachTo: document.body },
  )
}

function toolbarBtn(w: ReturnType<typeof mountControlled>, text: string) {
  return w.findAll('button.ld-btn').find((b) => b.text().includes(text))
}

async function openSettings(w: ReturnType<typeof mountControlled>) {
  await toolbarBtn(w, '表单设置')!.trigger('click')
  await nextTick()
}

describe('撤销栈 · meta 覆盖', () => {
  it('改表单标题 → 撤销恢复原标题', async () => {
    const w = mountControlled([], { title: '原标题' })
    await openSettings(w)
    await w.find('input.ld-settings-textarea').setValue('新标题')
    await nextTick()
    expect((w.vm as unknown as { meta: FormMeta }).meta.title).toBe('新标题')
    await toolbarBtn(w, '撤销')!.trigger('click')
    await nextTick()
    expect((w.vm as unknown as { meta: FormMeta }).meta.title).toBe('原标题')
    w.unmount()
  })

  it('连续输入合并为一个撤销单元：两次输入只撤一步到初始值', async () => {
    const w = mountControlled([], { title: '原标题' })
    await openSettings(w)
    const input = w.find('input.ld-settings-textarea')
    await input.setValue('第一次')
    await input.setValue('第二次')
    await nextTick()
    await toolbarBtn(w, '撤销')!.trigger('click')
    await nextTick()
    expect((w.vm as unknown as { meta: FormMeta }).meta.title).toBe('原标题')
    w.unmount()
  })

  it('混合栈：加节点 → 改标题 → 撤销先恢复标题再恢复节点', async () => {
    const w = mountControlled([], { title: '原标题' })
    // 加一个节点（面板点击）
    await w
      .findAll('aside button')
      .find((b) => b.text().includes('单行输入'))!
      .trigger('click')
    await nextTick()
    expect((w.vm as unknown as { nodes: DesignerNode[] }).nodes).toHaveLength(1)
    await openSettings(w)
    await w.find('input.ld-settings-textarea').setValue('新标题')
    await nextTick()
    // 第一次撤销：meta 回退，节点保持
    await toolbarBtn(w, '撤销')!.trigger('click')
    await nextTick()
    expect((w.vm as unknown as { meta: FormMeta }).meta.title).toBe('原标题')
    expect((w.vm as unknown as { nodes: DesignerNode[] }).nodes).toHaveLength(1)
    // 第二次撤销：节点回退
    await toolbarBtn(w, '撤销')!.trigger('click')
    await nextTick()
    expect((w.vm as unknown as { nodes: DesignerNode[] }).nodes).toHaveLength(0)
    // 重做：节点回来
    await toolbarBtn(w, '重做')!.trigger('click')
    await nextTick()
    expect((w.vm as unknown as { nodes: DesignerNode[] }).nodes).toHaveLength(1)
    w.unmount()
  })

  it('undo 恢复的 meta 写回宿主（v-model:meta 双向）', async () => {
    const w = mountControlled([], { title: '原标题', submitText: '提交' })
    await openSettings(w)
    await w.find('input.ld-settings-textarea').setValue('新标题')
    await nextTick()
    await toolbarBtn(w, '撤销')!.trigger('click')
    await nextTick()
    // 宿主 meta 是完整对象（未被裁剪丢键）
    const meta = (w.vm as unknown as { meta: FormMeta }).meta
    expect(meta.title).toBe('原标题')
    expect(meta.submitText).toBe('提交')
    w.unmount()
  })
})

describe('撤销快捷键 · 未选中节点可用', () => {
  it('画布无选中时 Ctrl+Z 仍可撤销（清空后恢复）', async () => {
    const w = mountControlled([createField('text', 1)])
    await nextTick()
    // 清空 → 确认 → 节点 0（选中态也被清）
    await toolbarBtn(w, '清空')!.trigger('click')
    await nextTick()
    const confirmBtn = w.findAll('.confirm-btn').find((b) => b.text() === '清空')
    await confirmBtn!.trigger('click')
    await nextTick()
    expect((w.vm as unknown as { nodes: DesignerNode[] }).nodes).toHaveLength(0)
    // 画布未选中任何节点 → Ctrl+Z 生效
    await w.find('.ld-canvas-wrap').trigger('keydown', { key: 'z', ctrlKey: true })
    await nextTick()
    expect((w.vm as unknown as { nodes: DesignerNode[] }).nodes).toHaveLength(1)
    w.unmount()
  })
})
