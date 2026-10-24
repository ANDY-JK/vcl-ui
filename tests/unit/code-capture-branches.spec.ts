/**
 * CodeCapture.vue 剩余分支 — 自动兜底链的下探/回退与结果管理
 *
 * ## 为什么补（505 行，语句 65.2% / 分支 72.7% / 函数 70.7%，72 行未覆盖）
 *
 * 既有 3 个 spec 锁定了「入口级决策表」（无 getUserMedia / notfound / denied ×
 * 触屏/桌面）与手工输入，但**决策之后的执行链路**整块未覆盖：
 *
 * ① `startInpage` **成功**路径（取流成功 → phase='live'）；
 * ② `autoFallback=false` 时失败**只报错不下探**（把自动降级关掉是保守派用户的选择，
 *    若仍弹系统选择器就违背了开关语义）；
 * ③ `trySystemPhoto` 的三条出口：识别命中即交付、**用户取消 → 兜底页**、
 *    **弹层已被外部关闭 → 立即停止下探**（否则关掉弹层后系统选择器又弹出来）；
 * ④ `pickFromAlbum` 的三条出口：用户取消 → **无感回到实时取景**、连扫模式下识别命中
 *    → 回取景继续、未识别 → 留在 idle 展示手动入口；
 * ⑤ `onSheetBack`（兜底页返回：有能力就回实时扫描，没有则回未启动态）与
 *    `restart`（底部重新扫描：无能力则翻回兜底页）；
 * ⑥ `pickArrow`（定格多码时点箭头选码 = 触发该码 + 恢复扫描）；
 * ⑦ `teardown`（v-model 关闭时的收尾：强制结算挂着的系统采集 + 复位全部状态 + 停流）。
 *
 * ## harness
 *
 * `useBarcodeScanner` 用 `vi.hoisted` 可控替身（start/stop/scanPhoto 行为逐例可设、
 * error/failReason 可由测试注入），`capture-fallback` 用**真实实现**——它的
 * `openSystemCapture` 会造一个 `input[data-capture-fallback]` 并 click（已 mock 为
 * no-op），测试用 `dispatchEvent('change'/'cancel')` 结算这条 pending 承诺。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import CodeCapture from '@/components/form/CodeCapture.vue'

/* ── useBarcodeScanner 可控替身 ── */
const h = vi.hoisted(() => ({
  calls: { start: 0, stop: 0, resume: 0, trigger: 0, pause: 0, warm: 0 },
  startImpl: null as null | (() => Promise<void> | void),
  photoImpl: null as null | ((f: File) => Promise<string[]>),
  setErr: null as null | ((msg: string, reason: string) => void),
  handles: null as null | {
    error: { value: string }
    failReason: { value: string }
    detections: { value: unknown[] }
    paused: { value: boolean }
    canvasRef: { value: HTMLCanvasElement | null }
    torchOn: { value: boolean }
    torchSupported: { value: boolean }
  },
}))

vi.mock('@/components/form/utils/useBarcodeScanner', async () => {
  const { ref } = await import('vue')
  return {
    warmBarcodeDecoder: () => {
      h.calls.warm += 1
    },
    useBarcodeScanner: () => {
      const error = ref('')
      const failReason = ref('')
      const detections = ref<unknown[]>([])
      const paused = ref(false)
      const canvasRef = ref<HTMLCanvasElement | null>(null)
      const torchOn = ref(false)
      const torchSupported = ref(false)
      h.setErr = (msg: string, reason: string) => {
        error.value = msg
        failReason.value = reason
      }
      h.handles = { error, failReason, detections, paused, canvasRef, torchOn, torchSupported }
      return {
        start: async () => {
          h.calls.start += 1
          // 真实实现每次 start 都复位错误态；替身必须同款，否则上一例注入的 error 会残留
          error.value = ''
          failReason.value = ''
          if (h.startImpl) await h.startImpl()
        },
        stop: async () => {
          h.calls.stop += 1
        },
        scanPhoto: async (f: File) => (h.photoImpl ? h.photoImpl(f) : []),
        error,
        failReason,
        canvasRef,
        detections,
        triggerDetection: () => {
          h.calls.trigger += 1
        },
        paused,
        pause: () => {
          h.calls.pause += 1
          paused.value = true
        },
        resume: () => {
          h.calls.resume += 1
          paused.value = false
        },
        torchOn,
        torchSupported,
        toggleTorch: () => {},
      }
    },
  }
})

