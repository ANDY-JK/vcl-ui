// 门店名被裁成 6 字 + 省略号时，完整名必须还能看到（悬浮提示）—— 摘要区只是"看得下"，
// 不是"只有这些字"。这里直接验渲染结果，防止以后有人把 :title 摘掉。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RouteResult from '@/components/route-planner/RouteResult.vue'
import type { RoutePlan, Store } from '@/components/route-planner/types'

const LONG = '城西旗舰体验中心（临时围挡中）'
const SHORT = '东街口店'

const store = (id: string, name: string): Store => ({
  id,
  name,
  address: `${name} 1 号`,
  province: '福建省',
  city: '福州市',
  district: '鼓楼区',
  town: '',
  contact: '',
  phone: '',
  longitude: 119.3,
  latitude: 26.07,
  coordSource: 'manual',
  skipped: false,
})

const plan: RoutePlan = {
  days: [
    {
      day: 1,
      stores: [store('s1', LONG), store('s2', SHORT)],
      drivingTimeMin: 30,
      drivingDistanceM: 5000,
      accommodation: null,
    },
  ],
  totalStores: 2,
  totalSkipped: 0,
  totalDays: 1,
  totalDrivingTimeMin: 30,
  totalDrivingDistanceM: 5000,
  startPoint: { lat: 26.07, lon: 119.3 },
  skippedStores: [],
}

function mountResult() {
  return mount(RouteResult, {
    props: { plan, loading: false, enriching: false },
    global: { stubs: { teleport: true } },
  })
}

describe('RouteResult · 门店名截断的可发现性', () => {
  it('展示区裁到 6 字，title 仍是完整门店名', () => {
    const chips = mountResult().findAll('.store-chip')
    expect(chips.length).toBe(2)
    expect(chips[0].text()).toBe(`${LONG.slice(0, 6)}…`)
    expect(chips[0].attributes('title')).toBe(LONG)
  })

  it('没被裁的名字也带 title（同一口径，不按长度分叉）', () => {
    const chips = mountResult().findAll('.store-chip')
    expect(chips[1].text()).toBe(SHORT)
    expect(chips[1].attributes('title')).toBe(SHORT)
  })
})
