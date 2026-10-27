/**
 * 导航外壳：宿主存的选中项被悄悄改掉时必须有回执（第 144 轮）。
 *
 * `useLowCodeNav` 的 `settleSelection()` 会在 refresh 后把悬空/指向分组的 `modelValue`
 * 收敛成"第一个可选项或 null"。收敛本身是对的（外壳不能渲染指向不存在项的页面），
 * 但**宿主完全不知情**：宿主把 `v-model` 存进 localStorage / 服务端，值被悄悄换掉。
 *
 * 低代码的目标是"宿主只搭框架、用户自建导航项"，所以删项/改 key/把项移进分组都是常态 ——
 * 静默篡改宿主状态会让宿主的"上次访问页"变成随机值，且排查时看不到任何痕迹。
 *
 * 本轮补：`selection-adjust` 事件（from / to / reason），原因分三档：
 * `not-found`（没有这个 key）/ `group`（是分组，不可选）/ `none`（autoSelect=false 置空）。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import LowCodeNav from '@/components/form-builder/lowcode/LowCodeNav.vue'

const NODES = [
  { key: 'g1', kind: 'group', label: '分组', children: [{ key: 'a', kind: 'custom', label: '页A' }] },
  { key: 'b', kind: 'custom', label: '页B' },
]

const staticSource = (nodes: unknown[]) => ({ kind: 'static', nodes })

const mountNav = (props: Record<string, unknown> = {}) =>
  mount(LowCodeNav, {
    props: { source: staticSource(NODES), ...props },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })

/** 取出所有 selection-adjust 的载荷 */
const adjusts = (w: ReturnType<typeof mountNav>) =>
  (w.emitted('selection-adjust') ?? []).map((args) => args[0] as Record<string, unknown>)

describe('导航外壳 · 选中项被收敛时必须通知宿主', () => {
  it('**modelValue 指向分组 → 回执原因 group**', async () => {
    const w = mountNav({ modelValue: 'g1' })
    await nextTick()
    await nextTick()
    const list = adjusts(w)
    expect(list.length, '收敛了却不通知宿主').toBeGreaterThan(0)
    expect(list[0].from).toBe('g1')
    expect(list[0].reason, '分组不可选，应与"key 不存在"区分').toBe('group')
    w.unmount()
  })

  it('**modelValue 指向已删除的项 → 回执原因 not-found**', async () => {
    const w = mountNav({ modelValue: 'no-such-key' })
    await nextTick()
    await nextTick()
    const list = adjusts(w)
    expect(list.length).toBeGreaterThan(0)
    expect(list[0].from).toBe('no-such-key')
    expect(list[0].reason).toBe('not-found')
    w.unmount()
  })

  it('回落的目标要在回执里（宿主可据此修正自己的存储）', async () => {
    const w = mountNav({ modelValue: 'g1' })
    await nextTick()
    await nextTick()
    const first = adjusts(w)[0]
    expect('to' in first, 'to 必须显式给出（含 null）').toBe(true)
    expect(first.to).toBe('a')
    w.unmount()
  })

  it('autoSelect=false 时置空 → 回执 reason=none 且 to=null', async () => {
    const w = mountNav({ modelValue: 'g1', autoSelect: false })
    await nextTick()
    await nextTick()
    const list = adjusts(w)
    expect(list.length).toBeGreaterThan(0)
    expect(list[0].reason).toBe('none')
    expect(list[0].to).toBeNull()
    w.unmount()
  })

  it('选中项有效时**不**发回执（正常路径不能有噪声）', async () => {
    const w = mountNav({ modelValue: 'b' })
    await nextTick()
    await nextTick()
    expect(adjusts(w)).toEqual([])
    expect(w.find('.lcn-page').attributes('data-key')).toBe('b')
    w.unmount()
  })

  it('refresh 后原选中项消失 → 也要回执（这是最常见的一种）', async () => {
    const w = mountNav({ modelValue: 'b' })
    await nextTick()
    await nextTick()
    expect(adjusts(w)).toEqual([])

    // 导航定义变了：用户把 b 删了
    await w.setProps({ source: staticSource([{ key: 'c', kind: 'custom', label: '页C' }]) })
    await nextTick()
    await nextTick()
    const list = adjusts(w)
    expect(list.length, '定义变了导致选中项消失，宿主必须知道').toBeGreaterThan(0)
    expect(list[0].from).toBe('b')
    expect(list[0].reason).toBe('not-found')
    expect(list[0].to).toBe('c')
    w.unmount()
  })
})