type VM = {
  phase: 'idle' | 'starting' | 'live' | 'recognizing' | 'sheet'
  codes: string[]
  tip: string
  sheetVisible: boolean
  sheetBusy: boolean
  sheetError: string
  manualOk: (v: string) => boolean
  removeCode: (i: number) => void
  close: () => void
  onSheetBack: () => Promise<void>
  openSheet: () => void
  restart: () => Promise<void>
  pickFromAlbum: () => Promise<void>
  pickArrow: (text: string) => void
  [key: string]: unknown
}

/* ── 能力与系统采集 helpers（与既有 fallback spec 同款口径） ── */

function setCapability(opts: { userMedia?: boolean; rejectWith?: { name: string; message: string } }) {
  const md: Record<string, unknown> = { enumerateDevices: vi.fn().mockResolvedValue([]) }
  if (opts.userMedia === false) {
    /* mediaDevices 在场但没有 getUserMedia */
  } else if (opts.rejectWith) {
    md.getUserMedia = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error(opts.rejectWith.message), { name: opts.rejectWith.name }))
  } else {
    md.getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [] })
  }
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: md })
}

function mockTouch(touch = true) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (q: string) => ({
      matches: touch ? q.includes('coarse') : q.includes('fine'),
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }),
  })
}

const systemInput = () => document.querySelector<HTMLInputElement>('input[data-capture-fallback]')

/** 给系统选择的 input 塞文件并结算（模拟用户选完图） */
function finishSystemWith(files: File[]) {
  const input = systemInput()
  expect(input, '系统采集 input 存在').not.toBeNull()
  Object.defineProperty(input!, 'files', { configurable: true, value: files })
  input!.dispatchEvent(new Event('change'))
}

function cancelSystem() {
  const input = systemInput()
  expect(input, '系统采集 input 存在').not.toBeNull()
  input!.dispatchEvent(new Event('cancel'))
}

const jpg = (name = 'a.jpg') => new File(['x'], name, { type: 'image/jpeg' })

function mountCap(props: Record<string, unknown> = {}) {
  return mount(CodeCapture, {
    props: { modelValue: false, ...props },
    global: { stubs: { Teleport: true } },
    attachTo: document.body,
  })
}

async function openCap(w: ReturnType<typeof mountCap>) {
  await w.setProps({ modelValue: true })
  await flushPromises()
}

const vmOf = (w: ReturnType<typeof mountCap>) => w.vm as unknown as VM

const originalMatchMedia = window.matchMedia

beforeEach(() => {
  h.calls = { start: 0, stop: 0, resume: 0, trigger: 0, pause: 0, warm: 0 }
  h.startImpl = null
  h.photoImpl = null
  h.setErr = null
  h.handles = null
  window.isSecureContext = true
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: originalMatchMedia })
  document.querySelectorAll('input[data-capture-fallback]').forEach((el) => el.remove())
  document.body.innerHTML = ''
})

/* ═══════════ ① 取流成功 / 失败收尾 ═══════════ */

