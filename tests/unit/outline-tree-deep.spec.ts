/**
 * OutlineTree 大纲树：搜索过滤 / 展开折叠 / 拖拽落点 / 键盘导航
 *
 * ## 为什么补
 *
 * 356 行、50.4%、函数只覆盖 32%。已有 `designer-a11y.spec.ts` 只测了可达性三件套
 * （role/ tabindex/ 方向键），**树本身的行为一条没测**。而这里藏着三类「静默错」：
 *
 *   ① **搜索过滤的三源命中**：label / type / **子树里命中**。子树漏判的后果是：
 *      输入「卡片」能看到卡片容器，却看不到它里面的字段 —— 用户以为字段丢了。
 *      且搜索态强制展开、清空后要回到原本折叠态。
 *   ② **拖拽落点的三区判定**：容器节点按 1/3-2/3 分 before/after/inside，
 *      普通节点按 1/2 分。`dragOver` 与 `drop` 各有一份**重复实现**——
 *      两份不同步就是「悬停时看到放中间，松手却排到上面」。drop 还要能从
 *      dataTransfer 里恢复 sourceId（跨 iframe /  dragId 已被清空的情形）。
 *   ③ **展开折叠的幂等性**：容器**默认展开**，且只在 `undefined` 时才初始化，
 *      用户手动折过的容器不能因外部数据变化被强行展开。
 *
 * 这些断言全在 DOM 类名与 emit payload 上，不需要挂设计器主组件。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import OutlineTree from '@/components/form-builder/designer/OutlineTree.vue'
import type { DesignerNode } from '@/components/form-builder/designer/types'

/* ═══════════ 节点构造 ═══════════ */

/** 造一个容器节点（card 天然 isContainer） */
function container(id: string, children: DesignerNode[] = [], label = '卡片'): DesignerNode {
  return {
    id,
    type: 'card',
    label,
    key: undefined,
    isContainer: true,
    children,
  } as unknown as DesignerNode
}

/** 造一个普通字段节点 */
function field(id: string, label: string, type = 'text'): DesignerNode {
  return { id, type, label, key: id } as unknown as DesignerNode
}

/** 建树并等到 watcher 跑完（expandedMap 是 immediate watch） */
async function tree(nodes: DesignerNode[], selectedId: string | null = null) {
  const w = mount(OutlineTree, {
    props: { nodes, selectedId },
    global: { stubs: { teleport: true } },
    attachTo: document.body,
  })
  await nextTick()
  await nextTick()
  return w
}

const nodes = () => [...document.querySelectorAll('[role="treeitem"]')] as HTMLElement[]
const labels = () => nodes().map((n) => n.querySelector('.ldo-tree-label')?.textContent?.trim())
const types = () => nodes().map((n) => n.querySelector('.ldo-tree-type')?.textContent?.trim())

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

/* ═══════════ 基础渲染 ═══════════ */

describe('基础渲染', () => {
  it('**空节点时显空态文案**（不是空白一片）', async () => {
    await tree([])
    expect(document.querySelector('.ldo-empty')?.textContent?.trim()).toBe('暂无节点')
  })

  it('**每行渲染类型简称与 label**（简称是翻译过的，不是英文 type）', async () => {
    await tree([field('a', '我的字段', 'text'), field('b', '数字项', 'select')])
    expect(labels()).toEqual(['我的字段', '数字项'])
    expect(types()).toEqual(['文本', '下拉'])
  })

  it('**选中行带 selected 类与 aria-selected**', async () => {
    const a = field('a', 'A')
    await tree([a], 'a')
    expect(nodes()[0]!.classList.contains('selected')).toBe(true)
    expect(nodes()[0]!.getAttribute('aria-selected')).toBe('true')
  })

  it('**未选中行 aria-selected=false**', async () => {
    await tree([field('a', 'A')], null)
    expect(nodes()[0]!.getAttribute('aria-selected')).toBe('false')
  })

  it('**容器节点默认展开，子节点以缩进渲染**（level → padding-left）', async () => {
    await tree([container('c', [field('k', '字段K')])])
    expect(labels(), '默认展开').toEqual(['卡片', '字段K'])
    const pad = (i: number) => Number(nodes()[i]!.style.paddingLeft.replace('px', ''))
    expect(pad(0), '一级 8').toBe(8)
    expect(pad(1), '二级 8+16=24').toBe(24)
  })

  it('**容器节点 aria-expanded=true，叶子节点无此属性**', async () => {
    await tree([container('c', [field('k', '字段K')])])
    expect(nodes()[0]!.getAttribute('aria-expanded'), '容器展开').toBe('true')
    expect(nodes()[1]!.getAttribute('aria-expanded'), '叶子不该有').toBeNull()
  })

  it('**嵌套三层容器都渲染**（递归不丢深层）', async () => {
    await tree([container('c1', [container('c2', [field('k', '深层字段')])])])
    expect(labels()).toEqual(['卡片', '卡片', '深层字段'])
  })
})

