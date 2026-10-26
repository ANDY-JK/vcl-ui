/**
 * Image · 状态机 / 懒加载 / 可交互性（第 136 轮）。
 * 此前只有 48% 语句、48% 分支覆盖，重点在"状态切换后跟着变的东西"。
 *
 * 本轮修的三处都是**无障碍与无效请求**类问题：
 *   ① `role="img"` 上挂 `tabindex=0` + 键盘回车/空格 → 读屏说是静态图片、键盘却能操作
 *   ② 无 `src` 时仍渲染 `<img src="">` → 浏览器把空 src 当成"当前文档地址"再请求一次，
 *      且永远等不到 load/error，占位符永久挂着
 *   ③ 失败后 `<img>` 仍在（`failed` 与 `<img>` 并存），"到底哪张坏了"看不出来
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import Image from '@/components/data/Image.vue'

const mountImg = (props: Record<string, unknown> = {}) =>
  mount(Image, { props, global: { stubs: { teleport: true } } })

/** 让 <img> 触发 load 或 error */
async function settle(w: ReturnType<typeof mountImg>, kind: 'load' | 'error') {
  await w.find('img').trigger(kind)
  await nextTick()
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// ════════════════════════════════════════════════════════════════════
describe('渲染尺寸与样式', () => {
  it('未设宽高时用 size（默认 80）', () => {
    const w = mountImg({ src: '/a.png', lazy: false })
    const style = w.find('.v-image').attributes('style') ?? ''
    expect(style).toContain('80px')
    w.unmount()
  })

  it('width/height 优先于 size', () => {
    const w = mountImg({ src: '/a.png', lazy: false, width: 200, height: 120, size: 80 })
    const style = w.find('.v-image').attributes('style') ?? ''
    expect(style).toContain('200px')
    expect(style).toContain('120px')
    expect(style, '不该还留着 size').not.toContain('80px')
    w.unmount()
  })

  it('round 时圆角 50%，优先于 radius', () => {
    const w = mountImg({ src: '/a.png', lazy: false, round: true, radius: 12 })
    expect(w.find('.v-image').attributes('style')).toContain('50%')
    w.unmount()
  })

  it('radius 生效；都没设时默认 4px', () => {
    expect(mountImg({ src: '/a.png', lazy: false, radius: 12 }).find('.v-image').attributes('style')).toContain('12px')
    expect(mountImg({ src: '/a.png', lazy: false }).find('.v-image').attributes('style')).toContain('4px')
  })

  it('fit 透传到 <img> 的 objectFit', () => {
    const w = mountImg({ src: '/a.png', lazy: false, fit: 'contain' })
    expect(w.find('img').attributes('style')).toContain('object-fit: contain')
    w.unmount()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('**没有 src 时不发起无效请求**（本轮修）', () => {
  it.each([undefined, '', '   '])('src=%j → 不渲染 <img>，只显示占位', async (src) => {
    const w = mountImg({ src, lazy: false })
    await nextTick()
    // 空 src 会被浏览器当成"当前文档地址"再请求一次，且永远等不到 load/error
    expect(w.find('img').exists(), '没有地址就不该渲染 <img>').toBe(false)
    expect(w.find('.v-image-placeholder').exists()).toBe(true)
    expect(w.find('.v-image-error').exists()).toBe(false)
    w.unmount()
  })

  it('无 src 时不可点击、不可聚焦、role 是 img', async () => {
    const w = mountImg({ src: '', lazy: false, preview: true })
    await nextTick()
    const root = w.find('.v-image')
    expect(root.attributes('role')).toBe('img')
    expect(root.attributes('tabindex')).toBeUndefined()
    expect(root.classes()).not.toContain('clickable')
    w.unmount()
  })

  it('无 src 时懒加载不做观察（观察了也没有图要加载）', async () => {
    const observe = vi.fn()
    const disconnect = vi.fn()
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe = observe
        disconnect = disconnect
      },
    )
    const w = mountImg({ src: '', lazy: true })
    await nextTick()
    expect(observe).not.toHaveBeenCalled()
    w.unmount()
  })

  it('补上 src 后 <img> 才出现', async () => {
    const w = mountImg({ src: '', lazy: false })
    await nextTick()
    expect(w.find('img').exists()).toBe(false)
    await w.setProps({ src: '/x.png' })
    await nextTick()
    expect(w.find('img').exists()).toBe(true)
    expect(w.find('img').attributes('src')).toBe('/x.png')
    w.unmount()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('加载状态机', () => {
  it('初始：占位显示、没有 loaded/failed 类', () => {
    const w = mountImg({ src: '/a.png', lazy: false })
    expect(w.find('.v-image-placeholder').exists()).toBe(true)
    const cls = w.find('.v-image').classes()
    expect(cls).not.toContain('loaded')
    expect(cls).not.toContain('failed')
    w.unmount()
  })

  it('load 成功 → 占位消失、加 loaded 类、emit load', async () => {
    const w = mountImg({ src: '/a.png', lazy: false })
    await settle(w, 'load')
    expect(w.find('.v-image-placeholder').exists()).toBe(false)
    expect(w.find('.v-image').classes()).toContain('loaded')
    expect(w.emitted('load')).toEqual([['/a.png']])
    w.unmount()
  })

  it('error → 显示错误态、emit error', async () => {
    const w = mountImg({ src: '/bad.png', lazy: false })
    await settle(w, 'error')
    expect(w.find('.v-image-error').exists()).toBe(true)
    expect(w.find('.v-image').classes()).toContain('failed')
    expect(w.emitted('error')).toEqual([['/bad.png']])
    w.unmount()
  })

  it('**失败后不再保留 <img>**（否则 failed 与 <img> 并存，看不出哪张坏了）', async () => {
    const w = mountImg({ src: '/bad.png', lazy: false })
    await settle(w, 'error')
    expect(w.find('img').exists(), '失败后应把 <img> 摘掉').toBe(false)
    expect(w.find('.v-image-placeholder').exists(), '也不该回到加载占位').toBe(false)
    w.unmount()
  })

  it('自定义 loadingText / errorText 才会显示文本', async () => {
    const loading = mountImg({ src: '/a.png', lazy: false, loadingText: '加载中…' })
    expect(loading.find('.v-image-text').text()).toBe('加载中…')
    loading.unmount()

    const err = mountImg({ src: '/a.png', lazy: false, errorText: '坏了' })
    await settle(err, 'error')
    expect(err.find('.v-image-text').text()).toBe('坏了')
    err.unmount()
  })

  it('不传文本时只有图标、没有 .v-image-text', () => {
    const w = mountImg({ src: '/a.png', lazy: false })
    expect(w.find('.v-image-text').exists()).toBe(false)
    w.unmount()
  })

  it('**换 src 会重置失败/成功态**（否则换图后永远显示错误占位）', async () => {
    const w = mountImg({ src: '/bad.png', lazy: false })
    await settle(w, 'error')
    expect(w.find('.v-image-error').exists()).toBe(true)

    await w.setProps({ src: '/good.png' })
    await nextTick()
    expect(w.find('.v-image-error').exists(), '换图后错误态要清掉').toBe(false)
    expect(w.find('.v-image-placeholder').exists(), '回到加载占位').toBe(true)
    expect(w.find('img').attributes('src')).toBe('/good.png')
    w.unmount()
  })

  it('成功后再换 src 也要回到加载态', async () => {
    const w = mountImg({ src: '/a.png', lazy: false })
    await settle(w, 'load')
    expect(w.find('.v-image').classes()).toContain('loaded')
    await w.setProps({ src: '/b.png' })
    await nextTick()
    expect(w.find('.v-image').classes()).not.toContain('loaded')
    w.unmount()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('可交互性：role / tabindex 必须与"真的能操作"一致', () => {
  it('**加载成功后 role=button 且可聚焦**（本轮修：原来恒为 role=img）', async () => {
    const w = mountImg({ src: '/a.png', lazy: false, preview: true })
    await settle(w, 'load')
    const root = w.find('.v-image')
    expect(root.attributes('role'), '能按回车放大就该是 button').toBe('button')
    expect(root.attributes('tabindex')).toBe('0')
    expect(root.classes()).toContain('clickable')
    w.unmount()
  })

  it('加载中 / 失败后 role 回到 img 且不可聚焦', async () => {
    const loading = mountImg({ src: '/a.png', lazy: false, preview: true })
    expect(loading.find('.v-image').attributes('role')).toBe('img')
    expect(loading.find('.v-image').attributes('tabindex')).toBeUndefined()
    loading.unmount()

    const failed = mountImg({ src: '/a.png', lazy: false, preview: true })
    await settle(failed, 'error')
    expect(failed.find('.v-image').attributes('role')).toBe('img')
    expect(failed.find('.v-image').attributes('tabindex')).toBeUndefined()
    failed.unmount()
  })

  it('preview=false 时加载成功也保持 role=img、不可聚焦', async () => {
    const w = mountImg({ src: '/a.png', lazy: false, preview: false })
    await settle(w, 'load')
    expect(w.find('.v-image').attributes('role')).toBe('img')
    expect(w.find('.v-image').attributes('tabindex')).toBeUndefined()
    expect(w.find('.v-image').classes()).not.toContain('clickable')
    w.unmount()
  })

  it('alt 作为可访问名；没有 alt 时回退通用文案（不留空 label）', () => {
    const withAlt = mountImg({ src: '/a.png', lazy: false, alt: '门店照片' })
    expect(withAlt.find('.v-image').attributes('aria-label')).toBe('门店照片')
    withAlt.unmount()

    const noAlt = mountImg({ src: '/a.png', lazy: false })
    const label = noAlt.find('.v-image').attributes('aria-label')
    expect(label && label.length > 0, 'aria-label 不能为空').toBe(true)
    noAlt.unmount()
  })
})

// ════════════════════════════════════════════════════════════════════
describe('点击与键盘', () => {
  it('点击始终 emit click（即使没加载成功，宿主也可能要用）', async () => {
    const w = mountImg({ src: '/a.png', lazy: false })
    await w.find('.v-image').trigger('click')
    expect(w.emitted('click')).toEqual([['/a.png']])
    w.unmount()
  })

  it('加载成功 + preview → 点击打开预览；关闭后不再渲染', async () => {
    const w = mountImg({ src: '/a.png', lazy: false, preview: true })
    await settle(w, 'load')
    await w.find('.v-image').trigger('click')
    await nextTick()
    const preview = w.findComponent({ name: 'ImagePreview' })
    expect(preview.exists(), '应打开预览').toBe(true)
    preview.vm.$emit('close')
    await nextTick()
    expect(w.findComponent({ name: 'ImagePreview' }).exists(), '关闭后要卸载').toBe(false)
    w.unmount()
  })

  it('**失败后点击不开预览**（开出来也是同样加载不出来的空壳）', async () => {
    const w = mountImg({ src: '/bad.png', lazy: false, preview: true })
    await settle(w, 'error')
    await w.find('.v-image').trigger('click')
    await nextTick()
    expect(w.findComponent({ name: 'ImagePreview' }).exists()).toBe(false)
    expect(w.emitted('click'), 'click 事件仍要发').toEqual([['/bad.png']])
    w.unmount()
  })

  it('**preview=false 时回车/空格不发 click**（本轮修：原来照发）', async () => {
    const w = mountImg({ src: '/a.png', lazy: false, preview: false })
    await settle(w, 'load')
    await w.find('.v-image').trigger('keydown', { key: 'Enter' })
    await w.find('.v-image').trigger('keydown', { key: ' ' })
    expect(w.emitted('click'), '不可交互元素不该响应键盘').toBeUndefined()
    w.unmount()
  })

  it('未加载成功时回车也不发 click', async () => {
    const w = mountImg({ src: '/a.png', lazy: false, preview: true })
    await w.find('.v-image').trigger('keydown', { key: 'Enter' })
    expect(w.emitted('click')).toBeUndefined()
    w.unmount()
  })

  it('可交互状态下回车与空格都能打开预览', async () => {
    for (const key of ['Enter', ' ']) {
      const w = mountImg({ src: '/a.png', lazy: false, preview: true })
      await settle(w, 'load')
      await w.find('.v-image').trigger('keydown', { key })
      await nextTick()
      expect(w.findComponent({ name: 'ImagePreview' }).exists(), `${key} 应能开预览`).toBe(true)
      w.unmount()
    }
  })
})

// ════════════════════════════════════════════════════════════════════
describe('懒加载', () => {
  it('lazy=false 时直接渲染 <img>', () => {
    const w = mountImg({ src: '/a.png', lazy: false })
    expect(w.find('img').exists()).toBe(true)
    w.unmount()
  })

  it('lazy=true 时进入视口前不渲染 <img>（避免提前发请求）', async () => {
    let cb: ((entries: Array<{ isIntersecting: boolean }>) => void) | null = null
    const observe = vi.fn()
    const disconnect = vi.fn()
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(fn: (entries: Array<{ isIntersecting: boolean }>) => void) {
          cb = fn
        }
        observe = observe
        disconnect = disconnect
      },
    )
    const w = mountImg({ src: '/a.png', lazy: true })
    await nextTick()
    expect(observe).toHaveBeenCalledTimes(1)
    expect(w.find('img').exists(), '还没进视口不该有 <img>').toBe(false)

    cb!([{ isIntersecting: true }])
    await nextTick()
    expect(w.find('img').exists()).toBe(true)
    expect(disconnect, '进入视口后应断开观察').toHaveBeenCalled()
    w.unmount()
  })

  it('未相交时保持不加载', async () => {
    let cb: ((entries: Array<{ isIntersecting: boolean }>) => void) | null = null
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(fn: (entries: Array<{ isIntersecting: boolean }>) => void) {
          cb = fn
        }
        observe() {}
        disconnect() {}
      },
    )
    const w = mountImg({ src: '/a.png', lazy: true })
    await nextTick()
    cb!([{ isIntersecting: false }])
    await nextTick()
    expect(w.find('img').exists()).toBe(false)
    w.unmount()
  })

  it('**无 IntersectionObserver 时降级为直接加载**（旧 Safari / WebView）', async () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const w = mountImg({ src: '/a.png', lazy: true })
    await nextTick()
    expect(w.find('img').exists(), '不支持观察者时要直接加载，不能永远不显示').toBe(true)
    w.unmount()
  })

  it('卸载时断开观察（防泄漏）', async () => {
    const disconnect = vi.fn()
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        disconnect = disconnect
      },
    )
    const w = mountImg({ src: '/a.png', lazy: true })
    await nextTick()
    w.unmount()
    expect(disconnect).toHaveBeenCalled()
  })
})
