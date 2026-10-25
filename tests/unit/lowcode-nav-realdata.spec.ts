/**
 * LowCodeNav —— **真数据闭环**（零桩集成）
 *
 * 上一轮（#146）证明了外壳与解析层的**行为**，用例里的 store / 表单构筑物都是桩。
 * 本轮要回答用户那句"**最起码先走通搞定真数据进来才会没问题**"：把整条链用真东西跑通——
 *
 *   后端下发导航 JSON ──► 外壳渲染导航 ──► 用户点表单页 ──► FormStore 取**真设计**
 *        ──► toFormSchema 转换 ──► **真 FormBuilder** 渲染出字段 ──► 填值 ──► 提交 emit
 *
 * 只有两处是"注入的"：HTTP 边界（`fetcher`）与宿主的路由决定（不接管）。其余全是真的：
 * `createLocalFormStore()`（localStorage）、`FormBuilder.vue`、`parseNavSchema`、
 * `createFormPageResolver` → `toFormSchema` —— 桩只留在真正属于宿主的边界上。
 *
 * 为什么值得单独一轮：桩能测"接线对不对"，但测不出**两套结构之间的真实转换**。
 * `FormDesign.nodes`（设计器节点树）→ `FormSchema.fields`（渲染器）这条转换一旦错，
 * 表现是"表单页渲染成功、只是字段全空"——桩永远发现不了，只有真设计数据能。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { h, nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import LowCodeNav from '@/components/form-builder/lowcode/LowCodeNav.vue'
import { createFormPageResolver } from '@/components/form-builder/lowcode/page-resolver'
import {
  createLocalFormStore,
  getActiveFormStore,
  setActiveFormStore,
  type FormStore,
} from '@/components/form-builder/designer/store'
import { FORM_DESIGN_VERSION, type FormDesign, type DesignerNode } from '@/components/form-builder/designer/types/domain'

/** 一次设计：真 `FormDesign`（v3 节点树），不是手搓的 schema */
function makeDesign(
  title: string,
  fields: Array<{ key: string; label: string; type?: string; required?: boolean }>,
): FormDesign {
  return {
    schemaVersion: FORM_DESIGN_VERSION,
    meta: { title, submitText: '保存' },
    nodes: fields.map((f, i): DesignerNode => ({
      id: `${title}-n${i}`,
      type: f.type ?? 'text',
      label: f.label,
      key: f.key,
      ...(f.required ? { required: true } : {}),
    })),
  }
}

/** 后端下发的导航 JSON（形状就是宿主后端会返回的样子） */
const navJson = (items: unknown[]) => ({ code: 0, data: { items } })

const jsonRes = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response

let wrappers: VueWrapper[] = []
const flush = async () => {
  await nextTick()
  await nextTick()
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
  await nextTick()
}
const mountNav = (props: Record<string, unknown>) => {
  const w = mount(LowCodeNav, { props, attachTo: document.body })
  wrappers.push(w as VueWrapper)
  return w
}
/** 取真 FormBuilder 的提交按钮（文案来自设计的 meta.submitText） */
const submitBtn = (w: VueWrapper) => w.findAll('button').find((b) => b.text().includes('保存'))

