// CameraCapture 最后兜底护栏
//   场景（触屏）：页面内相机不可用（权限拒绝）→ 自动调系统相机（隐藏 file input）；
//         用户在系统相机上取消 → 继续下探，自动弹「上传图片」兜底面板。
//   场景（桌面）：相机不可用 → 不自动弹系统选择器（弹了选择器取消后又要弹面板=选两遍），
//         直接出兜底面板，用户点上传时才弹一次文件选择器。
// 这条链路此前断在系统相机：取消后无任何反馈，用户卡死。本用例锁定「自动出兜底面板」。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import CameraCapture from '@/components/form/CameraCapture.vue'

function findFallbackInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>('input[data-capture-fallback]')
}

/** 模拟触屏（pointer: coarse）：detectCaptureCapability 据此决定是否自动下探系统相机 */
function mockTouch() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (q: string) => ({
      matches: q.includes('coarse'),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }),
  })
}
const originalMatchMedia = window.matchMedia

function mockPermissionDenied() {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' })),
      enumerateDevices: vi.fn().mockResolvedValue([]),
    },
  })
}

describe('CameraCapture 采集兜底链', () => {
  beforeEach(() => {
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
    // 拦截组件内的降级告警，保持测试输出干净
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: originalMatchMedia })
    document.querySelectorAll('input[data-capture-fallback]').forEach((el) => el.remove())
  })

  it('触屏：页面内相机被拒 → 调系统相机 → 用户取消 → 自动弹上传兜底面板', async () => {
    mockTouch()
    mockPermissionDenied()

    const w = mount(CameraCapture, { props: { modelValue: true } })
    await flushPromises()

    // ① 系统相机被调起（隐藏 input 进入文档）
    const input = findFallbackInput()
    expect(input).not.toBeNull()

    // ② 用户在系统相机上取消（cancel 事件）→ 系统级返回空 → 下探到兜底面板
    input!.dispatchEvent(new Event('cancel'))
    await flushPromises()

    const sheet = w.findComponent({ name: 'CaptureFallbackSheet' })
    expect(sheet.exists()).toBe(true)
    expect(sheet.props('modelValue')).toBe(true)
    expect(sheet.props('mode')).toBe('photo')

    w.unmount()
  })

  it('桌面（非触屏）：相机被拒 → 不自动弹系统选择器，直接出兜底面板', async () => {
    // 默认 happy-dom matchMedia coarse=false = 桌面
    mockPermissionDenied()

    const w = mount(CameraCapture, { props: { modelValue: true } })
    await flushPromises()

    // 不自动调系统相机（没有隐藏 input），一步到位出兜底面板
    expect(findFallbackInput()).toBeNull()
    const sheet = w.findComponent({ name: 'CaptureFallbackSheet' })
    expect(sheet.exists()).toBe(true)
    expect(sheet.props('modelValue')).toBe(true)

    w.unmount()
  })

  it('触屏：系统相机正常返回文件 → 交付 capture，不弹兜底面板', async () => {
    mockTouch()
    mockPermissionDenied()

    const w = mount(CameraCapture, { props: { modelValue: true } })
    await flushPromises()

    const input = findFallbackInput()!
    const file = new File(['x'], 'shot.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    input.dispatchEvent(new Event('change'))
    await flushPromises()

    expect(w.emitted('capture')?.at(-1)).toEqual([file])
    expect(w.findComponent({ name: 'CaptureFallbackSheet' }).props('modelValue')).toBe(false)
    w.unmount()
  })
})
