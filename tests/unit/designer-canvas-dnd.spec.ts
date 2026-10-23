/**
 * DesignerCanvas.vue — 拖拽子系统（此前整块未覆盖）
 *
 * 覆盖两条独立链路：
 *   1. **面板拖入**：画布级 dragover/dragleave/drop + 落点计算（before/after/inside）
 *   2. **节点排序**：dragstart/dragover/drop/dragend + 跨容器嵌套插入 + 槽位改派
 * 外加槽位拖拽（tabs/collapse/steps）、工具条缩放、节点操作按钮与选中透传。
 *
 * 两个 happy-dom 约束决定了本文件的写法：
 *   - 没有布局引擎，`getBoundingClientRect()` 恒为全 0 → 手工覆写 rect 并给事件挂
 *     clientY，才能真的走完 resolveDropPos 的 25/50/75% 分区（否则落点永远退化成 before）
 *   - `DragEvent` 不可构造、`dataTransfer` 只读 → 用普通 Event + defineProperty 挂桩
 *
 * 另一个坑：`slot-utils` 的活动标签/折叠/步骤状态是**模块级单例、按节点 id 存**，
 * 跨用例共用同一 id 会串味（表现为"第 1 步时上一步却可用"）。故每个用例用全新 id。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import DesignerCanvas from '@/components/form-builder/designer/DesignerCanvas.vue'
import { useT } from '@/components/_internal/i18n'
import type { DesignerNode } from '@/components/form-builder/designer/types'

type Rect = { top: number; height: number; left: number; width: number; right: number; bottom: number }
const rect = (top = 100, height = 100): Rect => ({
  top,
  height,
  left: 0,
  width: 200,
  right: 200,
  bottom: top + height,
})

type DT = {
  types: string[]
  dropEffect: string
  effectAllowed: string
  getData: (k: string) => string
  setData: (k: string, v: string) => void
  setDragImage: () => void
}

/** dataTransfer 桩：types 由实际写入的键推导（与真实 DataTransfer 一致） */
function makeDT(opts: { fieldType?: string; plain?: string; sortId?: string; types?: string[] } = {}): DT {
  const store: Record<string, string> = {}
  if (opts.fieldType) store['application/x-field-type'] = opts.fieldType
  if (opts.plain) store['text/plain'] = opts.plain
  if (opts.sortId) store['text/sort'] = opts.sortId
  return {
    types: opts.types ?? Object.keys(store),
    dropEffect: '',
    effectAllowed: '',
    getData: (k: string) => store[k] ?? '',
    setData: (k: string, v: string) => {
      store[k] = v
    },
    setDragImage: () => {},
  }
}

type FireOpts = { dt?: DT | null; clientY?: number; clientX?: number; top?: number; height?: number; bubbles?: boolean }

/** 手工派发拖拽事件（覆写 rect + 挂 dataTransfer/clientY） */
function fire(w: VueWrapper, selector: string, type: string, opts: FireOpts = {}): Event {
  const el = w.find(selector).element as HTMLElement
  return fireOn(el, type, opts)
}

function fireOn(el: HTMLElement, type: string, opts: FireOpts = {}): Event {
  const r = rect(opts.top ?? 100, opts.height ?? 100)
  el.getBoundingClientRect = () => r as unknown as DOMRect
  const ev = new Event(type, { bubbles: opts.bubbles ?? true, cancelable: true })
  Object.defineProperty(ev, 'dataTransfer', { value: opts.dt ?? null, configurable: true })
  if (opts.clientY !== undefined) Object.defineProperty(ev, 'clientY', { value: opts.clientY, configurable: true })
  if (opts.clientX !== undefined) Object.defineProperty(ev, 'clientX', { value: opts.clientX, configurable: true })
  el.dispatchEvent(ev)
  return ev
}

/** rect top=100 height=100 → 110 上 25%、150 中 50%、195 下 95% */
const UPPER = 110
const MIDDLE = 150
const LOWER = 195

const t = useT()

let seq = 0
const uid = (p: string): string => `${p}-${++seq}`

const leaf = (id: string, label: string, extra: Partial<DesignerNode> = {}): DesignerNode =>
  ({ id, type: 'text', label, key: `k_${id}`, ...extra }) as DesignerNode

const container = (id: string, type: string, children: DesignerNode[], cfg = {}): DesignerNode =>
  ({ id, type, label: id, isContainer: true, containerConfig: cfg, children }) as DesignerNode

/** 每个用例独立 id：slot-utils 的状态按 id 存单例 */
function tabsNode(): DesignerNode {
  const id = uid('c-tabs')
  return container(
    id,
    'tabs',
    [leaf(uid('t1'), '页一字段', { containerSlot: 0 }), leaf(uid('t2'), '页二字段', { containerSlot: 1 })],
    { tabs: [{ label: '页一', name: 'profile' }, { label: '页二', name: 'work' }], activeTab: 'profile' },
  )
}

function collapseNode(): DesignerNode {
  return container(
    uid('c-col'),
    'collapse',
    [leaf(uid('c1'), '折一字段', { containerSlot: 0 }), leaf(uid('c2'), '折二字段', { containerSlot: 1 })],
    { collapseItems: [{ title: '折一', expanded: true }, { title: '折二', expanded: false }] },
  )
}

function stepsNode(): DesignerNode {
  return container(
    uid('c-steps'),
    'steps',
    [leaf(uid('s1'), '步一字段', { containerSlot: 0 }), leaf(uid('s2'), '步二字段', { containerSlot: 1 })],
    { steps: [{ title: '步一' }, { title: '步二' }], activeStep: 0 },
  )
}

let w: VueWrapper | null = null

function mountCanvas(nodes: DesignerNode[]): VueWrapper {
  w = mount(DesignerCanvas, { props: { nodes, selectedId: null }, attachTo: document.body })
  return w
}

beforeEach(() => {
  localStorage.removeItem('vcl-designer-zoom')
  document.body.innerHTML = ''
})

afterEach(() => {
  w?.unmount()
  w = null
  localStorage.removeItem('vcl-designer-zoom')
  document.body.innerHTML = ''
})

/** 派发出去的事件表（VTU 对未派发事件返回 []，所以一律看 length） */
const ev = (name: string): unknown[][] => (w!.emitted(name) ?? []) as unknown[][]

/* ═══════════ 画布级：面板拖入 ═══════════ */

