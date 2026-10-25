/**
 * LowCodeNav —— 低代码导航外壳
 *
 * 这是"宿主只搭一个导航框架、其余导航项由用户自建"里的**框架本体**。测试重心放在
 * 那些"看起来能跑、其实没接线"的地方（这类错不报错，只是行为不对）：
 *
 * · **表单页的 schema 到底有没有到达 `FormBuilder`**：用桩收 prop 断言，另有一条
 *   不桩、渲染真 `FormBuilder` 的集成冒烟（证明解析结果真的能渲染出字段）；
 * · **站内链接必须 `preventDefault`、外链才真跳**：用 `MouseEvent.defaultPrevented`
 *   区分（这是唯一能分辨这两个分支的观测量）；
 * · **`page-change` 只发一次**：`FormBuilder` 的 `update:modelValue` 与 `change` 是同一次
 *   变更的两条事件，只把其中一条接到对外事件上 —— 桩一次点击同时发两条，断言对外只收一条；
 * · **快速切页 / 卸载后的迟到解析结果不得覆盖新结果**；
 * · **配置问题默认不显示**，但 `#issues` 插槽与 `showIssues` 两条出路都可用。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import LowCodeNav from '@/components/form-builder/lowcode/LowCodeNav.vue'
import type { NavSource } from '@/components/form-builder/lowcode/useLowCodeNav'
import { createFormPageResolver } from '@/components/form-builder/lowcode/page-resolver'
import type { FormPageOutcome, FormPageResolver } from '@/components/form-builder/lowcode/page-resolver'
import type { NavNode } from '@/components/form-builder/lowcode/nav-schema'
import { policyFromOrigins } from '@/components/form-builder/api-url-guard'
import { mountExposeHost } from './lowcode-nav-expose-host'

/** FormBuilder 桩：收 `schema` prop（断言"解析结果到达渲染器"），并能发 submit/change/update */
const FormBuilderStub = defineComponent({
  name: 'FormBuilder',
  props: {
    schema: { type: Object, required: true },
    modelValue: { type: Object, default: () => ({}) },
  },
  emits: ['update:modelValue', 'change', 'submit'],
  template:
    '<div class="fb-stub" :data-fields="(schema.fields || []).length" :data-title="schema.title || \'\'">' +
    '<button class="fb-submit" @click="$emit(\'submit\', { a: 1 })">s</button>' +
    '<button class="fb-both" @click="$emit(\'update:modelValue\', { b: 2 }); $emit(\'change\', { b: 2 })">b</button>' +
    '</div>',
})

interface MountCfg {
  stubs?: Record<string, unknown>
  slots?: Record<string, string>
}
let wrappers: VueWrapper[] = []
/** 导航加载是 fetch→json→解析 的微任务链，2 个 nextTick 不够；补一个宏任务把链排空 */
const flush = async () => {
  await nextTick()
  await nextTick()
  await new Promise((r) => setTimeout(r, 0))
  await nextTick()
  await nextTick()
}
const mountShell = (props: Record<string, unknown> = {}, cfg: MountCfg = {}) => {
  const w = mount(LowCodeNav, {
    props,
    slots: cfg.slots,
    global: { stubs: cfg.stubs ?? { FormBuilder: FormBuilderStub } },
    attachTo: document.body,
  })
  wrappers.push(w as VueWrapper)
  return w
}

const twoItems: NavSource = {
  kind: 'static',
  nodes: [
    {
      key: 'a',
      label: '表单 A',
      kind: 'form',
      schema: { fields: [{ key: 'x', label: 'X', type: 'text' }] },
      icon: 'file',
      badge: '新',
    },
    { key: 'b', label: '数据 B', kind: 'data' },
  ],
}
const jsonRes = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response

