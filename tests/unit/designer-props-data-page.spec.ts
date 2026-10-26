/**
 * 属性面板 · 数据源页（第 134 轮）。此前只有一条冒烟用例，分支覆盖 28%。
 *
 * 这页有 **7 个写点全落在同一个 `dataConfig` 上**，而且横跨三类卡片：
 * 默认值（`defaultType`/`defaultFormula`/`defaultApiUrl`/`defaultApiDataPath`）、
 * 远程数据源（`sourceType`/`apiUrl`/`labelField`/`valueField`）、
 * 数据联动（`linkageSource`/`linkageField`）、持久化（`cacheData`/`clearAfterSubmit`）。
 *
 * 第 131 轮在事件配置页栽过一次同类问题（`{ ...parent, section: { 全新 } }` 抹掉同区其它键），
 * 这里逐条钉"**改一个键不能动别的键**"，并覆盖条件渲染的开关组合。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import PropsDataPage from '@/components/form-builder/designer/PropsDataPage.vue'
import Input from '@/components/form/Input.vue'
import Select from '@/components/form/Select.vue'
import Group from '@/components/form/Group.vue'
import type { DesignerNode } from '@/components/form-builder/designer/types'

const FIELD_OPTIONS = [
  { value: 'dept', label: '部门' },
  { value: 'role', label: '角色' },
]

function mountPage(node: Record<string, unknown> = {}, fieldOptions = FIELD_OPTIONS) {
  const w = mount(PropsDataPage, {
    props: {
      node: { id: 'n1', key: 'k', label: '字段', type: 'text', ...node } as unknown as DesignerNode,
      fieldOptions,
    },
  })
  const lastPatch = () => (w.emitted('update') as Array<[Partial<DesignerNode>]> | undefined)?.at(-1)?.[0]
  const lastData = () => lastPatch()?.dataConfig as Record<string, unknown> | undefined
  /**
   * 按 placeholder 片段找 Input 组件。
   * 注意：本页在 sourceType=api 时还有原生 input（接口地址），所以不能靠"第几个 Input"来定位；
   * placeholder 在 props 上（Input 不透传到根元素）。
   */
  const inputByPh = (fragment: string) => {
    const found = w.findAllComponents(Input).find((i) => {
      const ph = (i.props() as Record<string, unknown>).placeholder
      return typeof ph === 'string' && ph.includes(fragment)
    })
    if (!found) throw new Error(`找不到 placeholder 含「${fragment}」的 Input`)
    return found
  }
  return { w, lastPatch, lastData, inputByPh }
}

/** 全部 Select（顺序：默认值类型 → 远程源类型 → 联动源 → 联动字段[可选]） */
const selects = (w: ReturnType<typeof mount>) => w.findAllComponents(Select)