describe('画布级拖拽（面板拖入）', () => {
  it('**dragover 带字段类型 → 允许放下 + 标 copy + 高亮画布**', async () => {
    const c = mountCanvas([])
    const dt = makeDT({ fieldType: 'text' })
    const e = fire(c, '.ldc-canvas', 'dragover', { dt })
    expect(e.defaultPrevented, '必须 preventDefault 才成为可放置区').toBe(true)
    expect(dt.dropEffect).toBe('copy')
    await nextTick()
    expect(c.find('.ldc-canvas').classes(), '应加 drag-over 高亮').toContain('drag-over')
  })

  it('**dragover 不带字段类型 → 不放行、不高亮**（否则任意拖拽都变可放置区）', async () => {
    const c = mountCanvas([])
    const dt = makeDT({ plain: 'x' })
    const e = fire(c, '.ldc-canvas', 'dragover', { dt })
    expect(e.defaultPrevented).toBe(false)
    await nextTick()
    expect(c.find('.ldc-canvas').classes()).not.toContain('drag-over')
  })

  it('**dragleave 指针已移出画布矩形 → 清掉高亮**', async () => {
    const c = mountCanvas([leaf(uid('f'), '字段一')])
    fire(c, '.ldc-canvas', 'dragover', { dt: makeDT({ fieldType: 'text' }) })
    await nextTick()
    expect(c.find('.ldc-canvas').classes()).toContain('drag-over')

    fire(c, '.ldc-canvas', 'dragleave', { clientX: 500, clientY: 150 }) // 超出 right=200
    await nextTick()
    expect(c.find('.ldc-canvas').classes(), '移出后高亮应消失').not.toContain('drag-over')
  })

  it('**dragleave 移出画布 → 连落点指示线一起清掉**（否则残留悬空指示线）', async () => {
    const c = mountCanvas([leaf(uid('f'), '字段一'), leaf(uid('f'), '字段二')])
    fire(c, '.ldc-node-wrapper > .ldc-card', 'dragstart', { dt: makeDT() })
    fire(c, '.ldc-node-wrapper:nth-child(2) .ldc-card', 'dragover', { dt: makeDT(), clientY: UPPER })
    await nextTick()
    expect(c.findAll('.ldc-drop-indicator').length, '前置：指示线已出现').toBe(1)

    fire(c, '.ldc-canvas', 'dragleave', { clientX: 900, clientY: 900 })
    await nextTick()
    expect(c.findAll('.ldc-drop-indicator').length, '移出后指示线应清掉').toBe(0)
  })

  it('**dragleave 指针仍在矩形内 → 不清状态**（子元素间移动会连发 dragleave）', async () => {
    const c = mountCanvas([leaf(uid('f'), '字段一')])
    fire(c, '.ldc-canvas', 'dragover', { dt: makeDT({ fieldType: 'text' }) })
    fire(c, '.ldc-canvas', 'dragleave', { clientX: 100, clientY: 150 })
    await nextTick()
    expect(c.find('.ldc-canvas').classes(), '仍在框内不该清').toContain('drag-over')
  })

  it('**画布 drop 带类型 → insert-at(type, -1) 并复位高亮**', async () => {
    const c = mountCanvas([])
    fire(c, '.ldc-canvas', 'dragover', { dt: makeDT({ fieldType: 'select' }) })
    await nextTick()
    expect(c.find('.ldc-canvas').classes(), '前置：拖拽中应已高亮').toContain('drag-over')

    fire(c, '.ldc-canvas', 'drop', { dt: makeDT({ fieldType: 'select' }) })
    expect(ev('insert-at')).toEqual([['select', -1]])
    await nextTick()
    expect(c.find('.ldc-canvas').classes(), '复位后不该残留高亮').not.toContain('drag-over')
  })

  it('**画布 drop 无类型 → 不派发插入**', () => {
    const c = mountCanvas([])
    fire(c, '.ldc-canvas', 'drop', { dt: makeDT({ types: [] }) })
    expect(ev('insert-at').length, '空拖拽不该插入').toBe(0)
  })

  it('**画布 drop 走 text/plain 兜底**（跨源拖拽常拿不到自定义 MIME）', () => {
    const c = mountCanvas([])
    fire(c, '.ldc-canvas', 'drop', { dt: makeDT({ plain: 'textarea' }) })
    expect(ev('insert-at')).toEqual([['textarea', -1]])
  })
})

/* ═══════════ 节点排序：dragstart / dragend ═══════════ */

describe('节点排序：dragstart / dragend', () => {
  it('**dragstart 记录拖源、写 text/sort、置 move、卡片加 dragging**', async () => {
    const a = leaf(uid('f'), '字段一')
    const c = mountCanvas([a, leaf(uid('f'), '字段二')])
    const dt = makeDT()
    fire(c, '.ldc-node-wrapper > .ldc-card', 'dragstart', { dt })
    expect(dt.effectAllowed).toBe('move')
    expect(dt.getData('text/sort'), '应写入被拖节点 id').toBe(a.id)
    await nextTick()
    expect(c.find('.ldc-node-wrapper > .ldc-card').classes()).toContain('dragging')
  })

  it('**dragstart 无 dataTransfer 时不炸**（部分环境不提供）', () => {
    const c = mountCanvas([leaf(uid('f'), '字段一')])
    expect(() => fire(c, '.ldc-node-wrapper > .ldc-card', 'dragstart', { dt: null })).not.toThrow()
  })

  it('**dragend → 复位拖拽态**（指示线与 dragging 都消失）', async () => {
    const c = mountCanvas([leaf(uid('f'), '字段一'), leaf(uid('f'), '字段二')])
    fire(c, '.ldc-node-wrapper > .ldc-card', 'dragstart', { dt: makeDT() })
    fire(c, '.ldc-node-wrapper:nth-child(2) .ldc-card', 'dragover', { dt: makeDT(), clientY: UPPER })
    await nextTick()
    expect(c.findAll('.ldc-drop-indicator').length, '前置：指示线已出现').toBeGreaterThan(0)

    fire(c, '.ldc-node-wrapper > .ldc-card', 'dragend')
    await nextTick()
    expect(c.findAll('.ldc-drop-indicator').length, 'dragend 后指示线应清空').toBe(0)
    expect(
      c.findAll('.ldc-card').some((el) => el.classes().includes('dragging')),
      'dragend 后不该还有 dragging',
    ).toBe(false)
  })
})

/* ═══════════ 节点排序：dragover 落点 ═══════════ */

