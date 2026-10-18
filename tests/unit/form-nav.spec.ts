// useFormNav：把用户自建的表单变成导航项（动态导航）
//
// 宿主产品形态：只搭一个导航外壳 + 一个低代码入口，其余导航项由用户自己创建。
// 因此「表单列表 → 导航项」必须是数据驱动的，不能让宿主每加一个表单就改一次代码。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { buildFormNavItems, useFormNav, type FormNavItem } from '@/components/form-builder/useFormNav'
import { setActiveFormStore } from '@/components/form-builder/designer/store'
import type { FormStore, FormMetaItem } from '@/components/form-builder/designer/store'

afterEach(() => {
  setActiveFormStore(null)
  vi.restoreAllMocks()
})

const meta = (id: string, name: string, updatedAt: string): FormMetaItem => ({
  id,
  name,
  updatedAt,
  collectKey: `fd_collect_${id}`,
})

const THREE = [meta('f1', '门店提报', '2026-10-01T00:00:00.000Z'), meta('f2', '合同收集', '2026-10-03T00:00:00.000Z'), meta('f3', '设备巡检', '2026-10-02T00:00:00.000Z')]

describe('buildFormNavItems · 映射', () => {
  it('默认按更新时间倒序，并生成 path / collectKey', () => {
    const items = buildFormNavItems(THREE)
    expect(items.map((i) => i.label)).toEqual(['合同收集', '设备巡检', '门店提报'])
    expect(items[0]).toMatchObject({
      key: 'f2',
      formId: 'f2',
      path: '/form/f2',
      collectKey: 'fd_collect_f2',
    })
  })

  it('basePath 可定制，末尾斜杠会被规整（不会出现双斜杠）', () => {
    expect(buildFormNavItems(THREE, { basePath: '/f' })[0].path).toBe('/f/f2')
    expect(buildFormNavItems(THREE, { basePath: '/f/' })[0].path).toBe('/f/f2')
  })

  it('filter 由宿主实现（权限/分组），不传则全量', () => {
    const items = buildFormNavItems(THREE, { filter: (f) => f.id !== 'f2' })
    expect(items.map((i) => i.id ?? i.key)).toEqual(['f3', 'f1'])
  })

  it('sort 可覆写（例如按名称）', () => {
    const items = buildFormNavItems(THREE, { sort: (a, b) => a.name.localeCompare(b.name, 'zh') })
    expect(items).toHaveLength(3)
    expect(items.map((i) => i.label).sort()).toEqual(['合同收集', '门店提报', '设备巡检'].sort())
  })

  it('icon 支持字符串与函数两种形态；不传则不带 icon 字段', () => {
    expect(buildFormNavItems(THREE, { icon: 'doc' })[0].icon).toBe('doc')
    expect(buildFormNavItems(THREE, { icon: (f) => (f.id === 'f2' ? 'star' : undefined) })[0].icon).toBe('star')
    expect(buildFormNavItems(THREE)[0].icon).toBeUndefined()
  })

  it('toPath 可完全接管路径生成（宿主自己的路由约定）', () => {
    const items = buildFormNavItems(THREE, { toPath: (f) => `/f/${f.id}` })
    expect(items[0].path).toBe('/f/f2')
    // toPath 与 basePath 同时给时，以 toPath 为准
    expect(buildFormNavItems(THREE, { basePath: '/ignored', toPath: (f) => `/x/${f.id}` })[0].path).toBe('/x/f2')
  })

  it('空列表返回空数组（不抛错）', () => {
    expect(buildFormNavItems([])).toEqual([])
  })
})

describe('useFormNav · 从存储加载', () => {
  const fakeStore = (list: FormMetaItem[]): FormStore =>
    ({
      listForms: async () => list,
      loadForm: async () => null,
      saveForm: async () => list[0],
      renameForm: async () => {},
      deleteForm: async () => {},
      loadRecords: async () => [],
      appendRecord: async () => {},
      removeRecord: async () => {},
      clearRecords: async () => {},
    }) as unknown as FormStore

  /**
   * 把 composable 放进真实组件的 setup 里跑。
   * 必须在 setup 内调用：`onMounted` 依赖当前组件实例，在 setup 外调用不会注册（Vue 的约定，
   * 也意味着宿主必须像用其它 composable 一样在 setup 里用 useFormNav）。
   */
  const mountNav = (options: Parameters<typeof useFormNav>[0]) => {
    let nav!: ReturnType<typeof useFormNav>
    const w = mount(
      defineComponent({
        setup() {
          nav = useFormNav(options)
          return () =>
            h(
              'ul',
              nav.items.value.map((i: FormNavItem) => h('li', { key: i.key }, i.label)),
            )
        },
      }),
    )
    return { w, nav }
  }

  it('挂载时自动加载，把表单变成导航项', async () => {
    const { w, nav } = mountNav({ store: fakeStore(THREE) })
    await vi.waitFor(() => expect(nav.items.value).toHaveLength(3))
    await nextTick()
    expect(w.text()).toContain('合同收集')
  })

  it('autoLoad=false 时不自动加载，由宿主自行 refresh（例如放在路由守卫里）', async () => {
    const { nav } = mountNav({ store: fakeStore(THREE), autoLoad: false })
    await nextTick()
    expect(nav.items.value).toHaveLength(0)
    await nav.refresh()
    expect(nav.items.value).toHaveLength(3)
  })

  it('加载失败：error 有值，且**保留上一次的导航**（不因一次抖动整条消失）', async () => {
    let fail = false
    const store = {
      ...fakeStore(THREE),
      listForms: async () => {
        if (fail) throw new Error('后端 500')
        return THREE
      },
    } as unknown as FormStore

    const { nav } = mountNav({ store, autoLoad: false })
    await nav.refresh()
    expect(nav.items.value).toHaveLength(3)
    expect(nav.error.value).toBeNull()

    fail = true
    await nav.refresh()
    expect(nav.error.value).toContain('后端 500')
    expect(nav.items.value, '旧导航应保留').toHaveLength(3)
  })

  it('默认数据源是 activeFormStore（宿主 setActiveFormStore 注入的后端）', async () => {
    setActiveFormStore(fakeStore(THREE))
    const { nav } = mountNav({})
    await vi.waitFor(() => expect(nav.items.value).toHaveLength(3))
    expect(nav.items.value.map((i) => i.formId)).toEqual(['f2', 'f3', 'f1'])
  })
})
