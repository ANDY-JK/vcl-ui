/**
 * Select.vue 剩余分支 — 校验 / 外部滚动收起 / 非输入型开关 / 组合输入与键盘
 *
 * ## 为什么补（985 行，语句 84.4% / 分支 73.6% / 函数 77.1%，69 行未覆盖）
 *
 * 既有 6 个 spec 覆盖了「打开/关闭、单选、多选、搜索、标签关联」，但下列**用户可感
 * 且易回归**的分支仍为空：
 *
 * ① **校验复位**（`validate` 末尾 `errorMsg = ''`）——「先报错、用户改好后错误要消失」
 *    是表单最基本的手感；只测「报错出现」不测「报错消失」会漏掉复位分支。
 * ② **外部滚动收起**（`onExternalScroll`）——三道门：面板没开不动、滚动发生在**面板内部**
 *    不动（面板内滚动不该收起自己）、**刚打开 300ms 内不动**（防开启瞬间的滚动抖动误收），
 *    过了才收。这是移动端可用性关键。
 * ③ **非输入型的开关切换**（`toggleOpen` 已打开时再点应收起）——与输入型「再点不收起」
 *    的刻意差异（输入中误点不收起），两条语义相反，必须各自钉住。
 * ④ **组合输入全链路**（focus/input/blur/keydown）——`_BLUR_SETTLE_MS = 150` 的延迟提交
 *    是「点选项必先触发 blur」的对策；blur 后还有 4 条分叉（焦点仍在触发器内不收起、
 *    多选丢弃未提交文本、单选空文本、单选精确命中/allowCreate）。
 * ⑤ **键盘导航**（Escape / ArrowDown / ArrowUp / Enter 多选精确命中 / allowCreate 即时匹配）。
 *    源码注释写明 Enter 的 allowCreate 走 `matchOptions` **即时匹配而非防抖列表**——因为
 *    「快速输入+回车时防抖列表尚未更新，取 stale 首项会静默失败」，这条实现选择必须有测试。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import Select from '@/components/form/Select.vue'
import type { CascaderOption } from '@/components/shared/types'

const options = [
  { label: '北京', value: 'bj' },
  { label: '上海', value: 'sh' },
  { label: '广州', value: 'gz' },
  { label: '深圳', value: 'sz' },
]

function mountSelect(props: Record<string, unknown> = {}) {
  return mount(Select, {
    props: { modelValue: '', type: 'select', options, ...props },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
}

const triggerInput = (w: ReturnType<typeof mountSelect>) => w.find('input.trigger-input')

/**
 * 「真失焦」再派发 blur。
 * ⚠️ happy-dom 下 VTU 的 `trigger('blur')` **只派发事件、不移交焦点**，
 * 所以 document.activeElement 仍是输入框 → 会走进「焦点仍在触发器内 → 不收起」
 * 分支（首版 4 条单选用例全因此失败）。必须显式 `element.blur()` 让焦点真的离开。
 */
async function hardBlur(input: ReturnType<typeof triggerInput>) {
  ;(document.activeElement as HTMLElement | null)?.blur?.()
  input.element.blur()
  await input.trigger('blur')
}

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

/* ═══════════════ 校验：错误出现与复位 ═══════════════ */