describe('节点排序：dragover 落点', () => {
  const two = () => mountCanvas([leaf(uid('f'), '字段一'), leaf(uid('f'), '字段二')])

  it('**拖到别的字段上半区 → before 指示线**', async () => {
    const c = two()
    fire(c, '.ldc-node-wrapper > .ldc-card', 'dragstart', { dt: makeDT() })
    fire(c, '.ldc-node-wrapper:nth-child(2) .ldc-card', 'dragover', { dt: makeDT(), clientY: UPPER })
    await nextTick()
    const inds = c.findAll('.ldc-drop-indicator')
    expect(inds.length, '应出现一条指示线').toBe(1)
    expect(inds[0]!.classes()).toContain('is-before')
  })

  it('**拖到别的字段下半区 → after 指示线**', async () => {
    const c = two()
    fire(c, '.ldc-node-wrapper > .ldc-card', 'dragstart', { dt: makeDT() })
    fire(c, '.ldc-node-wrapper:nth-child(2) .ldc-card', 'dragover', { dt: makeDT(), clientY: LOWER })
    await nextTick()
    expect(c.findAll('.ldc-drop-indicator')[0]!.classes()).toContain('is-after')
  })

  it('**拖到自己身上 → 不设落点**（自拖无意义）', async () => {
    const c = two()
    fire(c, '.ldc-node-wrapper > .ldc-card', 'dragstart', { dt: makeDT() })
    fire(c, '.ldc-node-wrapper > .ldc-card', 'dragover', { dt: makeDT(), clientY: LOWER })
    await nextTick()
    expect(c.findAll('.ldc-drop-indicator').length, '自拖不该出现指示线').toBe(0)
  })

  it('**面板字段拖到容器 → 一律 inside（容器高亮），不区分上下区**', async () => {
    const c = mountCanvas([container(uid('c-card'), 'card', [leaf(uid('n'), '子字段')])])
    fire(c, '.ldc-container', 'dragover', { dt: makeDT({ fieldType: 'text' }), clientY: UPPER })
    await nextTick()
    expect(c.find('.ldc-container').classes(), '容器应进入 drop-target 态').toContain('drop-target')
  })

  it('**排序拖到容器：上区 before / 下区 after / 中区 inside**', async () => {
    const c = mountCanvas([leaf(uid('f'), '字段一'), container(uid('c-card'), 'card', [leaf(uid('n'), '子字段')])])
    fire(c, '.ldc-node-wrapper > .ldc-card', 'dragstart', { dt: makeDT() })

    fire(c, '.ldc-container', 'dragover', { dt: makeDT(), clientY: UPPER })
    await nextTick()
    let inds = c.findAll('.ldc-drop-indicator')
    expect(inds.length && inds[0]!.classes().includes('is-before'), '上区 → before').toBeTruthy()

    fire(c, '.ldc-container', 'dragover', { dt: makeDT(), clientY: LOWER })
    await nextTick()
    inds = c.findAll('.ldc-drop-indicator')
    expect(inds.length && inds[0]!.classes().includes('is-after'), '下区 → after').toBeTruthy()

    fire(c, '.ldc-container', 'dragover', { dt: makeDT(), clientY: MIDDLE })
    await nextTick()
    expect(c.find('.ldc-container').classes(), '中区 → inside 高亮').toContain('drop-target')
  })
})

/* ═══════════ 节点排序：drop 派发 ═══════════ */

describe('节点排序：drop 派发', () => {
  it('**拖到字段上半区 → sort-node(src, target, before) 且保持选中源**', async () => {
    const a = leaf(uid('f'), '字段一')
    const b = leaf(uid('f'), '字段二')
    const c = mountCanvas([a, b])
    fire(c, '.ldc-node-wrapper > .ldc-card', 'dragstart', { dt: makeDT() })
    fire(c, '.ldc-node-wrapper:nth-child(2) .ldc-card', 'dragover', { dt: makeDT(), clientY: UPPER })
    await nextTick()
    fire(c, '.ldc-node-wrapper:nth-child(2) .ldc-card', 'drop', { dt: makeDT(), clientY: UPPER })
    expect(ev('sort-node')).toEqual([[a.id, b.id, 'before']])
    expect(ev('select')[0], '拖完保持选中被拖节点').toEqual([a.id])
  })

  it('**拖到字段下半区 → after**', async () => {
    const a = leaf(uid('f'), '字段一')
    const b = leaf(uid('f'), '字段二')
    const c = mountCanvas([a, b])
    fire(c, '.ldc-node-wrapper > .ldc-card', 'dragstart', { dt: makeDT() })
    fire(c, '.ldc-node-wrapper:nth-child(2) .ldc-card', 'dragover', { dt: makeDT(), clientY: LOWER })
    await nextTick()
    fire(c, '.ldc-node-wrapper:nth-child(2) .ldc-card', 'drop', { dt: makeDT(), clientY: LOWER })
    expect(ev('sort-node')[0]).toEqual([a.id, b.id, 'after'])
  })

  it('**拖进容器中区 → sort-node(..., inside, 当前激活槽位)**', async () => {
    const a = leaf(uid('f'), '字段一')
    const s = stepsNode()
    const c = mountCanvas([a, s])
    fire(c, '.ldc-node-wrapper > .ldc-card', 'dragstart', { dt: makeDT() })
    fire(c, '.ldc-container', 'dragover', { dt: makeDT(), clientY: MIDDLE })
    await nextTick()
    fire(c, '.ldc-container', 'drop', { dt: makeDT(), clientY: MIDDLE })
    expect(ev('sort-node')[0]).toEqual([a.id, s.id, 'inside', 0])
  })

  it('**拖到容器上区 → 只给 before，不带 slot**', async () => {
    const a = leaf(uid('f'), '字段一')
    const t = tabsNode()
    const c = mountCanvas([a, t])
    fire(c, '.ldc-node-wrapper > .ldc-card', 'dragstart', { dt: makeDT() })
    fire(c, '.ldc-container', 'dragover', { dt: makeDT(), clientY: UPPER })
    await nextTick()
    fire(c, '.ldc-container', 'drop', { dt: makeDT(), clientY: UPPER })
    expect(ev('sort-node')[0]).toEqual([a.id, t.id, 'before'])
  })

  it('**拖到自己身上 drop → 不派发 sort-node**', () => {
    const c = mountCanvas([leaf(uid('f'), '字段一')])
    fire(c, '.ldc-node-wrapper > .ldc-card', 'dragstart', { dt: makeDT() })
    fire(c, '.ldc-node-wrapper > .ldc-card', 'drop', { dt: makeDT(), clientY: LOWER })
    expect(ev('sort-node').length).toBe(0)
  })

  it('**drop 后复位**（指示线不残留）', async () => {
    const c = mountCanvas([leaf(uid('f'), '字段一'), leaf(uid('f'), '字段二')])
    fire(c, '.ldc-node-wrapper > .ldc-card', 'dragstart', { dt: makeDT() })
    fire(c, '.ldc-node-wrapper:nth-child(2) .ldc-card', 'dragover', { dt: makeDT(), clientY: UPPER })
    await nextTick()
    fire(c, '.ldc-node-wrapper > .ldc-card', 'drop', { dt: makeDT(), clientY: UPPER })
    await nextTick()
    expect(c.findAll('.ldc-drop-indicator').length).toBe(0)
  })
})

