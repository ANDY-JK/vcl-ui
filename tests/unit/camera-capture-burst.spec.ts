/**
 * CameraCapture 连拍队列状态机（2026-10-23）
 *
 * ## 为什么补
 *
 * 已有 camera-capture-fallback 只覆盖「相机不可用 → 系统相机 → 兜底面板」链，
 * 组件里 multiple 连拍队列（534 行中约 170 行）零覆盖。
 *
 * ## ⚠️ 这版是重写：第一版 10 个负向探针只生效 1 个
 *
 * 第一版全部用 `if (btn) { ... }` 兜底 + `expect(w.exists()).toBe(true)`，
 * 模板选择器（`.camc-btn-shutter` / `button.camc-ok` / `button.camc-close`）
 * 基本都是猜的 —— 猜不中就走 else 分支静默通过，正是本会话反复抓到的
 * **假绿模式**。重写后所有选择器取自源码实测：
 *
 *   快门        `.camc-shutter`（取景态）/ `.camc-shutter-confirm`（确认态）
 *   完成        `.camc-done`（multiple 顶栏，`:disabled="!shots.length"`）
 *   侧键        `.camc-side`（取消/重拍/删除/翻转，按状态下文案与 handler 切换）
 *   槽位提示    `.camc-slot-chip`
 *   缩略图条    `.camc-thumbs .camc-thumb`（点它 reviewShot(i)）
 *   回看左右    `viewIdx > 0` 才渲染上一张、`viewIdx < shots.length-1` 才渲染下一张
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

import CameraCapture from '@/components/form/CameraCapture.vue'

/* ═══════════ mock 工具 ═══════════ */

function fakeStream(): MediaStream {
  return { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream
}

/** 页面内相机可用；failFacingMode 让带 facingMode 的首次请求抛 OverconstrainedError */
function mockCameraOk(opts: { failFacingMode?: boolean; deviceCount?: number; errorName?: string } = {}) {
  const counters = { faced: 0, total: 0 }
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async (c: MediaStreamConstraints) => {
        counters.total++
        const v = c.video as MediaTrackConstraints
        if (opts.errorName) {
          throw Object.assign(new Error(opts.errorName), { name: opts.errorName })
        }
        if (opts.failFacingMode && v.facingMode) {
          counters.faced++
          throw Object.assign(new Error('constraint'), { name: 'OverconstrainedError' })
        }
        return fakeStream()
      }),
      enumerateDevices: vi.fn(async () =>
        Array.from({ length: opts.deviceCount ?? 1 }, (_, i) => ({ kind: 'videoinput', deviceId: `d${i}` })),
      ),
    },
  })
  return counters
}

