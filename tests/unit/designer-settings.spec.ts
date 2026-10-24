/**
 * DesignerSettings.vue — 表单设置面板（399 行）逐项契约
 *
 * ## 为什么补（单文件口径 语句 51.6% / 分支 59.8% / **函数 11.1%**，42 行未覆盖）
 *
 * 这个面板此前**没有任何 spec 直接引用它**，51.6% 全部来自「经 FormDesigner 间接渲染」，
 * 于是 24 个内联事件处理器里 23 个零覆盖 —— 也就是**每一个设置项点了会 emit 什么、
 * 回显成什么，全靠肉眼**。本轮把它当纯展示组件单独挂载（inject 一个 reactive 假 manager），
 * 逐项锁定：
 *
 * ① 五组折叠的默认开合（基础/布局/提交开、校验/存储折）与点开合的 aria-expanded；
 * ② 基础组两个文本框的 emit 与回显；
 * ③ 布局组三个缩略图的 layout emit 与 active 高亮、labelPosition / labelWidth 的取值映射；
 * ④ 校验组 validateOnChange 的 '1'/'0' ↔ boolean 双向映射；
 * ⑤ 提交组 collectType 的 target/single 映射、submitText/resetText 默认文案回填、
 *    submitMode 三值、两个 switch 的 emit；
 * ⑥ **目标清单 JSON**：合法数组才 emit、非法 JSON 与非数组一律不提交（否则会误清 targets）、
 *    targets 非空时回显成 2 空格缩进 JSON；
 * ⑦ 存储组：宿主注入 store 时**整组隐藏**（存储实现由宿主接管）、cloud 模式才出现
 *    url/key/bucket 与测试按钮、测试中按钮 disabled 且文案切换、测试结果按 ok 上色；
 * ⑧ 14 个 `useIdSafe` 生成的 label/for 配对**互不重复**（字面量 id 在多实例下会指错元素）。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'

import DesignerSettings from '@/components/form-builder/designer/DesignerSettings.vue'
import { FORM_MANAGER_KEY } from '@/components/form-builder/designer/context'
import Group from '@/components/form/Group.vue'
import type { FormMeta } from '@/components/form-builder/designer/types'

/* ═══════════ 假 manager（reactive：模板里 refs 自动解包，v-model 直接写回） ═══════════ */

type FakeManager = {
  hasInjectedStore: boolean
  storageMode: 'local' | 'cloud'
  cloudUrl: string
  cloudKey: string
  cloudBucket: string
  cloudTesting: boolean
  cloudTestMsg: string
  cloudTestOk: boolean
  onModeChange: (e: Event) => void
  testCloud: () => Promise<void>
}

function makeManager(over: Partial<FakeManager> = {}): FakeManager {
  return reactive({
    hasInjectedStore: false,
    storageMode: 'local' as const,
    cloudUrl: '',
    cloudKey: '',
    cloudBucket: '',
    cloudTesting: false,
    cloudTestMsg: '',
    cloudTestOk: false,
    onModeChange: vi.fn(),
    testCloud: vi.fn(async () => {}),
    ...over,
  }) as FakeManager
}

function mountPanel(meta: FormMeta = {}, manager = makeManager()) {
  const w = mount(DesignerSettings, {
    props: { meta },
    global: { provide: { [FORM_MANAGER_KEY as symbol]: manager } },
    attachTo: document.body,
  })
  return { w, manager }
}

/** 组顺序：0 基础 / 1 布局 / 2 校验 / 3 提交 / 4 存储（宿主注入 store 时存储组不存在） */
const groups = (w: ReturnType<typeof mountPanel>['w']) => w.findAll('.ld-set-group')
const head = (w: ReturnType<typeof mountPanel>['w'], i: number) => groups(w)[i]!.find('.ld-set-group-head')
const body = (w: ReturnType<typeof mountPanel>['w'], i: number) => groups(w)[i]!.find('.ld-set-group-body')
const lastPatch = (w: ReturnType<typeof mountPanel>['w']) => {
  const ev = w.emitted('patch-meta')
  expect(ev, '至少 emit 过 patch-meta').toBeTruthy()
  return ev![ev!.length - 1]![0] as Partial<FormMeta>
}