/* ═══════════ 面板字段拖到具体节点 ═══════════ */

describe('面板字段拖入节点', () => {
  it('**拖到容器 → insert-into-container(type, 容器 id, -1, 激活槽位)**', () => {
    const s = stepsNode()
    const c = mountCanvas([s])
    fire(c, '.ldc-container', 'drop', { dt: makeDT({ fieldType: 'number' }), clientY: MIDDLE })
    expect(ev('insert-into-container')).toEqual([['number', s.id, -1, 0]])
  })

  it('**拖到根级字段上半区 → insert-at(type, 该字段索引)**', () => {
    const c = mountCanvas([leaf(uid('f'), '字段一'), leaf(uid('f'), '字段二')])
    fire(c, '.ldc-node-wrapper:nth-child(2) .ldc-card', 'drop', { dt: makeDT({ fieldType: 'date' }), clientY: UPPER })
    expect(ev('insert-at')).toEqual([['date', 1]])
  })

  it('**拖到根级字段下半区 → insert-at(type, 索引+1)**', () => {
    const c = mountCanvas([leaf(uid('f'), '字段一'), leaf(uid('f'), '字段二')])
    fire(c, '.ldc-node-wrapper > .ldc-card', 'drop', { dt: makeDT({ fieldType: 'date' }), clientY: LOWER })
    expect(ev('insert-at')).toEqual([['date', 1]])
  })

  it('**拖到容器内子字段 → 插进该容器内的相对位置**（扁平索引对嵌套节点无意义）', () => {
    const card = container(uid('c-card'), 'card', [
      leaf(uid('n'), '子一', { containerSlot: 0 }),
      leaf(uid('n'), '子二', { containerSlot: 0 }),
    ])
    const c = mountCanvas([card])
    const childCards = c.findAll('.ldc-card-wrapper > .ldc-card')
    expect(childCards.length).toBe(2)
    fireOn(childCards[0]!.element as HTMLElement, 'drop', { dt: makeDT({ fieldType: 'text' }), clientY: UPPER })
    expect(ev('insert-into-container')[0]).toEqual(['text', card.id, 0, 0])
  })

  it('**drop 无类型且非排序 → 不派发任何插入**', () => {
    const c = mountCanvas([leaf(uid('f'), '字段一')])
    fire(c, '.ldc-node-wrapper > .ldc-card', 'drop', { dt: makeDT({ types: [] }) })
    expect(ev('insert-at').length).toBe(0)
    expect(ev('insert-into-container').length).toBe(0)
  })
})

/* ═══════════ 槽位拖拽（tabs / collapse / steps） ═══════════ */

describe('槽位拖拽', () => {
  it('**槽位 dragover：面板字段放行标 move；纯排序源也放行；都没有则不放行**', async () => {
    const c = mountCanvas([leaf(uid('f'), '字段一'), tabsNode()])
    const slot = '.ldc-slot-body'
    // 用非冒泡事件，避免画布级 dragover 把 dropEffect 覆盖成 copy（那是另一条用例的事）
    const dt1 = makeDT({ fieldType: 'text' })
    const e1 = fire(c, slot, 'dragover', { dt: dt1, bubbles: false })
    expect(e1.defaultPrevented, '面板拖入应放行').toBe(true)
    expect(dt1.dropEffect).toBe('move')

    fire(c, '.ldc-node-wrapper > .ldc-card', 'dragstart', { dt: makeDT() })
    const e2 = fire(c, slot, 'dragover', { dt: makeDT({ types: [] }), bubbles: false })
    expect(e2.defaultPrevented, '排序拖拽也应放行（不看 types）').toBe(true)

    fire(c, '.ldc-node-wrapper > .ldc-card', 'dragend')
    const e3 = fire(c, slot, 'dragover', { dt: makeDT({ types: [] }), bubbles: false })
    expect(e3.defaultPrevented, '两者都不是则不放行').toBe(false)
  })

  it('**槽位 dragover 的 move 会被画布级 dragover 冒泡覆盖成 copy**（实测行为，记录用）', () => {
    const c = mountCanvas([leaf(uid('f'), '字段一'), tabsNode()])
    const dt = makeDT({ fieldType: 'text' })
    fire(c, '.ldc-slot-body', 'dragover', { dt, bubbles: true })
    // 画布级 handler 不区分槽位，冒泡后统一按「面板拖入」标 copy —— 光标形态与槽位语义不一致
    expect(dt.dropEffect, '冒泡后最终生效的是画布级的 copy').toBe('copy')
  })

  it('**槽位 drop（面板字段）→ insert-into-container(type, 容器 id, -1, 槽位)**', () => {
    const t = tabsNode()
    const c = mountCanvas([t])
    fire(c, '.ldc-slot-body', 'drop', { dt: makeDT({ fieldType: 'select' }) })
    expect(ev('insert-into-container')).toEqual([['select', t.id, -1, 0]])
  })

  it('**槽位 drop（已存在字段）→ assign-slot(src, 槽位) 而非插入**', async () => {
    const f = leaf(uid('f'), '字段一')
    const t = tabsNode()
    const c = mountCanvas([f, t])
    fire(c, '.ldc-node-wrapper > .ldc-card', 'dragstart', { dt: makeDT() })
    fire(c, '.ldc-slot-body', 'drop', { dt: makeDT({ types: [] }) })
    expect(ev('assign-slot')).toEqual([[f.id, 0]])
    expect(ev('insert-into-container').length, '不该同时当作新字段插入').toBe(0)
  })

  it('**tabs 槽位 drop 落在当前激活的标签页索引上**', async () => {
    const t = tabsNode()
    const c = mountCanvas([t])
    await c.findAll('.ldc-tab')[1]!.trigger('click')
    await nextTick()
    fire(c, '.ldc-slot-body', 'drop', { dt: makeDT({ fieldType: 'text' }) })
    expect(ev('insert-into-container')[0]![3], '应落到第 2 页').toBe(1)
  })

  it('**collapse 槽位 drop 落在该折叠项索引上**', () => {
    const col = collapseNode()
    const c = mountCanvas([col])
    const slots = c.findAll('.ldc-slot-body')
    expect(slots.length).toBe(2)
    fireOn(slots[1]!.element as HTMLElement, 'drop', { dt: makeDT({ fieldType: 'text' }) })
    expect(ev('insert-into-container')[0]).toEqual(['text', col.id, -1, 1])
  })

  it('**steps 槽位 drop 落在当前激活步骤索引上**', async () => {
    const s = stepsNode()
    const c = mountCanvas([s])
    await c.findAll('.ldc-steps-nav button')[1]!.trigger('click')
    await nextTick()
    fire(c, '.ldc-slot-body', 'drop', { dt: makeDT({ fieldType: 'text' }) })
    expect(ev('insert-into-container')[0]![3], '应落到第 2 步').toBe(1)
  })

  it('**槽位 drop 两者都不是 → 不派发**', () => {
    const c = mountCanvas([tabsNode()])
    fire(c, '.ldc-slot-body', 'drop', { dt: makeDT({ types: [] }), bubbles: false })
    expect(ev('insert-into-container').length).toBe(0)
    expect(ev('assign-slot').length).toBe(0)
  })
})