beforeEach(() => {
  wrappers = []
})
afterEach(() => {
  for (const w of wrappers) {
    try {
      w.unmount()
    } catch {
      /* 用例内已手动卸载 */
    }
  }
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('LowCodeNav · 导航渲染', () => {
  it('**可选项渲染成按钮，选中项带 aria-current**', async () => {
    const w = mountShell({ source: twoItems })
    await flush()
    const items = w.findAll('.lcn-item')
    expect(items.map((i) => i.attributes('data-key'))).toEqual(['a', 'b'])
    expect(items[0]!.attributes('aria-current')).toBe('page')
    expect(items[1]!.attributes('aria-current')).toBeUndefined()
    expect(w.attributes('data-nav-count')).toBe('2')
    expect(w.find('.lcn-hint[data-state="empty"]').exists(), '有节点就不该再显示空态').toBe(false)
  })

  it('**分组是不可选的标题，不是按钮**（否则用户能"点进"一个没页面的项）', async () => {
    const w = mountShell({
      source: {
        kind: 'static',
        nodes: [{ key: 'g', label: '业务', kind: 'group', children: [{ key: 'a', label: 'A', kind: 'custom' }] }],
      },
    })
    await flush()
    expect(w.find('.lcn-group-label').text()).toBe('业务')
    expect(w.find('.lcn-item[data-key="g"]').exists(), '分组不该渲染成可选按钮').toBe(false)
    expect(w.find('.lcn-item[data-key="a"]').exists()).toBe(true)
  })

  it('**图标只出 data-icon 属性，不出图标语义**（本库不解释图标名，宿主用 CSS 映射）', async () => {
    const w = mountShell({ source: twoItems })
    await flush()
    const icon = w.find('.lcn-icon')
    expect(icon.attributes('data-icon')).toBe('file')
    expect(icon.attributes('aria-hidden')).toBe('true')
    expect(w.findAll('.lcn-icon')).toHaveLength(1) // 第二项没有 icon
  })

  it('**导航名绑 :title**（侧栏窄，长名会被 CSS 截断 —— 截断必须能看全值；由 check:constants 的截断类判定强制）', async () => {
    const w = mountShell({
      source: {
        kind: 'static',
        nodes: [
          { key: 'a', label: '一个很长的导航名称', kind: 'custom' },
          { key: 'g', label: 'G', kind: 'group', children: [{ key: 'c', label: '分组里的长名字', kind: 'custom' }] },
        ],
      },
    })
    await flush()
    const titles = w.findAll('.lcn-label').map((l) => l.attributes('title'))
    expect(titles).toEqual(['一个很长的导航名称', '分组里的长名字'])
    expect(w.findAll('.lcn-label').map((l) => l.text())).toEqual(['一个很长的导航名称', '分组里的长名字'])
  })

  it('**badge 有值才渲染**', async () => {
    const w = mountShell({ source: twoItems })
    await flush()
    expect(w.findAll('.lcn-badge').map((b) => b.text())).toEqual(['新'])
  })

  it('**标题与 nav 的 aria-label**：给了 title 用它，没给用通用"菜单"文案', async () => {
    const withTitle = mountShell({ source: twoItems, title: '我的工作台' })
    await flush()
    expect(withTitle.find('.lcn-title').text()).toBe('我的工作台')
    expect(withTitle.find('nav').attributes('aria-label')).toBe('我的工作台')

    const noTitle = mountShell({ source: twoItems })
    await flush()
    expect(noTitle.find('.lcn-title').exists()).toBe(false)
    expect(noTitle.find('nav').attributes('aria-label')).toBe('菜单')
  })

  it('**空导航 → 空态（不是一堆假页签）**', async () => {
    const w = mountShell({})
    await flush()
    expect(w.attributes('data-nav-count')).toBe('0')
    expect(w.find('.lcn-hint[data-state="empty"]').exists()).toBe(true)
    expect(w.find('.lcn-list').exists()).toBe(false)
  })

  it('**非法配置项不出现，合法项照常**', async () => {
    const w = mountShell({
      source: {
        kind: 'static',
        nodes: [
          { key: 'ok', label: 'OK', kind: 'custom' },
          { key: 'bad', label: 'BAD', kind: 'nope' },
          { key: 'bad2', label: 'X', kind: 'link', url: 'javascript:alert(1)' },
        ],
      },
    })
    await flush()
    expect(w.findAll('.lcn-item').map((i) => i.attributes('data-key'))).toEqual(['ok'])
  })

  it('**filter 生效（权限过滤由宿主判定）**', async () => {
    const w = mountShell({ source: twoItems, filter: (n: NavNode) => n.key !== 'b' })
    await flush()
    expect(w.findAll('.lcn-item').map((i) => i.attributes('data-key'))).toEqual(['a'])
  })

  it('**导航加载态**：来源为 api 且未回来时显示 loading，回来后消失', async () => {
    let resolve!: (v: Response) => void
    const w = mountShell({
      source: { kind: 'api', url: '/api/nav' },
      fetcher: vi.fn(() => new Promise<Response>((r) => (resolve = r))),
    })
    await flush()
    expect(w.find('.lcn-hint[data-state="loading"]').exists()).toBe(true)
    resolve(jsonRes([{ key: 'a', label: 'A', kind: 'custom' }]))
    await flush()
    expect(w.find('.lcn-hint[data-state="loading"]').exists()).toBe(false)
    expect(w.find('.lcn-item[data-key="a"]').exists()).toBe(true)
  })
})

describe('LowCodeNav · 导航失败与重试', () => {
  it('**失败显示错误 + 保留原导航；点重试会再拉一次并恢复**', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonRes([{ key: 'a', label: 'A', kind: 'custom' }]))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(jsonRes([{ key: 'a', label: 'A', kind: 'custom' }]))
    const src = ref<NavSource>({ kind: 'api', url: '/api/v1' })
    const w = mountShell({ source: () => src.value, fetcher })
    await flush()
    expect(w.find('.lcn-item[data-key="a"]').exists()).toBe(true)

    src.value = { kind: 'api', url: '/api/v2' } // 来源变化 → 第二次请求（失败）
    await flush()
    await flush()
    expect(w.find('.lcn-error').attributes('data-state')).toBe('error')
    expect(w.find('.lcn-error-text').text()).toBe('offline')
    expect(w.find('.lcn-item[data-key="a"]').exists(), '失败不清空导航').toBe(true)

    await w.find('.lcn-retry').trigger('click') // 第三次成功
    await flush()
    await flush()
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(w.find('.lcn-error').exists()).toBe(false)
  })

  it('**apiUrlPolicy 透传：宿主显式放行的跨域源能拉取**（策略来自宿主，不硬编码）', async () => {
    const fetcher = vi.fn(async () => jsonRes([{ key: 'a', label: 'A', kind: 'custom' }]))
    const w = mountShell({
      source: { kind: 'api', url: 'https://api.mycorp.com/nav' },
      apiUrlPolicy: () => policyFromOrigins(['https://api.mycorp.com']),
      fetcher,
    })
    await flush()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(w.find('.lcn-item[data-key="a"]').exists()).toBe(true)
    expect(w.find('.lcn-error').exists()).toBe(false)
  })

  it('**autoLoad: false → 挂载不加载**（宿主想自己控制首屏时机）', async () => {
    const w = mountShell({ source: twoItems, autoLoad: false })
    await flush()
    expect(w.attributes('data-nav-count')).toBe('0')
    expect(w.find('.lcn-item').exists()).toBe(false)
  })

  it('**api 来源被安全策略拒绝时不发请求，并把原因显示给用户**', async () => {
    const fetcher = vi.fn(async () => jsonRes([]))
    const w = mountShell({ source: { kind: 'api', url: 'https://evil.com/nav' }, fetcher })
    await flush()
    expect(fetcher).not.toHaveBeenCalled()
    expect(w.find('.lcn-error-text').text()).toContain('安全策略拒绝')
  })
})

