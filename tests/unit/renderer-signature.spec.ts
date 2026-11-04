/**
 * RendererSignature — 电子签字字段（canvas 手写签名）
 *
 * ## 为什么补（151 行，语句 17.4% / 分支 7.7% / 函数 25%）
 *
 * 既有 `form-renderer-wiring.spec.ts` 只测了「把子组件的 emit 往上传」这一条线
 * （`findComponent(...).vm.$emit(...)`）——**签字绘制逻辑本身 6 个函数全未覆盖**。
 * 这个组件是低代码表单里唯一需要 canvas 手写交互的字段，失败模式都在这里：
 *
 * ① **坐标换算**（`signaturePoint`）—— canvas 有 `width/height` 属性尺寸（400×120）
 *    与 CSS 显示尺寸（`100%` × `120px * scale`），二者不一致时必须按 `rect` 缩放，
 *    否则高分辨率屏/缩放下笔迹整体偏移。
 * ② **指针捕获**（`startSignature`）—— 笔迹滑出画布若不 `setPointerCapture`，
 *    后续 `pointermove` 不再派发，线断在边界；老内核不支持时要能退化（try/catch）。
 * ③ **绘制结束即回写 dataURL**（`endSignature`）—— 保证提交时签名字段有值；
 *    未在绘制中时**不得**回写（否则 tab 切换/挂载时会白写一张空图覆盖原签名）。
 * ④ **回显**（`loadSignatureImage`）—— 只接受 `data:` 开头的字符串。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import RendererSignature from '@/components/form-builder/renderer/RendererSignature.vue'
import type { FormField } from '@/components/form-builder/types'

/* ═══════════ 假 canvas 2D 上下文（记录所有调用） ═══════════ */

interface FakeCtx {
  [k: string]: unknown
}

function makeFakeCtx(): FakeCtx & Record<string, ReturnType<typeof vi.fn>> {
  const noop = () =>
    new Proxy(
      {},
      {
        get: () => undefined,
        set: () => true,
      },
    ) as never
  const store: Record<string, unknown> = {}
  return new Proxy(store, {
    get(t, k) {
      if (typeof k === 'symbol') return undefined
      // getImageData 必须有真实形状：TD-81 的像素级空白检测会读 `.data[i]`，
      // 通用 Proxy 会返回 undefined 让组件抛错（把所有"回写"用例一起打红）。
      // 默认 al=255（有墨迹），透明画布由 makeFakeCtx(false) 模拟。
      if (k === 'getImageData') {
        if (!(k in t)) {
          t[k] = vi.fn(() => {
            const n = 400 * 120 * 4
            const data = new Uint8ClampedArray(n)
            if (_fakeInk) for (let i = 0; i < n; i += 4) data[i + 3] = 255
            return { data, width: 400, height: 120 }
          })
        }
        return t[k]
      }
      if (!(k in t)) t[k as string] = vi.fn(noop)
      return t[k as string]
    },
    set(t, k, v) {
      t[k as string] = v
      return true
    },
  }) as never
}

/** 假画布是否"有墨迹"（TD-81 像素检测的输入） */
let _fakeInk = true

let ctx: ReturnType<typeof makeFakeCtx>
const origGetContext = HTMLCanvasElement.prototype.getContext
const origToDataURL = HTMLCanvasElement.prototype.toDataURL
const origGetBCR = HTMLCanvasElement.prototype.getBoundingClientRect

const PNG_URL = 'data:image/png;base64,SAVED'
const RECT = { left: 10, top: 20, width: 200, height: 60 }

function field(over: Partial<FormField> = {}): FormField {
  return { key: 'sig', label: '签名', type: 'signature', ...over } as FormField
}

function mountSig(modelValue: unknown = '') {
  return mount(RendererSignature, {
    props: { field: field(), modelValue },
    attachTo: document.body,
  })
}

const canvasOf = (w: ReturnType<typeof mountSig>) => w.find('canvas').element as HTMLCanvasElement

/** 构造指针事件替身（happy-dom 无完整 PointerEvent） */
function ptr(x: number, y: number, pointerId = 1) {
  return { clientX: x, clientY: y, pointerId }
}