describe('startInpage 与 autoFallback 开关', () => {
  it('**取流成功 → 进入实时态并渲染取景层**', async () => {
    setCapability({})
    const w = mountCap()
    await openCap(w)
    expect(h.calls.start, '启动过一次取流').toBe(1)
    expect(vmOf(w).phase, '进入实时态（不再是 starting）').toBe('live')
    expect(w.find('.codecap-live').exists()).toBe(true)
    w.unmount()
  })

  it('**autoFallback=false：失败只报错，不弹系统选择器也不翻兜底页**', async () => {
    setCapability({})
    h.startImpl = () => h.setErr!('被拒绝', 'denied')
    mockTouch()
    const w = mountCap({ autoFallback: false })
    await openCap(w)

    expect(w.emitted('error')).toBeTruthy()
    expect(vmOf(w).phase, '回到未启动态等待用户手动决定').toBe('idle')
    expect(systemInput(), '关掉自动兜底就不该弹系统选择器').toBeNull()
    expect(w.find('.codecap-fallback').exists(), '也不该自动翻兜底页').toBe(false)
    w.unmount()
  })

  it('**v-model 关闭 → teardown 复位全部状态并停流**', async () => {
    setCapability({})
    const w = mountCap()
    await openCap(w)
    expect(vmOf(w).phase).toBe('live')
    const stopsBefore = h.calls.stop

    await w.setProps({ modelValue: false })
    await flushPromises()
    expect(h.calls.stop, '关闭时停流').toBeGreaterThan(stopsBefore)
    expect(vmOf(w).phase, '状态复位').toBe('idle')
    expect(vmOf(w).sheetVisible).toBe(false)
    expect(vmOf(w).tip).toBe('')
    w.unmount()
  })
})

/* ═══════════ ② 失败归因 → 下探方向 ═══════════ */

describe('onInpageFail 的下探方向', () => {
  it('**unsupported：直接兜底页并带原因提示**', async () => {
    setCapability({ rejectWith: { name: 'NotSupportedError', message: 'not supported' } })
    mockTouch()
    h.startImpl = () => h.setErr!('not supported', 'unsupported')
    const w = mountCap()
    await openCap(w)
    expect(vmOf(w).phase).toBe('sheet')
    expect(vmOf(w).tip, '提示里带上原始原因').toContain('not supported')
    w.unmount()
  })

  it('**insecure（非安全上下文）：直接兜底页**', async () => {
    setCapability({ rejectWith: { name: 'SecurityError', message: 'insecure' } })
    mockTouch()
    h.startImpl = () => h.setErr!('insecure', 'insecure')
    const w = mountCap()
    await openCap(w)
    expect(vmOf(w).phase).toBe('sheet')
    w.unmount()
  })

  it('**denied + 触屏：继续下探系统相机**', async () => {
    setCapability({ rejectWith: { name: 'NotAllowedError', message: 'Permission denied' } })
    mockTouch()
    h.startImpl = () => h.setErr!('Permission denied', 'denied')
    const w = mountCap()
    await openCap(w)
    expect(systemInput(), '触屏才自动弹系统相机').not.toBeNull()
    expect(vmOf(w).phase, '进入识别态等待用户出图').toBe('recognizing')
    expect(w.find('.codecap-fallback').exists(), '还没落兜底页').toBe(false)
    w.unmount()
  })

  it('**denied + 桌面：不弹选择器，直接兜底页**', async () => {
    setCapability({ rejectWith: { name: 'NotAllowedError', message: 'Permission denied' } })
    mockTouch(false)
    h.startImpl = () => h.setErr!('Permission denied', 'denied')
    const w = mountCap()
    await openCap(w)
    expect(systemInput(), '桌面不弹（否则用户要选两遍）').toBeNull()
    expect(vmOf(w).phase).toBe('sheet')
    w.unmount()
  })
})

/* ═══════════ ③ trySystemPhoto 的三条出口 ═══════════ */