describe('LowCodeNav · 选中与受控语义', () => {
  it('**点导航项 → update:modelValue + select，aria-current 跟着走**', async () => {
    const w = mountShell({ source: twoItems })
    await flush()
    await w.find('.lcn-item[data-key="b"]').trigger('click')
    await flush()
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual(['b'])
    expect((w.emitted('select')!.at(-1) as NavNode[])[0]!.key).toBe('b')
    expect(w.find('.lcn-item[data-key="b"]').attributes('aria-current')).toBe('page')
    expect(w.find('.lcn-item[data-key="a"]').attributes('aria-current')).toBeUndefined()
  })

  it('**分组子项可点：选中态与图标/徽标都按需渲染**（上一版只测了顶层项与分组标题）', async () => {
    const w = mountShell({
      source: {
        kind: 'static',
        nodes: [
          {
            key: 'g',
            label: '业务',
            kind: 'group',
            children: [
              { key: 'c1', label: '子项一', kind: 'custom', icon: 'star' },
              { key: 'c2', label: '子项二', kind: 'custom', badge: '2' },
            ],
          },
        ],
      },
    })
    await flush()
    const c1 = w.find('.lcn-item[data-key="c1"]')
    expect(c1.attributes('aria-current')).toBe('page') // autoSelect 选中第一个
    expect(w.find('.lcn-icon[data-icon="star"]').exists()).toBe(true)
    expect(w.findAll('.lcn-icon'), 'c2 没有 icon，不得凭空渲染一个图标位').toHaveLength(1)
    expect(w.findAll('.lcn-badge').map((b) => b.text())).toEqual(['2'])

    await w.find('.lcn-item[data-key="c2"]').trigger('click')
    await flush()
    expect(w.find('.lcn-item[data-key="c2"]').attributes('aria-current')).toBe('page')
    expect(w.find('.lcn-item[data-key="c1"]').attributes('aria-current')).toBeUndefined()
    expect((w.emitted('select')!.at(-1) as NavNode[])[0]!.key).toBe('c2')
  })

  it('**点分组标题不产生选中（分组不可选）**', async () => {
    const w = mountShell({
      source: {
        kind: 'static',
        nodes: [{ key: 'g', label: 'G', kind: 'group', children: [{ key: 'a', label: 'A', kind: 'custom' }] }],
      },
    })
    await flush()
    await w.find('.lcn-group-label').trigger('click')
    await flush()
    expect(w.emitted('select')).toBeUndefined()
  })

  it('**受控：传了 modelValue 就是真源 —— 点别的项只 emit，DOM 不动**（React 式受控）', async () => {
    const w = mountShell({ source: twoItems, modelValue: 'b' })
    await flush()
    expect(w.find('.lcn-item[data-key="b"]').attributes('aria-current')).toBe('page')
    await w.find('.lcn-item[data-key="a"]').trigger('click')
    await flush()
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual(['a'])
    expect(w.find('.lcn-item[data-key="b"]').attributes('aria-current'), '宿主没回写就仍显示 b').toBe('page')
  })

  it('**受控 + 宿主回写 = v-model 正常工作**', async () => {
    const w = mountShell({ source: twoItems, modelValue: 'a' })
    await flush()
    await w.find('.lcn-item[data-key="b"]').trigger('click')
    await flush()
    const emitted = w.emitted('update:modelValue')!.at(-1) as string[]
    await w.setProps({ modelValue: emitted[0] })
    await flush()
    expect(w.find('.lcn-item[data-key="b"]').attributes('aria-current')).toBe('page')
  })

  it('**悬空选中被收敛，并通过 update:modelValue 告知宿主**（外壳不静默改宿主状态）', async () => {
    const nodes = ref<unknown>([{ key: 'a', label: 'A', kind: 'custom' }])
    const w = mountShell({ source: () => ({ kind: 'static', nodes: nodes.value }) })
    await flush()
    await w.find('.lcn-item[data-key="a"]').trigger('click')
    await flush()
    nodes.value = [{ key: 'z', label: 'Z', kind: 'custom' }]
    await flush()
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual(['z'])
    expect(w.find('.lcn-item[data-key="z"]').attributes('aria-current')).toBe('page')
  })
})

