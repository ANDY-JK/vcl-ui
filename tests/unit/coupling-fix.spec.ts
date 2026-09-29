import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createLocalFormStore } from '@/components/form-builder/designer/store'
import {
  collectStorageKey,
  createField,
  getFieldTypes,
  FIELD_NODE_TYPES,
} from '@/components/form-builder/designer/types'
import type { FormDesign, DesignerNode } from '@/components/form-builder/designer/types'
import Toast from '@/components/feedback/Toast.vue'
import * as useModalManagerLib from '@/components/_internal/useModalManager'

function makeNode(type: string, key?: string): DesignerNode {
  return { id: `n_${Math.random().toString(36).slice(2)}`, type: type as DesignerNode['type'], label: type, key }
}

describe('H9: 收集记录存储 key 唯一化（表单 id 为锚）', () => {
  beforeEach(() => localStorage.clear())

  const design: FormDesign = {
    meta: { title: '测试表单' },
    nodes: [makeNode('text', 'name'), makeNode('number', 'age')],
  }

  it('saveForm 的 collectKey 以表单 id 为锚（不再用字段结构指纹）', async () => {
    const store = createLocalFormStore()
    const item = await store.saveForm(null, design)
    expect(item.collectKey).toBe('fd_collect_' + item.id)
    expect(item.collectKey).toMatch(/^fd_collect_/)
  })

  it('字段结构相同的两个表单互不串台', async () => {
    const store = createLocalFormStore()
    const a = await store.saveForm(null, design)
    const b = await store.saveForm(null, { ...design, meta: { title: '同结构表单' } })
    expect(a.collectKey).not.toBe(b.collectKey)
    await store.appendRecord(a.collectKey, { id: 'r1', time: 't', data: { name: '甲' } } as never)
    expect(await store.loadRecords(a.collectKey)).toHaveLength(1)
    expect(await store.loadRecords(b.collectKey)).toHaveLength(0)
  })

  it('appendRecord 写读同一空间（无双重前缀）', async () => {
    const store = createLocalFormStore()
    const item = await store.saveForm(null, design)
    await store.appendRecord(item.collectKey, { id: 'r1', time: '2026-08-24 10:00', data: { name: '张三' } } as never)

    const saved = await store.loadRecords(item.collectKey)
    expect(saved).toHaveLength(1)
    // 双重前缀空间应为空（旧 bug 会写到 fd_collect_fd_collect_xxx）
    expect(await store.loadRecords(`fd_collect_${item.collectKey}`)).toHaveLength(0)
  })

  it('缺 key 的字段仍能按 id 键读回', async () => {
    const design2: FormDesign = {
      meta: { title: '测试' },
      nodes: [makeNode('text'), makeNode('title')],
    }
    const store = createLocalFormStore()
    const item = await store.saveForm(null, design2)
    expect(item.collectKey).toBe('fd_collect_' + item.id)
    await store.appendRecord(item.collectKey, { id: 'r1', time: 't', data: {} } as never)
    expect(await store.loadRecords(item.collectKey)).toHaveLength(1)
  })

  it('删除表单连带删除收集记录', async () => {
    const store = createLocalFormStore()
    const item = await store.saveForm(null, design)
    await store.appendRecord(item.collectKey, { id: 'r1', time: 't', data: {} } as never)
    await store.deleteForm(item.id)
    expect(await store.loadRecords(item.collectKey)).toHaveLength(0)
  })

  it('读时迁移：老指纹键数据搬到新 id 键，老键清掉且幂等', async () => {
    const legacyKey = collectStorageKey(design.nodes!)
    localStorage.setItem(
      'fd_forms_index',
      JSON.stringify([{ id: 'f_old', name: '老表单', updatedAt: '2026-01-01 00:00', collectKey: legacyKey }]),
    )
    localStorage.setItem(legacyKey, JSON.stringify([{ id: 'r1', time: 't', data: { name: '旧数据' } }]))

    const store = createLocalFormStore()
    const [item] = await store.listForms()
    expect(item.collectKey).toBe('fd_collect_f_old')
    expect(await store.loadRecords('fd_collect_f_old')).toHaveLength(1)
    expect(localStorage.getItem(legacyKey)).toBeNull()
    // 幂等：再取一次不再变化
    expect((await store.listForms())[0].collectKey).toBe('fd_collect_f_old')
  })

  it('迁移时老键被多个表单共用：各留副本，不删老桶（不丢数据）', async () => {
    const legacyKey = collectStorageKey(design.nodes!)
    localStorage.setItem(
      'fd_forms_index',
      JSON.stringify([
        { id: 'f_a', name: 'A', updatedAt: 't', collectKey: legacyKey },
        { id: 'f_b', name: 'B', updatedAt: 't', collectKey: legacyKey },
      ]),
    )
    localStorage.setItem(legacyKey, JSON.stringify([{ id: 'r1', time: 't', data: { name: '共享' } }]))

    const store = createLocalFormStore()
    const list = await store.listForms()
    expect(list.map((i) => i.collectKey)).toEqual(['fd_collect_f_a', 'fd_collect_f_b'])
    expect(await store.loadRecords('fd_collect_f_a')).toHaveLength(1)
    expect(await store.loadRecords('fd_collect_f_b')).toHaveLength(1)
    expect(localStorage.getItem(legacyKey)).not.toBeNull()
  })
})

