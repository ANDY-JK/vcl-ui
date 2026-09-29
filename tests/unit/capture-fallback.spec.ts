// 采集兜底引擎规格锁定
// 目标：拍照/扫码/上传共用的自动降级链「可判定、可裁剪、可下探」——
// 能力探测不抛错、链路裁剪正确、失败归因可驱动下探决策、系统采集取消不挂起。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  CAPTURE_CHAIN,
  detectCaptureCapability,
  classifyCaptureError,
  captureChainFrom,
  nextCaptureLevel,
  resolveEntryLevel,
  openSystemCapture,
  cancelPendingSystemCapture,
} from '@/components/form/utils/capture-fallback'

describe('capture-fallback 采集兜底引擎', () => {
  it('默认链路顺序固定：页面内 → 系统 → 上传 → 手工输入', () => {
    expect([...CAPTURE_CHAIN]).toEqual(['inpage', 'system', 'upload', 'manual'])
  })

  it('能力探测在无浏览器环境安全回退且不抛错', () => {
    const cap = detectCaptureCapability()
    expect(cap).toMatchObject({
      secure: expect.any(Boolean),
      hasUserMedia: expect.any(Boolean),
      isWeChat: expect.any(Boolean),
      canInpage: expect.any(Boolean),
      isTouch: expect.any(Boolean),
    })
    // canInpage = secure && hasUserMedia，三者必须自洽
    expect(cap.canInpage).toBe(cap.secure && cap.hasUserMedia)
  })

  it('入口级：能页面内取流从 inpage 起步，否则直接 system', () => {
    expect(
      resolveEntryLevel({ secure: true, hasUserMedia: true, isWeChat: false, canInpage: true, isTouch: false }),
    ).toBe('inpage')
    expect(
      resolveEntryLevel({ secure: false, hasUserMedia: true, isWeChat: false, canInpage: false, isTouch: false }),
    ).toBe('system')
    expect(
      resolveEntryLevel({ secure: true, hasUserMedia: false, isWeChat: false, canInpage: false, isTouch: false }),
    ).toBe('system')
  })

  it('链路裁剪：可从任意一级起步，并可按开关裁掉上传/手工输入', () => {
    expect(captureChainFrom('system')).toEqual(['system', 'upload', 'manual'])
    expect(captureChainFrom('upload')).toEqual(['upload', 'manual'])
    expect(captureChainFrom('manual')).toEqual(['manual'])
    expect(captureChainFrom('inpage', { allowUpload: false })).toEqual(['inpage', 'system', 'manual'])
    expect(captureChainFrom('inpage', { allowUpload: false, allowManual: false })).toEqual(['inpage', 'system'])
  })

  it('下探：返回严格后继；已到终点或后继被禁用时返回 null', () => {
    expect(nextCaptureLevel('inpage')).toBe('system')
    expect(nextCaptureLevel('system')).toBe('upload')
    expect(nextCaptureLevel('upload')).toBe('manual')
    expect(nextCaptureLevel('manual')).toBeNull()
    // system 的下一级是 upload，但 upload 被禁用 → 越过它到 manual
    expect(nextCaptureLevel('system', { allowUpload: false })).toBe('manual')
    expect(nextCaptureLevel('system', { allowUpload: false, allowManual: false })).toBeNull()
  })

  it('失败归因：权限/无设备/占用/非安全上下文/不支持精确分类', () => {
    expect(classifyCaptureError({ name: 'NotAllowedError' })).toBe('permission')
    expect(classifyCaptureError({ name: 'NotFoundError' })).toBe('notfound')
    expect(classifyCaptureError({ name: 'NotReadableError' })).toBe('occupied')
    expect(classifyCaptureError({ name: 'NotSupportedError' })).toBe('unsupported')
    expect(classifyCaptureError({ name: 'SecurityError' })).toBe('insecure')
    // 原生错误文案里没有 name 时靠 message 匹配
    expect(classifyCaptureError(new Error('Requested device not found'))).toBe('notfound')
    expect(classifyCaptureError({ message: 'Permission denied' })).toBe('permission')
    expect(classifyCaptureError(new Error('something else'))).toBe('unknown')
  })
})

describe('openSystemCapture 系统采集', () => {
  let clickSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    // jsdom 不会真的弹文件框：拦截 click，手动派发 change/cancel 事件驱动结果
    clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
      // 保留引用以便测试内取用
      ;(window as unknown as { __lastInput?: HTMLInputElement }).__lastInput = this
    })
  })
  afterEach(() => {
    clickSpy.mockRestore()
    delete (window as unknown as { __lastInput?: HTMLInputElement }).__lastInput
    document.querySelectorAll('input[data-capture-fallback]').forEach((el) => el.remove())
  })

  function lastInput(): HTMLInputElement {
    return (window as unknown as { __lastInput: HTMLInputElement }).__lastInput
  }

  it('后置相机：带 capture=environment，选中文件 resolve 出数组', async () => {
    const p = openSystemCapture({ capture: 'environment', isWeChat: false })
    const input = lastInput()
    expect(input.getAttribute('capture')).toBe('environment')
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    input.dispatchEvent(new Event('change'))
    await expect(p).resolves.toEqual([file])
  })

  it('微信内置浏览器：不写 capture（交给其自带拍摄入口）', () => {
    void openSystemCapture({ capture: 'environment', isWeChat: true })
    expect(lastInput().getAttribute('capture')).toBeNull()
  })

  it('capture=false：不带 capture 属性（弹系统选择器）', () => {
    void openSystemCapture({ capture: false })
    expect(lastInput().hasAttribute('capture')).toBe(false)
  })

  it('用户取消（cancel 事件）：resolve 空数组，不永久挂起', async () => {
    const p = openSystemCapture()
    lastInput().dispatchEvent(new Event('cancel'))
    await expect(p).resolves.toEqual([])
  })

  it('重复调起会清理上一次残留 input（避免文档堆积）', () => {
    void openSystemCapture()
    void openSystemCapture()
    expect(document.querySelectorAll('input[data-capture-fallback]').length).toBe(1)
  })

  it('旧内核无 cancel 事件：再次调起会替上一次未结算调用按「取消」结算（不永挂）', async () => {
    const p1 = openSystemCapture()
    void openSystemCapture() // 上一次的 input 被移除，旧内核下它永远等不到事件
    await expect(p1).resolves.toEqual([])
  })

  it('cancelPendingSystemCapture：强制结算挂起调用并清理残留节点（关闭弹层/卸载前收尾用）', async () => {
    const p = openSystemCapture()
    expect(document.querySelector('input[data-capture-fallback]')).not.toBeNull()
    cancelPendingSystemCapture()
    await expect(p).resolves.toEqual([])
    expect(document.querySelector('input[data-capture-fallback]')).toBeNull()
  })

  it('正常结算后 pending 指针清空：cancelPendingSystemCapture 不影响下一次调用', async () => {
    const p1 = openSystemCapture()
    lastInput().dispatchEvent(new Event('cancel'))
    await expect(p1).resolves.toEqual([])
    const p2 = openSystemCapture()
    lastInput().dispatchEvent(new Event('change'))
    await expect(p2).resolves.toEqual([])
  })
})
