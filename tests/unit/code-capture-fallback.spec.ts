// CodeCapture 自动兜底链决策表护栏
// 锁定「入口级 + 失败归因 → 下探方向」这张表，防止后续改动把自动降级改回「卡住/乱弹」：
//   ① 无 getUserMedia（非 HTTPS/无设备）→ 直接兜底页，不做注定失败的权限尝试
//   ② 无摄像头/不支持 → 系统相机同样无望 → 直接兜底页
//   ③ 权限拒绝/被占用 → 触屏先调系统相机（走系统权限往往仍能出图）；桌面直接兜底页（不弹选择器让用户选两遍）
// 兜底页是卡片内翻页（CaptureFallbackPanel 直接渲染在 .codecap-fallback），不是叠第二层弹层。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import CodeCapture from '@/components/form/CodeCapture.vue'

function setCapability(opts: { userMedia?: boolean; rejectWith?: { name: string; message: string } }) {
  const md: Record<string, unknown> = { enumerateDevices: vi.fn().mockResolvedValue([]) }
  if (opts.userMedia === false) {
    // 模拟不支持的内核：mediaDevices 在场但没有 getUserMedia
  } else if (opts.rejectWith) {
    md.getUserMedia = vi.fn().mockRejectedValue(Object.assign(new Error(opts.rejectWith.message), { name: opts.rejectWith.name }))
  } else {
    md.getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [] })
  }
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: md })
}

function systemInput() {
  return document.querySelector<HTMLInputElement>('input[data-capture-fallback]')
}

/** 兜底页是否已显示（卡片内嵌，非弹层） */
function fallbackVisible(w: ReturnType<typeof mount>) {
  return w.find('.codecap-fallback').exists()
}

/** 模拟触屏（pointer: coarse）：只有触屏才自动下探系统相机 */
function mockTouch() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (q: string) => ({ matches: q.includes('coarse'), media: q, addEventListener() {}, removeEventListener() {} }),
  })
}
const originalMatchMedia = window.matchMedia

describe('CodeCapture 自动兜底链', () => {
  beforeEach(() => {
    window.isSecureContext = true
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: originalMatchMedia })
    document.querySelectorAll('input[data-capture-fallback]').forEach((el) => el.remove())
  })

  it('① 无 getUserMedia：直接翻到兜底页（上传识别 + 手工输入），不尝试相机', async () => {
    setCapability({ userMedia: false })
    const w = mount(CodeCapture, { props: { modelValue: false }, global: { stubs: { Teleport: true } } })
    await w.setProps({ modelValue: true })
    await flushPromises()

    expect(fallbackVisible(w)).toBe(true)
    expect(w.find('.capfb-panel').exists()).toBe(true) // 上传条 + 输入区
    expect(w.find('.capfb-input input').exists()).toBe(true)
    expect(systemInput()).toBeNull() // 没去调系统相机
    w.unmount()
  })

  it('② 无摄像头（notfound）：系统相机无望 → 直接翻到兜底页', async () => {
    setCapability({ rejectWith: { name: 'NotFoundError', message: 'Requested device not found' } })
    const w = mount(CodeCapture, { props: { modelValue: false }, global: { stubs: { Teleport: true } } })
    await w.setProps({ modelValue: true })
    await flushPromises()

    expect(fallbackVisible(w)).toBe(true)
    expect(systemInput()).toBeNull()
    w.unmount()
  })

  it('③ 触屏权限拒绝：先调系统相机；用户取消 → 再落到兜底页', async () => {
    mockTouch()
    setCapability({ rejectWith: { name: 'NotAllowedError', message: 'Permission denied' } })
    const w = mount(CodeCapture, { props: { modelValue: false }, global: { stubs: { Teleport: true } } })
    await w.setProps({ modelValue: true })
    await flushPromises()

    // 先走系统相机
    const input = systemInput()
    expect(input).not.toBeNull()
    expect(fallbackVisible(w)).toBe(false)

    // 用户取消 → 翻到兜底页
    input!.dispatchEvent(new Event('cancel'))
    await flushPromises()
    expect(fallbackVisible(w)).toBe(true)
    w.unmount()
  })

  it('③b 桌面（非触屏）权限拒绝：跳过系统相机直接落兜底页', async () => {
    // 桌面不自动弹系统选择器（弹了选择器取消后又要弹面板=让用户选两遍）
    setCapability({ rejectWith: { name: 'NotAllowedError', message: 'Permission denied' } })
    const w = mount(CodeCapture, { props: { modelValue: false }, global: { stubs: { Teleport: true } } })
    await w.setProps({ modelValue: true })
    await flushPromises()

    expect(systemInput()).toBeNull()
    expect(fallbackVisible(w)).toBe(true)
    w.unmount()
  })
})