describe('校验 · errorMsg 出现与复位', () => {
  const rules = [(v: string) => (v ? '' : '必填')]

  it('**规则全部通过 → 错误复位**（L179：先报错、改好后错误必须消失）', async () => {
    const w = mountSelect({ rules, modelValue: '' })
    await triggerInput(w).trigger('blur') // markTouched → validate → 报错
    expect(w.find('.select-error').exists(), '空值应报错').toBe(true)

    // 改成合法值 → watch(modelValue) 里已 touched → 重新 validate → 走「全部通过」分支
    await w.setProps({ modelValue: 'bj' })
    await nextTick()
    expect(w.find('.select-error').exists(), '改好后错误必须消失').toBe(false)
  })

  it('**首条失败即返回，后续规则不执行**（短路语义）', async () => {
    const calls: string[] = []
    const shortRules = [
      (v: string) => {
        calls.push('r1')
        return v ? '' : '第一条失败'
      },
      (v: string) => {
        calls.push('r2')
        return v ? '' : '第二条失败'
      },
    ]
    const w = mountSelect({ rules: shortRules, modelValue: '' })
    await triggerInput(w).trigger('blur')
    expect(calls, '第一条失败后不再执行第二条').toEqual(['r1'])
    expect(w.find('.select-error').text()).toContain('第一条失败')
  })

  it('**未 touched 时外部改值不触发校验**（不打扰未交互用户）', async () => {
    const w = mountSelect({ rules, modelValue: '' })
    expect(w.find('.select-error').exists()).toBe(false)
    await w.setProps({ modelValue: 'bj' })
    await nextTick()
    expect(w.find('.select-error').exists(), '没碰过就不报错').toBe(false)
  })

  it('**rules 被移除后清掉残留错误**（无 rules 分支也要复位）', async () => {
    // 先制造错误，再移除 rules 重新校验 —— 否则 errorMsg 本来就是空，
    // 「无 rules 时不清空」这一变异体不可观测（首版即因此存活）。
    const w = mountSelect({ rules: [(v: string) => (v ? '' : '必填')], modelValue: '' })
    await triggerInput(w).trigger('blur')
    expect(w.find('.select-error').exists(), '先有错误').toBe(true)

    await w.setProps({ rules: [] })
    await triggerInput(w).trigger('blur')
    expect(w.find('.select-error').exists(), '移除 rules 后残留错误必须清掉').toBe(false)
  })

  it('**未 touched 时外部改成非法值也不报错**（_touched 门真的在拦）', async () => {
    // 关键：改后的值必须**校验不通过**，否则「不短路」与「短路」结果相同（首版即因此存活）。
    const rules = [(v: string) => (v ? '' : '必填')]
    const w = mountSelect({ rules, modelValue: 'bj' })
    expect(w.find('.select-error').exists()).toBe(false)
    await w.setProps({ modelValue: '' }) // 未交互 + 变成非法值
    await nextTick()
    expect(w.find('.select-error').exists(), '没碰过就不该报错').toBe(false)
  })

  it('**无 rules 时 blur 不报错**（rules 为空直接返回）', async () => {
    const w = mountSelect({ modelValue: '' })
    await triggerInput(w).trigger('blur')
    expect(w.find('.select-error').exists()).toBe(false)
    expect(w.emitted('blur'), 'blur 事件仍要发').toBeTruthy()
  })

  it('**错误节点 role=alert**（读屏可播报）', async () => {
    const w = mountSelect({ rules, modelValue: '' })
    await triggerInput(w).trigger('blur')
    expect(w.find('.select-error').attributes('role')).toBe('alert')
  })
})

/* ═══════════════ 外部滚动收起 ═══════════════ */

describe('onExternalScroll 外部滚动收起面板', () => {
  it('**面板未打开时滚动不动作**（第一道门）', async () => {
    const w = mountSelect()
    window.dispatchEvent(new Event('scroll'))
    await nextTick()
    expect(w.find('.dropdown-panel').exists()).toBe(false)
    // 只断言「面板仍不存在」不够：open 本来就是 false，去掉守卫后 closePanel()
    // 仍然不会渲染出面板（首版即因此存活）。真正的差异是**不该发 visible-change**。
    expect(w.emitted('visible-change'), '从未打开过就不该通知可见性变化').toBeUndefined()
  })

  it('**刚打开 300ms 内滚动不收起**（防开启瞬间抖动误收）', async () => {
    const w = mountSelect()
    await triggerInput(w).trigger('click')
    expect(w.find('.dropdown-panel').exists()).toBe(true)
    window.dispatchEvent(new Event('scroll'))
    await nextTick()
    expect(w.find('.dropdown-panel').exists(), '300ms 内不收起').toBe(true)
  })

  it('**打开超过 300ms 后滚动收起**（外部滚动应关闭面板）', async () => {
    vi.useFakeTimers()
    const w = mountSelect()
    await triggerInput(w).trigger('click')
    await nextTick()
    expect(w.find('.dropdown-panel').exists()).toBe(true)

    await vi.advanceTimersByTimeAsync(301)
    window.dispatchEvent(new Event('scroll'))
    await nextTick()
    expect(w.find('.dropdown-panel').exists(), '过抑制期后收起').toBe(false)
    expect(w.emitted('visible-change')?.at(-1), '通知可见性变化').toEqual([false])
  })

  it('**滚动发生在面板内部时不收起**（面板自身滚动不该关掉自己）', async () => {
    vi.useFakeTimers()
    const w = mountSelect()
    await triggerInput(w).trigger('click')
    await nextTick()
    await vi.advanceTimersByTimeAsync(301)

    const panel = w.find('.dropdown-panel').element
    panel.dispatchEvent(new Event('scroll', { bubbles: true })) // 冒泡到 window 的捕获监听
    await nextTick()
    expect(w.find('.dropdown-panel').exists(), '面板内滚动不收起').toBe(true)
  })
})