beforeEach(() => {
  ctx = makeFakeCtx()
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as never
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => PNG_URL) as never
  HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn(() => RECT as DOMRect) as never
})

afterEach(() => {
  HTMLCanvasElement.prototype.getContext = origGetContext
  HTMLCanvasElement.prototype.toDataURL = origToDataURL
  HTMLCanvasElement.prototype.getBoundingClientRect = origGetBCR
  document.body.innerHTML = ''
  _fakeInk = true
  vi.restoreAllMocks()
})

/* ═══════════ 模板结构 ═══════════ */

describe('模板结构', () => {
  it('**canvas 属性尺寸 400×120**（与 CSS 显示尺寸解耦）', () => {
    const w = mountSig()
    const c = canvasOf(w)
    expect(c.getAttribute('width')).toBe('400')
    expect(c.getAttribute('height')).toBe('120')
  })

  it('**清除按钮文案走 i18n**（formBuilder.clear）', () => {
    const w = mountSig()
    const btn = w.find('.fb-signature-clear')
    expect(btn.exists()).toBe(true)
    expect(btn.text().length, '有文案').toBeGreaterThan(0)
    expect(btn.attributes('type'), '不进表单默认提交').toBe('button')
  })
})

/* ═══════════ signaturePoint 坐标换算 ═══════════ */

describe('signaturePoint 坐标换算（CSS 尺寸 → canvas 内部像素）', () => {
  it('**按 rect 缩放**（显示 200×60 → 内部 400×120，即 ×2）', async () => {
    const w = mountSig()
    // 显示区原点在 (10,20)，客户端点 (110,50) → 区内 (100,30) → ×2 → (200,60)
    await w.find('canvas').trigger('pointerdown', ptr(110, 50))
    expect(ctx.moveTo, '换算后应到 (200,60)').toHaveBeenCalledWith(200, 60)
  })

  it('**非等比缩放分别作用在 x/y 上**（宽 200 高 40 → sx=2、sy=3）', async () => {
    HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn(
      () => ({ left: 0, top: 0, width: 200, height: 40 }) as DOMRect,
    ) as never
    const w = mountSig()
    await w.find('canvas').trigger('pointerdown', ptr(50, 10))
    expect(ctx.moveTo).toHaveBeenCalledWith(100, 30) // x: 50×2, y: 10×3
  })

  it('**原点偏移被扣除**（点击点在显示区内相对坐标）', async () => {
    HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn(
      () => ({ left: 100, top: 200, width: 400, height: 120 }) as DOMRect,
    ) as never
    const w = mountSig()
    await w.find('canvas').trigger('pointerdown', ptr(150, 230))
    // 区内 (50, 30)，缩放 1 → 原样
    expect(ctx.moveTo).toHaveBeenCalledWith(50, 30)
  })
})

/* ═══════════ startSignature ═══════════ */

describe('startSignature 起笔', () => {
  it('**设笔触样式**（深色 / 2px / 圆头）', async () => {
    const w = mountSig()
    await w.find('canvas').trigger('pointerdown', ptr(10, 20))
    expect(ctx.strokeStyle).toBe('#1e293b')
    expect(ctx.lineWidth).toBe(2)
    expect(ctx.lineCap).toBe('round')
  })

  it('**beginPath + moveTo 到起点**', async () => {
    const w = mountSig()
    await w.find('canvas').trigger('pointerdown', ptr(10, 20))
    expect(ctx.beginPath).toHaveBeenCalledTimes(1)
    expect(ctx.moveTo).toHaveBeenCalledTimes(1)
  })

  it('**调用 setPointerCapture**（笔迹滑出画布不丢笔）', async () => {
    const w = mountSig()
    const c = canvasOf(w)
    const spy = vi.fn()
    Object.defineProperty(c, 'setPointerCapture', { value: spy, configurable: true })
    await w.find('canvas').trigger('pointerdown', ptr(10, 20, 7))
    expect(spy).toHaveBeenCalledWith(7)
  })

  it('**setPointerCapture 抛错时降级不崩**（老内核不支持）', async () => {
    const w = mountSig()
    const c = canvasOf(w)
    Object.defineProperty(c, 'setPointerCapture', {
      value: () => {
        throw new Error('not supported')
      },
      configurable: true,
    })
    await w.find('canvas').trigger('pointerdown', ptr(10, 20))
    // 仍然完成起笔
    expect(ctx.moveTo).toHaveBeenCalled()
    expect(w.emitted('update:modelValue'), '起笔不回写').toBeUndefined()
  })

  it('**getContext 为 null 时安全返回**（不崩、不画）', async () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never
    const w = mountSig()
    await w.find('canvas').trigger('pointerdown', ptr(10, 20))
    expect(w.find('canvas').exists()).toBe(true)
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })
})

