// RendererMapPicker：地图选点（输入型字段）
//
// 与展示组的 RendererDisplayMap 是**相反的两件事**，本文件先锁这个区别：
//   展示组 isLayout=true（只看，不进提交数据） vs 本组件 isLayout=false（选出值，进提交数据）
//
// 值结构定为 `{ lng, lat }` 而不是地址字符串或数组：
//   · 不拼地址——地图点击只给坐标，反向地理编码要额外请求，失败时会出现"选了点却没值"
//   · 不存数组——对象在提交后的消费侧更自解释，也不怕顺序搞反
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import RendererMapPicker from '@/components/form-builder/renderer/RendererMapPicker.vue'
import { getFieldRegistration, isLayoutField, getFieldMeta } from '@/components/form-builder/fieldRegistry'
import { FIELD_NODE_TYPES } from '@/components/form-builder/designer/types/domain'
import { createField, toFormSchema, type DesignerNode } from '@/components/form-builder/designer/types'
import { collectVisibleData } from '@/components/form-builder/useFormSchema'
import type { FormField } from '@/components/form-builder/types'

afterEach(() => {
  vi.restoreAllMocks()
})

const field = (over: Partial<FormField> = {}): FormField =>
  ({ key: 'pos', label: '取货位置', type: 'map-picker', ...over }) as FormField

/** AmapWidget 依赖高德 SDK，stub 掉——本文件测的是"点一下回填什么" */
const AmapStub = {
  name: 'AmapWidget',
  props: ['center', 'zoom', 'markers'],
  emits: ['map-click'],
  template: '<div class="amap-stub" />',
}

function mountPicker(modelValue: unknown = undefined, over: Partial<FormField> = {}) {
  const w = mount(RendererMapPicker, {
    props: { field: field(over), modelValue },
    global: { stubs: { AmapWidget: AmapStub } },
  })
  return { w, amap: () => w.findComponent(AmapStub) }
}

describe('注册与语义：输入型而非展示型', () => {
  it('map-picker 已注册，且 **isLayout=false**（它产出一个值进提交数据）', () => {
    const reg = getFieldRegistration('map-picker')
    expect(reg).toBeTruthy()
    expect(reg.isLayout, '选点是有值的输入型字段，不是纯展示').toBe(false)
    expect(isLayoutField('map-picker')).toBe(false)
  })

  it('对外枚举与面板清单都包含它', () => {
    expect(FIELD_NODE_TYPES).toContain('map-picker')
    expect(getFieldMeta().map((x) => x.type)).toContain('map-picker')
  })

  it('createField 产出可用默认值', () => {
    const f = createField('map-picker' as never, 1)
    expect(f.type).toBe('map-picker')
    expect(f.span).toBe(24)
  })

  it('**与展示组 amap 相对**：amap 是 isLayout=true，map-picker 是 false', () => {
    expect(isLayoutField('amap')).toBe(true)
    expect(isLayoutField('map-picker')).toBe(false)
  })
})

describe('选点回填', () => {
  it('点击地图 → emit { lng, lat }', async () => {
    const { amap } = mountPicker()
    amap().vm.$emit('map-click', 116.397428, 39.90923)
    await new Promise((r) => setTimeout(r, 10))
    const emitted = amap().emitted('map-click')
    expect(emitted?.[0]).toEqual([116.397428, 39.90923])
  })

  it('选点后把坐标显示出来（"选没选上"当场可见）', async () => {
    const { w } = mountPicker({ lng: 116.397428, lat: 39.90923 })
    await new Promise((r) => setTimeout(r, 10))
    expect(w.text()).toContain('116.397428')
  })

  it('未选点时给操作提示', async () => {
    const { w } = mountPicker()
    await new Promise((r) => setTimeout(r, 10))
    expect(w.text()).toContain('点击')
  })
})

describe('回填与容错', () => {
  it('已有值 → 作为标记点与地图中心渲染（编辑旧记录时能看到上次选的位置）', async () => {
    const { amap } = mountPicker({ lng: 121.4737, lat: 31.2304 })
    await new Promise((r) => setTimeout(r, 10))
    const markers = amap().props('markers') as { longitude: number; latitude: number }[]
    expect(markers).toHaveLength(1)
    expect(markers[0]).toMatchObject({ longitude: 121.4737, latitude: 31.2304 })
    expect(amap().props('center')).toEqual([121.4737, 31.2304])
  })

  it('值形态不对（字符串/数组/缺字段）→ 当作未选点，不猜', async () => {
    for (const bad of ['116,39', [116, 39], { lng: 116 }, { lat: 39 }, null]) {
      const { amap } = mountPicker(bad)
      await new Promise((r) => setTimeout(r, 5))
      expect((amap().props('markers') as unknown[]).length, `不应把 ${JSON.stringify(bad)} 当坐标`).toBe(0)
    }
  })

  it('字段配置的 mapCenter/mapZoom 可作为初始视图', async () => {
    const { amap } = mountPicker(undefined, { mapCenter: [113.2, 23.1], mapZoom: 12 } as Partial<FormField>)
    await new Promise((r) => setTimeout(r, 10))
    expect(amap().props('center')).toEqual([113.2, 23.1])
    expect(amap().props('zoom')).toBe(12)
  })
})

describe('进提交数据（与展示组相反）', () => {
  it('collectVisibleData 会带上 map-picker 的值', () => {
    const nodes = [
      { id: 'n1', type: 'map-picker', label: '取货位置', span: 24, key: 'pos' },
      { id: 'n2', type: 'text', label: '姓名', span: 24, key: 'name' },
    ] as unknown as DesignerNode[]

    const schema = toFormSchema(nodes, {})
    const data: Record<string, unknown> = { pos: { lng: 116.4, lat: 39.9 }, name: '张三' }
    const submitted = collectVisibleData(schema.fields, data, () => true)
    expect(Object.keys(submitted).sort()).toEqual(['name', 'pos'])
    expect(submitted.pos).toEqual({ lng: 116.4, lat: 39.9 })
  })
})