describe('trySystemPhoto 出口', () => {
  async function toSystemCapture(w: ReturnType<typeof mountCap>) {
    setCapability({ rejectWith: { name: 'NotAllowedError', message: 'Permission denied' } })
    mockTouch()
    h.startImpl = () => h.setErr!('Permission denied', 'denied')
    await openCap(w)
    expect(systemInput()).not.toBeNull()
  }

  it('**系统相机出图且识别命中 → 交付并关闭（不再翻兜底页）**', async () => {
    const w = mountCap()
    await toSystemCapture(w)
    h.photoImpl = async () => ['CODE-1']
    finishSystemWith([jpg()])
    await flushPromises()

    expect(w.emitted('scan'), '交付识别结果').toBeTruthy()
    expect(vmOf(w).codes, '结果入列').toEqual(['CODE-1'])
    expect(w.find('.codecap-fallback').exists(), '命中就不该再翻兜底页').toBe(false)
    expect(w.emitted('close'), '单码模式自动关闭').toBeTruthy()
    w.unmount()
  })

  it('**用户取消系统选择器 → 翻兜底页**', async () => {
    const w = mountCap()
    await toSystemCapture(w)
    const errBefore = (w.emitted('error') ?? []).length
    cancelSystem()
    await flushPromises()
    expect(vmOf(w).phase).toBe('sheet')
    expect(w.find('.codecap-fallback').exists()).toBe(true)
    // 取消 ≠ 识别失败：去掉 `if (files.length)` 后空数组也会走 recognize 并**新增**一条
    // 「未识别」错误（不能断言 error 为空 —— 相机失败时本来就发过一条）
    expect((w.emitted('error') ?? []).length, '用户取消不该新增错误').toBe(errBefore)
    w.unmount()
  })

  it('**出图但识别不到 → 翻兜底页并提示未识别**', async () => {
    const w = mountCap()
    await toSystemCapture(w)
    h.photoImpl = async () => []
    finishSystemWith([jpg()])
    await flushPromises()
    expect(vmOf(w).phase).toBe('sheet')
    expect(w.emitted('error'), '报告未识别').toBeTruthy()
    w.unmount()
  })

  it('**弹层已被外部关闭 → 结算后立即停止下探**（不再弹面板/翻页）', async () => {
    const w = mountCap()
    await toSystemCapture(w)
    h.photoImpl = async () => []
    // 关闭时 teardown 会 cancelPendingSystemCapture 强制结算（旧内核无 cancel 事件），
    // 这条 pending 承诺以 files=[] 收尾 —— 正是守卫要拦的场景
    await w.setProps({ modelValue: false })
    await flushPromises()
    expect(w.find('.codecap-fallback').exists(), '关闭后不得再翻兜底页').toBe(false)
    expect(vmOf(w).phase).toBe('idle')
    // 强制结算必须同时清掉那个残留的 input（否则 DOM 里留一个隐形 file input）
    expect(systemInput(), '挂着的系统采集被结算并清理').toBeNull()
    w.unmount()
  })
})

/* ═══════════ ④ pickFromAlbum 的三条出口 ═══════════ */

describe('pickFromAlbum 出口', () => {
  async function openLive(w: ReturnType<typeof mountCap>) {
    setCapability({})
    mockTouch()
    await openCap(w)
    expect(vmOf(w).phase).toBe('live')
  }

  it('**相册取消 → 无感回到实时取景**', async () => {
    const w = mountCap()
    await openLive(w)
    const startsBefore = h.calls.start
    const stopsBefore = h.calls.stop
    // ⚠️ 不能先 await：openSystemCapture 要等 change/cancel 才结算，先 await 必死锁
    const p = vmOf(w).pickFromAlbum()
    await flushPromises()
    expect(systemInput(), '调起了相册').not.toBeNull()
    cancelSystem()
    await p
    await flushPromises()
    expect(h.calls.stop, '进相册前先停流').toBe(stopsBefore + 1)
    expect(h.calls.start, '取消后重新取流').toBeGreaterThan(startsBefore)
    expect(vmOf(w).phase).toBe('live')
    w.unmount()
  })

  it('**连扫模式识别命中 → 回取景继续扫**', async () => {
    const w = mountCap({ multiple: true })
    await openLive(w)
    h.photoImpl = async () => ['A', 'B']
    const p = vmOf(w).pickFromAlbum()
    await flushPromises()
    finishSystemWith([jpg()])
    await p
    await flushPromises()

    expect(w.emitted('scan'), '两条都交付').toHaveLength(2)
    expect(h.calls.start, '连扫命中后回取景').toBeGreaterThan(1)
    w.unmount()
  })

  it('**识别不到 → 留在未启动态展示手动入口**', async () => {
    const w = mountCap()
    await openLive(w)
    h.photoImpl = async () => []
    const p = vmOf(w).pickFromAlbum()
    await flushPromises()
    finishSystemWith([jpg()])
    await p
    await flushPromises()
    expect(vmOf(w).phase, '不假装在扫').toBe('idle')
    expect(w.emitted('error')).toBeTruthy()
    w.unmount()
  })
})

/* ═══════════ ⑤ 兜底页返回 / 重新扫描 ═══════════ */