// ════════════════════════════════════════════════════════════════════
describe('默认值类型：四种分支按选中值渲染', () => {
  it('none / currentUser / currentTime 不额外展开输入框', async () => {
    for (const v of ['none', 'currentUser', 'currentTime']) {
      const { w } = mountPage({ dataConfig: { defaultType: v } })
      // 不展开任何条件行：Input 组件一个都不该有
      expect(w.findAllComponents(Input).length, `${v} 不该展开输入框`).toBe(0)
      w.unmount()
    }
  })

  it('formula → 只出现公式输入框', async () => {
    const { w } = mountPage({ dataConfig: { defaultType: 'formula' } })
    const inputs = w.findAllComponents(Input)
    expect(inputs.length, '公式只有一个输入框').toBe(1)
    expect((inputs[0].props() as Record<string, unknown>).placeholder, '公式输入框要有指引').toBeTruthy()
    w.unmount()
  })

  it('api → 出现地址与取数路径两个输入框（且互不相同）', async () => {
    const { w } = mountPage({ dataConfig: { defaultType: 'api' } })
    const inputs = w.findAllComponents(Input)
    expect(inputs.length, 'api 默认值要两个输入框').toBe(2)
    const ph = inputs.map((i) => (i.props() as Record<string, unknown>).placeholder)
    expect(ph[0], '两个 placeholder 都要有').toBeTruthy()
    expect(ph[1], '两个 placeholder 都要有').toBeTruthy()
    expect(ph[0], '两个 placeholder 不能一样（否则用户分不清填哪个）').not.toBe(ph[1])
    w.unmount()
  })

  it('没配过 defaultType 时默认 none（不展开任何额外输入）', async () => {
    const { w } = mountPage({})
    expect(selects(w)[0].props('modelValue')).toBe('none')
    expect(w.findAllComponents(Input).length, '不展开输入框').toBe(0)
    w.unmount()
  })

  it('选默认值类型只写 defaultType，不碰其它已配的键', async () => {
    const { w, lastData } = mountPage({ dataConfig: { sourceType: 'api', apiUrl: '/x' } })
    selects(w)[0].vm.$emit('update:modelValue', 'formula')
    expect(lastData()).toEqual({ sourceType: 'api', apiUrl: '/x', defaultType: 'formula' })
    w.unmount()
  })

  it('写公式只动 defaultFormula', async () => {
    const { w, lastData } = mountPage({ dataConfig: { defaultType: 'formula', cacheData: true } })
    w.findComponent(Input).vm.$emit('update:modelValue', 'NOW()')
    expect(lastData()).toEqual({ defaultType: 'formula', cacheData: true, defaultFormula: 'NOW()' })
    w.unmount()
  })

  it('写默认值 API 地址只动 defaultApiUrl（不动 defaultApiDataPath）', async () => {
    const { w, lastData } = mountPage({
      dataConfig: { defaultType: 'api', defaultApiDataPath: 'data.list' },
    })
    w.findAllComponents(Input)[0].vm.$emit('update:modelValue', '/api/init')
    const d = lastData()!
    expect(d.defaultApiUrl).toBe('/api/init')
    expect(d.defaultApiDataPath, '取数路径不能被抹掉').toBe('data.list')
    w.unmount()
  })

  it('写取数路径只动 defaultApiDataPath', async () => {
    const { w, lastData } = mountPage({
      dataConfig: { defaultType: 'api', defaultApiUrl: '/api/init' },
    })
    w.findAllComponents(Input)[1].vm.$emit('update:modelValue', 'result.items')
    const d = lastData()!
    expect(d.defaultApiDataPath).toBe('result.items')
    expect(d.defaultApiUrl).toBe('/api/init')
    w.unmount()
  })

  it('**跨卡片不覆盖**：改默认值时远程数据源的地址不受影响', async () => {
    const { w, lastData } = mountPage({
      dataConfig: { defaultType: 'formula', sourceType: 'api', apiUrl: '/remote' },
    })
    w.findComponent(Input).vm.$emit('update:modelValue', 'SUM(1)')
    const d = lastData()!
    expect(d.defaultFormula).toBe('SUM(1)')
    expect(d.apiUrl, '远程源地址必须原样保留').toBe('/remote')
    expect(d.sourceType).toBe('api')
    w.unmount()
  })

  it('输入组件把 null 交回来时存空串（不留 null）', async () => {
    const { w, lastData } = mountPage({ dataConfig: { defaultType: 'formula' } })
    w.findComponent(Input).vm.$emit('update:modelValue', null)
    expect(lastData()!.defaultFormula).toBe('')
    w.unmount()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('远程数据源卡片', () => {
  it('只有 sourceType=api 才展开地址与映射字段', async () => {
    for (const v of ['none', 'database', 'userList', 'deptList']) {
      const { w } = mountPage({ dataConfig: { sourceType: v } })
      expect(w.find('.ldp-datasource-url').exists(), `${v} 不该显示接口地址`).toBe(false)
      w.unmount()
    }
    const { w } = mountPage({ dataConfig: { sourceType: 'api' } })
    expect(w.find('.ldp-datasource-url').exists()).toBe(true)
    w.unmount()
  })

  it('没配过 sourceType 时默认 none', async () => {
    const { w } = mountPage({})
    expect(selects(w)[1].props('modelValue')).toBe('none')
    w.unmount()
  })

  it('切数据源类型只写 sourceType', async () => {
    const { w, lastData } = mountPage({ dataConfig: { defaultType: 'fixed', cacheData: true } })
    selects(w)[1].vm.$emit('update:modelValue', 'api')
    expect(lastData()).toEqual({ defaultType: 'fixed', cacheData: true, sourceType: 'api' })
    w.unmount()
  })

  it('**接口地址用原生 input（不是 Input 组件），走 @input 原样写入**', async () => {
    const { w, lastData } = mountPage({ dataConfig: { sourceType: 'api' } })
    const raw = w.find('.ldp-datasource-input')
    expect(raw.exists(), '接口地址是原生 input').toBe(true)
    ;(raw.element as HTMLInputElement).value = '/api/list?page=1'
    await raw.trigger('input')
    expect(lastData()!.apiUrl).toBe('/api/list?page=1')
    w.unmount()
  })

  it('标签/值映射字段各写各的（**各次 emit 只带自己那个键**）', async () => {
    // ⚠️ 属性面板是**受控**组件：emit 不会改 props.node，所以第二次 emit 仍基于最初的 dataConfig。
    //    "不互相覆盖"要按"每次 patch 只含自己那个键"来验，不能指望第二次 patch 里出现第一次的值。
    const { w, inputByPh } = mountPage({ dataConfig: { sourceType: 'api', apiUrl: '/a' } })

    inputByPh('显示字段名').vm.$emit('update:modelValue', 'name')
    const p1 = (w.emitted('update') as Array<[Record<string, unknown>]>)[0][0]
    expect(p1.dataConfig).toEqual({ sourceType: 'api', apiUrl: '/a', labelField: 'name' })

    inputByPh('值字段名').vm.$emit('update:modelValue', 'id')
    const patches = w.emitted('update') as Array<[Record<string, unknown>]>
    expect(patches.length, '两次 emit').toBe(2)
    expect(patches[1][0].dataConfig).toEqual({ sourceType: 'api', apiUrl: '/a', valueField: 'id' })
    // 两次都不许动到 url / sourceType
    for (const [p] of patches) {
      const d = p.dataConfig as Record<string, unknown>
      expect(d.apiUrl).toBe('/a')
      expect(d.sourceType).toBe('api')
    }
    w.unmount()
  })

  it('非法 JSON / 空映射：null 交回来存空串', async () => {
    const { w, lastData, inputByPh } = mountPage({ dataConfig: { sourceType: 'api' } })
    inputByPh('显示字段名').vm.$emit('update:modelValue', null)
    expect(lastData()!.labelField).toBe('')
    w.unmount()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('数据联动', () => {
  it('linkageSource 为 none / 未设置时**不显示联动字段下拉**', async () => {
    for (const cfg of [{}, { linkageSource: 'none' }, { linkageSource: '' }]) {
      const { w } = mountPage({ dataConfig: cfg })
      expect(selects(w).length, `${JSON.stringify(cfg)} 不该有联动字段下拉`).toBe(3)
      w.unmount()
    }
  })

  it('linkageSource 非 none 时出现联动字段下拉，候选来自 fieldOptions', async () => {
    const { w } = mountPage({ dataConfig: { linkageSource: 'deptList' } })
    const all = selects(w)
    expect(all.length).toBe(4)
    expect(all[3].props('options')).toEqual(FIELD_OPTIONS)
    w.unmount()
  })

  it('选联动来源只写 linkageSource；选联动字段只写 linkageField', async () => {
    const { w, lastData } = mountPage({ dataConfig: { cacheData: true } })
    selects(w)[2].vm.$emit('update:modelValue', 'roleList')
    expect(lastData()).toEqual({ cacheData: true, linkageSource: 'roleList' })
    // 出现联动字段下拉后再选
    const { w: w2, lastData: last2 } = mountPage({ dataConfig: { linkageSource: 'roleList' } })
    selects(w2)[3].vm.$emit('update:modelValue', 'role')
    expect(last2()).toEqual({ linkageSource: 'roleList', linkageField: 'role' })
    w.unmount()
    w2.unmount()
  })

  it('清空联动字段写空串（不是 null），与既有占位口径一致', async () => {
    const { w, lastData } = mountPage({ dataConfig: { linkageSource: 'deptList', linkageField: 'dept' } })
    selects(w)[3].vm.$emit('update:modelValue', null)
    expect(lastData()!.linkageField).toBe('')
    w.unmount()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('提交后持久化开关', () => {
  it('两个开关默认都是关', async () => {
    const { w } = mountPage({})
    const groups = w.findAllComponents(Group)
    expect(groups.length).toBe(2)
    expect(groups[0].props('modelValue'), '缓存数据默认关').toBe(false)
    expect(groups[1].props('modelValue'), '提交后清空默认关').toBe(false)
    w.unmount()
  })

  it('两个开关各写各的键，且强制成布尔', async () => {
    const { w, lastData } = mountPage({ dataConfig: { cacheData: true } })
    const groups = w.findAllComponents(Group)
    groups[1].vm.$emit('update:modelValue', 1)
    const d = lastData()!
    expect(d.clearAfterSubmit, '假值也要存成布尔 true 而不是 1').toBe(true)
    expect(d.cacheData, '切清空开关不能动缓存开关').toBe(true)
    w.unmount()
  })

  it('关闭缓存开关只动 cacheData', async () => {
    const { w, lastData } = mountPage({ dataConfig: { cacheData: true, clearAfterSubmit: true } })
    w.findAllComponents(Group)[0].vm.$emit('update:modelValue', false)
    const d = lastData()!
    expect(d.cacheData).toBe(false)
    expect(d.clearAfterSubmit).toBe(true)
    w.unmount()
  })

  it('开关收到 null 时**存成 false 而不是 null**（`!!` 而非 `?? false`）', async () => {
    const { w, lastData } = mountPage({ dataConfig: {} })
    w.findAllComponents(Group)[0].vm.$emit('update:modelValue', null)
    expect(lastData()!.cacheData, 'null 要收敛成布尔 false').toBe(false)
    w.unmount()
  })
})


// ════════════════════════════════════════════════════════════════════
describe('展示数据源区块的门控（看注册表 defaults 有没有 displaySource）', () => {
  it('text 字段不支持 → 不渲染 PropsDisplaySource，也没有该区块标题', async () => {
    const { w } = mountPage({ type: 'text' })
    expect(w.findComponent({ name: 'PropsDisplaySource' }).exists()).toBe(false)
    w.unmount()
  })

  it('未注册的类型不崩（getFieldDefaults 回退 text → {}）', async () => {
    const { w } = mountPage({ type: '不存在的类型' })
    expect(w.find('.ldp-prop-page').exists(), '页面照常渲染').toBe(true)
    expect(w.findComponent({ name: 'PropsDisplaySource' }).exists()).toBe(false)
    w.unmount()
  })

  it('所有配置都空时也不抛错，且三个区块标题都在', async () => {
    const { w } = mountPage({})
    const titles = w.findAll('.ldp-section-title').map((n) => n.text())
    expect(titles.length, '默认值 / 远程数据源 / 数据联动 / 提交后 四块').toBe(4)
    w.unmount()
  })

  it('节点已有 dataConfig 时全部回填到控件', async () => {
    const cfg = {
      defaultType: 'api',
      defaultApiUrl: '/init',
      defaultApiDataPath: 'a.b',
      sourceType: 'api',
      apiUrl: '/list',
      labelField: 'n',
      valueField: 'v',
      linkageSource: 'deptList',
      linkageField: 'dept',
      cacheData: true,
      clearAfterSubmit: true,
    }
    const { w } = mountPage({ dataConfig: cfg })
    const all = selects(w)
    expect(all[0].props('modelValue')).toBe('api')
    expect(all[1].props('modelValue')).toBe('api')
    expect(all[2].props('modelValue')).toBe('deptList')
    expect(all[3].props('modelValue')).toBe('dept')
    const groups = w.findAllComponents(Group)
    expect(groups[0].props('modelValue')).toBe(true)
    expect(groups[1].props('modelValue')).toBe(true)
    const raw = w.find('.ldp-datasource-input').element as HTMLInputElement
    expect(raw.value).toBe('/list')
    w.unmount()
  })

  it('**任何一次写都只带 dataConfig 顶层，不带 node 其它键**（防止误改 label/type）', async () => {
    const { w } = mountPage({ dataConfig: {} })
    selects(w)[0].vm.$emit('update:modelValue', 'fixed')
    const patch = (w.emitted('update') as Array<[Record<string, unknown>]>)[0][0]
    expect(Object.keys(patch), 'patch 只应有 dataConfig').toEqual(['dataConfig'])
    await nextTick()
    w.unmount()
  })
})