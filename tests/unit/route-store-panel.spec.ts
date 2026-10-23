/**
 * StorePanel.vue（门店面板）+ ImportProgress.vue（导入进度）
 *
 * 两者此前**零覆盖**。StorePanel 覆盖：统计、城市分组与折叠、四字段搜索、删除确认
 * （含城市级批量删除与 Teleport 弹窗）、坐标来源标签、事件派发、危险操作不触发展开。
 * ImportProgress 覆盖：百分比计算（0 除、取整、上限）与文案回退。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { useT } from '@/components/_internal/i18n'
import type { Store } from '@/components/route-planner/types'
import StorePanel from '@/components/route-planner/StorePanel.vue'
import ImportProgress from '@/components/route-planner/ImportProgress.vue'

const t = useT()

const store = (over: Partial<Store> = {}): Store => ({
  id: 's1',
  name: '门店甲',
  address: '望京街 1 号',
  province: '北京市',
  city: '北京市',
  district: '朝阳区',
  town: '望京',
  contact: '张三',
  phone: '13800000000',
  longitude: 116.48,
  latitude: 39.99,
  coordSource: 'original',
  skipped: false,
  ...over,
})

let panel: VueWrapper | null = null
let progress: VueWrapper | null = null

function mountPanel(stores: Store[]): VueWrapper {
  panel = mount(StorePanel, { props: { stores }, attachTo: document.body })
  return panel
}

/** 展开第一个城市组（默认全折叠） */
async function expandFirst(w: VueWrapper): Promise<void> {
  await w.find('.group-header').trigger('click')
}

/** 弹窗走 Teleport 到 body，必须从 document 查 */
const overlay = () => document.body.querySelector('.confirm-overlay') as HTMLElement | null
const confirmBox = () => document.body.querySelector('.confirm-box') as HTMLElement | null

afterEach(() => {
  panel?.unmount()
  progress?.unmount()
  panel = null
  progress = null
  document.body.innerHTML = ''
})

describe('StorePanel · 统计与分组', () => {
  it('**统计总条数与有坐标条数**', () => {
    const w = mountPanel([
      store({ id: 'a' }),
      store({ id: 'b', longitude: null, latitude: null }),
    ])
    expect(w.text()).toContain(t('routePlanner.totalCount', { count: 2 }))
    expect(w.text()).toContain(t('routePlanner.withCoord', { count: 1 }))
  })

  it('**跳过数为 0 → 不显示跳过统计**（避免无意义噪声）', () => {
    const w = mountPanel([store()])
    expect(w.find('.skip-count').exists()).toBe(false)
  })

  it('**跳过数 > 0 → 显示跳过统计**', () => {
    const w = mountPanel([store({ skipped: true }), store({ id: 'b', skipped: true })])
    expect(w.find('.skip-count').exists()).toBe(true)
    expect(w.find('.skip-count').text()).toContain(t('routePlanner.skipped', { count: 2 }))
  })

  it('**按城市分组，且组按门店数量降序**', () => {
    const w = mountPanel([
      store({ id: 'a', city: '少城市' }),
      store({ id: 'b', city: '多城市' }),
      store({ id: 'c', city: '多城市' }),
      store({ id: 'd', city: '多城市' }),
    ])
    const names = w.findAll('.group-name').map((n) => n.text())
    expect(names, '多的城市排前面').toEqual(['多城市', '少城市'])
    expect(w.find('.group-count').text(), '组内计数').toContain(t('routePlanner.storeCountUnit', { count: 3 }))
  })

  it('**无城市的门店归入「未分组」**', () => {
    const w = mountPanel([store({ city: '' })])
    expect(w.find('.group-name').text()).toBe(t('routePlanner.ungrouped'))
  })

  it('**默认全部折叠**（组内门店不渲染）', () => {
    const w = mountPanel([store()])
    expect(w.find('.store-list').exists(), '默认折叠').toBe(false)
    expect(w.find('.group-header').attributes('aria-expanded')).toBe('false')
  })

  it('**点击组头展开 / 再点折叠**', async () => {
    const w = mountPanel([store()])
    await expandFirst(w)
    expect(w.find('.store-list').exists(), '展开后应渲染门店').toBe(true)
    expect(w.find('.group-header').attributes('aria-expanded')).toBe('true')

    await w.find('.group-header').trigger('click')
    expect(w.find('.store-list').exists(), '再点应收起').toBe(false)
  })

  it('**键盘 Enter / Space 也能切换折叠**（role=button + tabindex 的可达性契约）', async () => {
    const w = mountPanel([store()])
    await w.find('.group-header').trigger('keydown.enter')
    expect(w.find('.store-list').exists(), 'Enter 应展开').toBe(true)

    await w.find('.group-header').trigger('keydown.space')
    expect(w.find('.store-list').exists(), 'Space 应收起').toBe(false)
  })

  it('**各组折叠状态互相独立**', async () => {
    const w = mountPanel([store({ id: 'a', city: '甲城' }), store({ id: 'b', city: '乙城' })])
    await w.findAll('.group-header')[0]!.trigger('click')
    const lists = w.findAll('.store-list')
    expect(lists.length, '只展开一个组').toBe(1)
    await w.findAll('.group-header')[1]!.trigger('click')
    expect(w.findAll('.store-list').length, '第二个组也能独立展开').toBe(2)
  })
})