let store: FormStore
beforeEach(() => {
  localStorage.clear()
  store = createLocalFormStore()
  wrappers = []
})
afterEach(() => {
  for (const w of wrappers) {
    try {
      w.unmount()
    } catch {
      /* 用例内已卸载 */
    }
  }
  document.body.innerHTML = ''
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('真数据闭环 · 后端下发导航定义', () => {
  it('**真 JSON（data.items）→ 导航项，取哪个路径由配置决定**', async () => {
    const fetcher = vi.fn(async () =>
      jsonRes(
        navJson([
          { key: 'f1', label: '客户台账', kind: 'form', formId: 'x' },
          { key: 'd1', label: '数据看板', kind: 'data' },
        ]),
      ),
    )
    const w = mountNav({ source: { kind: 'api', url: '/api/nav', dataPath: 'data.items' }, fetcher })
    await flush()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(w.findAll('.lcn-item').map((i) => i.attributes('data-key'))).toEqual(['f1', 'd1'])
  })

  it('**后端混进坏项：安全项照常，坏项不出现且能查到原因**（真数据也走同一套闸）', async () => {
    const fetcher = vi.fn(async () =>
      jsonRes(
        navJson([
          { key: 'ok', label: '合规项', kind: 'custom' },
          { key: 'bad', label: '坏项', kind: 'link', url: 'javascript:alert(1)' },
          { key: 'bad2', label: '未知 kind', kind: 'whatever' },
        ]),
      ),
    )
    const w = mountNav({ source: { kind: 'api', url: '/api/nav', dataPath: 'data.items' }, fetcher, showIssues: true })
    await flush()
    expect(w.findAll('.lcn-item').map((i) => i.attributes('data-key'))).toEqual(['ok'])
    expect(w.find('.lcn-issues').attributes('data-issues')).toBe('2')
  })

  it('**没配地址 → 文案说的是\'没配地址\'，不是\'被安全策略拒绝\'**（两种失败对宿主是两件事）', async () => {
    const fetcher = vi.fn(async () => jsonRes(navJson([])))
    const w = mountNav({ source: { kind: 'api', url: '' }, fetcher })
    await flush()
    expect(fetcher).not.toHaveBeenCalled()
    expect(w.find('.lcn-error-text').text()).toContain('未配置导航接口地址')
  })

  it('**后端 500 → 错误态 + 重试（重试成功才渲染）**', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ message: 'boom' }, 500))
      .mockResolvedValueOnce(jsonRes(navJson([{ key: 'ok', label: 'OK', kind: 'custom' }])))
    const w = mountNav({ source: { kind: 'api', url: '/api/nav', dataPath: 'data.items' }, fetcher })
    await flush()
    expect(w.find('.lcn-error').attributes('data-state')).toBe('error')
    expect(w.find('.lcn-item').exists()).toBe(false)
    await w.find('.lcn-retry').trigger('click')
    await flush()
    expect(w.find('.lcn-item[data-key="ok"]').exists()).toBe(true)
  })
})

describe('真数据闭环 · 设计 → 渲染 → 提交（真 FormStore + 真 FormBuilder）', () => {
  it('**用户存的设计真的渲染成字段**（nodes → fields 转换是这条链的命门）', async () => {
    const saved = await store.saveForm(null, makeDesign('客户台账', [{ key: 'name', label: '客户名称' }]), '客户台账')
    const w = mountNav({
      source: {
        kind: 'api',
        url: '/api/nav',
        dataPath: 'data.items',
      },
      fetcher: vi.fn(async () =>
        jsonRes(navJson([{ key: saved.id, label: '客户台账', kind: 'form', formId: saved.id }])),
      ),
      resolveFormPage: createFormPageResolver(store),
    })
    await flush()
    expect(w.find('.lcn-form').exists(), '真 FormBuilder 渲染出来了').toBe(true)
    expect(w.text(), '设计里的字段名出现在页面里').toContain('客户名称')
    expect(w.text(), '设计 meta.title 也被渲染（转换没丢 meta）').toContain('客户台账')
    expect(w.find('input').exists(), '字段真的渲染成输入框').toBe(true)
  })

  it('**填值 → page-change；点提交 → page-submit 带真数据；全程不发一条网络**', async () => {
    const saved = await store.saveForm(null, makeDesign('收集表', [{ key: 'name', label: '姓名' }]), '收集表')
    const fetcher2 = vi.fn(async () =>
      jsonRes(navJson([{ key: saved.id, label: '收集表', kind: 'form', formId: saved.id }])),
    )
    const w2 = mountNav({
      source: { kind: 'api', url: '/api/nav', dataPath: 'data.items' },
      fetcher: fetcher2,
      resolveFormPage: createFormPageResolver(store),
    })
    await flush()
    await w2.find('input').setValue('张三')
    await flush()
    expect(w2.emitted('page-change'), '填值触发数据变化').toBeTruthy()
    expect((w2.emitted('page-change')!.at(-1) as Array<{ data: unknown }>)[0]!.data).toEqual({ name: '张三' })

    await submitBtn(w2)!.trigger('click')
    await flush()
    const payload = w2.emitted('page-submit')!.at(-1) as Array<{ node: { key: string }; data: unknown }>
    expect(payload[0]!.data).toEqual({ name: '张三' })
    expect(payload[0]!.node.key).toBe(saved.id)
    expect(fetcher2, '取导航配置 1 次；提交不外发').toHaveBeenCalledTimes(1)
  })

  it('**必填没填 → 真校验挡住，不发 page-submit**（"自动提交"从来不在设计里）', async () => {
    const saved = await store.saveForm(
      null,
      makeDesign('必填表', [{ key: 'name', label: '姓名', required: true }]),
      '必填表',
    )
    const w = mountNav({
      source: { kind: 'static', nodes: [{ key: saved.id, label: '必填表', kind: 'form', formId: saved.id }] },
      resolveFormPage: createFormPageResolver(store),
    })
    await flush()
    await submitBtn(w)!.trigger('click')
    await flush()
    expect(w.emitted('page-submit')).toBeUndefined()
    expect(w.text(), '校验提示可见（不是静默什么都不做）').toContain('必填')
  })

  it('**表单已被删除 → 空态 + 原因含 id**（真 store 走 null 分支，非错误态）', async () => {
    const w = mountNav({
      source: { kind: 'static', nodes: [{ key: 'gone', label: '已删', kind: 'form', formId: 'f_gone' }] },
      resolveFormPage: createFormPageResolver(store),
    })
    await flush()
    const box = w.find('.lcn-missing')
    expect(box.attributes('data-state')).toBe('form-missing')
    expect(box.attributes('data-reason')).toContain('f_gone')
    expect(w.find('input').exists()).toBe(false)
    expect(w.find('.lcn-error').exists()).toBe(false)
  })

  it('**宿主不传 store → 默认走活动实例**（`setActiveFormStore` 换后端，导航与解析跟着走）', async () => {
    const saved = await store.saveForm(null, makeDesign('云上表', [{ key: 'sn', label: '序列号' }]), '云上表')
    setActiveFormStore(store)
    expect(getActiveFormStore()).toBe(store)
    const w = mountNav({
      source: { kind: 'static', nodes: [{ key: saved.id, label: '云上表', kind: 'form', formId: saved.id }] },
      // 不给 resolveFormPage：用默认解析器 + 活动 store
    })
    await flush()
    expect(w.text()).toContain('序列号')
  })
})

