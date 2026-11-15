/**
 * IconPicker · morphicons 加载的**幂等与失败重试**（#491）
 *
 * 背景：`IconPicker.vue` 里两个图标源的"加载"写法不一样：
 *
 *   solar：  `if (solarIcons.value.length) return` —— 列表非空就不再加载。
 *            失败时列表仍是全量 SOLAR_ICONS（几何没注册），所以**不会**重试。
 *   morph：  `if (morphIcons.value.length) return` —— 但失败分支把 `morphIcons` 置成 `[]`，
 *            而 `[]` 的 length 也是 0 → **判据失效**：每次切到 morph 都会重新
 *            `await ensureMorphicons()` 一遍。
 *
 * 后果：morphicons 注册失败（比如那个可选 peer 没装）时，用户每次点"morphicons"
 * 标签页都会走一遍加载（可能抛错、可能发请求、可能刷 console 噪音）。
 * 组件自己有 `morphLoading` 标志，但它只挡**并发**，不挡"失败后反复重来"。
 *
 * 本文件先钉住**实际调用次数**（不改实现），再决定修法。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, ref, shallowRef } from 'vue'

const H = vi.hoisted(() => {
  return {
    ensureMorph: vi.fn(),
    ready: false,
    names: [] as string[],
  }
})

/**
 * 按**调用来源**给 ensureMorphicons 的调用归因。
 *
 * 为什么要归因：`ensureMorphicons` 有两个调用方 ——
 *   ① `IconPicker.loadMorphIcons()`（本轮被测的就是它的幂等性）；
 *   ② `IconSvg` 的**渲染函数**里 `if (!morphReady) ensureMorphicons()`。
 * ②是受保护文件里的另一件事（它每次重渲染都会重新发一次加载），本轮**不动**它，
 * 所以断言不能数总次数，否则会被②的调用污染成假红。
 * 用调用栈里的文件名区分：测试环境是源码直跑，栈里能看到 .vue 路径。
 */
function morphCallsFrom(fileHint: string): number {
  return H.ensureMorph.mock.calls.filter((c) => String((c as unknown as { stack?: string })?.stack ?? '').includes(fileHint))
    .length
}

vi.mock('@/components/_internal/useFloating', () => ({
  useFloating: () => ({
    triggerRef: shallowRef(null),
    floatingRef: shallowRef(null),
    direction: ref<'up' | 'down'>('down'),
    floatingStyle: ref<Record<string, string>>({}),
    updatePosition: vi.fn(),
    prepareOpen: vi.fn(),
  }),
}))

vi.mock('@/components/_internal/useClickOutside', () => ({
  useClickOutside: () => {},
}))

vi.mock('@/components/_internal/morphicons-registry', () => ({
  ensureMorphicons: (...args: unknown[]) => {
    const err = new Error('attribution')
    void err
    // 记录调用栈，供上方 morphCallsFrom 归因（区分 IconPicker 与 IconSvg 两个调用方）
    H.ensureMorph(...args)
    const last = H.ensureMorph.mock.calls[H.ensureMorph.mock.calls.length - 1] as unknown as { stack?: string }
    if (last) last.stack = err.stack
    return Promise.resolve()
  },
  isMorphiconsReady: () => H.ready,
  getMorphIconNames: () => H.names,
  // IconSvg 也从这里取这两个（渲染 morphicons 图标本身）；本文件只关心**加载时机**。
  // 返回可用的桩组件/节点，避免 `morphReady` 变 true 后走「图标未收录」分支
  // 刷出一条 **console-noise 基线里没有**的新告警（整链第 40 步会红）。
  getMorphIconComponent: () => defineComponent({ render: () => h('span') }),
  getMorphIconNode: () => [] as unknown as never[],
}))

import IconPicker from '@/components/form/IconPicker.vue'

function panel(): HTMLElement | null {
  return document.body.querySelector('.picker-panel')
}

function providerButtons(): HTMLButtonElement[] {
  return Array.from(document.body.querySelectorAll('.provider-switch button')) as HTMLButtonElement[]
}

async function openPanel(w: ReturnType<typeof mount>) {
  await w.find('.picker-trigger').trigger('click')
  await flushPromises()
  await new Promise((r) => setTimeout(r, 80))
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  H.ready = false
  H.names = []
  document.body.innerHTML = ''
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('IconPicker · morphicons 加载幂等（#491）', () => {
  it('加载失败后切走再切回 → 不应每次都重新加载', async () => {
    H.ensureMorph.mockImplementation(() => {
      const err = new Error('morphicons peer 未安装')
      const last = H.ensureMorph.mock.calls[H.ensureMorph.mock.calls.length - 1] as unknown as { stack?: string }
      if (last) last.stack = err.stack
      return Promise.reject(err)
    })
    const w = mount(IconPicker, { attachTo: document.body })
    await openPanel(w)

    const btns = providerButtons()
    const morphTab = btns.find((b) => /morph/i.test(b.textContent ?? ''))
    expect(morphTab, '面板里有 morphicons 标签').toBeTruthy()

    await morphTab!.click()
    await flushPromises()
    const afterFirst = morphCallsFrom('IconPicker.vue')

    // 切走再切回
    const lucideTab = btns.find((b) => /lucide/i.test(b.textContent ?? ''))
    await lucideTab!.click()
    await flushPromises()
    await morphTab!.click()
    await flushPromises()

    expect(
      morphCallsFrom('IconPicker.vue'),
      '失败过一次就该记住「试过了」，不该每次切回来都重试',
    ).toBe(afterFirst)
    w.unmount()
  })

  it('加载成功后切走再切回 → 不重复加载', async () => {
    H.ensureMorph.mockImplementation(() => {
      const err = new Error('ok')
      const last = H.ensureMorph.mock.calls[H.ensureMorph.mock.calls.length - 1] as unknown as { stack?: string }
      if (last) last.stack = err.stack
      return Promise.resolve()
    })
    H.ready = true
    H.names = ['a', 'b']
    const w = mount(IconPicker, { attachTo: document.body })
    await openPanel(w)

    const btns = providerButtons()
    const morphTab = btns.find((b) => /morph/i.test(b.textContent ?? ''))!
    await morphTab.click()
    await flushPromises()
    const afterFirst = morphCallsFrom('IconPicker.vue')
    expect(afterFirst).toBeGreaterThan(0)

    await btns.find((b) => /lucide/i.test(b.textContent ?? ''))!.click()
    await flushPromises()
    await morphTab.click()
    await flushPromises()

    expect(morphCallsFrom('IconPicker.vue'), '成功后更不该重复加载').toBe(afterFirst)
    w.unmount()
  })

  it('加载失败时面板给出可观察的状态（不静默空列表）', async () => {
    H.ensureMorph.mockImplementation(() => {
      const err = new Error('morphicons peer 未安装')
      const last = H.ensureMorph.mock.calls[H.ensureMorph.mock.calls.length - 1] as unknown as { stack?: string }
      if (last) last.stack = err.stack
      return Promise.reject(err)
    })
    const w = mount(IconPicker, { attachTo: document.body })
    await openPanel(w)
    const morphTab = providerButtons().find((b) => /morph/i.test(b.textContent ?? ''))!
    await morphTab.click()
    await flushPromises()

    const p = panel()!
    const text = p.textContent ?? ''
    // 失败要么有明确提示、要么有加载态 —— 不能是"什么都没有"
    expect(text.trim().length, '失败后面板不是空白').toBeGreaterThan(0)
    w.unmount()
  })
})