/* ═══════════════ 非输入型的开关切换 ═══════════════ */

describe('toggleOpen 非输入型开关', () => {
  const items = [
    { label: '编辑', value: 'edit' },
    { label: '删除', value: 'del' },
  ]

  it('**menu 模式：点触发器打开，再点收起**（与输入型刻意相反）', async () => {
    const w = mountSelect({ type: 'menu', items, modelValue: '' })
    await triggerInput(w).trigger('click')
    expect(w.find('.dropdown-panel').exists()).toBe(true)
    await triggerInput(w).trigger('click')
    expect(w.find('.dropdown-panel').exists(), '非输入型再点应收起').toBe(false)
  })

  it('**disabled 时 toggleOpen 直接返回**（不打开）', async () => {
    const w = mountSelect({ type: 'menu', items, modelValue: '', disabled: true })
    // ⚠️ 必须点 `.trigger-wrapper`（真正的 @click 宿主，div）：
    //    `:disabled` 的 input 在 happy-dom 下**收不到 click**，若照旧点 input，
    //    用例会因为「事件根本没派发」而通过 —— 假绿，守卫一行都没跑到。
    await w.find('.trigger-wrapper').trigger('click')
    expect(w.find('.dropdown-panel').exists()).toBe(false)
  })

  it('**输入型（select）：打开后再点不收起**（输入中误点不关，靠外部点击/Escape）', async () => {
    const w = mountSelect()
    await triggerInput(w).trigger('click')
    expect(w.find('.dropdown-panel').exists()).toBe(true)
    await triggerInput(w).trigger('click')
    expect(w.find('.dropdown-panel').exists(), '输入型再点保持打开').toBe(true)
  })
})

/* ═══════════════ tree-select 的文字承载 ═══════════════ */

describe('tree-select 文字与 tag', () => {
  const cascaderOptions: CascaderOption[] = [
    {
      value: 'zj',
      label: '浙江',
      children: [
        { value: 'hz', label: '杭州' },
        { value: 'nb', label: '宁波' },
      ],
    },
  ]

  const treeProps = { type: 'tree-select', cascaderOptions, options: [] as typeof options }

  it('**有已选节点时 input 不重复显示文字**（tag 承载路径，L343）', async () => {
    const w = mountSelect({ ...treeProps, modelValue: ['zj', 'hz'] })
    await nextTick()
    const input = triggerInput(w)
    expect(input.element.value, 'input 留空，避免与 tag 重复').toBe('')
  })

  it('**tag 的 label 是路径拼接**（浙江 / 杭州，L358-360）', async () => {
    const w = mountSelect({ ...treeProps, modelValue: ['zj', 'hz'] })
    await nextTick()
    const html = w.html()
    // 只断言「路径标签」这一对外可见的结果；
    // 不假设末级 value 会渲染成文本/属性（那是 tag 组件的实现细节）
    expect(html, '路径以 / 拼接').toContain('浙江 / 杭州')
    // ⚠️ modelValue 是**已选节点列表**：['zj','hz'] 表示同时选中「浙江」与「杭州」，
    //    因此是两个 tag，且 label 各是「从根到该节点的路径」（父节点无前缀、子节点带父路径）。
    const texts = w.findAll('.combobox-tag .tag-text').map((n) => n.text())
    expect(texts, '每个已选节点一个 tag，label 为根到该节点的路径').toEqual(['浙江', '浙江 / 杭州'])
  })

  it('**未选中时 input 显示占位/空**（不报错）', async () => {
    const w = mountSelect({ ...treeProps, modelValue: [] })
    await nextTick()
    expect(triggerInput(w).exists()).toBe(true)
  })
})