/* ═══════════ tabs「+ 添加」name 去重 ═══════════ */

describe('tabs「+ 添加」的 name 去重', () => {
  it('**默认追加 tabN（N=现有数+1）**', async () => {
    const c = mountCanvas([tabsNode()])
    const add = c.findAll('.ldc-tab').find((t) => t.text().includes('+'))!
    await add.trigger('click')
    const cfg = ev('update-container')[0]![1] as { tabs: Array<{ name: string }> }
    expect(cfg.tabs.map((x) => x.name)).toEqual(['profile', 'work', 'tab3'])
  })

  it('**tab3 已存在时跳过该名字**（删页后新增不能撞名）', async () => {
    const c = mountCanvas([
      container(
        uid('c-tabs'),
        'tabs',
        [leaf(uid('t'), '页一', { containerSlot: 0 }), leaf(uid('t'), '页二', { containerSlot: 1 })],
        { tabs: [{ label: '页一', name: 'profile' }, { label: '旧三', name: 'tab3' }], activeTab: 'profile' },
      ),
    ])
    const add = c.findAll('.ldc-tab').find((t) => t.text().includes('+'))!
    await add.trigger('click')
    const cfg = ev('update-container')[0]![1] as { tabs: Array<{ name: string }> }
    expect(cfg.tabs[2]!.name, '应跳到 tab4').toBe('tab4')
  })
})

/* ═══════════ 工具条缩放 ═══════════ */

describe('工具条缩放', () => {
  it('**放大 / 缩小 / 点百分比重置**', async () => {
    const c = mountCanvas([])
    const val = () => c.find('.ldc-zoom-val').text()
    expect(val(), '默认 100%').toBe('100%')

    const inBtn = c.findAll('.ldc-zoom button')[2]!
    await inBtn.trigger('click')
    expect(val()).toBe('110%')
    await inBtn.trigger('click')
    expect(val()).toBe('120%')

    const outBtn = c.findAll('.ldc-zoom button')[0]!
    await outBtn.trigger('click')
    expect(val()).toBe('110%')

    await c.find('.ldc-zoom-val').trigger('click')
    expect(val(), '点百分比回到 100%').toBe('100%')
  })

  it('**到上限/下限时按钮禁用**', async () => {
    const c = mountCanvas([])
    const outBtn = c.findAll('.ldc-zoom button')[0]!
    const inBtn = c.findAll('.ldc-zoom button')[2]!
    expect(outBtn.attributes('disabled'), '100% 时缩小仍可用').toBeUndefined()

    for (let i = 0; i < 6; i++) await inBtn.trigger('click')
    expect(c.find('.ldc-zoom-val').text(), '夹在 150%').toBe('150%')
    expect(inBtn.attributes('disabled'), '到上限应禁用').toBeDefined()

    for (let i = 0; i < 12; i++) await outBtn.trigger('click')
    expect(c.find('.ldc-zoom-val').text(), '夹在 50%').toBe('50%')
    expect(outBtn.attributes('disabled'), '到下限应禁用').toBeDefined()
  })
})

/* ═══════════ 节点操作按钮 ═══════════ */

describe('节点操作按钮', () => {
  it('**字段卡四按钮：上移/下移/复制/删除**', async () => {
    const f = leaf(uid('f'), '字段一')
    const c = mountCanvas([f])
    const btns = c.findAll('.ldc-node-wrapper > .ldc-card .ldc-card-actions button')
    expect(btns.length).toBe(4)
    for (const b of btns) await b.trigger('click')
    expect(ev('move')).toEqual([
      [f.id, -1],
      [f.id, 1],
    ])
    expect(ev('duplicate')[0]).toEqual([f.id])
    expect(ev('remove')[0]).toEqual([f.id])
  })

  it('**容器头部四按钮同样齐全**（含此前未覆盖的下移）', async () => {
    const t = tabsNode()
    const c = mountCanvas([t])
    const btns = c.findAll('.ldc-container-actions button')
    expect(btns.length).toBe(4)
    await btns[1]!.trigger('click')
    expect(ev('move')[0], '容器下移').toEqual([t.id, 1])
  })

  it('**点容器头部按钮不触发选中**（容器 actions 区同样要 stop 冒泡）', async () => {
    const t = tabsNode()
    const c = mountCanvas([t])
    await c.findAll('.ldc-container-actions button')[0]!.trigger('click')
    expect(ev('select').length, '容器按钮点击不该顺带选中').toBe(0)
    expect(ev('move')[0], '但移动事件要照发').toEqual([t.id, -1])
  })

  it('**点操作按钮不触发选中**（actions 区 stop 冒泡）', async () => {
    const c = mountCanvas([leaf(uid('f'), '字段一')])
    await c.findAll('.ldc-node-wrapper > .ldc-card .ldc-card-actions button')[0]!.trigger('click')
    expect(ev('select').length, '按钮点击不该顺带选中').toBe(0)
  })
})