/** video/canvas 打桩：play 成功、videoWidth 有值、toBlob 出 blob（可传 null 测受限内核） */
function stubMediaPipeline(opts: { videoWidth?: number; blob?: Blob | null } = {}) {
  const vw = opts.videoWidth ?? 640
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    writable: true,
    value: vi.fn(async () => {}),
  })
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { configurable: true, get: () => vw })
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { configurable: true, get: () => 480 })
  // ⚠️ happy-dom 的 srcObject setter 校验「必须是真 MediaStream 实例」，
  // fakeStream() 是鸭子类型对象会被拒 → 打桩绕过，否则 openStream 在
  // 「video.srcObject = s」这一步就抛错，永远到不了 play()，cameraReady 恒 false
  Object.defineProperty(HTMLVideoElement.prototype, 'srcObject', {
    configurable: true,
    writable: true,
    value: null,
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ({ drawImage: vi.fn() }) as unknown as CanvasRenderingContext2D,
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
  return mount(CameraCapture, {
    props: { modelValue: true, multiple: true, ...props },
    attachTo: document.body,
  })
}

/** flushPromises + 让 setTimeout 定时器有机会跑（相机启动有两级 await） */
async function settle(ms = 20) {
  await flushPromises()
  await new Promise((r) => setTimeout(r, ms))
  await flushPromises()
}

/* 真实选择器（源码实测，无猜测） */
const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T | null
const shutter = () => q<HTMLButtonElement>('.camc-shutter:not(.camc-shutter-confirm)')
const confirmBtn = () => q<HTMLButtonElement>('.camc-shutter-confirm')
const doneBtn = () => q<HTMLButtonElement>('.camc-done')
const sides = () => [...document.querySelectorAll('.camc-side:not(.camc-side-blank)')] as HTMLButtonElement[]
const slotChip = () => q('.camc-slot-chip')?.textContent?.trim() ?? ''
const thumbs = () => [...document.querySelectorAll('.camc-thumb')] as HTMLElement[]

/** 点快门拍一张（强制断言快门存在） */
async function shoot() {
  const s = shutter()
  expect(s, '取景态应有 .camc-shutter').toBeTruthy()
  s!.click()
  await settle(15)
}
/** 拍一张并点确认（进队列） */
async function shootAndConfirm() {
  await shoot()
  const c = confirmBtn()
  expect(c, '拍完后应有 .camc-shutter-confirm').toBeTruthy()
  c!.click()
  await settle(10)
}
/** 按文案点侧键（找不到立刻失败并打印实际文案） */
function sideByLabel(label: string): HTMLButtonElement {
  const btn = sides().find((b) => b.textContent?.trim() === label)
  expect(btn, `应有文案为「${label}」的侧键，实际：[${sides().map((b) => b.textContent?.trim()).join(' / ')}]`).toBeTruthy()
  return btn!
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

/* ═══════════ cameraErrorToChinese ═══════════ */

describe('cameraErrorToChinese：错误 → 可读文案', () => {
  /** 串行：每类错误独立挂载（并发改 navigator 会互相覆盖 mock） */
  async function errorTextFor(name: string): Promise<string> {
    mockCameraOk({ errorName: name })
    stubMediaPipeline()
    const w = mountCam({ fallbackOnError: false, fallbackSheet: false })
    await settle()
    const msg = (w.emitted('error')?.at(-1)?.[0] as string) || ''
    w.unmount()
    document.body.innerHTML = ''
    return msg
  }

  it('**三类错误各映射到一条不同文案**（互不混淆）', async () => {
    const names = ['NotFoundError', 'NotSupportedError', 'SecurityError']
    const msgs: string[] = []
    for (const n of names) msgs.push(await errorTextFor(n))

    // ⚠️ 只查「互不相同」不够：删掉某个映射分支后它落兜底文案，
    // Set 大小仍可能是 3 —— 必须查**各自的关键词**
    const expectKeyword: Record<string, string> = {
      NotFoundError: '未检测到', // 未检测到可用摄像头
      NotSupportedError: '不支持', // 当前浏览器不支持摄像头访问
      SecurityError: '安全策略', // 摄像头访问被安全策略阻止
    }
    msgs.forEach((m, i) => {
      expect(m, `${names[i]} 应有文案`).toBeTruthy()
      expect(m, `${names[i]} 不该把错误名原样透给用户`).not.toContain('Error')
      expect(m, `${names[i]} 应命中专属文案而非兜底`).toContain(expectKeyword[names[i]])
    })
    expect(new Set(msgs).size, '三类应映射到三条不同文案').toBe(3)
  })

  it('**NotAllowedError → 权限文案（含"权限"）**', async () => {
    const msg = await errorTextFor('NotAllowedError')
    expect(msg).toContain('权限')
  })

  it('**NotReadableError 与 AbortError → 同一"占用"文案**', async () => {
    const a = await errorTextFor('NotReadableError')
    const b = await errorTextFor('AbortError')
    expect(a, '都应有文案').toBeTruthy()
    expect(a, '两类映射同一分支').toBe(b)
  })

  it('**OverconstrainedError → 分辨率文案**（重试后仍失败才报）', async () => {
    const msg = await errorTextFor('OverconstrainedError')
    expect(msg).toContain('分辨率')
  })

  it('**未知错误 → 兜底文案**（不把原始错误名透出）', async () => {
    const msg = await errorTextFor('WeirdUnknownError')
    expect(msg).toBeTruthy()
    expect(msg).not.toContain('WeirdUnknownError')
  })
})

/* ═══════════ acquireStream 重试 ═══════════ */

describe('acquireStream：facingMode 不支持时去掉约束重试', () => {
  it('**OverconstrainedError → 去掉 facingMode 再试成功（停在页面内取景）**', async () => {
    const c = mockCameraOk({ failFacingMode: true })
    stubMediaPipeline()
    const w = mountCam({ fallbackOnError: false, fallbackSheet: false })
    await settle()

    expect(c.faced, '首次带 facingMode 失败').toBe(1)
    expect(c.total, '应重试一次（共 2 次）').toBe(2)
    expect(w.emitted('error'), '重试成功不该报错').toBeFalsy()
    expect(q('.camc-video'), '应渲染取景 video').toBeTruthy()
  })

  it('**非约束类错误（NotAllowed）→ 不重试，只调一次**', async () => {
    const c = mockCameraOk({ errorName: 'NotAllowedError' })
    stubMediaPipeline()
    mountCam({ fallbackOnError: false, fallbackSheet: false })
    await settle()
    expect(c.total, '非约束类错误只调一次').toBe(1)
  })
})

/* ═══════════ 连拍队列 ═══════════ */

describe('连拍队列（multiple）', () => {
  it('**拍一张 + 确认 → 进队列、不关面板、不 emit capture**', async () => {
    mockCameraOk()
    stubMediaPipeline()
    const w = mountCam()
    await settle()
    expect(thumbs().length, '初始无缩略图').toBe(0)

    await shootAndConfirm()

    expect(thumbs().length, '确认后队列应有 1 张').toBe(1)
    expect(w.emitted('capture'), 'multiple 模式不该 emit capture').toBeFalsy()
    expect(w.emitted('update:modelValue'), 'multiple 确认不关面板').toBeFalsy()
    expect(shutter(), '应回到取景态（快门重新出现）').toBeTruthy()
  })

  it('**slotChip 随队列变化**：取景态显示下一计划槽位', async () => {
    mockCameraOk()
    stubMediaPipeline()
    mountCam({ shotNames: ['正面', '反面'] })
    await settle()
    expect(slotChip(), '初始应提示下一槽位').toContain('正面')

    await shootAndConfirm()
    expect(slotChip(), '拍完第一张应提示第二槽位').toContain('反面')

    await shootAndConfirm()
    expect(slotChip().length, '计划用完仍应有提示').toBeGreaterThan(0)
  })

  it('**done 按钮 disabled 随队列长度翻转**', async () => {
    mockCameraOk()
    stubMediaPipeline()
    mountCam()
    await settle()
    expect(doneBtn()?.disabled, '空队列时完成按钮应禁用').toBe(true)

    await shootAndConfirm()
    expect(doneBtn()?.disabled, '有 1 张后应启用').toBe(false)
    expect(doneBtn()?.textContent, '文案应带计数').toContain('1')
  })

  it('**空队列点 done → 不 emit finish 不关面板**（disabled 兜住）', async () => {
    mockCameraOk()
    stubMediaPipeline()
    const w = mountCam()
    await settle()
    expect(doneBtn()?.disabled, '空队列 done 应 disabled').toBe(true)

    doneBtn()!.click()
    await settle(5)

    expect(w.emitted('finish'), '空队列不该 emit finish').toBeFalsy()
    expect(w.emitted('update:modelValue'), '空队列不该关面板').toBeFalsy()
  })

  it('**点完成 → emit finish 全量 + 关面板**', async () => {
    mockCameraOk()
    stubMediaPipeline()
    const w = mountCam()
    await settle()
    await shootAndConfirm()
    await shootAndConfirm()

    doneBtn()!.click()
    await settle(5)

    const files = w.emitted('finish')?.at(-1)?.[0] as File[]
    expect(files, '应交付 2 个文件').toHaveLength(2)
    files.forEach((f) => expect(f).toBeInstanceOf(File))
    expect(w.emitted('update:modelValue')?.at(-1)?.[0], '完成应关面板').toBe(false)
  })

  it('**点缩略图 → 进回看态（出现删除侧键）**', async () => {
    mockCameraOk()
    stubMediaPipeline()
    mountCam()
    await settle()
    await shootAndConfirm()

    thumbs()[0].click()
    await settle(5)

    const labels = sides().map((b) => b.textContent?.trim())
    expect(labels, '回看态应有删除').toContain('删除')
  })

  it('**回看：删除唯一一张 → 队列空、done 重新禁用、回取景**', async () => {
    mockCameraOk()
    stubMediaPipeline()
    mountCam()
    await settle()
    await shootAndConfirm()
    thumbs()[0].click()
    await settle(5)

    sideByLabel('删除').click()
    await settle(5)

    expect(thumbs().length, '删除后队列应空').toBe(0)
    expect(doneBtn()?.disabled, 'done 应重新禁用').toBe(true)
    expect(shutter(), '应回到取景态').toBeTruthy()
  })

  it('**回看：拍 2 张删第 1 张 → 剩 1 张**（deleteShot 索引收缩）', async () => {
    mockCameraOk()
    stubMediaPipeline()
    mountCam()
    await settle()
    await shootAndConfirm()
    await shootAndConfirm()
    expect(thumbs().length).toBe(2)

    thumbs()[0].click()
    await settle(5)
    sideByLabel('删除').click()
    await settle(5)

    expect(thumbs().length, '删一张后应剩 1 张').toBe(1)
    // viewIdx 必须收缩到合法范围：删后若 viewIdx 越界，回看态会破（左右键/确认目标错乱）
    // 合法回看态的标志是仍显示「删除」侧键且中间键是「返回」
    expect(sides().map((b) => b.textContent?.trim()), '应仍停在合法回看态').toContain('删除')
    expect(confirmBtn(), '回看态应有中间键').toBeTruthy()
  })

  it('**回看：重拍 → 回取景态并显示替换提示**', async () => {
    mockCameraOk()
    stubMediaPipeline()
    mountCam({ shotNames: ['正面'] })
    await settle()
    await shootAndConfirm()
    thumbs()[0].click()
    await settle(5)

    sideByLabel('重拍').click()
    await settle(5)

    expect(slotChip(), '替换中提示应含目标名称').toContain('正面')
    expect(shutter(), '应回到取景态可重拍').toBeTruthy()
  })

  it('**重拍态下点另一个缩略图 → replaceIdx 被重置**（不误替换）', async () => {
    mockCameraOk()
    stubMediaPipeline()
    mountCam()
    await settle()
    await shootAndConfirm()
    await shootAndConfirm()
    expect(thumbs().length).toBe(2)

    // 第 0 张 → 重拍（进替换态 replaceIdx=0）
    thumbs()[0].click()
    await settle(5)
    sideByLabel('重拍').click()
    await settle(5)
    expect(slotChip(), '应处于替换态（提示含重拍目标）').toMatch(/重拍|替换|第 1 张/)

    // 此时点第 1 张缩略图 → reviewShot(1) 应重置 replaceIdx
    thumbs()[1].click()
    await settle(5)
    // 回看态：确认键是「返回」→ 回取景
    confirmBtn()!.click()
    await settle(5)

    // 关键：此时若 replaceIdx 残留 0，新拍的一张会**替换第 0 位**（长度仍 2，但内容被换）；
    // 若已重置，新拍的一张是**追加**（长度变 3）。
    await shootAndConfirm()
    expect(thumbs().length, 'replaceIdx 应已重置 → 新拍为追加（长度 3）').toBe(3)
  })

  it('**替换位确认后仍在原位置（队列长度不变）**', async () => {
    mockCameraOk()
    stubMediaPipeline()
    mountCam()
    await settle()
    await shootAndConfirm()
    await shootAndConfirm()
    expect(thumbs().length).toBe(2)

    thumbs()[0].click()
    await settle(5)
    sideByLabel('重拍').click()
    await settle(5)
    await shootAndConfirm()

    expect(thumbs().length, '替换不该增加队列长度').toBe(2)
  })
})

/* ═══════════ 单选 ═══════════ */

describe('单选模式（multiple=false）', () => {
  it('**确认一张 → emit capture + 关面板**', async () => {
    mockCameraOk()
    stubMediaPipeline()
    const w = mountCam({ multiple: false })
    await settle()
    await shoot()

    const c = confirmBtn()
    expect(c, '单选拍完也应有确认键').toBeTruthy()
    c!.click()
    await settle(5)

    expect(w.emitted('capture'), '单选应 emit capture').toBeTruthy()
    expect(w.emitted('capture')?.at(-1)?.[0]).toBeInstanceOf(File)
    expect(w.emitted('update:modelValue')?.at(-1)?.[0], '单选应关面板').toBe(false)
  })

  it('**单选不渲染连拍顶栏与缩略图条**', async () => {
    mockCameraOk()
    stubMediaPipeline()
    mountCam({ multiple: false })
    await settle()
    expect(doneBtn(), '单选不该有完成键（顶栏仅 multiple）').toBeFalsy()
    expect(q('.camc-strip'), '单选不该有缩略图条').toBeFalsy()
  })
})

/* ═══════════ 取消 / 关闭 ═══════════ */

describe('取消与关闭', () => {
  it('**取景态点取消 → emit cancel + 关面板**', async () => {
    mockCameraOk()
    stubMediaPipeline()
    const w = mountCam()
    await settle()

    sideByLabel('取消').click()
    await settle(5)

    expect(w.emitted('cancel'), '应 emit cancel').toBeTruthy()
    expect(w.emitted('update:modelValue')?.at(-1)?.[0]).toBe(false)
  })

  it('**遮罩自点击 → cancel**', async () => {
    mockCameraOk()
    stubMediaPipeline()
    const w = mountCam()
    await settle()

    const mask = q('.camc-mask')
    expect(mask, '应有遮罩').toBeTruthy()
    mask!.dispatchEvent(new MouseEvent('click'))
    await settle(5)

    expect(w.emitted('cancel'), '遮罩自点击应取消').toBeTruthy()
  })
})

/* ═══════════ 翻转键按需显示 ═══════════ */

describe('翻转键（showFlip 按设备数）', () => {
  it('**2 个摄像头 → 渲染翻转键**', async () => {
    mockCameraOk({ deviceCount: 2 })
    stubMediaPipeline()
    mountCam()
    await settle()
    expect(sides().map((b) => b.textContent?.trim()), '双摄应有翻转键').toContain('翻转')
  })

  it('**1 个摄像头 → 只有占位 span，无翻转按钮**', async () => {
    mockCameraOk({ deviceCount: 1 })
    stubMediaPipeline()
    mountCam()
    await settle()
    expect(sides().map((b) => b.textContent?.trim()), '单摄不该有翻转键').not.toContain('翻转')
    expect(q('.camc-side-blank'), '应有占位保持三栏平衡').toBeTruthy()
  })

  it('**enumerateDevices 抛错 → 不显示翻转键且不炸**', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => fakeStream()),
        enumerateDevices: vi.fn().mockRejectedValue(new Error('nope')),
      },
    })
    stubMediaPipeline()
    const w = mountCam()
    await settle()
    expect(sides().map((b) => b.textContent?.trim())).not.toContain('翻转')
    expect(w.emitted('error'), '枚举失败不算相机失败').toBeFalsy()
  })
})