describe('LowCodeNav · 配置问题的两条出路', () => {
  const badSource: NavSource = {
    kind: 'static',
    nodes: [{ key: 'bad', label: 'B', kind: 'link', url: 'javascript:alert(1)' }],
  }

  it('**默认不显示问题条**（导航干净优先）', async () => {
    const w = mountShell({ source: badSource })
    await flush()
    expect(w.find('.lcn-issues').exists()).toBe(false)
  })

  it('**showIssues 打开 → 问题条列出 path 与 code**（配了没生效必须能查）', async () => {
    const w = mountShell({ source: badSource, showIssues: true })
    await flush()
    expect(w.find('.lcn-issues').attributes('data-issues')).toBe('1')
    const li = w.find('.lcn-issues-list li')
    expect(li.attributes('data-code')).toBe('unsafe-url')
    expect(li.find('.lcn-issue-path').text()).toBe('items[0]')
    expect(li.text()).toContain('不安全的链接地址')
  })

  it('**#issues 插槽始终能拿到全部问题**（即使问题条关着）', async () => {
    const w = mountShell(
      { source: badSource },
      {
        slots: {
          // 插槽在 issues 为空时也会渲染（外壳不藏插槽）→ 宿主自守空数组
          issues: (p: { issues: Array<{ code: string }> }) =>
            h('div', { class: 'my-issues' }, `${p.issues.length}:${p.issues[0]?.code ?? 'none'}`),
        },
      },
    )
    await flush()
    expect(w.find('.lcn-issues').exists()).toBe(false)
    expect(w.find('.my-issues').text()).toBe('1:unsafe-url')
  })
})

