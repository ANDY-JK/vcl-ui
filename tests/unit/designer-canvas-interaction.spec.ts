// DesignerCanvas 容器交互行为锁定：tabs 切页 / collapse 折叠 / steps 步骤导航
// 背景：画布容器交互化改造（设计时所见即所得，对齐运行时 FormBuilder 行为）
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import DesignerCanvas from '@/components/form-builder/designer/DesignerCanvas.vue'
import FormDesigner from '@/components/form-builder/FormDesigner.vue'
import type { DesignerNode } from '@/components/form-builder/designer/types'

/** 构造一个 tabs 容器（2 个标签页，各 2 个字段） */
function tabsContainer(): DesignerNode {
  return {
    id: 'c-tabs',
    type: 'tabs',
    label: '信息分页',
    isContainer: true,
    containerConfig: {
      tabs: [
        { label: '个人资料', name: 'profile' },
        { label: '工作信息', name: 'work' },
      ],
      activeTab: 'profile',
    },
    children: [
      { id: 'f1', type: 'text', label: '出生日期', key: 'birthday', containerSlot: 0 },
      { id: 'f2', type: 'text', label: '详细地址', key: 'address', containerSlot: 0 },
      { id: 'f3', type: 'text', label: '公司名称', key: 'company', containerSlot: 1 },
      { id: 'f4', type: 'text', label: '职位', key: 'jobTitle', containerSlot: 1 },
    ],
  }
}

/** 构造一个 collapse 容器（2 个折叠项：首项展开、次项收起） */
function collapseContainer(): DesignerNode {
  return {
    id: 'c-collapse',
    type: 'collapse',
    label: '更多信息',
    isContainer: true,
    containerConfig: {
      collapseItems: [
        { title: '兴趣爱好', expanded: true },
        { title: '补充说明', expanded: false },
      ],
    },
    children: [
      { id: 'f5', type: 'text', label: '兴趣爱好', key: 'hobbies', containerSlot: 0 },
      { id: 'f6', type: 'textarea', label: '备注', key: 'remark', containerSlot: 1 },
    ],
  }
}

/** 构造一个 steps 容器（2 个步骤，各 1 个字段） */
function stepsContainer(): DesignerNode {
  return {
    id: 'c-steps',
    type: 'steps',
    label: '审批流程',
    isContainer: true,
    containerConfig: {
      steps: [{ title: '申请人信息' }, { title: '审批人信息' }],
      activeStep: 0,
    },
    children: [
      { id: 'f7', type: 'text', label: '申请人', key: 'applicant', containerSlot: 0 },
      { id: 'f8', type: 'select', label: '审批人', key: 'approver', containerSlot: 1 },
    ],
  }
}

function mountCanvas(nodes: DesignerNode[]) {
  return mount(DesignerCanvas, {
    props: { nodes, selectedId: null },
    attachTo: document.body,
  })
}

describe('DesignerCanvas · tabs 容器交互', () => {
  it('默认只渲染激活 tab（第一个）的字段，其余 tab 字段不出现', () => {
    const w = mountCanvas([tabsContainer()])
    const body = w.find('.ldc-container-body')
    expect(body.text()).toContain('出生日期')
    expect(body.text()).toContain('详细地址')
    expect(body.text()).not.toContain('公司名称')
    expect(body.text()).not.toContain('职位')
  })

  it('点击第二个 tab 头 → 只渲染第二个 tab 的字段', async () => {
    const w = mountCanvas([tabsContainer()])
    const tabs = w.findAll('.ldc-tab')
    // 2 个 tab + 1 个「+ 添加」
    expect(tabs.length).toBe(3)
    await tabs[1]!.trigger('click')
    await nextTick()
    const body = w.find('.ldc-container-body')
    expect(body.text()).toContain('公司名称')
    expect(body.text()).toContain('职位')
    expect(body.text()).not.toContain('出生日期')
    expect(body.text()).not.toContain('详细地址')
  })

  it('tab 头显示各槽位字段计数徽章', () => {
    const w = mountCanvas([tabsContainer()])
    const counts = w.findAll('.ldc-tab-count')
    // 2 个 tab 徽章（各 2 个字段）
    expect(counts[0]!.text()).toBe('2')
    expect(counts[1]!.text()).toBe('2')
  })

  it('点击「+ 添加」→ emit updateContainer（tabs 追加新标签页，name 不冲突）', async () => {
    const w = mountCanvas([tabsContainer()])
    const addBtn = w.findAll('.ldc-tab').find((b) => b.text().includes('+ 添加'))
    expect(addBtn).toBeTruthy()
    await addBtn!.trigger('click')
    const events = w.emitted('update-container')
    expect(events).toBeTruthy()
    const [id, config] = events![0] as [string, { tabs: { label: string; name: string }[] }]
    expect(id).toBe('c-tabs')
    expect(config.tabs!.length).toBe(3)
    expect(config.tabs!.map((t) => t.name)).toEqual(['profile', 'work', 'tab3'])
    expect(config.tabs!.at(-1)!.label).toBe('标签页 3')
  })
})