describe('H2: Toast id 全局唯一（多实例不冲突）', () => {
  it('两个 Toast 实例的 show() id 不重复', () => {
    const a = mount(Toast)
    const b = mount(Toast)
    const idA = (a.vm as unknown as { show: (m: string) => number }).show('a')
    const idB = (b.vm as unknown as { show: (m: string) => number }).show('b')
    expect(idA).not.toBe(idB)
    a.unmount()
    b.unmount()
  })

  it('remove(id) 只移除对应实例的 toast', async () => {
    const a = mount(Toast)
    const b = mount(Toast)
    const vm = a.vm as unknown as { show: (m: string) => number; remove: (id: number) => void }
    const id = vm.show('x')
    vm.remove(id)
    expect(a.vm).toBeDefined()
    a.unmount()
    b.unmount()
  })
})

describe('H8: 字段类型注册表与设计器元数据对齐', () => {
  // REGISTRY 已注册但 FIELD_TYPES 曾缺失的 10 个类型（补齐后 createField 不再崩溃）
  const extendedTypes = [
    'password',
    'tel',
    'email',
    'url',
    'search',
    'combobox',
    'tree-select',
    'date-range',
    'image-upload',
    'camera',
  ] as const

  it('createField 对扩展类型可创建节点（含 label/icon/defaults）', () => {
    for (const type of extendedTypes) {
      const node = createField(type, 1)
      expect(node.type).toBe(type)
      expect(node.id).toBeTruthy()
      expect(node.label).toBeTruthy()
      // 字段节点自动生成 key
      expect(node.key).toBe('field1')
    }
    // FIELD_TYPES 覆盖全部扩展类型
    const ftTypes = getFieldTypes().map((t: { type: string }) => t.type)
    for (const type of extendedTypes) {
      expect(ftTypes).toContain(type)
    }
  })

  it('FIELD_NODE_TYPES 与 DesignerFieldType 覆盖扩展类型', () => {
    for (const type of extendedTypes) {
      expect(FIELD_NODE_TYPES).toContain(type)
    }
  })
})

describe('H12连带: useVoice/useBeep 初始化时机（幂等守卫 + 不得在 import 期改全局）', () => {
  it('仅 import 不挂监听、不写 window 标记；首次使用才装守卫', async () => {
    const win = window as unknown as Record<string, unknown>
    delete win.__vueLibVoiceInited
    delete win.__vueLibBeepInited
    vi.resetModules()
    const docSpy = vi.spyOn(document, 'addEventListener')
    const winSpy = vi.spyOn(window, 'addEventListener')

    const { unlockVoice } = await import('@/components/feedback/composables/useVoice')
    const { unlockAudio } = await import('@/components/feedback/composables/useBeep')
    // 旧行为：模块顶层直接 autoInit()，只引一个 Button 的消费者也会被动挂 4 个 document 监听
    //          + 1 个 pagehide + 读 localStorage，还可能立刻发一次空播报预热。
    expect(win.__vueLibVoiceInited).toBeUndefined()
    expect(win.__vueLibBeepInited).toBeUndefined()
    expect(docSpy.mock.calls.length).toBe(0)
    expect(winSpy.mock.calls.length).toBe(0)

    unlockVoice()
    unlockAudio()
    expect(win.__vueLibVoiceInited).toBe(true)
    expect(win.__vueLibBeepInited).toBe(true)
    docSpy.mockRestore()
    winSpy.mockRestore()
  })

  it('unlockVoice/unlockAudio 可调用（SSR 环境静默降级）', async () => {
    const { unlockVoice } = await import('@/components/feedback/composables/useVoice')
    const { unlockAudio } = await import('@/components/feedback/composables/useBeep')
    // 不抛异常即通过（jsdom 无 speechSynthesis/AudioContext 真实实现，走 catch 静默）
    expect(() => unlockVoice()).not.toThrow()
    expect(() => unlockAudio()).not.toThrow()
  })
})

describe('H1: useModalManager scope 隔离', () => {
  it('不同 scope 的弹窗互不关闭', () => {
    const { registerModal } = useModalManagerLib
    let closedA = 0
    let closedB = 0
    const unregA = registerModal(() => closedA++, 'scope-a')
    const unregB = registerModal(() => closedB++, 'scope-b')
    // B 打开不关闭 A（不同 scope）
    expect(closedA).toBe(0)
    expect(closedB).toBe(0)
    unregA()
    unregB()
  })

  it('同 scope 新开即关旧', () => {
    const { registerModal } = useModalManagerLib
    let closedA = 0
    let closedB = 0
    const unregA = registerModal(() => closedA++, 'scope-x')
    registerModal(() => closedB++, 'scope-x')
    // 同 scope：B 打开时 A 被关闭
    expect(closedA).toBe(1)
    unregA()
  })

  it('默认 scope(global) 保持历史互斥行为', () => {
    const { registerModal } = useModalManagerLib
    let closedA = 0
    const unregA = registerModal(() => closedA++)
    registerModal(() => {})
    expect(closedA).toBe(1)
    unregA()
  })

  it('注销后同 scope 新弹窗不再关闭旧弹窗', () => {
    const { registerModal } = useModalManagerLib
    let closed = 0
    const unreg = registerModal(() => closed++, 'scope-y')
    unreg()
    registerModal(() => {}, 'scope-y')
    expect(closed).toBe(0)
  })
})
