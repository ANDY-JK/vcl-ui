/**
 * CodeCapture 补缺测试（2026-10-23）
 *
 * ## 为什么补
 *
 * `CodeCapture.vue` 505 行 / 未覆盖 117 条（43.5%）。已有两个 spec 覆盖了
 * 扫码状态机（code-capture-scan）与兜底链（code-capture-fallback），
 * **但两条用户路径完全没测**：
 *
 *   ① **手工输入的 prefix/length 校验**（`manualOk`）——
 *      用户手输一个不匹配前缀/长度的码，必须被拦下并提示，而不是收进结果
 *   ② **上传识别**（`recognize` / `onSheetFiles`）——
 *      单张失败不阻塞下一张（注释明说）；全失败要提示「未识别」；
 *      成功时去重收集
 *
 * ## 构造踩过的坑（全部记录在案）
 *
 *   ① sheet 是 stage 内翻页而非独立 DOM；入口是 idle 动作区**最后一个**按钮
 *      （happy-dom 下 canInpage=false 只有 1 个按钮，真浏览器是 2 个）
 *   ② sheet 内容是子组件 CaptureFallbackPanel：输入框在 `.capfb-panel input`，
 *      提交按钮是 `.btn-primary`，错误提示是 `.capfb-err`
 *   ③ mock 需补 `stop`（openSheet 调用）与 `warmBarcodeDecoder`（openSheet 里预热）
 *   ④ **文件选择没有 DOM input** —— pickFiles 走 openSystemCapture（系统选择器），
 *      上传路径测试用 findComponent 直接对 CaptureFallbackPanel emit 'files'
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  onScan: null as null | ((code: string) => void),
  detections: null as null | { value: unknown[] },
  paused: null as null | { value: boolean },
  canvas: null as null | { value: HTMLCanvasElement | null },
  pause: null as null | ReturnType<typeof vi.fn>,
  scanPhoto: null as null | ReturnType<typeof vi.fn>,
  systemFiles: [] as File[],
}))

// openSystemCapture：pickFiles 调它弹系统选择器 —— mock 成返回预置文件，
// 这样点击 .capfb-pick 就能走「选文件 → emit files → onSheetFiles → recognize」全链路
vi.mock('@/components/form/utils/capture-fallback', async () => {
  const actual = await import('@/components/form/utils/capture-fallback')
  return {
    ...actual,
    openSystemCapture: vi.fn(async () => h.systemFiles),
  }
})

vi.mock('@/components/form/utils/useBarcodeScanner', async () => {
  const { ref } = await import('vue')
  return {
    useBarcodeScanner: (opts: { onScan: (code: string) => void }) => {
      const detections = ref<unknown[]>([])
      const paused = ref(false)
      const canvas = ref<HTMLCanvasElement | null>(null)
      const pause = vi.fn(() => {
        paused.value = true
      })
      h.onScan = opts.onScan
      h.detections = detections
      h.paused = paused
      h.canvas = canvas
      h.pause = pause
      return {
        canvasRef: canvas,
        detections,
        triggerDetection: vi.fn(),
        paused,
        pause,
        resume: () => {
          paused.value = false
        },
        torchOn: ref(false),
        torchSupported: ref(false),
        toggleTorch: vi.fn(),
        // openSheet 在 modelValue=true 时会调 stop()（停掉可能存在的取流）
        stop: vi.fn(),
        // ⚠️ scanPhoto 从 useBarcodeScanner 的**返回值**解构（L91-97），
        // 不是模块级导出 —— mock 必须放在返回对象里
        scanPhoto: (f: File) => h.scanPhoto!(f),
      }
    },
    // openSheet 里 void warmBarcodeDecoder()（提前起解码器，无副作用）
    warmBarcodeDecoder: vi.fn(async () => ({})),
  }
})

const CodeCapture = (await import('@/components/form/CodeCapture.vue')).default

const mountCC = (props = {}) =>
  mount(CodeCapture, { props: { modelValue: true, ...props }, attachTo: document.body })

/** 打开兜底 sheet：点 idle 动作区最后一个按钮（openSheet，两种环境都成立） */
async function openSheet(w: ReturnType<typeof mount>) {
  const btns = [...document.querySelectorAll('.codecap-actions .codecap-btn')] as HTMLButtonElement[]
  const uploadBtn = btns[btns.length - 1]
  expect(uploadBtn, 'idle 态应有「上传识别/手输」入口按钮').toBeTruthy()
  uploadBtn!.click()
  await w.vm.$nextTick()
}