afterEach(() => {
  document.body.innerHTML = ''
})

/* ═══════════ ① 分组折叠 ═══════════ */

describe('五组折叠', () => {
  it('**默认开合：基础/布局/提交开，校验/存储折**', async () => {
    const { w } = mountPanel()
    await flushPromises()
    expect(groups(w).length, '未注入 store 时五组都在').toBe(5)
    const expanded = [0, 1, 2, 3, 4].map((i) => head(w, i).attributes('aria-expanded'))
    expect(expanded, 'aria-expanded 与默认状态一致').toEqual(['true', 'true', 'false', 'true', 'false'])
    // v-show：折叠的组 display=none
    expect(body(w, 2).element.style.display, '校验组默认收起').toBe('none')
    expect(body(w, 4).element.style.display, '存储组默认收起').toBe('none')
    expect(body(w, 0).element.style.display, '基础组默认展开').not.toBe('none')
    w.unmount()
  })

  it('**点组头开合（四组参数化）**', async () => {
    const { w } = mountPanel()
    await flushPromises()
    for (const [i, before, after] of [
      [0, 'true', 'false'],
      [1, 'true', 'false'],
      [2, 'false', 'true'],
      [3, 'true', 'false'],
    ] as Array<[number, string, string]>) {
      expect(head(w, i).attributes('aria-expanded'), `组${i} 初始`).toBe(before)
      await head(w, i).trigger('click')
      expect(head(w, i).attributes('aria-expanded'), `组${i} 点一次后`).toBe(after)
    }
    // 循环结束时组2 已展开：再点一次收起，再点一次才回到展开（来回都验）
    await head(w, 2).trigger('click')
    expect(head(w, 2).attributes('aria-expanded'), '再点收起').toBe('false')
    expect(body(w, 2).element.style.display, 'body 跟着隐藏').toBe('none')
    await head(w, 2).trigger('click')
    expect(head(w, 2).attributes('aria-expanded'), '第三下回到展开').toBe('true')
    expect(body(w, 2).element.style.display, 'body 真的显示了').not.toBe('none')
    w.unmount()
  })
})

/* ═══════════ ② 基础组 ═══════════ */

describe('基础组：标题/描述', () => {
  it('**输入标题 emit patch-meta.title**', async () => {
    const { w } = mountPanel({ title: '旧标题' })
    await flushPromises()
    const input = groups(w)[0]!.findAll('input')[0]!
    expect((input.element as HTMLInputElement).value, '回显现有标题').toBe('旧标题')
    await input.setValue('新标题')
    expect(lastPatch(w)).toEqual({ title: '新标题' })
    w.unmount()
  })

  it('**输入描述 emit patch-meta.description**', async () => {
    const { w } = mountPanel({ description: '现有描述' })
    await flushPromises()
    const input = groups(w)[0]!.findAll('input')[1]!
    expect((input.element as HTMLInputElement).value, '回显现有描述').toBe('现有描述')
    await input.setValue('一段说明')
    expect(lastPatch(w)).toEqual({ description: '一段说明' })
    w.unmount()
  })
})

/* ═══════════ ③ 布局组 ═══════════ */

