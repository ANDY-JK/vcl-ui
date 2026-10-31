// 第一/第二轮 bug 修复的回归测试锁定
// 背景：审查发现 30+ 确定性 bug（docs/组件树状图与功能审查.md §17.1/§17.5），
// 修复后此处锁定行为，防回归。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'

import { validateField } from '@/components/form-builder/useFormValidator'
import { useTableEdit } from '@/components/data/composables/useTableEdit'
import { buildChartOption } from '@/components/chart/options'
import type { Column } from '@/components/data/composables/types'

// 本组用例部分路径预期产生 console.warn（amap API 错误、i18n 缺词等），静默避免污染日志
beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

// ════════════════════════════════════════
// 1. useFormValidator · isVisible 注入（联动隐藏字段不再卡死提交）
// ════════════════════════════════════════
describe('useFormValidator · isVisible 注入', () => {
  const requiredField = { key: 'name', type: 'input', label: '名称', required: true } as never

  it('默认可见性：隐藏字段（visibleWhen）跳过校验', () => {
    // 无 visibleWhen 配置时字段视为可见 → required 报错
    const err = validateField(requiredField, '', {})
    expect(err).not.toBe('')
  })

  it('注入 isVisible=恒 false：字段视为隐藏 → 跳过校验（联动隐藏场景）', () => {
    const err = validateField(requiredField, '', {}, false, () => false)
    expect(err).toBe('')
  })

  it('注入 isVisible=恒 true：行为等同可见', () => {
    const err = validateField(requiredField, '', {}, false, () => true)
    expect(err).not.toBe('')
  })
})

// ════════════════════════════════════════
// 2. useTableEdit · clearSelection 受 editable 管控
// ════════════════════════════════════════
describe('useTableEdit · Delete 清空受 editable 管控', () => {
  const cols: Column[] = [
    { key: 'name', title: '名称' },
    { key: 'qty', title: '数量', type: 'number' },
  ]

  function setup(over: Record<string, unknown> = {}) {
    const emit = { cellChange: vi.fn(), cellNote: vi.fn() }
    const edit = useTableEdit({ columns: cols, editable: true, keyboardNav: true, ...over }, emit)
    edit.setDisplayMatrix(['r1', 'r2'], ['name', 'qty'])
    return { edit, emit }
  }

  it('editable=true：Delete 清空选中格并触发 cellChange', () => {
    const { edit, emit } = setup()
    edit.selectCell('r1', 'name', '苹果', false)
    edit.clearSelection(new KeyboardEvent('keydown', { key: 'Delete' }))
    expect(emit.cellChange).toHaveBeenCalledWith('r1', 'name', '')
  })

  it('editable=false：Delete 不清空也不触发 cellChange（此前绕过开关）', () => {
    const { edit, emit } = setup({ editable: false })
    edit.selectCell('r1', 'name', '苹果', false)
    edit.clearSelection(new KeyboardEvent('keydown', { key: 'Delete' }))
    expect(emit.cellChange).not.toHaveBeenCalled()
    expect(edit.getCellValue('r1', 'name', '苹果')).toBe('苹果')
  })
})

// ════════════════════════════════════════
// 3. chart bar · stacked100 的 0-100 上限设在数值轴
// ════════════════════════════════════════
describe('chart bar · stacked100 数值轴上限', () => {
  function baseParams(over: Record<string, unknown> = {}) {
    return {
      type: 'bar',
      categories: ['A', 'B'],
      series: [{ name: '系列1', data: [10, 20] }],
      data: {},
      title: '',
      showLegend: true,
      showTooltip: true,
      smooth: true,
      showSymbol: true,
      colors: [],
      darkMode: false,
      ...over,
    } as never
  }

  it('垂直方向：yAxis.max === 100', () => {
    const opt = buildChartOption('bar', baseParams({ stacked100: true })) as Record<string, never>
    expect((opt.yAxis as { max?: number }).max).toBe(100)
  })

  it('水平方向：数值轴是 xAxis，max === 100（此前误设到类目轴）', () => {
    const opt = buildChartOption('bar', baseParams({ stacked100: true, horizontal: true })) as Record<string, never>
    expect((opt.xAxis as { type?: string; max?: number }).type).toBe('value')
    expect((opt.xAxis as { max?: number }).max).toBe(100)
  })
})