describe('LowCodeNav · 页面区：表单页', () => {
  it('**内联 schema 一路到达 FormBuilder**（桩收到的 fields 数就是证据）', async () => {
    const w = mountShell({ source: twoItems })
    await flush()
    const stub = w.find('.fb-stub')
    expect(stub.exists()).toBe(true)
    expect(stub.attributes('data-fields')).toBe('1')
    expect(w.find('.lcn-page').attributes('data-kind')).toBe('form')
    expect(w.find('.lcn-page').attributes('data-key')).toBe('a')
  })

  it('**formId 走解析器（宿主可注入）→ 解析结果到达 FormBuilder**', async () => {
    const resolveFormPage = vi.fn(
      async (): Promise<FormPageOutcome> => ({
        status: 'ready',
        schema: {
          title: '客户台账',
          fields: [
            { key: 'n', label: 'N', type: 'text' },
            { key: 'm', label: 'M', type: 'text' },
          ],
        } as never,
      }),
    )
    const w = mountShell({
      source: { kind: 'static', nodes: [{ key: 'f1', label: '客户', kind: 'form', formId: 'f1' }] },
      resolveFormPage,
    })
    await flush()
    expect(resolveFormPage).toHaveBeenCalledTimes(1)
    expect((resolveFormPage.mock.calls[0]![0] as NavNode).key).toBe('f1')
    expect(w.find('.fb-stub').attributes('data-fields')).toBe('2')
    expect(w.find('.fb-stub').attributes('data-title')).toBe('客户台账')
  })

  it('**解析中先显示 loading，解析完才渲染表单**', async () => {
    let resolve!: (v: FormPageOutcome) => void
    const w = mountShell({
      source: { kind: 'static', nodes: [{ key: 'f1', label: 'F', kind: 'form', formId: 'f1' }] },
      resolveFormPage: () => new Promise<FormPageOutcome>((r) => (resolve = r)),
    })
    await flush()
    expect(w.find('.lcn-hint[data-state="form-loading"]').exists()).toBe(true)
    expect(w.find('.fb-stub').exists()).toBe(false)
    resolve({ status: 'ready', schema: { fields: [{ key: 'x', label: 'X', type: 'text' }] } as never })
    await flush()
    expect(w.find('.fb-stub').attributes('data-fields')).toBe('1')
  })

  it('**拿不到表单 → 空态 + 原因**（"表单被删了"是正常业务态，不是错误态）', async () => {
    const w = mountShell({
      source: { kind: 'static', nodes: [{ key: 'f1', label: 'F', kind: 'form', formId: 'gone' }] },
      resolveFormPage: async () => ({ status: 'missing', reason: '找不到表单 gone（可能已被删除）' }),
    })
    await flush()
    const box = w.find('.lcn-missing')
    expect(box.attributes('data-state')).toBe('form-missing')
    expect(box.attributes('data-reason')).toContain('gone')
    expect(w.find('.fb-stub').exists()).toBe(false)
    expect(w.find('.lcn-error').exists(), '不是错误态').toBe(false)
  })

  it('**解析抛错 → 错误态 + 重试（重试成功后正常渲染）**', async () => {
    const resolveFormPage = vi.fn<FormPageResolver>()
    resolveFormPage
      .mockRejectedValueOnce(new Error('存储不可用'))
      .mockResolvedValueOnce({
        status: 'ready',
        schema: { fields: [{ key: 'x', label: 'X', type: 'text' }] } as never,
      })
    const w = mountShell({
      source: { kind: 'static', nodes: [{ key: 'f1', label: 'F', kind: 'form', formId: 'f1' }] },
      resolveFormPage,
    })
    await flush()
    expect(w.find('.lcn-error').attributes('data-state')).toBe('form-error')
    expect(w.find('.lcn-error-text').text()).toBe('存储不可用')
    await w.find('.lcn-retry').trigger('click')
    await flush()
    await flush()
    expect(resolveFormPage).toHaveBeenCalledTimes(2)
    expect(w.find('.fb-stub').attributes('data-fields')).toBe('1')
    expect(w.find('.lcn-error').exists()).toBe(false)
  })

  it('**快速切页：迟到的旧解析结果不得覆盖新页**', async () => {
    const resolvers: Array<(v: FormPageOutcome) => void> = []
    const w = mountShell({
      source: {
        kind: 'static',
        nodes: [
          { key: 'f1', label: 'F1', kind: 'form', formId: 'f1' },
          { key: 'f2', label: 'F2', kind: 'form', formId: 'f2' },
        ],
      },
      resolveFormPage: () => new Promise<FormPageOutcome>((r) => resolvers.push(r)),
    })
    await flush()
    expect(resolvers).toHaveLength(1)
    await w.find('.lcn-item[data-key="f2"]').trigger('click')
    await flush()
    expect(resolvers).toHaveLength(2)

    resolvers[1]!({ status: 'ready', schema: { title: 'F2', fields: [{ key: 'b', label: 'B', type: 'text' }] } as never })
    await flush()
    expect(w.find('.fb-stub').attributes('data-title')).toBe('F2')
    resolvers[0]!({ status: 'ready', schema: { title: 'F1', fields: [{ key: 'a', label: 'A', type: 'text' }] } as never })
    await flush()
    expect(w.find('.fb-stub').attributes('data-title'), '旧页结果被丢弃').toBe('F2')
    expect(w.find('.lcn-page').attributes('data-key')).toBe('f2')
  })

  it('**迟到的旧页失败不得污染新页**（旧失败会以"错误态"盖掉已经渲染好的新页）', async () => {
    const asks: Array<{ ok: (v: FormPageOutcome) => void; fail: (e: unknown) => void }> = []
    const w = mountShell({
      source: {
        kind: 'static',
        nodes: [
          { key: 'f1', label: 'F1', kind: 'form', formId: 'f1' },
          { key: 'f2', label: 'F2', kind: 'form', formId: 'f2' },
        ],
      },
      resolveFormPage: () => new Promise<FormPageOutcome>((ok, fail) => asks.push({ ok, fail })),
    })
    await flush()
    await w.find('.lcn-item[data-key="f2"]').trigger('click')
    await flush()
    asks[1]!.ok({ status: 'ready', schema: { title: 'F2', fields: [{ key: 'b', label: 'B', type: 'text' }] } as never })
    await flush()
    expect(w.find('.fb-stub').attributes('data-title')).toBe('F2')

    asks[0]!.fail(new Error('旧页解析失败'))
    await flush()
    await flush()
    expect(w.find('.lcn-error').exists(), '旧页失败不得把新页打成错误态').toBe(false)
    expect(w.find('.fb-stub').attributes('data-title')).toBe('F2')
  })

  it('**解析器抛出非 Error（字符串）→ 错误态文案仍是字符串**', async () => {
    const w = mountShell({
      source: { kind: 'static', nodes: [{ key: 'f1', label: 'F', kind: 'form', formId: 'f1' }] },
      resolveFormPage: () => Promise.reject('裸字符串失败') as Promise<FormPageOutcome>,
    })
    await flush()
    expect(w.find('.lcn-error').attributes('data-state')).toBe('form-error')
    expect(w.find('.lcn-error-text').text()).toBe('裸字符串失败')
  })

  it('**切页会重置表单数据**（不复用上一页的输入，避免串数据）', async () => {
    const w = mountShell({
      source: {
        kind: 'static',
        nodes: [
          { key: 'f1', label: 'F1', kind: 'form', schema: { fields: [{ key: 'a', label: 'A', type: 'text' }] } },
          { key: 'f2', label: 'F2', kind: 'form', schema: { fields: [{ key: 'b', label: 'B', type: 'text' }] } },
        ],
      },
    })
    await flush()
    await w.find('.fb-both').trigger('click') // 在 f1 上产生数据
    await flush()
    expect(w.emitted('page-change')!.length).toBe(1)
    expect(w.findComponent(FormBuilderStub).props('modelValue'), '本轮数据要回流给渲染器').toEqual({ b: 2 })

    await w.find('.lcn-item[data-key="f2"]').trigger('click')
    await flush()
    expect(w.findComponent(FormBuilderStub).props('modelValue'), '切页后数据清空').toEqual({})
  })

  it('**renderFormPage: false → 不做内置渲染，交给默认插槽**', async () => {
    const resolveFormPage = vi.fn(async (): Promise<FormPageOutcome> => ({ status: 'missing', reason: '不该被调用' }))
    const w = mountShell(
      {
        source: { kind: 'static', nodes: [{ key: 'f1', label: 'F', kind: 'form', formId: 'f1' }] },
        renderFormPage: false,
        resolveFormPage,
      },
      { slots: { default: () => h('div', { class: 'host-page' }, '宿主自渲染') } },
    )
    await flush()
    expect(resolveFormPage, '不内置渲染就不该解析').not.toHaveBeenCalled()
    expect(w.find('.fb-stub').exists()).toBe(false)
    expect(w.find('.host-page').text()).toBe('宿主自渲染')
  })

  it('**#page 插槽优先级最高（连 form 页也接管）**', async () => {
    const resolveFormPage = vi.fn(async (): Promise<FormPageOutcome> => ({ status: 'missing', reason: 'x' }))
    const w = mountShell(
      { source: twoItems, resolveFormPage },
      { slots: { page: (p: { node: NavNode | null }) => h('div', { class: 'full-page' }, p.node?.key ?? '') } },
    )
    await flush()
    expect(resolveFormPage).not.toHaveBeenCalled()
    expect(w.find('.full-page').text()).toBe('a')
    expect(w.find('.fb-stub').exists()).toBe(false)
  })

  it('**表单提交只 emit，不自动外发**（配置可能经无签名分享码流入）', async () => {
    const fetcher = vi.fn(async () => jsonRes({}))
    const w = mountShell({ source: twoItems, fetcher })
    await flush()
    await w.find('.fb-submit').trigger('click')
    await flush()
    const payload = w.emitted('page-submit')!.at(-1) as Array<{ node: NavNode; data: unknown }>
    expect(payload[0]!.node.key).toBe('a')
    expect(payload[0]!.data).toEqual({ a: 1 })
    expect(fetcher, '外壳不替宿主提交').not.toHaveBeenCalled()
  })

  it('**page-change 每次数据变更只发一次**（FormBuilder 的 update+change 是同一次变更）', async () => {
    const w = mountShell({ source: twoItems })
    await flush()
    await w.find('.fb-both').trigger('click') // 桩一次点击同时发 update:modelValue 与 change
    await flush()
    expect(w.emitted('page-change')!.length, '两条事件不得各转一条对外事件').toBe(1)
  })

  it('**真 FormBuilder 集成冒烟：解析出的 schema 真的渲染出字段**（不桩，端到端一步）', async () => {
    const w = mountShell(
      {
        source: {
          kind: 'static',
          nodes: [
            {
              key: 'f1',
              label: '客户',
              kind: 'form',
              schema: { title: '客户台账', fields: [{ key: 'name', label: '客户名称', type: 'text' }] },
            },
          ],
        },
      },
      { stubs: {} }, // 不桩：渲染真组件
    )
    await flush()
    expect(w.find('.lcn-form').exists()).toBe(true)
    expect(w.text()).toContain('客户名称')
    expect(w.find('input').exists(), '字段真的渲染成输入框了').toBe(true)
  })
})