describe('StorePanel · 搜索', () => {
  const search = async (w: VueWrapper, q: string) => {
    await w.find('.search-input').setValue(q)
  }

  it('**未搜索时返回全部**', () => {
    const w = mountPanel([store()])
    expect(w.findAll('.group').length).toBe(1)
  })

  it('**按名称命中（且大小写不敏感、两侧空白忽略）**', async () => {
    const w = mountPanel([store({ name: 'Beijing Shop' }), store({ id: 'b', name: '上海店', city: '上海市' })])
    // 查询串必须带大写：门店侧一定会 toLowerCase，只有查询侧漏了才会失配
    await search(w, '  BEIJING  ')
    expect(w.findAll('.group-name').map((n) => n.text())).toEqual(['北京市'])
  })

  it('**按地址命中**', async () => {
    const w = mountPanel([store({ address: '望京街 1 号' }), store({ id: 'b', address: '南京路 9 号', city: '上海市' })])
    await search(w, '南京路')
    expect(w.findAll('.group-name').map((n) => n.text())).toEqual(['上海市'])
  })

  it('**按城市命中**', async () => {
    const w = mountPanel([store({ city: '杭州市' }), store({ id: 'b', city: '上海市' })])
    await search(w, '上海')
    expect(w.findAll('.group-name').map((n) => n.text())).toEqual(['上海市'])
  })

  it('**按联系人命中**', async () => {
    const w = mountPanel([store({ contact: '李四' }), store({ id: 'b', contact: '王五', city: '上海市' })])
    await search(w, '王五')
    expect(w.findAll('.group-name').map((n) => n.text())).toEqual(['上海市'])
  })

  it('**无结果 → 显示 noMatch 引导，且不显示任何分组**', async () => {
    const w = mountPanel([store()])
    await search(w, '不存在的关键字')
    expect(w.findAll('.group').length, '分组应为空').toBe(0)
    expect(w.text()).toContain(t('routePlanner.noMatch'))
    expect(w.text()).toContain(t('routePlanner.noMatchHint'))
  })

  it('**清空按钮：无输入时不渲染，有输入时点击清空并恢复全部**', async () => {
    const w = mountPanel([store()])
    expect(w.find('.search-clear').exists(), '空输入不该有清空按钮').toBe(false)

    await search(w, '甲')
    expect(w.find('.search-clear').exists()).toBe(true)
    await w.find('.search-clear').trigger('click')
    expect((w.find('.search-input').element as HTMLInputElement).value, '应清空输入').toBe('')
    expect(w.find('.search-clear').exists(), '清空后按钮消失').toBe(false)
  })

  it('**空列表 → 显示 noData 引导**', () => {
    const w = mountPanel([])
    expect(w.find('.empty-state').exists()).toBe(true)
    expect(w.text()).toContain(t('routePlanner.noData'))
    expect(w.text()).toContain(t('routePlanner.noDataHint'))
  })
})