// ════════════════════════════════════════
// 4. Group rate · 键盘触发（detail=0）恒选整星
// ════════════════════════════════════════
describe('Group rate · 键盘半星修复', () => {
  it('键盘触发的 click（detail=0）选整星而非半星', async () => {
    const { mount } = await import('@vue/test-utils')
    const Group = (await import('@/components/form/Group.vue')).default
    const wrapper = mount(Group, {
      props: { type: 'rate', allowHalf: true, rateMax: 5, modelValue: 0 },
    })
    const stars = wrapper.findAll('.rate-btn')
    expect(stars.length).toBe(5)
    // trigger 产生的 click 事件 detail=0（等同键盘 Enter/Space 触发路径）
    await stars[2].trigger('click')
    expect(wrapper.emitted('update:modelValue')![0][0]).toBe(3)
    wrapper.unmount()
  })
})

// ════════════════════════════════════════
// 5. Avatar · src 变更重置失败态
// ════════════════════════════════════════
describe('Avatar · src 变更重置失败态', () => {
  it('加载失败后更换 src 恢复图片显示', async () => {
    const Avatar = (await import('@/components/data/Avatar.vue')).default
    const wrapper = mount(Avatar, { props: { src: 'a.png', name: '张三' } })
    expect(wrapper.find('img').exists()).toBe(true)
    await wrapper.find('img').trigger('error')
    expect(wrapper.find('img').exists()).toBe(false) // 回退首字母
    await wrapper.setProps({ src: 'b.png' })
    expect(wrapper.find('img').exists()).toBe(true) // 换图后恢复（此前永远显示首字母）
    wrapper.unmount()
  })
})

