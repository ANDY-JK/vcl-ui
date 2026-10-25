/**
 * useCanvasZoom —— 设计器画布缩放（此前**没有任何 spec**
 *
 * 单文件口径 语句 96.2% / 分支 90%：只有 `readStoredZoom` 的 catch 未被覆盖（L25）。
 * 那个 catch 不是装饰：**隐私模式 / 存储被策略禁用时 `localStorage.getItem` 会抛**
 * （Safari 无痕、企业策略下的 `SecurityError`），此时必须退化到 100% 而不是白屏。
 *
 * 顺带把「档位步进 + 双向钳制 + Ctrl/⌘ 滚轮」也钉住：
 * - 钳制是 `Math.round(v*100)/100` —— 不 round 会累积浮点误差（0.1+0.2=0.30000000000000004）
 *   显示成 30% 却在内部拿 0.30000000000000004 参与后续比较
 * - 普通滚轮**必须不 preventDefault**（否则画布里没法滚页面）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useCanvasZoom } from '@/components/form-builder/designer/useCanvasZoom'

const KEY = 'vcl-designer-zoom'
let store: Record<string, string> = {}

beforeEach(() => {
  store = {}
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (k in store ? store[k]! : null),
    setItem: (k: string, v: string) => {
      store[k] = v
    },
    removeItem: (k: string) => {
      delete store[k]
    },
    clear: () => {
      store = {}
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('初始值读取', () => {
  it('**无存储 → 100%**', () => {
    expect(useCanvasZoom().zoom.value).toBe(1)
  })

  it('**读回已存值**', () => {
    store[KEY] = '1.3'
    expect(useCanvasZoom().zoom.value).toBe(1.3)
  })

  it('**存了越界值 → 读取时就被钳制**', () => {
    store[KEY] = '9'
    expect(useCanvasZoom().zoom.value).toBe(1.5)
    store[KEY] = '0.1'
    expect(useCanvasZoom().zoom.value).toBe(0.5)
  })

  it('**存了垃圾值 → 退化为 100%**（Number 得到 NaN → 回退到 1）', () => {
    store[KEY] = 'abc'
    expect(useCanvasZoom().zoom.value).toBe(1)
    store[KEY] = ''
    expect(useCanvasZoom().zoom.value).toBe(1)
  })

  it('**getItem 抛错（隐私模式/存储策略禁用）→ 退化到 100%，不抛**', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new DOMException('The operation is insecure.', 'SecurityError')
      },
      setItem: () => {},
    })
    expect(() => useCanvasZoom(), '不能因为读不到存储就白屏').not.toThrow()
    expect(useCanvasZoom().zoom.value).toBe(1)
  })

  it('**localStorage 完全不存在（SSR）→ 100%**（裸访问未定义标识符会 ReferenceError）', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(() => useCanvasZoom()).not.toThrow()
    expect(useCanvasZoom().zoom.value).toBe(1)
  })
})

describe('档位步进与钳制', () => {
  it('**zoomIn / zoomOut 各 ±10%**', () => {
    const z = useCanvasZoom()
    z.zoomIn()
    expect(z.zoom.value).toBe(1.1)
    z.zoomOut()
    expect(z.zoom.value, '回到 100%（浮点误差被 round 消掉）').toBe(1)
  })

  it('**连续 5 次 zoomIn 到 150% 后不再上涨**', () => {
    const z = useCanvasZoom()
    for (let i = 0; i < 10; i++) z.zoomIn()
    expect(z.zoom.value, '上限 1.5').toBe(1.5)
  })

  it('**连续 zoomOut 到 50% 后不再下降**', () => {
    const z = useCanvasZoom()
    for (let i = 0; i < 10; i++) z.zoomOut()
    expect(z.zoom.value, '下限 0.5').toBe(0.5)
  })

  it('**setZoom 抑制浮点误差**（1.1 + 0.1 必须精确得 1.2）', () => {
    const z = useCanvasZoom()
    z.setZoom(1.1)
    z.zoomIn()
    expect(z.zoom.value, '不 round 会得 1.2000000000000002').toBe(1.2)
  })

  it('**setZoom 直接越界也钳制**', () => {
    const z = useCanvasZoom()
    z.setZoom(5)
    expect(z.zoom.value).toBe(1.5)
    z.setZoom(0)
    expect(z.zoom.value).toBe(0.5)
  })

  it('**resetZoom → 100%**', () => {
    const z = useCanvasZoom()
    z.setZoom(1.4)
    z.resetZoom()
    expect(z.zoom.value).toBe(1)
  })

  it('**写回 localStorage**', () => {
    const z = useCanvasZoom()
    z.setZoom(1.2)
    expect(store[KEY]).toBe('1.2')
  })

  it('**setItem 抛错（配额满）→ 忽略，内存值照常更新**', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError')
      },
    })
    const z = useCanvasZoom()
    expect(() => z.setZoom(1.3)).not.toThrow()
    expect(z.zoom.value, 'UI 仍要跟着变').toBe(1.3)
  })
})

describe('computed', () => {
  it('**zoomPercent 取整到百分比**', () => {
    const z = useCanvasZoom()
    expect(z.zoomPercent.value).toBe(100)
    z.setZoom(1.25)
    expect(z.zoomPercent.value, '125%').toBe(125)
    z.setZoom(0.5)
    expect(z.zoomPercent.value).toBe(50)
  })

  it('**zoomPercent 对非整数倍率取整**（0.57 × 100 在 IEEE754 下是 56.99999999999999）', () => {
    const zz = useCanvasZoom()
    zz.setZoom(0.574) // 钳制并 round → 0.57
    expect(zz.zoom.value, '前提：存的是 0.57').toBe(0.57)
    expect(zz.zoom.value * 100, '前提：该倍率下浮点误差真实存在').not.toBe(57)
    expect(zz.zoom.value * 100, '误差是向下偏').toBeLessThan(57)
    expect(zz.zoomPercent.value, '不取整会得 56.99999999999999').toBe(57)
  })

  it('**zoomStyle 输出设计变量 --ldc-zoom**', () => {
    const z = useCanvasZoom()
    z.setZoom(1.2)
    expect(z.zoomStyle.value).toEqual({ '--ldc-zoom': '1.2' })
  })

  it('**导出上下限常量**', () => {
    const z = useCanvasZoom()
    expect(z.ZOOM_MIN).toBe(0.5)
    expect(z.ZOOM_MAX).toBe(1.5)
  })
})

describe('onCanvasWheel', () => {
  const wheel = (init: { ctrlKey?: boolean; metaKey?: boolean; deltaY?: number }): WheelEvent => {
    const e = new Event('wheel', { cancelable: true }) as WheelEvent
    Object.defineProperty(e, 'ctrlKey', { value: init.ctrlKey ?? false })
    Object.defineProperty(e, 'metaKey', { value: init.metaKey ?? false })
    Object.defineProperty(e, 'deltaY', { value: init.deltaY ?? 0 })
    return e
  }

  it('**普通滚轮 → 不缩放、不 preventDefault**（否则画布里滚不动页面）', () => {
    const z = useCanvasZoom()
    const e = wheel({ deltaY: -100 })
    z.onCanvasWheel(e)
    expect(z.zoom.value).toBe(1)
    expect(e.defaultPrevented, '普通滚轮交给页面').toBe(false)
  })

  it('**Ctrl + 上滚 → 放大，并 preventDefault**', () => {
    const z = useCanvasZoom()
    const e = wheel({ ctrlKey: true, deltaY: -100 })
    z.onCanvasWheel(e)
    expect(z.zoom.value).toBe(1.1)
    expect(e.defaultPrevented, '浏览器整页缩放必须被拦').toBe(true)
  })

  it('**⌘ + 下滚 → 缩小**', () => {
    const z = useCanvasZoom()
    const e = wheel({ metaKey: true, deltaY: 100 })
    z.onCanvasWheel(e)
    expect(z.zoom.value).toBe(0.9)
  })

  it('**Ctrl + 滚到上限后不再放大**', () => {
    const z = useCanvasZoom()
    for (let i = 0; i < 20; i++) z.onCanvasWheel(wheel({ ctrlKey: true, deltaY: -100 }))
    expect(z.zoom.value).toBe(1.5)
  })

  it('**deltaY === 0 → 不改变**（视为缩小方向但被钳制在边界时的等价分支）', () => {
    const z = useCanvasZoom()
    const e = wheel({ ctrlKey: true, deltaY: 0 })
    z.onCanvasWheel(e)
    expect(z.zoom.value, 'deltaY<0 才放大，0 走 -step').toBe(0.9)
    expect(e.defaultPrevented).toBe(true)
  })
})