describe('布局组', () => {
  it('**三张缩略图各自 emit 对应 layout**', async () => {
    const { w } = mountPanel()
    await flushPromises()
    const thumbs = groups(w)[1]!.findAll('.ld-layout-thumb')
    expect(thumbs.length, '三张缩略图').toBe(3)
    for (const [i, layout] of ['single', 'grid', 'steps'].entries()) {
      await thumbs[i]!.trigger('click')
      expect(lastPatch(w), `第${i} 张 → ${layout}`).toEqual({ layout })
    }
    w.unmount()
  })

  it('**active 高亮跟随 meta.layout（未设置时按 single）**', async () => {
    const { w } = mountPanel({ layout: 'grid' })
    await flushPromises()
    const classes = groups(w)[1]!.findAll('.ld-layout-thumb').map((t) => t.classes())
    expect(classes[0]!.includes('active'), 'single 不高亮').toBe(false)
    expect(classes[1]!.includes('active'), 'grid 高亮').toBe(true)
    expect(classes[2]!.includes('active')).toBe(false)

    const { w: w2 } = mountPanel()
    await flushPromises()
    const c2 = groups(w2)[1]!.findAll('.ld-layout-thumb').map((t) => t.classes())
    expect(c2[0]!.includes('active'), '未设置时默认 single 高亮').toBe(true)

    // 互斥性：layout=steps 时 grid 必须不亮（只验「该亮的那张亮」抓不到恒真）
    const { w: w3 } = mountPanel({ layout: 'steps' })
    await flushPromises()
    const c3 = groups(w3)[1]!.findAll('.ld-layout-thumb').map((t) => t.classes())
    expect(c3[1]!.includes('active'), 'steps 模式下 grid 不该亮').toBe(false)
    expect(c3[2]!.includes('active'), 'steps 模式 steps 亮').toBe(true)
    w.unmount()
    w2.unmount()
    w3.unmount()
  })

  it('**labelPosition / labelWidth 的取值映射与回显**', async () => {
    const { w } = mountPanel()
    await flushPromises()
    const selects = groups(w)[1]!.findAll('select')
    expect(selects.length, '两个下拉').toBe(2)
    expect((selects[0]!.element as HTMLSelectElement).value, '默认 left').toBe('left')
    expect((selects[1]!.element as HTMLSelectElement).value, '默认 default').toBe('default')

    await selects[0]!.setValue('top')
    expect(lastPatch(w)).toEqual({ labelPosition: 'top' })
    await selects[0]!.setValue('hidden')
    expect(lastPatch(w)).toEqual({ labelPosition: 'hidden' })

    await selects[1]!.setValue('120px')
    expect(lastPatch(w)).toEqual({ labelWidth: '120px' })
    await selects[1]!.setValue('auto')
    expect(lastPatch(w)).toEqual({ labelWidth: 'auto' })
    w.unmount()
  })

  it('**回显 meta 里已有的 labelPosition/labelWidth**', async () => {
    const { w } = mountPanel({ labelPosition: 'hidden', labelWidth: '80px' })
    await flushPromises()
    const selects = groups(w)[1]!.findAll('select')
    expect((selects[0]!.element as HTMLSelectElement).value).toBe('hidden')
    expect((selects[1]!.element as HTMLSelectElement).value).toBe('80px')
    w.unmount()
  })
})

/* ═══════════ ④ 校验组 ═══════════ */

describe('校验组', () => {
  it('**validateOnChange 的 "1"/"0" ↔ boolean 双向映射**', async () => {
    const { w } = mountPanel({ validateOnChange: true })
    await flushPromises()
    await head(w, 2).trigger('click') // 展开
    const sel = groups(w)[2]!.find('select')
    expect((sel.element as HTMLSelectElement).value, 'true → "1"').toBe('1')

    await sel.setValue('0')
    expect(lastPatch(w), '"0" → false').toEqual({ validateOnChange: false })
    await sel.setValue('1')
    expect(lastPatch(w), '"1" → true').toEqual({ validateOnChange: true })

    const { w: w2 } = mountPanel()
    await flushPromises()
    await head(w2, 2).trigger('click')
    expect((groups(w2)[2]!.find('select').element as HTMLSelectElement).value, '未设置 → "0"').toBe('0')
    w.unmount()
    w2.unmount()
  })
})