describe('tree-select 面板聚焦与键盘选中', () => {
  const cascaderOptions: CascaderOption[] = [
    {
      value: 'zj',
      label: '浙江',
      children: [
        { value: 'hz', label: '杭州' },
        { value: 'nb', label: '宁波' },
      ],
    },
  ]
  const treeProps = { type: 'tree-select', cascaderOptions, options: [] as typeof options }

  it('**searchable 时打开面板后焦点进入搜索框**（L279：可直接输入过滤）', async () => {
    const w = mountSelect({ ...treeProps, searchable: true, modelValue: [] })
    await w.find('.trigger-wrapper').trigger('click')
    await nextTick()
    await nextTick()
    const active = document.activeElement as HTMLElement | null
    expect(w.find('.dropdown-panel').exists(), '面板已开').toBe(true)
    expect(active?.tagName, '焦点落在面板内的输入框').toBe('INPUT')
    expect(w.find('.trigger-wrapper').element.contains(active), '焦点已离开触发器').toBe(false)
  })

  it('**非 searchable 时不抢焦点**（输入框不参与过滤就不该聚焦）', async () => {
    const w = mountSelect({ ...treeProps, searchable: false, modelValue: [] })
    await w.find('.trigger-wrapper').trigger('click')
    await nextTick()
    await nextTick()
    const active = document.activeElement as HTMLElement | null
    expect(active?.tagName, '没有可聚焦的搜索框').not.toBe('INPUT')
  })

  it('**ArrowDown 打开面板，点击树节点即写值**（覆盖树选中与 emit 包装）', async () => {
    const w = mountSelect({ ...treeProps, modelValue: [] })
    const input = triggerInput(w)
    input.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }))
    await nextTick()
    await nextTick()
    expect(w.find('.dropdown-panel').exists(), 'ArrowDown 打开面板').toBe(true)

    // ⚠️ 树是「父节点点=展开、叶子点=选中」：首版直接点第一个节点（浙江，有子节点）
    //    只触发展开、不写值，断言才失败。这里先展开父节点，再点叶子。
    const roots = w.findAll('.tree-node-item')
    expect(roots.length, '初始只展开根节点').toBe(1)
    await roots[0]!.trigger('click')
    await nextTick()
    expect(w.emitted('update:modelValue'), '点父节点只展开、不写值').toBeUndefined()

    const expanded = w.findAll('.tree-node-item')
    expect(expanded.length, '展开后子节点出现').toBeGreaterThan(1)
    await expanded[expanded.length - 1]!.trigger('click') // 叶子（宁波）
    await nextTick()
    expect(w.emitted('update:modelValue'), '点叶子 → 写值').toBeTruthy()
    expect(w.emitted('change'), '同时发 change').toBeTruthy()
  })

  it('**键盘 Enter 在无高亮时不选中**（navCount 为 0 时被夹回 -1）', async () => {
    const w = mountSelect({ ...treeProps, modelValue: [] })
    const input = triggerInput(w)
    input.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }))
    await nextTick()
    input.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
    await nextTick()
    expect(w.emitted('update:modelValue'), '没有高亮项就不该写值').toBeUndefined()
  })
})

