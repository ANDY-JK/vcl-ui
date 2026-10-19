// 地图选点 → 自动回填文字地址（2026-10-19）
//
// 把两个字段串起来：用户在 map-picker 上点一下，坐标回填本字段，
// 同时反向地理编码把文字地址回填到 address 字段——省掉再手打一遍省市街道。
//
// 三条刻意的设计约束（本文件逐一锁住）：
//   ① **默认关**（`autoAddress: true` 才启用）：反向地理编码是一次额外 REST 请求、
//      还吃高德配额；很多场景只要坐标（如"取货点"只用于导航）。默认开等于替宿主默默花钱。
//   ② 反查失败**不影响坐标**：`reverseGeocode` 返回 null 时就只是不回填地址，
//      用户已经选好的点不能因此作废。
//   ③ 回填目标可配（`addressField`，默认 `address`）：宿主可能叫 receiverAddress 之类。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import RendererMapPicker from '@/components/form-builder/renderer/RendererMapPicker.vue'
import type { FormField } from '@/components/form-builder/types'

const GEO_OK = {
  formatted: '北京市东城区东华门街道东长安街',
  province: '北京市',
  city: '北京市',
  district: '东城区',
  township: '东华门街道',
  street: '东长安街',
  streetNumber: '1号',
}

/** 把 reverseGeocode 换成可控替身（真实实现单独在 amap-reverse-geocode.spec 里测） */
const geoMock = vi.hoisted(() => vi.fn())
vi.mock('@/components/amap/amap-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/amap/amap-service')>()
  return { ...actual, reverseGeocode: geoMock }
})

afterEach(() => {
  vi.clearAllMocks()
})

const field = (over: Partial<FormField> = {}): FormField =>
  ({ key: 'pos', label: '取货位置', type: 'map-picker', ...over }) as FormField

const AmapStub = {
  name: 'AmapWidget',
  props: ['center', 'zoom', 'markers'],
  emits: ['map-click'],
  template: '<div class="amap-stub" />',
}

function mountPicker(over: Partial<FormField> = {}) {
  const w = mount(RendererMapPicker, {
    props: { field: field(over), modelValue: undefined },
    global: { stubs: { AmapWidget: AmapStub } },
  })
  const click = async (lng: number, lat: number) => {
    w.findComponent(AmapStub).vm.$emit('map-click', lng, lat)
    await new Promise((r) => setTimeout(r, 30))
  }
  return { w, click }
}

describe('默认关：不多发一次请求', () => {
  it('未配 autoAddress → 只回填坐标，不反查、不发地址事件', async () => {
    geoMock.mockResolvedValue(GEO_OK)
    const { w, click } = mountPicker()
    await click(116.4, 39.9)

    expect(w.emitted('update:modelValue')?.[0]).toEqual([{ lng: 116.4, lat: 39.9 }])
    expect(geoMock, '默认不该触发反向地理编码').not.toHaveBeenCalled()
    expect(w.emitted('update:formDataField')).toBeUndefined()
  })

  it('autoAddress: false 显式关闭时同样不反查', async () => {
    geoMock.mockResolvedValue(GEO_OK)
    const { click } = mountPicker({ autoAddress: false })
    await click(116.4, 39.9)
    expect(geoMock).not.toHaveBeenCalled()
  })
})

describe('开启后：坐标 + 地址双回填', () => {
  it('autoAddress: true → 反查并把 formatted 回填到默认 address 字段', async () => {
    geoMock.mockResolvedValue(GEO_OK)
    const { w, click } = mountPicker({ autoAddress: true })
    await click(116.4, 39.9)

    // 坐标照样回填
    expect(w.emitted('update:modelValue')?.[0]).toEqual([{ lng: 116.4, lat: 39.9 }])
    // 地址回填到另一个字段
    expect(geoMock).toHaveBeenCalledWith(116.4, 39.9)
    expect(w.emitted('update:formDataField')?.[0]).toEqual([
      { key: 'address', value: '北京市东城区东华门街道东长安街' },
    ])
  })

  it('addressField 可配：回填到自定义字段名', async () => {
    geoMock.mockResolvedValue(GEO_OK)
    const { w, click } = mountPicker({ autoAddress: true, addressField: 'receiverAddress' })
    await click(116.4, 39.9)
    expect(w.emitted('update:formDataField')?.[0]).toEqual([
      { key: 'receiverAddress', value: '北京市东城区东华门街道东长安街' },
    ])
  })

  it('回填的地址在界面上显示出来（"地址填上了没"当场可见）', async () => {
    geoMock.mockResolvedValue(GEO_OK)
    const { w, click } = mountPicker({ autoAddress: true })
    await click(116.4, 39.9)
    await w.vm.$nextTick()
    expect(w.text()).toContain('北京市东城区东华门街道东长安街')
  })
})

describe('反查失败：坐标不受影响', () => {
  it('reverseGeocode 返回 null → 坐标照常回填，不发地址事件', async () => {
    geoMock.mockResolvedValue(null)
    const { w, click } = mountPicker({ autoAddress: true })
    await click(116.4, 39.9)

    expect(w.emitted('update:modelValue')?.[0], '坐标必须保住').toEqual([{ lng: 116.4, lat: 39.9 }])
    expect(w.emitted('update:formDataField'), '没查到地址就不该写字段').toBeUndefined()
  })

  it('reverseGeocode 抛异常也不会打断（内部已 catch，这里再确认渲染器不裸调）', async () => {
    geoMock.mockRejectedValue(new Error('boom'))
    const { w, click } = mountPicker({ autoAddress: true })
    // 渲染器应把 await 放在 try 内或依赖实现不抛；此处验证坐标仍已回填
    await click(116.4, 39.9)
    expect(w.emitted('update:modelValue')?.[0]).toEqual([{ lng: 116.4, lat: 39.9 }])
  })
})