describe('StorePanel · 事件派发', () => {
  it('**新增按钮派发 add**', async () => {
    const w = mountPanel([store()])
    await w.find('.btn-add').trigger('click')
    expect(w.emitted('add'), '应派发 add').toBeTruthy()
  })

  it('**编辑按钮派发 edit + 该门店对象**', async () => {
    const w = mountPanel([store({ id: 'x', name: '目标店' })])
    await expandFirst(w)
    const editBtn = w.findAll('.store-actions .btn-icon')[0]!
    await editBtn.trigger('click')
    const ev = w.emitted('edit')
    expect(ev).toBeTruthy()
    expect((ev![0]![0] as Store).id, '应带上该门店').toBe('x')
  })

  it('**跳过按钮派发 toggle-skip + 门店 id**', async () => {
    const w = mountPanel([store({ id: 'x' })])
    await expandFirst(w)
    await w.findAll('.store-actions .btn-icon')[1]!.trigger('click')
    expect(w.emitted('toggle-skip')![0]).toEqual(['x'])
  })

  it('**跳过态不同 → 跳过按钮的 title 与图标语义不同**（同一按钮表达两态）', async () => {
    const w = mountPanel([store({ id: 'a', skipped: false })])
    await expandFirst(w)
    const btn = () => w.findAll('.store-actions .btn-icon')[1]!
    expect(btn().attributes('title'), '未跳过 → 提示去跳过').toBe(t('routePlanner.toggleSkipTitleOn'))

    await w.setProps({ stores: [store({ id: 'a', skipped: true })] })
    expect(btn().attributes('title'), '已跳过 → 提示取消跳过').toBe(t('routePlanner.toggleSkipTitle'))
  })

  it('**城市批量跳过派发 skip-city**', async () => {
    const w = mountPanel([store({ city: '北京市' })])
    await w.find('.group-batch .btn-batch').trigger('click')
    expect(w.emitted('skip-city')![0], '应带城市名').toEqual(['北京市'])
  })

  it('**批量按钮不冒泡触发展开**（@click.stop 的可见后果）', async () => {
    const w = mountPanel([store({ city: '北京市' })])
    await w.find('.group-batch .btn-batch').trigger('click')
    expect(w.find('.store-list').exists(), '点批量按钮不该把组展开').toBe(false)
    expect(w.emitted('skip-city'), '但事件要照发').toBeTruthy()
  })
})