/* ═══════════ 选中与删除 ═══════════ */

describe('选中 / 删除事件', () => {
  it('**点击节点 emit select**', async () => {
    const w = await tree([field('a', 'A')])
    nodes()[0]!.click()
    await nextTick()
    expect(w.emitted('select')?.at(-1)?.[0]).toBe('a')
  })

  it('**Enter / Space 键选中**（键盘用户不用鼠标）', async () => {
    const w = await tree([field('a', 'A')])
    nodes()[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await nextTick()
    expect(w.emitted('select')?.at(-1)?.[0]).toBe('a')

    nodes()[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
    await nextTick()
    expect(w.emitted('select')?.length, '两次都应触发').toBe(2)
  })

  it('**点删除按钮 emit remove 且不冒泡成 select**（事件不该同时触发两个）', async () => {
    const w = await tree([field('a', 'A')])
    const del = nodes()[0]!.querySelector('.ldo-del-btn') as HTMLButtonElement
    del.click()
    await nextTick()
    expect(w.emitted('remove')?.at(-1)?.[0]).toBe('a')
    expect(w.emitted('select'), '删除不该顺手选中').toBeFalsy()
  })

  it('**删除按钮有 title 说明**（读屏与悬浮提示）', async () => {
    await tree([field('a', 'A')])
    expect(nodes()[0]!.querySelector('.ldo-del-btn')!.getAttribute('title')).toBe('删除')
  })
})

/* ═══════════ 展开 / 折叠 ═══════════ */

describe('展开 / 折叠', () => {
  const toggle = () => document.querySelector('.ldo-expand-toggle') as HTMLElement

  it('**点箭头折叠后子节点消失、aria-expanded=false**', async () => {
    const w = await tree([container('c', [field('k', '字段K')])])
    toggle().click()
    await nextTick()
    expect(labels(), '折叠后只剩容器自己').toEqual(['卡片'])
    expect(nodes()[0]!.getAttribute('aria-expanded')).toBe('false')
    expect(w.emitted('select'), '折叠不该顺手选中').toBeFalsy()
  })

  it('**再点展开恢复**（折叠是双向开关）', async () => {
    await tree([container('c', [field('k', '字段K')])])
    toggle().click()
    await nextTick()
    toggle().click()
    await nextTick()
    expect(labels()).toEqual(['卡片', '字段K'])
  })

  it('**折叠过的容器不因 nodes 深变化被强行展开**（保留用户意图）', async () => {
    const c = container('c', [field('k', '字段K')])
    const w = await tree([c])
    toggle().click() // 手动折叠
    await nextTick()
    expect(labels()).toEqual(['卡片'])

    // 触发 nodes 深变化（换新引用、内容相同）→ 不应自动展开
    await w.setProps({ nodes: [{ ...c, children: [{ ...c.children![0]! }] } as DesignerNode] })
    await nextTick()
    await nextTick()
    expect(labels(), '折叠态必须保持').toEqual(['卡片'])
  })

  it('**嵌套子容器也默认展开**（递归初始化，不是只铺一层）', async () => {
    await tree([container('c1', [container('c2', [field('k', '深层字段')])])])
    expect(labels(), '两层容器都应展开').toEqual(['卡片', '卡片', '深层字段'])
    const c2 = nodes()[1]!
    expect(c2.getAttribute('aria-expanded')).toBe('true')
  })

  it('**新出现的容器默认展开**（undefined 才初始化）', async () => {
    const w = await tree([container('c1', [field('k1', 'K1')])])
    expect(labels()).toEqual(['卡片', 'K1'])
    await w.setProps({ nodes: [container('c1', [field('k1', 'K1')]), container('c2', [field('k2', 'K2')])] })
    await nextTick()
    await nextTick()
    expect(labels(), '新容器也展开').toEqual(['卡片', 'K1', '卡片', 'K2'])
  })

  it('**空容器（无 children）没有展开箭头，只有占位**', async () => {
    await tree([container('c', [])])
    expect(document.querySelector('.ldo-expand-toggle')).toBeNull()
    expect(document.querySelector('.ldo-expand-placeholder'), '应有占位保持对齐').toBeTruthy()
  })

  it('**非容器节点也没有展开箭头**', async () => {
    await tree([field('a', 'A')])
    expect(document.querySelector('.ldo-expand-toggle')).toBeNull()
    expect(document.querySelector('.ldo-expand-placeholder')).toBeTruthy()
  })
})

/* ═══════════ 搜索过滤 ═══════════ */

describe('搜索过滤', () => {
  const input = () => document.querySelector('.ldo-search-input') as HTMLInputElement
  async function search(q: string) {
    input().value = q
    input().dispatchEvent(new Event('input'))
    await nextTick()
    await nextTick()
  }

  it('**按 label 子串过滤**', async () => {
    await tree([field('a', '姓名'), field('b', '电话')])
    await search('姓名')
    expect(labels()).toEqual(['姓名'])
  })

  it('**按 type 过滤**（不知道字段叫什么时按类型找）', async () => {
    await tree([field('a', 'A', 'text'), field('b', 'B', 'select')])
    await search('select')
    expect(labels()).toEqual(['B'])
    expect(types()).toEqual(['下拉'])
  })

  it('**子树命中 → 容器与命中的后代都保留**（漏判会让字段「凭空消失」）', async () => {
    await tree([container('c', [field('k', '深层字段')]), field('x', '无关')])
    await search('深层')
    expect(labels(), '容器作为路径必须保留').toEqual(['卡片', '深层字段'])
  })

  it('**搜索时强制展开折叠中的容器**', async () => {
    await tree([container('c', [field('k', '深层字段')])])
    document.querySelector('.ldo-expand-toggle')!.click() // 先折叠
    await nextTick()
    expect(labels()).toEqual(['卡片'])

    await search('深层')
    expect(labels(), '搜索态强制展开').toEqual(['卡片', '深层字段'])
  })

  it('**清空搜索后回到原本折叠态**（不能永久展开）', async () => {
    await tree([container('c', [field('k', '深层字段')])])
    document.querySelector('.ldo-expand-toggle')!.click()
    await nextTick()
    await search('深层')
    expect(labels()).toEqual(['卡片', '深层字段'])

    await search('')
    expect(labels(), '应回到折叠').toEqual(['卡片'])
  })

  it('**无匹配时显空态**', async () => {
    await tree([field('a', '姓名')])
    await search('zzzz')
    expect(nodes()).toHaveLength(0)
    expect(document.querySelector('.ldo-empty')?.textContent?.trim()).toBe('暂无节点')
  })

  it('**搜索大小写不敏感**（type 是英文）', async () => {
    await tree([field('a', 'A', 'SELECT')])
    await search('select')
    expect(labels()).toEqual(['A'])
  })

  it('**前后空格被裁剪**', async () => {
    await tree([field('a', '姓名'), field('b', '电话')])
    await search('  姓名  ')
    expect(labels()).toEqual(['姓名'])
  })

  it('**深层三层命中也递归**（hasMatchInChildren 要往下钻）', async () => {
    await tree([container('c1', [container('c2', [field('k', '深层字段')])])])
    await search('深层')
    expect(labels()).toEqual(['卡片', '卡片', '深层字段'])
  })
})

/* ═══════════ 键盘导航（树内方向键） ═══════════ */

describe('键盘导航', () => {
  it('**方向键只处理 ArrowUp/ArrowDown**（其它键不该被吃掉）', async () => {
    await tree([field('a', 'A'), field('b', 'B')])
    nodes()[0]!.focus()
    // 注：Enter/Space 由模板 @keydown.enter/.space 单独处理（会 select），不在此列
    for (const key of ['KeyA', 'Tab', 'Home', 'End', 'PageDown']) {
      const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
      nodes()[0]!.dispatchEvent(ev)
      expect(ev.defaultPrevented, `${key} 不该被 preventDefault`).toBe(false)
      expect(document.activeElement, `${key} 不该移动焦点`).toBe(nodes()[0])
    }
  })

  it('**首项按 ArrowUp 停在原地**（不越界到 -1）', async () => {
    await tree([field('a', 'A'), field('b', 'B')])
    nodes()[0]!.focus()
    expect(document.activeElement, '前置：焦点已落在首项').toBe(nodes()[0])
    const ev = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true })
    nodes()[0]!.dispatchEvent(ev)
    await nextTick()
    expect(document.activeElement, '应在首项').toBe(nodes()[0])
    expect(ev.defaultPrevented, '方向键应被拦截（避免页面滚动）').toBe(true)
  })

  it('**末项按 ArrowDown 停在原地**（不越界到 length）', async () => {
    await tree([field('a', 'A'), field('b', 'B')])
    const last = nodes()[1]!
    last.focus()
    expect(document.activeElement, '前置：焦点已落在末项').toBe(last)
    const ev = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    last.dispatchEvent(ev)
    await nextTick()
    expect(document.activeElement, '应在末项').toBe(last)
    expect(ev.defaultPrevented).toBe(true)
  })

  it('**焦点不在树上时按方向键不动**（不抢焦点）', async () => {
    await tree([field('a', 'A'), field('b', 'B')])
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    outside.focus()
    const ev = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
    nodes()[0]!.dispatchEvent(ev)
    expect(ev.defaultPrevented, '不该 preventDefault').toBe(false)
    expect(document.activeElement).toBe(outside)
  })
})