/* ═══════════ drawSignature ═══════════ */

describe('drawSignature 运笔', () => {
  it('**未起笔时 pointermove 不画**（signatureDrawing 门禁）', async () => {
    const w = mountSig()
    await w.find('canvas').trigger('pointermove', ptr(30, 40))
    expect(ctx.lineTo).not.toHaveBeenCalled()
    expect(ctx.stroke).not.toHaveBeenCalled()
  })

  it('**起笔后 lineTo + stroke**', async () => {
    const w = mountSig()
    await w.find('canvas').trigger('pointerdown', ptr(10, 20))
    await w.find('canvas').trigger('pointermove', ptr(30, 40))
    expect(ctx.lineTo).toHaveBeenCalledTimes(1)
    // 区内 (20,20) × 2 → (40,40)
    expect(ctx.lineTo).toHaveBeenCalledWith(40, 40)
    expect(ctx.stroke).toHaveBeenCalledTimes(1)
  })

  it('**多次 move 逐点连线**', async () => {
    const w = mountSig()
    await w.find('canvas').trigger('pointerdown', ptr(10, 20))
    await w.find('canvas').trigger('pointermove', ptr(20, 20))
    await w.find('canvas').trigger('pointermove', ptr(30, 20))
    await w.find('canvas').trigger('pointermove', ptr(40, 20))
    expect(ctx.lineTo).toHaveBeenCalledTimes(3)
    expect(ctx.stroke).toHaveBeenCalledTimes(3)
  })

  it('**getContext 为 null 时安全返回**', async () => {
    const w = mountSig()
    await w.find('canvas').trigger('pointerdown', ptr(10, 20))
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never
    await w.find('canvas').trigger('pointermove', ptr(30, 40))
    expect(w.find('canvas').exists()).toBe(true)
  })
})

/* ═══════════ endSignature ═══════════ */

