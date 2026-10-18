// RendererDisplayMap：地图标记展示元素（与表格/图表共用同一套数据源）
//
// 重点是「行 → 标记点」的归一与**缺坐标时的行为**：本组件刻意不给没有坐标的行编造位置
// （在地图上凭空插一个点，比少一个点危险得多——用户会照着错位置跑一趟），
// 但必须把跳过多少条说出来，否则用户只看到"点比数据少"，无从判断是数据问题还是渲染问题。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import RendererDisplayMap from '@/components/form-builder/renderer/RendererDisplayMap.vue'
import type { FormField } from '@/components/form-builder/types'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const field = (over: Partial<FormField> = {}): FormField =>
  ({ key: 'k1', label: '门店分布', type: 'amap', ...over }) as FormField

/** AmapWidget 依赖高德 SDK，测试里一律 stub——本文件测的是喂给它的 markers 对不对 */
const AmapStub = {
  name: 'AmapWidget',
  props: ['center', 'zoom', 'markers'],
  template: '<div class="amap-stub" />',
}

function mountMap(f: FormField, formData: Record<string, unknown> = {}, apiUrlPolicy?: Record<string, unknown>) {
  const w = mount(RendererDisplayMap, {
    props: { field: f, formData, apiUrlPolicy: apiUrlPolicy as never },
    global: { stubs: { AmapWidget: AmapStub } },
  })
  const markers = () =>
    (w.findComponent(AmapStub).props('markers') ?? []) as { longitude: number; latitude: number; title: string }[]
  return { w, markers }
}

describe('行 → 标记点归一', () => {
  it('lng/lat 短名', async () => {
    const { w, markers } = mountMap(
      field({ displaySource: { kind: 'static', staticData: [{ lng: 116.4, lat: 39.9, name: '北京店' }] } }),
    )
    await vi.waitFor(() => expect(w.find('.amap-stub').exists()).toBe(true))
    expect(markers()[0]).toMatchObject({ longitude: 116.4, latitude: 39.9, title: '北京店' })
  })

  it('longitude/latitude 长名与 position 数组都支持', async () => {
    const { w, markers } = mountMap(
      field({
        displaySource: {
          kind: 'static',
          staticData: [
            { longitude: 121.4, latitude: 31.2, title: '上海店' },
            { position: [113.2, 23.1], title: '广州店' },
          ],
        },
      }),
    )
    await vi.waitFor(() => expect(w.find('.amap-stub').exists()).toBe(true))
    expect(markers()).toHaveLength(2)
    expect(markers()[1]).toMatchObject({ longitude: 113.2, latitude: 23.1 })
  })

  it('中心取首个标记点', async () => {
    const { w } = mountMap(
      field({ displaySource: { kind: 'static', staticData: [{ lng: 1, lat: 2 }] } }),
    )
    await vi.waitFor(() => expect(w.find('.amap-stub').exists()).toBe(true))
    expect(w.findComponent(AmapStub).props('center')).toEqual([1, 2])
  })
})

describe('缺坐标：不编造位置，但要说清跳过了多少', () => {
  it('无坐标的行被跳过，并显示跳过条数', async () => {
    const { w, markers } = mountMap(
      field({
        displaySource: {
          kind: 'static',
          staticData: [{ lng: 116.4, lat: 39.9, name: '有坐标' }, { name: '没坐标 A' }, { name: '没坐标 B' }],
        },
      }),
    )
    await vi.waitFor(() => expect(w.find('.amap-stub').exists()).toBe(true))
    expect(markers(), '只标出有坐标的那条').toHaveLength(1)
    expect(markers()[0].title).toBe('有坐标')
    expect(w.text(), '跳过的条数必须说出来').toContain('2')
  })

  it('全部无坐标 → 走空态，不渲染地图', async () => {
    const { w } = mountMap(
      field({ displaySource: { kind: 'static', staticData: [{ name: 'A' }, { name: 'B' }] } }),
    )
    await new Promise((r) => setTimeout(r, 30))
    expect(w.findComponent(AmapStub).exists()).toBe(false)
  })

  it('经纬度写成字符串（后端常见的返回形态）→ 视为无坐标，不猜', async () => {
    const { w } = mountMap(
      field({ displaySource: { kind: 'static', staticData: [{ lng: '116.4', lat: '39.9' }] } }),
    )
    await new Promise((r) => setTimeout(r, 30))
    expect(w.findComponent(AmapStub).exists(), '字符串坐标不猜，宁可不画').toBe(false)
  })
})

describe('三模式同构', () => {
  it('field 模式：绑定字段的值驱动标记点', async () => {
    const { w, markers } = mountMap(field({ displaySource: { kind: 'field', fieldKey: 'stores' } }), {
      stores: [{ lng: 116.4, lat: 39.9, name: '门店一' }],
    })
    await vi.waitFor(() => expect(w.find('.amap-stub').exists()).toBe(true))
    expect(markers()[0].title).toBe('门店一')
  })

  it('api 模式：走 dataPath 取数', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ data: { rows: [{ longitude: 120.1, latitude: 30.2, title: '杭州店' }] } }),
      }) as unknown as Response),
    )
    const { w, markers } = mountMap(
      field({ displaySource: { kind: 'api', apiUrl: '/api/stores', dataPath: 'data.rows' } }),
    )
    await vi.waitFor(() => expect(w.find('.amap-stub').exists()).toBe(true))
    expect(markers()[0].title).toBe('杭州店')
  })

  it('api 外域地址：零请求并显示拒绝原因（与表格/图表/提交同一套守卫）', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const { w } = mountMap(field({ displaySource: { kind: 'api', apiUrl: 'https://attacker.example/x' } }))
    await vi.waitFor(() => expect(w.text()).toMatch(/安全策略拒绝/))
    expect(fetcher).not.toHaveBeenCalled()
  })
})
