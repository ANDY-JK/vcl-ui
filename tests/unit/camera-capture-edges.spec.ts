/**
 * CameraCapture 边角：回看左右切换 / 焦点陷阱 / 关闭竞态 / 重拍退回
 *
 * ## 为什么补
 *
 * camera-capture-burst 覆盖了连拍队列主干（拍/确认/删除/完成），camera-capture-fallback
 * 覆盖了「相机不可用 → 系统相机 → 上传面板」兜底链。仍空着的是**四类只在特定时序下
 * 出现**的分支：
 *   ① **回看左右切换** —— `reviewPrev/reviewNext` 与「首张不出上一张、末张不出下一张」
 *      两个 `v-if`。这是用户在胶卷里翻照片的唯一途径，翻不动就等于只有第一张能看。
 *   ② **焦点陷阱** —— 相机是全屏浮层，Tab 必须困在工具栏内；不测的话「Tab 出去后
 *      焦点落到背后的表单」这种无障碍缺陷永远发现不了。
 *   ③ **关闭竞态** —— `getUserMedia` 是异步的，用户完全可能在授权弹窗还没结束时就关掉
 *      面板。此时流返回了却没人接，若不主动 stop，摄像头指示灯会一直亮着（真实投诉场景）。
 *   ④ **重拍退回** —— 回看里点「重拍」进取景，改主意后按侧键（此时文案变成「返回」）
 *      应该**退回回看而不是关掉整个相机**，两处 `replaceIdx >= 0` 分支各管一半。
 *
 * harness（navigator.mediaDevices / video.srcObject / toBlob 打桩）沿用
 * camera-capture-burst.spec.ts 里已验证过的那套 —— 其中 `srcObject` 必须整体 defineProperty
 * 绕过，happy-dom 的 setter 会校验「必须是真 MediaStream 实例」，鸭子类型对象会被拒。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import CameraCapture from '@/components/form/CameraCapture.vue'

/* ═══════════ mock 工具 ═══════════ */

function fakeStream(): MediaStream & { tracks: { stop: ReturnType<typeof vi.fn> }[] } {
  const tracks = [{ stop: vi.fn() }]
  return { getTracks: () => tracks, tracks } as unknown as MediaStream & {
    tracks: { stop: ReturnType<typeof vi.fn> }[]
  }
}

function mockCamera(opts: { deviceCount?: number; errorName?: string; message?: string; deferred?: boolean } = {}) {
  const state = {
    stream: fakeStream(),
    resolve: (() => {}) as (() => void) | null,
    calls: [] as MediaStreamConstraints[],
  }
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn((c: MediaStreamConstraints) => {
        state.calls.push(c)
        if (opts.deferred) {
          return new Promise<MediaStream>((resolve) => {
            state.resolve = () => resolve(state.stream)
          })
        }
        if (opts.errorName || opts.message) {
          const err = new Error(opts.message ?? opts.errorName!)
          if (opts.errorName) err.name = opts.errorName
          return Promise.reject(err)
        }
        return Promise.resolve(state.stream)
      }),
      enumerateDevices: vi.fn(async () =>
        Array.from({ length: opts.deviceCount ?? 1 }, (_, i) => ({ kind: 'videoinput', deviceId: `d${i}` })),
      ),
    },
  })
  return state
}

function stubMediaPipeline(opts: { videoWidth?: number; blob?: Blob | null; noCtx?: boolean } = {}) {
  const vw = opts.videoWidth ?? 640
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    writable: true,
    value: vi.fn(async () => {}),
  })
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => vw })
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 480 })
  Object.defineProperty(HTMLVideoElement.prototype, 'srcObject', { configurable: true, writable: true, value: null })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => (opts.noCtx ? null : ({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)),
  )
  Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
    configurable: true,
    writable: true,
    value: function (cb: (b: Blob | null) => void) {
      cb(opts.blob === undefined ? new Blob(['x'], { type: 'image/jpeg' }) : opts.blob)
    },
  })
}

function mountCam(props: Record<string, unknown> = {}) {
  return mount(CameraCapture, { props: { modelValue: true, multiple: true, ...props }, attachTo: document.body })
}

async function settle(ms = 20) {
  await flushPromises()
  await new Promise((r) => setTimeout(r, ms))
  await flushPromises()
}

const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T | null
const shutter = () => q<HTMLButtonElement>('.camc-shutter:not(.camc-shutter-confirm)')
const confirmBtn = () => q<HTMLButtonElement>('.camc-shutter-confirm')
const sides = () => [...document.querySelectorAll('.camc-side:not(.camc-side-blank)')] as HTMLButtonElement[]
const thumbs = () => [...document.querySelectorAll('.camc-thumb')] as HTMLElement[]
const navPrev = () => q<HTMLButtonElement>('.camc-nav-prev')
const navNext = () => q<HTMLButtonElement>('.camc-nav-next')