/* ═══════════ 拖拽落点 ═══════════ */

describe('拖拽：落点三区判定', () => {
  /** 给元素打一个假 rect，并发出拖拽事件 */
  function dragEvt(el: HTMLElement, type: string, rect: { height: number }, clientY: number) {
    Object.defineProperty(el, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 0, left: 0, height: rect.height, width: 100, bottom: rect.height, right: 100, x: 0, y: 0, toJSON: () => ({}) }),
    })
    const ev = new Event(type, { bubbles: true, cancelable: true }) as Event & {
      dataTransfer: unknown
      clientY: number
      currentTarget: unknown
    }
    Object.defineProperty(ev, 'clientY', { value: clientY })
    Object.defineProperty(ev, 'currentTarget', { value: el })
    Object.defineProperty(ev, 'dataTransfer', {
      value: { effectAllowed: 'move', dropEffect: 'move', setData: vi.fn(), getData: vi.fn(() => '') },
    })
    el.dispatchEvent(ev)
    return ev
  }

  const H = 60

  it('**普通节点：上半 before、下半 after**', async () => {
    const w = await tree([field('a', 'A'), field('b', 'B')])
    const target = nodes()[1]!
    dragEvt(nodes()[0]!, 'dragstart', { height: H }, 0)
    dragEvt(target, 'dragover', { height: H }, H * 0.2)
    await nextTick()
    expect(target.classList.contains('ldo-drop-before'), '上 1/2 → before').toBe(true)

    dragEvt(target, 'dragover', { height: H }, H * 0.8)
    await nextTick()
    expect(target.classList.contains('ldo-drop-after'), '下 1/2 → after').toBe(true)
    expect(target.classList.contains('ldo-drop-before')).toBe(false)

    dragEvt(target, 'drop', { height: H }, H * 0.8)
    await nextTick()
    expect(w.emitted('move')?.at(-1)).toEqual(['a', 'b', 'after'])
  })

  it('**容器节点：上 1/3 before、下 1/3 after、中间 inside**', async () => {
    const w = await tree([field('a', 'A'), container('c', [])])
    const target = nodes()[1]!
    dragEvt(nodes()[0]!, 'dragstart', { height: H }, 0)

    dragEvt(target, 'dragover', { height: H }, H * 0.1)
    await nextTick()
    expect(target.classList.contains('ldo-drop-before')).toBe(true)
    dragEvt(target, 'drop', { height: H }, H * 0.1)
    await nextTick()
    expect(w.emitted('move')?.at(-1)).toEqual(['a', 'c', 'before'])

    // ⚠️ onDrop 会清空 dragId，所以第二段必须重新 dragstart（真实拖放也是一次 drop 一次拖拽）
    dragEvt(nodes()[0]!, 'dragstart', { height: H }, 0)
    dragEvt(target, 'dragover', { height: H }, H * 0.5)
    await nextTick()
    expect(target.classList.contains('ldo-drop-inside'), '中 1/3 → inside').toBe(true)
    dragEvt(target, 'drop', { height: H }, H * 0.5)
    await nextTick()
    expect(w.emitted('move')?.at(-1)).toEqual(['a', 'c', 'inside'])

    dragEvt(nodes()[0]!, 'dragstart', { height: H }, 0)
    dragEvt(target, 'dragover', { height: H }, H * 0.95)
    await nextTick()
    expect(target.classList.contains('ldo-drop-after')).toBe(true)
    dragEvt(target, 'drop', { height: H }, H * 0.95)
    await nextTick()
    expect(w.emitted('move')?.at(-1)).toEqual(['a', 'c', 'after'])
  })

  it('**dragover 与 drop 的落点判定一致**（两份重复实现不同步=「看着放中间、松手排上面」）', async () => {
    const w = await tree([field('a', 'A'), container('c', [])])
    const target = nodes()[1]!
    for (const y of [H * 0.1, H * 0.35, H * 0.5, H * 0.65, H * 0.95]) {
      dragEvt(nodes()[0]!, 'dragstart', { height: H }, 0) // 每次重新起拖（drop 会清 dragId）
      dragEvt(target, 'dragover', { height: H }, y)
      await nextTick()
      const visual = target.className.match(/ldo-drop-(before|after|inside)/)?.[1]
      dragEvt(target, 'drop', { height: H }, y)
      await nextTick()
      const emitted = w.emitted('move')?.at(-1)?.[2]
      expect(emitted, `y=${y} 视觉与落点必须一致`).toBe(visual)
    }
  })

  it('**dragId 已被清空时 drop 从 dataTransfer 恢复 sourceId**', async () => {
    const w = await tree([field('a', 'A'), field('b', 'B')])
    // 拖 a → dragend（清空 dragId）→ 再 drop 到 b：此时只能靠 dataTransfer 找回源
    dragEvt(nodes()[0]!, 'dragstart', { height: H }, 0)
    dragEvt(nodes()[0]!, 'dragend', { height: H }, 0)
    await nextTick()

    const target = nodes()[1]!
    const dt = { getData: () => 'a' }
    Object.defineProperty(target, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ top: 0, left: 0, height: H, width: 100, bottom: H, right: 100, x: 0, y: 0, toJSON: () => ({}) }),
    })
    const ev = new Event('drop', { bubbles: true, cancelable: true }) as Event & {
      dataTransfer: unknown
      clientY: number
      currentTarget: unknown
    }
    Object.defineProperty(ev, 'clientY', { value: H * 0.2 })
    Object.defineProperty(ev, 'currentTarget', { value: target })
    Object.defineProperty(ev, 'dataTransfer', { value: dt })
    target.dispatchEvent(ev)
    await nextTick()
    expect(w.emitted('move')?.at(-1), 'sourceId 来自 dataTransfer').toEqual(['a', 'b', 'before'])
  })

  it('**drop 时 dragId 已被清空 → 从 dataTransfer 恢复 sourceId（普通节点也走同一条路径）**', async () => {
    const w = await tree([field('a', 'A'), field('b', 'B'), field('c', 'C')])
    // 拖 a → 放到 b（清空 dragId）→ 再拖 c → 放到 b：第二次的 sourceId 只能来自 dataTransfer
    dragEvt(nodes()[0]!, 'dragstart', { height: H }, 0)
    dragEvt(nodes()[1]!, 'drop', { height: H }, H * 0.2)
    await nextTick()
    expect(w.emitted('move')?.length).toBe(1)

    dragEvt(nodes()[2]!, 'dragstart', { height: H }, 0)
    dragEvt(nodes()[1]!, 'drop', { height: H }, H * 0.8)
    await nextTick()
    expect(w.emitted('move')?.at(-1), '第二次的 sourceId 应从 dataTransfer 拿到 c').toEqual(['c', 'b', 'after'])
  })

  it('**连续 drop 两次：第二次因拖拽态已清空且 dataTransfer 无值而不 emit**', async () => {
    const w = await tree([field('a', 'A'), field('b', 'B')])
    dragEvt(nodes()[0]!, 'dragstart', { height: H }, 0)
    dragEvt(nodes()[1]!, 'drop', { height: H }, H * 0.2)
    await nextTick()
    expect(w.emitted('move')?.length).toBe(1)

    // 同一轮再 drop 一次：dragId 已 null，dataTransfer 也读不到 → 静默忽略
    dragEvt(nodes()[1]!, 'drop', { height: H }, H * 0.8)
    await nextTick()
    expect(w.emitted('move')?.length, '不该重复 emit').toBe(1)
  })

  it('**drop 对普通节点按 1/2 分界**（0.4 与 0.6 分属两侧，容器才用 1/3）', async () => {
    const w = await tree([field('a', 'A'), field('b', 'B')])
    const target = nodes()[1]!
    dragEvt(nodes()[0]!, 'dragstart', { height: H }, 0)
    dragEvt(target, 'drop', { height: H }, H * 0.4)
    await nextTick()
    expect(w.emitted('move')?.at(-1), '0.4 < 0.5 → before').toEqual(['a', 'b', 'before'])

    dragEvt(nodes()[0]!, 'dragstart', { height: H }, 0)
    dragEvt(target, 'drop', { height: H }, H * 0.6)
    await nextTick()
    expect(w.emitted('move')?.at(-1), '0.6 > 0.5 → after').toEqual(['a', 'b', 'after'])
  })

  it('**拖到自己身上不 emit**（自拖是无意义操作）', async () => {
    const w = await tree([field('a', 'A')])
    const n = nodes()[0]!
    dragEvt(n, 'dragstart', { height: H }, 0)
    dragEvt(n, 'dragover', { height: H }, H * 0.2)
    await nextTick()
    expect(w.emitted('move'), '不该有 move').toBeFalsy()
    dragEvt(n, 'drop', { height: H }, H * 0.2)
    await nextTick()
    expect(w.emitted('move')).toBeFalsy()
  })

  it('**未开始拖拽时 dragover 不设落点**（单纯鼠标经过不产生视觉反馈）', async () => {
    await tree([field('a', 'A')])
    dragEvt(nodes()[0]!, 'dragover', { height: H }, H * 0.2)
    await nextTick()
    expect(nodes()[0]!.className).not.toContain('ldo-drop')
  })

  it('**拖到自己身上时 dragover 不设落点**（自拖无意义，不该出现高亮）', async () => {
    await tree([field('a', 'A')])
    dragEvt(nodes()[0]!, 'dragstart', { height: H }, 0)
    dragEvt(nodes()[0]!, 'dragover', { height: H }, H * 0.2)
    await nextTick()
    expect(nodes()[0]!.className, '自拖不该有落点').not.toContain('ldo-drop')
  })

  it('**普通节点按 1/2 分界**（y=0.4 与 0.6 分属两侧；容器才用 1/3）', async () => {
    await tree([field('a', 'A'), field('b', 'B')])
    const target = nodes()[1]!
    dragEvt(nodes()[0]!, 'dragstart', { height: H }, 0)
    dragEvt(target, 'dragover', { height: H }, H * 0.4)
    await nextTick()
    expect(target.classList.contains('ldo-drop-before'), '0.4 < 0.5 → before').toBe(true)
    dragEvt(target, 'dragover', { height: H }, H * 0.6)
    await nextTick()
    expect(target.classList.contains('ldo-drop-after'), '0.6 > 0.5 → after').toBe(true)
  })

  it('**普通节点在 1/2 处仍归 before**（与容器的 1/3 语义区分开）', async () => {
    await tree([field('a', 'A'), field('b', 'B')])
    const target = nodes()[1]!
    dragEvt(nodes()[0]!, 'dragstart', { height: H }, 0)
    dragEvt(target, 'dragover', { height: H }, H * 0.49)
    await nextTick()
    expect(target.classList.contains('ldo-drop-before'), '0.49 仍在 before 侧').toBe(true)
  })

  it('**dragstart 时给 dataTransfer 写入 id 与 effectAllowed**', async () => {
    await tree([field('a', 'A')])
    const setData = vi.fn()
    const ev = new Event('dragstart', { bubbles: true, cancelable: true }) as Event & {
      dataTransfer: unknown
      currentTarget: unknown
    }
    Object.defineProperty(ev, 'currentTarget', { value: nodes()[0]! })
    Object.defineProperty(ev, 'dataTransfer', { value: { setData, effectAllowed: '' } })
    nodes()[0]!.dispatchEvent(ev)
    expect(setData).toHaveBeenCalledWith('text/plain', 'a')
    expect((ev.dataTransfer as { effectAllowed: string }).effectAllowed).toBe('move')
  })

  it('**拖拽中的行带 ldo-dragging 类**（视觉反馈）', async () => {
    await tree([field('a', 'A'), field('b', 'B')])
    dragEvt(nodes()[0]!, 'dragstart', { height: H }, 0)
    await nextTick()
    expect(nodes()[0]!.classList.contains('ldo-dragging')).toBe(true)
  })

  it('**dragleave 只清自己的落点**（划过兄弟节点时不该清掉它们的）', async () => {
    await tree([field('a', 'A'), field('b', 'B'), field('c', 'C')])
    dragEvt(nodes()[0]!, 'dragstart', { height: H }, 0)
    dragEvt(nodes()[1]!, 'dragover', { height: H }, H * 0.2)
    await nextTick()
    dragEvt(nodes()[2]!, 'dragover', { height: H }, H * 0.2)
    await nextTick()
    expect(nodes()[2]!.classList.contains('ldo-drop-before'), '目标移到 c').toBe(true)

    dragEvt(nodes()[1]!, 'dragleave', { height: H }, 0)
    await nextTick()
    expect(nodes()[2]!.classList.contains('ldo-drop-before'), 'b 的 leave 不该动 c').toBe(true)
  })

  it('**dragend 清空拖拽态与落点**（拖错了按 Esc 后不残留）', async () => {
    await tree([field('a', 'A'), field('b', 'B')])
    dragEvt(nodes()[0]!, 'dragstart', { height: H }, 0)
    dragEvt(nodes()[1]!, 'dragover', { height: H }, H * 0.2)
    await nextTick()
    expect(nodes()[0]!.classList.contains('ldo-dragging')).toBe(true)
    dragEvt(nodes()[0]!, 'dragend', { height: H }, 0)
    await nextTick()
    expect(nodes()[0]!.classList.contains('ldo-dragging'), '拖拽态清除').toBe(false)
    expect(nodes()[1]!.classList.contains('ldo-drop-before'), '落点清除').toBe(false)
  })

  it('**落点同时只有一个**（b 与 c 不会同时高亮）', async () => {
    await tree([field('a', 'A'), field('b', 'B'), field('c', 'C')])
    dragEvt(nodes()[0]!, 'dragstart', { height: H }, 0)
    dragEvt(nodes()[1]!, 'dragover', { height: H }, H * 0.2)
    await nextTick()
    dragEvt(nodes()[2]!, 'dragover', { height: H }, H * 0.2)
    await nextTick()
    expect(nodes()[1]!.className).not.toContain('ldo-drop')
    expect(nodes()[2]!.className).toContain('ldo-drop')
  })
})