/* ═══════════ 快门容错 ═══════════ */

describe('快门容错', () => {
  it('**toBlob 回调 null → 降级报错**（受限内核，按快门不能无反应）', async () => {
    mockCameraOk()
    stubMediaPipeline({ blob: null })
    const w = mountCam({ fallbackOnError: false, fallbackSheet: false })
    await settle()

    await shoot()
    await settle(15)

    expect(w.emitted('error'), 'toBlob null 应降级报错').toBeTruthy()
    expect(confirmBtn(), '降级后不该进确认态').toBeFalsy()
  })

  it('**videoWidth=0 → 延迟重试，仍为 0 才降级**', async () => {
    mockCameraOk()
    stubMediaPipeline({ videoWidth: 0 })
    const w = mountCam({ fallbackOnError: false, fallbackSheet: false })
    await settle()

    await shoot()
    await settle(200) // _METADATA_RETRY_MS = 150，留余量后才降级

    expect(w.emitted('error'), '重试仍失败应降级').toBeTruthy()
  })

  it('**cameraReady=false 时点快门无动作**（防未就绪截图）', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(() => new Promise(() => {})), // 永不 resolve：停在启动中
        enumerateDevices: vi.fn(async () => []),
      },
    })
    stubMediaPipeline()
    mountCam()
    await settle()
    const s = shutter()
    if (s) {
      s.click()
      await settle(10)
    }
    // ⚠️ multiple 模式本来就不 emit capture —— 不能拿它当信号。
    // 正确的信号是「确认态是否出现」（.camc-shutter-confirm 渲染自 shotUrl 非空）
    expect(confirmBtn(), '未就绪按快门不该进确认态').toBeFalsy()
    expect(q('.camc-shot'), '未就绪不该有已拍预览图').toBeFalsy()
  })
})