/* ═══════════ 选中交互 ═══════════ */

describe('选中交互', () => {
  it('**点击字段 → select(id, false)；Ctrl/Meta 点击 → additive=true**', async () => {
    const f = leaf(uid('f'), '字段一')
    const c = mountCanvas([f])
    const card = c.find('.ldc-node-wrapper > .ldc-card')
    await card.trigger('click')
    expect(ev('select')[0]).toEqual([f.id, false])
    await card.trigger('click', { ctrlKey: true })
    expect(ev('select')[1], 'Ctrl 点选应追加').toEqual([f.id, true])
    await card.trigger('click', { metaKey: true })
    expect(ev('select')[2], 'Cmd 点选也应追加').toEqual([f.id, true])
  })

  it('**键盘 Enter / Space 也能选中**（role=listitem + tabindex 的可达性契约）', async () => {
    const c = mountCanvas([leaf(uid('f'), '字段一')])
    const card = c.find('.ldc-node-wrapper > .ldc-card')
    await card.trigger('keydown.enter')
    await card.trigger('keydown.space')
    expect(ev('select').length, '两种键都应派发').toBe(2)
  })

  it('**点击容器 → select(id, false)**', async () => {
    const t = tabsNode()
    const c = mountCanvas([t])
    await c.find('.ldc-container').trigger('click')
    expect(ev('select')[0]).toEqual([t.id, false])
  })

  it('**面包屑点击 → select(该层级 id)**', async () => {
    const t = tabsNode()
    const c = mount(DesignerCanvas, {
      props: { nodes: [t], selectedId: null, breadcrumbPath: [t] },
      attachTo: document.body,
    })
    w = c
    const crumbs = c.findAll('.ldc-crumb-item')
    expect(crumbs.length, '根 + 1 层').toBe(2)
    await crumbs[1]!.trigger('click')
    expect(ev('select')[0]).toEqual([t.id])
  })
})

/* ═══════════ 容器内子卡交互透传 ═══════════ */

describe('容器内子卡交互透传', () => {
  const cases: Array<[string, () => { node: DesignerNode; childId: string }]> = [
    [
      'tabs',
      () => {
        const n = tabsNode()
        return { node: n, childId: n.children![0]!.id }
      },
    ],
    [
      'collapse',
      () => {
        const n = collapseNode()
        return { node: n, childId: n.children![0]!.id }
      },
    ],
    [
      'steps',
      () => {
        const n = stepsNode()
        return { node: n, childId: n.children![0]!.id }
      },
    ],
    [
      'grid',
      () => {
        const child = leaf(uid('g'), '格子一')
        return { node: container(uid('c-grid'), 'grid', [child], { columns: 2 }), childId: child.id }
      },
    ],
    [
      'flex',
      () => {
        const child = leaf(uid('x'), '横排一')
        return { node: container(uid('c-flex'), 'flex', [child], { gap: 8 }), childId: child.id }
      },
    ],
    [
      'card',
      () => {
        const child = leaf(uid('n'), '卡内一')
        return { node: container(uid('c-card'), 'card', [child]), childId: child.id }
      },
    ],
  ]

  for (const [kind, make] of cases) {
    it(`**${kind} 容器：点子卡 → select(子 id)**`, async () => {
      const { node, childId } = make()
      const c = mountCanvas([node])
      const child = c.findAll('.ldc-card').find((el) => el.classes().includes('ldc-card'))
      expect(child, `${kind} 应有子卡`).toBeTruthy()
      await child!.trigger('click')
      expect(ev('select'), `${kind} 的 select 应透传`).toBeTruthy()
      expect(ev('select')[0]![0]).toBe(childId)
    })
  }

  it('**card 容器：子卡操作按钮与排序事件都透传**', async () => {
    const c1 = leaf(uid('n'), '卡内一')
    const c2 = leaf(uid('n'), '卡内二')
    const c = mountCanvas([container(uid('c-card'), 'card', [c1, c2])])

    const btns = c.findAll('.ldc-card-wrapper > .ldc-card')[0]!.findAll('.ldc-card-actions button')
    await btns[0]!.trigger('click')
    await btns[3]!.trigger('click')
    expect(ev('move')[0], '子卡上移').toEqual([c1.id, -1])
    expect(ev('remove')[0], '子卡删除').toEqual([c1.id])

    fire(c, '.ldc-card-wrapper > .ldc-card', 'dragstart', { dt: makeDT() })
    fire(c, '.ldc-card-wrapper:nth-child(2) .ldc-card', 'dragover', { dt: makeDT(), clientY: UPPER })
    await nextTick()
    fire(c, '.ldc-card-wrapper:nth-child(2) .ldc-card', 'drop', { dt: makeDT(), clientY: UPPER })
    expect(ev('sort-node')[0]).toEqual([c1.id, c2.id, 'before'])
  })
})

/* ═══════════ collapse / steps / tabs 容器交互 ═══════════ */

describe('collapse 与 steps 容器', () => {
  it('**collapse 键盘 Enter/Space 切换折叠项**', async () => {
    const c = mountCanvas([collapseNode()])
    const head = () => c.findAll('.ldc-collapse-head')[0]!
    expect(head().attributes('aria-expanded'), '首项默认展开').toBe('true')
    await head().trigger('keydown.enter')
    expect(head().attributes('aria-expanded'), 'Enter 应收起').toBe('false')
    await head().trigger('keydown.space')
    expect(head().attributes('aria-expanded'), 'Space 应再展开').toBe('true')
  })

  it('**steps 上一步/下一步：边界禁用 + 指示器同步**', async () => {
    const c = mountCanvas([stepsNode()])
    const nav = () => c.findAll('.ldc-steps-nav button')
    expect(nav()[0]!.attributes('disabled'), '第 1 步时上一步禁用').toBeDefined()
    expect(c.find('.ldc-steps-indicator').text()).toContain('1 / 2')

    await nav()[1]!.trigger('click')
    await nextTick()
    expect(c.find('.ldc-steps-indicator').text()).toContain('2 / 2')
    expect(nav()[1]!.attributes('disabled'), '最后一步时下一步禁用').toBeDefined()

    await nav()[0]!.trigger('click')
    await nextTick()
    expect(c.find('.ldc-steps-indicator').text()).toContain('1 / 2')
  })

  it('**steps 步骤头键盘 Enter 切步**', async () => {
    const c = mountCanvas([stepsNode()])
    await c.findAll('.ldc-step-btn')[1]!.trigger('keydown.enter')
    await nextTick()
    expect(c.find('.ldc-steps-indicator').text()).toContain('2 / 2')
  })

  it('**tabs 标签页键盘 Space 切页**', async () => {
    const c = mountCanvas([tabsNode()])
    await c.findAll('.ldc-tab')[1]!.trigger('keydown.space')
    await nextTick()
    expect(c.find('.ldc-container-body').text(), '应切到第 2 页内容').toContain('页二字段')
  })
})