function sideByLabel(label: string): HTMLButtonElement {
  const btn = sides().find((b) => b.textContent?.trim() === label)
  expect(
    btn,
    `应有文案为「${label}」的侧键，实际：[${sides()
      .map((b) => b.textContent?.trim())
      .join(' / ')}]`,
  ).toBeTruthy()
  return btn!
}

async function shoot() {
  const s = shutter()
  expect(s, '取景态应有 .camc-shutter').toBeTruthy()
  s!.click()
  await settle(15)
}

async function shootAndConfirm() {
  await shoot()
  const c = confirmBtn()
  expect(c, '拍完后应有 .camc-shutter-confirm').toBeTruthy()
  c!.click()
  await settle(10)
}

beforeEach(() => {
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  document.body.innerHTML = ''
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

/* ═══════════ 回看左右切换 ═══════════ */

describe('回看：左右切换与边界按钮', () => {
  it('**首张不出「上一张」、末张不出「下一张」**（否则点了没反应）', async () => {
    mockCamera()
    stubMediaPipeline()
    const w = mountCam()
    await settle()
    await shootAndConfirm()
    await shootAndConfirm()
    expect(thumbs().length, '前置：两张在队列里').toBe(2)

    thumbs()[0]!.click() // 回看第 1 张
    await settle(10)
    expect(navPrev(), '首张不该有上一张').toBeNull()
    expect(navNext(), '第 1 张应有下一张').toBeTruthy()

    thumbs()[1]!.click() // 回看第 2 张
    await settle(10)
    expect(navPrev(), '第 2 张应有上一张').toBeTruthy()
    expect(navNext(), '末张不该有下一张').toBeNull()
    w.unmount()
  })

  it('**点上一张/下一张能真的翻动**（按钮在但翻不动是最常见的半成品）', async () => {
    mockCamera()
    stubMediaPipeline()
    const w = mountCam()
    await settle()
    await shootAndConfirm()
    await shootAndConfirm()

    thumbs()[1]!.click() // 从末张开始
    await settle(10)
    const activeThumb = () => thumbs().findIndex((t) => t.classList.contains('active'))
    expect(activeThumb(), '当前高亮第 2 张').toBe(1)

    navPrev()!.click()
    await settle(10)
    expect(activeThumb(), '上一张 → 高亮第 1 张').toBe(0)
    expect(navPrev(), '到首张后上一张消失').toBeNull()

    navNext()!.click()
    await settle(10)
    expect(activeThumb(), '下一张 → 回到第 2 张').toBe(1)
    w.unmount()
  })

  it('**回看中的左右按钮带无障碍说明**（读屏用户不知道 ‹ › 是什么）', async () => {
    mockCamera()
    stubMediaPipeline()
    const w = mountCam()
    await settle()
    await shootAndConfirm()
    await shootAndConfirm()

    thumbs()[1]!.click()
    await settle(10)
    expect(navPrev()!.getAttribute('aria-label'), '上一张').toBe('上一张')
    expect(navNext()).toBeNull()
    w.unmount()
  })
})

/* ═══════════ 焦点陷阱 ═══════════ */

describe('焦点陷阱：Tab 被困在工具栏内', () => {
  it('**打开时焦点移入浮层**（否则读屏用户还在读背后的表单）', async () => {
    mockCamera()
    stubMediaPipeline()
    const trigger = document.createElement('button')
    trigger.textContent = '打开相机'
    document.body.appendChild(trigger)
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    const w = mountCam()
    await settle()

    const stage = q('.camc-stage')
    expect(stage, '应有浮层容器').toBeTruthy()
    expect(document.activeElement, '焦点应已移入浮层').toBe(stage)
    w.unmount()
  })

  it('**Tab 到最后一个可聚焦元素后回到第一个**（不逃出浮层）', async () => {
    mockCamera()
    stubMediaPipeline()
    const w = mountCam({ multiple: false })
    await settle()

    const stage = q('.camc-stage')!
    const focusables = [...stage.querySelectorAll<HTMLElement>('button:not([disabled])')]
    expect(focusables.length, '前置：工具栏里有多个按钮').toBeGreaterThan(1)

    const first = focusables[0]!
    const last = focusables[focusables.length - 1]!
    last.focus()
    expect(document.activeElement).toBe(last)

    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    window.dispatchEvent(ev)
    await settle(5)
    expect(ev.defaultPrevented, '应阻止默认 Tab').toBe(true)
    expect(document.activeElement, '回到第一个').toBe(first)
    w.unmount()
  })

  it('**Shift+Tab 在第一个上跳到最后一个**（反向也要闭环）', async () => {
    mockCamera()
    stubMediaPipeline()
    const w = mountCam({ multiple: false })
    await settle()

    const stage = q('.camc-stage')!
    const focusables = [...stage.querySelectorAll<HTMLElement>('button:not([disabled])')]
    const first = focusables[0]!
    const last = focusables[focusables.length - 1]!

    first.focus()
    const ev = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
    window.dispatchEvent(ev)
    await settle(5)
    expect(ev.defaultPrevented).toBe(true)
    expect(document.activeElement, '跳到最后').toBe(last)
    w.unmount()
  })

  it('**关闭后焦点还给打开它的按钮**（否则用户按 Tab 会从页首重新开始）', async () => {
    mockCamera()
    stubMediaPipeline()
    const trigger = document.createElement('button')
    trigger.textContent = '打开相机'
    document.body.appendChild(trigger)
    trigger.focus()

    const w = mountCam({ multiple: false })
    await settle()
    expect(document.activeElement).not.toBe(trigger)

    sideByLabel('取消').click() // 关闭浮层
    await settle(10)
    // ⚠️ 本 harness 不绑 v-model：组件只 emit('update:modelValue', false)，
    //    props 仍是 true → 面板不会真关、焦点陷阱不会释放。必须手动回写。
    await w.setProps({ modelValue: false })
    await settle(10)
    expect(document.activeElement, '焦点应回到触发按钮').toBe(trigger)
    w.unmount()
  })
})

/* ═══════════ 关闭竞态 ═══════════ */

describe('关闭竞态：流回来时面板已关', () => {
  it('**取流未返回时关闭面板 → 流被 stop、不挂到 video 上**（否则摄像头灯常亮）', async () => {
    const state = mockCamera({ deferred: true })
    stubMediaPipeline()
    const w = mountCam({ multiple: false })
    await settle()
    expect(state.calls.length, '前置：已发起 getUserMedia').toBe(1)

    // 授权弹窗还没结束，用户就关掉了
    sideByLabel('取消').click()
    await settle(10)
    expect(w.emitted('update:modelValue')?.at(-1)?.[0], '应关闭').toBe(false)
    // 同上：必须把 props 真的改掉，否则 openStream 回来时看到的仍是 modelValue=true
    await w.setProps({ modelValue: false })
    await settle(10)

    state.resolve!() // 流现在才返回
    await settle(30)

    expect(state.stream.tracks[0]!.stop, '没人接的流必须停掉').toHaveBeenCalled()
    const video = q('video')
    expect(video, '面板已关，video 不在 DOM').toBeNull()
    w.unmount()
  })
})

/* ═══════════ 重拍退回与侧键文案 ═══════════ */

describe('重拍态：退回回看而不是关掉相机', () => {
  it('**回看里点重拍 → 进取景且侧键文案变「返回」**', async () => {
    mockCamera()
    stubMediaPipeline()
    const w = mountCam()
    await settle()
    await shootAndConfirm()
    await shootAndConfirm()

    thumbs()[0]!.click() // 回看第 1 张
    await settle(10)
    sideByLabel('重拍').click() // 进取景（替换第 0 张）
    await settle(10)

    expect(shutter(), '应回到取景态').toBeTruthy()
    expect(sides().map((b) => b.textContent?.trim()), '侧键文案应变成「返回」').toContain('返回')
    w.unmount()
  })

  it('**取景态按「返回」→ 退回回看，队列不变、不 emit cancel**', async () => {
    mockCamera()
    stubMediaPipeline()
    const w = mountCam()
    await settle()
    await shootAndConfirm()
    await shootAndConfirm()

    thumbs()[0]!.click()
    await settle(10)
    sideByLabel('重拍').click()
    await settle(10)

    sideByLabel('返回').click()
    await settle(10)
    expect(thumbs().length, '队列仍是 2 张').toBe(2)
    expect(thumbs()[0]!.classList.contains('active'), '应退回回看第 1 张').toBe(true)
    expect(w.emitted('cancel'), '退回不等于取消').toBeFalsy()
    expect(w.emitted('update:modelValue'), '也不该关面板').toBeFalsy()
    w.unmount()
  })

  it('**待确认态（已拍未确认）按「重拍」→ 回到取景，画面清空**', async () => {
    mockCamera()
    stubMediaPipeline()
    const w = mountCam({ multiple: false })
    await settle()
    await shoot()

    expect(q('.camc-shot'), '前置：有待确认画面').toBeTruthy()
    expect(confirmBtn(), '前置：有确认键').toBeTruthy()

    sideByLabel('重拍').click()
    await settle(10)

    expect(q('.camc-shot'), '重拍后画面应清空').toBeNull()
    expect(confirmBtn(), '确认键应消失').toBeNull()
    expect(shutter(), '回到取景态').toBeTruthy()
    w.unmount()
  })

  it('**待确认态替换中按侧键 → 文案是「返回」且退回回看**（不是取消整个相机）', async () => {
    mockCamera()
    stubMediaPipeline()
    const w = mountCam()
    await settle()
    await shootAndConfirm()

    thumbs()[0]!.click() // 回看
    await settle(10)
    sideByLabel('重拍').click() // 进替换取景
    await settle(10)
    await shoot() // 拍一张 → 待确认（replaceIdx 仍指向第 0 张）

    expect(sides().map((b) => b.textContent?.trim()), '待确认态替换中右侧应为「返回」').toContain('返回')
    sideByLabel('返回').click()
    await settle(10)

    expect(thumbs().length, '队列仍是 1 张（未追加）').toBe(1)
    expect(w.emitted('cancel'), '不该取消').toBeFalsy()
    w.unmount()
  })
})

/* ═══════════ 快门容错的剩余分支 ═══════════ */

describe('快门容错：canvas 能力缺失也要降级而不是无反应', () => {
  it('**getContext 返回 null → 降级系统相机**', async () => {
    mockCamera()
    stubMediaPipeline({ noCtx: true })
    const w = mountCam({ multiple: false, fallbackOnError: true })
    await settle()

    await shoot()
    const msg = (w.emitted('error')?.at(-1)?.[0] as string) || ''
    expect(msg, '应报「已切换系统相机」类文案').toBeTruthy()
    expect(w.emitted('update:modelValue')?.at(-1)?.[0], '降级即关面板').toBe(false)
    w.unmount()
  })
})

/* ═══════════ 错误文案剩余分支 ═══════════ */

describe('错误文案：未找到设备与安全错误', () => {
  async function msgFor(opts: { errorName?: string; message?: string }): Promise<string> {
    mockCamera(opts)
    stubMediaPipeline()
    const w = mountCam({ multiple: false, fallbackOnError: false, fallbackSheet: false })
    await settle()
    const msg = (w.emitted('error')?.at(-1)?.[0] as string) || ''
    w.unmount()
    document.body.innerHTML = ''
    return msg
  }

  it('**Requested device not found（无 name）→ 设备未找到文案**', async () => {
    const msg = await msgFor({ message: 'Requested device not found' })
    expect(msg).toContain('未找到摄像头设备')
  })

  it('**SecurityError → 安全错误文案**（非 HTTPS 场景）', async () => {
    const msg = await msgFor({ errorName: 'SecurityError' })
    expect(msg, '不该落到兜底文案').not.toBe('相机启动失败，请重试')
    expect(msg).toBeTruthy()
  })

  it('**NotSupportedError → 不支持文案**', async () => {
    const msg = await msgFor({ errorName: 'NotSupportedError' })
    expect(msg, '不该落到兜底文案').not.toBe('相机启动失败，请重试')
  })
})

/* ═══════════ flip 与取消确认 ═══════════ */

describe('翻转与取消确认', () => {
  it('**点翻转 → 用 user 约束重新取流，画面加镜像类**', async () => {
    const state = mockCamera({ deviceCount: 2 })
    stubMediaPipeline()
    const w = mountCam({ multiple: false })
    await settle()

    const flipBtn = sideByLabel('翻转')
    flipBtn.click()
    await settle(30)

    const last = state.calls.at(-1)!.video as MediaTrackConstraints
    expect(last.facingMode, '第二次应以 user 取流').toBe('user')
    expect(q('.camc-video')!.classList.contains('camc-mirror'), '前置摄像头画面要镜像').toBe(true)
    w.unmount()
  })

  it('**队列非空时取消 → 弹确认；用户点「否」则不关**', async () => {
    mockCamera()
    stubMediaPipeline()
    // happy-dom 没实现 window.confirm，必须 stubGlobal 注入
    const confirmSpy = vi.fn(() => false)
    vi.stubGlobal('confirm', confirmSpy)
    const w = mountCam()
    await settle()
    await shootAndConfirm()

    sideByLabel('取消').click()
    await settle(10)
    expect(confirmSpy, '应弹二次确认').toHaveBeenCalled()
    expect(w.emitted('cancel'), '用户反悔 → 不关').toBeFalsy()
    expect(thumbs().length, '队列保留').toBe(1)
    vi.unstubAllGlobals()
    w.unmount()
  })

  it('**用户确认放弃 → 关面板并 emit cancel**', async () => {
    mockCamera()
    stubMediaPipeline()
    vi.stubGlobal('confirm', vi.fn(() => true))
    const w = mountCam()
    await settle()
    await shootAndConfirm()

    sideByLabel('取消').click()
    await settle(10)
    expect(w.emitted('cancel'), '确认放弃 → cancel').toBeTruthy()
    expect(w.emitted('update:modelValue')?.at(-1)?.[0]).toBe(false)
    vi.unstubAllGlobals()
    w.unmount()
  })
})