describe('endSignature 收笔与回写', () => {
  it('**收笔回写 dataURL**（update:modelValue）', async () => {
    const w = mountSig()
    await w.find('canvas').trigger('pointerdown', ptr(10, 20))
    await w.find('canvas').trigger('pointermove', ptr(60, 40))
    await w.find('canvas').trigger('pointerup')
    expect(w.emitted('update:modelValue')).toBeTruthy()
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual([PNG_URL])
  })

  it('**未起笔时 pointerup 不回写**（避免空图覆盖原签名）', async () => {
    const w = mountSig('data:image/png;base64,OLD')
    await w.find('canvas').trigger('pointerup')
    expect(w.emitted('update:modelValue'), '不该白写').toBeUndefined()
  })

  it('**起笔但未运笔（单击/手抖单点）不回写空白图**（第 183 轮）', async () => {
    // 单击只走 moveTo、从不 stroke：画布上没有任何墨迹。
    // 此前 endSignature 无条件 toDataURL，于是"点一下"就让 required 字段变成已签名，
    // 提交上来的是一张全透明 PNG —— 与同文件「避免空图覆盖原签名」的意图相悖。
    const w = mountSig()
    await w.find('canvas').trigger('pointerdown', ptr(10, 20))
    await w.find('canvas').trigger('pointerup')
    expect(w.emitted('update:modelValue'), '没有笔迹就不该写值').toBeUndefined()
  })

  it('**起笔但未运笔后 pointerleave 同样不回写**', async () => {
    const w = mountSig()
    await w.find('canvas').trigger('pointerdown', ptr(10, 20))
    await w.find('canvas').trigger('pointerleave')
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })

  it('**pointerleave 也收笔并回写**（滑出边界结束一笔）', async () => {
    const w = mountSig()
    await w.find('canvas').trigger('pointerdown', ptr(10, 20))
    await w.find('canvas').trigger('pointermove', ptr(60, 40))
    await w.find('canvas').trigger('pointerleave')
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual([PNG_URL])
  })

  it('**收笔后再次 move 不画**（drawing 状态已复位）', async () => {
    const w = mountSig()
    await w.find('canvas').trigger('pointerdown', ptr(10, 20))
    await w.find('canvas').trigger('pointerup')
    const before = (ctx.lineTo as ReturnType<typeof vi.fn>).mock.calls.length
    await w.find('canvas').trigger('pointermove', ptr(50, 50))
    expect((ctx.lineTo as ReturnType<typeof vi.fn>).mock.calls.length, '不再连线').toBe(before)
  })

  it('**连续两笔各自回写一次**', async () => {
    const w = mountSig()
    await w.find('canvas').trigger('pointerdown', ptr(10, 20))
    await w.find('canvas').trigger('pointermove', ptr(40, 30))
    await w.find('canvas').trigger('pointerup')
    await w.find('canvas').trigger('pointerdown', ptr(30, 20))
    await w.find('canvas').trigger('pointermove', ptr(60, 40))
    await w.find('canvas').trigger('pointerup')
    expect(w.emitted('update:modelValue')).toHaveLength(2)
  })

  /* ── TD-81：像素级空白判定 ────────────────────────────────────
   * hasStroke 只证明"调过 stroke"：压感笔 alpha≈0、半透明笔刷会把
   * toDataURL 写成一张**全透明 PNG** —— 字段值非空、required 通过，提交上来却是空白签名。
   * 收笔时按 alpha 通道兜底：全透明即视为空白（与"单击不回写"同语义）。*/
  it('**画布全透明时不回写**（压感笔 alpha≈0 的"看不见的一笔"不算签名）', async () => {
    _fakeInk = false // 笔迹存在但像素全透明
    const w = mountSig()
    await w.find('canvas').trigger('pointerdown', ptr(10, 20))
    await w.find('canvas').trigger('pointermove', ptr(60, 40))
    await w.find('canvas').trigger('pointerup')
    expect(w.emitted('update:modelValue'), '全透明画布不该写成有效签名').toBeUndefined()
  })

  it('**像素检测只跑一次 getImageData**（性能约束：每笔收尾一次）', async () => {
    const w = mountSig()
    await w.find('canvas').trigger('pointerdown', ptr(10, 20))
    await w.find('canvas').trigger('pointermove', ptr(60, 40))
    await w.find('canvas').trigger('pointerup')
    expect(ctx.getImageData).toHaveBeenCalledTimes(1)
  })

  it('**有墨迹照旧回写**（反向保护：兜底不能把正常签名一起拦掉）', async () => {
    _fakeInk = true
    const w = mountSig()
    await w.find('canvas').trigger('pointerdown', ptr(10, 20))
    await w.find('canvas').trigger('pointermove', ptr(60, 40))
    await w.find('canvas').trigger('pointerup')
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual([PNG_URL])
  })

  it('**未运笔时连 getImageData 都不调**（hasStroke 快速路径前置，省 192KB 扫描）', async () => {
    const w = mountSig()
    await w.find('canvas').trigger('pointerdown', ptr(10, 20))
    await w.find('canvas').trigger('pointerup')
    expect(ctx.getImageData, '没 stroke 过就不必扫像素').not.toHaveBeenCalled()
  })

  it('**toDataURL 以 image/png 请求**', async () => {
    const w = mountSig()
    await w.find('canvas').trigger('pointerdown', ptr(10, 20))
    await w.find('canvas').trigger('pointermove', ptr(40, 30))
    await w.find('canvas').trigger('pointerup')
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledWith('image/png')
  })
})

/* ═══════════ clearSignature ═══════════ */