describe('onSheetBack 与 restart', () => {
  it('**有取流能力 → 返回时回实时扫描**', async () => {
    setCapability({})
    mockTouch()
    const w = mountCap()
    await openCap(w)
    const stopsBefore = h.calls.stop
    h.handles!.paused.value = true // 定格态进兜底页
    vmOf(w).openSheet()
    await nextTick()
    expect(vmOf(w).sheetVisible).toBe(true)
    expect(h.calls.stop, '翻兜底页要停流（画面不再跑）').toBe(stopsBefore + 1)
    expect(h.handles!.paused.value, '翻兜底页要解除定格').toBe(false)
    expect(h.calls.warm, '提前起解码器，用户选完图不用等冷启动').toBeGreaterThan(0)

    vmOf(w).sheetError = '上一次未识别'
    await vmOf(w).onSheetBack()
    await flushPromises()
    expect(vmOf(w).sheetVisible, '关闭兜底页').toBe(false)
    expect(vmOf(w).sheetError, '返回时清掉旧错误').toBe('')
    expect(vmOf(w).phase, '回实时扫描').toBe('live')
    w.unmount()
  })

  it('**无取流能力 → 返回时回未启动态**', async () => {
    setCapability({ userMedia: false })
    mockTouch()
    const w = mountCap()
    await openCap(w)
    expect(vmOf(w).phase, '无能力直接落兜底页').toBe('sheet')
    await vmOf(w).onSheetBack()
    await flushPromises()
    expect(vmOf(w).phase).toBe('idle')
    expect(w.find('.codecap-fallback').exists()).toBe(false)
    w.unmount()
  })

  it('**点兜底页返回按钮**（真实 DOM 绑定）', async () => {
    setCapability({})
    mockTouch()
    const w = mountCap()
    await openCap(w)
    vmOf(w).openSheet()
    await nextTick()
    const back = w.find('.codecap-back')
    expect(back.exists()).toBe(true)
    await back.trigger('click')
    await flushPromises()
    expect(vmOf(w).phase).toBe('live')
    w.unmount()
  })

  it('**restart 有取流能力 → 重新开始整条链**', async () => {
    setCapability({})
    mockTouch()
    h.startImpl = () => h.setErr!('旧的错误', 'notfound')
    const w = mountCap()
    await openCap(w)
    expect(vmOf(w).tip, '前置条件：失败留下了提示').not.toBe('')

    h.startImpl = null // 相机恢复可用
    vmOf(w).openSheet()
    await nextTick()
    expect(vmOf(w).sheetVisible, '前置：兜底页开着').toBe(true)
    const startsBefore = h.calls.start
    await vmOf(w).restart()
    await flushPromises()
    expect(vmOf(w).sheetVisible, 'restart 要关掉兜底页').toBe(false)
    expect(h.calls.start).toBeGreaterThan(startsBefore)
    expect(vmOf(w).tip, '重新扫描要清掉旧提示').toBe('')
    w.unmount()
  })

  it('**restart 无取流能力 → 翻回兜底页**', async () => {
    setCapability({})
    mockTouch()
    const w = mountCap()
    await openCap(w)
    vmOf(w).openSheet()
    await nextTick()
    await vmOf(w).onSheetBack()
    await flushPromises()

    // 取流能力在运行中消失（设备被拔掉/权限被收回）
    setCapability({ userMedia: false })
    await vmOf(w).restart()
    await flushPromises()
    expect(vmOf(w).phase, '没能力就翻回兜底页').toBe('sheet')
    w.unmount()
  })
})

/* ═══════════ ⑥ 定格选码 / 结果管理 ═══════════ */

