/* eslint-disable vue/one-component-per-file -- 本文件刻意用多个临时探针组件，验同一个 id 生成函数在不同实例数下的行为；它们不是正式组件，无需各占一文件 */
/**
 * useIdCompat · 原生 useId 路径的契约（#484）
 *
 * 与 `use-id-compat-fallback.spec.ts` 成对：那份验 3.4 退化，这份验 3.5+ 原生分支。
 *
 * 这里用真实挂载而不是裸调函数 —— 因为**原生路径只在有活动组件实例时成立**。
 * 本轮修的就是这一点：`useId()` 在没有 `currentInstance` 时返回空串（dev 还会打
 * 一条 Vue 警告），而 `useIdSafe` 的返回值要进 `label[for]` / `aria-controls`：
 * 空 id 会让关联静默失效，多次调用还都拿到同一个 `''`。
 * 触发路径很现实：在 `await` 之后（setup 的实例上下文已丢）或 setup 之外调用。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { hasNativeUseId, useIdSafe } from '@/components/_internal/useIdCompat'

/** 挂一个只在 setup 里调 useIdSafe 的探针组件，取回它拿到的 id */
function probeId(prefix?: string): string {
  const Probe = defineComponent({
    setup() {
      return { id: useIdSafe(prefix) }
    },
    template: '<span>{{ id }}</span>',
  })
  const w = mount(Probe)
  const id = (w.vm as unknown as { id: string }).id
  w.unmount()
  return id
}

describe('useIdCompat · 原生 useId（Vue 3.5+，有活动实例）', () => {
  it('装了 3.5+ 就该探测到原生实现', () => {
    expect(hasNativeUseId).toBe(true)
  })

  it('实例内拿到框架生成的 id（不是本库的 vcl- 前缀）', () => {
    const id = probeId('input')
    expect(id).toBeTruthy()
    expect(id.startsWith('vcl-'), '实例内应走原生实现').toBe(false)
  })

  it('同一个 app 内两个组件实例拿到不同 id（页面内唯一是唯一要求）', () => {
    // Vue 的 useId 计数是**按 app** 走的：两次 mount() 各自建 app，都会拿 v-0，
    // 那不是缺陷。所以这里在同一个 app 里挂两个子组件来验唯一性。
    const ids: string[] = []
    const Child = defineComponent({
      setup() {
        ids.push(useIdSafe('a'))
        return () => null
      },
    })
    const Parent = defineComponent({
      setup: () => () => [h(Child), h(Child)],
    })
    const w = mount(Parent)
    expect(ids).toHaveLength(2)
    expect(ids[0]).toBeTruthy()
    expect(ids[0]).not.toBe(ids[1])
    w.unmount()
  })

  it('prefix 在原生路径被忽略（文档化取舍，不是 bug）', () => {
    expect(probeId('some-semantic-prefix').includes('some-semantic-prefix')).toBe(false)
  })
})

describe('useIdCompat · 没有活动实例时退回自增（#484）', () => {
  it('setup 之外调用：返回非空的自增 id，而不是空串', () => {
    const a = useIdSafe('outside')
    expect(a).toBeTruthy()
    expect(a).toMatch(/^vcl-outside-\d+$/)
  })

  it('连续在实例之外调用也不会撞成同一个空串', () => {
    const a = useIdSafe('outside')
    const b = useIdSafe('outside')
    expect(a).not.toBe(b)
  })
})