describe('menu 键盘导航', () => {
  const items = [
    { label: '编辑', value: 'edit' },
    { label: '删除', value: 'del' },
  ]

  it('**ArrowDown 打开面板并递增高亮**（非输入型走 onTriggerKeydown）', async () => {
    vi.useFakeTimers()
    const w = mountSelect({ type: 'menu', items, modelValue: '' })
    const input = triggerInput(w)
    input.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }))
    await nextTick()
    expect(w.find('.dropdown-panel').exists(), '已打开').toBe(true)

    // 打开后高亮索引由 navCount 夹取；断言 aria-activedescendant 出现且随 ArrowDown 前进
    input.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }))
    await nextTick()
    const a = input.attributes('aria-activedescendant')
    expect(a, 'menu 也有高亮指示').toBeTruthy()
    input.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }))
    await nextTick()
    const b = input.attributes('aria-activedescendant')
    expect(Number(b!.split('-').pop()), '索引递增').toBe(Number(a!.split('-').pop()) + 1)
  })

  it('**高亮时 Enter 执行菜单项 action 并收起**（onMenuClick 的实质）', async () => {
    vi.useFakeTimers()
    // ⚠️ onMenuClick 直接调用组件内的函数（关面板 + visible-change(false) + item.action?.()），
    //    **不会派发 DOM click** —— 首版去监听选项元素的 click，永远收不到（断言 0 > 0 失败）。
    //    真正的观测量是 item.action 被调用。
    const editAction = vi.fn()
    const delAction = vi.fn()
    const menuItems = [
      { label: '编辑', value: 'edit', action: editAction },
      { label: '删除', value: 'del', action: delAction },
    ]
    const w = mountSelect({ type: 'menu', items: menuItems, modelValue: '' })
    const input = triggerInput(w)
    input.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }))
    await nextTick()
    input.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }))
    await nextTick()
    input.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
    await nextTick()

    expect(editAction, '高亮第一项 → 执行它的 action').toHaveBeenCalledTimes(1)
    expect(delAction, '不该执行第二项').not.toHaveBeenCalled()
    expect(w.find('.dropdown-panel').exists(), '执行后收起').toBe(false)
    expect(w.emitted('visible-change')?.at(-1)).toEqual([false])
  })
})

/* ═══════════════ combo focus / input ═══════════════ */

describe('onComboFocus / onComboInput', () => {
  it('**focus 打开面板并 emit focus**', async () => {
    const w = mountSelect()
    await triggerInput(w).trigger('focus')
    expect(w.emitted('focus')).toBeTruthy()
    expect(w.find('.dropdown-panel').exists(), 'focus 即打开').toBe(true)
    expect(w.emitted('visible-change')?.at(-1)).toEqual([true])
  })

  it('**disabled 时 focus 直接返回**（不开面板、不发 focus）', async () => {
    const w = mountSelect({ disabled: true })
    // 同上：disabled 元素收不到 VTU 的 trigger('focus')，手动派发才算真正走到守卫
    triggerInput(w).element.dispatchEvent(new FocusEvent('focus'))
    await nextTick()
    expect(w.find('.dropdown-panel').exists()).toBe(false)
    expect(w.emitted('focus'), '不应该宣称获得焦点').toBeUndefined()
  })

  it('**focus 已打开时不重复发 visible-change**（幂等）', async () => {
    const w = mountSelect()
    await triggerInput(w).trigger('click') // 先打开
    await triggerInput(w).trigger('focus')
    const vis = w.emitted('visible-change') ?? []
    expect(vis, '只有一次 true').toEqual([[true]])
  })

  it('**多选 + clearOnFocus + 已有 tag → 清空已选**（新输入前先腾空）', async () => {
    const w = mountSelect({ multiple: true, clearOnFocus: true, modelValue: ['bj', 'sh'] })
    await nextTick()
    await triggerInput(w).trigger('focus')
    expect(w.emitted('update:modelValue')?.at(-1), '值被清空').toEqual([[]])
    expect(w.emitted('change')?.at(-1)).toEqual([[]])
  })

  it('**多选 + clearOnFocus 但无已选 → 不发清空事件**（不做无意义通知）', async () => {
    const w = mountSelect({ multiple: true, clearOnFocus: true, modelValue: [] })
    await triggerInput(w).trigger('focus')
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })

  it('**单选 + clearOnFocus → 不清空**（该行为只属于多选）', async () => {
    // 去掉 `props.multiple &&` 后单选也会清空 —— 首版没有单选样本，变异体存活。
    const w = mountSelect({ clearOnFocus: true, modelValue: 'bj' })
    await triggerInput(w).trigger('focus')
    expect(w.emitted('update:modelValue'), '单选不该被 clearOnFocus 清掉').toBeUndefined()
  })

  it('**面板未开时输入 → 打开面板**（边打字边展开）', async () => {
    const w = mountSelect()
    const input = triggerInput(w)
    await input.setValue('北')
    expect(w.find('.dropdown-panel').exists(), '输入即打开').toBe(true)
    expect(w.emitted('visible-change')?.at(-1)).toEqual([true])
  })

  it('**输入会复位高亮**（aria-activedescendant 消失）', async () => {
    vi.useFakeTimers()
    const w = mountSelect()
    const input = triggerInput(w)
    await input.trigger('click')
    await vi.advanceTimersByTimeAsync(300) // 让防抖过滤先跑完，navItems 就绪
    await input.trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    const before = input.attributes('aria-activedescendant')
    expect(before, '已产生高亮').toBeTruthy()

    await input.setValue('北') // onComboInput → highlightIdx = -1
    await nextTick()
    expect(input.attributes('aria-activedescendant'), '输入后高亮复位').toBeUndefined()
  })
})