// ════════════════════════════════════════
// 6. Image · 懒加载进视口前不发起请求
// ════════════════════════════════════════
describe('Image · 懒加载 v-if 行为', () => {
  it('IntersectionObserver 命中前不渲染 <img>，命中后渲染（此前 src 始终绑定）', async () => {
    type IOCallback = (entries: Array<{ isIntersecting: boolean }>) => void
    const instances: Array<{ cb: IOCallback; disconnect: () => void }> = []
    const originalIO = (globalThis as Record<string, unknown>).IntersectionObserver
    class IOStub {
      cb: IOCallback
      rootMargin = '200px'
      constructor(cb: IOCallback) {
        this.cb = cb
        instances.push(this as unknown as { cb: IOCallback; disconnect: () => void })
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    }
    ;(globalThis as Record<string, unknown>).IntersectionObserver = IOStub

    try {
      const Image = (await import('@/components/data/Image.vue')).default
      const wrapper = mount(Image, { props: { src: 'pic.png', lazy: true, preview: false } })
      // 未进视口：img 不渲染（src 未绑定，不发起请求）
      expect(wrapper.find('img').exists()).toBe(false)
      // 进视口：渲染 img 并携带 src
      instances[0].cb([{ isIntersecting: true }])
      await nextTick()
      expect(wrapper.find('img').exists()).toBe(true)
      expect(wrapper.find('img').attributes('src')).toBe('pic.png')
      wrapper.unmount()
    } finally {
      ;(globalThis as Record<string, unknown>).IntersectionObserver = originalIO
    }
  })
})

// ════════════════════════════════════════
// 7. ConfirmModal · loading 态不自动关闭
// ════════════════════════════════════════
describe('ConfirmModal · loading 态不自动关闭', () => {
  async function mountConfirm(loading: boolean) {
    const ConfirmModal = (await import('@/components/feedback/ConfirmModal.vue')).default
    return mount(ConfirmModal, {
      attachTo: document.body,
      props: { visible: true, message: '确认删除？', loading },
    })
  }

  function findConfirmButton(): HTMLButtonElement | null {
    const buttons = Array.from(document.body.querySelectorAll('button'))
    return buttons.find((b) => b.textContent?.includes('确定')) ?? null
  }

  it('loading=true：确认按钮禁用，弹窗保持打开（异步确认由父组件经 v-model 关闭）', async () => {
    const wrapper = await mountConfirm(true)
    const btn = findConfirmButton()
    expect(btn).toBeTruthy()
    // loading 态确认按钮禁用（DOM 层拦截）+ onConfirm 内部守卫双保险
    expect(btn!.disabled).toBe(true)
    expect(wrapper.emitted('update:visible')).toBeUndefined()
    wrapper.unmount()
    document.body.innerHTML = ''
  })

  it('loading=false：点击确认立即关闭（保持既有语义）', async () => {
    const wrapper = await mountConfirm(false)
    const btn = findConfirmButton()
    expect(btn).toBeTruthy()
    expect(btn!.disabled).toBe(false)
    btn!.click()
    await nextTick()
    await nextTick()
    expect(wrapper.emitted('confirm')).toBeTruthy()
    const vis = wrapper.emitted('update:visible')
    expect(vis?.[0]?.[0]).toBe(false)
    wrapper.unmount()
    document.body.innerHTML = ''
  })
})

// ════════════════════════════════════════
// 8. register · requireEmail × showOptionalFields 死锁解除
// ════════════════════════════════════════
describe('register · 可选必填与字段渲染解耦', () => {
  it('requireEmail=true 但字段未渲染（showOptionalFields=false）时可正常提交', async () => {
    const Register = (await import('@/components/login/register.vue')).default
    const wrapper = mount(Register, {
      props: { requireEmail: true, showOptionalFields: false, requireCardKey: false },
    })
    const inputs = wrapper.findAll('input')
    // 字段顺序：display_name / username / password（email 字段未渲染）
    await inputs[0].setValue('测试用户')
    await inputs[1].setValue('abc')
    await inputs[2].setValue('123456')
    await wrapper.find('button.btn-primary').trigger('click')
    await nextTick()
    expect(wrapper.emitted('submit')).toBeTruthy()
    wrapper.unmount()
  })

  it('requireEmail=true 且字段渲染时仍强制必填', async () => {
    const Register = (await import('@/components/login/register.vue')).default
    const wrapper = mount(Register, {
      props: { requireEmail: true, showOptionalFields: true, requireCardKey: false },
    })
    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('测试用户')
    await inputs[1].setValue('abc')
    await inputs[2].setValue('123456')
    // email 留空提交 → 校验拦截
    await wrapper.find('button.btn-primary').trigger('click')
    await nextTick()
    expect(wrapper.emitted('submit')).toBeUndefined()
    wrapper.unmount()
  })
})

// ════════════════════════════════════════
// 9. amap keywordSearch · API 错误显式暴露
// ════════════════════════════════════════
describe('amap keywordSearch · infocode 校验', () => {
  it('infocode 非 10000（Key 无效等）返回 null 坐标并 warn', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({ infocode: '10001', info: 'INVALID_KEY', pois: [] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      const { keywordSearch } = await import('@/components/amap/amap-service')
      const r = await keywordSearch('某地址', '长沙')
      expect(r).toEqual({ latitude: null, longitude: null })
      expect(fetchMock).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('infocode=10000 且有结果时正常返回坐标', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        infocode: '10000',
        pois: [{ location: '112.938814,28.228209' }],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      const { keywordSearch } = await import('@/components/amap/amap-service')
      const r = await keywordSearch('某地址')
      expect(r).toEqual({ latitude: 28.228209, longitude: 112.938814 })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
// ════════════════════════════════════════
// Avatar · 首字母不切出半个 emoji（#277）
// ════════════════════════════════════════
describe('Avatar · 首字母按码点取', () => {
  const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

  it('名字以 emoji 开头 → 头像字母不含孤立代理（旧实现 s[0] 取到高位代理）', async () => {
    const Avatar = (await import('@/components/data/Avatar.vue')).default
    const w = mount(Avatar, { props: { name: '😀张三', size: 'md' }, attachTo: document.body })
    try {
      await nextTick()
      const text = w.text()
      expect(text, `头像文本 ${JSON.stringify(text)} 含孤立代理`).not.toMatch(LONE_SURROGATE)
      expect(text).toContain('😀')
    } finally {
      w.unmount()
    }
  })

  it('中文姓名取首字（口径不变）', async () => {
    const Avatar = (await import('@/components/data/Avatar.vue')).default
    const w = mount(Avatar, { props: { name: '张三', size: 'md' }, attachTo: document.body })
    try {
      await nextTick()
      expect(w.text()).toContain('张')
    } finally {
      w.unmount()
    }
  })
})