/* ═══════════ ⑤ 提交组 ═══════════ */

describe('提交组', () => {
  it('**collectType 的 target/single 映射**', async () => {
    const { w } = mountPanel()
    await flushPromises()
    const sel = groups(w)[3]!.find('select')
    expect((sel.element as HTMLSelectElement).value, '默认 single').toBe('single')
    await sel.setValue('target')
    expect(lastPatch(w)).toEqual({ collectType: 'target' })
    await sel.setValue('single')
    expect(lastPatch(w)).toEqual({ collectType: 'single' })
    w.unmount()
  })

  it('**submitText / resetText 回填默认文案并可改写**', async () => {
    const { w } = mountPanel()
    await flushPromises()
    const inputs = groups(w)[3]!.findAll('input')
    expect(inputs.length, '两个文本框').toBe(2)
    // 未设置时显示 common.submit / common.reset 的占位（value 留空，靠 placeholder 提示）
    expect(inputs[0]!.attributes('placeholder'), '提交按钮占位').toBeTruthy()

    await inputs[0]!.setValue('提交登记')
    expect(lastPatch(w)).toEqual({ submitText: '提交登记' })
    await inputs[1]!.setValue('重填')
    expect(lastPatch(w)).toEqual({ resetText: '重填' })
    w.unmount()
  })

  it('**回显已有 submitText/resetText**', async () => {
    const { w } = mountPanel({ submitText: '确认提交', resetText: '清空重来' })
    await flushPromises()
    const inputs = groups(w)[3]!.findAll('input')
    expect((inputs[0]!.element as HTMLInputElement).value).toBe('确认提交')
    expect((inputs[1]!.element as HTMLInputElement).value).toBe('清空重来')
    w.unmount()
  })

  it('**submitMode 三值映射**', async () => {
    const { w } = mountPanel()
    await flushPromises()
    const selects = groups(w)[3]!.findAll('select')
    const mode = selects[1]!
    expect((mode.element as HTMLSelectElement).value, '默认 once').toBe('once')
    for (const v of ['multiple', 'unique', 'once']) {
      await mode.setValue(v)
      expect(lastPatch(w), `选 ${v}`).toEqual({ submitMode: v })
    }
    w.unmount()
  })

  it('**两个 switch 各自 emit 布尔**', async () => {
    const { w } = mountPanel()
    await flushPromises()
    const switches = groups(w)[3]!.findAllComponents(Group)
    expect(switches.length, '两个开关').toBe(2)

    switches[0]!.vm.$emit('update:modelValue', true)
    await flushPromises()
    expect(lastPatch(w), '隐藏按钮 → true').toEqual({ hideActions: true })
    switches[0]!.vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(lastPatch(w), '取消隐藏 → false').toEqual({ hideActions: false })

    switches[1]!.vm.$emit('update:modelValue', true)
    await flushPromises()
    expect(lastPatch(w), '提交后清空 → true').toEqual({ clearAfterSubmit: true })
    switches[1]!.vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(lastPatch(w), '取消清空 → false').toEqual({ clearAfterSubmit: false })
    w.unmount()
  })
})

/* ═══════════ ⑥ 目标清单 JSON ═══════════ */