/* ═══════════════ onComboBlur 延迟提交 ═══════════════ */

describe('onComboBlur 延迟 150ms 提交', () => {
  it('**焦点仍在触发器内 → 不收起**（多选点选后重新聚焦输入框的情形）', async () => {
    vi.useFakeTimers()
    const w = mountSelect()
    const input = triggerInput(w)
    input.element.focus()
    await input.trigger('click')
    await input.trigger('blur') // 手动派发 blur，但 activeElement 仍是输入框
    await vi.advanceTimersByTimeAsync(150)
    expect(w.find('.dropdown-panel').exists(), '焦点没真离开就不收').toBe(true)
  })

  it('**多选：丢弃未提交文本并收起**（值由 tag 承载，输入只是临时态）', async () => {
    vi.useFakeTimers()
    const w = mountSelect({ multiple: true, modelValue: [] })
    const input = triggerInput(w)
    await input.trigger('click')
    await input.setValue('北') // comboText = '北'
    await hardBlur(input)
    await vi.advanceTimersByTimeAsync(150)
    expect(w.find('.dropdown-panel').exists(), '焦点离开收起').toBe(false)
    expect(w.emitted('update:modelValue'), '不把临时文本写进值').toBeUndefined()
    // 输入框也必须被清空：否则未提交文本会残留在触发器上（去掉清空语句即失败）
    expect(input.element.value, '未提交文本必须清掉').toBe('')
  })

  it('**单选 + 空文本 → 收起且不提交**', async () => {
    vi.useFakeTimers()
    const w = mountSelect()
    const input = triggerInput(w)
    await input.trigger('click')
    await hardBlur(input)
    await vi.advanceTimersByTimeAsync(150)
    expect(w.find('.dropdown-panel').exists()).toBe(false)
    expect(w.emitted('change')).toBeUndefined()
  })

  it('**新的 blur 之后不产生提交**（焦点已回到触发器的收尾语义）', async () => {
    // ⚠️ 诚实说明：这条用例**不能**杀死「删掉 clearTimeout(blurTimer)」这个变异体。
    // 我按四种构型试过（假/真定时器 × 焦点在内/在外、错开时刻），
    // 实测**两种版本的可观测量完全相同**（都不发 update:modelValue），
    // 因此该行是一条「用当前 harness 造不出可分辨差异」的负向对照缺口，已记入报告，
    // 不在此处谎称它被覆盖。本用例只锁定它真正验证得到的收尾行为。
    vi.useFakeTimers()
    const w = mountSelect()
    const input = triggerInput(w)
    await input.trigger('click')
    await input.setValue('上海')
    await hardBlur(input) // 旧定时器：会提交
    await vi.advanceTimersByTimeAsync(100)
    await input.trigger('blur') // 新定时器：其回调时焦点已在触发器内 → 早退
    await vi.advanceTimersByTimeAsync(100)
    input.element.focus()
    await vi.advanceTimersByTimeAsync(100)
    expect(w.emitted('update:modelValue'), '被取代的 blur 不应产生提交').toBeUndefined()
  })

  it('**单选 + 精确命中 → 提交该选项并收起**', async () => {
    vi.useFakeTimers()
    const w = mountSelect()
    const input = triggerInput(w)
    await input.trigger('click')
    await input.setValue('上海') // 与 label 全等
    await hardBlur(input)
    await vi.advanceTimersByTimeAsync(150)
    expect(w.emitted('update:modelValue')?.at(-1), '提交 value 而非文本').toEqual(['sh'])
    expect(w.emitted('change')?.at(-1)).toEqual(['sh'])
    expect(w.find('.dropdown-panel').exists()).toBe(false)
  })

  it('**默认 allowCreate=true：不传该 prop 也能创建自定义值**（默认宽松）', async () => {
    // 与上一条互补：这条证明「什么都不传」时行为等于开启创建，
    // 所以任何依赖「默认拒绝新值」的调用方都必须显式传 allowCreate: false。
    vi.useFakeTimers()
    const w = mountSelect()
    const input = triggerInput(w)
    await input.trigger('click')
    await input.setValue('默认就允许的新值')
    await hardBlur(input)
    await vi.advanceTimersByTimeAsync(150)
    // 单选模式下提交载荷是标量本身（emit 记录为 [载荷]），不是再包一层数组
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['默认就允许的新值'])
  })

  it('**单选 + 无命中 + allowCreate → 提交原始文本**（自定义项）', async () => {
    vi.useFakeTimers()
    const w = mountSelect({ allowCreate: true })
    const input = triggerInput(w)
    await input.trigger('click')
    await input.setValue('新城市')
    await hardBlur(input)
    await vi.advanceTimersByTimeAsync(150)
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['新城市'])
  })

  it('**单选 + 无命中 + allowCreate=false → 不提交**（不静默造数据）', async () => {
    // ⚠️ allowCreate 的**默认值是 true**（withDefaults，L106）——首版没显式传 false，
    // 于是「未开 allowCreate」的用例其实走的是开启分支，断言失败才发现。
    // 想验证「拒绝创建」必须显式 allowCreate: false。
    vi.useFakeTimers()
    const w = mountSelect({ allowCreate: false })
    const input = triggerInput(w)
    await input.trigger('click')
    await input.setValue('不存在的城市')
    await hardBlur(input)
    await vi.advanceTimersByTimeAsync(150)
    expect(w.emitted('update:modelValue'), '不允许创建时不该写入').toBeUndefined()
    expect(w.find('.dropdown-panel').exists(), '但仍要收起').toBe(false)
  })
})

