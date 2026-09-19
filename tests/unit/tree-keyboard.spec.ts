// 修复锁定：Tree 键盘可达性 —— 方向键真的移动 DOM 焦点、Space 能勾选、treeitem 暴露 aria-checked
// 背景：move() 只改 roving tabindex 的 focusKey，不移动真实焦点 → 连续方向键原地打转；
//      勾选框 display:none 不可聚焦，树节点 Space 只触发点击不勾选，键盘用户无法勾选
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Tree from '@/components/data/Tree.vue'

const data = [
  { key: 'a', label: '甲' },
  { key: 'b', label: '乙' },
  { key: 'c', label: '丙' },
]

const mounted: Array<{ unmount: () => void }> = []

function mountTree(props: Record<string, unknown> = {}) {
  const w = mount(Tree, { props: { data, ...props }, attachTo: document.body })
  mounted.push(w)
  return w
}

function nodes(w: ReturnType<typeof mountTree>) {
  return w.findAll('.tree-node')
}

function keydown(target: Element, key: string) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
  document.body.innerHTML = ''
})

describe('Tree · 键盘导航移动真实焦点', () => {
  it('ArrowDown 把焦点移到下一个节点', async () => {
    const w = mountTree()
    const items = nodes(w)
    ;(items[0].element as HTMLElement).focus()

    keydown(items[0].element, 'ArrowDown')
    await nextTick()

    expect(document.activeElement).toBe(items[1].element)
  })

  it('连续 ArrowDown 逐级下移（不原地打转）', async () => {
    const w = mountTree()
    ;(nodes(w)[0].element as HTMLElement).focus()

    keydown(nodes(w)[0].element, 'ArrowDown')
    await nextTick()
    keydown(document.activeElement as HTMLElement, 'ArrowDown')
    await nextTick()

    expect(document.activeElement).toBe(nodes(w)[2].element)
  })

  it('ArrowUp 把焦点移回上一个节点', async () => {
    const w = mountTree()
    ;(nodes(w)[2].element as HTMLElement).focus()

    keydown(nodes(w)[2].element, 'ArrowUp')
    await nextTick()

    expect(document.activeElement).toBe(nodes(w)[1].element)
  })
})

describe('Tree · 键盘勾选', () => {
  it('treeitem 暴露 aria-checked，随勾选状态变化', async () => {
    const w = mountTree({ checkable: true })
    const first = nodes(w)[0]

    expect(first.attributes('aria-checked')).toBe('false')

    await first.find('input.tree-check-input').setValue(true)
    await nextTick()

    expect(nodes(w)[0].attributes('aria-checked')).toBe('true')
  })

  it('节点上按 Space 触发勾选', async () => {
    const w = mountTree({ checkable: true })
    const first = nodes(w)[0]
    ;(first.element as HTMLElement).focus()

    keydown(first.element, ' ')
    await nextTick()

    expect(w.emitted('check-change')).toBeTruthy()
    expect(nodes(w)[0].attributes('aria-checked')).toBe('true')
  })

  it('焦点在勾选框上按 Space 不重复触发（交给原生 checkbox）', async () => {
    const w = mountTree({ checkable: true })
    const box = nodes(w)[0].find('input.tree-check-input')
    ;(box.element as HTMLElement).focus()

    keydown(box.element, ' ')
    await nextTick()

    // happy-dom 不实现原生 Space 勾选；这里只锁「我们没抢着再切一次」
    expect(w.emitted('check-change') ?? []).toHaveLength(0)
  })

  it('勾选框视觉隐藏（clip）而非 display:none，保留可聚焦', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/data/Tree.vue'), 'utf8')
    const start = src.indexOf('.tree-check-input {')
    const rule = src.slice(start, src.indexOf('}', start))

    expect(rule).not.toContain('display: none')
    expect(rule).toMatch(/clip(-path)?:/)
  })
})