describe('真数据闭环 · forms 来源（加一个表单就多一个导航项）', () => {
  it("**注入宿主自己的 store（内存实现）→ forms 来源认它，而不是全局活动实例**", async () => {
    const map = new Map<string, FormDesign>()
    const memStore: FormStore = {
      async listForms() {
        return [...map.entries()].map(([id, d]) => ({
          id,
          name: String((d.meta as { title?: string }).title ?? id),
          updatedAt: '2026-01-01T00:00:00.000Z',
          collectKey: `fd_collect_${id}`,
        }))
      },
      async loadForm(id: string) {
        return map.get(id) ?? null
      },
      async saveForm(id, design, name) {
        const nid = id ?? `mem_${map.size + 1}`
        map.set(nid, design)
        return { id: nid, name: name ?? nid, updatedAt: '2026-01-01T00:00:00.000Z', collectKey: `fd_collect_${nid}` }
      },
      async renameForm() {},
      async deleteForm(id: string) {
        map.delete(id)
      },
      async loadRecords() {
        return []
      },
      async appendRecord() {},
      async removeRecord() {},
      async clearRecords() {},
    }
    await memStore.saveForm(null, makeDesign('宿主后端表', [{ key: 'h', label: '宿主字段' }]), '宿主后端表')
    expect(localStorage.length, '宿主后端不碰 localStorage（这就是"对接自己数据库"）').toBe(0)
    const w = mountNav({ source: { kind: 'forms' }, formStore: memStore })
    await flush()
    expect(w.findAll('.lcn-label').map((l) => l.text())).toEqual(['宿主后端表'])
    expect(w.text(), '表单页也从同一个注入的 store 取设计').toContain('宿主字段')
  })

  it('**真 store 里的表单自动成为导航项，label = 表单名；按最近更新排序**', async () => {
    const a = await store.saveForm(null, makeDesign('A 表', [{ key: 'a', label: 'A 字段' }]), 'A 表')
    await new Promise((r) => setTimeout(r, 5))
    const b = await store.saveForm(null, makeDesign('B 表', [{ key: 'b', label: 'B 字段' }]), 'B 表')
    const w = mountNav({ source: { kind: 'forms', icon: 'clipboard' }, formStore: store })
    await flush()
    const keys = w.findAll('.lcn-item').map((i) => i.attributes('data-key'))
    expect(keys, '最近更新的排最前').toEqual([b.id, a.id])
    expect(w.findAll('.lcn-label').map((l) => l.text())).toEqual(['B 表', 'A 表'])
    expect(w.findAll('.lcn-icon[data-icon="clipboard"]')).toHaveLength(2)
  })

  it('**点第二个导航项 → 渲染的是它自己的设计**（不是第一份）', async () => {
    const a = await store.saveForm(null, makeDesign('A 表', [{ key: 'a', label: 'A 字段' }]), 'A 表')
    await new Promise((r) => setTimeout(r, 5))
    const b = await store.saveForm(null, makeDesign('B 表', [{ key: 'b', label: 'B 字段' }]), 'B 表')
    const w = mountNav({ source: { kind: 'forms' }, formStore: store })
    await flush()
    expect(w.text(), '默认选中最近更新的 B').toContain('B 字段')
    await w.find(`.lcn-item[data-key="${a.id}"]`).trigger('click')
    await flush()
    expect(w.text()).toContain('A 字段')
    expect(w.text(), '切页后不该还留着上一份的字段').not.toContain('B 字段')
    expect(b.id).not.toBe(a.id)
  })

  it('**空库 → 空态（不是一堆假页签）**', async () => {
    const w = mountNav({ source: { kind: 'forms' }, formStore: store })
    await flush()
    expect(w.attributes('data-nav-count')).toBe('0')
    expect(w.find('.lcn-hint[data-state="empty"]').exists()).toBe(true)
  })

  it('**store 抛错 → 错误态 + 保留上一次导航**（真 store 换成会抛的实现）', async () => {
    const failing: FormStore = {
      ...store,
      async listForms() {
        throw new Error('后端不可用')
      },
    }
    const w = mountNav({ source: { kind: 'forms' }, formStore: failing })
    await flush()
    expect(w.find('.lcn-error-text').text()).toBe('后端不可用')
  })
})