/* ═══════════════ onComboKeydown 键盘 ═══════════════ */

describe('onComboKeydown 键盘导航', () => {
  it('**Escape → 清文本并收起**', async () => {
    const w = mountSelect()
    const input = triggerInput(w)
    await input.trigger('click')
    await input.setValue('北')
    await input.trigger('keydown', { key: 'Escape' })
    expect(w.find('.dropdown-panel').exists()).toBe(false)
    expect(input.element.value, '输入文本被清空').toBe('')
  })

  it('**ArrowDown 面板关闭时 → 打开，但不产生高亮**', async () => {
    const w = mountSelect()
    const input = triggerInput(w)
    await input.trigger('keydown', { key: 'ArrowDown' })
    expect(w.find('.dropdown-panel').exists()).toBe(true)
    // 只断言「打开了」不够：去掉那个 return 后仍会打开，只是**顺带把高亮设成 0**。
    // 真正的差异是「首次打开时还没有高亮项」。
    expect(input.attributes('aria-activedescendant'), '刚打开不该有高亮').toBeUndefined()
  })

  it('**ArrowUp 高亮不回退到 -1 以下**（下界夹取为 0）', async () => {
    vi.useFakeTimers()
    const w = mountSelect()
    const input = triggerInput(w)
    await input.trigger('click')
    await vi.advanceTimersByTimeAsync(300)
    await input.trigger('keydown', { key: 'ArrowDown' }) // 0
    await nextTick()
    const first = input.attributes('aria-activedescendant')
    await input.trigger('keydown', { key: 'ArrowUp' })
    await nextTick()
    const second = input.attributes('aria-activedescendant')
    await input.trigger('keydown', { key: 'ArrowUp' })
    await nextTick()
    expect(first).toBeTruthy()
    expect(second, '上移一次').toBeTruthy()
    expect(input.attributes('aria-activedescendant'), '再上移仍是 0，不越界').toBe(second)
  })

  it('**ArrowDown 在已打开时递增高亮**', async () => {
    vi.useFakeTimers()
    const w = mountSelect()
    const input = triggerInput(w)
    await input.trigger('click')
    await vi.advanceTimersByTimeAsync(300)
    await input.trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    const a = input.attributes('aria-activedescendant')!
    await input.trigger('keydown', { key: 'ArrowDown' })
    await nextTick()
    const b = input.attributes('aria-activedescendant')!
    expect(a).not.toBe(b)
    expect(Number(b.split('-').pop()), '索引 +1').toBe(Number(a.split('-').pop()) + 1)
  })

  it('**Enter 高亮时选中该项并收起**', async () => {
    vi.useFakeTimers()
    const w = mountSelect()
    const input = triggerInput(w)
    await input.trigger('click')
    await vi.advanceTimersByTimeAsync(300)
    await input.trigger('keydown', { key: 'ArrowDown' })
    await input.trigger('keydown', { key: 'Enter' })
    await nextTick()
    expect(w.emitted('update:modelValue'), '选中第一项').toBeTruthy()
    expect(w.emitted('change')).toBeTruthy()
  })

  it('**Enter 无高亮且无文本 → 不提交**', async () => {
    const w = mountSelect()
    const input = triggerInput(w)
    await input.trigger('click')
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })

  it('**多选 + Enter + 精确命中 → 追加 value（而非文本）**', async () => {
    const w = mountSelect({ multiple: true, modelValue: [] })
    const input = triggerInput(w)
    await input.trigger('click')
    await input.setValue('北京')
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([['bj']])
    expect(input.element.value, '提交后清空输入').toBe('')
  })

  it('**多选 + Enter + 精确命中但值已存在 → 不重复追加**（幂等）', async () => {
    const w = mountSelect({ multiple: true, modelValue: ['bj'] })
    const input = triggerInput(w)
    await input.trigger('click')
    await input.setValue('北京')
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:modelValue'), '已有就不再加').toBeUndefined()
  })

  it('**多选 + Enter + 精确命中 disabled 项 → 拒绝追加**（守卫）', async () => {
    const w = mountSelect({
      multiple: true,
      modelValue: [],
      options: [...options, { label: '停用城市', value: 'off', disabled: true }],
    })
    const input = triggerInput(w)
    await input.trigger('click')
    await input.setValue('停用城市')
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:modelValue'), 'disabled 项不该被键盘选中').toBeUndefined()
  })

  it('**多选 + allowCreate + Enter → 用即时匹配结果而非原始文本**（防 stale 首项）', async () => {
    const w = mountSelect({ multiple: true, allowCreate: true, modelValue: [] })
    const input = triggerInput(w)
    await input.trigger('click')
    await input.setValue('北') // 模糊命中「北京」
    await input.trigger('keydown', { key: 'Enter' })
    expect(w.emitted('update:modelValue')?.at(-1), '落到匹配项 bj，而不是文本「北」').toEqual([['bj']])
  })

  it('**ArrowUp / ArrowDown 会 preventDefault**（避免光标跳动）', async () => {
    const w = mountSelect()
    const input = triggerInput(w)
    await input.trigger('click')
    const ev = new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true })
    input.element.dispatchEvent(ev)
    expect(ev.defaultPrevented, 'ArrowDown 被阻止默认').toBe(true)
  })
})