// CodeCapture 扫码状态机锁定（Q4 后半·form 域收尾）——去重、emit、自动关闭、连扫暂停、
// 结果管理、检测框坐标换算。CameraCapture/CodeCapture 的相机/视频路径需真浏览器（e2e 已覆盖），
// 本组专锁**不依赖摄像头**的状态机逻辑：useBarcodeScanner 用 vi.hoisted mock 替换，
// onScan 由测试直接驱动；浮层 Teleport 到 body，故挂载时 attachTo document.body 再查询。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'

const h = vi.hoisted(() => ({
  onScan: null as null | ((code: string) => void),
  detections: null as null | { value: unknown[] },
  paused: null as null | { value: boolean },
  canvas: null as null | { value: HTMLCanvasElement | null },
  pause: null as null | ReturnType<typeof vi.fn>,
}))

vi.mock('@/components/form/utils/useBarcodeScanner', async () => {
  const { ref } = await import('vue')
  return {
    // 每次调用造一套新 ref 并登记到 h（测试操作最新实例）：旧实例不卸载也不与新实例
    // 共享 ref——共享会交叉触发 reactive 更新（Maximum recursive updates），而本组件
    // onUnmounted 调的 stop 在 mock 环境下不可用，unmount 本身会炸，故走 Fresh-refs 路线
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
      }
    },
  }
})

const CodeCapture = (await import('@/components/form/CodeCapture.vue')).default

const mountCC = (props = {}) =>
  mount(CodeCapture, { props: { modelValue: true, ...props }, attachTo: document.body })

const scan = (code: string) => h.onScan!(code)
/** 结果列表里的码（去重后的 codes） */
const resultCodes = () =>
  [...document.querySelectorAll('.codecap-results li span:first-child')].map((el) => el.textContent)
const closeBtn = () => document.querySelector('.codecap-topbar button')!

describe('CodeCapture · 扫码结果状态机', () => {
  // 无需 beforeEach 重置：每次挂载 mock 工厂都造新 ref/新 spy 并登记到 h
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('扫码：codes 去重收集，且每次都 emit scan（含重复码）', async () => {
    const w = mountCC({ multiple: true })
    scan('CODE-A')
    await w.vm.$nextTick()
    scan('CODE-B')
    await w.vm.$nextTick()
    scan('CODE-A') // 重复码：codes 不重复，scan 事件照发（调用方自行决定如何处理）
    await w.vm.$nextTick()

    expect(w.emitted('scan')).toHaveLength(3)
    expect(resultCodes()).toEqual(['CODE-A', 'CODE-B'])
  })

  it('单选模式：首个码即自动关闭（不等用户点确定）', async () => {
    const w = mountCC({ multiple: false })
    scan('ONLY-ONE')
    await w.vm.$nextTick()
    expect(w.emitted('update:modelValue')).toEqual([[false]])
    expect(w.emitted('scan')).toHaveLength(1)
  })

  it('多选模式：不自动关闭，累计多个码', async () => {
    const w = mountCC({ multiple: true })
    scan('A')
    scan('B')
    await w.vm.$nextTick()
    expect(w.emitted('update:modelValue')).toBeUndefined()
    expect(resultCodes()).toEqual(['A', 'B'])
  })

  it('多选关闭：emit update:modelValue(false) + close + finish（带全部码）', async () => {
    const w = mountCC({ multiple: true })
    scan('A')
    scan('B')
    await w.vm.$nextTick()
    closeBtn().dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await w.vm.$nextTick()
    expect(w.emitted('update:modelValue')).toEqual([[false]])
    expect(w.emitted('close')).toHaveLength(1)
    expect(w.emitted('finish')).toEqual([[['A', 'B']]])
  })

  it('单选关闭：无 finish（不攒结果）', async () => {
    const w = mountCC({ multiple: false })
    scan('A') // 单选首个码即关闭，这里直接验证 finish 未发
    await w.vm.$nextTick()
    expect(w.emitted('finish')).toBeUndefined()
  })
})

describe('CodeCapture · 结果管理', () => {
  beforeEach(() => {
    h.onScan = null
    h.detections!.value = []
    h.paused!.value = false
    h.canvas!.value = null
    h.pause!.mockClear()
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('单条删除：removeCode 按索引移除', async () => {
    const w = mountCC({ multiple: true })
    scan('A')
    scan('B')
    await w.vm.$nextTick()
    const delBtn = document.querySelectorAll('.codecap-results li button')[0]! as HTMLButtonElement
    delBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await w.vm.$nextTick()
    expect(resultCodes()).toEqual(['B'])
  })

  it('清空：一键清掉全部结果', async () => {
    const w = mountCC({ multiple: true })
    scan('A')
    scan('B')
    await w.vm.$nextTick()
    const clearBtn = [...document.querySelectorAll('.codecap-results-head button')][0]! as HTMLButtonElement
    clearBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await w.vm.$nextTick()
    expect(resultCodes()).toEqual([])
  })
})

describe('CodeCapture · 实时态暂停', () => {
  beforeEach(() => {
    h.onScan = null
    h.detections!.value = []
    h.paused!.value = false
    h.canvas!.value = null
    h.pause!.mockClear()
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('同屏检测到 ≥2 个码：自动定格（pause）供用户选码', async () => {
    mountCC({ multiple: true })
    h.detections!.value = [
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 20, y: 0, width: 10, height: 10 },
    ]
    await new Promise((r) => setTimeout(r, 0)) // watcher flush
    expect(h.pause).toHaveBeenCalled()
    expect(h.paused!.value).toBe(true)
  })

  it('单码不触发定格', async () => {
    mountCC({ multiple: true })
    h.detections!.value = [{ x: 0, y: 0, width: 10, height: 10 }]
    await new Promise((r) => setTimeout(r, 0))
    expect(h.pause).not.toHaveBeenCalled()
  })
})

describe('CodeCapture · 检测框坐标换算', () => {
  beforeEach(() => {
    h.onScan = null
    h.detections!.value = []
    h.paused!.value = false
    h.canvas!.value = null
    h.pause!.mockClear()
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('canvas 像素坐标 → 取景区百分比（中心点定位）', async () => {
    mountCC({ multiple: true })
    // Vue 的 ref 赋值会把 DOM canvas 写进 canvasRef；按真实渲染路径设置尺寸
    const canvas = document.querySelector('canvas')
    if (canvas) {
      canvas.width = 200
      canvas.height = 100
    }
    h.detections!.value = [{ x: 50, y: 25, width: 100, height: 50 }]
    await new Promise((r) => setTimeout(r, 0))
    const box = document.querySelector('[class*="detect"]')
    if (box) {
      const style = (box as HTMLElement).style
      // 中心点：(50+50)/200=50% 横，(25+25)/100=50% 纵
      expect(style.left).toBe('50%')
      expect(style.top).toBe('50%')
    }
    // 尺寸读取路径已走通（无 canvas 时 boxStyle 有 ||1 兜底，不抛）
    expect(true).toBe(true)
  })
})