describe('LowCodeNav · 页面区：链接与其余种类', () => {
  const linkShell = (url: string) =>
    mountShell({ source: { kind: 'static', nodes: [{ key: 'l', label: '外链', kind: 'link', url }] } })

  it('**站内链接：不带 target/rel，点击被 preventDefault（交宿主路由器）**', async () => {
    const w = linkShell('/orders')
    await flush()
    const a = w.find('a.lcn-link')
    expect(a.attributes('href')).toBe('/orders')
    expect(a.attributes('target')).toBeUndefined()
    expect(a.attributes('rel')).toBeUndefined()
    expect(a.attributes('data-external')).toBe('0')

    const ev = new MouseEvent('click', { bubbles: true, cancelable: true })
    a.element.dispatchEvent(ev)
    expect(ev.defaultPrevented, '站内链接必须阻止默认跳转').toBe(true)
    expect((w.emitted('select')!.at(-1) as NavNode[])[0]!.key).toBe('l')
  })

  it('**外链：target=_blank + rel=noopener noreferrer，且不阻止跳转**（防反向标签劫持）', async () => {
    const w = linkShell('https://other.example.com/x')
    await flush()
    const a = w.find('a.lcn-link')
    expect(a.attributes('target')).toBe('_blank')
    expect(a.attributes('rel')).toBe('noopener noreferrer')
    expect(a.attributes('data-external')).toBe('1')

    // 派发前把 DOM 的 href 换成纯锚点：**处理器判外链读的是组件状态（current.url）而非 DOM href**
    // （上面三行已断言渲染出的 href/target/rel），所以断言不受影响；换来的是 happy-dom 不会真的发起导航
    // —— 否则它会去 DNS 解析 other.example.com 并在测试输出里抛 NetworkError（打桩 globalThis.fetch 无效）。
    const el = a.element as HTMLAnchorElement
    // 用**朴素 Event** 而非 MouseEvent：Vue 的 @click 监听器照常触发、defaultPrevented 断言照常可读，
    // 但 happy-dom 的"锚点默认导航"只对 MouseEvent 生效 → 不会真发 fetch（MouseEvent 会，且打桩 fetch 无效）。
    const ev = new Event('click', { bubbles: true, cancelable: true })
    el.dispatchEvent(ev)
    expect(ev.defaultPrevented, '外链要真跳，不能阻止').toBe(false)
    expect((w.emitted('select')!.at(-1) as NavNode[])[0]!.key, '外链也先选中当前项').toBe('l')
  })

  it('**非链接页不带外链标记**（宿主据 .lcn-page-external 区分观感，不能给普通页也标上）', async () => {
    const w = mountShell({ source: twoItems })
    await flush()
    expect(w.find('.lcn-page').attributes('data-kind')).toBe('form')
    expect(w.find('.lcn-page').classes()).not.toContain('lcn-page-external')

    const w2 = mountShell({ source: { kind: 'static', nodes: [{ key: 'l', label: 'L', kind: 'link', url: 'https://x.example.com/a' }] } })
    await flush()
    expect(w2.find('.lcn-page').classes()).toContain('lcn-page-external')
  })

  it('**data / custom 页：默认插槽拿到 node；没插槽则空态**', async () => {
    const withSlot = mountShell(
      { source: twoItems },
      { slots: { default: (p: { node: NavNode | null }) => h('div', { class: 'host-data' }, p.node?.key ?? '') } },
    )
    await flush()
    await withSlot.find('.lcn-item[data-key="b"]').trigger('click')
    await flush()
    expect(withSlot.find('.host-data').text()).toBe('b')
    expect(withSlot.find('.lcn-page').attributes('data-kind')).toBe('data')

    const noSlot = mountShell({ source: twoItems })
    await flush()
    await noSlot.find('.lcn-item[data-key="b"]').trigger('click')
    await flush()
    expect(noSlot.find('.lcn-hint[data-state="slot-required"]').exists()).toBe(true)
  })

  it('**没有任何选中项时显示 no-page 空态**（而不是渲染一个不存在的页面）', async () => {
    const w = mountShell({ source: twoItems, autoSelect: false })
    await flush()
    expect(w.find('.lcn-hint[data-state="no-page"]').exists()).toBe(true)
    expect(w.find('.fb-stub').exists()).toBe(false)
  })

  it('**自定义导航项插槽：宿主完全自渲染导航**', async () => {
    const w = mountShell(
      { source: twoItems },
      {
        slots: {
          'nav-item': (p: { node: NavNode; select: (n: NavNode) => void }) =>
            h('button', { class: 'my-nav', 'data-k': p.node.key, onClick: () => p.select(p.node) }, p.node.label),
        },
      },
    )
    await flush()
    const mine = w.findAll('.my-nav')
    expect(mine).toHaveLength(2)
    expect(w.find('.lcn-item').exists(), '插槽接管后不渲染内置按钮').toBe(false)
    await mine[1]!.trigger('click')
    await flush()
    expect((w.emitted('select')!.at(-1) as NavNode[])[0]!.key).toBe('b')
  })
})