describe('clearSignature 清除', () => {
  it('**清空整块画布并回写空串**', async () => {
    // ⚠️ 模型值必须为空：若传 dataURL 会触发 loadSignatureImage → onload 也调 clearRect，
    // 那样「清除不清画布」的变异体仍能靠回显路径的调用蒙混过关（首版即踩此坑）。
    const w = mountSig('')
    await w.find('.fb-signature-clear').trigger('click')
    expect(ctx.clearRect, '恰好调用一次（只来自 clearSignature）').toHaveBeenCalledTimes(1)
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 400, 120)
    expect(w.emitted('update:modelValue')!.at(-1), '回写空串').toEqual([''])
  })

  it('**清除时绘画中状态不影响**（按钮可在任意时刻点）', async () => {
    const w = mountSig()
    await w.find('canvas').trigger('pointerdown', ptr(10, 20))
    await w.find('.fb-signature-clear').trigger('click')
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual([''])
  })

  it('**绘画中途清除 → 随后收笔不再回写空白图**（否则覆盖刚清空的值）', async () => {
    // down → move（有墨迹）→ 点清除（画布清空、值写 ''）→ up：
    // 若清除不复位"本笔已有墨迹"的标记，收笔会把空画布 toDataURL 再写一遍，
    // 把刚清空的值覆盖成一张全透明 PNG。
    const w = mountSig()
    await w.find('canvas').trigger('pointerdown', ptr(10, 20))
    await w.find('canvas').trigger('pointermove', ptr(40, 30))
    await w.find('.fb-signature-clear').trigger('click')
    await w.find('canvas').trigger('pointerup')
    expect(w.emitted('update:modelValue'), '只应回写一次（清除那次）').toHaveLength(1)
    expect(w.emitted('update:modelValue')!.at(-1)).toEqual([''])
  })

  it('**getContext 为 null 时不回写不崩**', async () => {
    const w = mountSig()
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never
    await w.find('.fb-signature-clear').trigger('click')
    expect(w.emitted('update:modelValue'), '拿不到 ctx 就不宣称清空了').toBeUndefined()
  })
})

/* ═══════════ loadSignatureImage 回显 ═══════════ */

describe('loadSignatureImage 回显', () => {
  let created: { src: string; onload: (() => void) | null }[]

  beforeEach(() => {
    created = []
    class FakeImage {
      onload: (() => void) | null = null
      src = ''
      constructor() {
        created.push(this as never)
      }
    }
    vi.stubGlobal('Image', FakeImage)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('**挂载时 modelValue 是 dataURL → 建 Image 并画到 canvas**', async () => {
    const w = mountSig('data:image/png;base64,OLD')
    await nextTick()
    expect(created, '建了一个 Image').toHaveLength(1)
    expect(created[0]!.src).toBe('data:image/png;base64,OLD')

    // 触发 onload → clearRect + drawImage
    created[0]!.onload!()
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 400, 120)
    expect(ctx.drawImage).toHaveBeenCalledWith(created[0], 0, 0, 400, 120)
    expect(w.emitted('update:modelValue'), '回显不回写').toBeUndefined()
  })

  it('**modelValue 为空串 → 不建 Image**', async () => {
    mountSig('')
    await nextTick()
    expect(created).toHaveLength(0)
  })

  it('**非 data: 开头的字符串 → 不建 Image**（普通 URL 不当作签名）', async () => {
    mountSig('https://cdn.example.com/a.png')
    await nextTick()
    expect(created).toHaveLength(0)
  })

  it('**非字符串（数字/对象/null）→ 不建 Image**', async () => {
    for (const v of [123, { a: 1 }, null, undefined]) {
      created = []
      const w = mountSig(v)
      await nextTick()
      expect(created, '值 ' + JSON.stringify(v) + ' 不该建 Image').toHaveLength(0)
      w.unmount()
    }
  })

  it('**getContext 为 null 时不建 Image**（先取 ctx 再建图）', async () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never
    mountSig('data:image/png;base64,OLD')
    await nextTick()
    expect(created, '拿不到 ctx 就不建图').toHaveLength(0)
  })
})

/* ═══════════ 单测盲区：canvas 引用缺失的 5 条守卫 ═══════════ */

