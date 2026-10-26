/**
 * wordCloud 依赖缺失时的可见反馈（第 141 轮）。
 *
 * 缺陷：`ensureWordCloud()` 只返回 void，调用方拿不到成败 —— 于是 `echarts-wordcloud`
 * （可选 peer）没装时，图表照样按 wordCloud 出 option，而该 series 类型没注册，
 * **ECharts 什么也不画**，界面上就是一个没有任何提示的空白框（只有控制台一条 warnOnce）。
 *
 * 修法：`ensureWordCloud()` 返回布尔；Chart 记 `wordCloudFailed`，失败时保持 option=null
 * 并把空态文案换成"需安装扩展"的提示（BaseChart 的 `showEmpty` 在 option 为空时显示该文案）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

// 让 echarts-setup 的实例在用例间互不影响（模块级 _wordCloudLoaded 会缓存）
async function freshSetup() {
  vi.resetModules()
  return (await import('@/components/chart/utils/echarts-setup')) as typeof import('@/components/chart/utils/echarts-setup')
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.doUnmock('@/components/chart/utils/echarts-setup')
  vi.resetModules()
})

describe('ensureWordCloud 的返回值', () => {
  it('**loader 失败时返回 false**（原来返回 void，调用方无从判断）', async () => {
    const mod = await freshSetup()
    const ok = await mod.ensureWordCloud(() => Promise.reject(new Error('模块不存在')))
    expect(ok).toBe(false)
  })

  it('loader 成功时返回 true', async () => {
    const mod = await freshSetup()
    const ok = await mod.ensureWordCloud(() => Promise.resolve({}))
    expect(ok).toBe(true)
  })

  it('**同一实例只加载一次**：成功后再传失败的 loader 仍返回 true 且不再调用 loader', async () => {
    const mod = await freshSetup()
    expect(await mod.ensureWordCloud(() => Promise.resolve({}))).toBe(true)
    const again = vi.fn(() => Promise.reject(new Error('不该被调用')))
    expect(await mod.ensureWordCloud(again)).toBe(true)
    expect(again).not.toHaveBeenCalled()
  })

  it('失败不缓存：第二次仍会重试（可选 peer 可能后来装上）', async () => {
    const mod = await freshSetup()
    expect(await mod.ensureWordCloud(() => Promise.reject(new Error('x')))).toBe(false)
    const retry = vi.fn(() => Promise.resolve({}))
    expect(await mod.ensureWordCloud(retry)).toBe(true)
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('同步抛错的 loader 也走 catch（不只是 reject）', async () => {
    const mod = await freshSetup()
    const ok = await mod.ensureWordCloud(() => {
      throw new Error('同步炸')
    })
    expect(ok).toBe(false)
  })
})

describe('Chart · wordCloud 依赖缺失时必须给可见提示', () => {
  it('**失败时显示"需安装扩展"，而不是空白框**', async () => {
    vi.doMock('@/components/chart/utils/echarts-setup', async () => {
      const actual = await vi.importActual<typeof import('@/components/chart/utils/echarts-setup')>(
        '@/components/chart/utils/echarts-setup',
      )
      return { ...actual, ensureWordCloud: async () => false }
    })
    vi.resetModules()
    const Chart = (await import('@/components/chart/Chart.vue')).default
    const w = mount(Chart, {
      props: { type: 'wordCloud', categories: ['a', 'b'], series: [{ name: 's', data: [1, 2] }] },
      attachTo: document.body,
    })
    await nextTick()
    await nextTick()
    const text = w.text()
    expect(text, `实际渲染：${text}`).toContain('echarts-wordcloud')
    expect(text, '不能只给一个空白框').not.toBe('')
    w.unmount()
  })

  it('成功时不显示缺扩展提示', async () => {
    vi.doMock('@/components/chart/utils/echarts-setup', async () => {
      const actual = await vi.importActual<typeof import('@/components/chart/utils/echarts-setup')>(
        '@/components/chart/utils/echarts-setup',
      )
      return { ...actual, ensureWordCloud: async () => true }
    })
    vi.resetModules()
    const Chart = (await import('@/components/chart/Chart.vue')).default
    const w = mount(Chart, {
      props: { type: 'wordCloud', categories: ['a', 'b'], series: [{ name: 's', data: [1, 2] }] },
      attachTo: document.body,
    })
    await nextTick()
    await nextTick()
    expect(w.text()).not.toContain('echarts-wordcloud')
    w.unmount()
  })

  it('从 wordCloud 切到普通类型后，失败标记要清除（不能把提示带到别的图）', async () => {
    vi.doMock('@/components/chart/utils/echarts-setup', async () => {
      const actual = await vi.importActual<typeof import('@/components/chart/utils/echarts-setup')>(
        '@/components/chart/utils/echarts-setup',
      )
      return { ...actual, ensureWordCloud: async () => false }
    })
    vi.resetModules()
    const Chart = (await import('@/components/chart/Chart.vue')).default
    const w = mount(Chart, {
      props: { type: 'wordCloud', categories: ['a', 'b'], series: [{ name: 's', data: [1, 2] }] },
      attachTo: document.body,
    })
    await nextTick()
    expect(w.text()).toContain('echarts-wordcloud')

    // 关键是换成"空数据"的折线图：此时没有系列 → BaseChart 会走空态遮罩，
    // 遮罩文案若还带着上面那个失败标记，用户就会在折线图上看到"缺 echarts-wordcloud"
    await w.setProps({ type: 'line', series: [], categories: [] })
    await nextTick()
    await nextTick()
    expect(w.text(), '折线图的空态不该显示词云的缺扩展提示').not.toContain('echarts-wordcloud')
    w.unmount()
  })
})