describe('目标清单 JSON', () => {
  /**
   * 切到目标收集模式。注意：collectType 是 **prop**，组件只 emit patch-meta，
   * 清单输入框的 v-if 读的仍是 props —— 必须由父级回填，这正是设计器的真实数据流，
   * 所以这里显式 setProps 而不是断言「emit 后立刻出现」。
   */
  const toTarget = async (w: ReturnType<typeof mountPanel>['w']) => {
    await groups(w)[3]!.find('select').setValue('target')
    await w.setProps({ meta: { collectType: 'target' } })
    await flushPromises()
  }

  it('**collectType=single 时不出现目标清单**', async () => {
    const { w } = mountPanel()
    await flushPromises()
    expect(groups(w)[3]!.find('textarea').exists(), '单选模式没有清单输入框').toBe(false)
    w.unmount()
  })

  it('**collectType=target 时出现清单，合法数组才 emit targets**', async () => {
    const { w } = mountPanel()
    await flushPromises()
    await toTarget(w)
    const ta = groups(w)[3]!.find('textarea')
    expect(ta.exists(), '目标模式出现清单输入框').toBe(true)

    const payload = [{ id: 1, name: '门店A' }]
    await ta.setValue(JSON.stringify(payload))
    expect(lastPatch(w), '合法数组 → emit targets').toEqual({ targets: payload })
    w.unmount()
  })

  it('**非法 JSON 不提交**（否则会误清已有 targets）', async () => {
    const { w } = mountPanel({ collectType: 'target', targets: [{ id: 1, name: '保留' }] })
    await flushPromises()
    const ta = groups(w)[3]!.find('textarea')
    const before = (w.emitted('patch-meta') ?? []).length
    await ta.setValue('{ 这不是 JSON')
    expect((w.emitted('patch-meta') ?? []).length, '不该新增 patch').toBe(before)
    w.unmount()
  })

  it('**合法 JSON 但不是数组 → 不提交**（对象/字符串都不算清单）', async () => {
    const { w } = mountPanel({ collectType: 'target', targets: [{ id: 1, name: '保留' }] })
    await flushPromises()
    const ta = groups(w)[3]!.find('textarea')
    for (const bad of ['{"a":1}', '"字符串"', '42', 'null']) {
      const before = (w.emitted('patch-meta') ?? []).length
      await ta.setValue(bad)
      expect((w.emitted('patch-meta') ?? []).length, `${bad} 不该新增 patch`).toBe(before)
    }
    w.unmount()
  })

  it('**targets 非空时回显 2 空格缩进 JSON，为空时是空串**', async () => {
    const targets = [{ id: 1, name: '门店A' }]
    const { w } = mountPanel({ collectType: 'target', targets })
    await flushPromises()
    const ta = groups(w)[3]!.find('textarea')
    expect((ta.element as HTMLTextAreaElement).value).toBe(JSON.stringify(targets, null, 2))

    const { w: w2 } = mountPanel({ collectType: 'target' })
    await flushPromises()
    expect((groups(w2)[3]!.find('textarea').element as HTMLTextAreaElement).value, '无目标时为空').toBe('')
    w.unmount()
    w2.unmount()
  })
})

/* ═══════════ ⑦ 存储组 ═══════════ */