/* ═══════════ 剩余边角 ═══════════ */

describe('剩余边角（补齐模板与分支）', () => {
  /** 通用事件派发：可挂任意自定义属性（happy-dom 的 WheelEvent 会丢 ctrlKey） */
  function fireRaw(el: HTMLElement, type: string, props: Record<string, unknown> = {}): Event {
    const e = new Event(type, { bubbles: true, cancelable: true })
    for (const [k, v] of Object.entries(props)) Object.defineProperty(e, k, { value: v, configurable: true })
    el.dispatchEvent(e)
    return e
  }

  it('**槽位 drop：types 声称有字段类型但取不到值 → 安全早退**', () => {
    const t = tabsNode()
    const c = mountCanvas([t])
    // types 里有标记（dragover 会放行），但 getData 返回空串 —— 真实场景：跨源拖拽
    fire(c, '.ldc-slot-body', 'drop', { dt: makeDT({ types: ['application/x-field-type'] }) })
    expect(ev('insert-into-container').length, '取不到类型就不该插入').toBe(0)
    expect(ev('assign-slot').length).toBe(0)
  })

  it('**槽位 dragover 无 dataTransfer 但处于排序拖拽 → 不崩且不标 dropEffect**', () => {
    const c = mountCanvas([leaf(uid('f'), '字段一'), tabsNode()])
    fire(c, '.ldc-node-wrapper > .ldc-card', 'dragstart', { dt: makeDT() })
    const e = fire(c, '.ldc-slot-body', 'dragover', { dt: null, bubbles: false })
    expect(e.defaultPrevented, '排序源仍应放行').toBe(true)
  })

  it('**Ctrl+滚轮缩放画布**（happy-dom 会丢 ctrlKey，需手工挂）', async () => {
    const c = mountCanvas([])
    const host = c.find('.ldc-canvas-content').element as HTMLElement
    expect(c.find('.ldc-zoom-val').text()).toBe('100%')

    fireRaw(host, 'wheel', { ctrlKey: true, deltaY: -100 })
    await nextTick()
    expect(c.find('.ldc-zoom-val').text(), 'Ctrl+上滚应放大').not.toBe('100%')

    fireRaw(host, 'wheel', { ctrlKey: false, deltaY: -100 })
    const after = c.find('.ldc-zoom-val').text()
    fireRaw(host, 'wheel', { ctrlKey: false, deltaY: -100 })
    expect(c.find('.ldc-zoom-val').text(), '无修饰键不缩放').toBe(after)
  })

  it('**容器头部四按钮全部可达**（含此前未覆盖的上移/复制/删除）', async () => {
    const t = tabsNode()
    const c = mountCanvas([t])
    const btns = c.findAll('.ldc-container-actions button')
    for (const b of btns) await b.trigger('click')
    expect(ev('move')).toEqual([
      [t.id, -1],
      [t.id, 1],
    ])
    expect(ev('duplicate')[0]).toEqual([t.id])
    expect(ev('remove')[0]).toEqual([t.id])
  })

  it('**tabs 标签页与「+ 添加」的键盘 Enter**', async () => {
    const c = mountCanvas([tabsNode()])
    const tabs = c.findAll('.ldc-tab')
    await tabs[1]!.trigger('keydown.enter')
    await nextTick()
    expect(c.find('.ldc-container-body').text(), 'Enter 应切页').toContain('页二字段')

    const add = c.findAll('.ldc-tab').find((x) => x.text().includes('+'))!
    await add.trigger('keydown.enter')
    expect(ev('update-container').length, 'Enter 也能加标签页').toBeGreaterThan(0)
  })

  it('**steps 步骤头键盘 Space 切步**', async () => {
    const c = mountCanvas([stepsNode()])
    await c.findAll('.ldc-step-btn')[1]!.trigger('keydown.space')
    await nextTick()
    expect(c.find('.ldc-steps-indicator').text()).toContain('2 / 2')
  })

  it('**grid / flex / card 子卡的移动、复制、删除都透传**', async () => {
    for (const kind of ['grid', 'flex', 'card'] as const) {
      const child = leaf(uid('k'), `${kind} 子字段`)
      const node = container(uid(`c-${kind}`), kind, [child], kind === 'grid' ? { columns: 2 } : {})
      const c = mountCanvas([node])
      // 子卡的容器类随容器类型不同（grid→.ldc-grid-col、flex→.ldc-flex-col），按文本定位更稳
      const card = c.findAll('.ldc-card').find((el) => el.text().includes(`${kind} 子字段`))!
      const btns = card.findAll('.ldc-card-actions button')
      expect(btns.length, `${kind} 子卡应有四个按钮`).toBe(4)
      await btns[0]!.trigger('click')
      await btns[1]!.trigger('click')
      await btns[2]!.trigger('click')
      await btns[3]!.trigger('click')
      expect(ev('move'), `${kind} 移动应透传`).toEqual([
        [child.id, -1],
        [child.id, 1],
      ])
      expect(ev('duplicate')[0], `${kind} 复制应透传`).toEqual([child.id])
      expect(ev('remove')[0], `${kind} 删除应透传`).toEqual([child.id])
      c.unmount()
      w = null
    }
  })

  it('**嵌套插入：落到子字段下半区 → 容器内索引 +1**', () => {
    const card = container(uid('c-card'), 'card', [
      leaf(uid('n'), '子一', { containerSlot: 0 }),
      leaf(uid('n'), '子二', { containerSlot: 0 }),
    ])
    const c = mountCanvas([card])
    const child = c.findAll('.ldc-card-wrapper > .ldc-card')[0]!
    fireOn(child.element as HTMLElement, 'drop', { dt: makeDT({ fieldType: 'text' }), clientY: LOWER })
    expect(ev('insert-into-container')[0]).toEqual(['text', card.id, 1, 0])
  })

  it('**flex 容器的 justify / wrap / gap 三档样式**', () => {
    const make = (cfg: Record<string, unknown>) =>
      mountCanvas([container(uid('c-flex'), 'flex', [leaf(uid('x'), '横排')], cfg)])
    const styleOf = (c: VueWrapper) => c.find('.ldc-flex-row').attributes('style') ?? ''

    expect(styleOf(make({ justify: 'center' })), 'center 档').toContain('center')
    w!.unmount()
    w = null
    const sb = styleOf(make({ justify: 'space-between', wrap: false }))
    expect(sb, 'space-between 档').toContain('space-between')
    expect(sb, 'wrap:false 应落 nowrap').toContain('nowrap')
    w!.unmount()
    w = null
    const s = styleOf(make({}))
    expect(s, '默认 justify=flex-start').toContain('flex-start')
    expect(s, '默认 wrap=wrap').toContain('wrap')
    expect(s, '默认 gap=12px').toContain('12px')
  })

  it('**设备模式落到画布内容区的 class 上**', async () => {
    const c = mount(DesignerCanvas, {
      props: { nodes: [], selectedId: null, device: 'mobile' },
      attachTo: document.body,
    })
    w = c
    expect(c.find('.ldc-canvas-content').classes(), '应带设备类').toContain('device-mobile')
    await c.setProps({ device: 'tablet' })
    expect(c.find('.ldc-canvas-content').classes()).toContain('device-tablet')
  })

  it('**新增标签页后新页即刻激活**（否则用户加了页却看不到内容）', async () => {
    const t = tabsNode()
    const c = mountCanvas([t])
    const before = c.findAll('.ldc-tab').filter((x) => x.classes().includes('active')).length
    expect(before).toBe(1)

    const add = c.findAll('.ldc-tab').find((x) => x.text().includes('+'))!
    await add.trigger('click')
    await nextTick()
    // props 未回写时，本地激活态应已切到新页名 tab3
    const cfg = ev('update-container')[0]![1] as { tabs: Array<{ name: string; label: string }> }
    expect(cfg.tabs[2]!.name, '新页名').toBe('tab3')

    // 模拟宿主回写（真实链路由 FormDesigner 写回 nodes）：写回后新页应直接是激活页
    await c.setProps({ nodes: [{ ...t, containerConfig: cfg }] })
    await nextTick()
    const active = c.findAll('.ldc-tab').filter((x) => x.classes().includes('active'))
    expect(active.length, '应有且仅有一个激活页').toBe(1)
    expect(active[0]!.text(), '激活的必须是新加的页').toContain(cfg.tabs[2]!.label)
  })

  it('**字段没有 key → 用节点 id 兜底查预览字段并渲染控件，同时如实告警**', () => {
    // `to-schema` 会在缺 key 时 reportWarn（噪音棘轮会把它当新类别拦截）：
    // 与其绕过，不如把它当成被测契约的一部分——既断言告警确实发出，又不污染噪音基线。
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const n = { id: uid('nokey'), type: 'text', label: '无 key 字段', placeholder: '占位' } as DesignerNode
      const c = mountCanvas([n])
      // 只查 .ldc-card-body 存在是假绿（该容器无条件下渲染），必须查里面真的出了控件
      expect(c.find('.ldc-card-body input').exists(), '应渲染出输入框').toBe(true)

      const msgs = warn.mock.calls.map((args) => args.map(String).join(' '))
      expect(msgs.some((m) => m.includes('缺 key') && m.includes(n.id)), '应告警并指认该节点').toBe(true)
    } finally {
      warn.mockRestore()
    }
  })
})