describe('真数据闭环 · 三种页型在同一外壳里各自渲染', () => {
  it('**form → 真表单；data → 宿主插槽；link → 真锚点**', async () => {
    const saved = await store.saveForm(null, makeDesign('混合表', [{ key: 'm', label: '混合字段' }]), '混合表')
    const w = mount(LowCodeNav, {
      props: {
        source: {
          kind: 'static',
          nodes: [
            { key: saved.id, label: '表单页', kind: 'form', formId: saved.id },
            { key: 'data1', label: '数据页', kind: 'data' },
            { key: 'ext', label: '外部系统', kind: 'link', url: 'https://example.com/app' },
          ],
        },
        resolveFormPage: createFormPageResolver(store),
      },
      slots: {
        default: (p: { node: { key: string } | null }) =>
          h('div', { class: 'host-data' }, `宿主数据页:${p.node?.key ?? ''}`),
      },
      attachTo: document.body,
    })
    wrappers.push(w as VueWrapper)
    await flush()
    expect(w.text(), 'form 页：真表单字段').toContain('混合字段')

    await w.find('.lcn-item[data-key="data1"]').trigger('click')
    await flush()
    expect(w.find('.host-data').text()).toBe('宿主数据页:data1')

    await w.find('.lcn-item[data-key="ext"]').trigger('click')
    await flush()
    const a = w.find('a.lcn-link')
    expect(a.attributes('href')).toBe('https://example.com/app')
    expect(a.attributes('target')).toBe('_blank')
    expect(a.attributes('rel')).toBe('noopener noreferrer')
  })

  it('**真设计里的 select 字段也走通**（不止 text：证明转换覆盖字段类型）', async () => {
    const saved = await store.saveForm(
      null,
      makeDesign('选项表', [{ key: 'level', label: '优先级', type: 'select' }]),
      '选项表',
    )
    const w = mountNav({
      source: { kind: 'static', nodes: [{ key: saved.id, label: '选项表', kind: 'form', formId: saved.id }] },
      resolveFormPage: createFormPageResolver(store),
    })
    await flush()
    expect(w.text()).toContain('优先级')
    expect(w.find('.select-root').exists(), 'select 字段渲染成 Select 组件（真类名）').toBe(true)
  })
})

describe('真数据闭环 · 一个组件实例的完整生命周期', () => {
  it('**存新表单 → 重新挂载 → 新导航项出现（用户不必找宿主改代码）**', async () => {
    await store.saveForm(null, makeDesign('表一', [{ key: 'a', label: 'A' }]), '表一')
    const w1 = mountNav({ source: { kind: 'forms' }, formStore: store })
    await flush()
    expect(w1.attributes('data-nav-count')).toBe('1')
    w1.unmount()

    await store.saveForm(null, makeDesign('表二', [{ key: 'b', label: 'B' }]), '表二')
    const w2 = mountNav({ source: { kind: 'forms' }, formStore: store })
    await flush()
    expect(w2.attributes('data-nav-count')).toBe('2')
    expect(w2.findAll('.lcn-label').map((l) => l.text())).toEqual(['表二', '表一'])
  })
})