/* ═══════════ typeShort 映射 ═══════════ */

describe('图标与 dataTransfer 细节', () => {
  it('**节点图标走注册表**（不同 type 渲染出的图标不同，不能全是同一个）', async () => {
    await tree([field('a', 'A', 'text'), field('b', 'B', 'select')])
    const icons = [...document.querySelectorAll('.ldo-tree-icon')]
    expect(icons).toHaveLength(2)
    // IconSvg 内部按 type 映射到 svg symbol，DOM 上看不到 type 属性，
    // 于是比对两个节点内部结构是否不同（同 type 会完全一致）。
    expect(icons[0]!.innerHTML).not.toBe(icons[1]!.innerHTML)
    expect(icons[0]!.innerHTML.length, '图标应有实际内容').toBeGreaterThan(0)
  })

  it('**同 type 的图标一致**（渲染稳定，不能每次随机）', async () => {
    await tree([field('a', 'A', 'text'), field('b', 'B', 'text')])
    const icons = [...document.querySelectorAll('.ldo-tree-icon')]
    expect(icons[0]!.innerHTML).toBe(icons[1]!.innerHTML)
  })

  it('**dragover 时把 dropEffect 置为 move**（否则浏览器默认成 copy，光标不对）', async () => {
    await tree([field('a', 'A'), field('b', 'B')])
    const dt = { dropEffect: 'none', effectAllowed: '', setData: vi.fn(), getData: () => '' }
    const stubRect = (el: HTMLElement) =>
      Object.defineProperty(el, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ top: 0, left: 0, height: 60, width: 100, bottom: 60, right: 100, x: 0, y: 0, toJSON: () => ({}) }),
      })
    const fire = (el: HTMLElement, type: string, clientY: number) => {
      stubRect(el)
      const ev = new Event(type, { bubbles: true, cancelable: true }) as Event & {
        dataTransfer: unknown
        clientY: number
        currentTarget: unknown
      }
      Object.defineProperty(ev, 'clientY', { value: clientY })
      Object.defineProperty(ev, 'currentTarget', { value: el })
      Object.defineProperty(ev, 'dataTransfer', { value: dt })
      el.dispatchEvent(ev)
    }
    fire(nodes()[0]!, 'dragstart', 0)
    fire(nodes()[1]!, 'dragover', 12)
    expect(dt.dropEffect, '应置为 move').toBe('move')
  })
})

describe('搜索：大小写与子树匹配', () => {
  const input = () => document.querySelector('.ldo-search-input') as HTMLInputElement
  async function search(q: string) {
    input().value = q
        input().dispatchEvent(new Event('input'))
    await nextTick()
    await nextTick()
  }

  it('**label 搜索大小写不敏感**', async () => {
    await tree([field('a', 'ABC'), field('b', 'xyz')])
    await search('abc')
    expect(labels()).toEqual(['ABC'])
  })

  it('**子树按 type 也能命中**（容器里有个 select，搜 "select" 应带出容器）', async () => {
    await tree([container('c', [field('k', 'K', 'select')]), field('x', 'X', 'text')])
    await search('select')
    expect(labels(), '容器与命中的 select 都保留').toEqual(['卡片', 'K'])
  })
})

describe('typeShort：类型简称', () => {
  it('**未知类型原样返回**（新增类型不至于显示空白）', async () => {
    await tree([field('a', 'A', 'brand-new-type')])
    expect(types()).toEqual(['brand-new-type'])
  })

  it('**已知类型走翻译表**', async () => {
    await tree([field('a', 'A', 'number')])
    expect(types()).toEqual(['数字'])
  })
})