describe('StorePanel · 删除确认', () => {
  it('**单个门店删除：打开确认框，确认后派发 remove(id)**', async () => {
    const w = mountPanel([store({ id: 'x' })])
    await expandFirst(w)
    expect(overlay(), '初始不该有弹窗').toBeNull()

    await w.findAll('.store-actions .btn-icon')[2]!.trigger('click')
    expect(overlay(), '应弹出确认框').toBeTruthy()
    expect(confirmBox()!.textContent).toContain(t('routePlanner.deleteStoreHint'))

    ;(document.body.querySelector('.btn-confirm-delete') as HTMLElement).click()
    await w.vm.$nextTick()
    expect(w.emitted('remove')![0], '应派发 remove').toEqual(['x'])
    expect(overlay(), '确认后应关闭').toBeNull()
  })

  it('**城市删除：确认框提示为城市级口径，确认后派发 remove-city**', async () => {
    const w = mountPanel([store({ id: 'a', city: '北京市' }), store({ id: 'b', city: '北京市' })])
    await w.find('.group-batch .btn-batch-danger').trigger('click')
    expect(overlay(), '应弹确认框').toBeTruthy()
    expect(confirmBox()!.textContent).toContain(t('routePlanner.deleteCityHint'))
    expect(confirmBox()!.textContent, '文案应含城市与数量').toContain(
      String(t('routePlanner.cityStoresCount', { city: '北京市', count: 2 })),
    )

    ;(document.body.querySelector('.btn-confirm-delete') as HTMLElement).click()
    await w.vm.$nextTick()
    expect(w.emitted('remove-city')![0], '应派发 remove-city').toEqual(['北京市'])
    expect(w.emitted('remove'), '城市删除不该走单品删除').toBeFalsy()
  })

  it('**门店 id 为空 → 确认后不派发 remove**（既无 city 也无 id 时安全不动）', async () => {
    const w = mountPanel([store({ id: '', city: '北京市' })])
    // 走单品删除入口（不是城市入口），这样 confirmTarget 里有 id:'' 而没有 city
    await expandFirst(w)
    await w.findAll('.store-actions .btn-icon')[2]!.trigger('click')
    expect(overlay(), '应弹确认框').toBeTruthy()
    ;(document.body.querySelector('.btn-confirm-delete') as HTMLElement).click()
    await w.vm.$nextTick()
    expect(w.emitted('remove'), 'id 为空不该派发').toBeFalsy()
    expect(w.emitted('remove-city'), '也不该误派城市删除').toBeFalsy()
    expect(overlay(), '但弹窗仍应关闭').toBeNull()
  })

  it('**取消 → 不派发任何事件且关闭弹窗**', async () => {
    const w = mountPanel([store({ id: 'x' })])
    await expandFirst(w)
    await w.findAll('.store-actions .btn-icon')[2]!.trigger('click')
    ;(document.body.querySelector('.btn-cancel') as HTMLElement).click()
    await w.vm.$nextTick()
    expect(overlay(), '应关闭').toBeNull()
    expect(w.emitted('remove')).toBeFalsy()
    expect(w.emitted('remove-city')).toBeFalsy()
  })

  it('**点击遮罩自身 → 取消**（点弹窗内容不取消）', async () => {
    const w = mountPanel([store({ id: 'x' })])
    await expandFirst(w)
    await w.findAll('.store-actions .btn-icon')[2]!.trigger('click')

    // 弹窗在 Teleport 里，wrapper.find 查不到，只能从 document 取原生节点派发
    confirmBox()!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await w.vm.$nextTick()
    expect(overlay(), '点内容不该关闭').toBeTruthy()

    overlay()!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await w.vm.$nextTick()
    expect(overlay(), '点遮罩应关闭').toBeNull()
  })

  it('**确认框具备 alertdialog 语义**（无障碍：模态 + 可聚焦容器）', async () => {
    const w = mountPanel([store({ id: 'x' })])
    await expandFirst(w)
    await w.findAll('.store-actions .btn-icon')[2]!.trigger('click')
    const box = confirmBox()!
    expect(box.getAttribute('role')).toBe('alertdialog')
    expect(box.getAttribute('aria-modal')).toBe('true')
    expect(box.getAttribute('tabindex')).toBe('-1')
    expect(box.getAttribute('aria-label')).toBe(t('routePlanner.deleteConfirmTitle'))
  })

  it('**门店名为空 → 确认文案回退到地址；地址也空 → 回退未知门店**', async () => {
    const w = mountPanel([store({ id: 'x', name: '', address: '望京街 1 号' })])
    await expandFirst(w)
    await w.findAll('.store-actions .btn-icon')[2]!.trigger('click')
    expect(confirmBox()!.textContent).toContain('望京街 1 号')
    ;(document.body.querySelector('.btn-cancel') as HTMLElement).click()
    await w.vm.$nextTick()

    await w.setProps({ stores: [store({ id: 'x', name: '', address: '' })] })
    await w.findAll('.store-actions .btn-icon')[2]!.trigger('click')
    expect(confirmBox()!.textContent, '两者都空时回退未知门店').toContain(t('routePlanner.unknownStore'))
  })
})