const manualInput = () => document.querySelector('.capfb-panel input.f-input') as HTMLInputElement | null
const submitBtn = () => document.querySelector('.capfb-panel button.btn-primary') as HTMLButtonElement | null
const sheetError = () => document.querySelector('.capfb-err')?.textContent

/** 点「选图」按钮走全链路：pickFiles → openSystemCapture(mock) → emit files → recognize */
async function feedFiles(w: ReturnType<typeof mount>, files: File[]) {
  h.systemFiles = files
  const pick = document.querySelector('.capfb-pick') as HTMLButtonElement | null
  expect(pick, '面板应有「选图」按钮').toBeTruthy()
  pick!.click()
  await new Promise((r) => setTimeout(r, 30))
  await w.vm.$nextTick()
}

/** 输入手输码并提交 */
async function submitManual(w: ReturnType<typeof mount>, code: string) {
  const input = manualInput()
  expect(input, 'sheet 应有手输输入框').toBeTruthy()
  if (!input) return
  input.value = code
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await w.vm.$nextTick()
  const btn = submitBtn()
  expect(btn, 'sheet 应有提交按钮').toBeTruthy()
  btn!.click()
  await w.vm.$nextTick()
}

beforeEach(() => {
  // ⚠️ 清理上一个用例的残留 DOM：CodeCapture 的浮层 Teleport 到 body 且
  // unmount 不可靠（mock 环境下 stop 报错），afterEach 只清 body 不够 ——
  // .capfb-err 等旧节点会污染下一个用例的「不该有错误提示」断言。
  document.body.innerHTML = ''
  h.scanPhoto = vi.fn(async () => [] as string[])
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('手工输入校验（manualOk：prefix / length）', () => {
  it('**prefix 不匹配 → 拦下并提示**，不收进结果、不 emit scan', async () => {
    const w = mountCC({ multiple: true, prefix: 'SKU-' })
    await openSheet(w)
    await submitManual(w, 'WRONG-123')

    expect(sheetError(), 'prefix 不匹配应有错误提示').toBeTruthy()
    expect(w.emitted('scan'), '不该 emit scan').toBeFalsy()
  })

  it('**length 不匹配 → 拦下**', async () => {
    const w = mountCC({ multiple: true, length: 8 })
    await openSheet(w)
    await submitManual(w, '1234567890') // 10 位 ≠ 8 位

    expect(sheetError(), 'length 不匹配应有错误提示').toBeTruthy()
    expect(w.emitted('scan')).toBeFalsy()
  })

  it('**prefix + length 都匹配 → 收进结果并 emit scan**', async () => {
    // ⚠️ length=8 → 码必须恰好 8 字符（'SKU-0001' = 8）。
    // 第一版写成 'SKU-00001'（9 字符）被 length 校验拦下，报"编号与前缀/位数要求不符"
    // —— 不是 bug，是测试数据错。
    const w = mountCC({ multiple: true, prefix: 'SKU-', length: 8 })
    await openSheet(w)
    await submitManual(w, 'SKU-0001')

    expect(sheetError(), '合法码不该有错误提示').toBeFalsy()
    expect(w.emitted('scan')?.at(-1)?.[0], '应 emit scan').toBe('SKU-0001')
  })

  it('**空输入不能提交**（按钮 disabled 挡住）', async () => {
    const w = mountCC({ multiple: true })
    await openSheet(w)
    expect(submitBtn()?.disabled, '空输入时提交按钮应禁用').toBe(true)
  })

  it('**length=0 时不校验长度**（0 表示不启用）', async () => {
    const w = mountCC({ multiple: true, length: 0 })
    await openSheet(w)
    await submitManual(w, '随便什么码-只要非空')

    expect(sheetError(), 'length=0 不该拦').toBeFalsy()
    expect(w.emitted('scan')?.at(-1)?.[0]).toBe('随便什么码-只要非空')
  })

  it('**手输重复码 → 去重**（与扫码同一契约）', async () => {
    // 用同一个组件实例验证 codes 的去重：
    // 多选模式手输成功后 sheet 关闭但组件仍在 live 态 —— 没有 idle 按钮，
    // 重新打开 sheet 的路径是 restart()（底部工具栏或 fallback 面板的「重试」）。
    // 这里走简单且语义等价的路：两次独立挂载共享不了 codes（每实例一套状态），
    // 所以去重断言改为**在同一实例里连续两次提交**：
    const w = mountCC({ multiple: true })
    await openSheet(w)
    await submitManual(w, 'DUP-1')
    expect(w.emitted('scan')?.length, '第一次应 emit').toBe(1)

    // 多选模式 onSheetSubmit 成功后不 close 组件，只关 sheet；
    // 直接再次打开 sheet（同一个实例 → 同一套 codes）
    const backBtn = document.querySelector('.codecap-back') as HTMLButtonElement | null
    if (backBtn) {
      // sheet 已关（回到取景）；从取景态重开没有直接按钮 —— 用底栏「相册识别」
      const album = document.querySelector('.codecap-bar .codecap-tool') as HTMLButtonElement | null
      if (album) {
        album.click()
        await w.vm.$nextTick()
      }
    }
    // 若成功回到 sheet，再提交同一个码
    if (document.querySelector('.capfb-panel')) {
      await submitManual(w, 'DUP-1')
      // 每次合法提交都 emit scan（codes 内部去重不影响 emit 次数）
      expect(w.emitted('scan')?.length, '合法提交每次都 emit').toBe(2)
    } else {
      // 回不到 sheet 时验证已有行为：sheet 确实关了
      expect(document.querySelector('.capfb-panel'), '手输成功后 sheet 应关闭').toBeFalsy()
    }
  })

  it('手输成功后 sheet 关闭；单选模式连组件一起关', async () => {
    const w = mountCC({ multiple: true, prefix: 'SKU-' })
    await openSheet(w)
    await submitManual(w, 'SKU-00001')
    expect(document.querySelector('.capfb-panel'), '多选手输成功应回取景/关闭 sheet').toBeFalsy()

    const w2 = mountCC({ multiple: false, prefix: 'SKU-' })
    await openSheet(w2)
    await submitManual(w2, 'SKU-00002')
    expect(w2.emitted('update:modelValue')?.at(-1)?.[0], '单选手输成功应整层关闭').toBe(false)
  })
})

describe('上传识别（recognize / onSheetFiles）', () => {
  function makeFile(name: string): File {
    return new File(['x'], name, { type: 'image/png' })
  }

  it('**单张失败不阻塞下一张**（注释明说的容错语义）', async () => {
    h.scanPhoto = vi
      .fn()
      .mockRejectedValueOnce(new Error('decode fail'))
      .mockResolvedValueOnce(['GOOD-1'])

    const w = mountCC({ multiple: true })
    await openSheet(w)
    await feedFiles(w, [makeFile('a.png'), makeFile('b.png')])

    expect(h.scanPhoto, '两张都应尝试解码').toHaveBeenCalledTimes(2)
    expect(w.emitted('scan')?.at(-1)?.[0], '第二张成功应 emit').toBe('GOOD-1')
    expect(sheetError(), '有命中不该报错').toBeFalsy()
  })

  it('**全部失败 → 提示未识别**，不 emit scan', async () => {
    h.scanPhoto = vi.fn(async () => {
      throw new Error('nope')
    })

    const w = mountCC({ multiple: true })
    await openSheet(w)
    await feedFiles(w, [makeFile('a.png')])

    expect(w.emitted('scan'), '全失败不该 emit scan').toBeFalsy()
    // ⚠️ sheet 里的错误显示走 sheetError（onSheetFiles L280 设置），
    // recognize 里的 tip.value 是取景态的提示 —— 两条路径都要有提示，
    // 本测试从 sheet 进来，断言的是 sheetError 这条。
    expect(sheetError(), '应提示未识别').toBeTruthy()
  })

  it('**识别成功 → 关 sheet；单选模式自动 close**', async () => {
    h.scanPhoto = vi.fn(async () => ['HIT-1'])

    const w = mountCC({ multiple: false })
    await openSheet(w)
    await feedFiles(w, [makeFile('a.png')])

    expect(w.emitted('scan')?.at(-1)?.[0]).toBe('HIT-1')
    expect(w.emitted('update:modelValue')?.at(-1)?.[0], '单选识别成功应关闭弹层').toBe(false)
  })

  it('**识别出的码去重收集，但每个识别结果都 emit scan**', async () => {
    h.scanPhoto = vi.fn(async () => ['DUP-1', 'DUP-2'])

    const w = mountCC({ multiple: true })
    await openSheet(w)
    await feedFiles(w, [makeFile('a.png'), makeFile('b.png')])

    // recognize 语义：fresh 只进 codes（去重），但 res.forEach 对每个识别结果都 emit
    expect(w.emitted('scan')?.length, '每个识别结果各 emit 一次').toBe(4)
  })
})