/* ═══════════ 空容器引导 ═══════════ */

describe('空容器引导', () => {
  it('**各容器为空时给出引导文案（且不同容器文案不同）**', () => {
    const c = mountCanvas([
      container(uid('c-card'), 'card', []),
      container(uid('c-grid'), 'grid', []),
      container(uid('c-flex'), 'flex', []),
    ])
    const tips = c.findAll('.ldc-container-empty').map((e) => e.text())
    expect(tips.length, '三个空容器各一条').toBeGreaterThanOrEqual(3)
    expect(new Set(tips).size, '不同容器文案应不同').toBeGreaterThan(1)
  })

  it('**tabs/steps 未配置槽位时用的是合成默认槽位**（configTabsFirst 实际不可达）', () => {
    const c = mountCanvas([container(uid('c-tabs'), 'tabs', [], {}), container(uid('c-steps'), 'steps', [], {})])
    const texts = c.findAll('.ldc-container-empty').map((e) => e.text())
    expect(texts.length, '两个容器各一条').toBeGreaterThanOrEqual(2)
    // 【现状】slot-utils 的 tabSlots/stepSlots 在缺配置时合成一个默认槽位，长度恒 >= 1，
    // 因此模板里 v-else 的 configTabsFirst / configStepsFirst 两条文案渲染不出来（死分支）。
    // 这里锁定真实渲染结果，避免有人误以为那两条会生效。
    expect(texts[0], 'tabs 走的是"拖拽到此标签页"').toBe(t('fbt.dropToTab'))
    expect(texts[1], 'steps 走的是"拖拽到此步骤"').toBe(t('fbt.dropToStep'))
    expect(c.text(), '配置引导文案不该出现').not.toContain(t('fbt.configTabsFirst'))
    expect(c.text()).not.toContain(t('fbt.configStepsFirst'))
  })

  it('**tabs/steps 已配置槽位但为空 → 提示可拖入该槽位**（三档文案各不相同）', () => {
    const tabEmpty = container(uid('c-tabs'), 'tabs', [], {
      tabs: [{ label: '页一', name: 'profile' }],
      activeTab: 'profile',
    })
    const stepEmpty = container(uid('c-steps'), 'steps', [], { steps: [{ title: '步一' }], activeStep: 0 })
    const c = mountCanvas([container(uid('c-card'), 'card', []), container(uid('c-grid'), 'grid', []), tabEmpty, stepEmpty])
    const texts = c.findAll('.ldc-container-empty').map((e) => e.text())
    expect(texts).toContain(t('fbt.dropToTab'))
    expect(texts).toContain(t('fbt.dropToStep'))
    expect(texts).toContain(t('fbt.dropToGrid'))
  })
})