describe('定格选码（直接调用，DOM 路径见文末盲区说明）', () => {
  it('**pickArrow：把选中的码交给检测回调并恢复扫描**', async () => {
    // ⚠️ 这一例只覆盖函数体：真实入口是定格层里的按钮（.codecap-frozen），
    //    而渲染非空 detections 列表在 happy-dom 下必报 Maximum recursive updates
    //    （详见文件末尾「盲区」），故这里直接调用函数，不渲染该分支。
    const w = mountCap()
    const triggerBefore = h.calls.trigger
    const resumeBefore = h.calls.resume
    vmOf(w).pickArrow('A')
    await nextTick()
    expect(h.calls.trigger, '把码交给检测回调').toBe(triggerBefore + 1)
    expect(h.calls.resume, '恢复扫描').toBe(resumeBefore + 1)
    w.unmount()
  })

  it('**结果列表可删单条、可清空**', async () => {
    setCapability({})
    const w = mountCap({ multiple: true })
    await openCap(w)
    const vm = vmOf(w)
    vm.codes = ['A', 'B', 'C']
    await nextTick()
    expect(w.find('.codecap-results').exists()).toBe(true)

    const delBtns = w.findAll('.codecap-results button')
    expect(delBtns.length, '有清空 + 逐条删除').toBeGreaterThan(1)
    vm.removeCode(1)
    await nextTick()
    expect(vm.codes, '删除中间那条').toEqual(['A', 'C'])

    // 清空按钮（模板里直接写 codes = []）
    await delBtns[0]!.trigger('click')
    await nextTick()
    expect(vm.codes).toEqual([])
    expect(w.find('.codecap-results').exists(), '空列表后区块消失').toBe(false)
    w.unmount()
  })
})

/* ═══════════ ⑦ 手工输入契约与关闭 ═══════════ */

describe('manualOk 过滤契约与关闭', () => {
  it('**前缀与长度过滤都生效**（前缀不符、长度不符一律拒绝）', async () => {
    const w = mountCap({ prefix: 'P-', length: 5 })
    const ok = vmOf(w).manualOk
    expect(ok('P-123'), '前缀对、长度对 → 通过').toBe(true)
    expect(ok('X-123'), '前缀不符 → 拒绝').toBe(false)
    expect(ok('P-1234'), '长度不符 → 拒绝').toBe(false)
    expect(ok('P-'), '长度不符 → 拒绝').toBe(false)
    w.unmount()
  })

  it('**未配置前缀/长度时不设限**', async () => {
    const w = mountCap()
    expect(vmOf(w).manualOk('任意')).toBe(true)
    w.unmount()
  })

  it('**连扫模式关闭时经 finish 一次性交付全部结果**', async () => {
    setCapability({})
    const w = mountCap({ multiple: true })
    await openCap(w)
    vmOf(w).codes = ['A', 'B']
    vmOf(w).close()
    await nextTick()
    expect(w.emitted('finish')?.[0]?.[0], '一次性交付').toEqual(['A', 'B'])
    expect(w.emitted('update:modelValue')?.[0]).toEqual([false])
    expect(w.emitted('close')).toBeTruthy()
    w.unmount()
  })

  it('**单码模式即使有结果也不发 finish**（契约不同）', async () => {
    setCapability({})
    const w = mountCap()
    await openCap(w)
    vmOf(w).codes = ['A']
    vmOf(w).close()
    await nextTick()
    expect(w.emitted('finish'), '单码走 scan 逐条交付').toBeUndefined()
    w.unmount()
  })

  it('**连扫模式下结果为空也不发 finish**（避免交付空数组）', async () => {
    setCapability({})
    const w = mountCap({ multiple: true })
    await openCap(w)
    vmOf(w).close()
    await nextTick()
    expect(w.emitted('finish')).toBeUndefined()
    w.unmount()
  })
})
/* ═══════════════ ⑧ 补强：边界与组合条件 ═══════════════ */