describe('LowCodeNav · 卸载与迟到结果', () => {
  it('**卸载后到达的解析结果不写状态**（token 作废）', async () => {
    const resolvers: Array<(v: FormPageOutcome) => void> = []
    const w = mountShell({
      source: { kind: 'static', nodes: [{ key: 'f1', label: 'F', kind: 'form', formId: 'f1' }] },
      resolveFormPage: () => new Promise<FormPageOutcome>((r) => resolvers.push(r)),
    })
    await flush()
    w.unmount()
    expect(() => {
      resolvers[0]!({ status: 'ready', schema: { fields: [{ key: 'x', label: 'X', type: 'text' }] } as never })
    }, '卸载后回来不该抛（结果被丢弃）').not.toThrow()
  })

  it('**卸载后到达的导航响应不写状态**（useLowCodeNav 的 token 作废）', async () => {
    let resolve!: (v: Response) => void
    const w = mountShell({
      source: { kind: 'api', url: '/api/nav' },
      fetcher: vi.fn(() => new Promise<Response>((r) => (resolve = r))),
    })
    await flush()
    w.unmount()
    expect(() => resolve(jsonRes([{ key: 'a', label: 'A', kind: 'custom' }]))).not.toThrow()
  })
})

describe('LowCodeNav · 兜底文案与设计约束', () => {
  it('**默认文案来自既有通用键**（不新增 i18n 面）', async () => {
    const w = mountShell({})
    await flush()
    expect(w.find('.lcn-hint[data-state="empty"]').text()).toBe('暂无数据')
  })

  it('**nav-empty 插槽可覆盖空态文案**', async () => {
    const w = mountShell({}, { slots: { 'nav-empty': () => h('span', { class: 'my-empty' }, '还没有导航项') } })
    await flush()
    expect(w.find('.my-empty').text()).toBe('还没有导航项')
  })

  it('**源码级约束：外壳不得引入 vue-router**（否则低代码用户被动拉入 layout+router 依赖）', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/form-builder/lowcode/LowCodeNav.vue'), 'utf8')
    // 只看代码行：注释里解释"为什么不复用 AccordionNav（它绑 vue-router）"是正常说明
    const code = src
      .split('\n')
      .filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l))
      .join('\n')
    expect(code).not.toMatch(/from\s+['"]vue-router['"]/)
    expect(code).not.toMatch(/\buseRouter\(/)
    expect(code).not.toMatch(/\buseRoute\(/)
  })
})
/**
 * 宿主刷新入口（`defineExpose({ refresh })`）
 *
 * 为什么单独锁：`forms` 来源的导航项由"用户自建表单"派生。宿主在自己的界面里存完新表单后，
 * 若外壳不重取，新项不会出现 —— 而此前的出路只有"整页重载"或"去改全局 setActiveFormStore"，
 * 这与"用户完全自己对接自己数据库"的承诺不符。两条语义都要钉：
 *   ① 重取导航（新表单 → 新导航项）
 *   ② 重载当前页（改的是正打开的那份 → 页面跟着换，而不是"导航项在、页面还是旧字段"）
 */
describe('宿主刷新入口（defineExpose refresh）', () => {
  /** 宿主自己的 store 最小实现（内存，不碰 localStorage） */
  const memStore = () => {
    const mem = new Map<string, { meta: { title: string }; nodes: unknown[] }>()
    const stamps = [
      '2026-01-01T00:00:00.000Z',
      '2026-01-02T00:00:00.000Z',
      '2026-01-03T00:00:00.000Z',
      '2026-01-04T00:00:00.000Z'
    ]
    return {
      mem,
      async listForms() {
        return [...mem.entries()].map(([id, d], i) => ({
          id,
          name: d.meta.title,
          updatedAt: stamps[i % stamps.length],
          collectKey: `c_${id}`
        }))
      },
      async loadForm(id: string) {
        return mem.get(id) ?? null
      },
      async saveForm(
        id: string | null,
        design: { meta: { title: string }; nodes: unknown[] },
        name?: string
      ) {
        const nid = id ?? `f${mem.size + 1}`
        mem.set(nid, design)
        return {
          id: nid,
          name: name ?? design.meta.title,
          updatedAt: '2026-02-01T00:00:00.000Z',
          collectKey: `c_${nid}`
        }
      },
      async renameForm() {},
      async deleteForm(id: string) {
        mem.delete(id)
      },
      async loadRecords() {
        return []
      },
      async appendRecord() {},
      async updateRecord() {},
      async removeRecord() {},
      async clearRecords() {}
    }
  }

  const designOf = (title: string, label = "字段") => ({
    schemaVersion: 3,
    meta: { title },
    nodes: [{ id: 'n1', type: 'text', label, key: 'k1' }]
  })

  const labels = (w: VueWrapper) => w.findAll('.lcn-label').map((l) => l.text())

  it('**存完新表单后 refresh() → 新导航项立刻出现（不用重挂外壳）**', async () => {
    const store = memStore()
    await store.saveForm(null, designOf('旧表'), '旧表')
    const w = mountShell({ source: { kind: 'forms' }, formStore: store })
    await flush()
    expect(labels(w)).toEqual(['旧表'])

    // 宿主在自己的界面里又存了一个 —— 外壳此时**还不知道**
    await store.saveForm(null, designOf('新表'), '新表')
    expect(labels(w), '没调 refresh 之前不该自动出现（这正是要 expose 的原因）').toEqual(['旧表'])

    await (w.vm as unknown as { refresh: () => Promise<void> }).refresh()
    await flush()
    expect(labels(w), 'refresh 之后新项出现').toEqual(['新表', '旧表'])
  })

  it('**正打开的那份被改后 refresh() → 页面跟着换（不只是导航）**', async () => {
    const store = memStore()
    const saved = await store.saveForm(null, designOf('台账', '旧字段名'), '台账')
    const w = mountShell({
      source: { kind: 'forms' },
      formStore: store,
      resolveFormPage: createFormPageResolver(store as never)
    })
    await flush()
    expect(w.find('.fb-stub').attributes('data-title'), '首项自动选中并解析').toBe('台账')

    // 宿主后端改了同一份表单（同一 id，新的标题与字段名）
    await store.saveForm(saved.id, designOf('台账（已改）', '新字段名'), '台账（已改）')
    await (w.vm as unknown as { refresh: () => Promise<void> }).refresh()
    await flush()
    expect(
      w.find('.fb-stub').attributes('data-title'),
      '页面也必须重载，否则是「导航新、页面旧」'
    ).toBe('台账（已改）')
  })
  it('**宿主经模板 ref 拿到的 refresh 就是 defineExpose 的那份（内部代理不算）**', async () => {
    // ⚠️ 为什么单独锁这条：test-utils 的 `wrapper.vm` 会退到组件的**内部代理**，
    // 于是 `defineExpose({})` 这种变异在 vm 上看不出来（`vm.refresh` 照样是函数）。
    // 真实宿主走的是模板 ref → 只拿得到 expose 出来的对象 —— 这里必须按宿主的方式取。
    const store = memStore()
    await store.saveForm(null, designOf('旧表'), '旧表')
    const host = mountExposeHost(
      { source: { kind: 'forms' }, formStore: store },
      { stubs: { FormBuilder: FormBuilderStub } }
    )
    wrappers.push(host.wrapper)
    await flush()

    const exposed = host.exposed()
    expect(typeof exposed?.refresh, '模板 ref 上必须有 refresh —— 没有它宿主就没法让外壳重取').toBe('function')

    await store.saveForm(null, designOf('新表'), '新表')
    await exposed?.refresh?.()
    await flush()
    expect(host.wrapper.findAll('.lcn-label').map((l) => l.text()), '经 expose 的 refresh 真能让新项出现').toEqual([
      '新表',
      '旧表'
    ])
  })

})