describe('DesignerCanvas · collapse 容器交互', () => {
  it('默认按配置展开：首项字段可见、次项字段隐藏（v-show）', () => {
    const w = mountCanvas([collapseContainer()])
    const items = w.findAll('.ldc-collapse-item')
    expect(items.length).toBe(2)
    // 首项展开（字段卡片在 DOM 且可见）
    const firstBody = items[0]!.find('.ldc-slot-body')
    expect(firstBody!.attributes('style')).toBeUndefined()
    expect(firstBody!.text()).toContain('兴趣爱好')
    // 次项收起：v-show 隐藏（display:none）
    const secondBody = items[1]!.find('.ldc-slot-body')
    expect(secondBody!.attributes('style')).toContain('display: none')
  })

  it('点击折叠头切换展开状态（收起 → display:none）', async () => {
    const w = mountCanvas([collapseContainer()])
    const firstHead = w.findAll('.ldc-collapse-head')[0]!
    await firstHead.trigger('click')
    await nextTick()
    const firstBody = w.findAll('.ldc-collapse-item')[0]!.find('.ldc-slot-body')
    expect(firstBody!.attributes('style')).toContain('display: none')
    // 再点一次 → 恢复展开
    await w.findAll('.ldc-collapse-head')[0]!.trigger('click')
    await nextTick()
    expect(w.findAll('.ldc-collapse-item')[0]!.find('.ldc-slot-body')!.attributes('style')).toBeUndefined()
  })

  it('折叠头显示字段计数徽章', () => {
    const w = mountCanvas([collapseContainer()])
    const counts = w.findAll('.ldc-collapse-head .ldc-tab-count')
    expect(counts.length).toBe(2)
    expect(counts[0]!.text()).toBe('1')
    expect(counts[1]!.text()).toBe('1')
  })
})

describe('DesignerCanvas · steps 容器交互', () => {
  it('默认显示第一步字段；上一步禁用、下一步可用', () => {
    const w = mountCanvas([stepsContainer()])
    const slot = w.find('.ldc-container-body .ldc-slot-body')
    expect(slot.text()).toContain('申请人')
    expect(slot.text()).not.toContain('审批人')
    const btns = w.findAll('.ldc-steps-nav button')
    expect(btns.length).toBe(2)
    expect(btns[0]!.attributes('disabled')).toBeDefined()
    expect(btns[1]!.attributes('disabled')).toBeUndefined()
  })

  it('点击「下一步」→ 切换到第二步字段，上一步变为可用', async () => {
    const w = mountCanvas([stepsContainer()])
    const nextBtn = w.findAll('.ldc-steps-nav button')[1]!
    await nextBtn.trigger('click')
    await nextTick()
    const slot = w.find('.ldc-container-body .ldc-slot-body')
    expect(slot.text()).toContain('审批人')
    expect(slot.text()).not.toContain('申请人')
    const btns = w.findAll('.ldc-steps-nav button')
    expect(btns[0]!.attributes('disabled')).toBeUndefined()
    expect(btns[1]!.attributes('disabled')).toBeDefined()
  })

  it('点击步骤头直接切换到目标步骤（含已完成态标记）', async () => {
    const w = mountCanvas([stepsContainer()])
    const stepBtns = w.findAll('.ldc-step-btn')
    expect(stepBtns.length).toBe(2)
    await stepBtns[1]!.trigger('click')
    await nextTick()
    const slot = w.find('.ldc-container-body .ldc-slot-body')
    expect(slot.text()).toContain('审批人')
    expect(slot.text()).not.toContain('申请人')
    // 第一步变为已完成态（✓ 标记）
    expect(w.findAll('.ldc-step-btn')[0]!.text()).toContain('✓')
  })

  it('步骤头显示字段计数徽章', () => {
    const w = mountCanvas([stepsContainer()])
    const counts = w.findAll('.ldc-step-btn .ldc-tab-count')
    expect(counts.length).toBe(2)
    expect(counts[0]!.text()).toBe('1')
    expect(counts[1]!.text()).toBe('1')
  })
})

describe('FormDesigner · 容器配置更新链路（updateContainer）', () => {
  it('updateContainer 事件 → 写入 containerConfig 且可撤销恢复', async () => {
    const Wrapper = {
      components: { FormDesigner },
      data: () => ({ nodes: [tabsContainer()] as DesignerNode[] }),
      template: `<FormDesigner v-model:nodes="nodes" />`,
    }
    const w = mount(Wrapper, { global: { stubs: { teleport: true } }, attachTo: document.body })
    // 画布内点击「+ 添加」标签页
    const addBtn = w.findAll('.ldc-tab').find((b) => b.text().includes('+ 添加'))
    expect(addBtn).toBeTruthy()
    await addBtn!.trigger('click')
    await nextTick()
    // containerConfig.tabs 追加为 3 个
    const node = (w.vm as { nodes: DesignerNode[] }).nodes[0]!
    expect(node.containerConfig?.tabs?.length).toBe(3)
    // 撤销 → 恢复 2 个 tab
    const undoBtn = w.findAll('button.ld-btn').find((b) => b.text().includes('撤销'))
    expect(undoBtn!.attributes('disabled')).toBeUndefined()
    await undoBtn!.trigger('click')
    await nextTick()
    const restored = (w.vm as { nodes: DesignerNode[] }).nodes[0]!
    expect(restored.containerConfig?.tabs?.length).toBe(2)
  })
})