describe('兜底链的边界与组合条件', () => {
  it('**notfound（没有摄像头）→ 直接兜底页，不试系统相机**', async () => {
    setCapability({ rejectWith: { name: 'NotFoundError', message: 'no camera' } })
    mockTouch()
    h.startImpl = () => h.setErr!('no camera', 'notfound')
    const w = mountCap()
    await openCap(w)
    expect(vmOf(w).phase, '没摄像头就不走系统相机').toBe('sheet')
    expect(systemInput()).toBeNull()
    w.unmount()
  })

  it('**相册打开期间弹层被关闭 → 结算后不得再回取景**', async () => {
    setCapability({})
    mockTouch()
    const w = mountCap()
    await openCap(w)
    const p = vmOf(w).pickFromAlbum()
    await flushPromises()
    expect(systemInput()).not.toBeNull()

    // ⚠️ 基准值必须在**关闭之前**取：teardown 会同步 force-settle 这条 pending，
    //    紧随其后的 flushPromises 就会跑完续延 —— 关闭后才取基准，突变体已经先跑完了
    const startsBeforeClose = h.calls.start
    await w.setProps({ modelValue: false }) // 关掉弹层
    await flushPromises()
    // 关闭时 teardown 已把这条 pending 强制按「取消」结算（input 也被清理），
    // 所以这里不再自己 dispatch cancel —— 要验的正是「被强制结算后不得再回取景」
    await p
    await flushPromises()
    expect(h.calls.start, '关闭后不该再启动取流').toBe(startsBeforeClose)
    w.unmount()
  })

  it('**识别命中但非连扫模式 → 不回取景**（单码该收尾了）', async () => {
    setCapability({})
    mockTouch()
    const w = mountCap({ multiple: false })
    await openCap(w)
    h.photoImpl = async () => ['ONLY']
    const p = vmOf(w).pickFromAlbum()
    await flushPromises()
    finishSystemWith([jpg()])
    await p
    await flushPromises()
    expect(w.emitted('scan'), '结果已交付').toBeTruthy()
    expect(h.calls.start, '单码命中就不再回取景').toBe(1)
    w.unmount()
  })

  it('**同一张图重复识别到同一个码 → 结果只留一条**', async () => {
    setCapability({})
    mockTouch()
    const w = mountCap({ multiple: true })
    await openCap(w)
    h.photoImpl = async () => ['SAME']
    const p = vmOf(w).pickFromAlbum()
    await flushPromises()
    finishSystemWith([jpg('a.jpg'), jpg('b.jpg')])
    await p
    await flushPromises()
    const vm = vmOf(w)
    expect(vm.codes, '去重后只留一条').toEqual(['SAME'])
    expect(w.emitted('scan'), '但每条都照发 scan（调用方自己决定）').toHaveLength(2)
    w.unmount()
  })

  it('**teardown 复位 sheetBusy**（否则下次打开兜底页一直转圈）', async () => {
    setCapability({})
    mockTouch()
    const w = mountCap()
    await openCap(w)
    const vm = vmOf(w)
    vm.openSheet()
    await nextTick()
    vm.sheetBusy = true
    await nextTick()
    expect(vm.sheetBusy, '前置：忙碌中').toBe(true)

    await w.setProps({ modelValue: false })
    await flushPromises()
    expect(vm.sheetBusy, '关闭时复位忙碌标志').toBe(false)
    w.unmount()
  })
})

/* ═══════════════ 盲区（如实记录，未编造用例） ═══════════════
 *
 * 以下 3 行模板分支**没有**被本文件覆盖，原因是 happy-dom 下的渲染不稳定性，
 * 不是「懒得测」：
 *
 *   L385  .codecap-box 点击 → triggerDetection(d.text)   （实时检测框）
 *   L402  .codecap-frozen 点击 → pickArrow(d.text)        （定格选码箭头）
 *   L127-129  watch(detections) 里 detections.length >= 2 → pause()
 *
 * 复现：mock 掉 useBarcodeScanner 后，把 detections 置为非空数组再 await nextTick()，
 * 组件抛 `Maximum recursive updates exceeded in component <CodeCapture>`。
 * 已实测三种变体均复现（替换数组 / push 原地变更 / 先把 canvasRef 置为真实 canvas），
 * 且与 paused 真假无关 —— 排除「watch→pause→重渲染」自触发环这一解释，
 * 指向渲染本身：只要有检测项，每次渲染都会再次触发该组件的更新。
 * 这三条路径在真实浏览器由 e2e 覆盖（检测框/定格层是相机取流后的画面层）。
 * pickArrow 的函数体已用直接调用单独覆盖（见上）。
 * ⚠️ 该现象值得单独排查：若同一原因在真实浏览器下表现为「检测框出现后画面卡顿/闪烁」，
 *    则用户可感。本轮未改动源码，仅如实记录。
 */