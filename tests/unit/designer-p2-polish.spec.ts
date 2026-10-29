// P2 体验完善四项 · FormDesigner 挂载级锁定
// P2-10 快捷键帮助面板（按钮 + ? 键开合，面板含全部快捷键）
// P2-11 card 容器设计期专属卡片视觉（type 专属 class）
// P2-12 表单设置五分组折叠（默认开合状态 + 开合切换）
// P2-13 设计器草稿接线（空画布恢复 / 非空跳过 / 变更防抖保存 / 清空即清除）
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import FormDesigner from '@/components/form-builder/FormDesigner.vue'
import { createField } from '@/components/form-builder/designer/types'
import type { DesignerNode, FormMeta } from '@/components/form-builder/designer/types'

// ── 草稿模块部分 mock：只桩掉 IndexedDB 存取三件套，useDesignerAutosave 接线逻辑走真实实现 ──
// saveDraft 自第 159 轮起返回 DraftSaveResult（用于向用户交代"有没有存下来"），桩须同步
const draftStubs = vi.hoisted(() => ({
  load: vi.fn<() => Promise<unknown>>(),
  save: vi.fn<(nodes: DesignerNode[], meta: FormMeta) => Promise<{ ok: boolean; size?: number }>>(),
  clear: vi.fn<() => Promise<void>>(),
}))
vi.mock('@/components/form-builder/designer/useDesignerDraft', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/form-builder/designer/useDesignerDraft')>()
  return {
    ...actual,
    useDesignerDraft: () => ({ loadDraft: draftStubs.load, saveDraft: draftStubs.save, clearDraft: draftStubs.clear }),
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  draftStubs.load.mockResolvedValue(null)
  draftStubs.save.mockResolvedValue({ ok: true, size: 0 })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

function mountDesigner(over: Record<string, unknown> = {}) {
  return mount(FormDesigner, {
    props: { nodes: [], meta: { title: '测试表单' }, ...over },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
}

function toolbarBtn(w: VueWrapper, text: string) {
  return w.findAll('button.ld-btn').find((b) => b.text().includes(text))
}

/** 带受控回写的挂载（v-model 双向，用于断言节点写回） */
function mountControlled(nodes: DesignerNode[], meta: Record<string, unknown> = {}) {
  return mount(
    {
      components: { FormDesigner },
      data: () => ({ nodes, meta }),
      template: `<FormDesigner v-model:nodes="nodes" v-model:meta="meta" />`,
    },
    { global: { stubs: { teleport: true } }, attachTo: document.body },
  )
}

describe('P2-10 · 快捷键帮助面板', () => {
  it('工具栏「快捷键」按钮开合面板，面板列出删除/复制/撤销等全部快捷键', async () => {
    const w = mountDesigner()
    expect(w.find('.ld-shortcuts').exists()).toBe(false)
    const scBtn = toolbarBtn(w, '快捷键')
    expect(scBtn).toBeTruthy()
    await scBtn!.trigger('click')
    await nextTick()
    const panel = w.find('.ld-shortcuts')
    expect(panel.exists()).toBe(true)
    const text = panel.text()
    // 关键快捷键齐全（键位 + 说明）
    expect(text).toContain('Delete')
    expect(text).toContain('Ctrl + D')
    expect(text).toContain('Ctrl + Z')
    expect(text).toContain('Ctrl + ↑ / ↓')
    // 画布聚焦前提提示
    expect(text).toContain('画布')
    // 再点一次关闭
    await toolbarBtn(w, '快捷键')!.trigger('click')
    await nextTick()
    expect(w.find('.ld-shortcuts').exists()).toBe(false)
  })

  it('画布聚焦时按 ? 键同样开合面板', async () => {
    const w = mountDesigner()
    await nextTick()
    const canvasWrap = w.find('.ld-canvas-wrap')
    expect(canvasWrap.exists()).toBe(true)
    await canvasWrap.trigger('keydown', { key: '?' })
    await nextTick()
    expect(w.find('.ld-shortcuts').exists()).toBe(true)
    await canvasWrap.trigger('keydown', { key: '?' })
    await nextTick()
    expect(w.find('.ld-shortcuts').exists()).toBe(false)
  })
})

describe('P2-11 · card 容器设计期卡片视觉', () => {
  it('card 容器带 ldc-container--card 专属 class，其余容器不带', async () => {
    const card = createField('card', 1)
    card.children = [createField('text', 1)]
    const grid = createField('grid', 2)
    const w = mountDesigner({ nodes: [card, grid] })
    await nextTick()
    const containers = w.findAll('.ldc-container')
    expect(containers.length).toBe(2)
    const cardEl = containers.find((c) => c.classes().includes('ldc-container--card'))
    expect(cardEl).toBeTruthy()
    // 头部显示容器 label（分组标题）
    expect(cardEl!.find('.ldc-container-label').text()).toBe(card.label)
    // grid 容器不带 card 专属 class
    const gridEl = containers.find((c) => c.text().includes(grid.label))
    expect(gridEl!.classes().includes('ldc-container--card')).toBe(false)
  })
})

describe('P2-12 · 表单设置分组折叠', () => {
  it('设置面板呈现 5 个分组：基础/布局/校验/提交/存储', async () => {
    const w = mountDesigner()
    await toolbarBtn(w, '表单设置')!.trigger('click')
    await nextTick()
    const heads = w.findAll('.ld-set-group-head')
    expect(heads.length).toBe(5)
    const labels = heads.map((h) => h.text())
    expect(labels[0]).toContain('基础')
    expect(labels[1]).toContain('布局')
    expect(labels[2]).toContain('校验')
    expect(labels[3]).toContain('提交')
    expect(labels[4]).toContain('存储')
  })

  it('默认展开基础/布局/提交，折叠校验/存储；点击分组头可切换', async () => {
    const w = mountDesigner()
    await toolbarBtn(w, '表单设置')!.trigger('click')
    await nextTick()
    const groups = w.findAll('.ld-set-group')
    const bodyOf = (i: number) => groups[i].find('.ld-set-group-body')
    // 默认：基础/布局/提交展开，校验/存储折叠
    expect(bodyOf(0).isVisible()).toBe(true)
    expect(bodyOf(1).isVisible()).toBe(true)
    expect(bodyOf(2).isVisible()).toBe(false)
    expect(bodyOf(3).isVisible()).toBe(true)
    expect(bodyOf(4).isVisible()).toBe(false)
    // 点击「校验」头 → 展开；再点 → 折叠
    await groups[2].find('.ld-set-group-head').trigger('click')
    await nextTick()
    expect(bodyOf(2).isVisible()).toBe(true)
    await groups[2].find('.ld-set-group-head').trigger('click')
    await nextTick()
    expect(bodyOf(2).isVisible()).toBe(false)
  })

  it('分组折叠后设置功能不受影响：改标题仍 emit update:meta', async () => {
    const w = mountDesigner()
    await toolbarBtn(w, '表单设置')!.trigger('click')
    await nextTick()
    const titleInput = w.find('input.ld-settings-textarea')
    await titleInput.setValue('新标题')
    expect(w.emitted('update:meta')).toBeTruthy()
    expect((w.emitted('update:meta')!.at(-1)![0] as FormMeta).title).toBe('新标题')
  })
})

describe('P2-13 · 设计器草稿自动保存接线', () => {
  it('空画布挂载：读到草稿 → 写回节点与 meta + 提示已恢复', async () => {
    const draftNodes = [createField('text', 1), createField('number', 2)]
    draftStubs.load.mockResolvedValue({
      nodes: draftNodes,
      meta: { title: '草稿表单' },
      savedAt: '2026-09-05 10:00:00',
    })
    const w = mountControlled([], {})
    await flushPromises()
    await nextTick()
    // 节点与 meta 均写回（v-model 受控）
    expect((w.vm as unknown as { nodes: DesignerNode[] }).nodes).toHaveLength(2)
    expect((w.vm as unknown as { meta: FormMeta }).meta.title).toBe('草稿表单')
    // 提示条出现
    expect(w.text()).toContain('已恢复')
    // 恢复写入不应触发重复保存（抑制标志生效）
    await new Promise((r) => setTimeout(r, 950))
    expect(draftStubs.save).not.toHaveBeenCalled()
  })

  it('宿主给定初始节点（非空白启动）：跳过草稿恢复', async () => {
    const w = mountDesigner({ nodes: [createField('text', 1)] })
    await flushPromises()
    await new Promise((r) => setTimeout(r, 950))
    expect(draftStubs.load).not.toHaveBeenCalled()
    w.unmount()
  })

  it('节点变更：防抖后自动保存（nodes + meta 落盘）', async () => {
    // 带一个节点启动（空设计不落盘：清空画布语义是清除草稿）
    const w = mountControlled([createField('text', 1)], { title: 't' })
    await flushPromises()
    // meta 变更（表单设置标题输入）触发防抖保存
    await toolbarBtn(w, '表单设置')!.trigger('click')
    await nextTick()
    await w.find('input.ld-settings-textarea').setValue('自动保存标题')
    await new Promise((r) => setTimeout(r, 950))
    expect(draftStubs.save).toHaveBeenCalled()
    const [nodes, meta] = draftStubs.save.mock.calls.at(-1)!
    expect(meta.title).toBe('自动保存标题')
    expect(nodes).toHaveLength(1)
    w.unmount()
  })

  it('节点清空：防抖后清除草稿（而非保存空设计）', async () => {
    draftStubs.load.mockResolvedValue(null)
    const w = mountControlled([createField('text', 1)], {})
    await flushPromises()
    // 清空 → 确认弹层 → 确认
    const clearBtn = w.findAll('button.ld-btn').find((b) => b.text().includes('清空'))
    await clearBtn!.trigger('click')
    await nextTick()
    const confirmBtn = w.findAll('.confirm-btn').find((b) => b.text() === '清空')
    await confirmBtn!.trigger('click')
    await nextTick()
    await new Promise((r) => setTimeout(r, 950))
    expect(draftStubs.clear).toHaveBeenCalled()
    expect(draftStubs.save).not.toHaveBeenCalled()
    w.unmount()
  })
})