describe('存储组', () => {
  it('**宿主注入 store 时整组隐藏**（存储实现交由宿主接管）', async () => {
    const { w } = mountPanel({}, makeManager({ hasInjectedStore: true }))
    await flushPromises()
    expect(groups(w).length, '只剩四组').toBe(4)
    expect(w.text(), '不再出现存储标题').not.toContain('存储')
    w.unmount()
  })

  it('**本地模式：只有模式下拉，没有云配置**', async () => {
    const { w } = mountPanel()
    await flushPromises()
    await head(w, 4).trigger('click')
    const storage = groups(w)[4]!
    expect(storage.findAll('select').length, '一个下拉').toBe(1)
    expect(storage.findAll('input').length, '云模式才有输入框').toBe(0)
    expect(storage.find('.ld-btn').exists(), '没有测试按钮').toBe(false)
    w.unmount()
  })

  it('**切换下拉触发 manager.onModeChange**', async () => {
    const mgr = makeManager()
    const { w } = mountPanel({}, mgr)
    await flushPromises()
    await head(w, 4).trigger('click')
    const sel = groups(w)[4]!.find('select')
    await sel.trigger('change')
    expect(mgr.onModeChange, '交给 manager 处理（它要落配置）').toHaveBeenCalled()
    w.unmount()
  })

  it('**云端模式：三个输入 v-model 直写 manager，测试按钮可点**', async () => {
    const mgr = makeManager({ storageMode: 'cloud' })
    const { w } = mountPanel({}, mgr)
    await flushPromises()
    await head(w, 4).trigger('click')
    const inputs = groups(w)[4]!.findAll('input')
    expect(inputs.length, 'url/key/bucket 三个输入').toBe(3)

    await inputs[0]!.setValue('https://demo.supabase.co')
    expect(mgr.cloudUrl, 'v-model 写回 manager').toBe('https://demo.supabase.co')
    await inputs[2]!.setValue('bucket-a')
    expect(mgr.cloudBucket).toBe('bucket-a')

    await groups(w)[4]!.find('.ld-btn').trigger('click')
    expect(mgr.testCloud, '点测试按钮调 manager.testCloud').toHaveBeenCalled()
    w.unmount()
  })

  it('**测试中：按钮 disabled 且文案切成「测试中」**', async () => {
    const mgr = makeManager({ storageMode: 'cloud', cloudTesting: true })
    const { w } = mountPanel({}, mgr)
    await flushPromises()
    await head(w, 4).trigger('click')
    const btn = groups(w)[4]!.find('.ld-btn')
    expect(btn.attributes('disabled'), '测试中禁点').toBeDefined()
    const text = btn.text()
    // 正常态与测试中文案不同：这里断言「不是默认的测试文案」
    const mgr2 = makeManager({ storageMode: 'cloud' })
    const { w: w2 } = mountPanel({}, mgr2)
    await flushPromises()
    await head(w2, 4).trigger('click')
    const normalText = groups(w2)[4]!.find('.ld-btn').text()
    expect(text, '文案切到测试中').not.toBe(normalText)
    w.unmount()
    w2.unmount()
  })

  it('**测试结果按 cloudTestOk 上色，无消息时不渲染**', async () => {
    const mgr = makeManager({ storageMode: 'cloud', cloudTestMsg: '连接成功', cloudTestOk: true })
    const { w } = mountPanel({}, mgr)
    await flushPromises()
    await head(w, 4).trigger('click')
    const msg = groups(w)[4]!.find('.ld-storage-test')
    expect(msg.exists(), '显示测试结果').toBe(true)
    expect(msg.text()).toContain('连接成功')
    expect(msg.classes().includes('ok'), '成功上 ok 样式').toBe(true)

    mgr.cloudTestOk = false
    mgr.cloudTestMsg = '连接失败'
    await flushPromises()
    expect(groups(w)[4]!.find('.ld-storage-test').classes().includes('ok'), '失败不加 ok').toBe(false)

    mgr.cloudTestMsg = ''
    await flushPromises()
    expect(groups(w)[4]!.find('.ld-storage-test').exists(), '无消息不渲染').toBe(false)
    w.unmount()
  })
})

/* ═══════════ ⑧ label/for 配对唯一性 ═══════════ */

describe('label 与 for 配对', () => {
  it('**14 个 useIdSafe 生成的 id 互不重复，且 label 都指向存在的元素**', async () => {
    const { w } = mountPanel({ collectType: 'target', targets: [] }, makeManager({ storageMode: 'cloud' }))
    await flushPromises()
    // 展开全部分组，让所有控件都渲染出来
    for (const i of [2, 4]) await head(w, i).trigger('click')
    await flushPromises()

    const labels = [...document.querySelectorAll('label[for]')] as HTMLLabelElement[]
    const fors = labels.map((l) => l.getAttribute('for')!).filter(Boolean)
    expect(fors.length, '有 for 的 label').toBeGreaterThanOrEqual(13)
    expect(new Set(fors).size, 'id 互不重复（多实例下字面量 id 会指错元素）').toBe(fors.length)
    for (const id of fors) {
      expect(document.getElementById(id), `label for=${id} 指向的元素存在`).not.toBeNull()
    }
    w.unmount()
  })
})