describe('StorePanel · 门店行呈现', () => {
  it('**坐标来源标签：五种来源各有独立文案**', async () => {
    const sources: Array<[Store['coordSource'], string]> = [
      ['original', t('routePlanner.sourceOriginal')],
      ['address_geocode', t('routePlanner.sourceGeocode')],
      ['township_geocode', t('routePlanner.sourceTownship')],
      ['manual', t('routePlanner.sourceManual')],
      ['none', t('routePlanner.sourceNone')],
    ]
    for (const [src, label] of sources) {
      const w = mountPanel([store({ coordSource: src })])
      await expandFirst(w)
      expect(w.find('.source-tag').text(), `来源 ${src} 的标签`).toBe(label)
      w.unmount()
      panel = null
    }
  })

  it('**未知来源原样显示**（不吞掉新枚举值）', async () => {
    const w = mountPanel([store({ coordSource: 'brand_new' as Store['coordSource'] })])
    await expandFirst(w)
    expect(w.find('.source-tag').text()).toBe('brand_new')
  })

  it('**无坐标判定看经度**（有经度无纬度的门店不该被标成无坐标）', async () => {
    const w = mountPanel([store({ id: 'a', longitude: 116.48, latitude: null })])
    await expandFirst(w)
    expect(w.find('.store-item').classes(), '经度有值即视为已定位').not.toContain('noCoord')
  })

  it('**跳过态与无坐标态各自加类**', async () => {
    const w = mountPanel([
      store({ id: 'a', skipped: true }),
      store({ id: 'b', skipped: false, longitude: null, latitude: null }),
    ])
    await expandFirst(w)
    const items = w.findAll('.store-item')
    expect(items[0]!.classes(), '跳过项').toContain('skipped')
    expect(items[1]!.classes(), '无坐标项').toContain('noCoord')
    expect(items[1]!.classes(), '无坐标项不该带跳过类').not.toContain('skipped')
  })

  it('**门店名为空 → 标题回退地址**', async () => {
    const w = mountPanel([store({ name: '', address: '望京街 1 号' })])
    await expandFirst(w)
    expect(w.find('.store-name').text()).toBe('望京街 1 号')
    expect(w.find('.store-name').attributes('title')).toBe('望京街 1 号')
  })

  it('**无联系人 → 不渲染联系人节点**（不留空占位）', async () => {
    const w = mountPanel([store({ contact: '' })])
    await expandFirst(w)
    expect(w.find('.contact').exists()).toBe(false)
  })

  it('**有联系人 → 同时显示联系人与电话**', async () => {
    const w = mountPanel([store({ contact: '李四', phone: '13900000000' })])
    await expandFirst(w)
    const text = w.find('.contact').text()
    expect(text).toContain('李四')
    expect(text).toContain('13900000000')
  })
})