describe('单测盲区声明（canvas ref 缺失的守卫不可达）', () => {
  it('**机制说明：组件未 defineExpose，无法在单测里清空 canvas ref**', () => {
    // 未覆盖的 5 行（L36/L56/L74/L86 的 `if (!canvas)` 与 L69 的 `if (canvas)` false 分支）
    // 都要求在「事件处理器被调用时 signatureCanvasRef.value 为 null」。
    // 单测里做不到的原因是：
    //   · canvas 在模板里**始终渲染**（无 v-if），挂载后 ref 必然有值；
    //   · 组件没有 defineExpose，外部拿不到 ref 也清不掉；
    //   · 卸载后 wrapper 不再派发事件（VTU 卸载会销毁组件实例）。
    // 因此这些守卫是**防御性死代码**（真实运行中只在极端时序下才可能命中），
    // 本 spec 不为它们编造用例 —— 如实记为单测盲区。
    // 下面这条断言把「模板里 canvas 无条件渲染」钉死，避免后人误以为是条件渲染。
    const w = mountSig()
    expect(w.find('canvas').exists(), 'canvas 无条件渲染').toBe(true)
    expect(w.element.querySelectorAll('canvas')).toHaveLength(1)
    // ⚠️ 实测纠正：`<script setup>` 的内部绑定在 VTU 下**能经 vm 取到**
    // （vm.endSignature 是函数，不是 undefined）——但它取到的是同一个闭包，
    // 闭包里读的是模块级 `signatureCanvasRef`，而该 ref 在单测里**无法被清空**
    // （canvas 无条件渲染、无 defineExpose 暴露 ref 本身）。所以能调到函数，
    // 却造不出「函数被调用时 ref 为 null」的时序 —— 这才是真正的盲区原因。
    const vm = w.vm as unknown as Record<string, unknown>
    expect(typeof vm.endSignature, 'vm 上能取到内部函数（但清不了 ref）').toBe('function')
    expect(typeof vm.clearSignature).toBe('function')
    expect(typeof vm.startSignature).toBe('function')
    // 实测进一步纠正：vm.signatureCanvasRef **返回的是已解包的 DOM 元素**
    // （VTU 对 <script setup> 的 ref 自动 unref），不是 Ref 对象 ——
    // 所以也没法经 api 把它 set 成 null（它是个 HTMLCanvasElement）。
    expect(vm.signatureCanvasRef, '取到的是解包后的 canvas 元素').toBeInstanceOf(HTMLCanvasElement)
  })

  it('**经 vm 直接调用 endSignature：未起笔时不回写**（L65 守卫 true 分支）', async () => {
    const w = mountSig()
    const vm = w.vm as unknown as { endSignature: () => void }
    vm.endSignature()
    expect(w.emitted('update:modelValue'), '未起笔 → 直接返回').toBeUndefined()
  })

  it('**已覆盖的对照面：能拿到 ctx 时的全部路径都已测到**', async () => {
    // 上一条说明了「拿不到 canvas」测不到；这条反过来证明「拿得到 canvas 但
    // 拿不到 ctx」的路径**全部已覆盖**（getContext 返回 null 三种场景）：
    //   · startSignature：L43-44（起笔）
    //   · drawSignature：L57-58（运笔）
    //   · clearSignature：L75-76（清除）
    //   · loadSignatureImage：L87-88（回显）
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never
    const w = mountSig('data:image/png;base64,X')
    const c = w.find('canvas')
    await c.trigger('pointerdown', ptr(10, 20))
    await c.trigger('pointermove', ptr(20, 20))
    await w.find('.fb-signature-clear').trigger('click')
    // 三个入口都不崩、都不回写（拿不到 ctx 就不宣称改动了画布）
    expect(w.find('canvas').exists()).toBe(true)
    expect(w.emitted('update:modelValue')).toBeUndefined()
  })
})

/* ═══════════ 完整交互链路 ═══════════ */

describe('完整交互链路', () => {
  it('**起笔 → 运笔 → 收笔 → 清除，四段串起来**', async () => {
    const w = mountSig('')
    const c = w.find('canvas')
    await c.trigger('pointerdown', ptr(10, 20))
    await c.trigger('pointermove', ptr(30, 30))
    await c.trigger('pointerup')
    expect(w.emitted('update:modelValue')).toHaveLength(1)
    expect(w.emitted('update:modelValue')![0]).toEqual([PNG_URL])

    await w.find('.fb-signature-clear').trigger('click')
    expect(w.emitted('update:modelValue')).toHaveLength(2)
    expect(w.emitted('update:modelValue')![1]).toEqual([''])
  })
})