describe('ImportProgress · 百分比与文案', () => {
  const mountProgress = (props: { current: number; total: number; label?: string }) => {
    progress = mount(ImportProgress, { props, attachTo: document.body })
    return progress
  }

  it('**total 为 0 → 0%（不出现 NaN 或 Infinity）**', () => {
    const w = mountProgress({ current: 0, total: 0 })
    const bar = w.find('.progress-bar')
    expect(bar.attributes('aria-valuenow'), '除零应兜底为 0').toBe('0')
    expect(w.find('.progress-fill').attributes('style')).toContain('width: 0%')
  })

  it('**百分比取整**（3/8 → 38%）', () => {
    const w = mountProgress({ current: 3, total: 8 })
    expect(w.find('.progress-bar').attributes('aria-valuenow')).toBe('38')
    expect(w.find('.progress-fill').attributes('style')).toContain('width: 38%')
  })

  it('**上限 100%**（current 超过 total 也不越界）', () => {
    const w = mountProgress({ current: 30, total: 10 })
    expect(w.find('.progress-bar').attributes('aria-valuenow')).toBe('100')
  })

  it('**100% 时宽度 100%**', () => {
    const w = mountProgress({ current: 5, total: 5 })
    expect(w.find('.progress-fill').attributes('style')).toContain('width: 100%')
  })

  it('**未传 label → 用内置 i18n 文案，且 aria-label 同步**', () => {
    const w = mountProgress({ current: 1, total: 4 })
    expect(w.find('.progress-label').text()).toBe(t('routePlanner.processing'))
    expect(w.find('.progress-bar').attributes('aria-label')).toBe(t('routePlanner.processing'))
  })

  it('**传了 label → 覆盖文案与 aria-label**', () => {
    const w = mountProgress({ current: 2, total: 6, label: '导入门店数据' })
    expect(w.find('.progress-label').text()).toBe('导入门店数据')
    expect(w.find('.progress-bar').attributes('aria-label')).toBe('导入门店数据')
  })

  it('**计数以 current / total 原样显示**', () => {
    const w = mountProgress({ current: 7, total: 13 })
    expect(w.find('.progress-count').text()).toBe('7 / 13')
  })

  it('**进度条语义完整**（role/valuemin/valuemax）', () => {
    const w = mountProgress({ current: 1, total: 2 })
    const bar = w.find('.progress-bar')
    expect(bar.attributes('role')).toBe('progressbar')
    expect(bar.attributes('aria-valuemin')).toBe('0')
    expect(bar.attributes('aria-valuemax')).toBe('100')
  })

  it('**props 更新后百分比与宽度同步**（导入过程中实时推进）', async () => {
    const w = mountProgress({ current: 1, total: 4 })
    expect(w.find('.progress-bar').attributes('aria-valuenow')).toBe('25')
    await w.setProps({ current: 3, total: 4 })
    expect(w.find('.progress-bar').attributes('aria-valuenow')).toBe('75')
    expect(w.find('.progress-fill').attributes('style')).toContain('width: 75%')
  })
})

describe('StorePanel · 分组视图与统计一致性', () => {
  it('**统计统计的是全量、分组是基于过滤后**（搜索时统计不缩水）', async () => {
    const w = mountPanel([store({ id: 'a', name: '甲' }), store({ id: 'b', name: '乙', city: '上海市' })])
    expect(w.text()).toContain(t('routePlanner.totalCount', { count: 2 }))
    await w.find('.search-input').setValue('甲')
    expect(w.text(), '搜索后总数仍报全量').toContain(t('routePlanner.totalCount', { count: 2 }))
    expect(w.findAll('.group').length, '但分组只剩命中项').toBe(1)
  })

  it('**未分组与真实城市可共存**', () => {
    const w = mountPanel([store({ id: 'a', city: '' }), store({ id: 'b', city: '南京市' })])
    const names = w.findAll('.group-name').map((n) => n.text())
    expect(names.sort()).toEqual([t('routePlanner.ungrouped'), '南京市'].sort())
  })
})

describe('StorePanel · 生命周期', () => {
  it('**卸载后确认框随之移除（Teleport 内容不残留）**', async () => {
    const w = mountPanel([store({ id: 'x' })])
    await expandFirst(w)
    await w.findAll('.store-actions .btn-icon')[2]!.trigger('click')
    expect(overlay()).toBeTruthy()

    w.unmount()
    panel = null
    expect(overlay(), '卸载应清掉 Teleport 内容').toBeNull()
  })

  it('**stores 从空变为有数据 → 引导消失并出现分组**', async () => {
    const w = mountPanel([])
    expect(w.text()).toContain(t('routePlanner.noData'))
    await w.setProps({ stores: [store()] })
    expect(w.text(), '有数据后不该再显示空态').not.toContain(t('routePlanner.noData'))
    expect(w.findAll('.group').length).toBe(1)
  })
})